namespace DllInteropHarness;

internal sealed class LocalApiServerOptions
{
    public string Prefix { get; set; } = "http://127.0.0.1:8787/";

    public string? DefaultFwdPath { get; set; }

    public string? ViewerPath { get; set; }

    public bool OpenBrowser { get; set; }

    public bool EnableCors { get; set; } = true;

    public bool AllowMutatingCommands { get; set; }

    public bool EnableDebugApi { get; set; }
}
