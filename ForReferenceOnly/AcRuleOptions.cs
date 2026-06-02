namespace DllInteropHarness.Core;

public sealed class AcRuleOptions
{
    public string? Path { get; set; }

    public bool RequireNativeOk { get; set; }

    public string ProcessName { get; set; } = "AC";

    public string? Term { get; set; }

    public string? Scope { get; set; }

    public string? Function { get; set; }

    public bool IncludeRawTokens { get; set; }

    public int MaxRawTokensPerScope { get; set; } = 250;

    public int MaxScopeCount { get; set; } = 0;
}
