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
    private static bool TryResolveRule(WorkbenchSnapshot snapshot, string reference, out RuleModel? rule, out string? ambiguityDetail)
    {
        if (snapshot.RulesByNodeId.TryGetValue(reference, out rule))
        {
            ambiguityDetail = null;
            return true;
        }

        var matches = snapshot.RulesByNodeId.Values
            .Where(m =>
                RuleCorrelation.Eq(m.Node.RuleGuid, reference) ||
                RuleCorrelation.Eq(m.Node.RuleId, reference) ||
                RuleCorrelation.Eq(m.FlatRule?.RuleGuid, reference) ||
                RuleCorrelation.Eq(m.FlatRule?.RuleId, reference))
            .ToList();

        if (matches.Count == 1)
        {
            rule = matches[0];
            ambiguityDetail = null;
            return true;
        }

        if (matches.Count > 1)
        {
            rule = null;
            ambiguityDetail = string.Join(", ", matches.Select(m => m.NodeId).OrderBy(x => x, StringComparer.OrdinalIgnoreCase));
            return false;
        }

        rule = null;
        ambiguityDetail = null;
        return false;
    }

private object BuildRuleDetailWithIncludes(WorkbenchSnapshot snapshot, RuleModel rule, HttpListenerRequest request)
    {
        HashSet<string> include = IncludeSet(request);
        object detail = BuildRuleDetail(snapshot, rule);
        if (include.Count == 0) return detail;

        return new
        {
            detail,
            included = new
            {
                subtree = include.Contains("subtree") ? BuildRuleSubtree(snapshot, rule, request) : null,
                references = include.Contains("references") ? rule.Relationships.Select(RelationshipPayload).ToList() : null,
                diagnostics = include.Contains("diagnostics") ? rule.Diagnostics.Select(d => new { d.Severity, d.Category, d.Message, d.ScopePath, d.NodeId }).ToList() : null,
                fieldResolution = include.Contains("fieldResolution") ? BuildFieldResolution(rule) : null
            },
            include = include.OrderBy(x => x).ToList(),
            caveat = "Included sections do not imply native runtime execution. They are static inspection evidence."
        };
    }

