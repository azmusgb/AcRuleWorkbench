namespace DllInteropHarness.Core;

public sealed class StcTraversalOptions
{
    public string? Path { get; set; }

    public string? ProcessName { get; set; }

    public int MaxDepth { get; set; } = 5;

    public int MaxNodes { get; set; } = 1500;

    public int MaxPreviewBytes { get; set; } = 256;

    public bool IncludeDataPreview { get; set; } = true;

    public bool IncludeDotNodes { get; set; } = false;

    public bool RequireNativeOk { get; set; }
}
