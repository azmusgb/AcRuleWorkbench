using System.Collections.Generic;

namespace AcRuleWorkbench.Core;

public sealed class StcTreeReport
{
    public string FwdPath { get; set; } = string.Empty;

    public string ProcessName { get; set; } = string.Empty;

    public int MaxDepth { get; set; }

    public int MaxNodes { get; set; }

    public int VisitedNodeCount { get; set; }

    public bool Truncated { get; set; }

    public List<StcNodeSummary> Nodes { get; } = new();

    public List<string> Warnings { get; } = new();
}

public sealed class StcNodeSummary
{
    public string Path { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public int Depth { get; set; }

    public bool? IsCollection { get; set; }

    public int? ChildCount { get; set; }

    public int? DataLength { get; set; }

    public string? DataPreviewText { get; set; }

    public string? DataPreviewHex { get; set; }

    public string? ValuePreview { get; set; }

    public List<string> Warnings { get; } = new();
}