private object BuildRuleDetail(WorkbenchSnapshot snapshot, RuleModel rule)
    {
        AcTreeNode n = rule.Node;
        ScopeModel scope = snapshot.ScopesById[rule.ScopeId];
        var children = scope.StructuralEdges.Where(e => e.FromNodeId == n.NodeId).ToList();
        AcTreeEdge? incoming = scope.StructuralEdges.FirstOrDefault(e => e.ToNodeId == n.NodeId);

        return new
        {
            identity = new
            {
                rule.NodeId,
                rawNodeId = n.NodeId,
                n.RuleGuid,
                n.RuleId,
                name = n.RuleName,
                n.FunctionName,
                n.FunctionVersion,
                rule.ScopeId
            },
            position = new
            {
                depth = n.HierarchyLevel,
                parentNodeId = n.ParentNodeId > 0 ? "node-" + n.ParentNodeId.ToString("000000") : null,
                ordinal = n.RuleIndexWithinScope,
                branch = BranchPayload(incoming),
                path = BuildRulePath(scope, n),
                routePath = BuildRuleRoutePath(scope, n)
            },
            disabled = DisabledPayload(n),
            function = new { name = n.FunctionName, source = "StructuralRuleNode", confidence = string.IsNullOrWhiteSpace(n.FunctionName) ? "Unknown" : "High" },
            parameters = FlattenParameters(n.Parameters),
            editorModel = BuildSelectedRulePacket(snapshot, rule),
            fieldResolution = BuildFieldResolution(rule),
            relationships = rule.Relationships.Select(RelationshipPayload).ToList(),
            branches = children.GroupBy(e => e.ActionListIndex).Select(g =>
            {
                AcTreeEdge firstEdge = g.First();
                return new
                {
                    actionListIndex = g.Key,
                    actionName = firstEdge.ActionName,
                    actionNameResolved = firstEdge.ActionNameResolved,
                    routeState = RouteState(firstEdge),
                    label = ActionLabel(firstEdge),
                    childCount = g.Count(),
                    childNodeIds = g.Select(e => "node-" + e.ToNodeId.ToString("000000")).ToList(),
                    children = g.Select(e => new { nodeId = "node-" + e.ToNodeId.ToString("000000"), name = scope.StructuralNodes.FirstOrDefault(n2 => n2.NodeId == e.ToNodeId)?.RuleName }).ToList()
                };
            }).ToList(),
            reconciliation = new
            {
                structuralNode = true,
                flatInventoryMatch = rule.FlatRule != null,
                flatInventoryId = rule.FlatRule == null ? null : RuleCorrelation.InventoryId(rule.FlatRule),
                runtimeOrderProof = true,
                disabledAuthority = "Structural",
                flatInventoryDisabled = rule.FlatRule == null ? null : new { state = rule.FlatRule.DisabledState, confidence = rule.FlatRule.DisabledConfidence, reason = rule.FlatRule.DisabledReason, authority = "FlatInventory", caveat = "Audit evidence only; does not override structural disabled state." }
            },
            evidence = new
            {
                @class = "Structural",
                sourcePath = rule.ScopeId + "/TreeNode[" + n.NodeId + "]",
                rawAttributes = n.Attributes,
                warnings = rule.Diagnostics.Select(d => d.Message).ToList()
            },
            notProven = new[]
            {
                "Native runtime execution was not simulated.",
                "ac-flow.json is experimental / low-confidence and is not native runtime proof.",
                "Structural disabled state is authoritative over flat inventory disabled state.",
                "Business intent is only shown when supported by extracted function names, parameters, branch labels, or references."
            }
        };
    }

