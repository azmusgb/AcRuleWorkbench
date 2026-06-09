using System;
using System.Collections.Generic;
using AcRuleWorkbench.Core;

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
    /// Allows HttpListener prefixes that bind outside loopback. Keep false unless the server is behind
    /// trusted network controls. Sensitive controls still require AllowUnsafeRemoteControls.
    /// </summary>
    public bool AllowRemoteBindings { get; set; }

    /// <summary>
    /// Allows debug API, CORS, refresh, or ?path= controls on a non-loopback listener.
    /// Requires AllowRemoteBindings and should be avoided for normal workbench use.
    /// </summary>
    public bool AllowUnsafeRemoteControls { get; set; }

    /// <summary>
    /// Redacts full local paths, machine names, and raw exception details from non-debug responses.
    /// </summary>
    public bool RedactOperationalDetails { get; set; } = true;

    /// <summary>Optional allowlist of directories that request-level/source FWD paths may resolve under.</summary>
    public List<string> AllowedFwdPathRoots { get; } = new List<string>();

    /// <summary>Optional allowlist of process names accepted by snapshot/live-session caches.</summary>
    public List<string> AllowedProcessNames { get; } = new List<string>();

    /// <summary>Maximum number of distinct full snapshot builds allowed to run at once.</summary>
    public int MaxPendingSnapshotBuilds { get; set; } = 4;

    /// <summary>Maximum number of distinct live FWD session opens allowed to run at once.</summary>
    public int MaxPendingLiveSessionBuilds { get; set; } = 4;

    /// <summary>Maximum number of live session keys kept warm in memory.</summary>
    public int MaxCachedLiveSessions { get; set; } = 8;

    /// <summary>
    /// When true, API v1 rebuilds a fresh snapshot for each request path that needs extraction data
    /// instead of reusing cached snapshot state.
    /// </summary>
    public bool DisableSnapshotCache { get; set; }

    /// <summary>
    /// When true, startup performs only a minimal read-only FWD open/catalog probe and
    /// defers full snapshot extraction until an endpoint explicitly needs it.
    /// </summary>
    public bool LiveLazyMode { get; set; } = true;

    /// <summary>When true, startup also pre-builds the complete normalized snapshot in the background.</summary>
    public bool StartupSnapshotWarmup { get; set; }

    /// <summary>Controls how much FWD global-resource evidence is traversed into API snapshots.</summary>
    public EvidenceExportProfile EvidenceExportProfile { get; set; } = EvidenceExportProfile.ViewerSafe;

    public bool ShouldExposeOperationalDetails => EnableDebugApi || !RedactOperationalDetails;

    public int EffectiveMaxPendingSnapshotBuilds => Math.Max(1, MaxPendingSnapshotBuilds);

    public int EffectiveMaxPendingLiveSessionBuilds => Math.Max(1, MaxPendingLiveSessionBuilds);

    public int EffectiveMaxCachedLiveSessions => Math.Max(1, MaxCachedLiveSessions);
}
