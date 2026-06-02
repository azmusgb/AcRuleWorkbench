using System;
using System.Collections.Generic;
using System.Linq;
using DllInteropHarness.Core;

namespace DllInteropHarness.Api.V1;

internal sealed class WorkbenchSnapshot
{
    public string SnapshotId { get; set; } = string.Empty;
    public DateTime GeneratedAtUtc { get; set; }
    public long BuildDurationMs { get; set; }
    public string FwdPath { get; set; } = string.Empty;
    public FwdInspectionReport Fwd { get; set; } = new FwdInspectionReport();
    public AcRuleReport Rules { get; set; } = new AcRuleReport();
    public AcTreeReport Tree { get; set; } = new AcTreeReport();
    public AcRelationshipReport Relationships { get; set; } = new AcRelationshipReport();
    public AcDiagnosticsReport Diagnostics { get; set; } = new AcDiagnosticsReport();
    public Dictionary<string, ScopeModel> ScopesById { get; set; } = new Dictionary<string, ScopeModel>(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, RuleModel> RulesByNodeId { get; set; } = new Dictionary<string, RuleModel>(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, RuleModel> RulesByStructuralKey { get; set; } = new Dictionary<string, RuleModel>(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, List<AcRuleSummary>> FlatRulesByScopeId { get; set; } = new Dictionary<string, List<AcRuleSummary>>(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, List<AcRuleRelationship>> RelationshipsByScopeId { get; set; } = new Dictionary<string, List<AcRuleRelationship>>(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, List<AcTreeDiagnostic>> TreeDiagnosticsByScopeId { get; set; } = new Dictionary<string, List<AcTreeDiagnostic>>(StringComparer.OrdinalIgnoreCase);
}

internal sealed class ScopeModel
{
    public string ScopeId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public int StructuralRuleCount { get; set; }
    public int FlatInventoryCount { get; set; }
    public int FlatOnlyCount { get; set; }
    public int DirectDisabledCount { get; set; }
    public int InheritedDisabledCount { get; set; }
    public int ReferenceCount { get; set; }
    public int DiagnosticCount { get; set; }
    public List<AcTreeNode> StructuralNodes { get; } = new List<AcTreeNode>();
    public List<AcTreeEdge> StructuralEdges { get; } = new List<AcTreeEdge>();
    public List<AcRuleSummary> FlatRules { get; } = new List<AcRuleSummary>();
    public List<AcRuleRelationship> Relationships { get; } = new List<AcRuleRelationship>();
    public List<AcTreeDiagnostic> TreeDiagnostics { get; } = new List<AcTreeDiagnostic>();
}

internal sealed class RuleModel
{
    public string NodeId { get; set; } = string.Empty;
    public string ScopeId { get; set; } = string.Empty;
    public AcTreeNode Node { get; set; } = new AcTreeNode();
    public AcRuleSummary? FlatRule { get; set; }
    public List<AcRuleRelationship> Relationships { get; } = new List<AcRuleRelationship>();
    public List<AcTreeDiagnostic> Diagnostics { get; } = new List<AcTreeDiagnostic>();
}

internal static class WorkbenchSnapshotBuilder
{
    public static WorkbenchSnapshot Build(IDllClient client, string fwdPath, string processName, bool requireNativeOk)
    {
        if (client == null) throw new ArgumentNullException(nameof(client));
        if (string.IsNullOrWhiteSpace(fwdPath)) throw new ArgumentException("FWD/CFD path is required.", nameof(fwdPath));

        var started = DateTime.UtcNow;
        var fwd = client.Inspect(new FwdInspectionOptions { Path = fwdPath, IncludeFields = true, RequireNativeOk = requireNativeOk });
        var rules = client.InspectAcRules(new AcRuleOptions { Path = fwdPath, ProcessName = processName, RequireNativeOk = requireNativeOk });
        var tree = client.BuildAcTree(new AcTreeOptions
        {
            Path = fwdPath,
            ProcessName = processName,
            IncludeAttributes = true,
            MaxAttributeValueLength = 500,
            MaxHierarchyDepth = 256,
            MaxNodeEntryCount = 100000u,
            MaskSensitiveValues = true,
            RequireNativeOk = requireNativeOk
        });
        var relationships = client.TraceAcRelationships(new AcTraceOptions { Path = fwdPath, ProcessName = processName, IncludeRules = false, RequireNativeOk = requireNativeOk });
        var diagnostics = client.BuildAcDiagnostics(new AcRuleOptions { Path = fwdPath, ProcessName = processName, RequireNativeOk = requireNativeOk });
        var completed = DateTime.UtcNow;

        var snapshot = new WorkbenchSnapshot
        {
            SnapshotId = "fwd-" + completed.ToString("yyyyMMdd-HHmmss") + "-" + Math.Abs((fwd.Path ?? fwdPath).ToLowerInvariant().GetHashCode()),
            GeneratedAtUtc = completed,
            BuildDurationMs = (long)(completed - started).TotalMilliseconds,
            FwdPath = fwd.Path ?? fwdPath,
            Fwd = fwd,
            Rules = rules,
            Tree = tree,
            Relationships = relationships,
            Diagnostics = diagnostics
        };

        IndexSnapshot(snapshot);
        return snapshot;
    }

    private static void IndexSnapshot(WorkbenchSnapshot snapshot)
    {
        var scopes = new Dictionary<string, ScopeModel>(StringComparer.OrdinalIgnoreCase);
        var structuralKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (AcTreeNode node in snapshot.Tree.Nodes)
        {
            string scopeId = RuleCorrelation.ScopeId(node);
            ScopeModel scope = GetOrCreateScope(scopes, scopeId, node.ScopeName, node.ScopeType);
            scope.StructuralNodes.Add(node);
            if (node.IsRuleNode)
            {
                scope.StructuralRuleCount++;
                structuralKeys.Add(RuleCorrelation.StructuralKey(node));
            }

            if (node.DisabledState == AcDisabledStates.DisabledDirect) scope.DirectDisabledCount++;
            if (node.DisabledState == AcDisabledStates.DisabledInherited) scope.InheritedDisabledCount++;
        }

        foreach (AcTreeEdge edge in snapshot.Tree.Edges)
        {
            string scopeId = RuleCorrelation.NormalizeScopeId(edge.ScopePath);
            ScopeModel scope = GetOrCreateScope(scopes, scopeId, LastSegment(scopeId), "Unknown");
            scope.StructuralEdges.Add(edge);
        }

        foreach (AcRuleSummary rule in snapshot.Rules.Rules)
        {
            string scopeId = RuleCorrelation.ScopeId(rule);
            ScopeModel scope = GetOrCreateScope(scopes, scopeId, rule.ScopeName, rule.ScopeType);
            scope.FlatRules.Add(rule);
            scope.FlatInventoryCount++;
            if (!structuralKeys.Contains(RuleCorrelation.FlatKey(rule)))
                scope.FlatOnlyCount++;

            if (!snapshot.FlatRulesByScopeId.TryGetValue(scopeId, out List<AcRuleSummary>? flatList))
            {
                flatList = new List<AcRuleSummary>();
                snapshot.FlatRulesByScopeId[scopeId] = flatList;
            }

            flatList.Add(rule);
        }

        foreach (AcRuleRelationship relationship in snapshot.Relationships.Relationships)
        {
            string scopeId = RuleCorrelation.ScopeId(relationship.ScopePath, relationship.ScopeType, relationship.ScopeName);
            ScopeModel scope = GetOrCreateScope(scopes, scopeId, relationship.ScopeName, relationship.ScopeType);
            scope.Relationships.Add(relationship);
            scope.ReferenceCount++;

            if (!snapshot.RelationshipsByScopeId.TryGetValue(scopeId, out List<AcRuleRelationship>? relList))
            {
                relList = new List<AcRuleRelationship>();
                snapshot.RelationshipsByScopeId[scopeId] = relList;
            }

            relList.Add(relationship);
        }

        foreach (AcTreeDiagnostic diagnostic in snapshot.Tree.Diagnostics)
        {
            string scopeId = RuleCorrelation.NormalizeScopeId(diagnostic.ScopePath);
            ScopeModel scope = GetOrCreateScope(scopes, scopeId, LastSegment(scopeId), "Unknown");
            scope.TreeDiagnostics.Add(diagnostic);
            scope.DiagnosticCount++;

            if (!snapshot.TreeDiagnosticsByScopeId.TryGetValue(scopeId, out List<AcTreeDiagnostic>? diagList))
            {
                diagList = new List<AcTreeDiagnostic>();
                snapshot.TreeDiagnosticsByScopeId[scopeId] = diagList;
            }

            diagList.Add(diagnostic);
        }

        snapshot.ScopesById = scopes;

        var flatByKey = snapshot.Rules.Rules
            .GroupBy(RuleCorrelation.FlatKey, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        foreach (AcTreeNode node in snapshot.Tree.Nodes.Where(n => n.IsRuleNode))
        {
            string nodeId = RuleCorrelation.NodeId(node);
            string scopeId = RuleCorrelation.ScopeId(node);
            string key = RuleCorrelation.StructuralKey(node);

            var model = new RuleModel
            {
                NodeId = nodeId,
                ScopeId = scopeId,
                Node = node,
                FlatRule = flatByKey.TryGetValue(key, out AcRuleSummary? flat) ? flat : null
            };

            if (snapshot.RelationshipsByScopeId.TryGetValue(scopeId, out List<AcRuleRelationship>? rels))
            {
                foreach (AcRuleRelationship relationship in rels.Where(r => RelationshipMatchesNode(r, node)))
                    model.Relationships.Add(relationship);
            }

            if (snapshot.TreeDiagnosticsByScopeId.TryGetValue(scopeId, out List<AcTreeDiagnostic>? diags))
            {
                foreach (AcTreeDiagnostic diagnostic in diags.Where(d => d.NodeId == node.NodeId))
                    model.Diagnostics.Add(diagnostic);
            }

            snapshot.RulesByNodeId[nodeId] = model;
            snapshot.RulesByStructuralKey[key] = model;
        }

        ResolveEdgeActionNamesFromFlatInventory(snapshot);
    }

    private static void ResolveEdgeActionNamesFromFlatInventory(WorkbenchSnapshot snapshot)
    {
        foreach (ScopeModel scope in snapshot.ScopesById.Values)
        {
            foreach (AcTreeEdge edge in scope.StructuralEdges)
            {
                if (edge.ActionNameResolved || edge.ActionListIndex < 0)
                    continue;

                string parentNodeId = "node-" + edge.FromNodeId.ToString("000000");
                if (!snapshot.RulesByNodeId.TryGetValue(parentNodeId, out RuleModel? parentRule))
                    continue;

                List<string>? names = parentRule.FlatRule?.ActionNames;
                if (names == null || edge.ActionListIndex >= names.Count)
                    continue;

                string value = names[edge.ActionListIndex];
                if (string.IsNullOrWhiteSpace(value))
                    continue;

                edge.ActionName = value.Trim();
                edge.ActionNameResolved = true;
                edge.Evidence = string.IsNullOrWhiteSpace(edge.Evidence)
                    ? "Action label resolved from matched flat rule inventory ActionNames."
                    : edge.Evidence + " Action label resolved from matched flat rule inventory ActionNames.";
            }
        }
    }

    private static ScopeModel GetOrCreateScope(Dictionary<string, ScopeModel> scopes, string scopeId, string name, string kind)
    {
        if (string.IsNullOrWhiteSpace(scopeId)) scopeId = "AC/Unknown";
        if (!scopes.TryGetValue(scopeId, out ScopeModel? scope))
        {
            scope = new ScopeModel
            {
                ScopeId = scopeId,
                Name = string.IsNullOrWhiteSpace(name) ? LastSegment(scopeId) : name,
                Kind = string.IsNullOrWhiteSpace(kind) ? InferKind(scopeId) : kind
            };
            scopes[scopeId] = scope;
        }

        return scope;
    }

    private static bool RelationshipMatchesNode(AcRuleRelationship relationship, AcTreeNode node)
    {
        if (!string.IsNullOrWhiteSpace(node.RuleGuid) && RuleCorrelation.Eq(relationship.RuleGuid, node.RuleGuid)) return true;
        if (relationship.RuleIndex == node.RuleIndexWithinScope && RuleCorrelation.Eq(relationship.FunctionName, node.FunctionName)) return true;
        if (relationship.RuleIndex == node.RuleIndexWithinScope && RuleCorrelation.Eq(relationship.RuleName, node.RuleName)) return true;
        return false;
    }

    private static string LastSegment(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "Unknown";
        string[] parts = value.Trim('/').Split('/');
        return parts.Length == 0 ? value : parts[parts.Length - 1];
    }

    private static string InferKind(string scopeId)
    {
        if (scopeId.IndexOf("/Pages/", StringComparison.OrdinalIgnoreCase) >= 0) return "Page";
        if (scopeId.IndexOf("/Documents/", StringComparison.OrdinalIgnoreCase) >= 0) return "Document";
        if (scopeId.IndexOf("/Batches/", StringComparison.OrdinalIgnoreCase) >= 0) return "Batch";
        return "Unknown";
    }
}