private static SelectedRulePacket BuildSelectedRulePacket(WorkbenchSnapshot snapshot, RuleModel rule)
    {
        AcTreeNode node = rule.Node;
        ScopeModel scope = snapshot.ScopesById[rule.ScopeId];
        var outgoingEdges = scope.StructuralEdges
            .Where(e => e.FromNodeId == node.NodeId)
            .OrderBy(e => e.ActionListIndex)
            .ThenBy(e => e.ToNodeId)
            .ToList();
        AcTreeEdge? incomingEdge = scope.StructuralEdges.FirstOrDefault(e => e.ToNodeId == node.NodeId);
        AcTreeNode? parentNode = incomingEdge == null
            ? scope.StructuralNodes.FirstOrDefault(n => n.NodeId == node.ParentNodeId)
            : scope.StructuralNodes.FirstOrDefault(n => n.NodeId == incomingEdge.FromNodeId);

        List<SelectedParameterProjection> parameters = BuildSelectedParameters(node.Parameters, rule.FlatRule?.Parameters).ToList();
        List<string> observedParameterNames = DistinctOrdered(parameters.Select(p => p.Name));
        string? functionName = string.IsNullOrWhiteSpace(node.FunctionName) ? rule.FlatRule?.FunctionName : node.FunctionName;
        bool hasDefinition = AcFunctionCatalog.TryGetDefinition(functionName ?? string.Empty, out AcFunctionCatalog.FunctionDefinition? definition);
        List<string> configuredStatusResults = DistinctOrdered(node.ActionNames
            .Concat(rule.FlatRule?.ActionNames ?? Enumerable.Empty<string>())
            .Concat(outgoingEdges.Select(e => e.ActionName ?? string.Empty)));
        List<string> functionBehaviorFlags = hasDefinition
            ? DistinctOrdered(definition!.BehaviorFlags)
            : InferBehaviorFlags(functionName ?? string.Empty, observedParameterNames, rule.Relationships);
        List<AcFunctionCatalog.FunctionParameterSchema> functionParameterSchema = hasDefinition
            ? definition!.ParameterSchema.ToList()
            : AcFunctionCatalog.InferObservedParameterSchemas(functionName ?? string.Empty, observedParameterNames).ToList();
        AcFunctionCatalog.FunctionSchemaProfile functionSchemaProfile = hasDefinition
            ? definition!.SchemaProfile
            : AcFunctionCatalog.BuildSchemaProfile(functionName ?? string.Empty, functionParameterSchema, functionBehaviorFlags, deprecated: false);
        List<string> unknownObservedParameterNames = AcFunctionCatalog.FindUnknownObservedParameterNames(functionName ?? string.Empty, observedParameterNames).ToList();

        var packet = new SelectedRulePacket
        {
            RuleList = new SelectedRuleListProjection
            {
                ScopeId = scope.ScopeId,
                Name = scope.Name,
                Kind = scope.Kind,
                RuleListPath = string.IsNullOrWhiteSpace(node.RuleListPath) ? "Root" : node.RuleListPath,
                StructuralPath = string.IsNullOrWhiteSpace(node.StructuralPath) ? "Root" : node.StructuralPath,
                DisplayPath = string.IsNullOrWhiteSpace(node.DisplayPath) ? "Root" : node.DisplayPath,
                StructuralRuleCount = scope.StructuralRuleCount,
                FlatInventoryCount = scope.FlatInventoryCount
            },
            Rule = new SelectedRuleProjection
            {
                NodeId = rule.NodeId,
                RawNodeId = node.NodeId,
                RuleGuid = node.RuleGuid,
                RuleId = node.RuleId,
                Name = node.RuleName,
                FunctionName = functionName,
                FunctionVersion = node.FunctionVersion ?? rule.FlatRule?.FunctionVersion,
                Description = node.Description ?? rule.FlatRule?.Description,
                Ordinal = node.RuleIndexWithinScope,
                Depth = node.HierarchyLevel,
                Disabled = DisabledPayload(node)
            },
            ParentRule = parentNode == null ? null : BuildSelectedRulePointer(parentNode),
            IncomingStatusResult = incomingEdge == null ? null : BuildSelectedStatusResult(parentNode, incomingEdge, "ParentRuleStatusResultOwnsSelectedRule"),
            Function = new SelectedFunctionProjection
            {
                Name = functionName,
                Category = hasDefinition ? definition.Category : AcFunctionCatalog.InferCategory(functionName ?? string.Empty),
                Defined = hasDefinition,
                Observed = !string.IsNullOrWhiteSpace(functionName),
                Deprecated = definition?.Deprecated ?? false,
                Description = definition?.Description ?? "Observed static FWD rule function. Full FormWorks function semantics are not yet cataloged.",
                StatusResults = DistinctOrdered((definition?.StatusResults ?? Array.Empty<string>()).Concat(configuredStatusResults)),
                ConfiguredStatusResults = configuredStatusResults,
                ParameterRoles = DistinctOrdered(definition?.ParameterRoles ?? Array.Empty<string>()),
                ParameterSchema = functionParameterSchema,
                ObservedParameterNames = observedParameterNames,
                UnknownObservedParameterNames = unknownObservedParameterNames,
                SchemaProfile = functionSchemaProfile,
                BehaviorFlags = functionBehaviorFlags,
                RuntimeImpacts = hasDefinition
                    ? DistinctOrdered(definition.RuntimeImpacts)
                    : new List<string> { "Static rule usage was observed. Inspect configured status actions and parameter bindings before inferring runtime operator impact." },
                Evidence = definition?.Evidence ?? "Observed static FWD configuration",
                StatusResultCaveat = definition?.StatusResultCaveat ?? "Configured ActionNames on observed rules are the authoritative status-result/action-list evidence for this FWD snapshot."
            }
        };

        packet.Parameters.AddRange(parameters);
        foreach (KeyValuePair<string, string> attribute in node.Attributes.OrderBy(a => a.Key, StringComparer.OrdinalIgnoreCase))
            packet.Attributes[attribute.Key] = attribute.Value;

        packet.FieldBindings.AddRange(rule.FieldResolutions.Select(r => new SelectedFieldBindingProjection
        {
            ParameterName = r.ParameterName,
            ParameterValue = r.ParameterValue,
            ReferencedField = r.ReferencedField,
            FieldExists = r.FieldExists,
            Confidence = r.Confidence,
            Source = r.Source
        }));

        foreach (IGrouping<int, AcTreeEdge> group in outgoingEdges.GroupBy(e => e.ActionListIndex).OrderBy(g => g.Key))
        {
            AcTreeEdge first = group.First();
            var actionList = new SelectedActionListProjection
            {
                OwnerRuleNodeId = rule.NodeId,
                StatusResult = BuildSelectedStatusResult(node, first, "StatusResultOwnsActionList"),
                ChildCount = group.Count()
            };

            foreach (AcTreeEdge edge in group)
            {
                AcTreeNode? child = scope.StructuralNodes.FirstOrDefault(n => n.NodeId == edge.ToNodeId);
                if (child != null)
                    actionList.Children.Add(BuildSelectedRulePointer(child));
            }

            packet.ActionLists.Add(actionList);
        }

        packet.References.AddRange(rule.Relationships.Select(r => new SelectedReferenceProjection
        {
            Kind = r.Kind,
            TargetType = r.TargetType,
            Target = r.Target,
            ParameterName = r.ParameterName,
            ParameterRole = r.ParameterRole,
            RuntimeDependency = IsRuntimeDependency(r),
            Confidence = r.Confidence,
            Evidence = r.Evidence ?? r.RelationshipReason
        }));

        packet.Diagnostics.AddRange(rule.Diagnostics.Select(d => new SelectedDiagnosticProjection
        {
            Severity = d.Severity,
            Category = d.Category,
            Message = d.Message
        }));

        bool selectedIsFallback = rule.Node.Attributes.ContainsKey("_FlatInventoryFallback");
        packet.Evidence.Add(new SelectedEvidenceProjection
        {
            Source = selectedIsFallback ? "AcRuleReport.Rules + FlatInventoryFallback" : "AcTreeReport.Nodes",
            Authority = selectedIsFallback
                ? "Search/display completeness for a flat inventory row that had no decoded structural placement"
                : "Hierarchy, selected rule identity, configured branch ownership, and disabled inheritance",
            Confidence = selectedIsFallback ? "Fallback" : "High",
            Caveat = selectedIsFallback
                ? "This fallback node preserves the rule for review, but parent rule, action list placement, and route order are not proven by the fallback edge."
                : "Static structural tree evidence does not prove the rule executed at runtime."
        });

        if (rule.FlatRule != null)
        {
            packet.Evidence.Add(new SelectedEvidenceProjection
            {
                Source = "AcRuleReport.Rules",
                Authority = "Flat inventory reconciliation, configured action names, and parameter tokens",
                Confidence = "High",
                Caveat = selectedIsFallback ? "Flat inventory is the authority for this fallback node; structural parent/action placement remains unresolved." : "Flat inventory confirms presence/searchability; structural tree remains authoritative for order and hierarchy."
            });
        }

        if (rule.Relationships.Count > 0)
        {
            packet.Evidence.Add(new SelectedEvidenceProjection
            {
                Source = "AcRelationshipReport.Relationships",
                Authority = "Static field/table/attribute/resource references",
                Confidence = "Medium",
                Caveat = "Relationship confidence must be reviewed before treating a reference as runtime dependency."
            });
        }

        packet.NotProven.Add("Native runtime execution was not simulated.");
        packet.NotProven.Add("Operator choices, keyer prompts, overrides, suspends, and AC Rules Tester outcomes are not proven by this static packet.");
        packet.NotProven.Add("Function catalog metadata is advisory when this FWD snapshot does not expose configured status results or parameter bindings.");
        return packet;
    }

