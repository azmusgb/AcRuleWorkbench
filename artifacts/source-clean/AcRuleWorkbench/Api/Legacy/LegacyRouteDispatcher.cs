using System;
using System.Net;
using AcRuleWorkbench.Core;

namespace AcRuleWorkbench.Api.Legacy;

internal sealed class LegacyRouteDispatcher
{
    private readonly IFormWorksExtractionClient _client;
    private readonly WorkbenchApiServerOptions _options;
    private readonly Func<HttpListenerRequest, string> _getFwdPath;
    private readonly Func<HttpListenerRequest, string, string?> _get;
    private readonly Func<HttpListenerRequest, string, int, int> _getInt;
    private readonly Func<HttpListenerRequest, string, int?> _getNullableInt;
    private readonly Func<HttpListenerRequest, string, bool, bool> _getBool;
    private readonly Func<string, HttpListenerRequest, object> _dispatchSemanticFwd;
    private readonly Func<string, HttpListenerRequest, object> _dispatchDebugApi;
    private readonly Func<string, object> _buildDebugDisabledPayload;
    private readonly Func<object> _buildHelp;
    private readonly Func<string, bool> _isDebugRoute;

    public LegacyRouteDispatcher(
        IFormWorksExtractionClient client,
        WorkbenchApiServerOptions options,
        Func<HttpListenerRequest, string> getFwdPath,
        Func<HttpListenerRequest, string, string?> get,
        Func<HttpListenerRequest, string, int, int> getInt,
        Func<HttpListenerRequest, string, int?> getNullableInt,
        Func<HttpListenerRequest, string, bool, bool> getBool,
        Func<string, HttpListenerRequest, object> dispatchSemanticFwd,
        Func<string, HttpListenerRequest, object> dispatchDebugApi,
        Func<string, object> buildDebugDisabledPayload,
        Func<object> buildHelp,
        Func<string, bool> isDebugRoute)
    {
        _client = client ?? throw new ArgumentNullException(nameof(client));
        _options = options ?? throw new ArgumentNullException(nameof(options));
        _getFwdPath = getFwdPath ?? throw new ArgumentNullException(nameof(getFwdPath));
        _get = get ?? throw new ArgumentNullException(nameof(get));
        _getInt = getInt ?? throw new ArgumentNullException(nameof(getInt));
        _getNullableInt = getNullableInt ?? throw new ArgumentNullException(nameof(getNullableInt));
        _getBool = getBool ?? throw new ArgumentNullException(nameof(getBool));
        _dispatchSemanticFwd = dispatchSemanticFwd ?? throw new ArgumentNullException(nameof(dispatchSemanticFwd));
        _dispatchDebugApi = dispatchDebugApi ?? throw new ArgumentNullException(nameof(dispatchDebugApi));
        _buildDebugDisabledPayload = buildDebugDisabledPayload ?? throw new ArgumentNullException(nameof(buildDebugDisabledPayload));
        _buildHelp = buildHelp ?? throw new ArgumentNullException(nameof(buildHelp));
        _isDebugRoute = isDebugRoute ?? throw new ArgumentNullException(nameof(isDebugRoute));
    }

    public object Dispatch(string route, HttpListenerRequest request)
    {
        if (route == "api" || route == "api/help")
            return _buildHelp();

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
                return _buildDebugDisabledPayload(route);

            return _dispatchDebugApi(route, request);
        }

        if (route.StartsWith("api/fwd/", StringComparison.OrdinalIgnoreCase))
            return _dispatchSemanticFwd(route, request);

        if (_isDebugRoute(route) && !_options.EnableDebugApi)
            return _buildDebugDisabledPayload(route);

        if (route == "api/probe" || route == "api/doctor")
            return _client.Probe();

