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
private static List<string> ExtractUdfInterfaceParameterNames(ResourceDetail? details)
    {
        var names = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void Add(string? candidate)
        {
            string value = (candidate ?? string.Empty).Trim().Trim('"', '\'', '{', '}', '[', ']');
            if (!LooksLikeUdfFieldListName(value))
                return;

            if (seen.Add(value))
                names.Add(value);
        }

        void AddSplit(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return;

            foreach (string part in Regex.Split(value, @"[,;|\r\n\t]+"))
                Add(part);
        }

        if (details == null)
            return names;

        foreach (ResourceAttrEntry attr in details.FullAttributes.Concat(details.PublicAttributes))
        {
            string key = attr.Key ?? string.Empty;
            string value = attr.Value ?? string.Empty;

            if (IsLikelyUdfParameterNameListKey(key))
                AddSplit(value);

            if (IsLikelyIndexedUdfParameterNameKey(key))
                Add(value);

            // Some FW resource exports store the interface name as the attribute key and the type/cardinality
            // as the value. Keep this cautious so normal config attributes such as Source/Path/Version do not
            // get promoted into field-list parameters.
            if (IsLikelyUdfFieldListAttribute(key, value))
                Add(key);
        }

        if (details.PrivateTree != null)
            ExtractUdfNamesFromPrivateTree(details.PrivateTree, inFieldListRegion: false, Add, AddSplit);

        return names;
    }

private static void ExtractUdfNamesFromPrivateTree(ResourcePrivateNode node, bool inFieldListRegion, Action<string?> add, Action<string?> addSplit)
    {
        string name = node.Name ?? string.Empty;
        bool fieldListRegion = inFieldListRegion || Regex.IsMatch(name, "field\\s*lists?|param(eter)?\\s*lists?|input\\s*fields?", RegexOptions.IgnoreCase);

        if (fieldListRegion && LooksLikeUdfFieldListName(name))
            add(name);

        if (fieldListRegion && !string.IsNullOrWhiteSpace(node.ValuePreview))
            addSplit(node.ValuePreview);

        foreach (ResourcePrivateNode child in node.Children)
            ExtractUdfNamesFromPrivateTree(child, fieldListRegion, add, addSplit);
    }

private static bool IsLikelyUdfParameterNameListKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key))
            return false;

        string k = key.Trim();
        return Regex.IsMatch(k, "^(FieldListNames?|FieldParameterLists?|ParameterNames?|ParamNames?|InputFieldLists?)$", RegexOptions.IgnoreCase)
            || Regex.IsMatch(k, "Field\\s*Parameter\\s*Lists?", RegexOptions.IgnoreCase);
    }

private static bool IsLikelyIndexedUdfParameterNameKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key))
            return false;

        return Regex.IsMatch(key.Trim(), "^(FieldList|Param|Parameter|InputFieldList)\\d*Name$", RegexOptions.IgnoreCase)
            || Regex.IsMatch(key.Trim(), "^Name(FieldList|Param|Parameter)\\d*$", RegexOptions.IgnoreCase);
    }

private static bool IsLikelyUdfFieldListAttribute(string key, string value)
    {
        if (!LooksLikeUdfFieldListName(key))
            return false;

        string v = (value ?? string.Empty).Trim();
        if (v.Length == 0)
            return false;

        return Regex.IsMatch(v, "^(Text|OMR|OMR\\s*Subfield|Field|Fields|Single|Multiple|One|Many|0|1|True|False|Yes|No)$", RegexOptions.IgnoreCase);
    }

