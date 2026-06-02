namespace DllInteropHarness.Core;

public sealed class AcTraceOptions
{
    public string? Path { get; set; }

    public string ProcessName { get; set; } = "AC";

    public string? Term { get; set; }

    public string? Scope { get; set; }

    public string? Function { get; set; }

    public string? Field { get; set; }

    public string? Attr { get; set; }

    public string? RelationshipKind { get; set; }

    public bool IncludeRules { get; set; }

    public int MaxRelationships { get; set; } = 0;

    public bool RequireNativeOk { get; set; }
}