private static IEnumerable<SelectedParameterProjection> BuildSelectedParameters(
        Dictionary<string, List<string>> structuralParameters,
        Dictionary<string, List<string>>? flatParameters)
    {
        var parameters = new Dictionary<string, SelectedParameterProjection>(StringComparer.OrdinalIgnoreCase);
        AddParameters(parameters, structuralParameters, "StructuralRuleNode", "High");
        if (flatParameters != null)
            AddParameters(parameters, flatParameters, "FlatInventory", "Medium");

        return parameters.Values.OrderBy(p => p.Name, StringComparer.OrdinalIgnoreCase);
    }

private static void AddParameters(
        Dictionary<string, SelectedParameterProjection> target,
        Dictionary<string, List<string>> source,
        string sourceName,
        string confidence)
    {
        foreach (KeyValuePair<string, List<string>> pair in source)
        {
            string name = pair.Key ?? string.Empty;
            if (string.IsNullOrWhiteSpace(name))
                continue;

            if (!target.TryGetValue(name, out SelectedParameterProjection? projection))
            {
                projection = new SelectedParameterProjection
                {
                    Name = name,
                    Source = sourceName,
                    Confidence = confidence
                };
                target[name] = projection;
            }
            else if (!RuleCorrelation.Contains(projection.Source, sourceName))
            {
                projection.Source += "+" + sourceName;
            }

            foreach (string value in pair.Value.Where(v => !string.IsNullOrWhiteSpace(v)))
            {
                if (!projection.Values.Contains(value, StringComparer.OrdinalIgnoreCase))
                    projection.Values.Add(value);
            }

            string sample = projection.Values.FirstOrDefault() ?? string.Empty;
            projection.Kind = InferParameterKind(name, sample);
        }
    }

