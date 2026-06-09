using System.Threading;

namespace AcRuleWorkbench.Core;

public sealed class FipInspectionOptions
{
    public string? Path { get; set; }

    public string ProcessName { get; set; } = "FIP";

    public string? Page { get; set; }

    public string? Variant { get; set; }

    public int MaxVariants { get; set; } = 50;

    public bool RequireNativeOk { get; set; }

    public CancellationToken CancellationToken { get; set; } = CancellationToken.None;

}
