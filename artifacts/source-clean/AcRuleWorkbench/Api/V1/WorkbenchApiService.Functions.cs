using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text.RegularExpressions;
using System.Text;
using Newtonsoft.Json;
using AcRuleWorkbench.Api;
using AcRuleWorkbench.Api.V1.Contracts;
using AcRuleWorkbench.Core;

namespace AcRuleWorkbench.Api.V1;

internal sealed partial class WorkbenchApiService
{
    private object BuildFwdFunctions(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? q = Get(request, "q");
        bool includeUnobserved = GetBool(request, "includeUnobserved", true);

        var items = BuildFunctionCatalogItems(snapshot, includeUnobserved, includeUsage: false)
            .Where(f => string.IsNullOrWhiteSpace(q)
                || RuleCorrelation.Contains(f.Name, q)
                || RuleCorrelation.Contains(f.Category, q)
                || RuleCorrelation.Contains(f.Description, q)
                || f.StatusResults.Any(s => RuleCorrelation.Contains(s, q))
                || f.ParameterSchema.Any(p => RuleCorrelation.Contains(p.Role, q) || RuleCorrelation.Contains(p.DisplayName, q) || RuleCorrelation.Contains(p.TargetType, q) || RuleCorrelation.Contains(p.RelationshipKind, q))
                || f.ObservedParameterNames.Any(p => RuleCorrelation.Contains(p, q))
                || f.BehaviorFlags.Any(b => RuleCorrelation.Contains(b, q)))
            .OrderBy(f => f.Category, StringComparer.OrdinalIgnoreCase)
            .ThenByDescending(f => f.ObservedRuleCount)
            .ThenBy(f => f.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new
        {
            count = items.Count,
            catalogDefinitionCount = AcFunctionCatalog.GetDefinitions().Count,
            observedFunctionCount = items.Count(i => i.Observed),
            unknownObservedFunctionCount = items.Count(i => i.Observed && !i.Defined),
            items,
            categories = items
                .GroupBy(i => i.Category ?? "Unknown", StringComparer.OrdinalIgnoreCase)
                .OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
                .Select(g => new { name = g.Key, count = g.Count(), observed = g.Count(i => i.Observed) })
                .ToList(),
            caveat = "Catalog metadata is curated static knowledge. Configured ActionNames on observed rules are the authoritative status-result/action-list evidence for this FWD snapshot.",
            links = new
            {
                self = "/api/v1/fwd/functions",
                udfs = "/api/v1/fwd/udfs",
                tables = "/api/v1/fwd/tables"
            }
        };
    }

private object BuildFwdFunctionDetail(WorkbenchSnapshot snapshot, HttpListenerRequest request, string functionName)
    {
        string name = (functionName ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(name))
            return new { name, found = false, warnings = new[] { "Function name is required." } };

        FunctionCatalogItemVm? item = BuildFunctionCatalogItems(snapshot, includeUnobserved: true, includeUsage: true)
            .FirstOrDefault(f => RuleCorrelation.Eq(f.Name, name));

        if (item == null)
        {
            return new
            {
                name,
                found = false,
                category = AcFunctionCatalog.InferCategory(name),
                warnings = new[] { "Function was not found in the curated catalog, FWD function resources, structural rules, flat inventory, or relationships." },
                caveat = "Absence from static inspection does not prove the function is unavailable at native runtime."
            };
        }

        return new
        {
            name = item.Name,
            found = true,
            function = item,
            interfaceModel = new
            {
                statusResults = item.StatusResults,
                configuredStatusResults = item.ConfiguredStatusResults,
                parameterRoles = item.ParameterRoles,
                parameterSchema = item.ParameterSchema,
                observedParameterNames = item.ObservedParameterNames,
                unknownObservedParameterNames = item.UnknownObservedParameterNames,
                statusResultCaveat = item.StatusResultCaveat
            },
            behavior = new
            {
                category = item.Category,
                flags = item.BehaviorFlags,
                schemaProfile = item.SchemaProfile,
                runtimeImpacts = item.RuntimeImpacts,
                deprecated = item.Deprecated
            },
            usage = new
            {
                ruleCount = item.ObservedRuleCount,
                structuralRuleCount = item.StructuralRuleCount,
                flatInventoryRuleCount = item.FlatInventoryRuleCount,
                relationshipCount = item.RelationshipCount,
                scopes = item.Scopes,
                rules = item.Usage
            },
            relationships = item.Relationships,
            diagnostics = item.Diagnostics,
            caveat = "This endpoint does not execute the function. It correlates catalog semantics with static FWD rule, parameter, ActionNames, and relationship evidence."
        };
    }

private static List<FunctionCatalogItemVm> BuildFunctionCatalogItems(WorkbenchSnapshot snapshot, bool includeUnobserved, bool includeUsage)
    {
        var flatByFunction = snapshot.Rules.Rules
            .Where(r => !string.IsNullOrWhiteSpace(r.FunctionName))
            .GroupBy(r => r.FunctionName!.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var structuralByFunction = snapshot.Tree.Nodes
            .Where(n => n.IsRuleNode && !string.IsNullOrWhiteSpace(n.FunctionName))
            .GroupBy(n => n.FunctionName!.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var relationshipsByFunction = snapshot.Relationships.Relationships
            .Where(r => !string.IsNullOrWhiteSpace(r.FunctionName))
            .GroupBy(r => r.FunctionName!.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var resourceTypesByName = snapshot.Fwd.Resources
            .Where(b => RuleCorrelation.Eq(b.Type, "Function") || RuleCorrelation.Eq(b.Type, "UDF") || RuleCorrelation.Eq(b.Type, "UserDefinedFunction") || RuleCorrelation.Eq(b.Type, "User Defined"))
            .SelectMany(b => b.Names.Select(n => new { Name = (n ?? string.Empty).Trim(), Type = b.Type ?? "Function" }))
            .Where(x => !string.IsNullOrWhiteSpace(x.Name))
            .GroupBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Select(x => x.Type).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToList(), StringComparer.OrdinalIgnoreCase);

        var names = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (string name in flatByFunction.Keys) names.Add(name);
        foreach (string name in structuralByFunction.Keys) names.Add(name);
        foreach (string name in relationshipsByFunction.Keys) names.Add(name);
        foreach (string name in resourceTypesByName.Keys) names.Add(name);
        if (includeUnobserved)
        {
            foreach (AcFunctionCatalog.FunctionDefinition definition in AcFunctionCatalog.GetDefinitions())
                names.Add(definition.Name);
        }

        var rows = new List<FunctionCatalogItemVm>();
        foreach (string name in names)
        {
            flatByFunction.TryGetValue(name, out List<AcRuleSummary>? flatRules);
            structuralByFunction.TryGetValue(name, out List<AcTreeNode>? structuralRules);
            relationshipsByFunction.TryGetValue(name, out List<AcRuleRelationship>? relationships);
            resourceTypesByName.TryGetValue(name, out List<string>? resourceTypes);

            flatRules ??= new List<AcRuleSummary>();
            structuralRules ??= new List<AcTreeNode>();
            relationships ??= new List<AcRuleRelationship>();
            resourceTypes ??= new List<string>();

            bool hasDefinition = AcFunctionCatalog.TryGetDefinition(name, out AcFunctionCatalog.FunctionDefinition? definition);
            bool observed = flatRules.Count > 0 || structuralRules.Count > 0 || relationships.Count > 0;
            bool isResource = resourceTypes.Count > 0;
            string category = hasDefinition
                ? definition.Category
                : isResource
                    ? "User Defined"
                    : AcFunctionCatalog.InferCategory(name);

            List<string> configuredStatusResults = DistinctOrdered(flatRules.SelectMany(r => r.ActionNames).Concat(structuralRules.SelectMany(n => n.ActionNames)));
            List<string> observedParameters = DistinctOrdered(flatRules.SelectMany(r => r.Parameters.Keys).Concat(structuralRules.SelectMany(n => n.Parameters.Keys)));
            List<string> scopes = DistinctOrdered(flatRules.Select(r => RuleCorrelation.ScopeId(r.ScopePath, r.ScopeType, r.ScopeName))
                .Concat(structuralRules.Select(n => RuleCorrelation.ScopeId(n.ScopePath, n.ScopeType, n.ScopeName)))
                .Concat(relationships.Select(r => RuleCorrelation.ScopeId(r.ScopePath, r.ScopeType, r.ScopeName))));
            List<string> statusResults = DistinctOrdered((definition?.StatusResults ?? Array.Empty<string>()).Concat(configuredStatusResults));
            List<string> behaviorFlags = hasDefinition ? DistinctOrdered(definition!.BehaviorFlags) : InferBehaviorFlags(name, observedParameters, relationships);
            List<AcFunctionCatalog.FunctionParameterSchema> parameterSchema = hasDefinition
                ? definition!.ParameterSchema.ToList()
                : AcFunctionCatalog.InferObservedParameterSchemas(name, observedParameters).ToList();
            AcFunctionCatalog.FunctionSchemaProfile schemaProfile = hasDefinition
                ? definition!.SchemaProfile
                : AcFunctionCatalog.BuildSchemaProfile(name, parameterSchema, behaviorFlags, deprecated: false);
            List<string> unknownObservedParameters = AcFunctionCatalog.FindUnknownObservedParameterNames(name, observedParameters).ToList();

            var row = new FunctionCatalogItemVm
            {
                Name = name,
                Category = category,
                Description = hasDefinition
                    ? definition.Description
                    : isResource
                        ? "Function resource/UDF candidate discovered in FWD resources. Use the UDF view for caller bindings and internal rule-list evidence."
                        : "Function observed in rule configuration. No curated metadata is available yet.",
                Source = hasDefinition && observed
                    ? "CatalogAndRuleUsage"
                    : hasDefinition
                        ? "CatalogDefinition"
                        : isResource && observed
                            ? "FunctionResourceAndRuleUsage"
                            : isResource
                                ? "FunctionResource"
                                : "RuleUsageOnly",
                Defined = hasDefinition,
                Observed = observed,
                FunctionResource = isResource,
                ResourceTypes = resourceTypes,
                Deprecated = definition?.Deprecated ?? false,
                StatusResults = statusResults,
                ConfiguredStatusResults = configuredStatusResults,
                ParameterRoles = DistinctOrdered(definition?.ParameterRoles ?? Array.Empty<string>()),
                ParameterSchema = parameterSchema,
                ObservedParameterNames = observedParameters,
                UnknownObservedParameterNames = unknownObservedParameters,
                SchemaProfile = schemaProfile,
                BehaviorFlags = behaviorFlags,
                RuntimeImpacts = hasDefinition
                    ? DistinctOrdered(definition.RuntimeImpacts)
                    : new List<string> { "Static rule usage was observed. Inspect configured status actions and parameter bindings before inferring runtime operator impact." },
                Evidence = definition?.Evidence ?? "Observed static FWD configuration",
                StatusResultCaveat = definition?.StatusResultCaveat ?? "Configured ActionNames on observed rules are the authoritative status-result/action-list evidence for this FWD snapshot.",
                ObservedRuleCount = DistinctRuleCount(flatRules, structuralRules),
                FlatInventoryRuleCount = flatRules.Count,
                StructuralRuleCount = structuralRules.Count,
                RelationshipCount = relationships.Count,
                Scopes = scopes,
                Links = new FunctionLinksVm
                {
                    Self = "/api/v1/fwd/functions/" + UrlEncode(name),
                    Search = "/api/v1/search?q=function:" + UrlEncode(name),
                    Udfs = isResource ? "/api/v1/fwd/udfs/" + UrlEncode(name) : null
                }
            };

            if (!hasDefinition) row.Diagnostics.Add("FunctionNotInCuratedCatalog");
            if (!hasDefinition) row.Diagnostics.Add("FunctionSchemaUnknown");
            if (unknownObservedParameters.Count > 0) row.Diagnostics.Add("ObservedParametersOutsideCatalogSchema");
            if (hasDefinition && !observed) row.Diagnostics.Add("CatalogOnlyNotObservedInCurrentSnapshot");
            if (isResource && !hasDefinition) row.Diagnostics.Add("FunctionResourceCandidate");
            if (row.Deprecated) row.Diagnostics.Add("DeprecatedFunction");
            if (configuredStatusResults.Count == 0 && observed) row.Diagnostics.Add("ConfiguredStatusResultsNotExtracted");

            if (includeUsage)
            {
                row.Usage.AddRange(BuildFunctionUsageRows(snapshot, name, flatRules, structuralRules));
                row.Relationships.AddRange(relationships.Take(160).Select(RelationshipPayload));
            }

            rows.Add(row);
        }

        return rows;
    }

private static List<FunctionUsageVm> BuildFunctionUsageRows(WorkbenchSnapshot snapshot, string name, List<AcRuleSummary> flatRules, List<AcTreeNode> structuralRules)
    {
        var rows = new List<FunctionUsageVm>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (AcRuleSummary rule in flatRules.OrderBy(r => RuleCorrelation.ScopeId(r.ScopePath, r.ScopeType, r.ScopeName), StringComparer.OrdinalIgnoreCase).ThenBy(r => r.RuleIndex).Take(160))
        {
            string scopeId = RuleCorrelation.ScopeId(rule.ScopePath, rule.ScopeType, rule.ScopeName);
            string key = string.Join("|", scopeId, rule.RuleGuid ?? string.Empty, rule.RuleIndex.ToString(), rule.RuleName ?? string.Empty, name);
            seen.Add(key);
            snapshot.RulesByStructuralKey.TryGetValue(RuleCorrelation.FlatKey(rule), out RuleModel? structuralMatch);
            rows.Add(new FunctionUsageVm
            {
                ScopeId = scopeId,
                ScopePath = rule.ScopePath,
                ScopeType = rule.ScopeType,
                ScopeName = rule.ScopeName,
                RuleIndex = rule.RuleIndex,
                RuleGuid = rule.RuleGuid,
                RuleId = rule.RuleId,
                RuleName = rule.RuleName,
                FunctionName = rule.FunctionName,
                NodeId = structuralMatch?.NodeId,
                EvidenceClass = structuralMatch == null ? "FlatInventory" : "FlatInventory+Structural",
                StatusResults = rule.ActionNames.ToList(),
                Parameters = rule.Parameters.ToDictionary(k => k.Key, v => v.Value.ToList(), StringComparer.OrdinalIgnoreCase)
            });
        }

        foreach (AcTreeNode node in structuralRules.OrderBy(n => RuleCorrelation.ScopeId(n.ScopePath, n.ScopeType, n.ScopeName), StringComparer.OrdinalIgnoreCase).ThenBy(n => n.RuleIndexWithinScope).Take(160))
        {
            string scopeId = RuleCorrelation.ScopeId(node.ScopePath, node.ScopeType, node.ScopeName);
            string key = string.Join("|", scopeId, node.RuleGuid ?? string.Empty, node.RuleIndexWithinScope.ToString(), node.RuleName ?? string.Empty, name);
            if (seen.Contains(key))
                continue;

            rows.Add(new FunctionUsageVm
            {
                ScopeId = scopeId,
                ScopePath = node.ScopePath,
                ScopeType = node.ScopeType,
                ScopeName = node.ScopeName,
                RuleIndex = node.RuleIndexWithinScope,
                RuleGuid = node.RuleGuid,
                RuleId = node.RuleId,
                RuleName = node.RuleName,
                FunctionName = node.FunctionName,
                NodeId = RuleCorrelation.NodeId(node),
                EvidenceClass = "Structural",
                StatusResults = node.ActionNames.ToList(),
                Parameters = node.Parameters.ToDictionary(k => k.Key, v => v.Value.ToList(), StringComparer.OrdinalIgnoreCase)
            });
        }

        return rows;
    }

private static int DistinctRuleCount(List<AcRuleSummary> flatRules, List<AcTreeNode> structuralRules)
    {
        var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (AcRuleSummary r in flatRules)
            keys.Add(string.Join("|", RuleCorrelation.ScopeId(r.ScopePath, r.ScopeType, r.ScopeName), r.RuleGuid ?? string.Empty, r.RuleIndex.ToString(), r.RuleName ?? string.Empty, r.FunctionName ?? string.Empty));
        foreach (AcTreeNode n in structuralRules)
            keys.Add(string.Join("|", RuleCorrelation.ScopeId(n.ScopePath, n.ScopeType, n.ScopeName), n.RuleGuid ?? string.Empty, n.RuleIndexWithinScope.ToString(), n.RuleName ?? string.Empty, n.FunctionName ?? string.Empty));
        return keys.Count;
    }

private static List<string> InferBehaviorFlags(string functionName, IEnumerable<string> observedParameters, IEnumerable<AcRuleRelationship> relationships)
    {
        var flags = new List<string>();
        string combined = string.Join(" ", functionName ?? string.Empty, string.Join(" ", observedParameters), string.Join(" ", relationships.Select(r => r.Kind + " " + r.TargetType + " " + r.ParameterRole)));
        if (Regex.IsMatch(combined, "reject", RegexOptions.IgnoreCase)) flags.Add("MayReject");
        if (Regex.IsMatch(combined, "table|selectionlist|lookup|fuzzy", RegexOptions.IgnoreCase)) flags.Add("UsesTable");
        if (Regex.IsMatch(combined, "attr", RegexOptions.IgnoreCase)) flags.Add("UsesAttribute");
        if (Regex.IsMatch(combined, "format|copy|delete|plug|set", RegexOptions.IgnoreCase)) flags.Add("MayWriteField");
        if (Regex.IsMatch(combined, "check|test|is|has|compare", RegexOptions.IgnoreCase)) flags.Add("BranchesRuleFlow");
        if (flags.Count == 0) flags.Add("UnknownStaticBehavior");
        return DistinctOrdered(flags);
    }

private static List<string> DistinctOrdered(IEnumerable<string> values)
    {
        return values
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Select(v => v.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(v => v, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }
}
