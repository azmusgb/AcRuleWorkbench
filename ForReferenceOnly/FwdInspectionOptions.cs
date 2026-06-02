namespace DllInteropHarness.Core;

public sealed class FwdInspectionOptions
{
    public string? Path { get; set; }

    public bool IncludeFields { get; set; }

    public bool RequireNativeOk { get; set; }

    public string[] ResourceTypes { get; set; } =
    {
        "Tables",
        "SelectionLists",
        "Functions",
        "UDFs",
        "Rules",
        "GlobalResources"
    };
}
