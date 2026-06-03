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

internal sealed class WorkbenchApiService
{
    private readonly IFormWorksExtractionClient _client;
    private readonly WorkbenchSnapshotCache _cache;
    private readonly WorkbenchApiServerOptions _options;
    private readonly object _processPrivateSummaryCacheGate = new object();
    private readonly Dictionary<string, ProcessPrivateSummaryCacheEntry> _processPrivateSummaryCache = new Dictionary<string, ProcessPrivateSummaryCacheEntry>(StringComparer.OrdinalIgnoreCase);

    public WorkbenchApiService(IFormWorksExtractionClient client, WorkbenchApiServerOptions options, WorkbenchSnapshotCache? cache = null)
    {
        if (client == null) throw new ArgumentNullException(nameof(client));
        _client = client;
        _cache = cache ?? new WorkbenchSnapshotCache(client);
        _options = options ?? throw new ArgumentNullException(nameof(options));
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
            if (tail == "snapshot") return RequireMethod(request, "GET") ?? Ok(request, "AcWorkbench.Snapshot", BuildSnapshotResponse(GetSnapshot(request)));
            if (tail == "snapshot/warmup") return RequireMethod(request, "GET") ?? Warmup(request);
            if (tail == "snapshot/refresh") return Refresh(request);
            if (tail == "scopes") return RequireMethod(request, "GET") ?? Ok(request, "AcWorkbench.ScopeList", BuildScopeList(GetSnapshot(request), request));
            if (tail.StartsWith("scopes/", StringComparison.OrdinalIgnoreCase)) return DispatchScope(tail, request);
            if (tail.StartsWith("rules/", StringComparison.OrdinalIgnoreCase)) return DispatchRule(tail, request);
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
            return Fail(request, "DllInteropFailure", ex.Message, 400, ex.InnerException?.Message, null, "Verify x86 process bitness, native DCM DLL paths, WibuKey/licensing state, and FWD path access.");
        }
        catch (Exception ex)
        {
            return Fail(request, "UnhandledServerError", "Unhandled API v1 server error.", 500, ex.GetType().Name + ": " + ex.Message);
        }
    }

    private ApiHttpResult? RequireMethod(HttpListenerRequest request, string method)
    {
        if (string.Equals(request.HttpMethod, method, StringComparison.OrdinalIgnoreCase))
            return null;

        return Fail(request, "MethodNotAllowed", "This endpoint requires " + method + ".", 405, "Received " + request.HttpMethod + ".");
    }

    private ApiHttpResult Ok(HttpListenerRequest request, string schema, object data, int statusCode = 200)
    {
        WorkbenchSnapshot? snapshot = _cache.Current;
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
        bool useCache = snapshotMode == SnapshotModeRequest.Snapshot
            || (snapshotMode == SnapshotModeRequest.Default && !_options.DisableSnapshotCache);

        return useCache
            ? _cache.GetOrBuild(path, process, requireNativeOk)
            : _cache.Rebuild(path, process, requireNativeOk);
    }

    private string GetFwdPath(HttpListenerRequest request)
    {
        string? queryPath = Get(request, "path");
        if (!string.IsNullOrWhiteSpace(queryPath) && !_options.AllowPathQuery && !string.IsNullOrWhiteSpace(_options.DefaultFwdPath))
        {
            throw new ApiContractException(
                "PathOverrideDisabled",
                "Request-level ?path= overrides are disabled for this server process.",
                403,
                "The server was started with a configured --path and without --allow-path-query.",
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
        if (!string.IsNullOrWhiteSpace(queryPath) && !_options.AllowPathQuery && !string.IsNullOrWhiteSpace(_options.DefaultFwdPath))
        {
            throw new ApiContractException(
                "PathOverrideDisabled",
                "Request-level ?path= overrides are disabled for this server process.",
                403,
                "The server was started with a configured --path and without --allow-path-query.",
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

        foreach (string item in raw.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries))
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
        });
    }

    // Code was generated by Copilot.
    // Kicks off a background snapshot build and returns immediately (idempotent).
    // Multiple callers during the same build share the in-progress Task via WorkbenchSnapshotCache.
    private ApiHttpResult Warmup(HttpListenerRequest request)
    {
        string path = GetFwdPath(request);
        string process = GetProcess(request);
        bool requireNativeOk = GetBool(request, "requireNativeOk", false);

        bool alreadyBuilt = _cache.Current != null;
        bool alreadyPending = _cache.IsBuildPending;

        if (!alreadyBuilt)
            _ = _cache.WarmUpAsync(path, process, requireNativeOk);

        return Ok(request, "AcWorkbench.SnapshotWarmup", new
        {
            queued = !alreadyBuilt && !alreadyPending,
            alreadyBuilding = alreadyPending,
            alreadyReady = alreadyBuilt,
            buildStartedAtUtc = _cache.PendingBuildStartedAtUtc,
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
        return new
        {
            name = "AC Rule Workbench API v1",
            purpose = "Stable product API for scope, rule, evidence, relationship, search, and diagnostics workflows.",
            basePath = "/api/v1",
            compatibility = "Legacy /api/fwd/* routes remain available but should not be used by new clients.",
            debug = "Raw/debug routes are outside this contract and should live under /api/debug/*.",
            endpoints = ApiV1Routes.All.Select(r => r.Method + " " + r.Path).ToList(),
            examples = new
            {
                scopes = "/api/v1/scopes",
                scope = "/api/v1/scopes/" + UrlEncode("AC/Pages/DentalADA"),
                search = "/api/v1/search?q=provider&kind=StructuralRule"
            }
        };
    }

    private object BuildRouteCatalog(HttpListenerRequest request)
    {
        return new
        {
            basePath = ApiV1Routes.BasePath,
            apiVersion = ApiV1Routes.ApiVersion,
            schemaVersion = ApiV1Routes.SchemaVersion,
            routes = ApiV1Routes.All.Select(r => new { method = r.Method, path = r.Path, description = r.Description }).ToList(),
            contract = new
            {
                openApi = "/api/v1/openapi.json",
                envelope = "All product responses use ok/schema/schemaVersion/apiVersion/requestId/data.",
                errors = "All product errors use ok=false plus error.code/message/detail/correlationId."
            }
        };
    }

    private object BuildCapabilities(HttpListenerRequest request)
    {
        return new
        {
            apiVersion = ApiV1Routes.ApiVersion,
            schemaVersion = ApiV1Routes.SchemaVersion,
            mode = "static-inspection",
            readOnly = true,
            refreshEnabled = _options.AllowMutatingCommands,
            debugApiEnabled = _options.EnableDebugApi,
            supports = new
            {
                snapshotCache = !_options.DisableSnapshotCache,
                structuralTree = true,
                flatInventory = true,
                relationshipExtraction = true,
                diagnostics = true,
                evidencePackets = true,
                globalSearch = true,
                nativeRuntimeSimulation = false,
                configMutation = false
            },
            limits = new
            {
                defaultInventoryLimit = 100,
                maxInventoryLimit = 500,
                defaultSearchLimit = 100,
                maxSearchLimit = 500,
                maxReferencesReturned = 1000
            },
            links = new
            {
                openApi = "/api/v1/openapi.json",
                routes = "/api/v1/routes",
                status = "/api/v1/status",
                readiness = "/api/v1/health/ready"
            },
            snapshotStrategy = _options.DisableSnapshotCache ? "rebuild-per-request" : "cached"
        };
    }

    private object BuildLiveness()
    {
        return new
        {
            live = true,
            service = "AC Rule Workbench API",
            apiVersion = ApiV1Routes.ApiVersion,
            utc = DateTime.UtcNow,
            processBitness = Environment.Is64BitProcess ? "64-bit" : "32-bit"
        };
    }

    private ApiHttpResult BuildReadiness(HttpListenerRequest request)
    {
        string? path = GetSourcePathForStatus(request);
        bool pathConfigured = !string.IsNullOrWhiteSpace(path);
        bool pathExists = pathConfigured && File.Exists(path!);
        WorkbenchSnapshot? snapshot = _cache.Current;
        Exception? lastFailure = _cache.LastBuildFailure;
        bool ready = _options.DisableSnapshotCache
            ? pathConfigured && pathExists
            : pathConfigured && pathExists && snapshot != null && lastFailure == null;
        return Ok(request, "AcWorkbench.Readiness", new
        {
            ready,
            source = new { path, configured = pathConfigured, exists = pathExists },
            snapshot = snapshot == null ? null : new { snapshot.SnapshotId, snapshot.GeneratedAtUtc, snapshot.BuildDurationMs },
            snapshotStrategy = _options.DisableSnapshotCache ? "rebuild-per-request" : "cached",
            lastBuildFailure = lastFailure == null ? null : new { type = lastFailure.GetType().Name, message = lastFailure.Message },
            resolution = ready
                ? null
                : BuildReadinessResolution(pathConfigured, pathExists, lastFailure)
        }, ready ? 200 : 503);
    }

    private static string BuildReadinessResolution(bool pathConfigured, bool pathExists, Exception? lastFailure)
    {
        if (!pathConfigured)
            return "Restart the server with --path, or enable query-path override for diagnostic use only.";
        if (!pathExists)
            return "Verify that the FWD/CFD path exists and that the service account can read it.";
        if (lastFailure != null)
            return "Open /api/v1/status for the last snapshot failure, then verify x86 bitness, native DCM DLL availability, licensing state, and read access to the FWD/CFD.";
        return "Call GET /api/v1/snapshot to build the cache, or restart the server with --path.";
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
        WorkbenchSnapshot? snapshot = _cache.Current;
        Exception? lastFailure = _cache.LastBuildFailure;
        string? path = GetSourcePathForStatus(request);
        FileInfo? fwd = !string.IsNullOrWhiteSpace(path) && File.Exists(path) ? new FileInfo(path!) : null;

        return new
        {
            service = "AC Rule Workbench API",
            apiVersion = "1.0.0",
            ok = true,
            mode = "local-read-only",
            debugApiEnabled = _options.EnableDebugApi,
            refreshEnabled = _options.AllowMutatingCommands,
            processBitness = Environment.Is64BitProcess ? "64-bit" : "32-bit",
            machineName = Environment.MachineName,
            utc = DateTime.UtcNow,
            source = new
            {
                path,
                exists = fwd != null,
                length = fwd?.Length,
                lastWriteUtc = fwd?.LastWriteTimeUtc
            },
            snapshot = snapshot == null ? (object)new
            {
                loaded = false,
                building = _cache.IsBuildPending,
                buildStartedAtUtc = _cache.PendingBuildStartedAtUtc,
                buildElapsedMs = _cache.PendingBuildStartedAtUtc.HasValue
                    ? (long?)(DateTime.UtcNow - _cache.PendingBuildStartedAtUtc.Value).TotalMilliseconds
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
            lastSnapshotBuildFailure = lastFailure == null ? null : new
            {
                type = lastFailure.GetType().Name,
                message = lastFailure.Message
            },
            capabilities = new
            {
                snapshotCache = !_options.DisableSnapshotCache,
                snapshotStrategy = _options.DisableSnapshotCache ? "rebuild-per-request" : "cached",
                refresh = _options.AllowMutatingCommands,
                scopes = true,
                structure = true,
                inventory = true,
                references = true,
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
                path = snapshot.FwdPath,
                release = snapshot.Fwd.ReleaseString,
                releaseDate = snapshot.Fwd.ReleaseDateString,
                releaseNumber = snapshot.Fwd.ReleaseNumber,
                process = snapshot.Rules.ProcessName,
                readMode = "read-only"
            },
            runtime = new
            {
                processBitness = Environment.Is64BitProcess ? "64-bit" : "32-bit",
                machineName = Environment.MachineName
            },
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

        if (string.IsNullOrWhiteSpace(action)) return Ok(request, "AcWorkbench.RuleDetail", BuildRuleDetailWithIncludes(snapshot, rule, request));
        if (action == "subtree") return Ok(request, "AcWorkbench.RuleSubtree", BuildRuleSubtree(snapshot, rule, request));

        return Fail(request, "RouteNotFound", "Rule route was not found.", 404, "/api/v1/" + tail);
    }

    // Exposes canonical FWD object surfaces (documents/pages/batches/processes/resources/variants/fields)
    // so UI can use real configuration entities instead of inferred heuristics.
    private ApiHttpResult DispatchFwd(string tail, HttpListenerRequest request)
    {
        ApiHttpResult? method = RequireMethod(request, "GET");
        if (method != null) return method;

        WorkbenchSnapshot snapshot = GetSnapshot(request);
        string normalized = tail.Trim('/');
        string[] parts = normalized.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);

        if (parts.Length == 1 || (parts.Length == 2 && parts[1].Equals("overview", StringComparison.OrdinalIgnoreCase)))
            return Ok(request, "AcWorkbench.FwdOverview", BuildFwdOverview(snapshot));

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
            if (!snapshot.Fwd.Processes.Any(p => RuleCorrelation.Eq(p, process)))
                return Fail(request, "ProcessNotFound", "FWD process was not found.", 404, "/api/v1/fwd/processes/" + UrlEncode(process));
            return Ok(request, "AcWorkbench.FwdProcessDetail", BuildFwdProcessDetail(snapshot, request, process));
        }

        if (parts.Length == 3 && parts[1].Equals("processes", StringComparison.OrdinalIgnoreCase) && parts[2].Equals("drivers", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdProcessDrivers", BuildFwdProcessDrivers(snapshot, request));

        if (parts.Length == 4 && parts[1].Equals("processes", StringComparison.OrdinalIgnoreCase) && parts[3].Equals("private", StringComparison.OrdinalIgnoreCase))
        {
            string process = UrlDecode(parts[2]);
            var payload = _client.InspectProcessTree(new StcTraversalOptions
            {
                Path = GetFwdPath(request),
                ProcessName = process,
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

        if (parts.Length == 2 && parts[1].Equals("tables", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdTables", BuildFwdTablesCanonical(snapshot, request));

        if (parts.Length == 3 && parts[1].Equals("tables", StringComparison.OrdinalIgnoreCase) && parts[2].Equals("inferred", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdTablesInferred", BuildFwdTablesInferred(snapshot, request));

        if (parts.Length == 2 && parts[1].Equals("udfs", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdUdfs", BuildFwdUdfsCanonical(snapshot, request));

        if (parts.Length == 3 && parts[1].Equals("udfs", StringComparison.OrdinalIgnoreCase) && !parts[2].Equals("inferred", StringComparison.OrdinalIgnoreCase))
        {
            string udfName = UrlDecode(parts[2]);
            return Ok(request, "AcWorkbench.FwdUdfDetail", BuildFwdUdfDetail(snapshot, request, udfName));
        }

        if (parts.Length == 3 && parts[1].Equals("udfs", StringComparison.OrdinalIgnoreCase) && parts[2].Equals("inferred", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdUdfsInferred", BuildFwdUdfsInferred(snapshot, request));

        if (parts.Length == 2 && parts[1].Equals("page-variants", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdPageVariants", BuildFwdPageVariants(snapshot, request));

        if (parts.Length == 2 && parts[1].Equals("fields", StringComparison.OrdinalIgnoreCase))
            return Ok(request, "AcWorkbench.FwdFields", BuildFwdFields(snapshot, request));

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
                path = snapshot.FwdPath,
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
                resources = "/api/v1/fwd/resources",
                tables = "/api/v1/fwd/tables",
                inferredTables = "/api/v1/fwd/tables/inferred",
                udfs = "/api/v1/fwd/udfs",
                inferredUdfs = "/api/v1/fwd/udfs/inferred",
                pageVariants = "/api/v1/fwd/page-variants",
                fields = "/api/v1/fwd/fields"
            },
            warnings = snapshot.Fwd.Warnings
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

        FwdInspectionReport? detailed = null;
        if (includeDetails)
        {
            detailed = _client.Inspect(new FwdInspectionOptions
            {
                Path = GetFwdPath(request),
                IncludeFields = false,
                IncludeResourceConfigs = true,
                IncludeResourcePrivateTrees = includePrivate,
                RequireNativeOk = GetBool(request, "requireNativeOk", false),
                ResourceTypes = snapshot.Fwd.Resources.Select(r => r.Type).Where(t => !string.IsNullOrWhiteSpace(t)).Distinct(StringComparer.OrdinalIgnoreCase).ToArray()
            });
        }

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
                                    privateTree = x.PrivateTree,
                                    warnings = x.Warnings
                                })
                                .FirstOrDefault()
                    })
                    .ToList()
            })
            .ToList();

        return new { count = buckets.Sum(b => b.count), buckets };
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

    private object BuildFwdTablesCanonical(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? q = Get(request, "q");
        string resourceType = string.IsNullOrWhiteSpace(Get(request, "resourceType")) ? "Table" : Get(request, "resourceType")!;
        var rules = BuildRuleRelationshipIndex(snapshot);

        var tables = new Dictionary<string, TableVm>(StringComparer.OrdinalIgnoreCase);
        foreach (ResourceBucket bucket in snapshot.Fwd.Resources.Where(b => RuleCorrelation.Eq(b.Type, resourceType)))
        {
            foreach (string name in bucket.Names)
            {
                string tableName = (name ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(tableName) || !LooksLikeTableIdentifier(tableName))
                    continue;

                if (!tables.ContainsKey(tableName))
                {
                    tables[tableName] = new TableVm
                    {
                        Name = tableName,
                        Canonical = true,
                        ResourceType = bucket.Type,
                        Source = "CanonicalFwdResource",
                        Confidence = "High"
                    };
                }
            }
        }

        foreach (AcRuleRelationship relationship in snapshot.Relationships.Relationships)
        {
            string tableName = (relationship.Target ?? relationship.ParameterName ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(tableName))
                continue;

            if (!tables.TryGetValue(tableName, out TableVm? table))
                continue;

            table.ReferenceCount++;
            table.ScopeIds.Add(RuleCorrelation.ScopeId(relationship.ScopePath, relationship.ScopeType, relationship.ScopeName));

            string ruleKey = string.Join("|",
                RuleCorrelation.ScopeId(relationship.ScopePath, relationship.ScopeType, relationship.ScopeName),
                relationship.RuleGuid ?? string.Empty,
                relationship.RuleIndex.ToString(),
                relationship.RuleName ?? string.Empty,
                relationship.FunctionName ?? string.Empty);
            table.RuleKeys.Add(ruleKey);

            if (!rules.TryGetValue(ruleKey, out List<AcRuleRelationship>? peers))
                continue;

            foreach (AcRuleRelationship peer in peers)
            {
                if (object.ReferenceEquals(peer, relationship)) continue;

                string candidate = (peer.Target ?? peer.ParameterName ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(candidate)) continue;
                if (RuleCorrelation.Eq(candidate, tableName)) continue;

                string targetType = peer.TargetType ?? string.Empty;
                string role = peer.ParameterRole ?? string.Empty;
                string confidence = "Low";
                if (RuleCorrelation.Contains(targetType, "Field") || RuleCorrelation.Contains(targetType, "Attribute") || RuleCorrelation.Contains(role, "Field") || RuleCorrelation.Contains(role, "Column") || RuleCorrelation.Contains(role, "Attribute"))
                    confidence = "High";
                else if (!string.IsNullOrWhiteSpace(peer.ParameterName) && Regex.IsMatch(peer.ParameterName, "field|column|attr", RegexOptions.IgnoreCase))
                    confidence = "Medium";

                if (confidence == "Low")
                    continue;

                if (!table.Columns.TryGetValue(candidate, out TableColumnVm? column))
                {
                    column = new TableColumnVm { Name = candidate, Confidence = confidence };
                    table.Columns[candidate] = column;
                }

                column.Hits++;
                if (string.Equals(confidence, "High", StringComparison.OrdinalIgnoreCase))
                    column.Confidence = "High";
            }
        }

        var items = tables.Values
            .Where(t => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(t.Name, q) || t.Columns.Keys.Any(c => RuleCorrelation.Contains(c, q)))
            .Select(t => new
            {
                name = t.Name,
                canonical = t.Canonical,
            source = t.Source,
            confidence = t.Confidence,
            resourceType = t.ResourceType,
                referenceCount = t.ReferenceCount,
                scopeCount = t.ScopeIds.Count,
                ruleCount = t.RuleKeys.Count,
                parsedColumns = new List<object>(),
                usageDerivedFields = t.Columns.Values
                    .OrderByDescending(c => c.Hits)
                    .ThenBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
                    .Select(c => new { name = c.Name, hits = c.Hits, confidence = c.Confidence })
                    .ToList(),
                columns = t.Columns.Values
                    .OrderByDescending(c => c.Hits)
                    .ThenBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
                    .Select(c => new { name = c.Name, hits = c.Hits, confidence = c.Confidence })
                    .ToList(),
                schemaParsed = false,
                columnsAreUsageDerived = true,
                columnsDeprecatedAlias = true,
                diagnostics = new[] { "TableSchemaNotParsed", "UsageDerivedFieldsNotSchema" }
            })
            .OrderByDescending(t => t.referenceCount)
            .ThenBy(t => t.name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new
        {
            count = items.Count,
            items,
            diagnostics = new[] { "TableSchemaNotParsed", "UsageDerivedFieldsNotSchema" },
            links = new
            {
                inferred = "/api/v1/fwd/tables/inferred"
            }
        };
    }

    // Relationship-derived table candidates are emitted separately and never treated as canonical inventory.
    private object BuildFwdTablesInferred(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? q = Get(request, "q");
        bool includeCanonical = GetBool(request, "includeCanonical", false);
        var rules = BuildRuleRelationshipIndex(snapshot);

        var canonicalTableNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (ResourceBucket bucket in snapshot.Fwd.Resources.Where(b => RuleCorrelation.Eq(b.Type, "Table")))
        {
            foreach (string name in bucket.Names)
            {
                string candidate = (name ?? string.Empty).Trim();
                if (!LooksLikeTableIdentifier(candidate))
                    continue;
                canonicalTableNames.Add(candidate);
            }
        }

        var tables = new Dictionary<string, TableVm>(StringComparer.OrdinalIgnoreCase);
        foreach (AcRuleRelationship relationship in snapshot.Relationships.Relationships)
        {
            string tableName = (relationship.Target ?? relationship.ParameterName ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(tableName))
                continue;

            string signal = string.Join(" ", relationship.TargetType ?? string.Empty, relationship.Kind ?? string.Empty, relationship.ParameterRole ?? string.Empty);
            bool tableSignal = Regex.IsMatch(signal, "table|indexed|lookup|db|database", RegexOptions.IgnoreCase);
            bool nameSignal = Regex.IsMatch(tableName, @"(?:^|[_-])(tbl|table|lookup|db)(?:$|[_-])|(?:table|lookup)$", RegexOptions.IgnoreCase);
            if (!tableSignal && !nameSignal)
                continue;
            if (!LooksLikeTableIdentifier(tableName))
                continue;

            bool isCanonical = canonicalTableNames.Contains(tableName);
            if (!includeCanonical && isCanonical)
                continue;

            if (!tables.TryGetValue(tableName, out TableVm? table))
            {
                table = new TableVm
                {
                    Name = tableName,
                    Canonical = isCanonical,
                    ResourceType = "Unknown",
                    Source = "InferredFromRuleRelationship",
                    Confidence = isCanonical ? "Medium" : "Low"
                };
                tables[tableName] = table;
            }

            table.ReferenceCount++;
            table.ScopeIds.Add(RuleCorrelation.ScopeId(relationship.ScopePath, relationship.ScopeType, relationship.ScopeName));

            string ruleKey = string.Join("|",
                RuleCorrelation.ScopeId(relationship.ScopePath, relationship.ScopeType, relationship.ScopeName),
                relationship.RuleGuid ?? string.Empty,
                relationship.RuleIndex.ToString(),
                relationship.RuleName ?? string.Empty,
                relationship.FunctionName ?? string.Empty);
            table.RuleKeys.Add(ruleKey);

            if (!rules.TryGetValue(ruleKey, out List<AcRuleRelationship>? peers))
                continue;

            foreach (AcRuleRelationship peer in peers)
            {
                if (object.ReferenceEquals(peer, relationship)) continue;

                string candidate = (peer.Target ?? peer.ParameterName ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(candidate)) continue;
                if (RuleCorrelation.Eq(candidate, tableName)) continue;

                string targetType = peer.TargetType ?? string.Empty;
                string role = peer.ParameterRole ?? string.Empty;
                string confidence = "Low";
                if (RuleCorrelation.Contains(targetType, "Field") || RuleCorrelation.Contains(targetType, "Attribute") || RuleCorrelation.Contains(role, "Field") || RuleCorrelation.Contains(role, "Column") || RuleCorrelation.Contains(role, "Attribute"))
                    confidence = "High";
                else if (!string.IsNullOrWhiteSpace(peer.ParameterName) && Regex.IsMatch(peer.ParameterName, "field|column|attr", RegexOptions.IgnoreCase))
                    confidence = "Medium";

                if (confidence == "Low")
                    continue;

                if (!table.Columns.TryGetValue(candidate, out TableColumnVm? column))
                {
                    column = new TableColumnVm { Name = candidate, Confidence = confidence };
                    table.Columns[candidate] = column;
                }

                column.Hits++;
                if (string.Equals(confidence, "High", StringComparison.OrdinalIgnoreCase))
                    column.Confidence = "High";
            }
        }

        var items = tables.Values
            .Where(t => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(t.Name, q) || t.Columns.Keys.Any(c => RuleCorrelation.Contains(c, q)))
            .Select(t => new
            {
                name = t.Name,
                canonical = t.Canonical,
                source = t.Source,
                confidence = t.Confidence,
                notCanonicalResource = !t.Canonical,
                referenceCount = t.ReferenceCount,
                scopeCount = t.ScopeIds.Count,
                ruleCount = t.RuleKeys.Count,
                parsedColumns = new List<object>(),
                usageDerivedFields = t.Columns.Values
                    .OrderByDescending(c => c.Hits)
                    .ThenBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
                    .Select(c => new { name = c.Name, hits = c.Hits, confidence = c.Confidence })
                    .ToList(),
                columns = t.Columns.Values
                    .OrderByDescending(c => c.Hits)
                    .ThenBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
                    .Select(c => new { name = c.Name, hits = c.Hits, confidence = c.Confidence })
                    .ToList(),
                schemaParsed = false,
                columnsAreUsageDerived = true,
                columnsDeprecatedAlias = true,
                diagnostics = new[] { "TableSchemaNotParsed", "UsageDerivedFieldsNotSchema" }
            })
            .OrderByDescending(t => t.referenceCount)
            .ThenBy(t => t.name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new
        {
            count = items.Count,
            items,
            diagnostics = new[] { "TableSchemaNotParsed", "UsageDerivedFieldsNotSchema" },
            links = new
            {
                canonical = "/api/v1/fwd/tables"
            }
        };
    }

    private static List<string> ExtractUdfInterfaceParameterNames(ResourceDetail? details)
    {
        var names = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        void Add(string? candidate)
        {
            string value = (candidate ?? string.Empty).Trim().Trim('"', '\'', '{', '}', '[', ']');
            if (!LooksLikeUdfFieldListName(value))
                return;

            if (seen.Add(value))
                names.Add(value);
        }

        void AddSplit(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return;

            foreach (string part in Regex.Split(value, @"[,;|\r\n\t]+"))
                Add(part);
        }

        if (details == null)
            return names;

        foreach (ResourceAttrEntry attr in details.FullAttributes.Concat(details.PublicAttributes))
        {
            string key = attr.Key ?? string.Empty;
            string value = attr.Value ?? string.Empty;

            if (IsLikelyUdfParameterNameListKey(key))
                AddSplit(value);

            if (IsLikelyIndexedUdfParameterNameKey(key))
                Add(value);

            // Some FW resource exports store the interface name as the attribute key and the type/cardinality
            // as the value. Keep this cautious so normal config attributes such as Source/Path/Version do not
            // get promoted into field-list parameters.
            if (IsLikelyUdfFieldListAttribute(key, value))
                Add(key);
        }

        if (details.PrivateTree != null)
            ExtractUdfNamesFromPrivateTree(details.PrivateTree, inFieldListRegion: false, Add, AddSplit);

        return names;
    }

    private static void ExtractUdfNamesFromPrivateTree(ResourcePrivateNode node, bool inFieldListRegion, Action<string?> add, Action<string?> addSplit)
    {
        string name = node.Name ?? string.Empty;
        bool fieldListRegion = inFieldListRegion || Regex.IsMatch(name, "field\\s*lists?|param(eter)?\\s*lists?|input\\s*fields?", RegexOptions.IgnoreCase);

        if (fieldListRegion && LooksLikeUdfFieldListName(name))
            add(name);

        if (fieldListRegion && !string.IsNullOrWhiteSpace(node.ValuePreview))
            addSplit(node.ValuePreview);

        foreach (ResourcePrivateNode child in node.Children)
            ExtractUdfNamesFromPrivateTree(child, fieldListRegion, add, addSplit);
    }

    private static bool IsLikelyUdfParameterNameListKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key))
            return false;

        string k = key.Trim();
        return Regex.IsMatch(k, "^(FieldListNames?|FieldParameterLists?|ParameterNames?|ParamNames?|InputFieldLists?)$", RegexOptions.IgnoreCase)
            || Regex.IsMatch(k, "Field\\s*Parameter\\s*Lists?", RegexOptions.IgnoreCase);
    }

    private static bool IsLikelyIndexedUdfParameterNameKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key))
            return false;

        return Regex.IsMatch(key.Trim(), "^(FieldList|Param|Parameter|InputFieldList)\\d*Name$", RegexOptions.IgnoreCase)
            || Regex.IsMatch(key.Trim(), "^Name(FieldList|Param|Parameter)\\d*$", RegexOptions.IgnoreCase);
    }

    private static bool IsLikelyUdfFieldListAttribute(string key, string value)
    {
        if (!LooksLikeUdfFieldListName(key))
            return false;

        string v = (value ?? string.Empty).Trim();
        if (v.Length == 0)
            return false;

        return Regex.IsMatch(v, "^(Text|OMR|OMR\\s*Subfield|Field|Fields|Single|Multiple|One|Many|0|1|True|False|Yes|No)$", RegexOptions.IgnoreCase);
    }

    private static bool LooksLikeUdfFieldListName(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        string v = value.Trim().Trim('"', '\'', '{', '}', '[', ']');
        if (v.Length == 0 || v.Length > 64)
            return false;

        if (Regex.IsMatch(v, "^_?ParamList(OMRIndex)?\\d+$", RegexOptions.IgnoreCase))
            return false;

        if (Regex.IsMatch(v, "^(Text|OMR|OMR\\s*Subfield|Field|Fields|Single|Multiple|True|False|Yes|No|None|Null|Unknown)$", RegexOptions.IgnoreCase))
            return false;

        if (Regex.IsMatch(v, "^[+-]?\\d+(\\.\\d+)?$"))
            return false;

        if (v.IndexOfAny(new[] { '/', '\\', ':', '{', '}', '[', ']' }) >= 0)
            return false;

        return Regex.IsMatch(v, "^[A-Za-z][A-Za-z0-9_ .-]*$", RegexOptions.CultureInvariant);
    }

    // Function resource candidate inventory: canonical resource names plus usage-side evidence.
    // This is intentionally not a full UDF-definition parser.
    private object BuildFwdUdfsCanonical(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? q = Get(request, "q");
        string[] udfTypes = new[] { "Function", "UDF", "UserDefinedFunction", "User Defined" };
        bool includeDetails = GetBool(request, "includeDetails", false);
        bool includePrivate = GetBool(request, "includePrivate", false);
        FwdInspectionReport? detailed = includeDetails
            ? _client.Inspect(new FwdInspectionOptions
            {
                Path = GetFwdPath(request),
                IncludeFields = false,
                IncludeResourceConfigs = true,
                IncludeResourcePrivateTrees = includePrivate,
                RequireNativeOk = GetBool(request, "requireNativeOk", false),
                ResourceTypes = udfTypes
            })
            : null;

        var usedByTarget = snapshot.Relationships.Relationships
            .Where(r => !string.IsNullOrWhiteSpace(r.Target))
            .GroupBy(r => r.Target!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var rulesByFunction = snapshot.Rules.Rules
            .Where(r => !string.IsNullOrWhiteSpace(r.FunctionName))
            .GroupBy(r => r.FunctionName!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        var items = snapshot.Fwd.Resources
            .Where(b => udfTypes.Any(t => RuleCorrelation.Eq(t, b.Type)))
            .SelectMany(b => b.Names.Select(n => new { type = b.Type, name = (n ?? string.Empty).Trim() }))
            .Where(x => !string.IsNullOrWhiteSpace(x.name))
            .Where(x => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(x.name, q))
            .Select(x =>
            {
                int byTarget = usedByTarget.TryGetValue(x.name, out List<AcRuleRelationship>? refs) ? refs.Count : 0;
                int byFunction = rulesByFunction.TryGetValue(x.name, out List<AcRuleSummary>? rules) ? rules.Count : 0;
                List<AcRuleSummary> matchedRules = rulesByFunction.TryGetValue(x.name, out rules) ? rules : new List<AcRuleSummary>();
                ResourceDetail? rawDetails = FindResourceDetail(detailed, x.type, x.name);
                var definitionParameterNames = ExtractUdfInterfaceParameterNames(rawDetails);
                var callerParameterNames = matchedRules
                    .SelectMany(r => r.Parameters.Keys)
                    .Where(k => !string.IsNullOrWhiteSpace(k))
                    .Select(k => k.Trim())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(k => k, StringComparer.OrdinalIgnoreCase)
                    .ToList();
                var parameterNames = definitionParameterNames.Count > 0
                    ? definitionParameterNames
                    : callerParameterNames.Where(k => !Regex.IsMatch(k, @"^_?ParamList(OMRIndex)?\d+$", RegexOptions.IgnoreCase)).ToList();
                var ruleNames = matchedRules
                    .Select(r => string.IsNullOrWhiteSpace(r.RuleName) ? $"Rule {r.RuleIndex}" : r.RuleName!.Trim())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(n => n, StringComparer.OrdinalIgnoreCase)
                    .Take(100)
                    .ToList();
                var scopeIds = matchedRules
                    .Select(r => RuleCorrelation.ScopeId(r.ScopePath, r.ScopeType, r.ScopeName))
                    .Where(s => !string.IsNullOrWhiteSpace(s))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .OrderBy(s => s, StringComparer.OrdinalIgnoreCase)
                    .ToList();
                return new
                {
                    name = x.name,
                    resourceType = x.type,
                    source = "CanonicalFwdResource",
                    classification = ClassifyFunctionResourceCandidate(x.type, rawDetails),
                    confidence = UdfCandidateConfidence(x.type, rawDetails),
                    definitionParsed = false,
                    bodyParsed = false,
                    hasResourceDetails = rawDetails != null,
                    hasPrivateTree = rawDetails?.PrivateTree != null,
                    usedByRuleCount = Math.Max(byTarget, byFunction),
                    parameterNames,
                    callerParameterSlots = callerParameterNames,
                    ruleNames,
                    scopeIds,
                    diagnostics = new List<string>
                    {
                        "UdfDefinitionNotParsed",
                        "UdfBodyNotParsed",
                        rawDetails == null && includeDetails ? "ResourceDetailsUnavailable" : string.Empty,
                        rawDetails?.PrivateTree == null && includePrivate ? "ResourcePrivateTreeUnavailable" : string.Empty,
                        byTarget > 0 && byFunction == 0 ? "RelationshipOnlyMatch" : string.Empty
                    }.Where(v => !string.IsNullOrWhiteSpace(v)).ToList(),
                    rawResourceDetails = rawDetails == null ? null : new
                    {
                        category = rawDetails.Category,
                        fullConfig = rawDetails.FullAttributes,
                        publicConfig = rawDetails.PublicAttributes,
                        privateTree = rawDetails.PrivateTree,
                        warnings = rawDetails.Warnings
                    },
                    links = new
                    {
                        self = "/api/v1/fwd/udfs/" + UrlEncode(x.name),
                        inferred = "/api/v1/fwd/udfs/inferred?q=" + UrlEncode(x.name)
                    }
                };
            })
            .OrderByDescending(x => x.usedByRuleCount)
            .ThenBy(x => x.name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new
        {
            count = items.Count,
            items,
            caveat = "Rows are function-resource candidates plus caller-side usage. A row is not a confirmed UDF until its Function resource interface and private rule body are parsed.",
            diagnostics = new[] { "UdfDefinitionNotParsed", "UdfBodyNotParsed" }
        };
    }

    // Function/UDF usage detail with explicit separation between definition fields and caller rules.
    private object BuildFwdUdfDetail(WorkbenchSnapshot snapshot, HttpListenerRequest request, string udfName)
    {
        string[] udfTypes = new[] { "Function", "UDF", "UserDefinedFunction", "User Defined" };
        string name = (udfName ?? string.Empty).Trim();

        var canonicalHits = snapshot.Fwd.Resources
            .Where(b => udfTypes.Any(t => RuleCorrelation.Eq(t, b.Type)))
            .SelectMany(b => b.Names.Select(n => new { type = b.Type, name = (n ?? string.Empty).Trim() }))
            .Where(x => !string.IsNullOrWhiteSpace(x.name) && RuleCorrelation.Eq(x.name, name))
            .ToList();

        bool includeDetails = GetBool(request, "includeDetails", true);
        bool includePrivate = GetBool(request, "includePrivate", false);
        FwdInspectionReport? detailed = includeDetails
            ? _client.Inspect(new FwdInspectionOptions
            {
                Path = GetFwdPath(request),
                IncludeFields = false,
                IncludeResourceConfigs = true,
                IncludeResourcePrivateTrees = includePrivate,
                RequireNativeOk = GetBool(request, "requireNativeOk", false),
                ResourceTypes = canonicalHits.Select(x => x.type).DefaultIfEmpty("Function").Distinct(StringComparer.OrdinalIgnoreCase).ToArray()
            })
            : null;
        ResourceDetail? primaryDetails = canonicalHits
            .Select(h => FindResourceDetail(detailed, h.type, h.name))
            .FirstOrDefault(d => d != null);

        var directCallers = snapshot.Rules.Rules
            .Where(r => RuleCorrelation.Eq(r.FunctionName, name))
            .OrderBy(r => RuleCorrelation.ScopeId(r.ScopePath, r.ScopeType, r.ScopeName), StringComparer.OrdinalIgnoreCase)
            .ThenBy(r => r.RuleIndex)
            .Select(r => new
            {
                scopeId = RuleCorrelation.ScopeId(r.ScopePath, r.ScopeType, r.ScopeName),
                scopePath = r.ScopePath,
                scopeType = r.ScopeType,
                scopeName = r.ScopeName,
                ruleIndex = r.RuleIndex,
                ruleGuid = r.RuleGuid,
                ruleId = r.RuleId,
                ruleName = r.RuleName,
                functionName = r.FunctionName,
                parameters = r.Parameters
            })
            .ToList();

        var iteratorCallers = snapshot.Rules.Rules
            .Where(r => !string.IsNullOrWhiteSpace(r.FunctionName))
            .Where(r => Regex.IsMatch(r.FunctionName!, "iterate.*udf|_iiterate.*udf", RegexOptions.IgnoreCase))
            .Where(r => r.Parameters.Any(p => p.Value.Any(v => RuleCorrelation.Eq(v, name))))
            .OrderBy(r => RuleCorrelation.ScopeId(r.ScopePath, r.ScopeType, r.ScopeName), StringComparer.OrdinalIgnoreCase)
            .ThenBy(r => r.RuleIndex)
            .Select(r => new
            {
                scopeId = RuleCorrelation.ScopeId(r.ScopePath, r.ScopeType, r.ScopeName),
                scopePath = r.ScopePath,
                scopeType = r.ScopeType,
                scopeName = r.ScopeName,
                ruleIndex = r.RuleIndex,
                ruleGuid = r.RuleGuid,
                ruleId = r.RuleId,
                ruleName = r.RuleName,
                functionName = r.FunctionName,
                parameters = r.Parameters
            })
            .ToList();

        var relationshipCalls = snapshot.Relationships.Relationships
            .Where(r => RuleCorrelation.Eq(r.Target, name) || RuleCorrelation.Eq(r.FunctionName, name))
            .Select(r => new
            {
                scopeId = RuleCorrelation.ScopeId(r.ScopePath, r.ScopeType, r.ScopeName),
                scopePath = r.ScopePath,
                scopeType = r.ScopeType,
                scopeName = r.ScopeName,
                ruleIndex = r.RuleIndex,
                ruleGuid = r.RuleGuid,
                ruleName = r.RuleName,
                functionName = r.FunctionName,
                kind = r.Kind,
                targetType = r.TargetType,
                target = r.Target,
                confidence = r.Confidence
            })
            .ToList();

        if (!canonicalHits.Any() && !directCallers.Any() && !relationshipCalls.Any())
            return new
            {
                name,
                found = false,
                warnings = new[] { "UDF/function was not found in canonical resources, rule callers, or relationship evidence." }
            };

        var definitionParameterNames = ExtractUdfInterfaceParameterNames(primaryDetails);
        var callerParameterNames = directCallers
            .SelectMany(r => r.parameters.Keys)
            .Where(k => !string.IsNullOrWhiteSpace(k))
            .Select(k => k.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(k => k, StringComparer.OrdinalIgnoreCase)
            .ToList();
        var parameterNames = definitionParameterNames.Count > 0
            ? definitionParameterNames
            : callerParameterNames.Where(k => !Regex.IsMatch(k, @"^_?ParamList(OMRIndex)?\d+$", RegexOptions.IgnoreCase)).ToList();

        var statusResults = directCallers
            .SelectMany(r => snapshot.Rules.Rules
                .Where(x => RuleCorrelation.Eq(x.RuleGuid, r.ruleGuid) || (x.RuleIndex == r.ruleIndex && RuleCorrelation.ScopeId(x.ScopePath, x.ScopeType, x.ScopeName) == r.scopeId))
                .SelectMany(x => x.ActionNames))
            .Where(a => !string.IsNullOrWhiteSpace(a))
            .Select(a => a.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(a => a, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new
        {
            name,
            found = true,
            resourceType = canonicalHits.Select(x => x.type).FirstOrDefault() ?? "Function",
            classification = canonicalHits.Any()
                ? (canonicalHits.Any(h => RuleCorrelation.Eq(h.type, "Function") || RuleCorrelation.Eq(h.type, "User Defined")) ? "FunctionResource" : "CandidateUdf")
                : (directCallers.Any() ? "RuleUsageOnly" : "RegexOnly"),
            functionKind = canonicalHits.Any() ? "UserDefinedCandidate" : "InferredFromRuleUsage",
            source = canonicalHits.Any() ? "FwdResource" : "RuleUsage",
            confidence = canonicalHits.Any() ? UdfCandidateConfidence(canonicalHits.First().type, primaryDetails) : "Low",
            definitionParsed = false,
            bodyParsed = false,
            hasResourceDetails = primaryDetails != null,
            hasPrivateTree = primaryDetails?.PrivateTree != null,
            fieldListCount = parameterNames.Count,
            statusResultCount = statusResults.Count,
            definition = new
            {
                parsedFrom = primaryDetails == null ? "CallerUsageCorrelation" : "FwdResourceMetadataPlusCallerUsage",
                authority = "NotParsedDefinition",
                fieldLists = parameterNames.Select(p => new
                {
                    name = p,
                    fieldType = "Unknown",
                    cardinality = "Unknown"
                }).ToList(),
                statusResults,
                ruleBody = (object?)null,
                notes = new[]
                {
                    "Field lists come from the UDF interface when available; caller slots are only used as a fallback.",
                    "Internal UDF rule body is not parsed in this endpoint."
                }
            },
            usage = new
            {
                directCallers,
                iteratorCallers,
                relationshipMatches = relationshipCalls
            },
            rawResourceDetails = primaryDetails == null ? null : new
            {
                category = primaryDetails.Category,
                fullConfig = primaryDetails.FullAttributes,
                publicConfig = primaryDetails.PublicAttributes,
                privateTree = primaryDetails.PrivateTree,
                warnings = primaryDetails.Warnings
            },
            diagnostics = new
            {
                warnings = new List<string>
                {
                    "UdfDefinitionNotParsed",
                    "UdfBodyNotParsed",
                    primaryDetails == null && includeDetails ? "ResourceDetailsUnavailable" : string.Empty,
                    primaryDetails?.PrivateTree == null && includePrivate ? "ResourcePrivateTreeUnavailable" : string.Empty,
                    canonicalHits.Any() ? string.Empty : "NonCanonicalRuleUsageOnly",
                    parameterNames.Count == 0 ? "FieldListsNotParsedOrUnavailable" : string.Empty,
                    statusResults.Count == 0 ? "StatusResultsNotParsedOrUnavailable" : string.Empty,
                    relationshipCalls.Any() && !directCallers.Any() ? "RelationshipOnlyMatch" : string.Empty,
                    !iteratorCallers.Any() ? string.Empty : "IteratorCallersDetected"
                }.Where(x => !string.IsNullOrWhiteSpace(x)).ToList()
            },
            links = new
            {
                canonicalList = "/api/v1/fwd/udfs",
                inferredList = "/api/v1/fwd/udfs/inferred",
                self = "/api/v1/fwd/udfs/" + UrlEncode(name)
            },
            caveat = "This endpoint exposes Function-resource metadata plus caller-side usage correlation. It does not yet parse the private-STC UDF interface or internal rule body."
        };
    }

    // Weak-signal UDF candidates from function-name patterns, emitted separately from canonical resources.
    private object BuildFwdUdfsInferred(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? q = Get(request, "q");
        bool includeCanonical = GetBool(request, "includeCanonical", false);

        var canonicalNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (ResourceBucket bucket in snapshot.Fwd.Resources.Where(b => RuleCorrelation.Eq(b.Type, "UDF") || RuleCorrelation.Eq(b.Type, "UserDefinedFunction") || RuleCorrelation.Eq(b.Type, "Function")))
        {
            foreach (string name in bucket.Names)
            {
                if (!string.IsNullOrWhiteSpace(name))
                    canonicalNames.Add(name.Trim());
            }
        }

        var items = snapshot.Rules.Rules
            .Select(r => r.FunctionName)
            .Where(fn => !string.IsNullOrWhiteSpace(fn))
            .Select(fn => fn!.Trim())
            .Where(fn => Regex.IsMatch(fn, "udf|user.?defined", RegexOptions.IgnoreCase))
            .GroupBy(fn => fn, StringComparer.OrdinalIgnoreCase)
            .Select(g => new
            {
                name = g.Key,
                classification = "RegexOnly",
                confidence = "Low",
                source = "InferredFromFunctionNameRegex",
                notCanonicalResource = !canonicalNames.Contains(g.Key),
                usedByRuleCount = g.Count()
            })
            .Where(x => includeCanonical || x.notCanonicalResource)
            .Where(x => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(x.name, q))
            .OrderByDescending(x => x.usedByRuleCount)
            .ThenBy(x => x.name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new
        {
            count = items.Count,
            items,
            diagnostics = new[] { "RegexOnly" },
            links = new
            {
                canonical = "/api/v1/fwd/udfs"
            }
        };
    }

    private static ResourceDetail? FindResourceDetail(FwdInspectionReport? report, string resourceType, string resourceName)
    {
        if (report == null || string.IsNullOrWhiteSpace(resourceType) || string.IsNullOrWhiteSpace(resourceName))
            return null;

        return report.ResourceTypeDetails
            .Where(t => RuleCorrelation.Eq(t.Type, resourceType))
            .SelectMany(t => t.Resources)
            .FirstOrDefault(r => RuleCorrelation.Eq(r.Name, resourceName));
    }

    private static string ClassifyFunctionResourceCandidate(string resourceType, ResourceDetail? details)
    {
        if (details != null && (LooksLikeUdfDefinition(details.FullAttributes) || LooksLikeUdfDefinition(details.PublicAttributes) || LooksLikeUdfPrivateTree(details.PrivateTree)))
            return "CandidateUdf";

        if (RuleCorrelation.Eq(resourceType, "UDF") || RuleCorrelation.Eq(resourceType, "UserDefinedFunction") || RuleCorrelation.Eq(resourceType, "User Defined"))
            return "CandidateUdf";

        if (RuleCorrelation.Eq(resourceType, "Function"))
            return "FunctionResource";

        return "FunctionLikeResource";
    }

    private static string UdfCandidateConfidence(string resourceType, ResourceDetail? details)
    {
        if (details != null && (LooksLikeUdfDefinition(details.FullAttributes) || LooksLikeUdfDefinition(details.PublicAttributes) || LooksLikeUdfPrivateTree(details.PrivateTree)))
            return "Medium";

        if (RuleCorrelation.Eq(resourceType, "UDF") || RuleCorrelation.Eq(resourceType, "UserDefinedFunction") || RuleCorrelation.Eq(resourceType, "User Defined"))
            return "Medium";

        if (RuleCorrelation.Eq(resourceType, "Function"))
            return "Low";

        return "Low";
    }

    private static bool LooksLikeUdfDefinition(IEnumerable<ResourceAttrEntry> attributes)
    {
        foreach (ResourceAttrEntry attr in attributes ?? Enumerable.Empty<ResourceAttrEntry>())
        {
            string probe = ((attr.Key ?? string.Empty) + " " + (attr.Value ?? string.Empty)).ToLowerInvariant();
            if (probe.Contains("user defined") || probe.Contains("fieldlist") || probe.Contains("field list") || probe.Contains("status result") || probe.Contains("return code"))
                return true;
        }

        return false;
    }

    private static bool LooksLikeUdfPrivateTree(ResourcePrivateNode? node)
    {
        if (node == null)
            return false;

        string probe = ((node.Name ?? string.Empty) + " " + (node.Path ?? string.Empty) + " " + (node.ValuePreview ?? string.Empty)).ToLowerInvariant();
        if (probe.Contains("fieldlist") || probe.Contains("field list") || probe.Contains("status") || probe.Contains("rule"))
            return true;

        return node.Children.Any(LooksLikeUdfPrivateTree);
    }

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
                        subfieldCount = x.SubfieldCount
                    })
                    .ToList()
            })
            .ToList();

        return new { count = items.Sum(i => i.fields.Count), items };
    }

    private static bool TryResolveRule(WorkbenchSnapshot snapshot, string reference, out RuleModel? rule, out string? ambiguityDetail)
    {
        if (snapshot.RulesByNodeId.TryGetValue(reference, out rule))
        {
            ambiguityDetail = null;
            return true;
        }

        var matches = snapshot.RulesByNodeId.Values
            .Where(m =>
                RuleCorrelation.Eq(m.Node.RuleGuid, reference) ||
                RuleCorrelation.Eq(m.Node.RuleId, reference) ||
                RuleCorrelation.Eq(m.FlatRule?.RuleGuid, reference) ||
                RuleCorrelation.Eq(m.FlatRule?.RuleId, reference))
            .ToList();

        if (matches.Count == 1)
        {
            rule = matches[0];
            ambiguityDetail = null;
            return true;
        }

        if (matches.Count > 1)
        {
            rule = null;
            ambiguityDetail = string.Join(", ", matches.Select(m => m.NodeId).OrderBy(x => x, StringComparer.OrdinalIgnoreCase));
            return false;
        }

        rule = null;
        ambiguityDetail = null;
        return false;
    }

    private object BuildRuleDetailWithIncludes(WorkbenchSnapshot snapshot, RuleModel rule, HttpListenerRequest request)
    {
        HashSet<string> include = IncludeSet(request);
        object detail = BuildRuleDetail(snapshot, rule);
        if (include.Count == 0) return detail;

        return new
        {
            detail,
            included = new
            {
                subtree = include.Contains("subtree") ? BuildRuleSubtree(snapshot, rule, request) : null,
                references = include.Contains("references") ? rule.Relationships.Select(RelationshipPayload).ToList() : null,
                diagnostics = include.Contains("diagnostics") ? rule.Diagnostics.Select(d => new { d.Severity, d.Category, d.Message, d.ScopePath, d.NodeId }).ToList() : null,
                fieldResolution = include.Contains("fieldResolution") ? BuildFieldResolution(rule) : null
            },
            include = include.OrderBy(x => x).ToList(),
            caveat = "Included sections do not imply native runtime execution. They are static inspection evidence."
        };
    }

    private object BuildRuleDetail(WorkbenchSnapshot snapshot, RuleModel rule)
    {
        AcTreeNode n = rule.Node;
        ScopeModel scope = snapshot.ScopesById[rule.ScopeId];
        var children = scope.StructuralEdges.Where(e => e.FromNodeId == n.NodeId).ToList();
        AcTreeEdge? incoming = scope.StructuralEdges.FirstOrDefault(e => e.ToNodeId == n.NodeId);

        return new
        {
            identity = new
            {
                rule.NodeId,
                rawNodeId = n.NodeId,
                n.RuleGuid,
                n.RuleId,
                name = n.RuleName,
                n.FunctionName,
                n.FunctionVersion,
                rule.ScopeId
            },
            position = new
            {
                depth = n.HierarchyLevel,
                parentNodeId = n.ParentNodeId > 0 ? "node-" + n.ParentNodeId.ToString("000000") : null,
                ordinal = n.RuleIndexWithinScope,
                branch = BranchPayload(incoming),
                path = BuildRulePath(scope, n),
                routePath = BuildRuleRoutePath(scope, n)
            },
            disabled = DisabledPayload(n),
            function = new { name = n.FunctionName, source = "StructuralRuleNode", confidence = string.IsNullOrWhiteSpace(n.FunctionName) ? "Unknown" : "High" },
            parameters = FlattenParameters(n.Parameters),
            fieldResolution = BuildFieldResolution(rule),
            relationships = rule.Relationships.Select(RelationshipPayload).ToList(),
            branches = children.GroupBy(e => e.ActionListIndex).Select(g =>
            {
                AcTreeEdge firstEdge = g.First();
                return new
                {
                    actionListIndex = g.Key,
                    actionName = firstEdge.ActionName,
                    actionNameResolved = firstEdge.ActionNameResolved,
                    routeState = RouteState(firstEdge),
                    label = ActionLabel(firstEdge),
                    childCount = g.Count(),
                    childNodeIds = g.Select(e => "node-" + e.ToNodeId.ToString("000000")).ToList(),
                    children = g.Select(e => new { nodeId = "node-" + e.ToNodeId.ToString("000000"), name = scope.StructuralNodes.FirstOrDefault(n2 => n2.NodeId == e.ToNodeId)?.RuleName }).ToList()
                };
            }).ToList(),
            reconciliation = new
            {
                structuralNode = true,
                flatInventoryMatch = rule.FlatRule != null,
                flatInventoryId = rule.FlatRule == null ? null : RuleCorrelation.InventoryId(rule.FlatRule),
                runtimeOrderProof = true,
                disabledAuthority = "Structural",
                flatInventoryDisabled = rule.FlatRule == null ? null : new { state = rule.FlatRule.DisabledState, confidence = rule.FlatRule.DisabledConfidence, reason = rule.FlatRule.DisabledReason, authority = "FlatInventory", caveat = "Audit evidence only; does not override structural disabled state." }
            },
            evidence = new
            {
                @class = "Structural",
                sourcePath = rule.ScopeId + "/TreeNode[" + n.NodeId + "]",
                rawAttributes = n.Attributes,
                warnings = rule.Diagnostics.Select(d => d.Message).ToList()
            },
            notProven = new[]
            {
                "Native runtime execution was not simulated.",
                "ac-flow.json is experimental / low-confidence and is not native runtime proof.",
                "Structural disabled state is authoritative over flat inventory disabled state.",
                "Business intent is only shown when supported by extracted function names, parameters, branch labels, or references."
            }
        };
    }

    private static object BuildFieldResolution(RuleModel rule)
    {
        int resolved = rule.FieldResolutions.Count(r => r.FieldExists);
        int unresolved = rule.FieldResolutions.Count - resolved;
        return new
        {
            summary = new
            {
                referenced = rule.FieldResolutions.Count,
                resolved,
                unresolved,
                caveat = "Field resolution is static catalog matching against extracted field metadata and is not runtime proof."
            },
            items = rule.FieldResolutions.Select(r => new
            {
                parameterName = r.ParameterName,
                parameterValue = r.ParameterValue,
                referencedField = r.ReferencedField,
                fieldExists = r.FieldExists,
                confidence = r.Confidence,
                source = r.Source,
                matches = r.Matches.Select(m => new
                {
                    name = m.Name,
                    scopeType = m.ScopeType,
                    scopeName = m.ScopeName,
                    fieldType = m.FieldType,
                    geometry = m.Geometry,
                    x = m.X,
                    y = m.Y,
                    width = m.Width,
                    height = m.Height,
                    source = m.Source
                }).ToList()
            }).ToList()
        };
    }

    private object BuildRuleSubtree(WorkbenchSnapshot snapshot, RuleModel root, HttpListenerRequest request)
    {
        ScopeModel scope = snapshot.ScopesById[root.ScopeId];
        int maxDepth = Math.Max(0, GetInt(request, "maxDepth", 0));
        var byParent = scope.StructuralEdges.GroupBy(e => e.FromNodeId).ToDictionary(g => g.Key, g => g.Select(e => e.ToNodeId).ToList());
        var nodeById = scope.StructuralNodes.ToDictionary(n => n.NodeId);
        var selected = new HashSet<int>();
        var stack = new Stack<Tuple<int, int>>();
        stack.Push(Tuple.Create(root.Node.NodeId, 0));
        selected.Add(root.Node.NodeId);

        while (stack.Count > 0)
        {
            Tuple<int, int> item = stack.Pop();
            if (maxDepth > 0 && item.Item2 >= maxDepth) continue;
            if (!byParent.TryGetValue(item.Item1, out List<int>? children)) continue;

            foreach (int child in children)
            {
                if (selected.Add(child))
                    stack.Push(Tuple.Create(child, item.Item2 + 1));
            }
        }

        var nodes = selected.Where(nodeById.ContainsKey).Select(id => nodeById[id]).ToList();
        var edges = scope.StructuralEdges.Where(e => selected.Contains(e.FromNodeId) && selected.Contains(e.ToNodeId)).ToList();

        return new
        {
            rootNodeId = root.NodeId,
            summary = new
            {
                descendantCount = Math.Max(0, selected.Count - 1),
                returnedCount = selected.Count,
                maxDepth = maxDepth == 0 ? (int?)null : maxDepth,
                directDisabled = nodes.Count(n => n.DisabledState == AcDisabledStates.DisabledDirect),
                inheritedDisabled = nodes.Count(n => n.DisabledState == AcDisabledStates.DisabledInherited),
                truncatedByDepth = maxDepth > 0 && edges.Any(e => byParent.ContainsKey(e.ToNodeId))
            },
            nodes = nodes.Select(n => new { nodeId = RuleCorrelation.NodeId(n), name = n.RuleName, n.FunctionName, depth = n.HierarchyLevel, branch = BranchPayload(scope.StructuralEdges.FirstOrDefault(e => e.ToNodeId == n.NodeId)), disabled = DisabledPayload(n) }).ToList(),
            edges = edges.Select(EdgePayload).ToList()
        };
    }

    private object BuildSearch(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string q = Get(request, "q") ?? Get(request, "term") ?? string.Empty;
        string? kind = Get(request, "kind");
        string? scopeId = Get(request, "scopeId");
        int limit = Math.Max(1, Math.Min(500, GetInt(request, "limit", 100)));
        var items = new List<object>(limit);
        int totalCount = 0;

        if (string.IsNullOrWhiteSpace(q))
            return new { query = q, count = 0, items, warning = "Pass ?q=..." };

        // Keep full match count while storing only up to the requested result limit.
        void AddItem(object item)
        {
            totalCount++;
            if (items.Count < limit)
                items.Add(item);
        }

        bool all = string.IsNullOrWhiteSpace(kind);
        IEnumerable<ScopeModel> scopes = snapshot.ScopesById.Values;
        if (!string.IsNullOrWhiteSpace(scopeId)) scopes = scopes.Where(s => RuleCorrelation.Eq(s.ScopeId, scopeId));

        if (all || RuleCorrelation.Eq(kind, "Scope"))
        {
            foreach (var item in scopes.Where(s => RuleCorrelation.Contains(s.Name, q) || RuleCorrelation.Contains(s.ScopeId, q)).Select(s => new
            {
                kind = "Scope",
                s.ScopeId,
                title = s.Name,
                subtitle = s.Kind + " · " + s.StructuralRuleCount + " structural rules",
                badges = BadgesForScope(s),
                evidenceClass = "ScopeSummary",
                isRuntimeDependency = false,
                link = "/api/v1/scopes/" + UrlEncode(s.ScopeId)
            })) AddItem(item);
        }

        if (all || RuleCorrelation.Eq(kind, "StructuralRule"))
        {
            foreach (var item in scopes.SelectMany(s => s.StructuralNodes.Where(n => n.IsRuleNode).Select(n => new { s, n }))
                .Where(x => RuleCorrelation.Contains(x.n.RuleName, q) || RuleCorrelation.Contains(x.n.FunctionName, q) || RuleCorrelation.Contains(x.n.RuleGuid, q))
                .Select(x => new
                {
                    kind = "StructuralRule",
                    x.s.ScopeId,
                    nodeId = RuleCorrelation.NodeId(x.n),
                    title = x.n.RuleName ?? x.n.FunctionName ?? RuleCorrelation.NodeId(x.n),
                    subtitle = (x.n.FunctionName ?? "(missing function)") + " · " + x.s.Name,
                    badges = BadgesForNode(x.n),
                    evidenceClass = "Structural",
                    isRuntimeDependency = false,
                    link = "/api/v1/rules/" + RuleCorrelation.NodeId(x.n)
                })) AddItem(item);
        }

        if (all || RuleCorrelation.Eq(kind, "FlatInventory"))
        {
            foreach (var item in scopes.SelectMany(s => s.FlatRules.Select(r => new { s, r }))
                .Where(x => RuleCorrelation.Contains(x.r.RuleName, q) || RuleCorrelation.Contains(x.r.FunctionName, q) || RuleCorrelation.Contains(x.r.RuleGuid, q))
                .Select(x => new
                {
                    kind = "FlatInventory",
                    x.s.ScopeId,
                    inventoryId = RuleCorrelation.InventoryId(x.r),
                    title = x.r.RuleName ?? x.r.FunctionName ?? RuleCorrelation.InventoryId(x.r),
                    subtitle = (x.r.FunctionName ?? "(missing function)") + " · " + x.s.Name,
                    badges = new[] { snapshot.RulesByStructuralKey.ContainsKey(RuleCorrelation.FlatKey(x.r)) ? "Structural match" : "Flat only" },
                    evidenceClass = "FlatInventory",
                    isRuntimeDependency = false,
                    link = "/api/v1/scopes/" + UrlEncode(x.s.ScopeId) + "/inventory"
                })) AddItem(item);
        }

        if (all || RuleCorrelation.Eq(kind, "Reference"))
        {
            foreach (var item in scopes.SelectMany(s => s.Relationships.Select(r => new { s, r }))
                .Where(x => RuleCorrelation.Contains(x.r.Target, q) || RuleCorrelation.Contains(x.r.Kind, q) || RuleCorrelation.Contains(x.r.TargetType, q))
                .Select(x => new
                {
                    kind = "Reference",
                    x.s.ScopeId,
                    title = x.r.Kind + " " + x.r.Target,
                    subtitle = (x.r.FunctionName ?? "(unknown function)") + " · " + x.r.TargetType,
                    badges = new[] { x.r.Confidence, IsRuntimeDependency(x.r) ? "Runtime dependency" : "Static mention" },
                    evidenceClass = x.r.Confidence,
                    isRuntimeDependency = IsRuntimeDependency(x.r),
                    link = "/api/v1/scopes/" + UrlEncode(x.s.ScopeId) + "/references"
                })) AddItem(item);
        }

        return new { query = q, kind, scopeId, count = totalCount, items };
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
        return value == "1" || value.Equals("yes", StringComparison.OrdinalIgnoreCase) || value.Equals("on", StringComparison.OrdinalIgnoreCase) || value.Equals("true", StringComparison.OrdinalIgnoreCase);
    }

    // Request-level mode gives the harness a way to force cached or live behavior per call.
    private static SnapshotModeRequest GetSnapshotModeRequest(HttpListenerRequest request)
    {
        string? value = Get(request, "snapshotMode");
        if (string.IsNullOrWhiteSpace(value)) return SnapshotModeRequest.Default;

        switch (value.Trim().ToLowerInvariant())
        {
            case "live":
            case "rebuild":
            case "fresh":
                return SnapshotModeRequest.Live;
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
