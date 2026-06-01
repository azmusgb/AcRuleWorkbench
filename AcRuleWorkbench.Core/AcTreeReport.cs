using System.Collections.Generic;
using System.Linq;

namespace AcRuleWorkbench.Core;

public sealed class AcTreeReport
{
    public string FwdPath { get; set; } = string.Empty;

    public string ProcessName { get; set; } = "AC";

    public int ScopeCount { get; set; }

    public int NodeCount { get; set; }

    public int RuleNodeCount { get; set; }

    public int EdgeCount { get; set; }

    public int DirectDisabledCount { get; set; }

    public int InheritedDisabledCount { get; set; }

    public int MaxHierarchyLevel { get; set; }

    public int NonRuleTreeScopeCount { get; set; }

    public int DiagnosticCount { get; set; }

    public List<AcTreeScopeReport> Scopes { get; } = new();

    public List<AcTreeNode> Nodes { get; } = new();

    public List<AcTreeEdge> Edges { get; } = new();

    public List<AcTreeDiagnostic> Diagnostics { get; } = new();

    public List<string> Warnings { get; } = new();

    public void RebuildCounts()
    {
        ScopeCount = Scopes.Count;
        NodeCount = Nodes.Count;
        RuleNodeCount = Nodes.Count(n => n.IsRuleNode);
        EdgeCount = Edges.Count;
        DirectDisabledCount = Nodes.Count(n => n.DisabledState == AcDisabledStates.DisabledDirect);
        InheritedDisabledCount = Nodes.Count(n => n.DisabledState == AcDisabledStates.DisabledInherited);
        MaxHierarchyLevel = Nodes.Count == 0 ? 0 : Nodes.Max(n => n.HierarchyLevel);
        NonRuleTreeScopeCount = Diagnostics.Count(d => string.Equals(d.Category, "NotRuleTreePayload", System.StringComparison.OrdinalIgnoreCase));
        DiagnosticCount = Diagnostics.Count;

        foreach (AcTreeScopeReport scope in Scopes)
        {
            var scopeNodes = Nodes.Where(n => n.ScopePath == scope.ScopePath).ToList();
            scope.NodeCount = scopeNodes.Count;
            scope.RuleNodeCount = scopeNodes.Count(n => n.IsRuleNode);
            scope.EdgeCount = Edges.Count(e => string.Equals(e.ScopePath, scope.ScopePath, System.StringComparison.OrdinalIgnoreCase));
            scope.DirectDisabledCount = scopeNodes.Count(n => n.DisabledState == AcDisabledStates.DisabledDirect);
            scope.InheritedDisabledCount = scopeNodes.Count(n => n.DisabledState == AcDisabledStates.DisabledInherited);
            scope.MaxHierarchyLevel = scopeNodes.Count == 0 ? 0 : scopeNodes.Max(n => n.HierarchyLevel);
        }
    }
}

public sealed class AcTreeScopeReport
{
    public string ScopePath { get; set; } = string.Empty;

    public string ScopeType { get; set; } = string.Empty;

    public string ScopeName { get; set; } = string.Empty;

    public int NodeCount { get; set; }

    public int RuleNodeCount { get; set; }

    public int EdgeCount { get; set; }

    public int DirectDisabledCount { get; set; }

    public int InheritedDisabledCount { get; set; }

    public int MaxHierarchyLevel { get; set; }

    public List<string> Warnings { get; } = new();
}

public sealed class AcTreeNode
{
    public int NodeId { get; set; }

    public int ParentNodeId { get; set; }

    public int ActionListIndex { get; set; }

    public int HierarchyLevel { get; set; }

    public int RuleIndexWithinScope { get; set; }

    public string ScopePath { get; set; } = string.Empty;

    public string ScopeType { get; set; } = string.Empty;

    public string ScopeName { get; set; } = string.Empty;

    public bool IsRuleNode { get; set; }

    public string? RuleGuid { get; set; }

    public string? RuleId { get; set; }

    public string? RuleName { get; set; }

    public string? FunctionName { get; set; }

    public string? FunctionVersion { get; set; }

    public string? Description { get; set; }

    public string RuleListPath { get; set; } = "Root";

    public List<string> ActionNames { get; } = new();

    public List<string> Sources { get; } = new();

    public Dictionary<string, List<string>> Parameters { get; } = new();

    public Dictionary<string, string> Attributes { get; } = new();

    public string DisabledState { get; set; } = AcDisabledStates.Enabled;

    public string DisabledConfidence { get; set; } = "High";

    public string? DisabledReason { get; set; }

    public int? DisabledAncestorNodeId { get; set; }

    public string? DisabledAncestorRuleGuid { get; set; }

    public string? DisabledAncestorRuleName { get; set; }

    public List<string> DisabledEvidence { get; } = new();
}

public sealed class AcTreeEdge
{
    public string ScopePath { get; set; } = string.Empty;

    public int FromNodeId { get; set; }

    public int ToNodeId { get; set; }

    public string EdgeKind { get; set; } = "ActionSubListChild";

    public int ActionListIndex { get; set; }

    public string? ActionName { get; set; }

    public bool ActionNameResolved { get; set; }

    public string Confidence { get; set; } = "Proven";

    public string Evidence { get; set; } = string.Empty;
}

public sealed class AcTreeDiagnostic
{
    public string Severity { get; set; } = "Info";

    public string ScopePath { get; set; } = string.Empty;

    public int? NodeId { get; set; }

    public string Category { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;
}
