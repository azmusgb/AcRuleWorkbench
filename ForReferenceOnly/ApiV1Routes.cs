using System.Collections.Generic;

namespace DllInteropHarness.Api.V1;

internal static class ApiV1Routes
{
    public const string ApiVersion = "1.0.0";
    public const string SchemaVersion = "1.0.0";
    public const string BasePath = "/api/v1";

    public static IReadOnlyList<ApiRouteDescriptor> All { get; } = new List<ApiRouteDescriptor>
    {
        new ApiRouteDescriptor("GET", "/api/v1", "API help and route summary."),
        new ApiRouteDescriptor("GET", "/api/v1/help", "API help and route summary."),
        new ApiRouteDescriptor("GET", "/api/v1/openapi.json", "OpenAPI 3.0 contract."),
        new ApiRouteDescriptor("GET", "/api/v1/routes", "Machine-readable route catalog."),
        new ApiRouteDescriptor("GET", "/api/v1/capabilities", "Server capabilities and feature flags."),
        new ApiRouteDescriptor("GET", "/api/v1/health/live", "Cheap process liveness check."),
        new ApiRouteDescriptor("GET", "/api/v1/health/ready", "Readiness check for FWD path and snapshot availability."),
        new ApiRouteDescriptor("GET", "/api/v1/status", "Combined server/source/snapshot status."),
        new ApiRouteDescriptor("GET", "/api/v1/snapshot", "Current normalized snapshot summary."),
        new ApiRouteDescriptor("POST", "/api/v1/snapshot/refresh", "Rebuild cached snapshot when refresh is enabled."),
        new ApiRouteDescriptor("GET", "/api/v1/scopes", "List rule scopes."),
        new ApiRouteDescriptor("GET", "/api/v1/scopes/{scopeId}", "Deep scope summary."),
        new ApiRouteDescriptor("GET", "/api/v1/scopes/{scopeId}/structure", "Structural rule tree for a scope."),
        new ApiRouteDescriptor("GET", "/api/v1/scopes/{scopeId}/inventory", "Flat inventory rows for a scope."),
        new ApiRouteDescriptor("GET", "/api/v1/scopes/{scopeId}/references", "Evidence-coded static references for a scope."),
        new ApiRouteDescriptor("GET", "/api/v1/scopes/{scopeId}/diagnostics", "Actionable diagnostics for a scope."),
        new ApiRouteDescriptor("GET", "/api/v1/rules/{nodeId}", "Deep rule evidence packet."),
        new ApiRouteDescriptor("GET", "/api/v1/rules/{nodeId}/subtree", "Selected rule and descendants."),
        new ApiRouteDescriptor("GET", "/api/v1/diagnostics", "Global diagnostics summary."),
        new ApiRouteDescriptor("GET", "/api/v1/search", "Evidence-aware global search."),
        new ApiRouteDescriptor("POST", "/api/v1/export", "Export a product-safe analytical slice.")
    };
}

internal sealed class ApiRouteDescriptor
{
    public ApiRouteDescriptor(string method, string path, string description)
    {
        Method = method;
        Path = path;
        Description = description;
    }

    public string Method { get; }
    public string Path { get; }
    public string Description { get; }
}