private static SelectedRulePointer BuildSelectedRulePointer(AcTreeNode node)
    {
        return new SelectedRulePointer
        {
            NodeId = RuleCorrelation.NodeId(node),
            RawNodeId = node.NodeId,
            RuleGuid = node.RuleGuid,
            Name = node.RuleName,
            FunctionName = node.FunctionName
        };
    }

private static SelectedStatusResultProjection BuildSelectedStatusResult(AcTreeNode? owner, AcTreeEdge edge, string relationship)
    {
        return new SelectedStatusResultProjection
        {
            OwnerRuleNodeId = owner == null ? "node-" + edge.FromNodeId.ToString("000000") : RuleCorrelation.NodeId(owner),
            ActionListIndex = edge.ActionListIndex,
            Name = ActionLabel(edge),
            NameResolved = edge.ActionNameResolved || !string.IsNullOrWhiteSpace(edge.ActionName),
            RouteState = RouteState(edge),
            Relationship = relationship,
            Confidence = edge.Confidence,
            Evidence = edge.Evidence
        };
    }

private static object BuildFieldResolution(RuleModel rule)
    {
        int resolved = rule.FieldResolutions.Count(r => r.FieldExists);
        int unresolved = rule.FieldResolutions.Count - resolved;
        return new
        {
            summary = new
            {
                referenced = rule.FieldResolutions.Count,
                resolved,
                unresolved,
                caveat = "Field resolution is static catalog matching against extracted field metadata and is not runtime proof."
            },
            items = rule.FieldResolutions.Select(r => new
            {
                parameterName = r.ParameterName,
                parameterValue = r.ParameterValue,
                referencedField = r.ReferencedField,
                fieldExists = r.FieldExists,
                confidence = r.Confidence,
                source = r.Source,
                matches = r.Matches.Select(m => new
                {
                    name = m.Name,
                    scopeType = m.ScopeType,
                    scopeName = m.ScopeName,
                    fieldType = m.FieldType,
                    geometry = m.Geometry,
                    x = m.X,
                    y = m.Y,
                    width = m.Width,
                    height = m.Height,
                    source = m.Source
                }).ToList()
            }).ToList()
        };
    }

