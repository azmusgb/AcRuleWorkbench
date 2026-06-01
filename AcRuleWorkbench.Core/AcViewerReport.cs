using System.Collections.Generic;

namespace AcRuleWorkbench.Core;

public sealed class AcViewerReport
{
    public string FwdPath { get; set; } = string.Empty;

    public string OutputPath { get; set; } = string.Empty;

    public int ScopeCount { get; set; }

    public int RuleCount { get; set; }

    public int RelationshipCount { get; set; }

    public int FlowEdgeCount { get; set; }

    public bool OpenedBrowser { get; set; }

    public List<string> Warnings { get; } = new();
}
