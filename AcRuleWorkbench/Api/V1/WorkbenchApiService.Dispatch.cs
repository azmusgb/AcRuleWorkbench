using System;
using System.Net;
using AcRuleWorkbench.Api;
using AcRuleWorkbench.Core;

namespace AcRuleWorkbench.Api.V1;

internal sealed partial class WorkbenchApiService
{
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
            if (tail.StartsWith("rules/by-key/", StringComparison.OrdinalIgnoreCase)) return DispatchRule("rules/" + tail.Substring("rules/by-key/".Length), request);
            if (tail.StartsWith("rules/by-node/", StringComparison.OrdinalIgnoreCase)) return DispatchRule("rules/" + tail.Substring("rules/by-node/".Length), request);
            if (tail.StartsWith("rules/", StringComparison.OrdinalIgnoreCase)) return DispatchRule(tail, request);
            if (tail == "rule-lists") return DispatchRuleLists(tail, request);
            if (tail.StartsWith("rule-lists/by-key/", StringComparison.OrdinalIgnoreCase)) return DispatchRuleLists("rule-lists/" + tail.Substring("rule-lists/by-key/".Length), request);
            if (tail.StartsWith("rule-lists/by-scope/", StringComparison.OrdinalIgnoreCase)) return DispatchRuleLists("rule-lists/" + tail.Substring("rule-lists/by-scope/".Length), request);
            if (tail.StartsWith("rule-lists/", StringComparison.OrdinalIgnoreCase)) return DispatchRuleLists(tail, request);

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

}