private static bool LooksLikeUdfFieldListName(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        string v = value.Trim().Trim('"', '\'', '{', '}', '[', ']');
        if (v.Length == 0 || v.Length > 64)
            return false;

        if (Regex.IsMatch(v, "^_?ParamList(OMRIndex)?\\d+$", RegexOptions.IgnoreCase))
            return false;

        if (Regex.IsMatch(v, "^(Text|OMR|OMR\\s*Subfield|Field|Fields|Single|Multiple|True|False|Yes|No|None|Null|Unknown)$", RegexOptions.IgnoreCase))
            return false;

        if (Regex.IsMatch(v, "^[+-]?\\d+(\\.\\d+)?$"))
            return false;

        if (v.IndexOfAny(new[] { '/', '\\', ':', '{', '}', '[', ']' }) >= 0)
            return false;

        return Regex.IsMatch(v, "^[A-Za-z][A-Za-z0-9_ .-]*$", RegexOptions.CultureInvariant);
    }

    private object BuildFwdUdfsCanonical(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? q = Get(request, "q");

        var usedByTarget = snapshot.Relationships.Relationships
            .Where(r => !string.IsNullOrWhiteSpace(r.Target))
            .GroupBy(r => r.Target!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var rulesByFunction = snapshot.Rules.Rules
            .Where(r => !string.IsNullOrWhiteSpace(r.FunctionName))
            .GroupBy(r => r.FunctionName!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var items = snapshot.Fwd.Resources
            .Where(b => UdfInventoryResourceTypes.Any(t => RuleCorrelation.Eq(t, b.Type)))
            .SelectMany(b => b.Names.Select(n => new { type = b.Type, name = (n ?? string.Empty).Trim() }))
            .Where(x => !string.IsNullOrWhiteSpace(x.name))
            .Where(x => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(x.name, q))
            .Select(x =>
            {
                int byTarget = usedByTarget.TryGetValue(x.name, out List<AcRuleRelationship>? refs) ? refs.Count : 0;
                int byFunction = rulesByFunction.TryGetValue(x.name, out List<AcRuleSummary>? rules) ? rules.Count : 0;
                List<AcRuleSummary> matchedRules = rulesByFunction.TryGetValue(x.name, out rules) ? rules : new List<AcRuleSummary>();
                ResourceDetail? rawDetails = FindResourceDetail(snapshot.Fwd, x.type, x.name) ?? FindResourceDetailByName(snapshot.Fwd, x.name);
                EditorUdfDefinitionModel? canonicalDefinition = snapshot.EditorModel.UdfDefinitions.FirstOrDefault(u => RuleCorrelation.Eq(u.Name, x.name));
                List<AcTreeNode> internalNodes = FindParsedUdfNodes(snapshot, x.name);
                var definitionParameterNames = ExtractUdfInterfaceParameterNames(rawDetails);
                var callerParameterNames = matchedRules
                    .SelectMany(r => r.Parameters.Keys)
                    .Where(k => !string.IsNullOrWhiteSpace(k))
                    .Select(k => k.Trim())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(k => k, StringComparer.OrdinalIgnoreCase)
                    .ToList();
                var parameterNames = definitionParameterNames.Count > 0
                    ? definitionParameterNames
                    : callerParameterNames.Where(k => !Regex.IsMatch(k, @"^_?ParamList(OMRIndex)?\d+$", RegexOptions.IgnoreCase)).ToList();
                var ruleNames = matchedRules
                    .Select(r => string.IsNullOrWhiteSpace(r.RuleName) ? $"Rule {r.RuleIndex}" : r.RuleName!.Trim())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(n => n, StringComparer.OrdinalIgnoreCase)
                    .Take(100)
                    .ToList();
                var scopeIds = matchedRules
                    .Select(r => RuleCorrelation.ScopeId(r.ScopePath, r.ScopeType, r.ScopeName))
                    .Where(s => !string.IsNullOrWhiteSpace(s))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(s => s, StringComparer.OrdinalIgnoreCase)
                    .ToList();
                bool definitionParsed = parameterNames.Count > 0 || rawDetails?.FullAttributes.Count > 0 || rawDetails?.PublicAttributes.Count > 0;
                bool bodyParsed = internalNodes.Count > 0 || canonicalDefinition?.InternalRuleTree.Parsed == true;
                var diagnostics = new List<string>();
                if (!definitionParsed)
                    diagnostics.Add("UdfDefinitionNotParsed");
                if (!bodyParsed)
                    diagnostics.Add(canonicalDefinition?.InternalRuleTree.ParseState == "Opaque" ? "UdfBodyOpaque" : "UdfBodyUnavailable");
                if (rawDetails == null)
                    diagnostics.Add("ResourceDetailsUnavailable");
                if (rawDetails?.PrivateTree == null)
                    diagnostics.Add("ResourcePrivateTreeUnavailable");
                if (byTarget > 0 && byFunction == 0)
                    diagnostics.Add("RelationshipOnlyMatch");

                return new
                {
                    name = x.name,
                    resourceType = x.type,
                    source = "CanonicalFwdResource",
                    classification = ClassifyFunctionResourceCandidate(x.type, rawDetails),
                    confidence = bodyParsed || rawDetails?.PrivateTree != null ? "High" : UdfCandidateConfidence(x.type, rawDetails),
                    definitionParsed,
                    bodyParsed,
                    bodyParseState = canonicalDefinition?.InternalRuleTree.ParseState ?? (internalNodes.Count > 0 ? "Parsed" : rawDetails?.PrivateTree != null ? "Opaque" : "Unavailable"),
                    hasResourceDetails = rawDetails != null,
                    hasPrivateTree = rawDetails?.PrivateTree != null,
                    usedByRuleCount = Math.Max(byTarget, byFunction),
                    parameterNames,
                    callerParameterSlots = callerParameterNames,
                    ruleNames,
                    scopeIds,
                    internalRuleCount = canonicalDefinition?.InternalRuleTree.InternalRuleList.Rules.Count ?? internalNodes.Count,
                    internalRulePreview = canonicalDefinition?.InternalRuleTree.InternalRuleList.Rules
                        .Take(100)
                        .Select(n => new
                        {
                            nodeId = n.NodeId,
                            ruleName = n.Name,
                            functionName = n.FunctionName,
                            displayPath = n.Path,
                            source = n.Source,
                            confidence = n.Confidence
                        })
                        .Cast<object>()
                        .ToList() ?? internalNodes
                        .Take(100)
                        .Select(n => new
                        {
                            scopeId = RuleCorrelation.ScopeId(n.ScopePath, n.ScopeType, n.ScopeName),
                            nodeId = RuleCorrelation.NodeId(n),
                            ruleName = n.RuleName,
                            functionName = n.FunctionName,
                            displayPath = n.DisplayPath,
                            source = "AcTreeReport.Nodes",
                            confidence = "High"
                        })
                        .Cast<object>()
                        .ToList(),
                    diagnostics,
                    rawResourceDetails = rawDetails == null ? null : new
                    {
                        category = rawDetails.Category,
                        fullConfig = rawDetails.FullAttributes,
                        publicConfig = rawDetails.PublicAttributes,
                        privateTree = rawDetails.PrivateTree,
                        warnings = rawDetails.Warnings
                    },
                    links = new
                    {
                        self = "/api/v1/fwd/udfs/" + UrlEncode(x.name),
                        inferred = "/api/v1/fwd/udfs/inferred?q=" + UrlEncode(x.name)
                    }
                };
            })
            .OrderByDescending(x => x.usedByRuleCount)
            .ThenBy(x => x.name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new
        {
            count = items.Count,
            items,
            caveat = "Rows combine FWD function/UDF resources, decoded resource metadata/private tree previews, parsed internal rule bodies when exposed by FormWorks, and caller-side usage.",
            diagnostics = items.SelectMany(i => i.diagnostics).Distinct(StringComparer.OrdinalIgnoreCase).ToList()
        };
    }

    private object BuildFwdUdfDetail(WorkbenchSnapshot snapshot, HttpListenerRequest request, string udfName)
    {
        string name = (udfName ?? string.Empty).Trim();

        var canonicalHits = snapshot.Fwd.Resources
            .Where(b => UdfInventoryResourceTypes.Any(t => RuleCorrelation.Eq(t, b.Type)))
            .SelectMany(b => b.Names.Select(n => new { type = b.Type, name = (n ?? string.Empty).Trim() }))
            .Where(x => !string.IsNullOrWhiteSpace(x.name) && RuleCorrelation.Eq(x.name, name))
            .ToList();

        ResourceDetail? primaryDetails = canonicalHits
            .Select(h => FindResourceDetail(snapshot.Fwd, h.type, h.name))
            .FirstOrDefault(d => d != null) ?? FindResourceDetailByName(snapshot.Fwd, name);

        EditorUdfDefinitionModel? canonicalDefinition = snapshot.EditorModel.UdfDefinitions.FirstOrDefault(u => RuleCorrelation.Eq(u.Name, name));
        List<AcTreeNode> internalNodes = FindParsedUdfNodes(snapshot, name);

        var directCallers = snapshot.Rules.Rules
            .Where(r => RuleCorrelation.Eq(r.FunctionName, name))
            .OrderBy(r => RuleCorrelation.ScopeId(r.ScopePath, r.ScopeType, r.ScopeName), StringComparer.OrdinalIgnoreCase)
            .ThenBy(r => r.RuleIndex)
            .Select(r => new
            {
                scopeId = RuleCorrelation.ScopeId(r.ScopePath, r.ScopeType, r.ScopeName),
                scopePath = r.ScopePath,
                scopeType = r.ScopeType,
                scopeName = r.ScopeName,
                ruleIndex = r.RuleIndex,
                ruleGuid = r.RuleGuid,
                ruleId = r.RuleId,
                ruleName = r.RuleName,
                functionName = r.FunctionName,
                parameters = r.Parameters
            })
            .ToList();

        var iteratorCallers = snapshot.Rules.Rules
            .Where(r => !string.IsNullOrWhiteSpace(r.FunctionName))
            .Where(r => Regex.IsMatch(r.FunctionName!, "iterate.*udf|_iiterate.*udf", RegexOptions.IgnoreCase))
            .Where(r => r.Parameters.Any(p => p.Value.Any(v => RuleCorrelation.Eq(v, name))))
            .OrderBy(r => RuleCorrelation.ScopeId(r.ScopePath, r.ScopeType, r.ScopeName), StringComparer.OrdinalIgnoreCase)
            .ThenBy(r => r.RuleIndex)
            .Select(r => new
            {
                scopeId = RuleCorrelation.ScopeId(r.ScopePath, r.ScopeType, r.ScopeName),
                scopePath = r.ScopePath,
                scopeType = r.ScopeType,
                scopeName = r.ScopeName,
                ruleIndex = r.RuleIndex,
                ruleGuid = r.RuleGuid,
                ruleId = r.RuleId,
                ruleName = r.RuleName,
                functionName = r.FunctionName,
                parameters = r.Parameters
            })
            .ToList();

        var relationshipCalls = snapshot.Relationships.Relationships
            .Where(r => RuleCorrelation.Eq(r.Target, name) || RuleCorrelation.Eq(r.FunctionName, name))
            .Select(r => new
            {
                scopeId = RuleCorrelation.ScopeId(r.ScopePath, r.ScopeType, r.ScopeName),
                scopePath = r.ScopePath,
                scopeType = r.ScopeType,
                scopeName = r.ScopeName,
                ruleIndex = r.RuleIndex,
                ruleGuid = r.RuleGuid,
                ruleName = r.RuleName,
                functionName = r.FunctionName,
                kind = r.Kind,
                targetType = r.TargetType,
                target = r.Target,
                confidence = r.Confidence
            })
            .ToList();

        if (!canonicalHits.Any() && !directCallers.Any() && !relationshipCalls.Any() && internalNodes.Count == 0)
            return new
            {
                name,
                found = false,
                warnings = new[] { "UDF/function was not found in canonical resources, rule callers, parsed private rules, or relationship evidence." }
            };

        string? canonicalName = canonicalHits.Select(x => x.name).FirstOrDefault(n => !string.IsNullOrWhiteSpace(n))
            ?? directCallers.Select(c => c.functionName).FirstOrDefault(n => RuleCorrelation.Eq(n, name))
            ?? relationshipCalls.Select(c => c.functionName).FirstOrDefault(n => RuleCorrelation.Eq(n, name))
            ?? internalNodes.Select(n => n.FunctionName).FirstOrDefault(n => RuleCorrelation.Eq(n, name));
        if (!string.IsNullOrWhiteSpace(canonicalName))
            name = canonicalName!;
        canonicalDefinition = snapshot.EditorModel.UdfDefinitions.FirstOrDefault(u => RuleCorrelation.Eq(u.Name, name)) ?? canonicalDefinition;

        var definitionParameterNames = ExtractUdfInterfaceParameterNames(primaryDetails);
        var callerParameterNames = directCallers
            .SelectMany(r => r.parameters.Keys)
            .Where(k => !string.IsNullOrWhiteSpace(k))
            .Select(k => k.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(k => k, StringComparer.OrdinalIgnoreCase)
            .ToList();
        var parameterNames = definitionParameterNames.Count > 0
            ? definitionParameterNames
            : callerParameterNames.Where(k => !Regex.IsMatch(k, @"^_?ParamList(OMRIndex)?\d+$", RegexOptions.IgnoreCase)).ToList();

        var statusResults = directCallers
            .SelectMany(r => snapshot.Rules.Rules
                .Where(x => RuleCorrelation.Eq(x.RuleGuid, r.ruleGuid) || (x.RuleIndex == r.ruleIndex && RuleCorrelation.ScopeId(x.ScopePath, x.ScopeType, x.ScopeName) == r.scopeId))
                .SelectMany(x => x.ActionNames))
            .Concat(internalNodes.SelectMany(n => n.ActionNames))
            .Concat(canonicalDefinition?.StatusResults ?? Enumerable.Empty<string>())
            .Concat(canonicalDefinition?.InternalRuleTree.InternalRuleList.StatusResults ?? Enumerable.Empty<string>())
            .Where(a => !string.IsNullOrWhiteSpace(a))
            .Select(a => a.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(a => a, StringComparer.OrdinalIgnoreCase)
            .ToList();

        bool definitionParsed = parameterNames.Count > 0 || primaryDetails?.FullAttributes.Count > 0 || primaryDetails?.PublicAttributes.Count > 0;
        bool bodyParsed = internalNodes.Count > 0 || canonicalDefinition?.InternalRuleTree.Parsed == true;
        string bodyParseState = canonicalDefinition?.InternalRuleTree.ParseState ?? (internalNodes.Count > 0 ? "Parsed" : primaryDetails?.PrivateTree != null ? "Opaque" : "Unavailable");
        List<object> ruleBody = canonicalDefinition?.InternalRuleTree.InternalRuleList.Rules
            .Take(250)
            .Select(n => new
            {
                nodeId = n.NodeId,
                ruleName = n.Name,
                functionName = n.FunctionName,
                actionNames = n.StatusResults,
                displayPath = n.Path,
                parameters = n.Parameters,
                source = n.Source,
                confidence = n.Confidence,
                textPreview = n.TextPreview
            })
            .Cast<object>()
            .ToList() ?? internalNodes
            .Take(250)
            .Select(n => new
            {
                scopeId = RuleCorrelation.ScopeId(n.ScopePath, n.ScopeType, n.ScopeName),
                nodeId = RuleCorrelation.NodeId(n),
                ruleName = n.RuleName,
                functionName = n.FunctionName,
                actionNames = n.ActionNames,
                displayPath = n.DisplayPath,
                parameters = n.Parameters,
                source = "AcTreeReport.Nodes",
                confidence = "High",
                textPreview = n.DisplayPath
            })
            .Cast<object>()
            .ToList();

        return new
        {
            name,
            found = true,
            resourceType = canonicalHits.Select(x => x.type).FirstOrDefault() ?? (internalNodes.Count > 0 ? "ParsedFunctionPrivateRules" : "Function"),
            classification = canonicalHits.Any()
                ? (canonicalHits.Any(h => RuleCorrelation.Eq(h.type, "Function") || RuleCorrelation.Eq(h.type, "Functions") || RuleCorrelation.Eq(h.type, "User Defined")) ? "FunctionResource" : "CandidateUdf")
                : (internalNodes.Count > 0 ? "ParsedPrivateRuleTree" : directCallers.Any() ? "RuleUsageOnly" : "RegexOnly"),
            functionKind = canonicalHits.Any() || internalNodes.Count > 0 ? "UserDefinedCandidate" : "InferredFromRuleUsage",
            source = canonicalHits.Any() ? "FwdResource" : internalNodes.Count > 0 ? "ParsedPrivateRuleTree" : "RuleUsage",
            confidence = bodyParsed || primaryDetails?.PrivateTree != null ? "High" : canonicalHits.Any() ? UdfCandidateConfidence(canonicalHits.First().type, primaryDetails) : "Low",
            definitionParsed,
            bodyParsed,
            bodyParseState,
            hasResourceDetails = primaryDetails != null,
            hasPrivateTree = primaryDetails?.PrivateTree != null,
            fieldListCount = parameterNames.Count,
            statusResultCount = statusResults.Count,
            definition = new
            {
                parsedFrom = bodyParsed ? "ParsedFunctionPrivateRuleTree" : primaryDetails == null ? "CallerUsageCorrelation" : "FwdResourceMetadataPlusCallerUsage",
                authority = bodyParsed ? "ParsedPrivateRuleBody" : definitionParsed ? "ResourceMetadata" : "UsageDerived",
                fieldLists = parameterNames.Select(p => new
                {
                    name = p,
                    fieldType = "Unknown",
                    cardinality = "Unknown"
                }).ToList(),
                statusResults,
                ruleBody,
                internalRuleList = canonicalDefinition?.InternalRuleTree.InternalRuleList,
                notes = new[]
                {
                    "Field lists come from the UDF interface when available; caller slots are only used as a fallback.",
                    bodyParseState == "Parsed" ? "Internal UDF rule body was parsed from decoded UDF rule nodes." : bodyParseState == "PartiallyParsed" ? "Internal UDF rule body was promoted from private-tree rule-body evidence." : bodyParseState == "Opaque" ? "Native private-tree payload was present but did not expose rule-body signals." : "Internal UDF rule body was not exposed by the available native FormWorks API."
                }
            },
            usage = new
            {
                // Back-compat arrays (do not change shape) 
                directCallers,
                iteratorCallers,
                relationshipMatches = relationshipCalls,

                // New call graph view (superset) 
                callGraph = new
                {
                    // Node kinds:
                    // - callerRule: rule that calls/includes evidence for the UDF
                    // - udfCallee: the UDF node
                    nodes = BuildUdfCallGraphNodes(udfName: name, directCallers: directCallers, iteratorCallers: iteratorCallers),
                    edges = BuildUdfCallGraphEdges(udfName: name, directCallers: directCallers, iteratorCallers: iteratorCallers, relationshipCalls: relationshipCalls)
                }
            },
            rawResourceDetails = primaryDetails == null ? null : new
            {
                category = primaryDetails.Category,
                fullConfig = primaryDetails.FullAttributes,
                publicConfig = primaryDetails.PublicAttributes,
                privateTree = primaryDetails.PrivateTree,
                warnings = primaryDetails.Warnings
            },
            diagnostics = new
            {
                warnings = new List<string>
                {
                    definitionParsed ? string.Empty : "UdfDefinitionNotParsed",
                    bodyParsed ? string.Empty : bodyParseState == "Opaque" ? "UdfBodyOpaque" : "UdfBodyUnavailable",
                    primaryDetails == null ? "ResourceDetailsUnavailable" : string.Empty,
                    primaryDetails?.PrivateTree == null ? "ResourcePrivateTreeUnavailable" : string.Empty,
                    canonicalHits.Any() ? string.Empty : "NonCanonicalRuleUsageOnly",
                    parameterNames.Count == 0 ? "FieldListsNotParsedOrUnavailable" : string.Empty,
                    statusResults.Count == 0 ? "StatusResultsNotParsedOrUnavailable" : string.Empty,
                    relationshipCalls.Any() && !directCallers.Any() ? "RelationshipOnlyMatch" : string.Empty,
                    !iteratorCallers.Any() ? string.Empty : "IteratorCallersDetected"
                }.Where(x => !string.IsNullOrWhiteSpace(x)).ToList()
            },
            links = new
            {
                canonicalList = "/api/v1/fwd/udfs",
                inferredList = "/api/v1/fwd/udfs/inferred",
                self = "/api/v1/fwd/udfs/" + UrlEncode(name)
            },
            caveat = bodyParsed
                ? "This endpoint includes an internal UDF Rule List projection from decoded UDF nodes or promoted private-tree rule-body evidence."
                : "This endpoint includes metadata, private tree previews, and caller-side usage. bodyParseState explains whether native body evidence is opaque or unavailable."
        };
    }

private static List<AcTreeNode> FindParsedUdfNodes(WorkbenchSnapshot snapshot, string udfName)
    {
        string name = (udfName ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(name))
            return new List<AcTreeNode>();

        return snapshot.Tree.Nodes
            .Where(n => n.IsRuleNode)
            .Where(n => RuleCorrelation.Eq(n.ScopeType, "UDF") || RuleCorrelation.Contains(n.ScopePath, "AC/UDFs/"))
            .Where(n => RuleCorrelation.Eq(n.ScopeName, name) || RuleCorrelation.Contains(n.ScopePath, "AC/UDFs/" + name))
            .OrderBy(n => n.RuleIndexWithinScope)
            .ThenBy(n => n.NodeId)
            .ToList();
    }

    private object BuildFwdUdfsInferred(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? q = Get(request, "q");
        bool includeCanonical = GetBool(request, "includeCanonical", false);

        var canonicalNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (ResourceBucket bucket in snapshot.Fwd.Resources.Where(b => UdfInventoryResourceTypes.Any(t => RuleCorrelation.Eq(t, b.Type))))
        {
            foreach (string name in bucket.Names)
            {
                if (!string.IsNullOrWhiteSpace(name))
                    canonicalNames.Add(name.Trim());
            }
        }

        var items = snapshot.Rules.Rules
            .Select(r => r.FunctionName)
            .Where(fn => !string.IsNullOrWhiteSpace(fn))
            .Select(fn => fn!.Trim())
            .Where(fn => Regex.IsMatch(fn, "udf|user.?defined", RegexOptions.IgnoreCase))
            .GroupBy(fn => fn, StringComparer.OrdinalIgnoreCase)
            .Select(g => new
            {
                name = g.Key,
                classification = "RegexOnly",
                confidence = "Low",
                source = "InferredFromFunctionNameRegex",
                notCanonicalResource = !canonicalNames.Contains(g.Key),
                usedByRuleCount = g.Count()
            })
            .Where(x => includeCanonical || x.notCanonicalResource)
            .Where(x => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(x.name, q))
            .OrderByDescending(x => x.usedByRuleCount)
            .ThenBy(x => x.name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new
        {
            count = items.Count,
            items,
            diagnostics = new[] { "RegexOnly" },
            links = new
            {
                canonical = "/api/v1/fwd/udfs"
            }
        };
    }

private static List<object> BuildUdfCallGraphNodes(string udfName, IEnumerable<object> directCallers, IEnumerable<object> iteratorCallers)
    {
        // NOTE: callers are anonymous-type objects; we project them dynamically via reflection.
        // This file intentionally uses anonymous projections elsewhere; keep it consistent.

        // UDF callee node
        string udfNodeId = "udf:" + udfName;
        var nodes = new List<object>
        {
            new
            {
                id = udfNodeId,
                kind = "udfCallee",
                name = udfName
            }
        };

        void AddCallerNodes(IEnumerable<object> callers)
        {
            foreach (object c in callers)
            {
                // expected properties from existing projections:
                // scopeId, scopePath, scopeType, scopeName, ruleIndex, ruleGuid, ruleId, ruleName, functionName, parameters
                var t = c.GetType();
                string? scopeId = t.GetProperty("scopeId")?.GetValue(c)?.ToString();
                string? ruleGuid = t.GetProperty("ruleGuid")?.GetValue(c)?.ToString();
                int? ruleIndex = (int?)t.GetProperty("ruleIndex")?.GetValue(c);
                string? ruleId = t.GetProperty("ruleId")?.GetValue(c)?.ToString();
                string? ruleName = t.GetProperty("ruleName")?.GetValue(c)?.ToString();
                string? functionName = t.GetProperty("functionName")?.GetValue(c)?.ToString();
                string? scopePath = t.GetProperty("scopePath")?.GetValue(c)?.ToString();
                string? scopeType = t.GetProperty("scopeType")?.GetValue(c)?.ToString();
                string? scopeName = t.GetProperty("scopeName")?.GetValue(c)?.ToString();
                var parameters = t.GetProperty("parameters")?.GetValue(c);

                // Stable per-node id: prefer ruleGuid
                string callerId = !string.IsNullOrWhiteSpace(ruleGuid)
                    ? "rule:" + scopeId + ":" + ruleGuid
                    : "rule:" + scopeId + ":idx:" + (ruleIndex.HasValue ? ruleIndex.Value.ToString() : "?" ) + ":" + (ruleId ?? "");

                nodes.Add(new
                {
                    id = callerId,
                    kind = "callerRule",
                    // carry-through useful context
                    scopeId,
                    scopePath,
                    scopeType,
                    scopeName,
                    ruleIndex,
                    ruleGuid,
                    ruleId,
                    ruleName,
                    functionName,
                    parameters,
                    // UI helper
                    display = !string.IsNullOrWhiteSpace(ruleName) ? ruleName : (functionName ?? "(unknown)")
                });
            }
        }

        AddCallerNodes(directCallers);
        AddCallerNodes(iteratorCallers);

        return nodes;
    }

    private static List<object> BuildUdfCallGraphEdges(string udfName, IEnumerable<object> directCallers, IEnumerable<object> iteratorCallers, IEnumerable<object> relationshipCalls)
    {
        string udfNodeId = "udf:" + udfName;
        var edges = new List<object>();

        void AddEdges(IEnumerable<object> callers, string edgeKind)
        {
            foreach (object c in callers)
            {
                var t = c.GetType();
                string? scopeId = t.GetProperty("scopeId")?.GetValue(c)?.ToString();
                string? ruleGuid = t.GetProperty("ruleGuid")?.GetValue(c)?.ToString();
                int? ruleIndex = (int?)t.GetProperty("ruleIndex")?.GetValue(c);
                string? ruleId = t.GetProperty("ruleId")?.GetValue(c)?.ToString();
                string fromId = !string.IsNullOrWhiteSpace(ruleGuid)
                    ? "rule:" + scopeId + ":" + ruleGuid
                    : "rule:" + scopeId + ":idx:" + (ruleIndex.HasValue ? ruleIndex.Value.ToString() : "?") + ":" + (ruleId ?? "");

                edges.Add(new
                {
                    from = fromId,
                    to = udfNodeId,
                    kind = edgeKind
                });
            }
        }

        AddEdges(directCallers, "directCall");
        AddEdges(iteratorCallers, "iteratorWrapperCall");

        // relationship evidence caller nodes are based on relationshipCalls projections.
        foreach (object r in relationshipCalls)
        {
            var t = r.GetType();
            string? scopeId = t.GetProperty("scopeId")?.GetValue(r)?.ToString();
            string? ruleGuid = t.GetProperty("ruleGuid")?.GetValue(r)?.ToString();
            int? ruleIndex = (int?)t.GetProperty("ruleIndex")?.GetValue(r);
            string? ruleName = t.GetProperty("ruleName")?.GetValue(r)?.ToString();

            string fromId = !string.IsNullOrWhiteSpace(ruleGuid)
                ? "rule:" + scopeId + ":" + ruleGuid
                : "rule:" + scopeId + ":idx:" + (ruleIndex.HasValue ? ruleIndex.Value.ToString() : "?") + ":" + (ruleName ?? "");

            string? kind = t.GetProperty("kind")?.GetValue(r)?.ToString();
            string? confidence = t.GetProperty("confidence")?.GetValue(r)?.ToString();
            string? targetType = t.GetProperty("targetType")?.GetValue(r)?.ToString();
            string? target = t.GetProperty("target")?.GetValue(r)?.ToString();
            string? functionName = t.GetProperty("functionName")?.GetValue(r)?.ToString();

            edges.Add(new
            {
                from = fromId,
                to = udfNodeId,
                kind = "relationshipEvidenceCall",
                // extra metadata
                evidenceKind = kind,
                confidence,
                targetType,
                target,
                functionName,
                ruleName
            });
        }

        return edges;
    }

private static ResourceDetail? FindResourceDetail(FwdInspectionReport? report, string resourceType, string resourceName)
    {
        if (report == null || string.IsNullOrWhiteSpace(resourceType) || string.IsNullOrWhiteSpace(resourceName))
            return null;

        return report.ResourceTypeDetails
            .Where(t => RuleCorrelation.Eq(t.Type, resourceType))
            .SelectMany(t => t.Resources)
            .FirstOrDefault(r => RuleCorrelation.Eq(r.Name, resourceName));
    }

private static ResourceDetail? FindResourceDetailByName(FwdInspectionReport? report, string resourceName)
    {
        if (report == null || string.IsNullOrWhiteSpace(resourceName))
            return null;

        return report.ResourceTypeDetails
            .SelectMany(t => t.Resources)
            .FirstOrDefault(r => RuleCorrelation.Eq(r.Name, resourceName));
    }

private static string ClassifyFunctionResourceCandidate(string resourceType, ResourceDetail? details)
    {
        if (details != null && (LooksLikeUdfDefinition(details.FullAttributes) || LooksLikeUdfDefinition(details.PublicAttributes) || LooksLikeUdfPrivateTree(details.PrivateTree)))
            return "CandidateUdf";

        if (RuleCorrelation.Eq(resourceType, "UDF") || RuleCorrelation.Eq(resourceType, "UDFs") || RuleCorrelation.Eq(resourceType, "UserDefinedFunction") || RuleCorrelation.Eq(resourceType, "UserDefinedFunctions") || RuleCorrelation.Eq(resourceType, "User Defined"))
            return "CandidateUdf";

        if (RuleCorrelation.Eq(resourceType, "Function") || RuleCorrelation.Eq(resourceType, "Functions"))
            return "FunctionResource";

        return "FunctionLikeResource";
    }

private static string UdfCandidateConfidence(string resourceType, ResourceDetail? details)
    {
        if (details != null && (LooksLikeUdfDefinition(details.FullAttributes) || LooksLikeUdfDefinition(details.PublicAttributes) || LooksLikeUdfPrivateTree(details.PrivateTree)))
            return "Medium";

        if (RuleCorrelation.Eq(resourceType, "UDF") || RuleCorrelation.Eq(resourceType, "UDFs") || RuleCorrelation.Eq(resourceType, "UserDefinedFunction") || RuleCorrelation.Eq(resourceType, "UserDefinedFunctions") || RuleCorrelation.Eq(resourceType, "User Defined"))
            return "Medium";

        if (RuleCorrelation.Eq(resourceType, "Function") || RuleCorrelation.Eq(resourceType, "Functions"))
            return "Low";

        return "Low";
    }

private static bool LooksLikeUdfDefinition(IEnumerable<ResourceAttrEntry> attributes)
    {
        foreach (ResourceAttrEntry attr in attributes ?? Enumerable.Empty<ResourceAttrEntry>())
        {
            string probe = ((attr.Key ?? string.Empty) + " " + (attr.Value ?? string.Empty)).ToLowerInvariant();
            if (probe.Contains("user defined") || probe.Contains("fieldlist") || probe.Contains("field list") || probe.Contains("status result") || probe.Contains("return code"))
                return true;
        }

        return false;
    }

private static bool LooksLikeUdfPrivateTree(ResourcePrivateNode? node)
    {
        if (node == null)
            return false;

        string probe = ((node.Name ?? string.Empty) + " " + (node.Path ?? string.Empty) + " " + (node.ValuePreview ?? string.Empty)).ToLowerInvariant();
        if (probe.Contains("fieldlist") || probe.Contains("field list") || probe.Contains("status") || probe.Contains("rule"))
            return true;

        return node.Children.Any(LooksLikeUdfPrivateTree);
    }
}
