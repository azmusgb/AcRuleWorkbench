namespace DllInteropHarness.Core;

public sealed class AcFlowOptions
{
    public string? Path { get; set; }

    public string ProcessName { get; set; } = "AC";

    public string? Scope { get; set; }

    public string? Term { get; set; }

    public int? FromRuleIndex { get; set; }

    public string? FromRuleGuid { get; set; }

    public bool IncludeHeuristicSequence { get; set; } = true;

    public bool RequireNativeOk { get; set; }
}
