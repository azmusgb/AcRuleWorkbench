using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using Newtonsoft.Json;
using DllInteropHarness.Api;
using DllInteropHarness.Api.V1.Contracts;
using DllInteropHarness.Core;

namespace DllInteropHarness.Api.V1;

internal sealed class WorkbenchApiService
{
    private readonly WorkbenchSnapshotCache _cache;
    private readonly LocalApiServerOptions _options;

    public WorkbenchApiService(IDllClient client, LocalApiServerOptions options)
    {
        _cache = new WorkbenchSnapshotCache(client ?? throw new ArgumentNullException(nameof(client)));
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
            if (tail == "snapshot/refresh") return Refresh(request);
            if (tail == "scopes") return RequireMethod(request, "GET") ?? Ok(request, "AcWorkbench.ScopeList", BuildScopeList(GetSnapshot(request), request));
            if (tail.StartsWith("scopes/", StringComparison.OrdinalIgnoreCase)) return DispatchScope(tail, request);
            if (tail.StartsWith("rules/", StringComparison.OrdinalIgnoreCase)) return DispatchRule(tail, request);
            if (tail == "diagnostics") return RequireMethod(request, "GET") ?? Ok(request, "AcWorkbench.Diagnostics", BuildGlobalDiagnostics(GetSnapshot(request)));
            if (tail == "search") return RequireMethod(request, "GET") ?? Ok(request, "AcWorkbench.Search", BuildSearch(GetSnapshot(request), request));
            if (tail == "export") return Export(request);

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
        catch (DllInteropException ex)
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
        return _cache.GetOrBuild(GetFwdPath(request), GetProcess(request), GetBool(request, "requireNativeOk", false));
    }

    private string GetFwdPath(HttpListenerRequest request)
    {
        string? path = Get(request, "path") ?? _options.DefaultFwdPath;
        if (string.IsNullOrWhiteSpace(path))
            throw new ApiV1Exception("FwdPathRequired", "A FWD/CFD path is required.", 400, "Pass --path when starting the API or provide ?path=... on the request.");
        return path!;
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
        string? header = request.Headers["X-Request-Id"];
        if (!string.IsNullOrWhiteSpace(header)) return header!;
        string? query = request.QueryString["requestId"];
        if (!string.IsNullOrWhiteSpace(query)) return query!;
        return ApiHttpResult.NewCorrelationId();
    }

