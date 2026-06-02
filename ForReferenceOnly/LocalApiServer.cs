using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using DllInteropHarness.Api;
using DllInteropHarness.Api.V1;
using DllInteropHarness.Core;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

namespace DllInteropHarness;

internal sealed class LocalApiServer
{
    private readonly IDllClient _client;
    private readonly ILogger<LocalApiServer> _logger;
    private readonly LocalApiServerOptions _options;
    private readonly object _refreshGate = new object();
    private readonly WorkbenchApiService _v1Api;
    private WorkbenchRefreshState _lastRefresh = WorkbenchRefreshState.NotRun();
    private volatile bool _stopping;

    public LocalApiServer(IDllClient client, ILogger<LocalApiServer> logger, LocalApiServerOptions options)
    {
        _client = client ?? throw new ArgumentNullException(nameof(client));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _options = options ?? throw new ArgumentNullException(nameof(options));
        _v1Api = new WorkbenchApiService(_client, _options);
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

        Console.WriteLine("DllInteropHarness local API");
        Console.WriteLine("============================");
        Console.WriteLine("Listening : " + prefix);
        Console.WriteLine("Viewer    : " + CombineUrl(prefix, "viewer"));
        Console.WriteLine("Debug API : " + (_options.EnableDebugApi ? CombineUrl(prefix, "harness") : "disabled (use --enable-debug-api)"));
        Console.WriteLine("Health    : " + CombineUrl(prefix, "api/health"));
        Console.WriteLine("Default FWD: " + (_options.DefaultFwdPath ?? "(not set; pass path query parameter)"));
        Console.WriteLine("Press Ctrl+C to stop.");

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

            try
            {
                Handle(context);
            }
            catch (ApiRouteNotFoundException ex)
            {
                WriteJson(context.Response, new ApiError
                {
                    Error = "Route not found.",
                    ExceptionType = nameof(ApiRouteNotFoundException),
                    ExceptionMessage = ex.Route
                }, 404, _options.EnableCors);
            }
            catch (DllInteropException ex)
            {
                WriteJson(context.Response, new ApiError
                {
                    Error = ex.Message,
                    ExceptionType = ex.GetType().Name,
                    ExceptionMessage = ex.InnerException?.Message
                }, 400, _options.EnableCors);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unhandled API request failure");
                WriteJson(context.Response, new ApiError
                {
                    Error = "Unhandled server error.",
                    ExceptionType = ex.GetType().Name,
                    ExceptionMessage = ex.Message
                }, 500, _options.EnableCors);
            }
        }

