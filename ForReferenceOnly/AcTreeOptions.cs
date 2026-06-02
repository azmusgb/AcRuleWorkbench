namespace DllInteropHarness.Core;

public sealed class AcTreeOptions
{
    public string? Path { get; set; }

    public string ProcessName { get; set; } = "AC";

    public string? Scope { get; set; }

    public string? Term { get; set; }

    public bool IncludeAttributes { get; set; }

    public int MaxAttributeValueLength { get; set; } = 500;

    public int MaxHierarchyDepth { get; set; } = 256;

    public uint MaxNodeEntryCount { get; set; } = 100000;

    public uint MaxAttrListPayloadBytes { get; set; } = 10 * 1024 * 1024;

    public bool MaskSensitiveValues { get; set; } = true;

    public bool RequireNativeOk { get; set; }
}
