using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text.RegularExpressions;
using System.Text;
using Newtonsoft.Json;
using AcRuleWorkbench.Api;
using AcRuleWorkbench.Api.V1.Contracts;
using AcRuleWorkbench.Core;

namespace AcRuleWorkbench.Api.V1;

internal sealed partial class WorkbenchApiService
{
    private readonly IFormWorksExtractionClient _client;
    private readonly WorkbenchSnapshotCache _cache;
    private readonly LiveFwdSessionCache _liveSessionCache;
    private readonly WorkbenchApiServerOptions _options;
    private readonly object _processPrivateSummaryCacheGate = new object();
    private readonly Dictionary<string, ProcessPrivateSummaryCacheEntry> _processPrivateSummaryCache = new Dictionary<string, ProcessPrivateSummaryCacheEntry>(StringComparer.OrdinalIgnoreCase);

    private static readonly string[] UdfInventoryResourceTypes =
    {
        "Function",
        "UDF",
        "UserDefinedFunction",
        "UserDefined"
    };

    public WorkbenchApiService(IFormWorksExtractionClient client, WorkbenchApiServerOptions options, WorkbenchSnapshotCache? cache = null, LiveFwdSessionCache? liveSessionCache = null)
    {
        if (client == null) throw new ArgumentNullException(nameof(client));
        _client = client;
        _options = options ?? throw new ArgumentNullException(nameof(options));
        _cache = cache ?? new WorkbenchSnapshotCache(client, _options.EvidenceExportProfile);
        _liveSessionCache = liveSessionCache ?? new LiveFwdSessionCache(client);
    }

    public ApiHttpResult Dispatch(string route, HttpListenerRequest request)
    {
        string tail = route.StartsWith("api/v1", StringComparison.OrdinalIgnoreCase)
            ? route.Substring("api/v1".Length).Trim('/')
            : route.Trim('/');

        try
        {
            if (string.IsNullOrWhiteSpace(tail) || tail == "help") return Ok(request, "AcWorkbench.ApiHelp", BuildHelp(request));
            if (tail == "openapi.json") return RequireMethod(request, "GET") ?? OpenApi(request);
            if (tail == "routes") return RequireMethod(request, "GET") ?? Ok(request, "AcWorkbench.RouteCatalog", BuildRouteCatalog(request));
            if (tail == "capabilities") return RequireMethod(request, "GET") ?? Ok(request, "AcWorkbench.Capabilities", BuildCapabilities(request));
            if (tail == "health/live") return RequireMethod(request, "GET") ?? Ok(request, "AcWorkbench.Liveness", BuildLiveness());
            if (tail == "health/ready") return RequireMethod(request, "GET") ?? BuildReadiness(request);
            if (tail == "status") return RequireMethod(request, "GET") ?? Ok(request, "AcWorkbench.Status", BuildStatus(request));
            if (tail == "viewer/bootstrap") return RequireMethod(request, "GET") ?? BuildViewerBootstrap(request);
            if (tail == "snapshot")
            {
                ApiHttpResult? methodError = RequireMethod(request, "GET");
                if (methodError != null) return methodError;

                WorkbenchSnapshot snapshot = GetSnapshot(request);
                return Ok(request, "AcWorkbench.Snapshot", BuildSnapshotResponse(snapshot), snapshotOverride: snapshot);
            }
            if (tail == "snapshot/warmup") return RequireMethod(request, "GET") ?? Warmup(request);
            if (tail == "snapshot/refresh") return Refresh(request);
            if (tail == "editor-model") return RequireMethod(request, "GET") ?? Ok(request, "AcWorkbench.EditorModel", BuildEditorModel(GetSnapshot(request), request));
            if (tail == "scopes") return RequireMethod(request, "GET") ?? Ok(request, "AcWorkbench.ScopeList", BuildScopeList(GetSnapshot(request), request));
            if (tail.StartsWith("scopes/", StringComparison.OrdinalIgnoreCase)) return DispatchScope(tail, request);
            if (tail.StartsWith("rules/", StringComparison.OrdinalIgnoreCase)) return DispatchRule(tail, request);
            if (tail == "rule-lists" || tail.StartsWith("rule-lists/", StringComparison.OrdinalIgnoreCase)) return DispatchRuleLists(tail, request);
            if (tail == "fwd" || tail.StartsWith("fwd/", StringComparison.OrdinalIgnoreCase)) return DispatchFwd(tail, request);
            if (tail == "diagnostics") return RequireMethod(request, "GET") ?? Ok(request, "AcWorkbench.Diagnostics", BuildGlobalDiagnostics(GetSnapshot(request)));
            if (tail == "search") return RequireMethod(request, "GET") ?? Ok(request, "AcWorkbench.Search", BuildSearch(GetSnapshot(request), request));

            return Fail(request, "RouteNotFound", "API route was not found.", 404, "/api/v1/" + tail);
        }
        catch (ApiContractException ex)
        {
            return Fail(request, ex.Code, ex.Message, ex.StatusCode, ex.Detail, ex.Target, ex.Resolution);
        }
        catch (ApiV1Exception ex)
        {
            return Fail(request, ex.Code, ex.Message, ex.StatusCode, ex.Detail);
        }
        catch (FormWorksInteropException ex)
        {
            return Fail(request, "DllInteropFailure", ex.Message, 400, SensitiveValueRedactor.ExceptionMessage(ex.InnerException, _options.ShouldExposeOperationalDetails), null, "Verify x86 process bitness, native DCM DLL paths, WibuKey/licensing state, and FWD path access.");
        }
        catch (Exception ex)
        {
            return Fail(request, "UnhandledServerError", "Unhandled API v1 server error.", 500, _options.ShouldExposeOperationalDetails ? ex.GetType().Name + ": " + ex.Message : SensitiveValueRedactor.Redacted);
        }
    }

    private ApiHttpResult? RequireMethod(HttpListenerRequest request, string method)
    {
        if (string.Equals(request.HttpMethod, method, StringComparison.OrdinalIgnoreCase))
            return null;

        return Fail(request, "MethodNotAllowed", "This endpoint requires " + method + ".", 405, "Received " + request.HttpMethod + ".");
    }

    private ApiHttpResult Ok(HttpListenerRequest request, string schema, object data, int statusCode = 200, WorkbenchSnapshot? snapshotOverride = null)
    {
        WorkbenchSnapshot? snapshot = snapshotOverride ?? GetCurrentSnapshotForRequest(request);
        string requestId = RequestId(request);
        var result = ApiHttpResult.Json(new ApiEnvelope
        {
            Ok = true,
            Schema = schema,
            SchemaVersion = ApiV1Routes.SchemaVersion,
            ApiVersion = ApiV1Routes.ApiVersion,
            RequestId = requestId,
            SnapshotId = snapshot?.SnapshotId,
            GeneratedAtUtc = snapshot?.GeneratedAtUtc,
            Data = data,
            Meta = new ApiMeta
            {
                Contract = "/api/v1/openapi.json",
                Caveat = "This API is a static inspection contract. It does not simulate native runtime execution."
            }
        }, statusCode);
        AddStandardHeaders(result, requestId, schema, snapshot);
        return result;
    }

    private WorkbenchSnapshot? GetCurrentSnapshotForRequest(HttpListenerRequest request)
    {
        try
        {
            string? path = GetSourcePathForStatus(request);
            if (string.IsNullOrWhiteSpace(path))
                return null;

            return _cache.GetCurrent(path!, GetProcess(request), GetBool(request, "requireNativeOk", false));
        }
        catch
        {
            return null;
        }
    }

    private ApiHttpResult Fail(HttpListenerRequest request, string code, string message, int statusCode, string? detail = null, string? target = null, string? resolution = null)
    {
        string requestId = RequestId(request);
        ApiHttpResult result = ApiHttpResult.Error(code, message, statusCode, detail, requestId, target, resolution);
        result.Headers["X-API-Version"] = ApiV1Routes.ApiVersion;
        result.Headers["X-Request-Id"] = requestId;
        result.Headers["X-Content-Type-Options"] = "nosniff";
        return result;
    }

    private static void AddStandardHeaders(ApiHttpResult result, string requestId, string schema, WorkbenchSnapshot? snapshot)
    {
        result.Headers["X-API-Version"] = ApiV1Routes.ApiVersion;
        result.Headers["X-Schema"] = schema;
        result.Headers["X-Request-Id"] = requestId;
        result.Headers["X-Content-Type-Options"] = "nosniff";
        if (snapshot != null)
            result.Headers["X-Snapshot-Id"] = snapshot.SnapshotId;
    }

    private WorkbenchSnapshot GetSnapshot(HttpListenerRequest request)
    {
        string path = GetFwdPath(request);
        string process = GetProcess(request);
        bool requireNativeOk = GetBool(request, "requireNativeOk", false);
        SnapshotModeRequest snapshotMode = GetSnapshotModeRequest(request);
        if (snapshotMode == SnapshotModeRequest.Live)
        {
            int seconds = Math.Max(1, Math.Min(3600, GetInt(request, "liveMinRefreshSeconds", 15)));
            return _cache.GetLiveOrBuild(path, process, requireNativeOk, TimeSpan.FromSeconds(seconds));
        }

        if (snapshotMode == SnapshotModeRequest.Rebuild)
            return _cache.Rebuild(path, process, requireNativeOk);

        bool useCache = snapshotMode == SnapshotModeRequest.Snapshot
            || (snapshotMode == SnapshotModeRequest.Default && !_options.DisableSnapshotCache);

        return useCache
            ? _cache.GetOrBuild(path, process, requireNativeOk)
            : _cache.Rebuild(path, process, requireNativeOk);
    }

    private string GetFwdPath(HttpListenerRequest request)
    {
        string? queryPath = Get(request, "path");
        if (!string.IsNullOrWhiteSpace(queryPath) && !_options.AllowPathQuery)
        {
            throw new ApiContractException(
                "PathOverrideDisabled",
                "Request-level ?path= overrides are disabled for this server process.",
                403,
                "The server was started without --allow-path-query.",
                "path",
                "Restart with --allow-path-query for diagnostic use, or configure the intended FWD path at startup.");
        }

        string? path = queryPath ?? _options.DefaultFwdPath;
        if (string.IsNullOrWhiteSpace(path))
            throw new ApiV1Exception("FwdPathRequired", "A FWD/CFD path is required.", 400, "Pass --path when starting the API. Diagnostic path overrides require --allow-path-query.");
        return path!;
    }

    private string? GetSourcePathForStatus(HttpListenerRequest request)
    {
        string? queryPath = Get(request, "path");
        if (!string.IsNullOrWhiteSpace(queryPath) && !_options.AllowPathQuery)
        {
            throw new ApiContractException(
                "PathOverrideDisabled",
                "Request-level ?path= overrides are disabled for this server process.",
                403,
                "The server was started without --allow-path-query.",
                "path",
                "Restart with --allow-path-query for diagnostic use, or configure the intended FWD path at startup.");
        }

        return queryPath ?? _options.DefaultFwdPath;
    }

    private static HashSet<string> IncludeSet(HttpListenerRequest request)
    {
        string? raw = Get(request, "include");
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(raw)) return result;

