using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;

namespace AcRuleWorkbench.Api.V1;

internal sealed partial class WorkbenchApiService
{
    private ApiHttpResult BuildViewerBootstrap(HttpListenerRequest request)
    {
        string? path = GetSourcePathForStatus(request);
        string process = GetProcess(request);
        bool requireNativeOk = GetBool(request, "requireNativeOk", false);

        if (string.IsNullOrWhiteSpace(path))
            return Fail(request, "FwdPathRequired", "An FWD/CFD path is required before the viewer can bootstrap.", 400, null, "path", "Start with -FwdPath or pass ?path= when path override is enabled.");

        if (!File.Exists(path!))
            return Fail(request, "FwdPathNotFound", "The configured FWD/CFD path does not exist.", 404, path, "path", "Verify the -FwdPath value supplied to the launcher.");

        DateTime startedUtc = DateTime.UtcNow;
        LiveFwdSessionStatus live = _options.LiveLazyMode
            ? _liveSessionCache.GetOrOpen(path!, process, requireNativeOk)
            : BuildLiveSessionStatusFromSnapshot(GetSnapshot(request));

        Console.WriteLine("[API] viewer/bootstrap mode=" + (_options.LiveLazyMode ? "live-lazy" : "snapshot")
            + " fwd=" + Path.GetFileName(path!)
            + " process=" + (string.IsNullOrWhiteSpace(live.ProcessName) ? "<default>" : live.ProcessName)
            + " docs=" + live.DocumentCount
            + " pages=" + live.PageCount
            + " batches=" + live.BatchCount
            + " processes=" + live.ProcessCount
            + " pageVariants=" + live.PageVariantCount
            + " elapsedMs=" + (long)(DateTime.UtcNow - startedUtc).TotalMilliseconds);

        return Ok(request, "AcWorkbench.ViewerBootstrap", BuildViewerBootstrapPayload(live), snapshotOverride: null);
    }

    private static LiveFwdSessionStatus BuildLiveSessionStatusFromSnapshot(WorkbenchSnapshot snapshot)
    {
        return new LiveFwdSessionStatus
        {
            SourcePath = snapshot.FwdPath,
            ProcessName = snapshot.Rules.ProcessName,
            OpenedAtUtc = snapshot.GeneratedAtUtc,
            OpenDurationMs = snapshot.BuildDurationMs,
            ReleaseString = snapshot.Fwd.ReleaseString,
            ReleaseDateString = snapshot.Fwd.ReleaseDateString,
            ReleaseNumber = snapshot.Fwd.ReleaseNumber,
            DocumentCount = snapshot.Fwd.Documents.Count,
            PageCount = snapshot.Fwd.Pages.Count,
            BatchCount = snapshot.Fwd.Batches.Count,
            ProcessCount = snapshot.Fwd.Processes.Count,
            PageVariantCount = snapshot.Fwd.PageVariants.Sum(p => p.Variants.Count),
            Documents = snapshot.Fwd.Documents.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray(),
            Pages = snapshot.Fwd.Pages.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray(),
            Batches = snapshot.Fwd.Batches.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray(),
            Processes = snapshot.Fwd.Processes.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray(),
            PageVariants = snapshot.Fwd.PageVariants
                .OrderBy(x => x.Page, StringComparer.OrdinalIgnoreCase)
                .Select(x => new LivePageVariantStatus
                {
                    Page = x.Page,
                    Variants = x.Variants.OrderBy(v => v, StringComparer.OrdinalIgnoreCase).ToArray()
                })
                .ToArray(),
            Warnings = Array.Empty<string>()
        };
    }

    private static object BuildViewerBootstrapPayload(LiveFwdSessionStatus live)
    {
        var scopes = new List<object>();
        AddScopes(scopes, "Document", live.Documents);
        AddScopes(scopes, "Page", live.Pages);
        AddScopes(scopes, "Process", live.Processes);
        AddScopes(scopes, "Batch", live.Batches);

        if (scopes.Count == 0)
        {
            scopes.Add(new
            {
                ScopePath = "FWD/Live",
                ScopeName = "Live FWD Session",
                ScopeType = "FWD",
                Source = "LiveFwdSession",
                Lazy = true
            });
        }