private object BuildRuleSubtree(WorkbenchSnapshot snapshot, RuleModel root, HttpListenerRequest request)
    {
        ScopeModel scope = snapshot.ScopesById[root.ScopeId];
        int maxDepth = Math.Max(0, GetInt(request, "maxDepth", 0));
        var byParent = scope.StructuralEdges.GroupBy(e => e.FromNodeId).ToDictionary(g => g.Key, g => g.Select(e => e.ToNodeId).ToList());
        var nodeById = scope.StructuralNodes.ToDictionary(n => n.NodeId);
        var selected = new HashSet<int>();
        var stack = new Stack<Tuple<int, int>>();
        stack.Push(Tuple.Create(root.Node.NodeId, 0));
        selected.Add(root.Node.NodeId);

        while (stack.Count > 0)
        {
            Tuple<int, int> item = stack.Pop();
            if (maxDepth > 0 && item.Item2 >= maxDepth) continue;
            if (!byParent.TryGetValue(item.Item1, out List<int>? children)) continue;

            foreach (int child in children)
            {
                if (selected.Add(child))
                    stack.Push(Tuple.Create(child, item.Item2 + 1));
            }
        }

        var nodes = selected.Where(nodeById.ContainsKey).Select(id => nodeById[id]).ToList();
        var edges = scope.StructuralEdges.Where(e => selected.Contains(e.FromNodeId) && selected.Contains(e.ToNodeId)).ToList();

        return new
        {
            rootNodeId = root.NodeId,
            summary = new
            {
                descendantCount = Math.Max(0, selected.Count - 1),
                returnedCount = selected.Count,
                maxDepth = maxDepth == 0 ? (int?)null : maxDepth,
                directDisabled = nodes.Count(n => n.DisabledState == AcDisabledStates.DisabledDirect),
                inheritedDisabled = nodes.Count(n => n.DisabledState == AcDisabledStates.DisabledInherited),
                truncatedByDepth = maxDepth > 0 && edges.Any(e => byParent.ContainsKey(e.ToNodeId))
            },
            nodes = nodes.Select(n => new { nodeId = RuleCorrelation.NodeId(n), name = n.RuleName, n.FunctionName, depth = n.HierarchyLevel, branch = BranchPayload(scope.StructuralEdges.FirstOrDefault(e => e.ToNodeId == n.NodeId)), disabled = DisabledPayload(n) }).ToList(),
            edges = edges.Select(EdgePayload).ToList()
        };
    }

