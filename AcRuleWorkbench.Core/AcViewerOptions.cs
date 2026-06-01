namespace AcRuleWorkbench.Core;

public sealed class AcViewerOptions
{
    public string? Path { get; set; }

    public string ProcessName { get; set; } = "AC";

    public string? OutputPath { get; set; }

    public string? Scope { get; set; }

    public string? Term { get; set; }

    public string? Function { get; set; }

    public bool OpenBrowser { get; set; }

    public bool RequireNativeOk { get; set; }
}
