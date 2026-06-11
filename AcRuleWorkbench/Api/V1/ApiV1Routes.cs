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
        new ApiRouteDescriptor("GET", "/api/v1/health/ready", "Readiness check for FWD path, live-lazy read session, and optional deep snapshot availability."),
        new ApiRouteDescriptor("GET", "/api/v1/status", "Combined server/source/snapshot status."),
        new ApiRouteDescriptor("GET", "/api/v1/viewer/bootstrap", "Lightweight live-lazy viewer bootstrap payload used when static sidecar JSON is absent or stale."),
        new ApiRouteDescriptor("GET", "/api/v1/snapshot", "Current normalized snapshot summary."),
        new ApiRouteDescriptor("GET", "/api/v1/snapshot/warmup", "Trigger an optional background full snapshot build and return immediately; idempotent."),
        new ApiRouteDescriptor("POST", "/api/v1/snapshot/refresh", "Rebuild cached snapshot when refresh is enabled."),
        new ApiRouteDescriptor("GET", "/api/v1/editor-model", "Snapshot-level canonical FormWorks Editor parity model: object graph, rule lists, UDFs, SelectionLists, page designs, fields, and runtime impacts."),
        new ApiRouteDescriptor("GET", "/api/v1/scopes", "List rule scopes."),
        new ApiRouteDescriptor("GET", "/api/v1/scopes/{scopeId}", "Deep scope summary. Use include=structure,inventory,references,messages for expanded sections."),
        new ApiRouteDescriptor("GET", "/api/v1/scopes/{scopeId}/structure", "Compatibility alias for structural rule tree for a scope."),
        new ApiRouteDescriptor("GET", "/api/v1/scopes/{scopeId}/inventory", "Compatibility alias for flat inventory rows for a scope."),
        new ApiRouteDescriptor("GET", "/api/v1/scopes/{scopeId}/references", "Compatibility alias for static FWD references for a scope."),
        new ApiRouteDescriptor("GET", "/api/v1/scopes/{scopeId}/diagnostics", "Legacy compatibility route for snapshot messages for a scope."),
        new ApiRouteDescriptor("GET", "/api/v1/rules/by-node/{nodeId}", "Deep rule configuration packet. Accepts node ids and RuleGuid values. Use include=subtree,references,messages for expanded sections."),
        new ApiRouteDescriptor("GET", "/api/v1/rules/by-node/{nodeId}/editor-model", "Canonical FormWorks Editor-style selected-rule packet with Rule List, Status Result, Action List, Function, parameter, and evidence sections."),
        new ApiRouteDescriptor("GET", "/api/v1/rules/by-node/{nodeId}/subtree", "Selected rule and descendants. Accepts node ids and RuleGuid values."),
        new ApiRouteDescriptor("GET", "/api/v1/rules/by-key/{key}", "Phase-6 minimal rule hydration. Key format: rule:<scopeType>:<encodedScopeName>:AC:node:<nodeId>."),
        new ApiRouteDescriptor("GET", "/api/v1/rules/by-key/{key}/editor-model", "Phase-6 selected-rule packet by canonical rule key."),
        new ApiRouteDescriptor("GET", "/api/v1/rules/by-key/{key}/subtree", "Phase-6 selected rule and descendants by canonical rule key."),
        new ApiRouteDescriptor("GET", "/api/v1/rule-lists", "Snapshot-wide canonical Rule List and Rule Configuration projections."),
        new ApiRouteDescriptor("GET", "/api/v1/rule-lists/by-scope/{scopeId}", "Canonical Rule List projection for one scope."),
        new ApiRouteDescriptor("GET", "/api/v1/rule-lists/by-key/{key}", "Phase-6 minimal AC root rule-list hydration. Key format: ruleList:page:<name>:AC or ruleList:document:<name>:AC."),

        new ApiRouteDescriptor("GET", "/api/v1/fwd", "FWD overview (documents/pages/batches/processes/resources/variants/fields counts)."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/object-graph", "Canonical linked FWD object graph projection, including bounded resource-private nodes when available."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/overview", "FWD overview alias."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/documents", "FWD documents."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/pages", "FWD pages with variant links."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/page-designs", "Canonical page/variant/field design packets with geometry, field roles, rule references, and FIP inspection links."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/page-variants", "FWD page variants. Supports ?page=..."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/fields", "FWD fields with page-design context when available. Supports ?scopeType=...&scopeName=..."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/batches", "FWD batches."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/processes", "FWD processes. Lightweight by default; pass ?includePrivateSummary=true to probe private STC summaries."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/processes/{process}", "FWD process summary with private-config availability and role classification."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/processes/{process}/private", "Process private STC tree summary."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/processes/drivers", "Heuristic process-private input/output driver-like findings (separate from process inventory)."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/resources", "FWD resources grouped by type. Supports ?type=..., ?includeDetails=true, ?includePrivate=true."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/functions", "AC function catalog with curated semantics plus observed rule usage. Supports ?q=...&includeUnobserved=false."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/functions/{name}", "AC function detail with catalog metadata, configured status results, structured parameter schema, schema profile, relationships, and usage."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/tables", "FWD table resources with usage-derived field lists; parsed schema columns are emitted separately when available. Supports ?q=..."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/selection-lists", "Canonical SelectionList/table definitions with parsed resource-evidence fields/options, usage links, and runtime-impact caveats."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/tables/inferred", "Relationship-derived table candidates with usage-derived field lists. Supports ?q=..."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/udfs", "Function resource/UDF candidates with caller-side usage evidence. Supports ?q=..."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/udfs/canonical", "Canonical UDF definitions with promoted internal rule-list bodies, resource evidence, caller bindings, and status-result evidence where available."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/udfs/{name}", "Function/UDF candidate detail split into definition-like fields and usage."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/udfs/inferred", "Regex-only inferred UDF candidates from function-name heuristics. Supports ?q=..."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/runtime-impact", "Static runtime/operator-impact projection with function flags, statuses, parameters, relationships, and SelectionList options."),
        new ApiRouteDescriptor("GET", "/api/v1/fwd/fip", "FIP variant inspection summary. Supports ?page=...&variant=..."),
        new ApiRouteDescriptor("GET", "/api/v1/diagnostics", "Legacy compatibility route for global snapshot messages."),
        new ApiRouteDescriptor("GET", "/api/v1/search", "FWD-aware global search.")};
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