        return 0;
    }

    private void Handle(HttpListenerContext context)
    {
        HttpListenerRequest request = context.Request;
        HttpListenerResponse response = context.Response;

        if (_options.EnableCors)
            AddCors(response);

        if (string.Equals(request.HttpMethod, "OPTIONS", StringComparison.OrdinalIgnoreCase))
        {
            response.StatusCode = 204;
            response.Close();
            return;
        }

        string route = (request.Url?.AbsolutePath ?? "/").Trim('/').ToLowerInvariant();
        if (route.Length == 0 || route == "viewer" || route == "viewer/index.html" || route == "viewer/ac-rule-viewer.html" || route == "ac-rule-viewer.html")
        {
            WriteStaticViewer(context);
            return;
        }

        if (route == "test" || route == "harness" || route == "api-harness")
        {
            if (!_options.EnableDebugApi)
            {
                WriteHtml(response, BuildDebugDisabledHtml(), _options.EnableCors);
                return;
            }

            WriteHtml(response, BuildHarnessHtml(), _options.EnableCors);
            return;
        }

        if (route == "api/workbench/status")
        {
            WriteJson(response, BuildWorkbenchStatus(request), 200, _options.EnableCors);
            return;
        }

        if (route == "api/workbench/refresh" || route == "api/fwd/refresh")
        {
            int refreshStatus = 200;
            bool refreshPost = string.Equals(request.HttpMethod, "POST", StringComparison.OrdinalIgnoreCase);
            bool confirmGet = GetBool(request, "confirm", false);

            if (!_options.AllowMutatingCommands)
                refreshStatus = 409;
            else if (!refreshPost && !confirmGet)
                refreshStatus = 405;

            WriteJson(response, RefreshWorkbench(request), refreshStatus, _options.EnableCors);
            return;
        }

        if (route == "favicon.ico")
        {
            response.StatusCode = 204;
            response.Close();
            return;
        }

        if (route == "api/v1" || route.StartsWith("api/v1/", StringComparison.OrdinalIgnoreCase))
        {
            ApiHttpResult v1Result = _v1Api.Dispatch(route, request);
            WriteApiResult(response, v1Result, _options.EnableCors);
            return;
        }

        object result = Dispatch(route, request);
        WriteJson(response, result, 200, _options.EnableCors);
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
            fix = "Restart the API with --enable-debug-api only when you need development/raw extraction routes.",
            productHelp = "/api/help"
        };
    }

    private static string BuildDebugDisabledHtml()
    {
        const string command = "DllInteropHarness.exe api --path C:\\rri\\ddce\\configs\\Server\\R1\\fwd\\fwd.cfd --port 8787 --viewer .\\ac-rule-viewer.html --allow-refresh --enable-debug-api";
        return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Debug API disabled</title>" +
               "<style>body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#eef3f8;color:#172033}main{max-width:860px;margin:48px auto;padding:0 22px}.card{background:white;border:1px solid #d7e0eb;border-radius:22px;padding:28px;box-shadow:0 18px 50px rgba(15,23,42,.10)}h1{margin:0 0 10px;font-size:28px}p{color:#64748b;line-height:1.55}pre{background:#101827;color:#eaf2ff;border-radius:14px;padding:16px;overflow:auto}a{color:#3157d5;font-weight:800}</style></head>" +
               "<body><main><section class=\"card\"><h1>Debug API disabled</h1><p>The product workbench is available, but the development harness/raw debug routes are hidden for this server process.</p><p>Open the workbench at <a href=\"/viewer\">/viewer</a> or product API help at <a href=\"/api/help\">/api/help</a>.</p><p>To expose debug routes temporarily:</p><pre>" + command + "</pre></section></main></body></html>";
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
                service = "DllInteropHarness local API",
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

        if (route == "api/ac/flow")
        {
            return _client.BuildAcFlow(new AcFlowOptions
            {
                Path = GetFwdPath(request),
                ProcessName = Get(request, "process") ?? "AC",
                Term = Get(request, "term"),
                Scope = Get(request, "scope"),
                FromRuleIndex = GetNullableInt(request, "fromRule"),
                FromRuleGuid = Get(request, "fromGuid"),
                IncludeHeuristicSequence = !GetBool(request, "noSequenceEdges", false),
                RequireNativeOk = GetBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/ac/flow-debug")
        {
            return _client.BuildAcFlowDebug(new AcFlowDebugOptions
            {
                Path = GetFwdPath(request),
                ProcessName = Get(request, "process") ?? "AC",
                Term = Get(request, "term"),
                Scope = Get(request, "scope"),
                FromRuleIndex = GetNullableInt(request, "fromRule"),
                FromRuleGuid = Get(request, "fromGuid"),
                MaxRules = GetInt(request, "maxRules", 25),
                MaxRawTokensPerRule = GetInt(request, "maxRawTokens", 80),
                MaxRawTokensPerScope = GetInt(request, "maxScopeTokens", 400),
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
                throw new DllInteropException("The OCR endpoint requires query parameter 'path'.");

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
                    "GET /api/debug/ac/flow-debug"
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
                service = "DllInteropHarness debug API",
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
        if (route == "api/debug/ac/flow-debug") return Dispatch("api/ac/flow-debug", request);

        throw new ApiRouteNotFoundException(route);
    }

    private object BuildHelp()
    {
        return new
        {
            service = "DllInteropHarness AC Rule Workbench API",
            mode = "product read-only inspection API",
            defaultFwdPath = _options.DefaultFwdPath,
            debugApiEnabled = _options.EnableDebugApi,
            productEndpoints = new[]
            {
                "GET /",
                "GET /viewer",
                "GET /api/health",
                "GET /api/workbench/status",
                "POST /api/workbench/refresh",
                "GET /api/v1/status",
                "GET /api/v1/snapshot",
                "POST /api/v1/snapshot/refresh",
                "GET /api/v1/scopes",
                "GET /api/v1/scopes/{scopeId}",
                "GET /api/v1/scopes/{scopeId}/structure",
                "GET /api/v1/scopes/{scopeId}/inventory",
                "GET /api/v1/scopes/{scopeId}/references",
                "GET /api/v1/scopes/{scopeId}/diagnostics",
                "GET /api/v1/rules/{nodeId}",
                "GET /api/v1/rules/{nodeId}/subtree",
                "GET /api/v1/search?q=provider",
                "POST /api/v1/export",
                "GET /api/fwd/info",
                "GET /api/fwd/capabilities",
                "GET /api/fwd/evidence/summary",
                "GET /api/fwd/snapshot/normalized",
                "GET /api/fwd/hierarchy",
                "GET /api/fwd/documents",
                "GET /api/fwd/pages",
                "GET /api/fwd/processes",
                "GET /api/fwd/rules",
                "GET /api/fwd/rules/{ruleId}",
                "GET /api/fwd/rules/{ruleId}/tree",
                "GET /api/fwd/rules/{ruleId}/references",
                "GET /api/fwd/search?q=provider",
                "GET /api/fwd/graph",
                "GET /api/fwd/diagnostics"
            },
            debugEndpoints = _options.EnableDebugApi
                ? new[]
                {
                    "GET /harness",
                    "GET /api/probe",
                    "GET /api/inspect?path=...&fields=true",
                    "GET /api/stc-process",
                    "GET /api/ac/rules",
                    "GET /api/ac/tree",
                    "GET /api/ac/relationships",
                    "GET /api/ac/flow-debug",
                    "GET /api/fwd/raw/stc/{nodeId}"
                }
                : new[] { "Debug endpoints are hidden. Restart with --enable-debug-api to expose development/debug routes." },
            interpretation = new
            {
                structure = "Use structural tree endpoints and the Structure tab for hierarchy/order.",
                inventory = "Use flat inventory for search/completeness, not branch order.",
                references = "Treat references as evidence-coded static analysis, not execution proof unless confidence says so."
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
        if (tail == "graph") return BuildGraph(request);
        if (tail.StartsWith("impact/", StringComparison.OrdinalIgnoreCase)) return BuildImpact(parts.Length > 3 ? UrlDecode(parts[3]) : null, request);
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
                openedBy = "DllInteropHarness local API",
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
                "configuration-identity", "true-hierarchy", "scope-aware-rules", "function-catalog", "field-schema", "reference-graph", "typed-search", "diagnostics", "evidence", "normalized-snapshot", "raw-stc-escape-hatch"
            },
            supported = new
            {
                readOnlyInspection = true,
                normalizedSnapshot = true,
                hierarchy = true,
                orderedRuleTree = true,
                disabledInheritance = true,
                relationshipExtraction = true,
                graphProjection = true,
                impactProjection = true,
                typedSearch = true,
                compare = false,
                nativeRuleExecution = false,
                mutation = false,
                runtimeOperations = false
            },
            caveats = new[]
            {
                "Rule execution simulation is not exposed as native execution.",
                "Raw STC endpoints are evidence/debug surfaces, not the primary domain model.",
                "Graph and impact endpoints are projections from extracted rule/tree/relationship evidence."
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
            graph = BuildGraphPayload(fwd, tree, rels),
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
        return _client.InspectProcessTree(new StcTraversalOptions { Path = GetFwdPath(request), ProcessName = process, MaxDepth = GetInt(request, "maxDepth", 5), MaxNodes = GetInt(request, "maxNodes", 1500), IncludeDataPreview = !GetBool(request, "noDataPreview", false), RequireNativeOk = GetBool(request, "requireNativeOk", false) });
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

    private object BuildGraph(HttpListenerRequest request)
    {
        var fwd = InspectCore(request, includeFields: true);
        var tree = TreeCore(request);
        var rels = RelationshipsCore(request, includeRules: false);
        return new { schema = "FwdInspection.Graph", schemaVersion = "2.0.0", graph = BuildGraphPayload(fwd, tree, rels) };
    }

    private object BuildImpact(string? nodeId, HttpListenerRequest request)
    {
        if (string.IsNullOrWhiteSpace(nodeId)) throw new DllInteropException("Impact endpoint requires /api/fwd/impact/{nodeId}.");
        string id = nodeId!;
        var rels = RelationshipsCore(request, includeRules: true);
        var rules = RulesCore(request);
        var affectedRels = rels.Relationships.Where(r => Contains(r.Target, id) || Contains(r.RuleGuid, id) || Contains(r.RuleName, id) || Contains(r.FunctionName, id)).ToList();
        var affectedRules = rules.Rules.Where(r => RuleMatches(r, id) || affectedRels.Any(a => a.RuleIndex == r.RuleIndex && Eq(a.ScopePath, r.ScopePath))).ToList();
        return new { schema = "FwdInspection.Impact", target = id, summary = new { affectedRuleCount = affectedRules.Count, affectedRelationshipCount = affectedRels.Count, confidence = "projection" }, affectedRules = affectedRules.Select(NormalizeRule).ToList(), relationships = affectedRels, caveat = "Impact is a static projection from extracted references. It is not native execution." };
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
            processTree = _client.InspectProcessTree(new StcTraversalOptions { Path = GetFwdPath(request), ProcessName = Get(request, "process") ?? "AC", MaxDepth = GetInt(request, "maxDepth", 6), MaxNodes = GetInt(request, "maxNodes", 2500), IncludeDataPreview = !GetBool(request, "noDataPreview", false), RequireNativeOk = GetBool(request, "requireNativeOk", false) })
        };
    }

    private FwdInspectionReport InspectCore(HttpListenerRequest request, bool includeFields)
    {
        return _client.Inspect(new FwdInspectionOptions { Path = GetFwdPath(request), IncludeFields = includeFields, RequireNativeOk = GetBool(request, "requireNativeOk", false) });
    }

    private AcRuleReport RulesCore(HttpListenerRequest request)
    {
        return _client.InspectAcRules(new AcRuleOptions { Path = GetFwdPath(request), ProcessName = Get(request, "process") ?? "AC", Term = Get(request, "term"), Scope = Get(request, "scope"), Function = Get(request, "function"), IncludeRawTokens = GetBool(request, "includeRawTokens", false), MaxRawTokensPerScope = GetInt(request, "maxRawTokens", 250), RequireNativeOk = GetBool(request, "requireNativeOk", false) });
    }

    private AcTreeReport TreeCore(HttpListenerRequest request)
    {
        return _client.BuildAcTree(new AcTreeOptions { Path = GetFwdPath(request), ProcessName = Get(request, "process") ?? "AC", Term = Get(request, "term"), Scope = Get(request, "scope"), IncludeAttributes = GetBool(request, "includeAttributes", true), MaxAttributeValueLength = GetInt(request, "maxAttributeValueLength", 500), MaxHierarchyDepth = GetInt(request, "maxHierarchyDepth", 256), MaxNodeEntryCount = (uint)Math.Max(1, GetInt(request, "maxNodeEntryCount", 100000)), MaskSensitiveValues = !GetBool(request, "noMaskSensitive", false), RequireNativeOk = GetBool(request, "requireNativeOk", false) });
    }

    private AcRelationshipReport RelationshipsCore(HttpListenerRequest request, bool includeRules)
    {
        return _client.TraceAcRelationships(new AcTraceOptions { Path = GetFwdPath(request), ProcessName = Get(request, "process") ?? "AC", Term = Get(request, "term"), Scope = Get(request, "scope"), Function = Get(request, "function"), Field = Get(request, "field"), Attr = Get(request, "attr"), RelationshipKind = Get(request, "kind"), IncludeRules = includeRules, MaxRelationships = GetInt(request, "maxRelationships", 0), RequireNativeOk = GetBool(request, "requireNativeOk", false) });
    }

    private AcDiagnosticsReport DiagnosticsCore(HttpListenerRequest request)
    {
        return _client.BuildAcDiagnostics(new AcRuleOptions { Path = GetFwdPath(request), ProcessName = Get(request, "process") ?? "AC", Term = Get(request, "term"), Scope = Get(request, "scope"), Function = Get(request, "function"), RequireNativeOk = GetBool(request, "requireNativeOk", false) });
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

    private static object BuildGraphPayload(FwdInspectionReport fwd, AcTreeReport tree, AcRelationshipReport rels)
    {
        var nodes = new List<object>();
        var edges = new List<object>();
        nodes.Add(new { id = "fwd", type = "fwd", label = Path.GetFileName(fwd.Path), path = fwd.Path });
        foreach (string b in fwd.Batches) { string id = "batch:" + b; nodes.Add(new { id, type = "batchType", label = b }); edges.Add(new { from = "fwd", to = id, type = "CONTAINS", confidence = "Extracted" }); }
        foreach (string d in fwd.Documents) { string id = "document:" + d; nodes.Add(new { id, type = "documentType", label = d }); edges.Add(new { from = "fwd", to = id, type = "CONTAINS", confidence = "Extracted" }); }
        foreach (string p in fwd.Pages) { string id = "page:" + p; nodes.Add(new { id, type = "pageType", label = p }); edges.Add(new { from = "fwd", to = id, type = "CONTAINS", confidence = "Extracted" }); }
        foreach (var bucket in fwd.Fields) foreach (var field in bucket.Fields) { string id = "field:" + bucket.ScopeName + ":" + field.Name; nodes.Add(new { id, type = "field", label = field.Name, scope = bucket.ScopeName, field.Type, field.Geometry }); edges.Add(new { from = "page:" + bucket.ScopeName, to = id, type = "HAS_FIELD", confidence = "Extracted" }); }
        foreach (var n in tree.Nodes.Where(n => n.IsRuleNode)) { string id = "ruleNode:" + n.NodeId; nodes.Add(new { id, type = "rule", label = n.RuleName ?? n.FunctionName ?? ("Rule " + n.NodeId), scope = n.ScopePath, functionName = n.FunctionName, disabledState = n.DisabledState }); edges.Add(new { from = (string.IsNullOrWhiteSpace(n.ScopeName) ? "fwd" : (n.ScopeType.ToLowerInvariant() + ":" + n.ScopeName)), to = id, type = "HAS_RULE", confidence = "Parsed" }); if (!string.IsNullOrWhiteSpace(n.FunctionName)) { string fid = "function:" + n.FunctionName; nodes.Add(new { id = fid, type = "function", label = n.FunctionName }); edges.Add(new { from = id, to = fid, type = "CALLS_FUNCTION", confidence = "Parsed" }); } }
        foreach (var e in tree.Edges) edges.Add(new { from = "ruleNode:" + e.FromNodeId, to = "ruleNode:" + e.ToNodeId, type = "HAS_ACTION", actionListIndex = e.ActionListIndex, actionName = e.ActionName, actionNameResolved = e.ActionNameResolved, confidence = e.Confidence, evidence = e.Evidence });
        foreach (var r in rels.Relationships) edges.Add(new { from = "rule:" + r.ScopeName + ":" + r.RuleIndex, to = r.TargetType.ToLowerInvariant() + ":" + r.Target, type = NormalizeEdgeType(r), confidence = r.Confidence, evidence = r.Evidence });
        return new { nodes = nodes.GroupBy(n => JsonConvert.SerializeObject(n)).Select(g => g.First()).ToList(), edges, counts = new { nodes = nodes.Count, edges = edges.Count } };
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
        string? path = Get(request, "path") ?? _options.DefaultFwdPath;
        if (string.IsNullOrWhiteSpace(path))
            throw new DllInteropException("A FWD/CFD path is required. Pass --path when starting the API or provide ?path=... on the request.");
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
            schema = "DllInteropHarness.WorkbenchStatus",
            schemaVersion = "1.0.0",
            service = "AC Rule Workbench",
            utc = DateTime.UtcNow,
            refreshEnabled = _options.AllowMutatingCommands,
            refreshMethod = "POST /api/workbench/refresh",
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
                refresh = "/api/workbench/refresh",
                fwdInfo = "/api/fwd/info"
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
                fix = "Use .\\scripts\\start-workbench.ps1 to generate the viewer and start the API with refresh support, or restart this process with --allow-refresh and --viewer .\\ac-rule-viewer.html.",
                links = new { status = "/api/workbench/status" }
            };
        }

        bool isPost = string.Equals(request.HttpMethod, "POST", StringComparison.OrdinalIgnoreCase);
        bool confirmGet = GetBool(request, "confirm", false);
        if (!isPost && !confirmGet)
        {
            return new
            {
                ok = false,
                error = "Refresh requires POST. For manual browser testing only, use /api/workbench/refresh?confirm=true.",
                method = "POST",
                links = new { status = "/api/workbench/status" }
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
                    export = new { scopes = report.ScopeCount, rules = report.RuleCount, relationships = report.RelationshipCount },
                    links = new { viewer = "/viewer", harness = "/harness", status = "/api/workbench/status" }
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

        string? existing = ResolveStaticViewerPath();
        if (!string.IsNullOrWhiteSpace(existing))
        {
            return existing!;
        }

        return Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "ac-rule-viewer.html"));
    }

    private void WriteStaticViewer(HttpListenerContext context)
    {
        string? viewerPath = ResolveStaticViewerPath();
        if (string.IsNullOrWhiteSpace(viewerPath) || !File.Exists(viewerPath))
        {
            string html = BuildViewerMissingHtml();
            WriteHtml(context.Response, html, _options.EnableCors, 404);
            return;
        }

        try
        {
            string html = File.ReadAllText(viewerPath, Encoding.UTF8);
            html = InjectApiWorkbenchBridge(html);
            WriteHtml(context.Response, html, _options.EnableCors);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unable to serve AC Rule Workbench from {Path}", viewerPath);
            WriteJson(context.Response, new ApiError
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
        string oneCommand = "cd C:\\dev\\DllInteropHarness\n.\\scripts\\start-workbench.ps1 -FwdPath \"" + path + "\" -Port 8787 -KillExisting";
        string manualCommand = "cd C:\\dev\\DllInteropHarness\n.\\DllInteropHarness\\bin\\x86\\Debug\\net48\\DllInteropHarness.exe ac-viewer --path \"" + path + "\" --out .\\ac-rule-viewer.html\n.\\DllInteropHarness\\bin\\x86\\Debug\\net48\\DllInteropHarness.exe api --path \"" + path + "\" --port 8787 --viewer .\\ac-rule-viewer.html --allow-refresh";
        return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>AC Rule Workbench not generated</title>" +
               "<style>body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#eef3f8;color:#172033}main{max-width:1040px;margin:44px auto;padding:0 22px}.card{background:white;border:1px solid #d7e0eb;border-radius:22px;padding:26px;box-shadow:0 18px 50px rgba(15,23,42,.10)}h1{margin:0 0 10px;font-size:28px}h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#475569;margin:24px 0 8px}p{color:#64748b;line-height:1.55}.facts{display:grid;grid-template-columns:160px 1fr;gap:8px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin:16px 0}.facts b{color:#334155}pre{background:#101827;color:#eaf2ff;border-radius:14px;padding:16px;overflow:auto;white-space:pre-wrap}a{color:#3157d5;font-weight:800}.note{border-left:4px solid #3157d5;background:#eef3ff;padding:12px 14px;border-radius:12px;color:#334155}</style></head>" +
               "<body><main><section class=\"card\"><h1>Workbench file missing</h1><p>The API process is running, but no static <code>ac-rule-viewer.html</code> is attached or discoverable. This is a server setup issue, not an extraction failure.</p>" +
               "<div class=\"facts\"><b>FWD path</b><span><code>" + path + "</code></span><b>Expected viewer</b><span><code>ac-rule-viewer.html</code></span><b>Best fix</b><span>Use the unified start script below. It generates the viewer and starts the API with refresh support.</span></div>" +
               "<h2>Recommended command</h2><pre>" + oneCommand + "</pre>" +
               "<h2>Manual command</h2><pre>" + manualCommand + "</pre>" +
               "<p class=\"note\">After running the command, open <a href=\"/viewer\">/viewer</a> or <a href=\"/harness\">/harness</a>.</p></section></main></body></html>";
    }

    private static string InjectApiWorkbenchBridge(string html)
    {
        if (string.IsNullOrWhiteSpace(html) || html.IndexOf("AC_API_BRIDGE_V67", StringComparison.OrdinalIgnoreCase) >= 0)
            return html;

        const string bridge = @"
<style id=""AC_API_BRIDGE_V67"">
.ac-api-bridge-v67{position:fixed;right:18px;bottom:18px;z-index:2147483000;display:flex;align-items:center;gap:8px;padding:8px;border-radius:999px;background:linear-gradient(135deg,#0b1020,#172033 58%,#203255);color:#eaf2ff!important;font:800 12px/1.1 Aptos,'Segoe UI',system-ui,sans-serif;border:1px solid rgba(148,163,184,.34);box-shadow:0 18px 48px rgba(2,6,23,.32),inset 0 1px 0 rgba(255,255,255,.08)}
.ac-api-bridge-v67 a,.ac-api-bridge-v67 button{appearance:none;border:0;border-radius:999px;text-decoration:none!important;display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:32px;padding:0 12px;font:800 12px/1.1 Aptos,'Segoe UI',system-ui,sans-serif;cursor:pointer;white-space:nowrap}.ac-api-bridge-v67 a{background:#e3f4f1;color:#0f5d56!important}.ac-api-bridge-v67 button{background:#e8edff;color:#183a9f}.ac-api-bridge-v67 .status{background:rgba(255,255,255,.08);color:#dbeafe!important;border:1px solid rgba(148,163,184,.24)}.ac-api-bridge-v67 button:hover,.ac-api-bridge-v67 a:hover{transform:translateY(-1px)}.ac-api-bridge-v67 button:focus-visible,.ac-api-bridge-v67 a:focus-visible{outline:3px solid rgba(103,232,249,.65);outline-offset:3px}@media(max-width:720px){.ac-api-bridge-v67{right:12px;bottom:12px;max-width:calc(100vw - 24px);border-radius:18px;flex-wrap:wrap;justify-content:flex-end}.ac-api-bridge-v67 a,.ac-api-bridge-v67 button{font-size:11px}}
</style>
<div id=""acApiBridgeV67"" class=""ac-api-bridge-v67"" aria-label=""AC Rule Workbench server actions"">
  <button id=""acApiRefreshV67"" type=""button"" title=""Regenerate this static viewer from the current FWD/CFD configuration on the server"">Refresh from FWD</button>
  <a id=""acApiStatusV67"" class=""status"" href=""/api/workbench/status"" target=""_blank"" rel=""noreferrer"" title=""View backend status and last refresh information"">Status</a>
</div>
<script id=""AC_API_BRIDGE_SCRIPT_V67"">
(function(){try{var root=document.getElementById('acApiBridgeV67');if(!root)return;var base=location.protocol==='file:'?'http://127.0.0.1:8787':location.origin.replace(/\/$/,'');var status=document.getElementById('acApiStatusV67');var refresh=document.getElementById('acApiRefreshV67');if(status)status.href=base+'/api/workbench/status';if(refresh){refresh.addEventListener('click',async function(){if(!confirm('Regenerate the AC Rule Workbench from the current FWD/CFD configuration on the server?'))return;var old=refresh.textContent;refresh.disabled=true;refresh.textContent='Refreshing...';try{var res=await fetch(base+'/api/workbench/refresh',{method:'POST',cache:'no-store'});var text=await res.text();var json=null;try{json=JSON.parse(text);}catch{}if(!res.ok||(json&&json.ok===false)){throw new Error((json&&(json.error||json.exceptionMessage||json.fix))||text||('HTTP '+res.status));}refresh.textContent='Refreshed';setTimeout(function(){location.reload();},650);}catch(e){alert('Refresh failed: '+(e&&e.message?e.message:e));refresh.textContent=old;refresh.disabled=false;}});}}catch(e){}}());
</script>
";

        int bodyClose = html.LastIndexOf("</body>", StringComparison.OrdinalIgnoreCase);
        if (bodyClose >= 0)
            return html.Insert(bodyClose, bridge);

        return html + bridge;
    }

    private static void WriteApiResult(HttpListenerResponse response, ApiHttpResult result, bool enableCors)
    {
        if (enableCors)
            AddCors(response);

        foreach (KeyValuePair<string, string> header in result.Headers)
        {
            if (!string.IsNullOrWhiteSpace(header.Key) && header.Value != null)
                response.Headers[header.Key] = header.Value;
        }

        string json = JsonConvert.SerializeObject(result.Body, Formatting.Indented, new JsonSerializerSettings { StringEscapeHandling = StringEscapeHandling.EscapeHtml });
        byte[] bytes = Encoding.UTF8.GetBytes(json);
        response.StatusCode = result.StatusCode;
        response.ContentType = string.IsNullOrWhiteSpace(result.ContentType) ? "application/json; charset=utf-8" : result.ContentType;
        response.ContentEncoding = Encoding.UTF8;
        response.ContentLength64 = bytes.Length;
        response.OutputStream.Write(bytes, 0, bytes.Length);
        response.Close();
    }

    private static void WriteJson(HttpListenerResponse response, object value, int statusCode, bool enableCors)
    {
        if (enableCors)
            AddCors(response);

        if (value is ApiRouteNotFoundException notFound)
        {
            statusCode = 404;
            value = new ApiError { Error = "Route not found.", ExceptionMessage = notFound.Route };
        }

        if (value is Exception ex)
        {
            statusCode = 500;
            value = new ApiError { Error = ex.Message, ExceptionType = ex.GetType().Name, ExceptionMessage = ex.Message };
        }

        string json = JsonConvert.SerializeObject(value, Formatting.Indented, new JsonSerializerSettings { StringEscapeHandling = StringEscapeHandling.EscapeHtml });
        byte[] bytes = Encoding.UTF8.GetBytes(json);
        response.StatusCode = statusCode;
        response.ContentType = "application/json; charset=utf-8";
        response.ContentEncoding = Encoding.UTF8;
        response.ContentLength64 = bytes.Length;
        response.OutputStream.Write(bytes, 0, bytes.Length);
        response.Close();
    }

    private static void WriteHtml(HttpListenerResponse response, string html, bool enableCors, int statusCode = 200)
    {
        if (enableCors)
            AddCors(response);

        byte[] bytes = Encoding.UTF8.GetBytes(html);
        response.StatusCode = statusCode;
        response.ContentType = "text/html; charset=utf-8";
        response.ContentEncoding = Encoding.UTF8;
        response.ContentLength64 = bytes.Length;
        response.OutputStream.Write(bytes, 0, bytes.Length);
        response.Close();
    }

    private static void AddCors(HttpListenerResponse response)
    {
        response.Headers["Access-Control-Allow-Origin"] = "*";
        response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
        response.Headers["Access-Control-Allow-Headers"] = "Content-Type";
        response.Headers["Cache-Control"] = "no-store";
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
        // LocalApiServer.cs compile errors around the old BuildHarnessHtml().
        string encodedDefaultPath = HtmlEncode(_options.DefaultFwdPath ?? string.Empty);

        string[] candidates =
        {
            Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ApiHarness", "api-harness.html"),
            Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "api-harness.html"),
            Path.Combine(Directory.GetCurrentDirectory(), "DllInteropHarness", "ApiHarness", "api-harness.html"),
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

    private static string BuildFallbackHarnessHtml(string encodedDefaultPath)
    {
        var html = new StringBuilder();
        html.AppendLine("<!doctype html>");
        html.AppendLine("<html lang=\"en\">");
        html.AppendLine("<head>");
        html.AppendLine("<meta charset=\"utf-8\">");
        html.AppendLine("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">");
        html.AppendLine("<title>FWD API Harness</title>");
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
        html.AppendLine("<h1>FWD API Harness</h1>");
        html.AppendLine("<p class=\"muted\">Fallback harness loaded. The full ApiHarness/api-harness.html asset was not found beside the executable.</p>");
        html.AppendLine("<label>FWD path</label>");
        html.Append("<input id=\"path\" value=\"");
        html.Append(encodedDefaultPath);
        html.AppendLine("\">");
        html.AppendLine("<button id=\"info\">GET /api/fwd/info</button> <button id=\"hier\">GET /api/fwd/hierarchy</button> <button id=\"diag\">GET /api/fwd/diagnostics</button>");
        html.AppendLine("<pre id=\"out\">Ready.</pre>");
        html.AppendLine("<script>");
        html.AppendLine("const $=id=>document.getElementById(id);");
        html.AppendLine("async function run(path){const u=new URL(path,location.origin);const p=$('path').value;if(p)u.searchParams.set('path',p);$('out').textContent='GET '+u+'\n\nLoading...';try{const r=await fetch(u);const t=await r.text();let body=t;try{body=JSON.stringify(JSON.parse(t),null,2)}catch{}$('out').textContent='HTTP '+r.status+' '+r.statusText+'\nGET '+u+'\n\n'+body}catch(e){$('out').textContent='REQUEST FAILED\n'+(e.stack||e.message||e)}}");
        html.AppendLine("$('info').onclick=()=>run('/api/fwd/info');$('hier').onclick=()=>run('/api/fwd/hierarchy');$('diag').onclick=()=>run('/api/fwd/diagnostics');");
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

    private sealed class ApiRouteNotFoundException : Exception
    {
        public ApiRouteNotFoundException(string route)
            : base("Route not found: " + route)
        {
            Route = route;
        }

        public string Route { get; }
    }
}
