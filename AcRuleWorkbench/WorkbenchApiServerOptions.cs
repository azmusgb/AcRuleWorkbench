namespace AcRuleWorkbench;

internal sealed class WorkbenchApiServerOptions
{
    public string Prefix { get; set; } = "http://127.0.0.1:8787/";

    public string? DefaultFwdPath { get; set; }

    public string? ViewerPath { get; set; }

    public bool OpenBrowser { get; set; }

    public bool EnableCors { get; set; }

    public bool AllowMutatingCommands { get; set; }

    public bool EnableDebugApi { get; set; }

    /// <summary>
    /// Allows request-level ?path=... overrides. Production mode should pass --path at startup and keep this false.
    /// Diagnostic/debug mode may enable it explicitly with --allow-path-query.
    /// </summary>
    public bool AllowPathQuery { get; set; }

    /// <summary>
    /// When true, API v1 rebuilds a fresh snapshot for each request path that needs extraction data
    /// instead of reusing cached snapshot state.
    /// </summary>
    public bool DisableSnapshotCache { get; set; }
}