        if (route == "api/inspect")
        {
            return _client.Inspect(new FwdInspectionOptions
            {
                Path = _getFwdPath(request),
                IncludeFields = _getBool(request, "fields", false),
                RequireNativeOk = _getBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/stc-process")
        {
            return _client.InspectProcessTree(new StcTraversalOptions
            {
                Path = _getFwdPath(request),
                ProcessName = _get(request, "process") ?? "AC",
                MaxDepth = _getInt(request, "maxDepth", 5),
                MaxNodes = _getInt(request, "maxNodes", 1500),
                MaxPreviewBytes = _getInt(request, "maxPreviewBytes", 256),
                IncludeDataPreview = !_getBool(request, "noDataPreview", false),
                IncludeDotNodes = _getBool(request, "includeDotNodes", false),
                RequireNativeOk = _getBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/ac/rules")
        {
            return _client.InspectAcRules(new AcRuleOptions
            {
                Path = _getFwdPath(request),
                ProcessName = _get(request, "process") ?? "AC",
                Term = _get(request, "term"),
                Scope = _get(request, "scope"),
                Function = _get(request, "function"),
                IncludeRawTokens = _getBool(request, "includeRawTokens", false),
                MaxRawTokensPerScope = _getInt(request, "maxRawTokens", 250),
                MaxScopeCount = _getInt(request, "maxScopes", 0),
                RequireNativeOk = _getBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/ac/tree")
        {
            return _client.BuildAcTree(new AcTreeOptions
            {
                Path = _getFwdPath(request),
                ProcessName = _get(request, "process") ?? "AC",
                Term = _get(request, "term"),
                Scope = _get(request, "scope"),
                IncludeAttributes = _getBool(request, "includeAttributes", false),
                MaxAttributeValueLength = _getInt(request, "maxAttributeValueLength", 500),
                MaxHierarchyDepth = _getInt(request, "maxHierarchyDepth", 256),
                MaxNodeEntryCount = (uint)Math.Max(1, _getInt(request, "maxNodeEntryCount", 100000)),
                MaskSensitiveValues = !_getBool(request, "noMaskSensitive", false),
                RequireNativeOk = _getBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/ac/relationships" || route == "api/ac/trace")
        {
            return _client.TraceAcRelationships(new AcTraceOptions
            {
                Path = _getFwdPath(request),
                ProcessName = _get(request, "process") ?? "AC",
                Term = _get(request, "term"),
                Scope = _get(request, "scope"),
                Function = _get(request, "function"),
                Field = _get(request, "field"),
                Attr = _get(request, "attr"),
                RelationshipKind = _get(request, "kind"),
                IncludeRules = _getBool(request, "includeRules", false),
                MaxRelationships = _getInt(request, "maxRelationships", 0),
                RequireNativeOk = _getBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/ac/index")
        {
            return _client.BuildAcIndex(new AcRuleOptions
            {
                Path = _getFwdPath(request),
                ProcessName = _get(request, "process") ?? "AC",
                Term = _get(request, "term"),
                Scope = _get(request, "scope"),
                Function = _get(request, "function"),
                RequireNativeOk = _getBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/ac/disabled")
        {
            return _client.AnalyzeDisabledRules(new AcDisabledOptions
            {
                Path = _getFwdPath(request),
                ProcessName = _get(request, "process") ?? "AC",
                Term = _get(request, "term"),
                Scope = _get(request, "scope"),
                Function = _get(request, "function"),
                State = _get(request, "state"),
                IncludeRules = true,
                InheritDisabled = !_getBool(request, "noDisabledInherit", false),
                RequireNativeOk = _getBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/ac/diagnostics")
        {
            return _client.BuildAcDiagnostics(new AcRuleOptions
            {
                Path = _getFwdPath(request),
                ProcessName = _get(request, "process") ?? "AC",
                Term = _get(request, "term"),
                Scope = _get(request, "scope"),
                Function = _get(request, "function"),
                RequireNativeOk = _getBool(request, "requireNativeOk", false)
            });
        }
if (route == "api/fip")
        {
            return _client.InspectFip(new FipInspectionOptions
            {
                Path = _getFwdPath(request),
                ProcessName = _get(request, "process") ?? "FIP",
                Page = _get(request, "page"),
                Variant = _get(request, "variant"),
                MaxVariants = _getInt(request, "maxVariants", 50),
                RequireNativeOk = _getBool(request, "requireNativeOk", false)
            });
        }

        if (route == "api/ocr")
        {
            string? path = _get(request, "path");
            if (string.IsNullOrWhiteSpace(path))
                throw new FormWorksInteropException("The OCR endpoint requires query parameter 'path'.");

            return _client.InspectOcr(new OcrInspectionOptions
            {
                Path = path,
                RequireNativeOk = _getBool(request, "requireNativeOk", false)
            });
        }

        throw new ApiRouteNotFoundException(route);
    }
}
