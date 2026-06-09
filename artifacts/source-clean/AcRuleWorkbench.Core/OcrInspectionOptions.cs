using System.Threading;

namespace AcRuleWorkbench.Core;

public sealed class OcrInspectionOptions
{
    public string? Path { get; set; }

    public bool RequireNativeOk { get; set; }

    public CancellationToken CancellationToken { get; set; } = CancellationToken.None;

}