private object BuildSearch(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string q = Get(request, "q") ?? Get(request, "term") ?? string.Empty;
        string? kind = Get(request, "kind");
        string? scopeId = Get(request, "scopeId");
        int limit = Math.Max(1, Math.Min(500, GetInt(request, "limit", 100)));
        var items = new List<object>(limit);
        int totalCount = 0;

        if (string.IsNullOrWhiteSpace(q))
            return new { query = q, count = 0, items, warning = "Pass ?q=..." };

        // Keep full match count while storing only up to the requested result limit.
        void AddItem(object item)
        {
            totalCount++;
            if (items.Count < limit)
                items.Add(item);
        }

        bool all = string.IsNullOrWhiteSpace(kind);
        IEnumerable<ScopeModel> scopes = snapshot.ScopesById.Values;
        if (!string.IsNullOrWhiteSpace(scopeId)) scopes = scopes.Where(s => RuleCorrelation.Eq(s.ScopeId, scopeId));

        if (all || RuleCorrelation.Eq(kind, "Scope"))
        {
            foreach (var item in scopes.Where(s => RuleCorrelation.Contains(s.Name, q) || RuleCorrelation.Contains(s.ScopeId, q)).Select(s => new
            {
                kind = "Scope",
                s.ScopeId,
                title = s.Name,
                subtitle = s.Kind + " · " + s.StructuralRuleCount + " structural rules",
                badges = BadgesForScope(s),
                evidenceClass = "ScopeSummary",
                isRuntimeDependency = false,
                link = "/api/v1/scopes/" + UrlEncode(s.ScopeId)
            })) AddItem(item);
        }

        if (all || RuleCorrelation.Eq(kind, "StructuralRule"))
        {
            foreach (var item in scopes.SelectMany(s => s.StructuralNodes.Where(n => n.IsRuleNode).Select(n => new { s, n }))
                .Where(x => RuleCorrelation.Contains(x.n.RuleName, q) || RuleCorrelation.Contains(x.n.FunctionName, q) || RuleCorrelation.Contains(x.n.RuleGuid, q))
                .Select(x => new
                {
                    kind = "StructuralRule",
                    x.s.ScopeId,
                    nodeId = RuleCorrelation.NodeId(x.n),
                    title = x.n.RuleName ?? x.n.FunctionName ?? RuleCorrelation.NodeId(x.n),
                    subtitle = (x.n.FunctionName ?? "(missing function)") + " · " + x.s.Name,
                    badges = BadgesForNode(x.n),
                    evidenceClass = "Structural",
                    isRuntimeDependency = false,
                    link = "/api/v1/rules/" + RuleCorrelation.NodeId(x.n)
                })) AddItem(item);
        }

        if (all || RuleCorrelation.Eq(kind, "FlatInventory"))
        {
            foreach (var item in scopes.SelectMany(s => s.FlatRules.Select(r => new { s, r }))
                .Where(x => RuleCorrelation.Contains(x.r.RuleName, q) || RuleCorrelation.Contains(x.r.FunctionName, q) || RuleCorrelation.Contains(x.r.RuleGuid, q))
                .Select(x => new
                {
                    kind = "FlatInventory",
                    x.s.ScopeId,
                    inventoryId = RuleCorrelation.InventoryId(x.r),
                    title = x.r.RuleName ?? x.r.FunctionName ?? RuleCorrelation.InventoryId(x.r),
                    subtitle = (x.r.FunctionName ?? "(missing function)") + " · " + x.s.Name,
                    badges = new[] { snapshot.RulesByStructuralKey.ContainsKey(RuleCorrelation.FlatKey(x.r)) ? "Structural match" : "Flat only" },
                    evidenceClass = "FlatInventory",
                    isRuntimeDependency = false,
                    link = "/api/v1/scopes/" + UrlEncode(x.s.ScopeId) + "/inventory"
                })) AddItem(item);
        }

        if (all || RuleCorrelation.Eq(kind, "Reference"))
        {
            foreach (var item in scopes.SelectMany(s => s.Relationships.Select(r => new { s, r }))
                .Where(x => RuleCorrelation.Contains(x.r.Target, q) || RuleCorrelation.Contains(x.r.Kind, q) || RuleCorrelation.Contains(x.r.TargetType, q))
                .Select(x => new
                {
                    kind = "Reference",
                    x.s.ScopeId,
                    title = x.r.Kind + " " + x.r.Target,
                    subtitle = (x.r.FunctionName ?? "(unknown function)") + " · " + x.r.TargetType,
                    badges = new[] { x.r.Confidence, IsRuntimeDependency(x.r) ? "Runtime dependency" : "Static mention" },
                    evidenceClass = x.r.Confidence,
                    isRuntimeDependency = IsRuntimeDependency(x.r),
                    link = "/api/v1/scopes/" + UrlEncode(x.s.ScopeId) + "/references"
                })) AddItem(item);
        }

        return new { query = q, kind, scopeId, count = totalCount, items };
    }
}