        var diagnostics = live.Warnings.Select((warning, index) => new
        {
            Severity = "Warning",
            Code = "LiveFwdSessionWarning",
            Title = "Live FWD session warning",
            Message = warning,
            Detail = warning,
            ScopePath = "FWD/Live",
            NodeId = "",
            Sequence = index
        }).ToArray();

        object rulesData = new
        {
            ProcessName = live.ProcessName,
            Rules = Array.Empty<object>(),
            Diagnostics = diagnostics,
            Bootstrap = new
            {
                mode = "live-lazy",
                fullSnapshotPrebuilt = false,
                caveat = "This is a lightweight viewer bootstrap. Rule trees and global-resource details hydrate from API endpoints on demand."
            }
        };

        object relData = new
        {
            Relationships = Array.Empty<object>(),
            Diagnostics = Array.Empty<object>(),
            Bootstrap = new { mode = "live-lazy" }
        };

        object treeData = new
        {
            Scopes = scopes,
            Nodes = Array.Empty<object>(),
            Edges = Array.Empty<object>(),
            Diagnostics = diagnostics,
            Bootstrap = new
            {
                mode = "live-lazy",
                fullSnapshotPrebuilt = false,
                scopeCount = scopes.Count
            }
        };

        object fwdData = new
        {
            overview = new
            {
                source = new
                {
                    path = live.SourcePath,
                    process = live.ProcessName,
                    readMode = "read-only",
                    snapshotStrategy = "live-lazy",
                    release = live.ReleaseString,
                    releaseDate = live.ReleaseDateString,
                    releaseNumber = live.ReleaseNumber
                },
                counts = new
                {
                    documents = live.DocumentCount,
                    pages = live.PageCount,
                    batches = live.BatchCount,
                    processes = live.ProcessCount,
                    pageVariants = live.PageVariantCount,
                    scopes = scopes.Count,
                    structuralRules = 0,
                    flatInventoryRows = 0,
                    relationships = 0,
                    diagnostics = live.Warnings.Count
                }
            },
            documents = new { count = live.Documents.Count, items = live.Documents.Select(name => new { name }).ToArray() },
            pages = new { count = live.Pages.Count, items = live.Pages.Select(name => new { name }).ToArray() },
            batches = new { count = live.Batches.Count, items = live.Batches.Select(name => new { name }).ToArray() },
            processes = new { count = live.Processes.Count, items = live.Processes.Select(name => new { name, source = "Fwd.ProcessNames", canonical = true }).ToArray() },
            pageVariants = new { count = live.PageVariantCount, items = live.PageVariants.Select(v => new { page = v.Page, variants = v.Variants }).ToArray() },
            ruleLists = new { count = 0, items = Array.Empty<object>(), lazy = true },
            functions = new { count = 0, items = Array.Empty<object>(), lazy = true },
            tables = new { count = 0, items = Array.Empty<object>(), lazy = true },
            selectionLists = new { count = 0, items = Array.Empty<object>(), lazy = true },
            udfs = new { count = 0, items = Array.Empty<object>(), lazy = true },
            resources = new { count = 0, items = Array.Empty<object>(), lazy = true }
        };

        Console.WriteLine("[API] viewer/bootstrap payload scopes=" + scopes.Count
            + " rules=0 nodes=0 edges=0 relationships=0"
            + " diagnostics=" + diagnostics.Length
            + " note=live-lazy-bootstrap-only");

        return new
        {
            mode = "live-lazy",
            source = new
            {
                path = live.SourcePath,
                process = live.ProcessName,
                openedAtUtc = live.OpenedAtUtc,
                openDurationMs = live.OpenDurationMs
            },
            counts = new
            {
                documents = live.DocumentCount,
                pages = live.PageCount,
                batches = live.BatchCount,
                processes = live.ProcessCount,
                pageVariants = live.PageVariantCount,
                scopes = scopes.Count
            },
            rulesData,
            relData,
            treeData,
            fwdData
        };
    }

    private static void AddScopes(List<object> scopes, string kind, IReadOnlyList<string> names)
    {
        foreach (string name in names.Where(n => !string.IsNullOrWhiteSpace(n)).OrderBy(n => n, StringComparer.OrdinalIgnoreCase))
        {
            scopes.Add(new
            {
                ScopePath = kind + "/" + name,
                ScopeName = name,
                ScopeType = kind,
                Source = "LiveFwdSession",
                Lazy = true
            });
        }
    }
}
