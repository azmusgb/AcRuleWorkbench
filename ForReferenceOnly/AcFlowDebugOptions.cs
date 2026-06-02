namespace DllInteropHarness.Core;

public sealed class AcFlowDebugOptions
{
    public string? Path { get; set; }

    public string ProcessName { get; set; } = "AC";

    public string? Scope { get; set; }

    public string? Term { get; set; }

    public int? FromRuleIndex { get; set; }

    public string? FromRuleGuid { get; set; }

    public int MaxRules { get; set; } = 25;

    public int MaxRawTokensPerRule { get; set; } = 80;

    public int MaxRawTokensPerScope { get; set; } = 400;

    public bool RequireNativeOk { get; set; }
}
