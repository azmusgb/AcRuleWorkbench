using System.Threading;

namespace AcRuleWorkbench.Core;

public sealed class SmokeOptions
{
    public string? FwdPath { get; set; }

    public string? OcrPath { get; set; }

    public bool RequireNativeOk { get; set; } = true;

    public CancellationToken CancellationToken { get; set; } = CancellationToken.None;

}
