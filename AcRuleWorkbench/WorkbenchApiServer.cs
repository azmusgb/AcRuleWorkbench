using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using AcRuleWorkbench.Api;
using AcRuleWorkbench.Api.Legacy;
using AcRuleWorkbench.Api.V1;
using AcRuleWorkbench.Core;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

namespace AcRuleWorkbench;

internal sealed class WorkbenchApiServer
{
    private static readonly HashSet<string> ViewerRoutes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "viewer",
        "viewer/index.html",
        "viewer/ac-rule-viewer.html",
        "ac-rule-viewer.html"
    };

    private static readonly HashSet<string> HarnessRoutes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "test",
        "harness",
        "api-harness"
    };

    private readonly IFormWorksExtractionClient _client;
    private readonly ILogger<WorkbenchApiServer> _logger;
    private readonly WorkbenchApiServerOptions _options;
    private readonly object _refreshGate = new object();
    private readonly WorkbenchSnapshotCache _snapshotCache;
    private readonly WorkbenchApiService _v1Api;
    private readonly LegacyRouteDispatcher _legacyDispatcher;
    private readonly ApiResponseWriter _responseWriter;
    private readonly SemaphoreSlim _requestConcurrencyGate;
    private readonly object _requestTaskGate = new object();
    private readonly HashSet<Task> _inFlightRequests = new HashSet<Task>();
    private WorkbenchRefreshState _lastRefresh = WorkbenchRefreshState.NotRun();
    private volatile bool _stopping;

    public WorkbenchApiServer(IFormWorksExtractionClient client, ILogger<WorkbenchApiServer> logger, WorkbenchApiServerOptions options)
    {
        _client = client ?? throw new ArgumentNullException(nameof(client));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _options = options ?? throw new ArgumentNullException(nameof(options));
        _snapshotCache = new WorkbenchSnapshotCache(_client);
        _v1Api = new WorkbenchApiService(_client, _options, _snapshotCache);
        _responseWriter = new ApiResponseWriter();
        _requestConcurrencyGate = new SemaphoreSlim(Math.Max(4, Environment.ProcessorCount * 4));
        _legacyDispatcher = new LegacyRouteDispatcher(
            _client,
            _options,
            GetFwdPath,
            Get,
            GetInt,
            GetNullableInt,
            GetBool,
            DispatchSemanticFwd,
            DispatchDebugApi,
            BuildDebugDisabledPayload,
            BuildHelp,
            IsDebugRoute);
    }

    public int Run()
    {
        string prefix = NormalizePrefix(_options.Prefix);
        using var listener = new HttpListener();
        listener.Prefixes.Add(prefix);

        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            _stopping = true;
            try { listener.Stop(); } catch { }
        };

        try
        {
            listener.Start();
        }
        catch (HttpListenerException ex)
        {
            Console.Error.WriteLine("Failed to start API listener.");
            Console.Error.WriteLine(ex.Message);
            Console.Error.WriteLine();
            Console.Error.WriteLine("Common fixes:");
            Console.Error.WriteLine("- Use a localhost prefix, for example: --prefix http://127.0.0.1:8787/");
            Console.Error.WriteLine("- Choose another port: --port 8788");
            Console.Error.WriteLine("- For non-local prefixes, reserve the URL with netsh http add urlacl.");
            return 1;
        }

        Console.WriteLine("AC Rule Workbench");
        Console.WriteLine("============================");
        Console.WriteLine("Mode          : " + (_options.EnableDebugApi ? "Diagnostic / developer" : "Local production"));
        Console.WriteLine("Listening     : " + prefix);
        Console.WriteLine("Viewer        : " + CombineUrl(prefix, "viewer"));
        Console.WriteLine("API           : " + CombineUrl(prefix, "api/v1/status"));
        Console.WriteLine("OpenAPI       : " + CombineUrl(prefix, "api/v1/openapi.json"));
        Console.WriteLine("Health live   : " + CombineUrl(prefix, "api/v1/health/live"));
        Console.WriteLine("Health ready  : " + CombineUrl(prefix, "api/v1/health/ready"));
        Console.WriteLine("Debug API     : " + (_options.EnableDebugApi ? CombineUrl(prefix, "harness") + " (enabled with --enable-debug-api)" : "disabled by default"));
        Console.WriteLine("CORS          : " + (_options.EnableCors ? "enabled" : "disabled"));
        Console.WriteLine("Path override : " + (_options.AllowPathQuery ? "enabled" : "disabled"));
        Console.WriteLine("Default FWD   : " + (_options.DefaultFwdPath ?? "(not set; pass --path)"));
        Console.WriteLine("Press Ctrl+C to stop.");

        // Pre-build the snapshot in the background so the first viewer request hits the cache.
        // This eliminates the 60â€“120 s cold-start stall on /scopes and /snapshot when a default
        // FWD path is configured.
        if (!string.IsNullOrWhiteSpace(_options.DefaultFwdPath) && !_options.DisableSnapshotCache)
        {
            string warmFwdPath = _options.DefaultFwdPath!;
            Console.WriteLine("Snapshot      : pre-building in background (open /api/v1/health/ready to check progress)...");
            _snapshotCache.WarmUpAsync(warmFwdPath, "AC", false)
                .ContinueWith(t =>
                {
                    if (t.IsFaulted)
                        Console.WriteLine("Snapshot warm-up failed: " + (t.Exception?.GetBaseException().Message ?? "unknown error"));
                    else
                        Console.WriteLine("Snapshot warm-up complete.");
                }, TaskScheduler.Default);
        }

        if (_options.OpenBrowser)
            TryOpenBrowser(prefix);

        while (!_stopping)
        {
            HttpListenerContext context;
            try
            {
                context = listener.GetContext();
            }
            catch (HttpListenerException) when (_stopping || !listener.IsListening)
            {
                break;
            }
            catch (ObjectDisposedException)
            {
                break;
            }

            _requestConcurrencyGate.Wait();
            Task task = Task.Run(() => HandleContextSafe(context));
            lock (_requestTaskGate)
            {
                _inFlightRequests.Add(task);
            }

            task.ContinueWith(
                t =>
                {
                    lock (_requestTaskGate)
                    {
                        _inFlightRequests.Remove(t);
                    }
                },
                TaskScheduler.Default);
        }

        Task[] pending;
        lock (_requestTaskGate)
        {
            pending = _inFlightRequests.ToArray();
        }

        if (pending.Length > 0)
        {
            try
            {
                Task.WaitAll(pending, TimeSpan.FromSeconds(10));
            }
            catch
            {
                // Best-effort drain during shutdown.
            }
        }

        return 0;
    }

    // Handles a single request in the concurrent worker pipeline and preserves existing error contracts.
    private void HandleContextSafe(HttpListenerContext context)
    {
        try
        {
            Handle(context);
        }
        catch (ApiRouteNotFoundException ex)
        {
            _responseWriter.WriteJson(context.Response, new ApiError
            {
                Error = "Route not found.",
                ExceptionType = nameof(ApiRouteNotFoundException),
                ExceptionMessage = ex.Route
            }, 404, _options.EnableCors);
        }
        catch (FormWorksInteropException ex)
        {
            _responseWriter.WriteJson(context.Response, new ApiError
            {
                Error = ex.Message,
                ExceptionType = ex.GetType().Name,
                ExceptionMessage = ex.InnerException?.Message
            }, 400, _options.EnableCors);
        }
        catch (Exception ex) when (ApiResponseWriter.IsClientDisconnectedException(ex))
        {
            _logger.LogDebug(ex, "API client disconnected before the response could be written.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled API request failure");
            try
            {
                _responseWriter.WriteJson(context.Response, new ApiError
                {
                    Error = "Unhandled server error.",
                    ExceptionType = ex.GetType().Name,
                    ExceptionMessage = ex.Message
                }, 500, _options.EnableCors);
            }
            catch (Exception writeEx) when (ApiResponseWriter.IsClientDisconnectedException(writeEx))
            {
                _logger.LogDebug(writeEx, "API client disconnected while the error response was being written.");
            }
        }
        finally
        {
            _requestConcurrencyGate.Release();
        }
    }

    private static bool IsRootRequest(HttpListenerRequest request)
    {
        string path = request.Url?.AbsolutePath ?? "/";
        return string.Equals(path, "/", StringComparison.Ordinal) || path.Length == 0;
    }

    private static void WriteRedirect(HttpListenerResponse response, string location)
    {
        if (response == null)
            throw new ArgumentNullException(nameof(response));

        if (string.IsNullOrWhiteSpace(location))
            throw new ArgumentException("Redirect location is required.", nameof(location));

        response.StatusCode = 302;
        response.RedirectLocation = location;
        response.Headers["Cache-Control"] = "no-store";
        response.ContentLength64 = 0;
        response.Close();
    }

    private void Handle(HttpListenerContext context)
    {
        HttpListenerRequest request = context.Request;
        HttpListenerResponse response = context.Response;

        if (string.Equals(request.HttpMethod, "OPTIONS", StringComparison.OrdinalIgnoreCase))
        {
            _responseWriter.WriteNoContent(response, _options.EnableCors);
            return;
        }

        if (IsRootRequest(request))
        {
            WriteRedirect(response, "/viewer");
            return;
        }

        string route = (request.Url?.AbsolutePath ?? "/").Trim('/');
        string routeKey = route.ToLowerInvariant();
        if (ViewerRoutes.Contains(route))
        {
            WriteStaticViewer(context);
            return;
        }

        if (HarnessRoutes.Contains(route))
        {
            if (!_options.EnableDebugApi)
            {
                _responseWriter.WriteHtml(response, BuildDebugDisabledHtml(), _options.EnableCors);
                return;
            }

            _responseWriter.WriteHtml(response, BuildHarnessHtml(), _options.EnableCors);
            return;
        }

        if (routeKey == "api-harness.css")
        {
            if (!_options.EnableDebugApi)
            {
                _responseWriter.WriteNoContent(response, _options.EnableCors);
                return;
            }

            WriteHarnessCss(context);
            return;
        }

        if (routeKey == "ac-rule-viewer.css" || routeKey == "viewer/ac-rule-viewer.css")
        {
            WriteViewerCss(context, "ac-rule-viewer.css");
            return;
        }
        if (routeKey == "ac-rule-viewer.js" || routeKey == "viewer/ac-rule-viewer.js")
        {
            WriteViewerTextAsset(context, "ac-rule-viewer.js", "application/javascript; charset=utf-8", string.Empty);
            return;
        }

        if (routeKey == "ac-rule-viewer.rules.json" || routeKey == "viewer/ac-rule-viewer.rules.json")
        {
            WriteViewerTextAsset(context, "ac-rule-viewer.rules.json", "application/json; charset=utf-8", "{}");
            return;
        }

        if (routeKey == "ac-rule-viewer.rel.json" || routeKey == "viewer/ac-rule-viewer.rel.json")
        {
            WriteViewerTextAsset(context, "ac-rule-viewer.rel.json", "application/json; charset=utf-8", "{}");
            return;
        }

        if (routeKey == "ac-rule-viewer.tree.json" || routeKey == "viewer/ac-rule-viewer.tree.json")
        {
            WriteViewerTextAsset(context, "ac-rule-viewer.tree.json", "application/json; charset=utf-8", "{}");
            return;
        }

        if (routeKey == "api/workbench/status")
        {
            AddDeprecationHeaders(response, "/api/v1/status");
            _responseWriter.WriteJson(response, BuildWorkbenchStatus(request), 200, _options.EnableCors);
            return;
        }

        if (routeKey == "api/workbench/refresh" || routeKey == "api/fwd/refresh")
        {
            AddDeprecationHeaders(response, "/api/v1/snapshot/refresh");
            if (!string.Equals(request.HttpMethod, "POST", StringComparison.OrdinalIgnoreCase))
            {
                _responseWriter.WriteJson(response, new ApiError
                {
                    Error = "Snapshot refresh requires POST.",
                    ExceptionType = "MethodNotAllowed",
                    ExceptionMessage = "Use POST /api/v1/snapshot/refresh."
                }, 405, _options.EnableCors);
                return;
            }

            int refreshStatus = _options.AllowMutatingCommands ? 200 : 409;
            _responseWriter.WriteJson(response, RefreshWorkbench(request), refreshStatus, _options.EnableCors);
            return;
        }

        if (routeKey == "favicon.ico")
        {
            _responseWriter.WriteNoContent(response, _options.EnableCors);
            return;
        }

        if (routeKey == "api/v1" || routeKey.StartsWith("api/v1/", StringComparison.Ordinal))
        {
            ApiHttpResult v1Result = _v1Api.Dispatch(route, request);
            _responseWriter.WriteApiResult(response, v1Result, _options.EnableCors);
            return;
        }

        if (route.StartsWith("api/fwd/", StringComparison.OrdinalIgnoreCase))
            AddDeprecationHeaders(response, "/api/v1");
        else if (IsDebugRoute(routeKey))
            AddDeprecationHeaders(response, "/api/debug");

        object result = _legacyDispatcher.Dispatch(routeKey, request);
        _responseWriter.WriteJson(response, result, 200, _options.EnableCors);
    }

    private static bool IsDebugRoute(string route)
    {
        return route == "api/probe"
            || route == "api/doctor"
            || route == "api/inspect"
            || route == "api/stc-process"
            || route == "api/fip"
            || route == "api/ocr"
            || route.StartsWith("api/ac/", StringComparison.OrdinalIgnoreCase);
    }

    private static object BuildDebugDisabledPayload(string route)
    {
        return new
        {
            ok = false,
            route,
            error = "Debug API is disabled for this server process.",
            fix = "Restart with --enable-debug-api to expose diagnostic/raw extraction routes. Keep this disabled for normal product use.",
            productHelp = "/api/v1/help"
        };
    }

    private static string BuildDebugDisabledHtml()
    {
        const string command = "AcRuleWorkbench.exe api --path C:\\rri\\ddce\\configs\\Server\\R1\\fwd\\fwd.cfd --port 8787 --viewer .\\ac-rule-viewer.html --allow-refresh --enable-debug-api --allow-path-query";
        return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Debug API disabled</title>" +
               "<style>body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#eef3f8;color:#172033}main{max-width:860px;margin:48px auto;padding:0 22px}.card{background:white;border:1px solid #d7e0eb;border-radius:22px;padding:28px;box-shadow:0 18px 50px rgba(15,23,42,.10)}h1{margin:0 0 10px;font-size:28px}p{color:#64748b;line-height:1.55}pre{background:#101827;color:#eaf2ff;border-radius:14px;padding:16px;overflow:auto}a{color:#3157d5;font-weight:800}</style></head>" +
               "<body><main><section class=\"card\"><h1>Debug API disabled</h1><p>The product workbench is available, but the development harness/raw debug routes are hidden for this server process.</p><p>Open the workbench at <a href=\"/viewer\">/viewer</a> or product API help at <a href=\"/api/v1/help\">/api/v1/help</a>.</p><p>To expose diagnostic routes, restart with <code>--enable-debug-api</code>:</p><pre>" + command + "</pre></section></main></body></html>";
    }


    private object Dispatch(string route, HttpListenerRequest request)
    {
        if (route == "api" || route == "api/help")
            return BuildHelp();

        if (route == "api/health")
        {
            return new
            {
                ok = true,
                service = "AcRuleWorkbench local API",
                version = typeof(Program).Assembly.GetName().Version?.ToString() ?? "unknown",
                processBitness = Environment.Is64BitProcess ? "64-bit" : "32-bit",
                machineName = Environment.MachineName,
                defaultFwdPath = _options.DefaultFwdPath,
                utc = DateTime.UtcNow
            };
        }

        if (route == "api/debug" || route.StartsWith("api/debug/", StringComparison.OrdinalIgnoreCase))
        {
            if (!_options.EnableDebugApi)
                return BuildDebugDisabledPayload(route);

            return DispatchDebugApi(route, request);
        }

        if (route.StartsWith("api/fwd/", StringComparison.OrdinalIgnoreCase))
            return DispatchSemanticFwd(route, request);

        if (IsDebugRoute(route) && !_options.EnableDebugApi)
            return BuildDebugDisabledPayload(route);

        if (route == "api/probe" || route == "api/doctor")
            return _client.Probe();

        if (route == "api/inspect")
        {
            return _client.Inspect(new FwdInspectionOptions
            {
                Path = GetFwdPath(request),
                IncludeFields = GetBool(request, "fields", false),
                RequireNativeOk = GetBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/stc-process")
        {
            return _client.InspectProcessTree(new StcTraversalOptions
            {
                Path = GetFwdPath(request),
                ProcessName = Get(request, "process") ?? "AC",
                MaxDepth = GetInt(request, "maxDepth", 5),
                MaxNodes = GetInt(request, "maxNodes", 1500),
                MaxPreviewBytes = GetInt(request, "maxPreviewBytes", 256),
                IncludeDataPreview = !GetBool(request, "noDataPreview", false),
                IncludeDotNodes = GetBool(request, "includeDotNodes", false),
                RequireNativeOk = GetBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/ac/rules")
        {
            return _client.InspectAcRules(new AcRuleOptions
            {
                Path = GetFwdPath(request),
                ProcessName = Get(request, "process") ?? "AC",
                Term = Get(request, "term"),
                Scope = Get(request, "scope"),
                Function = Get(request, "function"),
                IncludeRawTokens = GetBool(request, "includeRawTokens", false),
                MaxRawTokensPerScope = GetInt(request, "maxRawTokens", 250),
                MaxScopeCount = GetInt(request, "maxScopes", 0),
                RequireNativeOk = GetBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/ac/tree")
        {
            return _client.BuildAcTree(new AcTreeOptions
            {
                Path = GetFwdPath(request),
                ProcessName = Get(request, "process") ?? "AC",
                Term = Get(request, "term"),
                Scope = Get(request, "scope"),
                IncludeAttributes = GetBool(request, "includeAttributes", false),
                MaxAttributeValueLength = GetInt(request, "maxAttributeValueLength", 500),
                MaxHierarchyDepth = GetInt(request, "maxHierarchyDepth", 256),
                MaxNodeEntryCount = (uint)Math.Max(1, GetInt(request, "maxNodeEntryCount", 100000)),
                MaskSensitiveValues = !GetBool(request, "noMaskSensitive", false),
                RequireNativeOk = GetBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/ac/relationships" || route == "api/ac/trace")
        {
            return _client.TraceAcRelationships(new AcTraceOptions
            {
                Path = GetFwdPath(request),
                ProcessName = Get(request, "process") ?? "AC",
                Term = Get(request, "term"),
                Scope = Get(request, "scope"),
                Function = Get(request, "function"),
                Field = Get(request, "field"),
                Attr = Get(request, "attr"),
                RelationshipKind = Get(request, "kind"),
                IncludeRules = GetBool(request, "includeRules", false),
                MaxRelationships = GetInt(request, "maxRelationships", 0),
                RequireNativeOk = GetBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/ac/index")
        {
            return _client.BuildAcIndex(new AcRuleOptions
            {
                Path = GetFwdPath(request),
                ProcessName = Get(request, "process") ?? "AC",
                Term = Get(request, "term"),
                Scope = Get(request, "scope"),
                Function = Get(request, "function"),
                RequireNativeOk = GetBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/ac/disabled")
        {
            return _client.AnalyzeDisabledRules(new AcDisabledOptions
            {
                Path = GetFwdPath(request),
                ProcessName = Get(request, "process") ?? "AC",
                Term = Get(request, "term"),
                Scope = Get(request, "scope"),
                Function = Get(request, "function"),
                State = Get(request, "state"),
                IncludeRules = true,
                InheritDisabled = !GetBool(request, "noDisabledInherit", false),
                RequireNativeOk = GetBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/ac/diagnostics")
        {
            return _client.BuildAcDiagnostics(new AcRuleOptions
            {
                Path = GetFwdPath(request),
                ProcessName = Get(request, "process") ?? "AC",
                Term = Get(request, "term"),
                Scope = Get(request, "scope"),
                Function = Get(request, "function"),
                RequireNativeOk = GetBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/fip")
        {
            return _client.InspectFip(new FipInspectionOptions
            {
                Path = GetFwdPath(request),
                ProcessName = Get(request, "process") ?? "FIP",
                Page = Get(request, "page"),
                Variant = Get(request, "variant"),
                MaxVariants = GetInt(request, "maxVariants", 50),
                RequireNativeOk = GetBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/ocr")
        {
            string? path = Get(request, "path");
            if (string.IsNullOrWhiteSpace(path))
                throw new FormWorksInteropException("The OCR endpoint requires query parameter 'path'.");

            return _client.InspectOcr(new OcrInspectionOptions
            {
                Path = path,
                RequireNativeOk = GetBool(request, "requireNativeOk", false)
            });
        }

        throw new ApiRouteNotFoundException(route);
    }


    private object DispatchDebugApi(string route, HttpListenerRequest request)
    {
        if (route == "api/debug" || route == "api/debug/routes")
        {
            return new
            {
                ok = true,
                debug = true,
                stableContract = false,
                routes = new[]
                {
                    "GET /api/debug/health",
                    "GET /api/debug/routes",
                    "GET /api/debug/probe",
                    "GET /api/debug/inspect?path=...",
                    "GET /api/debug/stc/processes?process=AC",
                    "GET /api/debug/ac/rules",
                    "GET /api/debug/ac/tree",
                    "GET /api/debug/ac/relationships",
                }
            };
        }

        if (route == "api/debug/health")
        {
            return new
            {
                ok = true,
                debug = true,
                stableContract = false,
                service = "AcRuleWorkbench debug API",
                utc = DateTime.UtcNow,
                processBitness = Environment.Is64BitProcess ? "64-bit" : "32-bit",
                defaultFwdPath = _options.DefaultFwdPath
            };
        }

        if (route == "api/debug/probe") return _client.Probe();

        if (route == "api/debug/inspect")
        {
            return _client.Inspect(new FwdInspectionOptions
            {
                Path = GetFwdPath(request),
                IncludeFields = GetBool(request, "fields", false),
                RequireNativeOk = GetBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/debug/stc/processes")
        {
            return _client.InspectProcessTree(new StcTraversalOptions
            {
                Path = GetFwdPath(request),
                ProcessName = Get(request, "process") ?? "AC",
                MaxDepth = GetInt(request, "maxDepth", 5),
                MaxNodes = GetInt(request, "maxNodes", 1500),
                MaxPreviewBytes = GetInt(request, "maxPreviewBytes", 256),
                IncludeDataPreview = !GetBool(request, "noDataPreview", false),
                IncludeDotNodes = GetBool(request, "includeDotNodes", false),
                RequireNativeOk = GetBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/debug/ac/rules") return Dispatch("api/ac/rules", request);
        if (route == "api/debug/ac/tree") return Dispatch("api/ac/tree", request);
        if (route == "api/debug/ac/relationships") return Dispatch("api/ac/relationships", request);

        throw new ApiRouteNotFoundException(route);
    }

    private object BuildHelp()
    {
        return new
        {
            service = "AC Rule Workbench",
            mode = _options.EnableDebugApi ? "diagnostic / developer" : "local production",
            defaultFwdPath = _options.DefaultFwdPath,
            debugApiEnabled = _options.EnableDebugApi,
            pathQueryEnabled = _options.AllowPathQuery,
            publicContract = "/api/v1/openapi.json",
            productEndpoints = new[]
            {
                "GET /viewer",
                "GET /api/v1/health/live",
                "GET /api/v1/health/ready",
                "GET /api/v1/status",
                "GET /api/v1/snapshot",
                "POST /api/v1/snapshot/refresh",
                "GET /api/v1/scopes",
                "GET /api/v1/scopes/{scopeId}?include=structure,inventory,references,diagnostics",
                "GET /api/v1/rules/{nodeId}?include=subtree,references",
                "GET /api/v1/search?q=provider",
                "GET /api/v1/diagnostics",
                "GET /api/v1/openapi.json"
            },
            compatibility = new
            {
                legacyFwdRoutes = "Compatibility only. New clients must use /api/v1.",
                workbenchAliases = "Compatibility only. Use /api/v1/status and /api/v1/snapshot/refresh."
            },
            debug = _options.EnableDebugApi
                ? "Diagnostic routes are available under /api/debug/* and the harness is available at /harness. They are not product contracts."
                : "Diagnostic routes are disabled by default. Restart with --enable-debug-api to expose /api/debug/* and /harness.",
            interpretation = new
            {
                structure = "Use structural tree evidence for hierarchy, order, and action routing.",
                inventory = "Use flat inventory for broad search/completeness only; it is not runtime order proof.",
                references = "Treat references as static evidence-coded relationships; confidence must be read explicitly.",
                runtime = "This app performs static inspection. It does not simulate native AC runtime execution."
            }
        };
    }


    private object DispatchSemanticFwd(string route, HttpListenerRequest request)
    {
        string[] parts = route.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
        string tail = string.Join("/", parts.Skip(2));

        if (tail == "info") return BuildFwdInfo(request);
        if (tail == "health") return BuildFwdHealth(request);
        if (tail == "capabilities") return BuildFwdCapabilities();
        if (tail == "snapshot" || tail == "snapshot/normalized") return BuildNormalizedSnapshot(request);
        if (tail == "snapshot/raw") return BuildRawSnapshot(request);
        if (tail == "snapshot/download") return BuildNormalizedSnapshot(request);
        if (tail == "hierarchy") return BuildHierarchy(request);
        if (tail == "batches") return BuildBatches(request);
        if (tail.StartsWith("batches/", StringComparison.OrdinalIgnoreCase)) return BuildBatchRoute(parts, request);
        if (tail == "documents") return BuildDocuments(request);
        if (tail.StartsWith("documents/", StringComparison.OrdinalIgnoreCase)) return BuildDocumentRoute(parts, request);
        if (tail == "pages") return BuildPages(request);
        if (tail.StartsWith("pages/", StringComparison.OrdinalIgnoreCase)) return BuildPageRoute(parts, request);
        if (tail == "processes") return BuildProcesses(request);
        if (tail.StartsWith("processes/", StringComparison.OrdinalIgnoreCase)) return BuildProcessRoute(parts, request);
        if (tail == "rules" || tail == "rules/scopes") return BuildRulesRoute(parts, request);
        if (tail.StartsWith("rules/", StringComparison.OrdinalIgnoreCase)) return BuildRulesRoute(parts, request);
        if (tail == "functions" || tail.StartsWith("functions/", StringComparison.OrdinalIgnoreCase)) return BuildFunctionsRoute(parts, request);
        if (tail == "resources" || tail.StartsWith("resources/", StringComparison.OrdinalIgnoreCase)) return BuildResourcesRoute(parts, request);
        if (tail == "search" || tail.StartsWith("search/", StringComparison.OrdinalIgnoreCase)) return BuildSearch(request, parts.Length > 3 ? parts[3] : null);
        if (tail == "diagnostics" || tail.StartsWith("diagnostics/", StringComparison.OrdinalIgnoreCase)) return BuildSemanticDiagnostics(request, tail);
        if (tail == "evidence/summary") return BuildEvidenceSummary(request);
        if (tail == "evidence" || tail.StartsWith("evidence/", StringComparison.OrdinalIgnoreCase)) return BuildEvidence(request, parts.Length > 3 ? UrlDecode(parts[3]) : null);
        if (tail.StartsWith("raw/stc", StringComparison.OrdinalIgnoreCase))
        {
            if (!_options.EnableDebugApi)
                return BuildDebugDisabledPayload("api/fwd/raw/stc");
            return BuildRawStc(request, parts.Length > 4 ? UrlDecode(parts[4]) : null);
        }

        throw new ApiRouteNotFoundException(route);
    }

    private object BuildFwdInfo(HttpListenerRequest request)
    {
        var fwd = InspectCore(request, includeFields: false);
        return new
        {
            schema = "FwdInspection.Info",
            schemaVersion = "2.0.0",
            source = new
            {
                path = fwd.Path,
                releaseNumber = fwd.ReleaseNumber,
                releaseString = fwd.ReleaseString,
                releaseDateString = fwd.ReleaseDateString,
                readMode = "read-only",
                openedBy = "AcRuleWorkbench local API",
                openedAtUtc = DateTime.UtcNow,
                processBitness = Environment.Is64BitProcess ? "64-bit" : "32-bit",
                machineName = Environment.MachineName
            },
            counts = new
            {
                batches = fwd.Batches.Count,
                documents = fwd.Documents.Count,
                pages = fwd.Pages.Count,
                processes = fwd.Processes.Count,
                resourceBuckets = fwd.Resources.Count,
                pageVariantBuckets = fwd.PageVariants.Count
            },
            warnings = fwd.Warnings,
            links = new
            {
                hierarchy = "/api/fwd/hierarchy",
                snapshot = "/api/fwd/snapshot/normalized",
                diagnostics = "/api/fwd/diagnostics"
            }
        };
    }

    private object BuildFwdHealth(HttpListenerRequest request)
    {
        var probe = _client.Probe();
        var fwd = InspectCore(request, includeFields: false);
        return new
        {
            ok = true,
            service = "FWD semantic inspection API",
            apiVersion = "2.0.0",
            mode = "read-mostly semantic inspection",
            fwd = new { path = fwd.Path, releaseNumber = fwd.ReleaseNumber, releaseString = fwd.ReleaseString, releaseDateString = fwd.ReleaseDateString },
            runtime = new { processBitness = Environment.Is64BitProcess ? "64-bit" : "32-bit", machineName = Environment.MachineName, utc = DateTime.UtcNow },
            nativeProbe = probe,
            warnings = fwd.Warnings
        };
    }

    private static object BuildFwdCapabilities()
    {
        return new
        {
            schema = "FwdInspection.Capabilities",
            schemaVersion = "2.0.0",
            serviceMode = "local-read-only",
            domainModel = new[]
            {
                "configuration-identity", "true-hierarchy", "scope-aware-rules", "function-catalog", "field-schema", "typed-search", "diagnostics", "evidence", "normalized-snapshot", "raw-stc-escape-hatch"
            },
            supported = new
            {
                readOnlyInspection = true,
                normalizedSnapshot = true,
                hierarchy = true,
                orderedRuleTree = true,
                disabledInheritance = true,
                relationshipExtraction = true,
                typedSearch = true,
                compare = false,
                nativeRuleExecution = false,
                mutation = false,
                runtimeOperations = false
            },
            caveats = new[]
            {
                "Rule execution simulation is not exposed as native execution.",
                "Raw STC endpoints are evidence/debug surfaces, not the primary domain model."
            }
        };
    }

    private object BuildNormalizedSnapshot(HttpListenerRequest request)
    {
        var fwd = InspectCore(request, includeFields: true);
        var rules = RulesCore(request);
        var tree = TreeCore(request);
        var rels = RelationshipsCore(request, includeRules: false);
        var diag = DiagnosticsCore(request);
        var evidenceSummary = BuildEvidenceSummaryPayload(fwd, rules, tree, rels, diag);
        return new
        {
            schema = "FwdInspectionSnapshot",
            schemaVersion = "2.1.0",
            snapshotId = "fwd-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + "-" + Math.Abs((fwd.Path ?? string.Empty).GetHashCode()),
            generatedAtUtc = DateTime.UtcNow,
            source = new { path = fwd.Path, releaseNumber = fwd.ReleaseNumber, releaseString = fwd.ReleaseString, releaseDateString = fwd.ReleaseDateString, readMode = "read-only" },
            truthModel = BuildTruthModelPayload(),
            hierarchy = BuildHierarchyPayload(fwd),

            // Backward-compatible flat inventory. This is broad searchable evidence, not execution-order proof.
            rules = rules.Rules.Select(NormalizeRule).ToList(),
            ruleScopes = rules.Scopes,

            // Structural-first surfaces. Use these for hierarchy, runtime-like branches, and disabled inheritance.
            structuralRules = tree.Nodes.Where(n => n.IsRuleNode).Select(NormalizeStructuralRule).ToList(),
            structuralEdges = tree.Edges.Select(NormalizeStructuralEdge).ToList(),
            ruleInventory = BuildRuleInventoryPayload(rules, tree),

            fields = fwd.Fields,
            resources = fwd.Resources,
            diagnostics = new { fwdWarnings = fwd.Warnings, acDiagnostics = diag, treeDiagnostics = tree.Diagnostics, relationshipWarnings = rels.Warnings },
            evidenceSummary,
            evidence = BuildEvidencePayload(fwd, tree, rels, diag)
        };
    }

    private object BuildRawSnapshot(HttpListenerRequest request)
    {
        return new
        {
            schema = "FwdInspection.RawSnapshot",
            schemaVersion = "1.0.0",
            inspect = InspectCore(request, includeFields: true),
            rules = RulesCore(request),
            tree = TreeCore(request),
            relationships = RelationshipsCore(request, includeRules: false),
            diagnostics = DiagnosticsCore(request)
        };
    }

    private object BuildHierarchy(HttpListenerRequest request)
    {
        return new { schema = "FwdInspection.Hierarchy", schemaVersion = "2.0.0", hierarchy = BuildHierarchyPayload(InspectCore(request, includeFields: true)) };
    }

    private object BuildBatches(HttpListenerRequest request)
    {
        var fwd = InspectCore(request, includeFields: false);
        return new { schema = "FwdInspection.BatchList", items = fwd.Batches.Select(b => new { id = b, label = b, kind = "batchType", links = new { self = "/api/fwd/batches/" + UrlEncode(b), documents = "/api/fwd/batches/" + UrlEncode(b) + "/documents" } }).ToList() };
    }

    private object BuildBatchRoute(string[] parts, HttpListenerRequest request)
    {
        string id = parts.Length > 3 ? UrlDecode(parts[3]) : string.Empty;
        var fwd = InspectCore(request, includeFields: false);
        var docs = GetDocumentsForBatch(fwd, id);
        if (parts.Length > 4 && parts[4].Equals("documents", StringComparison.OrdinalIgnoreCase)) return new { batchId = id, documents = docs };
        return new { id, kind = "batchType", exists = fwd.Batches.Any(x => Eq(x, id)), documents = docs, evidence = "Document membership uses wrapper-backed inspection when available; otherwise see warnings." };
    }

    private object BuildDocuments(HttpListenerRequest request)
    {
        var fwd = InspectCore(request, includeFields: false);
        return new { schema = "FwdInspection.DocumentList", items = fwd.Documents.Select(d => new { id = d, label = d, kind = "documentType", links = new { self = "/api/fwd/documents/" + UrlEncode(d), pages = "/api/fwd/documents/" + UrlEncode(d) + "/pages" } }).ToList() };
    }

    private object BuildDocumentRoute(string[] parts, HttpListenerRequest request)
    {
        string id = parts.Length > 3 ? UrlDecode(parts[3]) : string.Empty;
        var fwd = InspectCore(request, includeFields: false);
        var pages = GetPagesForDocument(fwd, id);
        if (parts.Length > 4 && parts[4].Equals("pages", StringComparison.OrdinalIgnoreCase)) return new { documentId = id, pages };
        return new { id, kind = "documentType", exists = fwd.Documents.Any(x => Eq(x, id)), pages, evidence = "Page membership uses wrapper-backed inspection when available; otherwise see warnings." };
    }

    private object BuildPages(HttpListenerRequest request)
    {
        var fwd = InspectCore(request, includeFields: true);
        return new { schema = "FwdInspection.PageList", items = fwd.Pages.Select(p => new { id = p, label = p, kind = "pageType", variants = fwd.PageVariants.FirstOrDefault(v => Eq(v.Page, p))?.Variants ?? new List<string>(), fieldCount = fwd.Fields.FirstOrDefault(b => Eq(b.ScopeName, p))?.Fields.Count ?? 0, links = new { self = "/api/fwd/pages/" + UrlEncode(p), variants = "/api/fwd/pages/" + UrlEncode(p) + "/variants", fields = "/api/fwd/pages/" + UrlEncode(p) + "/fields" } }).ToList() };
    }

    private object BuildPageRoute(string[] parts, HttpListenerRequest request)
    {
        string id = parts.Length > 3 ? UrlDecode(parts[3]) : string.Empty;
        var fwd = InspectCore(request, includeFields: true);
        var variants = fwd.PageVariants.FirstOrDefault(v => Eq(v.Page, id))?.Variants ?? new List<string>();
        var fields = fwd.Fields.FirstOrDefault(b => Eq(b.ScopeName, id))?.Fields ?? new List<FieldSummary>();
        if (parts.Length > 4 && parts[4].Equals("variants", StringComparison.OrdinalIgnoreCase)) return new { pageId = id, variants };
        if (parts.Length > 4 && parts[4].Equals("fields", StringComparison.OrdinalIgnoreCase))
        {
            if (parts.Length > 5)
            {
                string fieldName = UrlDecode(parts[5]);
                var field = fields.FirstOrDefault(f => Eq(f.Name, fieldName));
                return new { pageId = id, fieldName, field, usage = RelationshipsCore(request, includeRules: false).Relationships.Where(r => r.TargetType == "Field" && r.Target.IndexOf(fieldName, StringComparison.OrdinalIgnoreCase) >= 0).ToList() };
            }
            return new { pageId = id, fields };
        }
        return new { id, kind = "pageType", exists = fwd.Pages.Any(x => Eq(x, id)), variants, fields, links = new { rules = "/api/fwd/rules/by-scope/page/" + UrlEncode(id) } };
    }

    private object BuildProcesses(HttpListenerRequest request)
    {
        var fwd = InspectCore(request, includeFields: false);
        return new { schema = "FwdInspection.ProcessList", items = fwd.Processes.Select(p => new { id = p, label = p, kind = "process", links = new { self = "/api/fwd/processes/" + UrlEncode(p) } }).ToList() };
    }

    private object BuildProcessRoute(string[] parts, HttpListenerRequest request)
    {
        string process = parts.Length > 3 ? UrlDecode(parts[3]) : "AC";
        return _client.InspectProcessTree(new StcTraversalOptions { Path = GetFwdPath(request), ProcessName = process, MaxDepth = GetInt(request, "maxDepth", 5), MaxNodes = GetInt(request, "maxNodes", 1500), MaxPreviewBytes = GetInt(request, "maxPreviewBytes", 256), IncludeDataPreview = !GetBool(request, "noDataPreview", false), IncludeDotNodes = GetBool(request, "includeDotNodes", false), RequireNativeOk = GetBool(request, "requireNativeOk", false) });
    }

    private object BuildRulesRoute(string[] parts, HttpListenerRequest request)
    {
        var rules = RulesCore(request);
        if (parts.Length == 4 && parts[3].Equals("scopes", StringComparison.OrdinalIgnoreCase)) return new { schema = "FwdInspection.RuleScopes", process = rules.ProcessName, scopes = rules.Scopes };
        if (parts.Length >= 5 && parts[3].Equals("by-scope", StringComparison.OrdinalIgnoreCase))
        {
            string scopeKind = UrlDecode(parts[4]);
            string scopeId = parts.Length > 5 ? UrlDecode(parts[5]) : string.Empty;
            return new { schema = "FwdInspection.RulesByScope", scopeKind, scopeId, rules = rules.Rules.Where(r => Eq(r.ScopeType, scopeKind) && Eq(r.ScopeName, scopeId)).Select(NormalizeRule).ToList() };
        }
        if (parts.Length > 3)
        {
            string ruleId = UrlDecode(parts[3]);
            var rule = FindRule(rules.Rules, ruleId);
            if (rule == null) return new { found = false, ruleId, rules = rules.Rules.Where(r => RuleMatches(r, ruleId)).Take(25).Select(NormalizeRule).ToList() };
            if (parts.Length > 4 && parts[4].Equals("references", StringComparison.OrdinalIgnoreCase)) return BuildRuleReferences(rule, request);
            if (parts.Length > 4 && parts[4].Equals("actions", StringComparison.OrdinalIgnoreCase)) return new { rule = NormalizeRule(rule), actions = rule.ActionNames.Select((a, i) => new { actionIndex = i, name = a }).ToList() };
            if (parts.Length > 4 && parts[4].Equals("tree", StringComparison.OrdinalIgnoreCase)) return BuildRuleTree(rule, request);
            return new { schema = "FwdInspection.Rule", rule = NormalizeRule(rule), references = BuildRuleReferencesPayload(rule, request) };
        }
        return new { schema = "FwdInspection.RuleList", process = rules.ProcessName, count = rules.RuleCount, scopes = rules.Scopes, rules = rules.Rules.Select(NormalizeRule).ToList(), counts = new { byScopeType = rules.RulesByScopeType, byFunction = rules.RulesByFunction, byDisabledState = rules.RulesByDisabledState } };
    }

    private object BuildFunctionsRoute(string[] parts, HttpListenerRequest request)
    {
        var rules = RulesCore(request);
        var grouped = rules.Rules.GroupBy(r => string.IsNullOrWhiteSpace(r.FunctionName) ? "(missing)" : r.FunctionName!).OrderByDescending(g => g.Count()).ThenBy(g => g.Key).ToList();
        if (parts.Length > 3)
        {
            string name = UrlDecode(parts[3]);
            var used = rules.Rules.Where(r => Eq(r.FunctionName ?? string.Empty, name)).ToList();
            if (parts.Length > 4 && parts[4].Equals("usage", StringComparison.OrdinalIgnoreCase)) return new { functionName = name, usageCount = used.Count, rules = used.Select(NormalizeRule).ToList() };
            return new { functionName = name, usageCount = used.Count, status = used.Count == 0 ? "not-found-or-unused" : "used", usage = used.Select(NormalizeRule).ToList(), evidence = "Function metadata is currently inferred from rule usage unless native metadata is available in resources." };
        }
        return new { schema = "FwdInspection.FunctionCatalog", functions = grouped.Select(g => new { name = g.Key, usageCount = g.Count(), scopeCount = g.Select(r => r.ScopePath).Distinct(StringComparer.OrdinalIgnoreCase).Count(), links = new { self = "/api/fwd/functions/" + UrlEncode(g.Key), usage = "/api/fwd/functions/" + UrlEncode(g.Key) + "/usage" } }).ToList() };
    }

    private object BuildResourcesRoute(string[] parts, HttpListenerRequest request)
    {
        var fwd = InspectCore(request, includeFields: false);
        var rels = RelationshipsCore(request, includeRules: false);
        if (parts.Length > 3)
        {
            string type = UrlDecode(parts[3]);
            var bucket = fwd.Resources.FirstOrDefault(r => Eq(r.Type, type));
            if (parts.Length > 4)
            {
                string id = UrlDecode(parts[4]);
                var usage = rels.Relationships.Where(r => Eq(r.TargetType, type) || r.Target.IndexOf(id, StringComparison.OrdinalIgnoreCase) >= 0).ToList();
                if (parts.Length > 5 && parts[5].Equals("usage", StringComparison.OrdinalIgnoreCase)) return new { resourceType = type, resourceId = id, usageCount = usage.Count, usage };
                return new { resourceType = type, resourceId = id, exists = bucket?.Names.Any(n => Eq(n, id)) ?? false, usageCount = usage.Count, usage };
            }
            return new { resourceType = type, names = bucket?.Names ?? new List<string>(), usage = rels.Relationships.Where(r => Eq(r.TargetType, type)).Take(500).ToList() };
        }
        return new { schema = "FwdInspection.ResourceInventory", resources = fwd.Resources.Select(r => new { type = r.Type, count = r.Names.Count, names = r.Names, links = new { self = "/api/fwd/resources/" + UrlEncode(r.Type) } }).ToList() };
    }

    private object BuildSearch(HttpListenerRequest request, string? kind)
    {
        string q = Get(request, "q") ?? Get(request, "term") ?? string.Empty;
        var fwd = InspectCore(request, includeFields: true);
        var rules = RulesCore(request);
        var rels = RelationshipsCore(request, includeRules: false);
        var results = new List<object>();
        if (string.IsNullOrWhiteSpace(q)) return new { schema = "FwdInspection.Search", q, results, warning = "Pass ?q=..." };
        bool includeRules = string.IsNullOrEmpty(kind) || kind == "rules" || kind == "rule";
        bool includeFields = string.IsNullOrEmpty(kind) || kind == "fields" || kind == "field";
        bool includeResources = string.IsNullOrEmpty(kind) || kind == "resources" || kind == "resource";
        if (includeRules) results.AddRange(rules.Rules.Where(r => Contains(r.RuleName, q) || Contains(r.FunctionName, q) || Contains(r.ScopeName, q) || Contains(r.RuleGuid, q)).Take(250).Select(r => new { resultType = "rule", id = RuleStableId(r), label = r.RuleName ?? r.FunctionName ?? RuleStableId(r), scope = new { kind = r.ScopeType, id = r.ScopeName }, isDependency = false, matches = MatchList(r, q) }));
        if (includeFields) results.AddRange(fwd.Fields.SelectMany(b => b.Fields.Select(f => new { bucket = b, field = f })).Where(x => Contains(x.field.Name, q)).Take(250).Select(x => new { resultType = "field", id = "field:" + x.bucket.ScopeName + ":" + x.field.Name, label = x.field.Name, scope = new { kind = x.bucket.ScopeType, id = x.bucket.ScopeName }, isDependency = false, matches = new[] { new { property = "field.name", text = x.field.Name, matchKind = "text" } } }));
        if (includeResources) results.AddRange(fwd.Resources.SelectMany(b => b.Names.Select(n => new { type = b.Type, name = n })).Where(x => Contains(x.name, q) || Contains(x.type, q)).Take(250).Select(x => new { resultType = "resource", id = "resource:" + x.type + ":" + x.name, label = x.name, resourceType = x.type, isDependency = false, matches = new[] { new { property = "resource.name", text = x.name, matchKind = "text" } } }));
        results.AddRange(rels.Relationships.Where(r => Contains(r.Target, q) || Contains(r.Kind, q) || Contains(r.TargetType, q)).Take(250).Select(r => new { resultType = "relationship", id = "relationship:" + r.ScopeName + ":" + r.RuleIndex + ":" + r.Kind + ":" + r.Target, label = r.Kind + " " + r.Target, scope = new { kind = r.ScopeType, id = r.ScopeName }, isDependency = true, matches = new[] { new { property = "relationship.target", text = r.Target, matchKind = "text" } } }));
        return new { schema = "FwdInspection.Search", q, kind, count = results.Count, results };
    }

    private object BuildSemanticDiagnostics(HttpListenerRequest request, string tail)
    {
        return new { schema = "FwdInspection.Diagnostics", schemaVersion = "2.0.0", fwd = InspectCore(request, includeFields: false).Warnings, ac = DiagnosticsCore(request), tree = TreeCore(request).Diagnostics, relationships = RelationshipsCore(request, includeRules: false).Warnings, category = tail };
    }

    private object BuildEvidenceSummary(HttpListenerRequest request)
    {
        var fwd = InspectCore(request, includeFields: false);
        var rules = RulesCore(request);
        var tree = TreeCore(request);
        var rels = RelationshipsCore(request, includeRules: false);
        var diag = DiagnosticsCore(request);
        return new
        {
            schema = "FwdInspection.EvidenceSummary",
            schemaVersion = "2.1.0",
            summary = BuildEvidenceSummaryPayload(fwd, rules, tree, rels, diag),
            truthModel = BuildTruthModelPayload()
        };
    }

    private object BuildEvidence(HttpListenerRequest request, string? evidenceId)
    {
        var fwd = InspectCore(request, includeFields: false);
        var tree = TreeCore(request);
        var rels = RelationshipsCore(request, includeRules: false);
        var diag = DiagnosticsCore(request);
        var payload = BuildEvidencePayload(fwd, tree, rels, diag);
        if (string.IsNullOrWhiteSpace(evidenceId)) return new { schema = "FwdInspection.Evidence", evidence = payload };
        return new { schema = "FwdInspection.EvidenceItem", evidenceId, matches = payload.Where(e => Contains(JsonConvert.SerializeObject(e), evidenceId!)).ToList() };
    }

    private object BuildRawStc(HttpListenerRequest request, string? nodeId)
    {
        return new
        {
            schema = "FwdInspection.RawStcEvidence",
            nodeId,
            warning = "Raw STC endpoints are a debug escape hatch. Use semantic hierarchy/rule/resource endpoints as primary truth.",
            processTree = _client.InspectProcessTree(new StcTraversalOptions { Path = GetFwdPath(request), ProcessName = Get(request, "process") ?? "AC", MaxDepth = GetInt(request, "maxDepth", 6), MaxNodes = GetInt(request, "maxNodes", 2500), MaxPreviewBytes = GetInt(request, "maxPreviewBytes", 256), IncludeDataPreview = !GetBool(request, "noDataPreview", false), IncludeDotNodes = GetBool(request, "includeDotNodes", false), RequireNativeOk = GetBool(request, "requireNativeOk", false) })
        };
    }

    private FwdInspectionReport InspectCore(HttpListenerRequest request, bool includeFields)
    {
        if (includeFields && CanUseCachedLegacySnapshotForInspect(request))
            return GetLegacySnapshot(request).Fwd;

        return _client.Inspect(new FwdInspectionOptions { Path = GetFwdPath(request), IncludeFields = includeFields, RequireNativeOk = GetBool(request, "requireNativeOk", false) });
    }

    private AcRuleReport RulesCore(HttpListenerRequest request)
    {
        if (CanUseCachedLegacySnapshotForRules(request))
            return GetLegacySnapshot(request).Rules;

        return _client.InspectAcRules(new AcRuleOptions { Path = GetFwdPath(request), ProcessName = Get(request, "process") ?? "AC", Term = Get(request, "term"), Scope = Get(request, "scope"), Function = Get(request, "function"), IncludeRawTokens = GetBool(request, "includeRawTokens", false), MaxRawTokensPerScope = GetInt(request, "maxRawTokens", 250), RequireNativeOk = GetBool(request, "requireNativeOk", false) });
    }

    private AcTreeReport TreeCore(HttpListenerRequest request)
    {
        if (CanUseCachedLegacySnapshotForTree(request))
            return GetLegacySnapshot(request).Tree;

        return _client.BuildAcTree(new AcTreeOptions { Path = GetFwdPath(request), ProcessName = Get(request, "process") ?? "AC", Term = Get(request, "term"), Scope = Get(request, "scope"), IncludeAttributes = GetBool(request, "includeAttributes", true), MaxAttributeValueLength = GetInt(request, "maxAttributeValueLength", 500), MaxHierarchyDepth = GetInt(request, "maxHierarchyDepth", 256), MaxNodeEntryCount = (uint)Math.Max(1, GetInt(request, "maxNodeEntryCount", 100000)), MaskSensitiveValues = !GetBool(request, "noMaskSensitive", false), RequireNativeOk = GetBool(request, "requireNativeOk", false) });
    }

    private AcRelationshipReport RelationshipsCore(HttpListenerRequest request, bool includeRules)
    {
        if (!includeRules && CanUseCachedLegacySnapshotForRelationships(request))
            return GetLegacySnapshot(request).Relationships;

        return _client.TraceAcRelationships(new AcTraceOptions { Path = GetFwdPath(request), ProcessName = Get(request, "process") ?? "AC", Term = Get(request, "term"), Scope = Get(request, "scope"), Function = Get(request, "function"), Field = Get(request, "field"), Attr = Get(request, "attr"), RelationshipKind = Get(request, "kind"), IncludeRules = includeRules, MaxRelationships = GetInt(request, "maxRelationships", 0), RequireNativeOk = GetBool(request, "requireNativeOk", false) });
    }

    private AcDiagnosticsReport DiagnosticsCore(HttpListenerRequest request)
    {
        if (CanUseCachedLegacySnapshotForDiagnostics(request))
            return GetLegacySnapshot(request).Diagnostics;

        return _client.BuildAcDiagnostics(new AcRuleOptions { Path = GetFwdPath(request), ProcessName = Get(request, "process") ?? "AC", Term = Get(request, "term"), Scope = Get(request, "scope"), Function = Get(request, "function"), RequireNativeOk = GetBool(request, "requireNativeOk", false) });
    }

    // Cache-only fast path for legacy semantic routes when query flags match snapshot defaults.
    private WorkbenchSnapshot GetLegacySnapshot(HttpListenerRequest request)
    {
        return _snapshotCache.GetOrBuild(
            GetFwdPath(request),
            Get(request, "process") ?? "AC",
            GetBool(request, "requireNativeOk", false));
    }

    private static bool HasValue(HttpListenerRequest request, string name)
    {
        string? value = request.QueryString[name];
        return !string.IsNullOrWhiteSpace(value);
    }

    private bool CanUseCachedLegacySnapshotForInspect(HttpListenerRequest request)
    {
        return !HasValue(request, "term")
            && !HasValue(request, "scope")
            && !HasValue(request, "function")
            && !HasValue(request, "field")
            && !HasValue(request, "attr")
            && !HasValue(request, "kind");
    }

    private bool CanUseCachedLegacySnapshotForRules(HttpListenerRequest request)
    {
        return !HasValue(request, "term")
            && !HasValue(request, "scope")
            && !HasValue(request, "function")
            && !GetBool(request, "includeRawTokens", false)
            && !HasValue(request, "maxRawTokens");
    }

    private bool CanUseCachedLegacySnapshotForTree(HttpListenerRequest request)
    {
        return !HasValue(request, "term")
            && !HasValue(request, "scope")
            && GetBool(request, "includeAttributes", true)
            && GetInt(request, "maxAttributeValueLength", 500) == 500
            && GetInt(request, "maxHierarchyDepth", 256) == 256
            && Math.Max(1, GetInt(request, "maxNodeEntryCount", 100000)) == 100000
            && !GetBool(request, "noMaskSensitive", false);
    }

    private bool CanUseCachedLegacySnapshotForRelationships(HttpListenerRequest request)
    {
        return !HasValue(request, "term")
            && !HasValue(request, "scope")
            && !HasValue(request, "function")
            && !HasValue(request, "field")
            && !HasValue(request, "attr")
            && !HasValue(request, "kind")
            && GetInt(request, "maxRelationships", 0) == 0;
    }

    private bool CanUseCachedLegacySnapshotForDiagnostics(HttpListenerRequest request)
    {
        return !HasValue(request, "term")
            && !HasValue(request, "scope")
            && !HasValue(request, "function");
    }

    private static object BuildHierarchyPayload(FwdInspectionReport fwd)
    {
        return new
        {
            root = new { id = "fwd", kind = "fwd", path = fwd.Path },
            batches = fwd.Batches.Select(b => new { id = b, kind = "batchType" }).ToList(),
            documents = fwd.Documents.Select(d => new { id = d, kind = "documentType" }).ToList(),
            pages = fwd.Pages.Select(p => new { id = p, kind = "pageType", variants = fwd.PageVariants.FirstOrDefault(v => Eq(v.Page, p))?.Variants ?? new List<string>(), fieldCount = fwd.Fields.FirstOrDefault(f => Eq(f.ScopeName, p))?.Fields.Count ?? 0 }).ToList(),
            variants = fwd.PageVariants,
            fields = fwd.Fields,
            processes = fwd.Processes,
            resources = fwd.Resources,
            evidence = new[] { "DocumentNames", "PageNames", "BatchNames", "ProcessNames", "VariantNames", "Fields when IncludeFields=true" },
            warnings = fwd.Warnings
        };
    }

    private static object BuildTruthModelPayload()
    {
        return new
        {
            canonicalHierarchy = "ac-tree structural nodes/edges",
            flatInventoryUse = "search/filter/broad token inventory only",
            relationshipUse = "projection from parsed and heuristic evidence; confidence must be shown",
            precedence = new[]
            {
                "Structural rule tree from packed rule-list payloads",
                "Flat AC rule inventory from parsed/token payloads",
                "Relationship projections and heuristic references",
                "Raw STC/debug payloads"
            },
            warnings = new[]
            {
                "Do not use flat rule order as proof of runtime branch structure.",
                "Treat PossiblyDisabledInherited from flat inventory as heuristic-only unless confirmed by structural tree state.",
                "Use NodeId plus ParentNodeId/ActionListIndex for ordered hierarchy. RuleGuid is an identity/correlation key, not a unique tree node id."
            }
        };
    }

    private static object BuildEvidenceSummaryPayload(FwdInspectionReport fwd, AcRuleReport rules, AcTreeReport tree, AcRelationshipReport rels, AcDiagnosticsReport diag)
    {
        var flatKeys = rules.Rules.Select(FlatRuleCorrelationKey).ToList();
        var uniqueFlatKeys = new HashSet<string>(flatKeys, StringComparer.OrdinalIgnoreCase);
        var structuralKeys = new HashSet<string>(tree.Nodes.Where(n => n.IsRuleNode).Select(StructuralRuleCorrelationKey), StringComparer.OrdinalIgnoreCase);
        int structuralHeuristicEdgeCount = tree.Edges.Count(e => !string.Equals(e.Confidence, "Proven", StringComparison.OrdinalIgnoreCase));
        int flatPossiblyInheritedCount = rules.Rules.Count(r => string.Equals(r.DisabledState, AcDisabledStates.PossiblyDisabledInherited, StringComparison.OrdinalIgnoreCase));

        return new
        {
            source = new { path = fwd.Path, releaseNumber = fwd.ReleaseNumber, releaseString = fwd.ReleaseString, releaseDateString = fwd.ReleaseDateString },
            flatRuleCount = rules.RuleCount,
            flatScopeCount = rules.ScopeCount,
            flatUniqueRuleCount = uniqueFlatKeys.Count,
            flatDuplicateExcess = Math.Max(0, flatKeys.Count - uniqueFlatKeys.Count),
            flatOnlyUniqueRuleCount = uniqueFlatKeys.Count(k => !structuralKeys.Contains(k)),
            structuralRuleNodeCount = tree.RuleNodeCount,
            structuralNodeCount = tree.NodeCount,
            structuralEdgeCount = tree.EdgeCount,
            structuralHeuristicEdgeCount,
            structuralMaxHierarchyLevel = tree.MaxHierarchyLevel,
            structuralDiagnosticCount = tree.DiagnosticCount,
            nonRuleTreeScopeCount = tree.NonRuleTreeScopeCount,
            relationshipCount = rels.RelationshipCount,
            relationshipWarningCount = rels.Warnings.Count,
            acDiagnosticCount = diag.Diagnostics.Count,
            fwdWarningCount = fwd.Warnings.Count,
            disabled = new
            {
                structuralEnabled = tree.Nodes.Count(n => n.IsRuleNode && n.DisabledState == AcDisabledStates.Enabled),
                structuralDirect = tree.DirectDisabledCount,
                structuralInherited = tree.InheritedDisabledCount,
                flatEnabled = rules.Rules.Count(r => string.IsNullOrWhiteSpace(r.DisabledState) || r.DisabledState == AcDisabledStates.Enabled),
                flatDirect = rules.Rules.Count(r => r.DisabledState == AcDisabledStates.DisabledDirect),
                flatInherited = rules.Rules.Count(r => r.DisabledState == AcDisabledStates.DisabledInherited),
                flatPossiblyInheritedHeuristicOnly = flatPossiblyInheritedCount
            },
            trust = new
            {
                structuralTree = tree.EdgeCount > 0 ? "High" : "Unavailable",
                flatInventory = "Medium/SearchInventory",
                flatDisabledInheritance = flatPossiblyInheritedCount > 0 ? "Low/HeuristicOnly" : "NotUsed",
                relationships = rels.RelationshipCount > 0 ? "Mixed; inspect Confidence per relationship" : "Unavailable"
            }
        };
    }

    private static object BuildRuleInventoryPayload(AcRuleReport rules, AcTreeReport tree)
    {
        var structuralKeys = new HashSet<string>(tree.Nodes.Where(n => n.IsRuleNode).Select(StructuralRuleCorrelationKey), StringComparer.OrdinalIgnoreCase);
        var flatRows = rules.Rules.Select(r => new { Key = FlatRuleCorrelationKey(r), Rule = r }).ToList();
        var flatDuplicateKeys = new HashSet<string>(flatRows.GroupBy(x => x.Key, StringComparer.OrdinalIgnoreCase).Where(g => g.Count() > 1).Select(g => g.Key), StringComparer.OrdinalIgnoreCase);

        return new
        {
            structural = tree.Nodes.Where(n => n.IsRuleNode).Select(NormalizeStructuralRule).ToList(),
            flatInventory = rules.Rules.Select(r => NormalizeInventoryRule(r, structuralKeys.Contains(FlatRuleCorrelationKey(r)), flatDuplicateKeys.Contains(FlatRuleCorrelationKey(r)))).ToList(),
            unmatchedFlat = rules.Rules.Where(r => !structuralKeys.Contains(FlatRuleCorrelationKey(r))).Select(r => NormalizeInventoryRule(r, false, flatDuplicateKeys.Contains(FlatRuleCorrelationKey(r)))).ToList(),
            counts = new
            {
                structuralRuleNodes = tree.RuleNodeCount,
                flatRows = rules.RuleCount,
                flatUniqueRows = flatRows.Select(x => x.Key).Distinct(StringComparer.OrdinalIgnoreCase).Count(),
                duplicateFlatKeys = flatDuplicateKeys.Count,
                unmatchedFlatRows = flatRows.Count(x => !structuralKeys.Contains(x.Key))
            },
            caveat = "Structural nodes are canonical for hierarchy. Flat rows remain useful for search and diagnostics, but may duplicate or include inventory-only rules."
        };
    }

    private static object NormalizeStructuralRule(AcTreeNode n)
    {
        return new
        {
            id = "ruleNode:" + n.NodeId,
            nodeId = n.NodeId,
            parentNodeId = n.ParentNodeId,
            actionListIndex = n.ActionListIndex,
            hierarchyLevel = n.HierarchyLevel,
            scopePath = n.ScopePath,
            scopeKind = n.ScopeType,
            scopeId = n.ScopeName,
            guid = n.RuleGuid,
            rawRuleId = n.RuleId,
            name = n.RuleName,
            functionName = n.FunctionName,
            functionVersion = n.FunctionVersion,
            ordinalWithinScope = n.RuleIndexWithinScope,
            ruleListPath = n.RuleListPath,
            parameters = n.Parameters,
            sources = n.Sources,
            actionNames = n.ActionNames,
            attributes = n.Attributes,
            enabled = n.DisabledState == AcDisabledStates.Enabled,
            disabledState = n.DisabledState,
            disabledInherited = n.DisabledState == AcDisabledStates.DisabledInherited,
            disabledConfidence = n.DisabledConfidence,
            disabledReason = n.DisabledReason,
            disabledAncestorNodeId = n.DisabledAncestorNodeId,
            disabledAncestorRuleGuid = n.DisabledAncestorRuleGuid,
            disabledAncestorRuleName = n.DisabledAncestorRuleName,
            evidenceClass = "StructuralProven",
            sourceKind = "StructuralRuleTree",
            evidence = n.DisabledEvidence
        };
    }

    private static object NormalizeStructuralEdge(AcTreeEdge e)
    {
        return new
        {
            from = "ruleNode:" + e.FromNodeId,
            to = "ruleNode:" + e.ToNodeId,
            scopePath = e.ScopePath,
            edgeKind = e.EdgeKind,
            actionListIndex = e.ActionListIndex,
            actionName = e.ActionName,
            actionNameResolved = e.ActionNameResolved,
            confidence = e.Confidence,
            sourceKind = string.Equals(e.Confidence, "Proven", StringComparison.OrdinalIgnoreCase) ? "StructuralRuleTree" : "ParsedOrHeuristic",
            isRuntimeBranchEvidence = string.Equals(e.Confidence, "Proven", StringComparison.OrdinalIgnoreCase),
            evidence = e.Evidence
        };
    }

    private static object NormalizeInventoryRule(AcRuleSummary r, bool matchedStructuralNode, bool duplicateFlatKey)
    {
        return new
        {
            rule = NormalizeRule(r),
            evidenceClass = matchedStructuralNode ? "FlatInventoryMatchedStructural" : "FlatInventoryOnly",
            sourceKind = "FlatRuleInventory",
            matchedStructuralNode,
            duplicateFlatKey,
            disabledStateTrust = r.DisabledState == AcDisabledStates.PossiblyDisabledInherited ? "Low/HeuristicOnly" : "DirectFlatEvidence",
            isRuntimeOrderProof = false
        };
    }

    private static string FlatRuleCorrelationKey(AcRuleSummary r)
    {
        string guid = string.IsNullOrWhiteSpace(r.RuleGuid) ? string.Empty : r.RuleGuid!.Trim();
        if (!string.IsNullOrWhiteSpace(guid))
            return (r.ScopePath ?? string.Empty) + "|guid|" + guid;

        return (r.ScopePath ?? string.Empty) + "|idx|" + r.RuleIndex.ToString() + "|" + (r.RuleName ?? string.Empty) + "|" + (r.FunctionName ?? string.Empty);
    }

    private static string StructuralRuleCorrelationKey(AcTreeNode n)
    {
        string guid = string.IsNullOrWhiteSpace(n.RuleGuid) ? string.Empty : n.RuleGuid!.Trim();
        if (!string.IsNullOrWhiteSpace(guid))
            return (n.ScopePath ?? string.Empty) + "|guid|" + guid;

        return (n.ScopePath ?? string.Empty) + "|idx|" + n.RuleIndexWithinScope.ToString() + "|" + (n.RuleName ?? string.Empty) + "|" + (n.FunctionName ?? string.Empty);
    }

    private static List<object> BuildEvidencePayload(FwdInspectionReport fwd, AcTreeReport tree, AcRelationshipReport rels, AcDiagnosticsReport diag)
    {
        var evidence = new List<object>();
        int id = 1;
        foreach (string w in fwd.Warnings) evidence.Add(new { id = "ev:" + id++, type = "warning", source = "fwd.inspect", message = w });
        foreach (var d in tree.Diagnostics) evidence.Add(new { id = "ev:" + id++, type = "tree-diagnostic", severity = d.Severity, category = d.Category, scope = d.ScopePath, nodeId = d.NodeId, message = d.Message });
        foreach (var d in diag.Diagnostics) evidence.Add(new { id = "ev:" + id++, type = "ac-diagnostic", severity = d.Severity, category = d.Category, message = d.Message, count = d.Count, examples = d.Examples });
        foreach (var r in rels.Relationships.Where(r => !string.IsNullOrWhiteSpace(r.Evidence)).Take(1000)) evidence.Add(new { id = "ev:" + id++, type = "relationship", scope = r.ScopePath, ruleIndex = r.RuleIndex, kind = r.Kind, target = r.Target, confidence = r.Confidence, message = r.Evidence });
        return evidence;
    }

    private static object NormalizeRule(AcRuleSummary r)
    {
        return new
        {
            id = RuleStableId(r),
            rawRuleId = r.RuleId,
            guid = r.RuleGuid,
            name = r.RuleName,
            scopeKind = r.ScopeType,
            scopeId = r.ScopeName,
            scopePath = r.ScopePath,
            process = "AC",
            functionName = r.FunctionName,
            functionVersion = r.FunctionVersion,
            ordinal = r.RuleIndex,
            enabled = r.DisabledState == AcDisabledStates.Enabled,
            disabledState = r.DisabledState,
            disabledInherited = r.DisabledState == AcDisabledStates.DisabledInherited,
            disabledReason = r.DisabledReason,
            disabledAncestorRuleIndex = r.DisabledAncestorRuleIndex,
            disabledAncestorRuleName = r.DisabledAncestorRuleName,
            parameters = r.Parameters,
            sources = r.Sources,
            actionNames = r.ActionNames,
            ruleListPath = r.RuleListPath,
            evidence = r.DisabledEvidence
        };
    }

    private object BuildRuleReferences(AcRuleSummary rule, HttpListenerRequest request)
    {
        return new { rule = NormalizeRule(rule), references = BuildRuleReferencesPayload(rule, request) };
    }

    private object BuildRuleReferencesPayload(AcRuleSummary rule, HttpListenerRequest request)
    {
        var rels = RelationshipsCore(request, includeRules: false).Relationships.Where(r => r.RuleIndex == rule.RuleIndex && Eq(r.ScopePath, rule.ScopePath)).ToList();
        return new { fieldRefs = rels.Where(r => r.TargetType == "Field").ToList(), attributeRefs = rels.Where(r => r.TargetType == "Attribute").ToList(), tableRefs = rels.Where(r => r.TargetType == "Table").ToList(), sourceRefs = rels.Where(r => r.TargetType == "Source").ToList(), all = rels };
    }

    private object BuildRuleTree(AcRuleSummary rule, HttpListenerRequest request)
    {
        var tree = TreeCore(request);
        var nodes = tree.Nodes.Where(n => Eq(n.RuleGuid ?? string.Empty, rule.RuleGuid ?? string.Empty) || (n.RuleIndexWithinScope == rule.RuleIndex && Eq(n.ScopePath, rule.ScopePath))).ToList();
        var nodeIds = new HashSet<int>(nodes.Select(n => n.NodeId));
        foreach (var e in tree.Edges.Where(e => nodeIds.Contains(e.FromNodeId))) nodeIds.Add(e.ToNodeId);
        return new { rootRule = NormalizeRule(rule), nodes = tree.Nodes.Where(n => nodeIds.Contains(n.NodeId)).ToList(), edges = tree.Edges.Where(e => nodeIds.Contains(e.FromNodeId) || nodeIds.Contains(e.ToNodeId)).ToList(), caveat = "This is the extracted structural/action subtree, not native execution." };
    }

    private static AcRuleSummary? FindRule(IEnumerable<AcRuleSummary> rules, string id)
    {
        return rules.FirstOrDefault(r => Eq(RuleStableId(r), id) || Eq(r.RuleGuid ?? string.Empty, id) || Eq(r.RuleId ?? string.Empty, id) || Eq(r.ScopeName + ":" + r.RuleIndex, id));
    }

    private static bool RuleMatches(AcRuleSummary r, string q)
    {
        return Contains(RuleStableId(r), q) || Contains(r.RuleGuid, q) || Contains(r.RuleId, q) || Contains(r.RuleName, q) || Contains(r.FunctionName, q) || Contains(r.ScopeName, q);
    }

    private static string RuleStableId(AcRuleSummary r)
    {
        return "rule:" + CleanId(r.ScopeType) + ":" + CleanId(r.ScopeName) + ":AC:" + r.RuleIndex.ToString("00000");
    }

    private static string CleanId(string? value) => string.IsNullOrWhiteSpace(value) ? "unknown" : value!.Replace(" ", "_").Replace("/", "_").Replace("\\", "_").Replace(":", "_");

    private static string NormalizeEdgeType(AcRuleRelationship r)
    {
        string kind = (r.Kind ?? string.Empty).ToUpperInvariant();
        if (kind.Contains("READ")) return "READS_" + (r.TargetType ?? "TARGET").ToUpperInvariant();
        if (kind.Contains("WRITE") || kind.Contains("SET")) return "WRITES_" + (r.TargetType ?? "TARGET").ToUpperInvariant();
        if (kind.Contains("REJECT")) return "REJECTS_FIELD";
        if (r.TargetType == "Table") return "USES_TABLE";
        if (r.TargetType == "Attribute") return "USES_ATTRIBUTE";
        return string.IsNullOrWhiteSpace(kind) ? "REFERENCES" : kind;
    }

    private static IEnumerable<string> GetDocumentsForBatch(FwdInspectionReport fwd, string batch)
    {
        // Current report DTO does not persist explicit batch membership. Return all documents with an evidence caveat.
        return fwd.Documents;
    }

    private static IEnumerable<string> GetPagesForDocument(FwdInspectionReport fwd, string document)
    {
        // Current report DTO does not persist explicit document-page membership. Return all pages with an evidence caveat.
        return fwd.Pages;
    }

    private static bool Eq(string? left, string? right) => string.Equals(left ?? string.Empty, right ?? string.Empty, StringComparison.OrdinalIgnoreCase);
    private static bool Contains(string? text, string q) => !string.IsNullOrEmpty(text) && !string.IsNullOrEmpty(q) && text!.IndexOf(q, StringComparison.OrdinalIgnoreCase) >= 0;
    private static string UrlDecode(string value) => WebUtility.UrlDecode(value ?? string.Empty) ?? string.Empty;
    private static string UrlEncode(string value) => WebUtility.UrlEncode(value ?? string.Empty) ?? string.Empty;

    private static object[] MatchList(AcRuleSummary r, string q)
    {
        var matches = new List<object>();
        if (Contains(r.RuleName, q)) matches.Add(new { property = "rule.name", text = r.RuleName, matchKind = "text" });
        if (Contains(r.FunctionName, q)) matches.Add(new { property = "rule.functionName", text = r.FunctionName, matchKind = "text" });
        if (Contains(r.ScopeName, q)) matches.Add(new { property = "rule.scopeName", text = r.ScopeName, matchKind = "text" });
        if (Contains(r.RuleGuid, q)) matches.Add(new { property = "rule.guid", text = r.RuleGuid, matchKind = "text" });
        return matches.ToArray();
       }

    private string GetFwdPath(HttpListenerRequest request)
    {
        string? queryPath = Get(request, "path");
        if (!string.IsNullOrWhiteSpace(queryPath) && !_options.AllowPathQuery && !string.IsNullOrWhiteSpace(_options.DefaultFwdPath))
        {
            throw new FormWorksInteropException("Request-level ?path= overrides are disabled for this server process. Restart with --allow-path-query for diagnostic use, or configure the source with --path at startup.");
        }

        string? path = queryPath ?? _options.DefaultFwdPath;
        if (string.IsNullOrWhiteSpace(path))
            throw new FormWorksInteropException("A FWD/CFD path is required. Pass --path when starting the API. Diagnostic path overrides require --allow-path-query.");
        return path!;
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

    private static int? GetNullableInt(HttpListenerRequest request, string name)
    {
        string? value = Get(request, name);
        return int.TryParse(value, out int parsed) ? parsed : null;
    }

    private static bool GetBool(HttpListenerRequest request, string name, bool defaultValue)
    {
        string? value = Get(request, name);
        if (string.IsNullOrWhiteSpace(value))
            return defaultValue;

        if (bool.TryParse(value, out bool parsed))
            return parsed;

        return value == "1" || value.Equals("yes", StringComparison.OrdinalIgnoreCase) || value.Equals("on", StringComparison.OrdinalIgnoreCase);
    }

    private object BuildWorkbenchStatus(HttpListenerRequest request)
    {
        string? viewerPath = ResolveStaticViewerPath();
        string configuredViewerPath = ResolveConfiguredViewerOutputPath();
        string fwdPath = GetFwdPath(request);
        FileInfo? viewer = !string.IsNullOrWhiteSpace(viewerPath) && File.Exists(viewerPath) ? new FileInfo(viewerPath) : null;
        FileInfo? configuredViewer = File.Exists(configuredViewerPath) ? new FileInfo(configuredViewerPath) : null;
        FileInfo? fwd = File.Exists(fwdPath) ? new FileInfo(fwdPath) : null;

        return new
        {
            schema = "AcRuleWorkbench.WorkbenchStatus",
            schemaVersion = "1.0.0",
            service = "AC Rule Workbench",
            utc = DateTime.UtcNow,
            refreshEnabled = _options.AllowMutatingCommands,
            refreshMethod = "POST /api/v1/snapshot/refresh",
            fwd = new
            {
                path = fwdPath,
                exists = fwd != null,
                length = fwd?.Length,
                lastWriteUtc = fwd?.LastWriteTimeUtc
            },
            viewer = new
            {
                configuredPath = configuredViewerPath,
                resolvedPath = viewerPath,
                exists = viewer != null || configuredViewer != null,
                length = (viewer ?? configuredViewer)?.Length,
                lastWriteUtc = (viewer ?? configuredViewer)?.LastWriteTimeUtc
            },
            links = new
            {
                viewer = "/viewer",
                harness = "/harness",
                refresh = "/api/v1/snapshot/refresh",
                status = "/api/v1/status",
                snapshot = "/api/v1/snapshot"
            },
            lastRefresh = _lastRefresh
        };
    }

    private object RefreshWorkbench(HttpListenerRequest request)
    {
        if (!_options.AllowMutatingCommands)
        {
            return new
            {
                ok = false,
                refreshEnabled = false,
                error = "Workbench refresh is disabled for this server process.",
                fix = "Use .\\scripts\\start-workbench.ps1 to generate the live viewer and start the API with refresh support, or restart this process with --allow-refresh and --viewer .\\ac-rule-viewer-live.html.",
                links = new { status = "/api/v1/status" }
            };
        }

        bool isPost = string.Equals(request.HttpMethod, "POST", StringComparison.OrdinalIgnoreCase);
        bool confirmGet = GetBool(request, "confirm", false);
        if (!isPost && !confirmGet)
        {
            return new
            {
                ok = false,
                error = "Refresh requires POST. Use POST /api/v1/snapshot/refresh.",
                method = "POST",
                links = new { status = "/api/v1/status" }
            };
        }

        lock (_refreshGate)
        {
            DateTime started = DateTime.UtcNow;
            string fwdPath = GetFwdPath(request);
            string viewerPath = ResolveConfiguredViewerOutputPath();

            try
            {
                string? outputDir = Path.GetDirectoryName(viewerPath);
                if (!string.IsNullOrWhiteSpace(outputDir))
                    Directory.CreateDirectory(outputDir);

                var report = _client.ExportAcViewer(new AcViewerOptions
                {
                    Path = fwdPath,
                    ProcessName = Get(request, "process") ?? "AC",
                    OutputPath = viewerPath,
                    Scope = Get(request, "scope"),
                    Term = Get(request, "term") ?? Get(request, "q"),
                    Function = Get(request, "function"),
                    OpenBrowser = false,
                    RequireNativeOk = GetBool(request, "requireNativeOk", false)
                });

                FileInfo viewer = new FileInfo(viewerPath);
                FileInfo? fwd = File.Exists(fwdPath) ? new FileInfo(fwdPath) : null;
                _lastRefresh = WorkbenchRefreshState.Success(started, DateTime.UtcNow, fwdPath, viewerPath, report.ScopeCount, report.RuleCount, report.RelationshipCount, viewer.Length, viewer.LastWriteTimeUtc);

                return new
                {
                    ok = true,
                    message = "AC Rule Workbench refreshed from the current FWD/CFD configuration.",
                    startedUtc = started,
                    completedUtc = DateTime.UtcNow,
                    fwd = new { path = fwdPath, exists = fwd != null, lastWriteUtc = fwd?.LastWriteTimeUtc, length = fwd?.Length },
                    viewer = new { path = viewerPath, exists = true, lastWriteUtc = viewer.LastWriteTimeUtc, length = viewer.Length },
                    links = new { viewer = "/viewer", harness = "/harness", status = "/api/v1/status" }
                };
            }
            catch (Exception ex)
            {
                _lastRefresh = WorkbenchRefreshState.Failure(started, DateTime.UtcNow, fwdPath, viewerPath, ex);
                _logger.LogError(ex, "Workbench refresh failed");
                return new
                {
                    ok = false,
                    error = "Workbench refresh failed.",
                    exceptionType = ex.GetType().Name,
                    exceptionMessage = ex.Message,
                    startedUtc = started,
                    completedUtc = DateTime.UtcNow,
                    fwdPath,
                    viewerPath
                };
            }
        }
    }

    private string ResolveConfiguredViewerOutputPath()
    {
        string? configured = _options.ViewerPath?.Trim();
        if (!string.IsNullOrWhiteSpace(configured))
        {
            string configuredPath = configured!;
            return Path.IsPathRooted(configuredPath)
                ? configuredPath
                : Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), configuredPath));
        }

        return Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "ac-rule-viewer-live.html"));
    }

    private void WriteStaticViewer(HttpListenerContext context)
    {
        string? viewerPath = ResolveStaticViewerPath();
        if (string.IsNullOrWhiteSpace(viewerPath) || !File.Exists(viewerPath))
        {
            string html = BuildViewerMissingHtml();
            _responseWriter.WriteHtml(context.Response, html, _options.EnableCors, 404);
            return;
        }

        try
        {
            string html = File.ReadAllText(viewerPath, Encoding.UTF8);
            // Keep the viewer UI lean: do not inject the floating server refresh bridge.
            _responseWriter.WriteHtml(context.Response, html, _options.EnableCors);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unable to serve AC Rule Workbench from {Path}", viewerPath);
            _responseWriter.WriteJson(context.Response, new ApiError
            {
                Error = "Unable to serve AC Rule Workbench.",
                ExceptionType = ex.GetType().Name,
                ExceptionMessage = ex.Message
            }, 500, _options.EnableCors);
        }
    }

    private string? ResolveStaticViewerPath()
    {
        var candidates = new List<string>();

        void AddCandidate(string? candidate)
        {
            if (string.IsNullOrWhiteSpace(candidate))
                return;

            try
            {
                string resolved = Path.IsPathRooted(candidate)
                    ? candidate
                    : Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), candidate));
                candidates.Add(resolved);
            }
            catch
            {
                // Ignore invalid path text from command-line input.
            }
        }

        AddCandidate(_options.ViewerPath);
        AddCandidate("ac-rule-viewer.html");
        AddCandidate(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ac-rule-viewer.html"));

        string current = AppDomain.CurrentDomain.BaseDirectory;
        for (int i = 0; i < 8 && !string.IsNullOrWhiteSpace(current); i++)
        {
            AddCandidate(Path.Combine(current, "ac-rule-viewer.html"));
            DirectoryInfo? parent = Directory.GetParent(current);
            if (parent == null)
                break;
            current = parent.FullName;
        }

        foreach (string candidate in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (File.Exists(candidate))
                return candidate;
        }

        return null;
    }

    private string BuildViewerMissingHtml()
    {
        string path = HtmlEncode(_options.DefaultFwdPath ?? @"C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd");
        string oneCommand = "cd C:\\dev\\AcRuleWorkbench\n.\\scripts\\start-workbench.ps1 -FwdPath \"" + path + "\" -Port 8787 -KillExisting";
        string manualCommand = "cd C:\\dev\\AcRuleWorkbench\n.\\AcRuleWorkbench\\bin\\x86\\Debug\\net48\\AcRuleWorkbench.exe ac-viewer --path \"" + path + "\" --out .\\ac-rule-viewer-live.html\n.\\AcRuleWorkbench\\bin\\x86\\Debug\\net48\\AcRuleWorkbench.exe api --path \"" + path + "\" --port 8787 --viewer .\\ac-rule-viewer-live.html --allow-refresh";
        return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>AC Rule Workbench not generated</title>" +
               "<style>body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#eef3f8;color:#172033}main{max-width:1040px;margin:44px auto;padding:0 22px}.card{background:white;border:1px solid #d7e0eb;border-radius:22px;padding:26px;box-shadow:0 18px 50px rgba(15,23,42,.10)}h1{margin:0 0 10px;font-size:28px}h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#475569;margin:24px 0 8px}p{color:#64748b;line-height:1.55}.facts{display:grid;grid-template-columns:160px 1fr;gap:8px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin:16px 0}.facts b{color:#334155}pre{background:#101827;color:#eaf2ff;border-radius:14px;padding:16px;overflow:auto;white-space:pre-wrap}a{color:#3157d5;font-weight:800}.note{border-left:4px solid #3157d5;background:#eef3ff;padding:12px 14px;border-radius:12px;color:#334155}</style></head>" +
               "<body><main><section class=\"card\"><h1>Workbench file missing</h1><p>The API process is running, but no static <code>ac-rule-viewer.html</code> is attached or discoverable. This is a server setup issue, not an extraction failure.</p>" +
               "<div class=\"facts\"><b>FWD path</b><span><code>" + path + "</code></span><b>Expected viewer</b><span><code>ac-rule-viewer.html</code></span><b>Best fix</b><span>Use the unified start script below. It prepares the viewer and starts the API.</span></div>" +
               "<h2>Recommended command</h2><pre>" + oneCommand + "</pre>" +
               "<h2>Manual command</h2><pre>" + manualCommand + "</pre>" +
               "<p class=\"note\">After running the command, open <a href=\"/viewer\">/viewer</a> or <a href=\"/harness\">/harness</a>.</p></section></main></body></html>";
    }

    private static string InjectApiWorkbenchBridge(string html)
    {
        // Server-side bridge injection was removed to keep /viewer focused on inspection.
        return html;
    }

    private static void AddDeprecationHeaders(HttpListenerResponse response, string replacement)
    {
        if (response == null) return;
        response.Headers["Deprecation"] = "true";
        response.Headers["X-Deprecated-Route"] = "true";
        if (!string.IsNullOrWhiteSpace(replacement))
            response.Headers["X-Replacement-Route"] = replacement;
    }

    private static string NormalizePrefix(string prefix)
    {
        if (string.IsNullOrWhiteSpace(prefix))
            return "http://127.0.0.1:8787/";
        return prefix.EndsWith("/", StringComparison.Ordinal) ? prefix : prefix + "/";
    }

    private static string CombineUrl(string prefix, string path)
    {
        return NormalizePrefix(prefix) + path.TrimStart('/');
    }

    private static void TryOpenBrowser(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = url,
                UseShellExecute = true
            });
        }
        catch
        {
            // Browser launch is a convenience only. The URL is printed to the console.
        }
    }

    private string BuildHarnessHtml()
    {
        // v64: keep the web API harness as an external HTML asset instead of
        // embedding a huge JavaScript/CSS document inside a C# string. This
        // removes the quote/backslash escaping failure class that caused
        // WorkbenchApiServer.cs compile errors around the old BuildHarnessHtml().
        string encodedDefaultPath = HtmlEncode(_options.DefaultFwdPath ?? string.Empty);

        string[] candidates =
        {
            Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ApiHarness", "api-harness.html"),
            Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "api-harness.html"),
            Path.Combine(Directory.GetCurrentDirectory(), "AcRuleWorkbench", "ApiHarness", "api-harness.html"),
            Path.Combine(Directory.GetCurrentDirectory(), "ApiHarness", "api-harness.html")
        };

        foreach (string candidate in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(candidate) || !File.Exists(candidate))
            {
                continue;
            }

            try
            {
                string html = File.ReadAllText(candidate, Encoding.UTF8);
                return html.Replace("{{DEFAULT_PATH}}", encodedDefaultPath).Replace("{{VIEWER_URL}}", "/viewer");
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Unable to read API harness HTML from {Path}", candidate);
            }
        }

        return BuildFallbackHarnessHtml(encodedDefaultPath);
    }

    // Serves the harness stylesheet from disk (or a safe fallback) so the debug UI renders with full styling.
    private void WriteHarnessCss(HttpListenerContext context)
    {
        _responseWriter.WriteText(context.Response, BuildHarnessCss(), "text/css; charset=utf-8", _options.EnableCors);
    }

    // Uses the same probing strategy as HTML to find api-harness.css in runtime, bin, or source locations.
    private string BuildHarnessCss()
    {
        string[] candidates =
        {
            Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ApiHarness", "api-harness.css"),
            Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "api-harness.css"),
            Path.Combine(Directory.GetCurrentDirectory(), "AcRuleWorkbench", "ApiHarness", "api-harness.css"),
            Path.Combine(Directory.GetCurrentDirectory(), "ApiHarness", "api-harness.css")
        };

        foreach (string candidate in candidates.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(candidate) || !File.Exists(candidate))
                continue;

            try
            {
                return File.ReadAllText(candidate, Encoding.UTF8);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Unable to read API harness CSS from {Path}", candidate);
            }
        }

        return "body{font-family:Segoe UI,Arial,sans-serif;background:#eef3f8;color:#172033}"
             + ".app{max-width:1400px;margin:0 auto;padding:14px}"
             + ".card{background:#fff;border:1px solid #d7e0eb;border-radius:14px;padding:14px;margin-bottom:12px}"
             + ".side,.main{display:block}"
             + ".result{white-space:pre-wrap;font-family:Cascadia Mono,Consolas,monospace;background:#101827;color:#e5edf8;border-radius:10px;padding:12px;min-height:180px}";
    }

    // Serves Workbench viewer stylesheets so /viewer always has matching CSS assets.
    private void WriteViewerCss(HttpListenerContext context, string cssFileName)
    {
        _responseWriter.WriteText(context.Response, BuildViewerCss(cssFileName), "text/css; charset=utf-8", _options.EnableCors);
    }

    // Uses viewer-path-aware probing with fallback to ac-rule-viewer.css.
    // The API process is normally launched from bin\x86\Debug\net48, while --viewer can
    // point to a repo-root shell or generated live viewer. Browser requests for /ac-rule-viewer.css,
    // /ac-rule-viewer.js, and sidecar JSON files must therefore resolve next to the
    // configured viewer file first, not only next to the executable.
    private string BuildViewerCss(string cssFileName)
    {
        string requested = string.IsNullOrWhiteSpace(cssFileName) ? "ac-rule-viewer.css" : cssFileName;

        foreach (string candidate in EnumerateViewerAssetCandidates(requested))
        {
            try
            {
                return File.ReadAllText(candidate, Encoding.UTF8);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Unable to read viewer CSS from {Path}", candidate);
            }
        }

        if (!string.Equals(requested, "ac-rule-viewer.css", StringComparison.OrdinalIgnoreCase))
        {
            foreach (string candidate in EnumerateViewerAssetCandidates("ac-rule-viewer.css"))
            {
                try
                {
                    return File.ReadAllText(candidate, Encoding.UTF8);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Unable to read fallback viewer CSS from {Path}", candidate);
                }
            }
        }

        // Intentionally obvious fallback. If this appears in the browser, the server is
        // running but cannot locate the real viewer stylesheet beside the generated viewer.
        return "body{font-family:Segoe UI,Arial,sans-serif;background:#eef3f8;color:#172033}"
             + "body:before{content:'AC Rule Workbench CSS asset was not found by the server.';display:block;padding:10px 14px;background:#7c2d12;color:white;font-weight:700}";
    }

    // Serves viewer JavaScript/JSON sidecar assets so the hosted Workbench UI can fully bootstrap.
    private void WriteViewerTextAsset(HttpListenerContext context, string assetFileName, string contentType, string fallbackContent)
    {
        _responseWriter.WriteText(context.Response, BuildViewerTextAsset(assetFileName, fallbackContent), contentType, _options.EnableCors);
    }

    // Uses viewer-path-aware probing so root-hosted and bin-hosted viewer assets resolve consistently.
    private string BuildViewerTextAsset(string assetFileName, string fallbackContent)
    {
        string requested = string.IsNullOrWhiteSpace(assetFileName) ? string.Empty : assetFileName;
        if (string.IsNullOrWhiteSpace(requested))
            return fallbackContent ?? string.Empty;

        foreach (string candidate in EnumerateViewerAssetCandidates(requested))
        {
            try
            {
                return File.ReadAllText(candidate, Encoding.UTF8);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Unable to read viewer asset from {Path}", candidate);
            }
        }

        return fallbackContent ?? string.Empty;
    }

    private IEnumerable<string> EnumerateViewerAssetCandidates(string assetFileName)
    {
        if (string.IsNullOrWhiteSpace(assetFileName))
            yield break;

        var directories = new List<string>();

        void AddDirectory(string? path)
        {
            if (string.IsNullOrWhiteSpace(path))
                return;

            try
            {
                string fullPath = Path.GetFullPath(path!);
                if (!directories.Contains(fullPath, StringComparer.OrdinalIgnoreCase))
                    directories.Add(fullPath);
            }
            catch
            {
                // Ignore invalid paths from command-line input or unusual working directories.
            }
        }

        void AddFileDirectory(string? filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
                return;

            try
            {
                string resolvedFile = Path.IsPathRooted(filePath!)
                    ? filePath!
                    : Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), filePath!));
                AddDirectory(Path.GetDirectoryName(resolvedFile));
            }
            catch
            {
                // Ignore invalid paths from command-line input.
            }
        }

        AddFileDirectory(_options.ViewerPath);

        try
        {
            AddFileDirectory(ResolveStaticViewerPath());
        }
        catch
        {
            // Asset serving must not fail just because viewer discovery failed.
        }

        AddDirectory(Directory.GetCurrentDirectory());
        AddDirectory(AppDomain.CurrentDomain.BaseDirectory);
        AddDirectory(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Viewer"));
        AddDirectory(Path.Combine(Directory.GetCurrentDirectory(), "Viewer"));
        AddDirectory(Path.Combine(Directory.GetCurrentDirectory(), "AcRuleWorkbench.Core", "Viewer"));
        AddDirectory(Path.Combine(Directory.GetCurrentDirectory(), "AcRuleWorkbench", "Viewer"));

        string current = AppDomain.CurrentDomain.BaseDirectory;
        for (int i = 0; i < 8 && !string.IsNullOrWhiteSpace(current); i++)
        {
            AddDirectory(current);
            AddDirectory(Path.Combine(current, "Viewer"));
            AddDirectory(Path.Combine(current, "AcRuleWorkbench.Core", "Viewer"));
            AddDirectory(Path.Combine(current, "AcRuleWorkbench", "Viewer"));

            DirectoryInfo? parent = Directory.GetParent(current);
            if (parent == null)
                break;
            current = parent.FullName;
        }

        foreach (string dir in directories.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            string candidate;
            try
            {
                candidate = Path.Combine(dir, assetFileName);
            }
            catch
            {
                continue;
            }

            if (File.Exists(candidate))
                yield return candidate;
        }
    }

    private static string BuildFallbackHarnessHtml(string encodedDefaultPath)
    {
        var html = new StringBuilder();
        html.AppendLine("<!doctype html>");
        html.AppendLine("<html lang=\"en\">");
        html.AppendLine("<head>");
        html.AppendLine("<meta charset=\"utf-8\">");
        html.AppendLine("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">");
        html.AppendLine("<title>AC Rule Workbench Diagnostic Harness</title>");
        html.AppendLine("<style>");
        html.AppendLine("body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#eef3f8;color:#172033}");
        html.AppendLine("main{max-width:1100px;margin:40px auto;padding:0 20px}");
        html.AppendLine(".card{background:#fff;border:1px solid #d7e0eb;border-radius:18px;padding:20px;box-shadow:0 14px 36px rgba(15,23,42,.08)}");
        html.AppendLine("h1{margin:0 0 8px;font-size:26px}.muted{color:#64748b}code,pre{font-family:Cascadia Mono,Consolas,monospace}");
        html.AppendLine("input{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:12px;padding:10px;margin:8px 0 12px}");
        html.AppendLine("button{border:0;border-radius:12px;background:#3157d5;color:white;padding:10px 14px;font-weight:700;cursor:pointer}");
        html.AppendLine("pre{white-space:pre-wrap;background:#101827;color:#e5edf8;border-radius:14px;padding:14px;min-height:260px;overflow:auto}");
        html.AppendLine("</style>");
        html.AppendLine("</head>");
        html.AppendLine("<body><main><section class=\"card\">");
        html.AppendLine("<h1>AC Rule Workbench Diagnostic Harness</h1>");
        html.AppendLine("<p class=\"muted\">Fallback diagnostic harness loaded. Product clients should use /api/v1 and /api/v1/openapi.json.</p>");
        html.AppendLine("<label>FWD path</label>");
        html.Append("<input id=\"path\" value=\"");
        html.Append(encodedDefaultPath);
        html.AppendLine("\">");
        html.AppendLine("<button id=\"info\">GET /api/v1/status</button> <button id=\"hier\">GET /api/v1/scopes</button> <button id=\"diag\">GET /api/v1/diagnostics</button>");
        html.AppendLine("<pre id=\"out\">Ready.</pre>");
        html.AppendLine("<script>");
        html.AppendLine("const $=id=>document.getElementById(id);");
        html.AppendLine("async function run(path){const u=new URL(path,location.origin);const p=$('path').value;if(p)u.searchParams.set('path',p);$('out').textContent='GET '+u+'\n\nLoading...';try{const r=await fetch(u);const t=await r.text();let body=t;try{body=JSON.stringify(JSON.parse(t),null,2)}catch{}if(!r.ok||(body&&body.ok===false)){throw new Error((body&&(body.error||body.exceptionMessage||body.fix))||t||('HTTP '+r.status));}$('#out').textContent='HTTP '+r.status+' '+r.statusText+'\nGET '+u+'\n\n'+body}catch(e){$('out').textContent='REQUEST FAILED\n'+(e.stack||e.message||e)}}");
        html.AppendLine("$('info').onclick=()=>run('/api/v1/status');$('hier').onclick=()=>run('/api/v1/scopes');$('diag').onclick=()=>run('/api/v1/diagnostics');");
        html.AppendLine("</script>");
        html.AppendLine("</section></main></body></html>");
        return html.ToString();
    }

    private static string HtmlEncode(string value)
    {
        return WebUtility.HtmlEncode(value ?? string.Empty);
    }


    private sealed class WorkbenchRefreshState
    {
        public bool HasRun { get; set; }
        public bool Ok { get; set; }
        public DateTime? StartedUtc { get; set; }
        public DateTime? CompletedUtc { get; set; }
        public string? FwdPath { get; set; }
        public string? ViewerPath { get; set; }
        public int? ScopeCount { get; set; }
        public int? RuleCount { get; set; }
        public int? RelationshipCount { get; set; }
        public long? ViewerLength { get; set; }
        public DateTime? ViewerLastWriteUtc { get; set; }
        public string? Error { get; set; }
        public string? ExceptionType { get; set; }

        public static WorkbenchRefreshState NotRun() => new WorkbenchRefreshState { HasRun = false, Ok = false };

        public static WorkbenchRefreshState Success(DateTime startedUtc, DateTime completedUtc, string fwdPath, string viewerPath, int scopeCount, int ruleCount, int relationshipCount, long viewerLength, DateTime viewerLastWriteUtc)
        {
            return new WorkbenchRefreshState
            {
                HasRun = true,
                Ok = true,
                StartedUtc = startedUtc,
                CompletedUtc = completedUtc,
                FwdPath = fwdPath,
                ViewerPath = viewerPath,
                ScopeCount = scopeCount,
                RuleCount = ruleCount,
                RelationshipCount = relationshipCount,
                ViewerLength = viewerLength,
                ViewerLastWriteUtc = viewerLastWriteUtc
            };
        }

        public static WorkbenchRefreshState Failure(DateTime startedUtc, DateTime completedUtc, string fwdPath, string viewerPath, Exception ex)
        {
            return new WorkbenchRefreshState
            {
                HasRun = true,
                Ok = false,
                StartedUtc = startedUtc,
                CompletedUtc = completedUtc,
                FwdPath = fwdPath,
                ViewerPath = viewerPath,
                Error = ex.Message,
                ExceptionType = ex.GetType().Name
            };
        }
    }

    private sealed class ApiError
    {
        public string Error { get; set; } = string.Empty;
        public string? ExceptionType { get; set; }
        public string? ExceptionMessage { get; set; }
    }
}