    private object BuildHelp(HttpListenerRequest request)
    {
        return new
        {
            name = "AC Rule Workbench API v1",
            purpose = "Stable product API for scope, rule, evidence, relationship, search, diagnostics, and export workflows.",
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
                snapshotCache = true,
                structuralTree = true,
                flatInventory = true,
                relationshipExtraction = true,
                diagnostics = true,
                evidencePackets = true,
                globalSearch = true,
                jsonExport = true,
                csvExport = false,
                htmlExport = false,
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
            }
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
        string? path = Get(request, "path") ?? _options.DefaultFwdPath;
        bool pathConfigured = !string.IsNullOrWhiteSpace(path);
        bool pathExists = pathConfigured && File.Exists(path!);
        WorkbenchSnapshot? snapshot = _cache.Current;
        bool ready = pathConfigured && pathExists && snapshot != null;
        return Ok(request, "AcWorkbench.Readiness", new
        {
            ready,
            source = new { path, configured = pathConfigured, exists = pathExists },
            snapshot = snapshot == null ? null : new { snapshot.SnapshotId, snapshot.GeneratedAtUtc, snapshot.BuildDurationMs },
            resolution = ready ? null : "Call GET /api/v1/snapshot to build the cache, verify the FWD path, or restart the server with --path."
        }, ready ? 200 : 503);
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
        string? path = Get(request, "path") ?? _options.DefaultFwdPath;
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
                snapshotId = (string?)null,
                generatedAtUtc = (DateTime?)null,
                buildDurationMs = (long?)null
            } : new
            {
                loaded = true,
                snapshotId = snapshot.SnapshotId,
                generatedAtUtc = (DateTime?)snapshot.GeneratedAtUtc,
                buildDurationMs = (long?)snapshot.BuildDurationMs
            },
            capabilities = new
            {
                snapshotCache = true,
                refresh = _options.AllowMutatingCommands,
                scopes = true,
                structure = true,
                inventory = true,
                references = true,
                diagnostics = true,
                search = true,
                export = true,
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
                flow = "Flow projections are experimental / low-confidence and are not native runtime execution proof."
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

        if (string.IsNullOrWhiteSpace(action)) return Ok(request, "AcWorkbench.ScopeDetail", BuildScopeDetail(snapshot, scope));
        if (action == "structure") return Ok(request, "AcWorkbench.ScopeStructure", BuildScopeStructure(scope));
        if (action == "inventory") return Ok(request, "AcWorkbench.ScopeInventory", BuildScopeInventory(snapshot, scope, request));
        if (action == "references") return Ok(request, "AcWorkbench.ScopeReferences", BuildScopeReferences(scope, request));
        if (action == "diagnostics") return Ok(request, "AcWorkbench.ScopeDiagnostics", BuildScopeDiagnostics(snapshot, scope));

        return Fail(request, "RouteNotFound", "Scope route was not found.", 404, "/api/v1/" + tail);
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
                disabled = "Structural disabled state is authoritative. Enabled is the default and is not badged. Direct/inherited disabled states are exceptions.",
                flow = "ac-flow output is experimental / low-confidence. Use it for triage only, not proof."
            },
            links = ScopeLinks(scope.ScopeId)
        };
    }

    private object BuildScopeStructure(ScopeModel scope)
    {
        return new
        {
            scopeId = scope.ScopeId,
            evidenceClass = "Structural",
            rootNodeIds = scope.StructuralNodes.Where(n => n.ParentNodeId <= 0 || !scope.StructuralNodes.Any(p => p.NodeId == n.ParentNodeId)).Select(RuleCorrelation.NodeId).ToList(),
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
                AcTreeEdge? incoming = scope.StructuralEdges.FirstOrDefault(e => e.ToNodeId == n.NodeId);
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
                    outgoingActions = OutgoingActions(scope, n).ToList(),
                    childCount = scope.StructuralEdges.Count(e => e.FromNodeId == n.NodeId),
                    hasWarnings = scope.TreeDiagnostics.Any(d => d.NodeId == n.NodeId)
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

        List<InventoryRowDto> materialized = rows.Select(r => InventoryRow(snapshot, r)).ToList();
        if (!string.IsNullOrWhiteSpace(classification))
            materialized = materialized.Where(x => RuleCorrelation.Eq(x.Classification, classification)).ToList();

        return new
        {
            scopeId = scope.ScopeId,
            evidenceClass = "FlatInventory",
            summary = new
            {
                total = scope.FlatInventoryCount,
                structuralMatch = materialized.Count(x => RuleCorrelation.Eq(x.Classification, "StructuralMatch")),
                flatOnly = materialized.Count(x => RuleCorrelation.Eq(x.Classification, "FlatOnly")),
                duplicateFlat = 0,
                unresolved = 0,
                caveat = "Inventory rows are searchable extraction evidence, not structural order proof unless classification is StructuralMatch."
            },
            page = new { limit, offset, nextOffset = offset + limit < materialized.Count ? (int?)(offset + limit) : null },
            items = materialized.Skip(offset).Take(limit).ToList()
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

        if (scope.FlatOnlyCount > 0)
        {
            checks.Add(Diagnostic("FlatOnlyRows", "Info", scope.FlatOnlyCount + " flat inventory rows do not match structural nodes.", "These rows are not runtime-order evidence.", "Open inventory with classification=FlatOnly."));
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

        if (!snapshot.RulesByNodeId.TryGetValue(nodeId, out RuleModel? rule))
            return Fail(request, "RuleNotFound", "Rule was not found.", 404, nodeId);

        if (string.IsNullOrWhiteSpace(action)) return Ok(request, "AcWorkbench.RuleDetail", BuildRuleDetail(snapshot, rule));
        if (action == "subtree") return Ok(request, "AcWorkbench.RuleSubtree", BuildRuleSubtree(snapshot, rule, request));

        return Fail(request, "RouteNotFound", "Rule route was not found.", 404, "/api/v1/" + tail);
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
        var items = new List<object>();

        if (string.IsNullOrWhiteSpace(q))
            return new { query = q, count = 0, items, warning = "Pass ?q=..." };

        bool all = string.IsNullOrWhiteSpace(kind);
        IEnumerable<ScopeModel> scopes = snapshot.ScopesById.Values;
        if (!string.IsNullOrWhiteSpace(scopeId)) scopes = scopes.Where(s => RuleCorrelation.Eq(s.ScopeId, scopeId));

        if (all || RuleCorrelation.Eq(kind, "Scope"))
        {
            items.AddRange(scopes.Where(s => RuleCorrelation.Contains(s.Name, q) || RuleCorrelation.Contains(s.ScopeId, q)).Select(s => new
            {
                kind = "Scope",
                s.ScopeId,
                title = s.Name,
                subtitle = s.Kind + " · " + s.StructuralRuleCount + " structural rules",
                badges = BadgesForScope(s),
                evidenceClass = "ScopeSummary",
                isRuntimeDependency = false,
                link = "/api/v1/scopes/" + UrlEncode(s.ScopeId)
            }));
        }

        if (all || RuleCorrelation.Eq(kind, "StructuralRule"))
        {
            items.AddRange(scopes.SelectMany(s => s.StructuralNodes.Where(n => n.IsRuleNode).Select(n => new { s, n }))
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
                }));
        }

        if (all || RuleCorrelation.Eq(kind, "FlatInventory"))
        {
            items.AddRange(scopes.SelectMany(s => s.FlatRules.Select(r => new { s, r }))
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
                }));
        }

        if (all || RuleCorrelation.Eq(kind, "Reference"))
        {
            items.AddRange(scopes.SelectMany(s => s.Relationships.Select(r => new { s, r }))
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
                }));
        }

        return new { query = q, kind, scopeId, count = items.Count, items = items.Take(limit).ToList() };
    }

    private ApiHttpResult Export(HttpListenerRequest request)
    {
        if (!string.Equals(request.HttpMethod, "POST", StringComparison.OrdinalIgnoreCase))
            return Fail(request, "MethodNotAllowed", "Export requires POST.", 405, "Use POST /api/v1/export. The body may be empty for the default JSON summary export.");

        WorkbenchSnapshot snapshot = GetSnapshot(request);
        ExportRequestDto body = ReadExportRequest(request);
        string? scopeId = Get(request, "scopeId") ?? body.ScopeId;
        string? nodeId = Get(request, "nodeId") ?? body.NodeId;
        string format = (Get(request, "format") ?? body.Format ?? "json").ToLowerInvariant();
        string view = (Get(request, "view") ?? body.View ?? "snapshot").ToLowerInvariant();

        if (format != "json")
            return Fail(request, "UnsupportedExportFormat", "Only JSON export is implemented in this v1 contract.", 400, "Requested format: " + format);

        object payload;
        if (!string.IsNullOrWhiteSpace(nodeId))
        {
            if (!snapshot.RulesByNodeId.TryGetValue(nodeId!, out RuleModel? rule))
                return Fail(request, "RuleNotFound", "Rule was not found.", 404, nodeId);

            payload = view == "subtree" ? BuildRuleSubtree(snapshot, rule, request) : BuildRuleDetail(snapshot, rule);
        }
        else if (!string.IsNullOrWhiteSpace(scopeId))
        {
            if (!snapshot.ScopesById.TryGetValue(scopeId!, out ScopeModel? scope))
                return Fail(request, "ScopeNotFound", "Scope was not found.", 404, scopeId);

            if (view == "structure") payload = BuildScopeStructure(scope);
            else if (view == "inventory") payload = BuildScopeInventory(snapshot, scope, request);
            else if (view == "references") payload = BuildScopeReferences(scope, request);
            else if (view == "diagnostics") payload = BuildScopeDiagnostics(snapshot, scope);
            else payload = BuildScopeDetail(snapshot, scope);
        }
        else
        {
            payload = view == "diagnostics" ? BuildGlobalDiagnostics(snapshot) : BuildSnapshotResponse(snapshot);
        }

        return Ok(request, "AcWorkbench.Export", new
        {
            format,
            view,
            scopeId,
            nodeId,
            body.IncludeEvidence,
            filters = body.Filters,
            columns = body.Columns,
            exportedAtUtc = DateTime.UtcNow,
            provenance = new { snapshot.SnapshotId, snapshot.GeneratedAtUtc, snapshot.FwdPath, apiVersion = ApiV1Routes.ApiVersion },
            payload
        });
    }

    private static ExportRequestDto ReadExportRequest(HttpListenerRequest request)
    {
        if (request == null || !request.HasEntityBody)
            return new ExportRequestDto();

        try
        {
            Encoding encoding = request.ContentEncoding ?? Encoding.UTF8;
            using (var reader = new StreamReader(request.InputStream, encoding))
            {
                string text = reader.ReadToEnd();
                if (string.IsNullOrWhiteSpace(text))
                    return new ExportRequestDto();

                ExportRequestDto? dto = JsonConvert.DeserializeObject<ExportRequestDto>(text);
                if (dto == null) return new ExportRequestDto();
                if (dto.Filters == null) dto.Filters = new Dictionary<string, string>();
                if (dto.Columns == null) dto.Columns = new List<string>();
                return dto;
            }
        }
        catch (JsonException ex)
        {
            throw new ApiBadRequestException("InvalidJsonBody", "Request body must be valid JSON.", ex.Message);
        }
    }

    private static object ScopeCounts(ScopeModel scope)
    {
        return new
        {
            structuralRules = scope.StructuralRuleCount,
            flatInventoryRows = scope.FlatInventoryCount,
            flatOnlyRows = scope.FlatOnlyCount,
            directDisabled = scope.DirectDisabledCount,
            inheritedDisabled = scope.InheritedDisabledCount,
            references = scope.ReferenceCount,
            diagnostics = scope.DiagnosticCount
        };
    }

    private static object HealthFor(ScopeModel scope)
    {
        string status = scope.DiagnosticCount > 0 || scope.FlatOnlyCount > Math.Max(25, scope.StructuralRuleCount / 4) ? "Warning" : "Ok";
        return new
        {
            status,
            diagnosticCount = scope.DiagnosticCount,
            reasons = scope.DiagnosticCount > 0
                ? scope.TreeDiagnostics.Select(d => (object)new { code = d.Category, severity = d.Severity }).Take(10).ToList()
                : new List<object>()
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

    private static IEnumerable<object> OutgoingActions(ScopeModel scope, AcTreeNode node)
    {
        var groups = scope.StructuralEdges
            .Where(e => e.FromNodeId == node.NodeId)
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