        foreach (string item in raw!.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries))
        {
            string trimmed = item.Trim();
            if (trimmed.Length > 0) result.Add(trimmed);
        }
        return result;
    }

    private static string GetProcess(HttpListenerRequest request) => Get(request, "process") ?? "AC";

    private ApiHttpResult Refresh(HttpListenerRequest request)
    {
        if (!string.Equals(request.HttpMethod, "POST", StringComparison.OrdinalIgnoreCase))
            return Fail(request, "MethodNotAllowed", "Snapshot refresh requires POST.", 405, "Use POST /api/v1/snapshot/refresh.");

        if (!_options.AllowMutatingCommands)
        {
            return Fail(
                request,
                "RefreshDisabled",
                "Snapshot refresh is disabled for this server process.",
                409,
                "Restart the server with --allow-refresh, or use scripts/start-workbench.ps1.",
                null,
                "Restart with --allow-refresh or use scripts/start-workbench.ps1 when server-side refresh is intended.");
        }

        WorkbenchSnapshot snapshot = _cache.Rebuild(GetFwdPath(request), GetProcess(request), GetBool(request, "requireNativeOk", false));
        return Ok(request, "AcWorkbench.SnapshotRefresh", new
        {
            refreshed = true,
            snapshot = BuildSnapshotResponse(snapshot)
        }, snapshotOverride: snapshot);
    }

    // Kicks off a background snapshot build and returns immediately (idempotent).
    // Multiple callers during the same build share the in-progress Task via WorkbenchSnapshotCache.
    private ApiHttpResult Warmup(HttpListenerRequest request)
    {
        string path = GetFwdPath(request);
        string process = GetProcess(request);
        bool requireNativeOk = GetBool(request, "requireNativeOk", false);

        bool alreadyBuilt = _cache.HasCurrent(path, process, requireNativeOk);
        bool alreadyPending = _cache.HasPendingBuild(path, process, requireNativeOk);

        if (!alreadyBuilt && !alreadyPending)
            _ = _cache.WarmUpAsync(path, process, requireNativeOk);

        return Ok(request, "AcWorkbench.SnapshotWarmup", new
        {
            queued = !alreadyBuilt && !alreadyPending,
            alreadyBuilding = alreadyPending,
            alreadyReady = alreadyBuilt,
            buildStartedAtUtc = _cache.GetPendingBuildStartedAtUtc(path, process, requireNativeOk),
            note = alreadyBuilt
                ? "Snapshot already cached. Call POST /api/v1/snapshot/refresh to force a rebuild."
                : "Background build started. Poll GET /api/v1/health/ready or GET /api/v1/status to track progress."
        });
    }

    private ApiHttpResult OpenApi(HttpListenerRequest request)
    {
        string requestId = RequestId(request);
        string origin = request.Url == null ? "http://127.0.0.1:8787" : request.Url.GetLeftPart(UriPartial.Authority);
        ApiHttpResult result = ApiHttpResult.Json(OpenApiDocument.Build(origin + ApiV1Routes.BasePath), 200);
        result.Headers["X-API-Version"] = ApiV1Routes.ApiVersion;
        result.Headers["X-Request-Id"] = requestId;
        result.Headers["X-Content-Type-Options"] = "nosniff";
        return result;
    }

    private static string RequestId(HttpListenerRequest request)
    {
        try
        {
            string? header = request.Headers["X-Request-Id"];
            if (!string.IsNullOrWhiteSpace(header)) return header!;
            string? query = request.QueryString["requestId"];
            if (!string.IsNullOrWhiteSpace(query)) return query!;
        }
        catch (ObjectDisposedException)
        {
            // Fall back to a generated correlation id when test helpers or callers
            // dispose the underlying HttpListener context before envelope creation.
        }

        return ApiHttpResult.NewCorrelationId();
    }

    private object BuildHelp(HttpListenerRequest request)
    {
        return WorkbenchApiMetadataBuilder.BuildHelp();
    }

    private object BuildRouteCatalog(HttpListenerRequest request)
    {
        return WorkbenchApiMetadataBuilder.BuildRouteCatalog();
    }

    private object BuildCapabilities(HttpListenerRequest request)
    {
        return WorkbenchApiMetadataBuilder.BuildCapabilities(_options);
    }

    private object BuildLiveness()
    {
        return WorkbenchApiMetadataBuilder.BuildLiveness();
    }

    private ApiHttpResult BuildReadiness(HttpListenerRequest request)
    {
        string? path = GetSourcePathForStatus(request);
        string process = GetProcess(request);
        bool requireNativeOk = GetBool(request, "requireNativeOk", false);
        bool pathConfigured = !string.IsNullOrWhiteSpace(path);
        bool pathExists = pathConfigured && File.Exists(path!);
        WorkbenchSnapshot? snapshot = pathConfigured ? _cache.GetCurrent(path!, process, requireNativeOk) : null;
        LiveFwdSessionStatus? liveSession = pathConfigured ? _liveSessionCache.GetCurrent(path!, process, requireNativeOk) : null;
        Exception? lastSnapshotFailure = pathConfigured ? _cache.GetLastBuildFailure(path!, process, requireNativeOk) : null;
        Exception? lastLiveFailure = pathConfigured ? _liveSessionCache.GetLastFailure(path!, process, requireNativeOk) : null;
        bool snapshotBuilding = pathConfigured && _cache.HasPendingBuild(path!, process, requireNativeOk);
        bool liveOpening = pathConfigured && _liveSessionCache.HasPendingBuild(path!, process, requireNativeOk);

        if (_options.LiveLazyMode && pathConfigured && pathExists && liveSession == null && !liveOpening && lastLiveFailure == null)
            _ = _liveSessionCache.WarmUpAsync(path!, process, requireNativeOk);

        bool liveReady = _options.LiveLazyMode && pathConfigured && pathExists && liveSession != null && lastLiveFailure == null;
        bool snapshotReady = pathConfigured && pathExists && snapshot != null && lastSnapshotFailure == null;
        bool ready = _options.LiveLazyMode
            ? liveReady
            : (_options.DisableSnapshotCache ? pathConfigured && pathExists : snapshotReady);

        return Ok(request, "AcWorkbench.Readiness", new
        {
            ready,
            source = new { path = SensitiveValueRedactor.Path(path, _options.ShouldExposeOperationalDetails), process, requireNativeOk, configured = pathConfigured, exists = pathExists },
            live = new
            {
                enabled = _options.LiveLazyMode,
                ready = liveReady,
                opening = liveOpening,
                openedAtUtc = liveSession?.OpenedAtUtc,
                openDurationMs = liveSession?.OpenDurationMs,
                catalog = liveSession == null ? null : new
                {
                    documents = liveSession.DocumentCount,
                    pages = liveSession.PageCount,
                    batches = liveSession.BatchCount,
                    processes = liveSession.ProcessCount,
                    pageVariants = liveSession.PageVariantCount
                },
                buildStartedAtUtc = liveOpening ? _liveSessionCache.GetPendingBuildStartedAtUtc(path!, process, requireNativeOk) : null,
                lastFailure = SensitiveValueRedactor.ExceptionSummary(lastLiveFailure, _options.ShouldExposeOperationalDetails)
            },
            snapshot = snapshot == null ? null : new { snapshot.SnapshotId, snapshot.GeneratedAtUtc, snapshot.BuildDurationMs },
            deepReady = snapshotReady,
            building = snapshotBuilding,
            buildStartedAtUtc = snapshotBuilding ? _cache.GetPendingBuildStartedAtUtc(path!, process, requireNativeOk) : null,
            snapshotStrategy = SnapshotStrategyLabel(),
            evidenceExport = EvidenceExportProfileDto.FromSettings(EvidenceExportProfileSettings.Resolve(_options.EvidenceExportProfile)),
            lastBuildFailure = SensitiveValueRedactor.ExceptionSummary(lastSnapshotFailure, _options.ShouldExposeOperationalDetails),
            resolution = ready
                ? null
                : BuildReadinessResolution(pathConfigured, pathExists, _options.LiveLazyMode ? liveOpening : snapshotBuilding, lastLiveFailure ?? lastSnapshotFailure, _options.LiveLazyMode)
        }, ready ? 200 : 503, snapshot);
    }

    private static string BuildReadinessResolution(bool pathConfigured, bool pathExists, bool building, Exception? lastFailure, bool liveLazyMode)
    {
        if (!pathConfigured)
            return "Restart the server with --path, or enable query-path override for diagnostic use only.";
        if (!pathExists)
            return "Verify that the FWD/CFD path exists and that the service account can read it.";
        if (building)
            return liveLazyMode
                ? "Live FWD session open is still running for the requested FWD/process. Poll this endpoint again."
                : "Snapshot build is still running for the requested FWD/process. Poll this endpoint again.";
        if (lastFailure != null)
            return "Open /api/v1/status for the last FWD open/snapshot failure, then verify x86 bitness, native DCM DLL availability, licensing state, and read access to the FWD/CFD.";
        return liveLazyMode
            ? "The FWD path exists, but the live read-only session has not opened yet. Poll this endpoint again or call GET /api/v1/health/ready."
            : "Call GET /api/v1/snapshot to build the cache, or restart the server with --path.";
    }

    private string SnapshotStrategyLabel()
    {
        if (_options.LiveLazyMode) return _options.StartupSnapshotWarmup ? "live-lazy+snapshot-warmup" : "live-lazy";
        return _options.DisableSnapshotCache ? "rebuild-per-request" : "cached";
    }

    private object BuildGlobalDiagnostics(WorkbenchSnapshot snapshot)
    {
        var scopeWarnings = snapshot.ScopesById.Values
            .Where(s => s.DiagnosticCount > 0 || s.FlatOnlyCount > Math.Max(25, s.StructuralRuleCount / 4))
            .OrderByDescending(s => s.DiagnosticCount)
            .ThenByDescending(s => s.FlatOnlyCount)
            .Select(s => new
            {
                s.ScopeId,
                s.Name,
                s.Kind,
                health = HealthFor(s),
                counts = ScopeCounts(s),
                links = ScopeLinks(s.ScopeId)
            })
            .ToList();

        return new
        {
            snapshotId = snapshot.SnapshotId,
            generatedAtUtc = snapshot.GeneratedAtUtc,
            summary = new
            {
                scopes = snapshot.ScopesById.Count,
                warningScopes = scopeWarnings.Count,
                treeDiagnostics = snapshot.Tree.Diagnostics.Count,
                extractionDiagnostics = snapshot.Diagnostics.Diagnostics.Count,
                warnings = snapshot.Fwd.Warnings.Count + snapshot.Rules.Warnings.Count + snapshot.Tree.Warnings.Count + snapshot.Relationships.Warnings.Count
            },
            scopeWarnings,
            extractionDiagnostics = snapshot.Diagnostics.Diagnostics.Select(d => new { d.Severity, d.Category, d.Message, d.Count, d.Examples }).ToList(),
            warnings = snapshot.Fwd.Warnings.Concat(snapshot.Rules.Warnings).Concat(snapshot.Tree.Warnings).Concat(snapshot.Relationships.Warnings).ToList(),
            interpretation = new[]
            {
                "Diagnostics are part of the product model, not debug noise.",
                "A warning means the API can still serve data, but the affected evidence must be interpreted with its stated limitation.",
                "Flat-only rows are useful for search/completeness and are not runtime-order proof."
            }
        };
    }

    private object BuildStatus(HttpListenerRequest request)
    {
        string? path = GetSourcePathForStatus(request);
        string process = GetProcess(request);
        bool requireNativeOk = GetBool(request, "requireNativeOk", false);
        bool pathConfigured = !string.IsNullOrWhiteSpace(path);
        WorkbenchSnapshot? snapshot = pathConfigured ? _cache.GetCurrent(path!, process, requireNativeOk) : null;
        LiveFwdSessionStatus? liveSession = pathConfigured ? _liveSessionCache.GetCurrent(path!, process, requireNativeOk) : null;
        Exception? lastFailure = pathConfigured ? _cache.GetLastBuildFailure(path!, process, requireNativeOk) : null;
        Exception? lastLiveFailure = pathConfigured ? _liveSessionCache.GetLastFailure(path!, process, requireNativeOk) : null;
        bool building = pathConfigured && _cache.HasPendingBuild(path!, process, requireNativeOk);
        bool liveOpening = pathConfigured && _liveSessionCache.HasPendingBuild(path!, process, requireNativeOk);
        DateTime? buildStartedAtUtc = building ? _cache.GetPendingBuildStartedAtUtc(path!, process, requireNativeOk) : null;
        DateTime? liveStartedAtUtc = liveOpening ? _liveSessionCache.GetPendingBuildStartedAtUtc(path!, process, requireNativeOk) : null;
        FileInfo? fwd = !string.IsNullOrWhiteSpace(path) && File.Exists(path) ? new FileInfo(path!) : null;

        return new
        {
            service = "FW Editor Viewer API",
            apiVersion = "1.0.0",
            ok = true,
            mode = "local-read-only",
            debugApiEnabled = _options.EnableDebugApi,
            refreshEnabled = _options.AllowMutatingCommands,
            processBitness = Environment.Is64BitProcess ? "64-bit" : "32-bit",
            machineName = SensitiveValueRedactor.MachineName(_options.ShouldExposeOperationalDetails),
            utc = DateTime.UtcNow,
            source = new
            {
                path = SensitiveValueRedactor.Path(path, _options.ShouldExposeOperationalDetails),
                process,
                requireNativeOk,
                exists = fwd != null,
                length = fwd?.Length,
                lastWriteUtc = fwd?.LastWriteTimeUtc
            },
            live = liveSession == null ? (object)new
            {
                enabled = _options.LiveLazyMode,
                ready = false,
                opening = liveOpening,
                buildStartedAtUtc = liveStartedAtUtc,
                buildElapsedMs = liveStartedAtUtc.HasValue
                    ? (long?)(DateTime.UtcNow - liveStartedAtUtc.Value).TotalMilliseconds
                    : null,
                openedAtUtc = (DateTime?)null,
                openDurationMs = (long?)null,
                catalog = (object?)null
            } : new
            {
                enabled = _options.LiveLazyMode,
                ready = true,
                opening = false,
                buildStartedAtUtc = (DateTime?)null,
                buildElapsedMs = (long?)null,
                openedAtUtc = (DateTime?)liveSession.OpenedAtUtc,
                openDurationMs = (long?)liveSession.OpenDurationMs,
                catalog = (object)new
                {
                    documents = liveSession.DocumentCount,
                    pages = liveSession.PageCount,
                    batches = liveSession.BatchCount,
                    processes = liveSession.ProcessCount,
                    pageVariants = liveSession.PageVariantCount
                }
            },
            snapshot = snapshot == null ? (object)new
            {
                loaded = false,
                building,
                buildStartedAtUtc,
                buildElapsedMs = buildStartedAtUtc.HasValue
                    ? (long?)(DateTime.UtcNow - buildStartedAtUtc.Value).TotalMilliseconds
                    : null,
                snapshotId = (string?)null,
                generatedAtUtc = (DateTime?)null,
                buildDurationMs = (long?)null
            } : new
            {
                loaded = true,
                building = false,
                buildStartedAtUtc = (DateTime?)null,
                buildElapsedMs = (long?)null,
                snapshotId = snapshot.SnapshotId,
                generatedAtUtc = (DateTime?)snapshot.GeneratedAtUtc,
                buildDurationMs = (long?)snapshot.BuildDurationMs
            },
            lastLiveOpenFailure = SensitiveValueRedactor.ExceptionSummary(lastLiveFailure, _options.ShouldExposeOperationalDetails),
            lastSnapshotBuildFailure = SensitiveValueRedactor.ExceptionSummary(lastFailure, _options.ShouldExposeOperationalDetails),
            capabilities = new
            {
                snapshotCache = !_options.DisableSnapshotCache,
                snapshotStrategy = SnapshotStrategyLabel(),
                evidenceExport = EvidenceExportProfileDto.FromSettings(EvidenceExportProfileSettings.Resolve(_options.EvidenceExportProfile)),
                refresh = _options.AllowMutatingCommands,
                scopes = true,
                structure = true,
                inventory = true,
                references = true,
                functionCatalog = true,
                diagnostics = true,
                search = true,
                nativeRuleExecution = false,
                mutation = false
            },
            links = new
            {
                help = "/api/v1/help",
                snapshot = "/api/v1/snapshot",
                scopes = "/api/v1/scopes",
                search = "/api/v1/search?q=provider"
            }
        };
    }

    private object BuildSnapshotResponse(WorkbenchSnapshot snapshot)
    {
        return new
        {
            snapshotId = snapshot.SnapshotId,
            generatedAtUtc = snapshot.GeneratedAtUtc,
            buildDurationMs = snapshot.BuildDurationMs,
            source = new
            {
                path = SensitiveValueRedactor.Path(snapshot.FwdPath, _options.ShouldExposeOperationalDetails),
                release = snapshot.Fwd.ReleaseString,
                releaseDate = snapshot.Fwd.ReleaseDateString,
                releaseNumber = snapshot.Fwd.ReleaseNumber,
                process = snapshot.Rules.ProcessName,
                readMode = "read-only"
            },
            runtime = new
            {
                processBitness = Environment.Is64BitProcess ? "64-bit" : "32-bit",
                machineName = SensitiveValueRedactor.MachineName(_options.ShouldExposeOperationalDetails)
            },
            evidenceExport = EvidenceExportProfileDto.FromSettings(EvidenceExportProfileSettings.Resolve(snapshot.EvidenceExportProfile)),
            counts = new
            {
                documents = snapshot.Fwd.Documents.Count,
                pages = snapshot.Fwd.Pages.Count,
                batches = snapshot.Fwd.Batches.Count,
                processes = snapshot.Fwd.Processes.Count,
                scopes = snapshot.ScopesById.Count,
                structuralRules = snapshot.Tree.Nodes.Count(n => n.IsRuleNode),
                flatInventoryRows = snapshot.Rules.Rules.Count,
                relationships = snapshot.Relationships.Relationships.Count,
                diagnostics = snapshot.Tree.Diagnostics.Count + snapshot.Diagnostics.Diagnostics.Count
            },
            truthModel = new
            {
                structure = "Structural tree nodes and edges are hierarchy/order evidence.",
                inventory = "Flat inventory rows are broad searchable extraction evidence, not runtime order proof.",
                references = "References are static evidence-coded relationships. Confidence and runtimeDependency must be read explicitly.",
                diagnostics = "Diagnostics explain extraction and reconciliation limits. They are part of the product contract, not debug noise.",
                disabled = "Structural DisabledDirect/DisabledInherited is authoritative. Flat disabled state is lower-confidence inventory evidence.",
                flow = "Native runtime execution is not simulated by this inspection API."
            },
            warnings = snapshot.Fwd.Warnings.Concat(snapshot.Rules.Warnings).Concat(snapshot.Tree.Warnings).Concat(snapshot.Relationships.Warnings).ToList()
        };
    }

    private object BuildScopeList(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? kind = Get(request, "kind");
        string? q = Get(request, "q");
        bool hasDiagnostics = GetBool(request, "hasDiagnostics", false);
        bool hasDisabled = GetBool(request, "hasDisabled", false);

        IEnumerable<ScopeModel> scopes = snapshot.ScopesById.Values;
        if (!string.IsNullOrWhiteSpace(kind)) scopes = scopes.Where(s => RuleCorrelation.Eq(s.Kind, kind));
        if (!string.IsNullOrWhiteSpace(q)) scopes = scopes.Where(s => RuleCorrelation.Contains(s.ScopeId, q) || RuleCorrelation.Contains(s.Name, q) || RuleCorrelation.Contains(s.Kind, q));
        if (hasDiagnostics) scopes = scopes.Where(s => s.DiagnosticCount > 0);
        if (hasDisabled) scopes = scopes.Where(s => s.DirectDisabledCount > 0 || s.InheritedDisabledCount > 0);

        return new
        {
            count = scopes.Count(),
            items = scopes
                .OrderBy(s => s.Kind)
                .ThenBy(s => s.Name)
                .Select(s => new
                {
                    s.ScopeId,
                    s.Name,
                    s.Kind,
                    health = HealthFor(s),
                    counts = ScopeCounts(s),
                    links = ScopeLinks(s.ScopeId)
                })
                .ToList()
        };
    }

    private object BuildEditorModel(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? include = Get(request, "include");
        HashSet<string> sections = string.IsNullOrWhiteSpace(include)
            ? new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            : new HashSet<string>(include!.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries).Select(s => s.Trim()), StringComparer.OrdinalIgnoreCase);

        bool includeAll = sections.Count == 0;
        return new
        {
            snapshotId = snapshot.SnapshotId,
            generatedAtUtc = snapshot.GeneratedAtUtc,
            modelVersion = snapshot.EditorModel.ModelVersion,
            source = snapshot.EditorModel.Source,
            counts = new
            {
                objectNodes = snapshot.EditorModel.ObjectGraph.Nodes.Count,
                objectEdges = snapshot.EditorModel.ObjectGraph.Edges.Count,
                ruleLists = snapshot.EditorModel.RuleLists.Count,
                ruleConfigurations = snapshot.EditorModel.RuleLists.Sum(r => r.RuleConfigurations.Count),
                udfDefinitions = snapshot.EditorModel.UdfDefinitions.Count,
                selectionListDefinitions = snapshot.EditorModel.SelectionListDefinitions.Count,
                pageDesigns = snapshot.EditorModel.PageDesigns.Count,
                pageDesignFields = snapshot.EditorModel.PageDesigns.Sum(p => p.Fields.Count),
                runtimeImpacts = snapshot.EditorModel.RuntimeImpacts.Count
            },
            objectGraph = includeAll || sections.Contains("objectGraph") ? snapshot.EditorModel.ObjectGraph : null,
            ruleLists = includeAll || sections.Contains("ruleLists") ? snapshot.EditorModel.RuleLists : null,
            udfDefinitions = includeAll || sections.Contains("udfs") || sections.Contains("udfDefinitions") ? snapshot.EditorModel.UdfDefinitions : null,
            selectionListDefinitions = includeAll || sections.Contains("selectionLists") || sections.Contains("tables") ? snapshot.EditorModel.SelectionListDefinitions : null,
            pageDesigns = includeAll || sections.Contains("pageDesigns") || sections.Contains("pages") || sections.Contains("fields") ? snapshot.EditorModel.PageDesigns : null,
            runtimeImpacts = includeAll || sections.Contains("runtimeImpacts") || sections.Contains("runtime") ? snapshot.EditorModel.RuntimeImpacts : null,
            diagnostics = snapshot.EditorModel.Diagnostics,
            notProven = snapshot.EditorModel.NotProven
        };
    }

    private ApiHttpResult DispatchRuleLists(string tail, HttpListenerRequest request)
    {
        ApiHttpResult? method = RequireMethod(request, "GET");
        if (method != null) return method;

        WorkbenchSnapshot snapshot = GetSnapshot(request);
        string[] parts = tail.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 1)
            return Ok(request, "AcWorkbench.RuleLists", BuildRuleLists(snapshot, request));

        string scopeId = DecodeJoined(parts, 1, parts.Length - 1);
        EditorRuleListModel? ruleList = snapshot.EditorModel.RuleLists.FirstOrDefault(r => RuleCorrelation.Eq(r.RuleListId, scopeId));
        if (ruleList == null)
            return Fail(request, "RuleListNotFound", "Rule List was not found.", 404, scopeId);

        return Ok(request, "AcWorkbench.RuleListDetail", ruleList);
    }

    private object BuildRuleLists(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? q = Get(request, "q");
        string? kind = Get(request, "kind");
        var items = snapshot.EditorModel.RuleLists
            .Where(r => string.IsNullOrWhiteSpace(kind) || RuleCorrelation.Eq(r.Kind, kind))
            .Where(r => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(r.Name, q) || RuleCorrelation.Contains(r.RuleListId, q))
            .OrderBy(r => r.RuleListId, StringComparer.OrdinalIgnoreCase)
            .Select(r => new
            {
                r.RuleListId,
                r.Name,
                r.Kind,
                r.StructuralRuleCount,
                r.FlatInventoryCount,
                ruleConfigurationCount = r.RuleConfigurations.Count,
                diagnostics = r.Diagnostics,
                links = new { self = "/api/v1/rule-lists/" + UrlEncode(r.RuleListId) }
            })
            .ToList();

        return new
        {
            count = items.Count,
            items,
            caveat = "Rule Lists are read-only static projections; use selected rule packets for per-rule evidence drill-through."
        };
    }

    private ApiHttpResult DispatchScope(string tail, HttpListenerRequest request)
    {
        ApiHttpResult? method = RequireMethod(request, "GET");
        if (method != null) return method;

        string[] parts = tail.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 2) return Fail(request, "InvalidRequest", "Scope id is required.", 400);

        string last = parts[parts.Length - 1];
        bool hasAction = IsScopeAction(last);
        string action = hasAction ? last : string.Empty;
        string scopeId = DecodeJoined(parts, 1, hasAction ? parts.Length - 2 : parts.Length - 1);
        WorkbenchSnapshot snapshot = GetSnapshot(request);

        if (!snapshot.ScopesById.TryGetValue(scopeId, out ScopeModel? scope))
            return Fail(request, "ScopeNotFound", "Scope was not found.", 404, scopeId);

        if (string.IsNullOrWhiteSpace(action)) return Ok(request, "AcWorkbench.ScopeDetail", BuildScopeDetailWithIncludes(snapshot, scope, request));
        if (action == "structure") return Ok(request, "AcWorkbench.ScopeStructure", BuildScopeStructure(scope));
        if (action == "inventory") return Ok(request, "AcWorkbench.ScopeInventory", BuildScopeInventory(snapshot, scope, request));
        if (action == "references") return Ok(request, "AcWorkbench.ScopeReferences", BuildScopeReferences(scope, request));
        if (action == "diagnostics") return Ok(request, "AcWorkbench.ScopeDiagnostics", BuildScopeDiagnostics(snapshot, scope));

        return Fail(request, "RouteNotFound", "Scope route was not found.", 404, "/api/v1/" + tail);
    }

    private object BuildScopeDetailWithIncludes(WorkbenchSnapshot snapshot, ScopeModel scope, HttpListenerRequest request)
    {
        HashSet<string> include = IncludeSet(request);
        object detail = BuildScopeDetail(snapshot, scope);
        if (include.Count == 0) return detail;

        return new
        {
            detail,
            included = new
            {
                structure = include.Contains("structure") ? BuildScopeStructure(scope) : null,
                inventory = include.Contains("inventory") ? BuildScopeInventory(snapshot, scope, request) : null,
                references = include.Contains("references") ? BuildScopeReferences(scope, request) : null,
                diagnostics = include.Contains("diagnostics") ? BuildScopeDiagnostics(snapshot, scope) : null
            },
            include = include.OrderBy(x => x).ToList(),
            caveat = "Included sections are convenience expansions of the same product evidence. Use Structure for hierarchy/order and Inventory only for flat search/completeness."
        };
    }

    private object BuildScopeDetail(WorkbenchSnapshot snapshot, ScopeModel scope)
    {
        return new
        {
            scope = new { scope.ScopeId, scope.Name, scope.Kind, process = snapshot.Rules.ProcessName },
            health = HealthFor(scope),
            counts = ScopeCounts(scope),
            topFunctions = scope.StructuralNodes
                .Where(n => n.IsRuleNode)
                .GroupBy(n => string.IsNullOrWhiteSpace(n.FunctionName) ? "(missing)" : n.FunctionName!)
                .OrderByDescending(g => g.Count())
                .ThenBy(g => g.Key)
                .Take(12)
                .Select(g => new { name = g.Key, count = g.Count() })
                .ToList(),
            centralTargets = scope.Relationships
                .GroupBy(r => (r.TargetType ?? "Unknown") + ":" + (r.Target ?? string.Empty))
                .OrderByDescending(g => g.Count())
                .ThenBy(g => g.Key)
                .Take(20)
                .Select(g => new { target = g.Key, count = g.Count() })
                .ToList(),
            interpretation = new
            {
                structure = "Use Structure for hierarchy and branch order.",
                inventory = "Use Inventory for broad search and extraction completeness.",
                flatOnly = "Flat-only rows are not execution-order evidence.",
                coverage = "Structural coverage failures are blocking review risks. Do not use affected scopes for route/order conclusions until reconciled.",
                disabled = "Structural disabled state is authoritative. Enabled is the default and is not badged. Direct/inherited disabled states are exceptions.",
                flow = "Native runtime execution is not simulated by this inspection API."
            },
            links = ScopeLinks(scope.ScopeId)
        };
    }

    private object BuildScopeStructure(ScopeModel scope)
    {
        // Precompute lightweight indexes once to avoid repeated linear scans per structural node.
        var nodeIdSet = new HashSet<int>(scope.StructuralNodes.Select(n => n.NodeId));
        var incomingByNodeId = scope.StructuralEdges
            .GroupBy(e => e.ToNodeId)
            .ToDictionary(g => g.Key, g => g.ToList());
        var outgoingByNodeId = scope.StructuralEdges
            .GroupBy(e => e.FromNodeId)
            .ToDictionary(g => g.Key, g => g.ToList());
        var warningNodeIds = new HashSet<int>(scope.TreeDiagnostics.Where(d => d.NodeId.HasValue).Select(d => d.NodeId!.Value));

        return new
        {
            scopeId = scope.ScopeId,
            evidenceClass = "Structural",
            rootNodeIds = scope.StructuralNodes
                .Where(n => n.ParentNodeId <= 0 || !nodeIdSet.Contains(n.ParentNodeId))
                .Select(RuleCorrelation.NodeId)
                .ToList(),
            summary = new
            {
                nodeCount = scope.StructuralNodes.Count,
                ruleNodeCount = scope.StructuralRuleCount,
                edgeCount = scope.StructuralEdges.Count,
                directDisabled = scope.DirectDisabledCount,
                inheritedDisabled = scope.InheritedDisabledCount,
                diagnostics = scope.DiagnosticCount
            },
            nodes = scope.StructuralNodes.Select(n =>
            {
                incomingByNodeId.TryGetValue(n.NodeId, out List<AcTreeEdge>? incomingEdges);
                incomingEdges ??= new List<AcTreeEdge>();
                AcTreeEdge? incoming = incomingEdges.Count == 1 ? incomingEdges[0] : null;
                outgoingByNodeId.TryGetValue(n.NodeId, out List<AcTreeEdge>? outgoing);
                outgoing ??= new List<AcTreeEdge>();
                return new
                {
                    nodeId = RuleCorrelation.NodeId(n),
                    rawNodeId = n.NodeId,
                    parentNodeId = n.ParentNodeId > 0 ? "node-" + n.ParentNodeId.ToString("000000") : null,
                    rawParentNodeId = n.ParentNodeId,
                    n.RuleGuid,
                    n.RuleId,
                    name = n.RuleName,
                    n.FunctionName,
                    n.FunctionVersion,
                    depth = n.HierarchyLevel,
                    ordinal = n.RuleIndexWithinScope,
                    isRuleNode = n.IsRuleNode,
                    disabled = DisabledPayload(n),
                    incomingBranch = BranchPayload(incoming),
                    incomingBranchCount = incomingEdges.Count,
                    incomingBranchAmbiguous = incomingEdges.Count > 1,
                    outgoingActions = OutgoingActions(outgoing).ToList(),
                    childCount = outgoing.Count,
                    hasWarnings = warningNodeIds.Contains(n.NodeId)
                };
            }).ToList(),
            edges = scope.StructuralEdges.Select(EdgePayload).ToList()
        };
    }

    private object BuildScopeInventory(WorkbenchSnapshot snapshot, ScopeModel scope, HttpListenerRequest request)
    {
        string? classification = Get(request, "classification");
        string? q = Get(request, "q");
        int limit = Math.Max(1, Math.Min(500, GetInt(request, "limit", 100)));
        int offset = Math.Max(0, GetInt(request, "offset", 0));

        IEnumerable<AcRuleSummary> rows = scope.FlatRules;
        if (!string.IsNullOrWhiteSpace(q))
            rows = rows.Where(r => RuleCorrelation.Contains(r.RuleName, q) || RuleCorrelation.Contains(r.FunctionName, q) || RuleCorrelation.Contains(r.RuleGuid, q) || RuleCorrelation.Contains(r.ScopeName, q));

        // Stream rows once to compute summary counts and capture only the requested page.
        int returnedCount = 0;
        int structuralMatchCount = 0;
        int flatOnlyCount = 0;
        int pageStart = offset;
        int pageEndExclusive = offset + limit;
        var pagedItems = new List<InventoryRowDto>(limit);

        foreach (AcRuleSummary row in rows)
        {
            InventoryRowDto item = InventoryRow(snapshot, row);
            if (!string.IsNullOrWhiteSpace(classification) && !RuleCorrelation.Eq(item.Classification, classification))
                continue;

            if (RuleCorrelation.Eq(item.Classification, "StructuralMatch")) structuralMatchCount++;
            if (RuleCorrelation.Eq(item.Classification, "FlatOnly")) flatOnlyCount++;

            if (returnedCount >= pageStart && returnedCount < pageEndExclusive)
                pagedItems.Add(item);

            returnedCount++;
        }

        return new
        {
            scopeId = scope.ScopeId,
            evidenceClass = "FlatInventory",
            summary = new
            {
                total = scope.FlatInventoryCount,
                structuralMatch = structuralMatchCount,
                flatOnly = flatOnlyCount,
                duplicateFlat = 0,
                unresolved = 0,
                caveat = "Inventory rows are searchable extraction evidence, not structural order proof unless classification is StructuralMatch."
            },
            page = new { limit, offset, nextOffset = offset + limit < returnedCount ? (int?)(offset + limit) : null },
            items = pagedItems
        };
    }

    private InventoryRowDto InventoryRow(WorkbenchSnapshot snapshot, AcRuleSummary rule)
    {
        string key = RuleCorrelation.FlatKey(rule);
        bool matched = snapshot.RulesByStructuralKey.TryGetValue(key, out RuleModel? structural);
        object flatDisabled = new { state = rule.DisabledState, confidence = rule.DisabledConfidence, reason = rule.DisabledReason, authority = "FlatInventory" };
        object disabled = matched && structural != null
            ? new { state = structural.Node.DisabledState, confidence = structural.Node.DisabledConfidence, reason = structural.Node.DisabledReason, authority = "Structural", flatInventory = flatDisabled }
            : flatDisabled;
        return new InventoryRowDto
        {
            InventoryId = RuleCorrelation.InventoryId(rule),
            ScopeId = RuleCorrelation.ScopeId(rule),
            RuleGuid = rule.RuleGuid,
            RuleId = rule.RuleId,
            Name = rule.RuleName,
            FunctionName = rule.FunctionName,
            RuleIndex = rule.RuleIndex,
            Disabled = disabled,
            Classification = matched ? "StructuralMatch" : "FlatOnly",
            StructuralNodeId = matched ? structural!.NodeId : null,
            RuntimeOrderProof = matched,
            EvidenceClass = matched ? "FlatInventory+Structural" : "FlatInventory"
        };
    }

    private object BuildScopeReferences(ScopeModel scope, HttpListenerRequest request)
    {
        string? confidence = Get(request, "confidence");
        string? targetType = Get(request, "targetType");
        bool runtimeOnly = GetBool(request, "runtimeDependency", false);

        IEnumerable<AcRuleRelationship> rels = scope.Relationships;
        if (!string.IsNullOrWhiteSpace(confidence)) rels = rels.Where(r => RuleCorrelation.Eq(r.Confidence, confidence));
        if (!string.IsNullOrWhiteSpace(targetType)) rels = rels.Where(r => RuleCorrelation.Eq(r.TargetType, targetType));
        if (runtimeOnly) rels = rels.Where(IsRuntimeDependency);

        return new
        {
            scopeId = scope.ScopeId,
            summary = new
            {
                total = scope.Relationships.Count,
                returned = rels.Count(),
                runtimeDependencies = scope.Relationships.Count(IsRuntimeDependency),
                heuristicMentions = scope.Relationships.Count(r => !IsRuntimeDependency(r))
            },
            items = rels.Take(1000).Select(RelationshipPayload).ToList()
        };
    }

    private object BuildScopeDiagnostics(WorkbenchSnapshot snapshot, ScopeModel scope)
    {
        var checks = new List<object>();
        if (scope.StructuralRuleCount == 0 && scope.FlatInventoryCount > 0)
        {
            checks.Add(Diagnostic("NoStructuralRules", "Warning", "No structural rules were parsed for this scope.", "Flat inventory exists, but no hierarchy/order proof is available.", "Use inventory only for search/completeness and inspect debug extraction if this is unexpected."));
        }

        if (scope.StructuralCoverageFailure)
        {
            checks.Add(Diagnostic("StructuralCoverageFailure", "Critical", scope.FlatInventoryCount + " flat inventory rows but only " + scope.StructuralRuleCount + " structural rule nodes.", "The scope is unreconciled. Do not use it for order, route, or disabled-state review until extraction is corrected.", "Regenerate structural extraction, inspect parser diagnostics, then compare Inventory against Structure."));
        }

        if (scope.FlatOnlyCount > 0)
        {
            checks.Add(Diagnostic("FlatOnlyRows", scope.StructuralCoverageFailure ? "Warning" : "Info", scope.FlatOnlyCount + " flat inventory rows do not match structural nodes.", "These rows are not runtime-order evidence.", "Open inventory with classification=FlatOnly."));
        }

        foreach (AcTreeDiagnostic d in scope.TreeDiagnostics)
        {
            checks.Add(new
            {
                code = string.IsNullOrWhiteSpace(d.Category) ? "TreeDiagnostic" : d.Category,
                severity = d.Severity,
                title = d.Category,
                detail = d.Message,
                affected = new { d.ScopePath, nodeId = d.NodeId.HasValue ? "node-" + d.NodeId.Value.ToString("000000") : null },
                recommendation = "Review this scope in Structure and compare against Inventory before treating missing/excess rows as runtime behavior."
            });
        }

        return new
        {
            scopeId = scope.ScopeId,
            health = HealthFor(scope),
            checks,
            recommendation = new[]
            {
                "Use Structure for hierarchy/order.",
                "Use Inventory for broad flat search.",
                "Do not treat flat-only rows as execution-order evidence."
            }
        };
    }

    private ApiHttpResult DispatchRule(string tail, HttpListenerRequest request)
    {
        ApiHttpResult? method = RequireMethod(request, "GET");
        if (method != null) return method;

        string[] parts = tail.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 2) return Fail(request, "InvalidRequest", "Rule node id is required.", 400);

        string nodeId = UrlDecode(parts[1]);
        string action = parts.Length > 2 ? parts[2] : string.Empty;
        WorkbenchSnapshot snapshot = GetSnapshot(request);

        if (!TryResolveRule(snapshot, nodeId, out RuleModel? rule, out string? ambiguityDetail))
        {
            if (!string.IsNullOrWhiteSpace(ambiguityDetail))
                return Fail(request, "RuleReferenceAmbiguous", "Rule reference matched multiple rules.", 409, ambiguityDetail, nodeId, "Use node-xxxxx or add scope context to disambiguate the rule guid.");

            return Fail(request, "RuleNotFound", "Rule was not found.", 404, nodeId);
        }

        RuleModel resolvedRule = rule!;
        if (string.IsNullOrWhiteSpace(action)) return Ok(request, "AcWorkbench.RuleDetail", BuildRuleDetailWithIncludes(snapshot, resolvedRule, request));
        if (action == "editor-model" || action == "configuration") return Ok(request, "AcWorkbench.SelectedRulePacket", BuildSelectedRulePacket(snapshot, resolvedRule));
        if (action == "subtree") return Ok(request, "AcWorkbench.RuleSubtree", BuildRuleSubtree(snapshot, resolvedRule, request));

        return Fail(request, "RouteNotFound", "Rule route was not found.", 404, "/api/v1/" + tail);
    }

    // Exposes canonical FWD object surfaces (documents/pages/batches/processes/resources/variants/fields)
    // so UI can use real configuration entities instead of inferred heuristics.
    private ApiHttpResult DispatchFwd(string tail, HttpListenerRequest request)
    {
        ApiHttpResult? method = RequireMethod(request, "GET");
        if (method != null) return method;

        string normalized = tail.Trim('/');
        string[] parts = normalized.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
        if (!IsKnownFwdRoute(parts))
            return Fail(request, "RouteNotFound", "FWD route was not found.", 404, "/api/v1/" + normalized);

        WorkbenchSnapshot snapshot = GetSnapshot(request);

        if (parts.Length == 1 || (parts.Length == 2 && parts[1].Equals("overview", StringComparison.OrdinalIgnoreCase)))
            return Ok(request, "AcWorkbench.FwdOverview", BuildFwdOverview(snapshot));

        if (parts.Length == 2 && parts[1].Equals("object-graph", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdObjectGraph", BuildFwdObjectGraph(snapshot, request));

        if (parts.Length == 2 && parts[1].Equals("documents", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdDocuments", BuildFwdDocuments(snapshot, request));

        if (parts.Length == 2 && parts[1].Equals("pages", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdPages", BuildFwdPages(snapshot, request));

        if (parts.Length == 2 && parts[1].Equals("batches", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdBatches", BuildFwdBatches(snapshot, request));

        if (parts.Length == 2 && parts[1].Equals("processes", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdProcesses", BuildFwdProcesses(snapshot, request));

        if (parts.Length == 3 && parts[1].Equals("processes", StringComparison.OrdinalIgnoreCase) && !parts[2].Equals("drivers", StringComparison.OrdinalIgnoreCase))
        {
            string process = UrlDecode(parts[2]);
            string? canonicalProcess = snapshot.Fwd.Processes.FirstOrDefault(p => RuleCorrelation.Eq(p, process));
            if (string.IsNullOrWhiteSpace(canonicalProcess))
                return Fail(request, "ProcessNotFound", "FWD process was not found.", 404, "/api/v1/fwd/processes/" + UrlEncode(process));
            return Ok(request, "AcWorkbench.FwdProcessDetail", BuildFwdProcessDetail(snapshot, request, canonicalProcess!));
        }

        if (parts.Length == 3 && parts[1].Equals("processes", StringComparison.OrdinalIgnoreCase) && parts[2].Equals("drivers", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdProcessDrivers", BuildFwdProcessDrivers(snapshot, request));

        if (parts.Length == 4 && parts[1].Equals("processes", StringComparison.OrdinalIgnoreCase) && parts[3].Equals("private", StringComparison.OrdinalIgnoreCase))
        {
            string process = UrlDecode(parts[2]);
            string? canonicalProcess = snapshot.Fwd.Processes.FirstOrDefault(p => RuleCorrelation.Eq(p, process));
            if (string.IsNullOrWhiteSpace(canonicalProcess))
                return Fail(request, "ProcessNotFound", "FWD process was not found.", 404, "/api/v1/fwd/processes/" + UrlEncode(process));
            var payload = _client.InspectProcessTree(new StcTraversalOptions
            {
                Path = GetFwdPath(request),
                ProcessName = canonicalProcess!,
                MaxDepth = Math.Max(0, GetInt(request, "maxDepth", 5)),
                MaxNodes = Math.Max(1, GetInt(request, "maxNodes", 1500)),
                MaxPreviewBytes = Math.Max(0, GetInt(request, "maxPreviewBytes", 256)),
                IncludeDataPreview = !GetBool(request, "noDataPreview", false),
                IncludeDotNodes = GetBool(request, "includeDotNodes", false),
                RequireNativeOk = GetBool(request, "requireNativeOk", false)
            });
            return Ok(request, "AcWorkbench.FwdProcessPrivate", payload);
        }

        if (parts.Length == 2 && parts[1].Equals("resources", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdResources", BuildFwdResources(snapshot, request));

        if (parts.Length == 2 && parts[1].Equals("functions", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdFunctions", BuildFwdFunctions(snapshot, request));

        if (parts.Length == 3 && parts[1].Equals("functions", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdFunctionDetail", BuildFwdFunctionDetail(snapshot, request, UrlDecode(parts[2])));

        if (parts.Length == 2 && parts[1].Equals("tables", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdTables", BuildFwdTablesCanonical(snapshot, request));

        if (parts.Length == 2 && parts[1].Equals("selection-lists", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.SelectionListDefinitions", BuildSelectionListDefinitions(snapshot, request));

        if (parts.Length == 3 && parts[1].Equals("tables", StringComparison.OrdinalIgnoreCase) && parts[2].Equals("inferred", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdTablesInferred", BuildFwdTablesInferred(snapshot, request));

        if (parts.Length == 2 && parts[1].Equals("udfs", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdUdfs", BuildFwdUdfsCanonical(snapshot, request));

        if (parts.Length == 3 && parts[1].Equals("udfs", StringComparison.OrdinalIgnoreCase) && parts[2].Equals("canonical", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.UdfDefinitions", BuildUdfDefinitions(snapshot, request));

        if (parts.Length == 3 && parts[1].Equals("udfs", StringComparison.OrdinalIgnoreCase) && !parts[2].Equals("inferred", StringComparison.OrdinalIgnoreCase))
        {
            string udfName = UrlDecode(parts[2]);
            return Ok(request, "AcWorkbench.FwdUdfDetail", BuildFwdUdfDetail(snapshot, request, udfName));
        }

        if (parts.Length == 3 && parts[1].Equals("udfs", StringComparison.OrdinalIgnoreCase) && parts[2].Equals("inferred", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdUdfsInferred", BuildFwdUdfsInferred(snapshot, request));

        if (parts.Length == 2 && parts[1].Equals("page-designs", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.PageDesigns", BuildPageDesigns(snapshot, request));

        if (parts.Length == 2 && parts[1].Equals("page-variants", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdPageVariants", BuildFwdPageVariants(snapshot, request));

        if (parts.Length == 2 && parts[1].Equals("fields", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdFields", BuildFwdFields(snapshot, request));

        if (parts.Length == 2 && parts[1].Equals("runtime-impact", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.RuntimeImpact", BuildRuntimeImpact(snapshot, request));

        if (parts.Length == 2 && parts[1].Equals("fip", StringComparison.OrdinalIgnoreCase))
        {
            var payload = _client.InspectFip(new FipInspectionOptions
            {
                Path = GetFwdPath(request),
                ProcessName = Get(request, "process") ?? "FIP",
                Page = Get(request, "page"),
                Variant = Get(request, "variant"),
                MaxVariants = Math.Max(1, GetInt(request, "maxVariants", 50)),
                RequireNativeOk = GetBool(request, "requireNativeOk", false)
            });
            return Ok(request, "AcWorkbench.FwdFip", payload);
        }

        return Fail(request, "RouteNotFound", "FWD route was not found.", 404, "/api/v1/" + normalized);
    }

    private static bool IsKnownFwdRoute(string[] parts)
    {
        if (parts == null || parts.Length == 0)
            return false;

        if (!parts[0].Equals("fwd", StringComparison.OrdinalIgnoreCase))
            return false;

        if (parts.Length == 1)
            return true;

        if (parts.Length == 2)
        {
            string section = parts[1];
            return section.Equals("overview", StringComparison.OrdinalIgnoreCase)
                || section.Equals("object-graph", StringComparison.OrdinalIgnoreCase)
                || section.Equals("documents", StringComparison.OrdinalIgnoreCase)
                || section.Equals("pages", StringComparison.OrdinalIgnoreCase)
                || section.Equals("batches", StringComparison.OrdinalIgnoreCase)
                || section.Equals("processes", StringComparison.OrdinalIgnoreCase)
                || section.Equals("resources", StringComparison.OrdinalIgnoreCase)
                || section.Equals("functions", StringComparison.OrdinalIgnoreCase)
                || section.Equals("tables", StringComparison.OrdinalIgnoreCase)
                || section.Equals("selection-lists", StringComparison.OrdinalIgnoreCase)
                || section.Equals("udfs", StringComparison.OrdinalIgnoreCase)
                || section.Equals("page-designs", StringComparison.OrdinalIgnoreCase)
                || section.Equals("page-variants", StringComparison.OrdinalIgnoreCase)
                || section.Equals("fields", StringComparison.OrdinalIgnoreCase)
                || section.Equals("runtime-impact", StringComparison.OrdinalIgnoreCase)
                || section.Equals("fip", StringComparison.OrdinalIgnoreCase);
        }

        if (parts.Length == 3)
        {
            if (parts[1].Equals("processes", StringComparison.OrdinalIgnoreCase))
                return true;

            if (parts[1].Equals("functions", StringComparison.OrdinalIgnoreCase))
                return true;

            if (parts[1].Equals("tables", StringComparison.OrdinalIgnoreCase))
                return parts[2].Equals("inferred", StringComparison.OrdinalIgnoreCase);

            if (parts[1].Equals("udfs", StringComparison.OrdinalIgnoreCase))
                return true;
        }

        return parts.Length == 4
            && parts[1].Equals("processes", StringComparison.OrdinalIgnoreCase)
            && parts[3].Equals("private", StringComparison.OrdinalIgnoreCase);
    }

    private object BuildFwdOverview(WorkbenchSnapshot snapshot)
    {
        int tableCount = snapshot.Fwd.Resources
            .Where(b => RuleCorrelation.Eq(b.Type, "Table"))
            .SelectMany(b => b.Names)
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Select(n => n.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Count();

        int functionResourceCount = snapshot.Fwd.Resources
            .Where(b => RuleCorrelation.Eq(b.Type, "Function") || RuleCorrelation.Eq(b.Type, "User Defined") || RuleCorrelation.Eq(b.Type, "UDF") || RuleCorrelation.Eq(b.Type, "UserDefinedFunction"))
            .SelectMany(b => b.Names)
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Select(n => n.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Count();

        int udfCount = snapshot.Fwd.Resources
            .Where(b => RuleCorrelation.Eq(b.Type, "UDF") || RuleCorrelation.Eq(b.Type, "UserDefinedFunction") || RuleCorrelation.Eq(b.Type, "User Defined"))
            .SelectMany(b => b.Names)
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Select(n => n.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Count();

        return new
        {
            source = new
            {
                path = SensitiveValueRedactor.Path(snapshot.FwdPath, _options.ShouldExposeOperationalDetails),
                release = snapshot.Fwd.ReleaseString,
                releaseDate = snapshot.Fwd.ReleaseDateString,
                releaseNumber = snapshot.Fwd.ReleaseNumber
            },
            counts = new
            {
                documents = snapshot.Fwd.Documents.Count,
                pages = snapshot.Fwd.Pages.Count,
                batches = snapshot.Fwd.Batches.Count,
                processes = snapshot.Fwd.Processes.Count,
                resourceTypes = snapshot.Fwd.Resources.Count,
                functionResources = functionResourceCount,
                tables = tableCount,
                udfs = udfCount,
                pageVariants = snapshot.Fwd.PageVariants.Sum(v => v.Variants.Count),
                fields = snapshot.Fwd.Fields.Sum(f => f.Fields.Count)
            },
            links = new
            {
                documents = "/api/v1/fwd/documents",
                pages = "/api/v1/fwd/pages",
                batches = "/api/v1/fwd/batches",
                processes = "/api/v1/fwd/processes",
                processDrivers = "/api/v1/fwd/processes/drivers",
                objectGraph = "/api/v1/fwd/object-graph",
                resources = "/api/v1/fwd/resources",
                functions = "/api/v1/fwd/functions",
                tables = "/api/v1/fwd/tables",
                selectionLists = "/api/v1/fwd/selection-lists",
                inferredTables = "/api/v1/fwd/tables/inferred",
                udfs = "/api/v1/fwd/udfs",
                canonicalUdfs = "/api/v1/fwd/udfs/canonical",
                inferredUdfs = "/api/v1/fwd/udfs/inferred",
                runtimeImpact = "/api/v1/fwd/runtime-impact",
                pageVariants = "/api/v1/fwd/page-variants",
                fields = "/api/v1/fwd/fields"
            },
            warnings = snapshot.Fwd.Warnings
        };
    }

    private object BuildFwdObjectGraph(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? kind = Get(request, "kind");
        string? q = Get(request, "q");
        var nodes = snapshot.EditorModel.ObjectGraph.Nodes
            .Where(n => string.IsNullOrWhiteSpace(kind) || RuleCorrelation.Eq(n.Kind, kind))
            .Where(n => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(n.Name, q) || RuleCorrelation.Contains(n.Id, q))
            .OrderBy(n => n.Kind, StringComparer.OrdinalIgnoreCase)
            .ThenBy(n => n.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
        var nodeIds = new HashSet<string>(nodes.Select(n => n.Id), StringComparer.OrdinalIgnoreCase);
        var edges = snapshot.EditorModel.ObjectGraph.Edges
            .Where(e => nodeIds.Contains(e.FromId) || nodeIds.Contains(e.ToId))
            .OrderBy(e => e.FromId, StringComparer.OrdinalIgnoreCase)
            .ThenBy(e => e.Kind, StringComparer.OrdinalIgnoreCase)
            .ThenBy(e => e.ToId, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new
        {
            count = nodes.Count,
            edgeCount = edges.Count,
            nodes,
            edges,
            diagnostics = snapshot.EditorModel.ObjectGraph.Diagnostics,
            caveat = "Object graph is a read-only projection over extracted FWD lists, resources, fields, and AC rule scopes."
        };
    }

    private object BuildUdfDefinitions(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? q = Get(request, "q");
        var items = snapshot.EditorModel.UdfDefinitions
            .Where(u => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(u.Name, q) || u.CallerBindings.Any(c => RuleCorrelation.Contains(c.RuleName, q) || RuleCorrelation.Contains(c.FunctionName, q)))
            .OrderByDescending(u => u.CallerBindings.Count)
            .ThenBy(u => u.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new
        {
            count = items.Count,
            items,
            caveat = "UDF definitions expose named field-list interfaces, caller bindings, status results, and an internal Rule List projection. internalRuleTree.parseState distinguishes parsed, partially parsed, opaque, and unavailable native payloads.",
            diagnostics = snapshot.EditorModel.Diagnostics.Where(d => RuleCorrelation.Contains(d, "Udf")).ToList()
        };
    }

    private object BuildSelectionListDefinitions(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? q = Get(request, "q");
        bool includeInferred = GetBool(request, "includeInferred", true);
        var items = snapshot.EditorModel.SelectionListDefinitions
            .Where(t => includeInferred || t.Canonical)
            .Where(t => string.IsNullOrWhiteSpace(q)
                || RuleCorrelation.Contains(t.Name, q)
                || t.MatchFields.Any(f => RuleCorrelation.Contains(f.Name, q))
                || t.PlugFields.Any(f => RuleCorrelation.Contains(f.Name, q)))
            .OrderByDescending(t => t.UsageLinks.Count)
            .ThenBy(t => t.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new
        {
            count = items.Count,
            items,
            caveat = "SelectionList/table schemas include parsed resource-evidence fields and option roles when available; usage-derived fields remain fallback evidence when schemaParsed is false.",
            diagnostics = snapshot.EditorModel.Diagnostics.Where(d => RuleCorrelation.Contains(d, "SelectionList")).ToList()
        };
    }

    private object BuildRuntimeImpact(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? type = Get(request, "type");
        string? scopeId = Get(request, "scopeId");
        string? q = Get(request, "q");
        var items = snapshot.EditorModel.RuntimeImpacts
            .Where(i => string.IsNullOrWhiteSpace(type) || RuleCorrelation.Eq(i.ImpactType, type))
            .Where(i => string.IsNullOrWhiteSpace(scopeId) || RuleCorrelation.Eq(i.ScopeId, scopeId))
            .Where(i => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(i.Summary, q) || RuleCorrelation.Contains(i.FunctionName, q) || RuleCorrelation.Contains(i.RuleName, q))
            .OrderBy(i => i.ScopeId, StringComparer.OrdinalIgnoreCase)
            .ThenBy(i => i.RuleNodeId, StringComparer.OrdinalIgnoreCase)
            .ThenBy(i => i.ImpactType, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new
        {
            count = items.Count,
            items,
            caveat = "Runtime impacts are static operator-impact projections. They explain possible downstream behavior but do not prove runtime execution or operator choices."
        };
    }

    private object BuildFwdDocuments(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? q = Get(request, "q");
        var items = snapshot.Fwd.Documents
            .Where(d => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(d, q))
            .OrderBy(d => d, StringComparer.OrdinalIgnoreCase)
            .Select(d => new
            {
                name = d,
                links = new
                {
                    fields = "/api/v1/fwd/fields?scopeType=Document&scopeName=" + UrlEncode(d),
                    scopes = "/api/v1/scopes?q=" + UrlEncode(d)
                }
            })
            .ToList();

        return new { count = items.Count, items };
    }

    private object BuildFwdPages(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? q = Get(request, "q");
        var variantsByPage = snapshot.Fwd.PageVariants
            .ToDictionary(v => v.Page, v => v.Variants.Count, StringComparer.OrdinalIgnoreCase);

        var items = snapshot.Fwd.Pages
            .Where(p => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(p, q))
            .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
            .Select(p => new
            {
                name = p,
                variantCount = variantsByPage.TryGetValue(p, out int count) ? count : 0,
                links = new
                {
                    variants = "/api/v1/fwd/page-variants?page=" + UrlEncode(p),
                    fields = "/api/v1/fwd/fields?scopeType=Page&scopeName=" + UrlEncode(p),
                    scopes = "/api/v1/scopes?q=" + UrlEncode(p)
                }
            })
            .ToList();

        return new { count = items.Count, items };
    }

    private object BuildFwdBatches(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? q = Get(request, "q");
        var items = snapshot.Fwd.Batches
            .Where(b => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(b, q))
            .OrderBy(b => b, StringComparer.OrdinalIgnoreCase)
            .Select(b => new { name = b, links = new { scopes = "/api/v1/scopes?q=" + UrlEncode(b) } })
            .ToList();

        return new { count = items.Count, items };
    }

    private object BuildFwdProcesses(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? q = Get(request, "q");
        bool includePrivateSummary = GetBool(request, "includePrivateSummary", false);
        var items = snapshot.Fwd.Processes
            .Where(p => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(p, q))
            .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
            .Select(p => BuildProcessSummary(snapshot, request, p, includePrivateSummary))
            .ToList();

        return new { count = items.Count, items };
    }

    // Canonical process identity with explicit private-config/readability summary.
    private object BuildFwdProcessDetail(WorkbenchSnapshot snapshot, HttpListenerRequest request, string processName)
    {
        return BuildProcessSummary(snapshot, request, processName, includePrivateSummary: true);
    }

    private ProcessSummaryVm BuildProcessSummary(WorkbenchSnapshot snapshot, HttpListenerRequest request, string processName, bool includePrivateSummary)
    {
        (string role, string confidence) = GuessProcessRole(processName);
        var vm = new ProcessSummaryVm
        {
            Name = processName,
            Source = "Fwd.ProcessNames",
            Canonical = true,
            Role = role,
            RoleConfidence = confidence,
            IsDriver = false,
            Links = new ProcessLinksVm
            {
                Self = "/api/v1/fwd/processes/" + UrlEncode(processName),
                PrivateConfig = "/api/v1/fwd/processes/" + UrlEncode(processName) + "/private",
                Scopes = "/api/v1/scopes?q=" + UrlEncode(processName)
            }
        };

        if (!includePrivateSummary)
            return vm;

        ProcessPrivateSummaryCacheEntry privateSummary = GetCachedProcessPrivateSummary(snapshot, request, processName);
        vm.HasPrivateNode = privateSummary.HasPrivateNode;
        vm.PrivateChildCount = privateSummary.PrivateChildCount;
        vm.Warnings.AddRange(privateSummary.Warnings);

        return vm;
    }

    private ProcessPrivateSummaryCacheEntry GetCachedProcessPrivateSummary(WorkbenchSnapshot snapshot, HttpListenerRequest request, string processName)
    {
        string path = GetFwdPath(request);
        int maxDepth = Math.Max(0, GetInt(request, "maxDepth", 1));
        int maxNodes = Math.Max(1, GetInt(request, "maxNodes", 300));
        bool requireNativeOk = GetBool(request, "requireNativeOk", false);
        string cacheKey = string.Join("|", snapshot.SnapshotId ?? "no-snapshot", path, processName, maxDepth.ToString(), maxNodes.ToString(), requireNativeOk.ToString());

        lock (_processPrivateSummaryCacheGate)
        {
            if (_processPrivateSummaryCache.TryGetValue(cacheKey, out ProcessPrivateSummaryCacheEntry? cached))
                return cached;

            ProcessPrivateSummaryCacheEntry built = BuildProcessPrivateSummary(path, processName, maxDepth, maxNodes, requireNativeOk);
            _processPrivateSummaryCache[cacheKey] = built;
            return built;
        }
    }

    private ProcessPrivateSummaryCacheEntry BuildProcessPrivateSummary(string path, string processName, int maxDepth, int maxNodes, bool requireNativeOk)
    {
        try
        {
            StcTreeReport tree = _client.InspectProcessTree(new StcTraversalOptions
            {
                Path = path,
                ProcessName = processName,
                MaxDepth = maxDepth,
                MaxNodes = maxNodes,
                MaxPreviewBytes = 0,
                IncludeDataPreview = false,
                IncludeDotNodes = false,
                RequireNativeOk = requireNativeOk
            });

            return new ProcessPrivateSummaryCacheEntry
            {
                HasPrivateNode = tree.Nodes.Count > 0,
                PrivateChildCount = tree.Nodes.Count(n => n.Depth == 1),
                Warnings = tree.Warnings.ToList()
            };
        }
        catch (Exception ex)
        {
            return new ProcessPrivateSummaryCacheEntry
            {
                HasPrivateNode = false,
                PrivateChildCount = 0,
                Warnings = new List<string> { "ProcessWithoutPrivateNode: " + ex.Message }
            };
        }
    }

    private static (string role, string confidence) GuessProcessRole(string processName)
    {
        string p = processName ?? string.Empty;
        if (p.Equals("AC", StringComparison.OrdinalIgnoreCase)) return ("AutoCapture", "High");
        if (p.Equals("DV", StringComparison.OrdinalIgnoreCase)) return ("DataValidation", "High");
        if (p.Equals("FIP", StringComparison.OrdinalIgnoreCase)) return ("FormsImageProcessing", "High");
        if (p.IndexOf("OCR", StringComparison.OrdinalIgnoreCase) >= 0) return ("Ocr", "High");
        if (p.IndexOf("Render", StringComparison.OrdinalIgnoreCase) >= 0) return ("Render", "High");
        if (p.IndexOf("Store", StringComparison.OrdinalIgnoreCase) >= 0) return ("Store", "High");
        if (p.IndexOf("Input", StringComparison.OrdinalIgnoreCase) >= 0 || p.IndexOf("Pickup", StringComparison.OrdinalIgnoreCase) >= 0 || p.IndexOf("EDI", StringComparison.OrdinalIgnoreCase) >= 0) return ("Input", "Medium");
        if (p.Equals("KEReview", StringComparison.OrdinalIgnoreCase)) return ("KeyEntryReview", "Medium");
        if (p.IndexOf("KE", StringComparison.OrdinalIgnoreCase) >= 0 || p.IndexOf("KFI", StringComparison.OrdinalIgnoreCase) >= 0 || p.IndexOf("WebKey", StringComparison.OrdinalIgnoreCase) >= 0) return ("Keying", "Medium");
        return ("Unknown", "Low");
    }

    // Extract process-private driver/config findings from STC trees without conflating process inventory with drivers.
    private object BuildFwdProcessDrivers(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? q = Get(request, "q");
        int maxDepth = Math.Max(0, GetInt(request, "maxDepth", 6));
        int maxNodes = Math.Max(1, GetInt(request, "maxNodes", 1500));
        int maxFindings = Math.Max(1, GetInt(request, "maxFindings", 60));

        var processes = snapshot.Fwd.Processes
            .Where(p => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(p, q))
            .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var items = new List<object>();
        foreach (string process in processes)
        {
            try
            {
                StcTreeReport tree = _client.InspectProcessTree(new StcTraversalOptions
                {
                    Path = GetFwdPath(request),
                    ProcessName = process,
                    MaxDepth = maxDepth,
                    MaxNodes = maxNodes,
                    MaxPreviewBytes = Math.Max(0, GetInt(request, "maxPreviewBytes", 160)),
                    IncludeDataPreview = !GetBool(request, "noDataPreview", false),
                    IncludeDotNodes = GetBool(request, "includeDotNodes", false),
                    RequireNativeOk = GetBool(request, "requireNativeOk", false)
                });

                var findings = tree.Nodes
                    .Where(n => LooksLikeDriverNode(n.Name, n.Path, n.ValuePreview, n.DataPreviewText))
                    .Select(n => new
                    {
                        path = n.Path,
                        name = n.Name,
                        valuePreview = n.ValuePreview,
                        dataPreview = n.DataPreviewText,
                        confidence = ClassifyDriverConfidence(n.Name, n.Path, n.ValuePreview, n.DataPreviewText),
                        source = "CanonicalProcessPrivateConfig"
                    })
                    .Take(maxFindings)
                    .ToList();

                items.Add(new
                {
                    processName = process,
                    source = "CanonicalProcessPrivateConfig",
                    classification = "DriverLikePrivateNode",
                    parsedDriverConfig = false,
                    findingCount = findings.Count,
                    findings,
                    diagnostics = new[] { "DriverConfigNotParsed" },
                    warnings = tree.Warnings,
                    truncated = tree.Truncated
                });
            }
            catch (Exception ex)
            {
                items.Add(new
                {
                    processName = process,
                    source = "CanonicalProcessPrivateConfig",
                    classification = "DriverLikePrivateNode",
                    parsedDriverConfig = false,
                    findingCount = 0,
                    findings = new List<object>(),
                    diagnostics = new[] { "DriverConfigNotParsed" },
                    warnings = new List<string> { ex.Message },
                    truncated = false
                });
            }
        }

        return new
        {
            count = items.Count,
            items,
            notes = new[]
            {
                "Processes are canonical process nodes.",
                "Driver findings are extracted from process-private STC paths and remain config evidence, not runtime proof."
            }
        };
    }

    private object BuildFwdResources(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? type = Get(request, "type");
        string? q = Get(request, "q");
        bool includeDetails = GetBool(request, "includeDetails", false);
        bool includePrivate = GetBool(request, "includePrivate", false);
        FwdInspectionReport? detailed = includeDetails ? snapshot.Fwd : null;

        var usedBy = snapshot.Relationships.Relationships
            .Where(r => !string.IsNullOrWhiteSpace(r.Target))
            .GroupBy(r => r.Target, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var buckets = snapshot.Fwd.Resources
            .Where(r => string.IsNullOrWhiteSpace(type) || RuleCorrelation.Eq(r.Type, type))
            .OrderBy(r => r.Type, StringComparer.OrdinalIgnoreCase)
            .Select(r => new
            {
                type = r.Type,
                count = r.Names.Count,
                names = r.Names
                    .Where(n => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(n, q))
                    .OrderBy(n => n, StringComparer.OrdinalIgnoreCase)
                    .Select(n => new
                    {
                        name = n,
                        usedByRuleCount = usedBy.TryGetValue(n, out List<AcRuleRelationship>? refs) ? refs.Count : 0,
                        usedBy = usedBy.TryGetValue(n, out refs)
                            ? refs.Take(100).Select(x => (object)new { x.ScopePath, x.RuleIndex, x.RuleGuid, x.RuleName, x.FunctionName, x.Kind, x.TargetType }).ToList()
                            : new List<object>(),
                        details = detailed == null
                            ? null
                            : detailed.ResourceTypeDetails
                                .Where(t => RuleCorrelation.Eq(t.Type, r.Type))
                                .SelectMany(t => t.Resources)
                                .Where(x => RuleCorrelation.Eq(x.Name, n))
                                .Select(x => new
                                {
                                    category = x.Category,
                                    fullConfig = x.FullAttributes,
                                    publicConfig = x.PublicAttributes,
                                    privateTree = includePrivate ? x.PrivateTree : null,
                                    warnings = x.Warnings
                                })
                                .FirstOrDefault()
                    })
                    .ToList()
            })
            .ToList();

        return new { count = buckets.Sum(b => b.count), buckets };
    }

private object BuildPageDesigns(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? page = Get(request, "page");
        string? q = Get(request, "q");

        var items = snapshot.EditorModel.PageDesigns
            .Where(p => string.IsNullOrWhiteSpace(page) || RuleCorrelation.Eq(p.Page, page))
            .Where(p => string.IsNullOrWhiteSpace(q)
                || RuleCorrelation.Contains(p.Page, q)
                || p.Variants.Any(v => RuleCorrelation.Contains(v.Name, q) || RuleCorrelation.Contains(v.FormId, q))
                || p.Fields.Any(f => RuleCorrelation.Contains(f.Name, q) || RuleCorrelation.Contains(f.FieldType, q) || RuleCorrelation.Contains(f.Geometry, q)))
            .OrderBy(p => p.Page, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new
        {
            page,
            count = items.Count,
            fieldCount = items.Sum(i => i.Fields.Count),
            variantCount = items.Sum(i => i.Variants.Count),
            items,
            evidence = new[]
            {
                "Fwd.Pages",
                "Fwd.PageVariants",
                "Fwd.Fields",
                "RuleFieldResolution",
                "FipInspectionRoute"
            },
            caveat = "Page designs are static FormWorks configuration packets. FIP dropout and OMR details are linked through /api/v1/fwd/fip and are not runtime execution proof."
        };
    }

    private object BuildFwdPageVariants(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? page = Get(request, "page");
        string? q = Get(request, "q");

        var items = snapshot.Fwd.PageVariants
            .Where(v => string.IsNullOrWhiteSpace(page) || RuleCorrelation.Eq(v.Page, page))
            .OrderBy(v => v.Page, StringComparer.OrdinalIgnoreCase)
            .Select(v => new
            {
                page = v.Page,
                variants = v.Variants
                    .Where(name => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(name, q))
                    .OrderBy(name => name, StringComparer.OrdinalIgnoreCase)
                    .ToList()
            })
            .ToList();

        return new { page, count = items.Sum(i => i.variants.Count), items };
    }

// Relationship-derived table candidates are emitted separately and never treated as canonical inventory.
// Function resource candidate inventory: canonical resource names plus usage-side evidence.
    // This is intentionally not a full UDF-definition parser.
// Function/UDF usage detail with explicit separation between definition fields and caller rules.
// Weak-signal UDF candidates from function-name patterns, emitted separately from canonical resources.
private static Dictionary<string, List<AcRuleRelationship>> BuildRuleRelationshipIndex(WorkbenchSnapshot snapshot)
    {
        return snapshot.Relationships.Relationships
            .GroupBy(r => string.Join("|",
                RuleCorrelation.ScopeId(r.ScopePath, r.ScopeType, r.ScopeName),
                r.RuleGuid ?? string.Empty,
                r.RuleIndex.ToString(),
                r.RuleName ?? string.Empty,
                r.FunctionName ?? string.Empty), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);
    }

    private static bool LooksLikeDriverNode(params string?[] values)
    {
        string probe = string.Join(" ", values.Where(v => !string.IsNullOrWhiteSpace(v)));
        if (string.IsNullOrWhiteSpace(probe))
            return false;
        return Regex.IsMatch(probe, "driver|input|output|twain|scan|ocr|render|store|fip", RegexOptions.IgnoreCase);
    }

    private static string ClassifyDriverConfidence(params string?[] values)
    {
        string probe = string.Join(" ", values.Where(v => !string.IsNullOrWhiteSpace(v)));
        if (Regex.IsMatch(probe, "driver", RegexOptions.IgnoreCase))
            return "High";
        if (Regex.IsMatch(probe, "input|output|twain|scan|ocr|render|store|fip", RegexOptions.IgnoreCase))
            return "Medium";
        return "Low";
    }

    private static bool LooksLikeTableIdentifier(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        string name = value.Trim();
        if (name.Length < 2 || name.Length > 80)
            return false;

        if (name.IndexOfAny(new[] { '.', '!', '?', ':', ';', '\\', '/', '"' }) >= 0)
            return false;

        if (Regex.IsMatch(name, "\\b(please|failed|verify|disabled to save|reverting|confirm|not found)\\b", RegexOptions.IgnoreCase))
            return false;

        if (name.Count(char.IsWhiteSpace) > 2)
            return false;

        return Regex.IsMatch(name, @"^[A-Za-z0-9_ -]+$");
    }

    private object BuildFwdFields(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? scopeType = Get(request, "scopeType");
        string? scopeName = Get(request, "scopeName");
        string? q = Get(request, "q");
        var pageDesignsByName = snapshot.EditorModel.PageDesigns.ToDictionary(p => p.Page, StringComparer.OrdinalIgnoreCase);

        var items = snapshot.Fwd.Fields
            .Where(f => string.IsNullOrWhiteSpace(scopeType) || RuleCorrelation.Eq(f.ScopeType, scopeType))
            .Where(f => string.IsNullOrWhiteSpace(scopeName) || RuleCorrelation.Eq(f.ScopeName, scopeName))
            .OrderBy(f => f.ScopeType, StringComparer.OrdinalIgnoreCase)
            .ThenBy(f => f.ScopeName, StringComparer.OrdinalIgnoreCase)
            .Select(f => new
            {
                scopeType = f.ScopeType,
                scopeName = f.ScopeName,
                fields = f.Fields
                    .Where(x => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(x.Name, q) || RuleCorrelation.Contains(x.Type, q) || RuleCorrelation.Contains(x.Geometry, q))
                    .OrderBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
                    .Select(x => new
                    {
                        name = x.Name,
                        type = x.Type,
                        geometry = x.Geometry,
                        subfieldCount = x.SubfieldCount,
                        design = RuleCorrelation.Eq(f.ScopeType, "Page") && pageDesignsByName.TryGetValue(f.ScopeName, out EditorPageDesignModel? pageDesign)
                            ? pageDesign.Fields.FirstOrDefault(d => RuleCorrelation.Eq(d.Name, x.Name))
                            : null
                    })
                    .ToList()
            })
            .ToList();

        return new { count = items.Sum(i => i.fields.Count), items };
    }

private static object ScopeCounts(ScopeModel scope)
    {
        return new
        {
            structuralRules = scope.StructuralRuleCount,
            flatInventoryRows = scope.FlatInventoryCount,
            flatOnlyRows = scope.FlatOnlyCount,
            structuralCoverageGap = scope.StructuralCoverageGap,
            structuralCoverageRatio = double.IsInfinity(scope.StructuralCoverageRatio) ? "Infinity" : scope.StructuralCoverageRatio.ToString("0.###"),
            structuralCoverageFailure = scope.StructuralCoverageFailure,
            directDisabled = scope.DirectDisabledCount,
            inheritedDisabled = scope.InheritedDisabledCount,
            references = scope.ReferenceCount,
            diagnostics = scope.DiagnosticCount
        };
    }

    private static object HealthFor(ScopeModel scope)
    {
        string status = scope.StructuralCoverageFailure
            ? "Critical"
            : scope.DiagnosticCount > 0 || scope.FlatOnlyCount > Math.Max(25, scope.StructuralRuleCount / 4)
                ? "Warning"
                : "Ok";

        var reasons = new List<object>();
        if (scope.StructuralCoverageFailure)
        {
            reasons.Add(new
            {
                code = "StructuralCoverageFailure",
                severity = "Critical",
                detail = scope.FlatInventoryCount + " flat rows vs " + scope.StructuralRuleCount + " structural rules"
            });
        }

        reasons.AddRange(scope.TreeDiagnostics
            .Select(d => (object)new { code = d.Category, severity = d.Severity })
            .Take(10));

        return new
        {
            status,
            diagnosticCount = scope.DiagnosticCount,
            reasons
        };
    }

    private static object ScopeLinks(string scopeId)
    {
        string encoded = UrlEncode(scopeId);
        return new
        {
            self = "/api/v1/scopes/" + encoded,
            structure = "/api/v1/scopes/" + encoded + "/structure",
            inventory = "/api/v1/scopes/" + encoded + "/inventory",
            references = "/api/v1/scopes/" + encoded + "/references",
            diagnostics = "/api/v1/scopes/" + encoded + "/diagnostics"
        };
    }

    private static object DisabledPayload(AcTreeNode node)
    {
        return new
        {
            state = string.IsNullOrWhiteSpace(node.DisabledState) ? AcDisabledStates.Enabled : node.DisabledState,
            direct = node.DisabledState == AcDisabledStates.DisabledDirect,
            inherited = node.DisabledState == AcDisabledStates.DisabledInherited,
            confidence = node.DisabledConfidence,
            reason = node.DisabledReason,
            authority = "Structural",
            sourceNodeId = node.DisabledAncestorNodeId.HasValue ? "node-" + node.DisabledAncestorNodeId.Value.ToString("000000") : null,
            evidence = node.DisabledEvidence
        };
    }

    private static object? BranchPayload(AcTreeEdge? edge)
    {
        if (edge == null)
            return null;

        return new
        {
            kind = edge.EdgeKind,
            actionListIndex = edge.ActionListIndex,
            actionName = edge.ActionName,
            actionNameResolved = edge.ActionNameResolved,
            routeState = RouteState(edge),
            label = ActionLabel(edge),
            confidence = edge.Confidence,
            evidence = edge.Evidence,
            parentNodeId = "node-" + edge.FromNodeId.ToString("000000")
        };
    }

    private static object EdgePayload(AcTreeEdge edge)
    {
        return new
        {
            fromNodeId = "node-" + edge.FromNodeId.ToString("000000"),
            toNodeId = "node-" + edge.ToNodeId.ToString("000000"),
            edge.EdgeKind,
            edge.ActionListIndex,
            edge.ActionName,
            edge.ActionNameResolved,
            routeState = RouteState(edge),
            label = ActionLabel(edge),
            edge.Confidence,
            edge.Evidence
        };
    }

    private static string RouteState(AcTreeEdge edge)
    {
        if (edge.EdgeKind == "RootListEntry" || edge.ActionListIndex < 0)
            return "Root";

        if (edge.ActionNameResolved || !string.IsNullOrWhiteSpace(edge.ActionName))
            return "Resolved";

        return edge.ActionListIndex >= 0 ? "IndexOnly" : "Unresolved";
    }

    private static string ActionLabel(AcTreeEdge edge)
    {
        if (!string.IsNullOrWhiteSpace(edge.ActionName))
            return edge.ActionName!;

        return edge.ActionListIndex < 0 ? "Root list" : "Action " + edge.ActionListIndex.ToString();
    }

    private static IEnumerable<object> OutgoingActions(IEnumerable<AcTreeEdge> outgoingEdges)
    {
        var groups = outgoingEdges
            .GroupBy(e => e.ActionListIndex)
            .OrderBy(g => g.Key);

        foreach (var group in groups)
        {
            AcTreeEdge first = group.First();
            yield return new
            {
                actionListIndex = group.Key,
                actionName = first.ActionName,
                actionNameResolved = first.ActionNameResolved,
                label = ActionLabel(first),
                childCount = group.Count(),
                childNodeIds = group.Select(e => "node-" + e.ToNodeId.ToString("000000")).ToList()
            };
        }
    }

    private static IEnumerable<object> FlattenParameters(Dictionary<string, List<string>> parameters)
    {
        foreach (KeyValuePair<string, List<string>> pair in parameters)
        {
            foreach (string value in pair.Value)
            {
                yield return new
                {
                    name = pair.Key,
                    value,
                    kind = InferParameterKind(pair.Key, value),
                    source = "RuleParameter",
                    confidence = "High"
                };
            }
        }
    }

    private static object RelationshipPayload(AcRuleRelationship r)
    {
        return new
        {
            kind = r.Kind,
            targetType = r.TargetType,
            target = r.Target,
            parameterName = r.ParameterName,
            parameterRole = r.ParameterRole,
            functionName = r.FunctionName,
            runtimeDependency = IsRuntimeDependency(r),
            confidence = r.Confidence,
            evidence = r.Evidence ?? r.RelationshipReason,
            reason = r.RelationshipReason,
            source = new { r.ScopePath, r.RuleIndex, r.RuleGuid, r.RuleName }
        };
    }

    private static bool IsRuntimeDependency(AcRuleRelationship r)
    {
        if (r.IsOptionParameter) return false;
        if (RuleCorrelation.Eq(r.Confidence, "Low")) return false;
        if (RuleCorrelation.Contains(r.Kind, "Mention")) return false;
        if (RuleCorrelation.Contains(r.ParameterRole, "Option")) return false;
        return !string.IsNullOrWhiteSpace(r.Target);
    }

    private static object Diagnostic(string code, string severity, string title, string impact, string recommendation)
    {
        return new { code, severity, title, impact, recommendation };
    }

    private static IEnumerable<string> BuildRulePath(ScopeModel scope, AcTreeNode node)
    {
        return BuildRuleRoutePath(scope, node).Select(x => x.Display);
    }

    private static IEnumerable<RoutePathSegment> BuildRuleRoutePath(ScopeModel scope, AcTreeNode node)
    {
        var byNodeId = scope.StructuralNodes.ToDictionary(n => n.NodeId);
        var incomingByChild = scope.StructuralEdges.GroupBy(e => e.ToNodeId).ToDictionary(g => g.Key, g => g.First());
        var path = new List<RoutePathSegment>();
        AcTreeNode? current = node;
        int guard = 0;
        while (current != null && guard++ < 128)
        {
            incomingByChild.TryGetValue(current.NodeId, out AcTreeEdge? incoming);
            string name = current.RuleName ?? current.FunctionName ?? RuleCorrelation.NodeId(current);
            string? actionName = incoming?.ActionName;
            string? display = incoming == null
                ? name
                : string.IsNullOrWhiteSpace(actionName)
                    ? "Action " + incoming.ActionListIndex.ToString() + " → " + name
                    : actionName + " → " + name;

            path.Add(new RoutePathSegment
            {
                NodeId = RuleCorrelation.NodeId(current),
                Name = name,
                FunctionName = current.FunctionName,
                IncomingActionIndex = incoming?.ActionListIndex,
                IncomingActionName = actionName,
                IncomingActionNameResolved = incoming?.ActionNameResolved ?? false,
                Display = display
            });

            if (current.ParentNodeId <= 0 || !byNodeId.TryGetValue(current.ParentNodeId, out AcTreeNode? parent)) break;
            current = parent;
        }
        path.Reverse();
        return path;
    }

    private sealed class RoutePathSegment
    {
        public string NodeId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string? FunctionName { get; set; }
        public int? IncomingActionIndex { get; set; }
        public string? IncomingActionName { get; set; }
        public bool IncomingActionNameResolved { get; set; }
        public string Display { get; set; } = string.Empty;
    }

    private static IEnumerable<string> BadgesForScope(ScopeModel scope)
    {
        if (scope.StructuralCoverageFailure) yield return "Coverage failure";
        if (scope.DiagnosticCount > 0) yield return "Warnings";
        if (scope.DirectDisabledCount > 0) yield return "Disabled";
        if (scope.FlatOnlyCount > 0) yield return "Flat only";
    }

    private static IEnumerable<string> BadgesForNode(AcTreeNode node)
    {
        if (node.DisabledState == AcDisabledStates.DisabledDirect) yield return "Disabled";
        if (node.DisabledState == AcDisabledStates.DisabledInherited) yield return "Disabled by parent";
    }

    private static string InferParameterKind(string name, string value)
    {
        string combined = (name + " " + value).ToLowerInvariant();
        if (combined.Contains("field")) return "Field";
        if (combined.Contains("table") || combined.EndsWith(".tbl", StringComparison.OrdinalIgnoreCase)) return "Table";
        if (combined.Contains("attr")) return "Attribute";
        return "Value";
    }

    private static bool IsScopeAction(string value)
    {
        return value.Equals("structure", StringComparison.OrdinalIgnoreCase)
            || value.Equals("inventory", StringComparison.OrdinalIgnoreCase)
            || value.Equals("references", StringComparison.OrdinalIgnoreCase)
            || value.Equals("diagnostics", StringComparison.OrdinalIgnoreCase);
    }

    private static string DecodeJoined(string[] parts, int start, int count)
    {
        if (count <= 0) return string.Empty;
        return RuleCorrelation.NormalizeScopeId(UrlDecode(string.Join("/", parts.Skip(start).Take(count))));
    }

    private static string? Get(HttpListenerRequest request, string name)
    {
        string? value = request.QueryString[name];
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    private static int GetInt(HttpListenerRequest request, string name, int defaultValue)
    {
        string? value = Get(request, name);
        return int.TryParse(value, out int parsed) ? parsed : defaultValue;
    }

    private static bool GetBool(HttpListenerRequest request, string name, bool defaultValue)
    {
        string? value = Get(request, name);
        if (string.IsNullOrWhiteSpace(value)) return defaultValue;
        if (bool.TryParse(value, out bool parsed)) return parsed;
        return value == "1" || value!.Equals("yes", StringComparison.OrdinalIgnoreCase) || value.Equals("on", StringComparison.OrdinalIgnoreCase) || value.Equals("true", StringComparison.OrdinalIgnoreCase);
    }

    // Request-level mode gives the harness a way to select cached, live-coherent, or forced-rebuild behavior per call.
    private static SnapshotModeRequest GetSnapshotModeRequest(HttpListenerRequest request)
    {
        string? value = Get(request, "snapshotMode");
        if (string.IsNullOrWhiteSpace(value)) return SnapshotModeRequest.Default;

        switch (value!.Trim().ToLowerInvariant())
        {
            case "live":
                return SnapshotModeRequest.Live;
            case "rebuild":
            case "fresh":
                return SnapshotModeRequest.Rebuild;
            case "snapshot":
            case "cached":
            case "cache":
                return SnapshotModeRequest.Snapshot;
            default:
                return SnapshotModeRequest.Default;
        }
    }

    private enum SnapshotModeRequest
    {
        Default,
        Live,
        Rebuild,
        Snapshot
    }

    private static string UrlDecode(string value) => WebUtility.UrlDecode(value ?? string.Empty) ?? string.Empty;
    private static string UrlEncode(string value) => WebUtility.UrlEncode(value ?? string.Empty) ?? string.Empty;


    private sealed class InventoryRowDto
    {
        [JsonProperty("inventoryId")]
        public string InventoryId { get; set; } = string.Empty;
        [JsonProperty("scopeId")]
        public string ScopeId { get; set; } = string.Empty;
        [JsonProperty("ruleGuid")]
        public string? RuleGuid { get; set; }
        [JsonProperty("ruleId")]
        public string? RuleId { get; set; }
        [JsonProperty("name")]
        public string? Name { get; set; }
        [JsonProperty("functionName")]
        public string? FunctionName { get; set; }
        [JsonProperty("ruleIndex")]
        public int RuleIndex { get; set; }
        [JsonProperty("disabled")]
        public object? Disabled { get; set; }
        [JsonProperty("classification")]
        public string Classification { get; set; } = string.Empty;
        [JsonProperty("structuralNodeId")]
        public string? StructuralNodeId { get; set; }
        [JsonProperty("runtimeOrderProof")]
        public bool RuntimeOrderProof { get; set; }
        [JsonProperty("evidenceClass")]
        public string EvidenceClass { get; set; } = string.Empty;
    }

    private sealed class TableVm
    {
        public string Name { get; set; } = string.Empty;
        public bool Canonical { get; set; }
        public string Source { get; set; } = "CanonicalFwdResource";
        public string Confidence { get; set; } = "High";
        public string ResourceType { get; set; } = "Table";
        public int ReferenceCount { get; set; }
        public HashSet<string> ScopeIds { get; } = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        public HashSet<string> RuleKeys { get; } = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, TableColumnVm> Columns { get; } = new Dictionary<string, TableColumnVm>(StringComparer.OrdinalIgnoreCase);
    }

    private sealed class TableColumnVm
    {
        public string Name { get; set; } = string.Empty;
        public int Hits { get; set; }
        public string Confidence { get; set; } = "Medium";
    }

    private sealed class FunctionCatalogItemVm
    {
        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;
        [JsonProperty("category")]
        public string Category { get; set; } = "Unknown";
        [JsonProperty("description")]
        public string Description { get; set; } = string.Empty;
        [JsonProperty("source")]
        public string Source { get; set; } = string.Empty;
        [JsonProperty("defined")]
        public bool Defined { get; set; }
        [JsonProperty("observed")]
        public bool Observed { get; set; }
        [JsonProperty("functionResource")]
        public bool FunctionResource { get; set; }
        [JsonProperty("resourceTypes")]
        public List<string> ResourceTypes { get; set; } = new List<string>();
        [JsonProperty("deprecated")]
        public bool Deprecated { get; set; }
        [JsonProperty("statusResults")]
        public List<string> StatusResults { get; set; } = new List<string>();
        [JsonProperty("configuredStatusResults")]
        public List<string> ConfiguredStatusResults { get; set; } = new List<string>();
        [JsonProperty("parameterRoles")]
        public List<string> ParameterRoles { get; set; } = new List<string>();
        [JsonProperty("parameterSchema")]
        public List<AcFunctionCatalog.FunctionParameterSchema> ParameterSchema { get; set; } = new List<AcFunctionCatalog.FunctionParameterSchema>();
        [JsonProperty("observedParameterNames")]
        public List<string> ObservedParameterNames { get; set; } = new List<string>();
        [JsonProperty("unknownObservedParameterNames")]
        public List<string> UnknownObservedParameterNames { get; set; } = new List<string>();
        [JsonProperty("schemaProfile")]
        public AcFunctionCatalog.FunctionSchemaProfile? SchemaProfile { get; set; }
        [JsonProperty("behaviorFlags")]
        public List<string> BehaviorFlags { get; set; } = new List<string>();
        [JsonProperty("runtimeImpacts")]
        public List<string> RuntimeImpacts { get; set; } = new List<string>();
        [JsonProperty("evidence")]
        public string Evidence { get; set; } = string.Empty;
        [JsonProperty("statusResultCaveat")]
        public string StatusResultCaveat { get; set; } = string.Empty;
        [JsonProperty("observedRuleCount")]
        public int ObservedRuleCount { get; set; }
        [JsonProperty("flatInventoryRuleCount")]
        public int FlatInventoryRuleCount { get; set; }
        [JsonProperty("structuralRuleCount")]
        public int StructuralRuleCount { get; set; }
        [JsonProperty("relationshipCount")]
        public int RelationshipCount { get; set; }
        [JsonProperty("scopes")]
        public List<string> Scopes { get; set; } = new List<string>();
        [JsonProperty("usage")]
        public List<FunctionUsageVm> Usage { get; } = new List<FunctionUsageVm>();
        [JsonProperty("relationships")]
        public List<object> Relationships { get; } = new List<object>();
        [JsonProperty("diagnostics")]
        public List<string> Diagnostics { get; } = new List<string>();
        [JsonProperty("links")]
        public FunctionLinksVm Links { get; set; } = new FunctionLinksVm();
    }

    private sealed class FunctionLinksVm
    {
        [JsonProperty("self")]
        public string Self { get; set; } = string.Empty;
        [JsonProperty("search")]
        public string Search { get; set; } = string.Empty;
        [JsonProperty("udfs")]
        public string? Udfs { get; set; }
    }

    private sealed class FunctionUsageVm
    {
        [JsonProperty("scopeId")]
        public string ScopeId { get; set; } = string.Empty;
        [JsonProperty("scopePath")]
        public string ScopePath { get; set; } = string.Empty;
        [JsonProperty("scopeType")]
        public string ScopeType { get; set; } = string.Empty;
        [JsonProperty("scopeName")]
        public string ScopeName { get; set; } = string.Empty;
        [JsonProperty("ruleIndex")]
        public int RuleIndex { get; set; }
        [JsonProperty("ruleGuid")]
        public string? RuleGuid { get; set; }
        [JsonProperty("ruleId")]
        public string? RuleId { get; set; }
        [JsonProperty("ruleName")]
        public string? RuleName { get; set; }
        [JsonProperty("functionName")]
        public string? FunctionName { get; set; }
        [JsonProperty("nodeId")]
        public string? NodeId { get; set; }
        [JsonProperty("evidenceClass")]
        public string EvidenceClass { get; set; } = string.Empty;
        [JsonProperty("statusResults")]
        public List<string> StatusResults { get; set; } = new List<string>();
        [JsonProperty("parameters")]
        public Dictionary<string, List<string>> Parameters { get; set; } = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
    }

    private sealed class ProcessPrivateSummaryCacheEntry
    {
        public bool HasPrivateNode { get; set; }
        public int PrivateChildCount { get; set; }
        public List<string> Warnings { get; set; } = new List<string>();
    }

    private sealed class ProcessSummaryVm
    {
        public string Name { get; set; } = string.Empty;
        public string Source { get; set; } = "Fwd.ProcessNames";
        public bool Canonical { get; set; } = true;
        public string Role { get; set; } = "Unknown";
        public string RoleConfidence { get; set; } = "Low";
        public bool IsDriver { get; set; }
        public bool HasPrivateNode { get; set; }
        public int PrivateChildCount { get; set; }
        public List<string> Warnings { get; } = new List<string>();
        public ProcessLinksVm Links { get; set; } = new ProcessLinksVm();
    }

    private sealed class ProcessLinksVm
    {
        public string Self { get; set; } = string.Empty;
        public string PrivateConfig { get; set; } = string.Empty;
        public string Scopes { get; set; } = string.Empty;
    }

    private sealed class ApiV1Exception : Exception
    {
        public ApiV1Exception(string code, string message, int statusCode, string? detail = null)
            : base(message)
        {
            Code = code;
            StatusCode = statusCode;
            Detail = detail;
        }

        public string Code { get; }
        public int StatusCode { get; }
        public string? Detail { get; }
    }
}
