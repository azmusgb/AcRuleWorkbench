using System.Collections.Generic;

namespace AcRuleWorkbench.Api.V1;

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
        new ApiRouteDescriptor("GET", "/api/v1/snapshot/warmup", "Trigger a background snapshot build and return immediately; idempotent."),
        new ApiRouteDescriptor("POST", "/api/v1/snapshot/refresh", "Rebuild cached snapshot when refresh is enabled."),
        new ApiRouteDescriptor("GET", "/api/v1/scopes", "List rule scopes."),
        new ApiRouteDescriptor("GET", "/api/v1/scopes/{scopeId}", "Deep scope summary. Use include=structure,inventory,references,diagnostics for expanded sections."),
        new ApiRouteDescriptor("GET", "/api/v1/scopes/{scopeId}/structure", "Compatibility alias for structural rule tree for a scope."),
        new ApiRouteDescriptor("GET", "/api/v1/scopes/{scopeId}/inventory", "Compatibility alias for flat inventory rows for a scope."),
        new ApiRouteDescriptor("GET", "/api/v1/scopes/{scopeId}/references", "Compatibility alias for evidence-coded static references for a scope."),
        new ApiRouteDescriptor("GET", "/api/v1/scopes/{scopeId}/diagnostics", "Compatibility alias for actionable diagnostics for a scope."),
        new ApiRouteDescriptor("GET", "/api/v1/rules/{nodeId}", "Deep rule evidence packet. Accepts node ids and RuleGuid values. Use include=subtree,references,diagnostics for expanded sections."),
        new ApiRouteDescriptor("GET", "/api/v1/rules/{nodeId}/subtree", "Compatibility alias for selected rule and descendants. Accepts node ids and RuleGuid values."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd", "Canonical FWD overview (documents/pages/batches/processes/resources/variants/fields counts)."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/overview", "Canonical FWD overview alias."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/documents", "Canonical FWD documents."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/pages", "Canonical FWD pages with variant links."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/page-variants", "Canonical FWD page variants. Supports ?page=..."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/fields", "Canonical FWD fields. Supports ?scopeType=...&scopeName=..."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/batches", "Canonical FWD batches."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/processes", "Canonical FWD processes."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/processes/{process}", "Canonical FWD process summary with private-config availability and role classification."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/processes/{process}/private", "Process private STC tree summary."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/processes/drivers", "Heuristic process-private input/output driver-like findings (separate from process inventory)."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/resources", "Canonical FWD resources grouped by type. Supports ?type=..., ?includeDetails=true, ?includePrivate=true."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/tables", "Canonical table resources with usage-derived field evidence; parsed schema columns are emitted separately when available. Supports ?q=..."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/tables/inferred", "Relationship-derived table candidates with usage-derived field evidence. Supports ?q=..."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/udfs", "Function resource/UDF candidates with caller-side usage evidence. Supports ?q=..."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/udfs/{name}", "Function/UDF candidate detail split into definition-like fields and usage evidence."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/udfs/inferred", "Regex-only inferred UDF candidates from function-name heuristics. Supports ?q=..."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/resource-dependencies", "Global resource used-by map projected from static relationship evidence."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/fip", "FIP variant inspection summary. Supports ?page=...&variant=..."),
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
