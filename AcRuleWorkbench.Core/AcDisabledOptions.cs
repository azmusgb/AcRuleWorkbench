using System.Threading;

namespace AcRuleWorkbench.Core;

public sealed class AcDisabledOptions
{
    public string? Path { get; set; }

    public bool RequireNativeOk { get; set; }

    public string ProcessName { get; set; } = "AC";

    public string? Term { get; set; }

    public string? Scope { get; set; }

    public string? Function { get; set; }

    public string? State { get; set; }

    public bool IncludeRules { get; set; } = true;

    public bool InheritDisabled { get; set; } = true;

    public CancellationToken CancellationToken { get; set; } = CancellationToken.None;

}
