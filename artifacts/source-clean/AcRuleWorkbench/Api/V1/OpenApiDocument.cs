using System;
using System.Collections.Generic;
using System.Linq;

namespace AcRuleWorkbench.Api.V1;

internal static class OpenApiDocument
{
    public static object Build(string serverUrl)
    {
        string url = string.IsNullOrWhiteSpace(serverUrl) ? "http://127.0.0.1:8787" : serverUrl.TrimEnd('/');
        var paths = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

        foreach (ApiRouteDescriptor route in ApiV1Routes.All.Where(r => r.Path.StartsWith(ApiV1Routes.BasePath + "/", StringComparison.OrdinalIgnoreCase) || r.Path == ApiV1Routes.BasePath))
        {
            string openApiPath = route.Path.Substring(ApiV1Routes.BasePath.Length);
            if (string.IsNullOrWhiteSpace(openApiPath)) openApiPath = "/";

            if (!paths.TryGetValue(openApiPath, out object? existing))
            {
                existing = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
                paths[openApiPath] = existing;
            }

            var methods = (Dictionary<string, object>)existing;
            methods[route.Method.ToLowerInvariant()] = Operation(route);
        }

        return new
        {
            openapi = "3.0.3",
            info = new
            {
                title = "FW Editor Viewer API",
                version = ApiV1Routes.ApiVersion,
                description = "Read-only FormWorks/DCM AutoCapture configuration API. The API exposes static FWD configuration only; it does not execute AC rules or write to FWD configuration."
            },
            servers = new[] { new { url, description = "Local FW Editor Viewer server" } },
            tags = new[]
            {
                new { name = "system", description = "Server status, capabilities, health, and OpenAPI." },
                new { name = "snapshot", description = "Cached normalized extraction snapshot." },
                new { name = "scopes", description = "Scope-centered rule inspection." },
                new { name = "rules", description = "Rule-centered configuration packets." },
                new { name = "fwd", description = "FWD inventory and global definitions." },
                new { name = "search", description = "FWD-aware search." },
                new { name = "messages", description = "Parser and snapshot messages." }
            },
            paths,
            components = new
            {
                schemas = new Dictionary<string, object>
                {
                    ["ApiEnvelope"] = new { type = "object", required = new[] { "ok", "schema", "schemaVersion", "apiVersion", "requestId", "data" } },
                    ["ApiErrorEnvelope"] = new { type = "object", required = new[] { "ok", "apiVersion", "requestId", "error" } },
                    ["ApiError"] = new { type = "object", required = new[] { "code", "message", "correlationId" } },
                    ["DisabledState"] = new { type = "string", @enum = new[] { "Enabled", "DisabledDirect", "DisabledInherited", "PossiblyDisabledInherited", "PossiblyDisabledSequenceOnly", "Unknown" } },
                    ["RelationshipKind"] = new { type = "string", @enum = new[] { "UsesField", "MutatesField", "RejectsField", "EmitsRejectMessage", "UsesRejectCode", "UsesSource", "UsesOption", "UsesParameter", "WritesAttribute", "ReadsAttribute", "MentionsToken", "PossiblyDisabledInheritedFrom" } },
                    ["RouteState"] = new { type = "string", @enum = new[] { "Root", "Resolved", "Unresolved", "IndexOnly" } },
                    ["ModelClass"] = new { type = "string", @enum = new[] { "Structural", "FlatInventory", "FlatInventory+Structural", "FlatInventoryCheck", "Relationship", "Message" } },
                    ["CorrelationStatus"] = new { type = "string", @enum = new[] { "Exact", "UniqueGuid", "AmbiguousExact", "AmbiguousGuid", "UniqueNameFunction", "AmbiguousNameFunction", "None" } }
                }
            }
        };
    }

    private static object Operation(ApiRouteDescriptor route)
    {
        return new Dictionary<string, object>
        {
            ["operationId"] = OperationId(route),
            ["summary"] = route.Description,
            ["tags"] = new[] { TagFor(route.Path) },
            ["parameters"] = ParametersFor(route.Path),
            ["responses"] = new Dictionary<string, object>
            {
                ["200"] = new { description = "Successful response", content = JsonContent("ApiEnvelope", route.Path) },
                ["400"] = new { description = "Invalid request", content = JsonContent("ApiErrorEnvelope") },
                ["404"] = new { description = "Resource not found", content = JsonContent("ApiErrorEnvelope") },
                ["405"] = new { description = "Method not allowed", content = JsonContent("ApiErrorEnvelope") },
                ["409"] = new { description = "Conflict", content = JsonContent("ApiErrorEnvelope") },
                ["500"] = new { description = "Server failure", content = JsonContent("ApiErrorEnvelope") }
            }
        };
    }

    private static object JsonContent(string schemaName, string? path = null)
    {
        return new Dictionary<string, object>
        {
            ["application/json"] = new
            {
                schema = new Dictionary<string, string> { ["$ref"] = "#/components/schemas/" + schemaName },
                examples = ExampleFor(path)
            }
        };
    }

    private static Dictionary<string, object>? ExampleFor(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return null;

        if (path.EndsWith("/rules/{nodeId}", StringComparison.OrdinalIgnoreCase))
        {
            return new Dictionary<string, object>
            {
                ["ruleDetail"] = new
                {
                    summary = "Rule detail configuration packet",
                    value = new
                    {
                        ok = true,
                        schema = "AcWorkbench.RuleDetail",
                        data = new
                        {
                            identity = new { nodeId = "node-000419", name = "First page?", functionName = "CheckPageNum", scopeId = "AC/Pages/DentalADA" },
                            disabled = new { state = "Enabled", authority = "Structural" },
                            notProven = new[] { "Native runtime execution was not simulated." }
                        }
                    }
                }
            };
        }

        if (path.EndsWith("/scopes/{scopeId}/structure", StringComparison.OrdinalIgnoreCase))
        {
            return new Dictionary<string, object>
            {
                ["scopeStructure"] = new
                {
                    summary = "Scope structural tree with route labels",
                    value = new { ok = true, schema = "AcWorkbench.ScopeStructure", data = new { scopeId = "AC/Pages/DentalADA", ruleCount = 128 } }
                }
            };
        }

        return null;
    }

    private static object ParametersFor(string path)
    {
        var parameters = new List<object>();

        if (path.Contains("{scopeId}"))
            parameters.Add(PathParameter("scopeId", "Scope id returned by /api/v1/scopes."));

        if (path.Contains("{nodeId}"))
            parameters.Add(PathParameter("nodeId", "Node id, RuleGuid, RuleID, or stable rule token."));

        if (path.Contains("{process}"))
            parameters.Add(PathParameter("process", "Process name such as AC, FIP, Store, OCR, or DV."));

        if (path.Contains("{name}"))
            parameters.Add(PathParameter("name", "Resource, function, table, or UDF name."));

        if (path.EndsWith("/scopes", StringComparison.OrdinalIgnoreCase))
        {
            parameters.Add(QueryParameter("kind", "Filter scopes by Page, Document, Batch, Process, or Other."));
            parameters.Add(QueryParameter("q", "Text filter for scope names and ids."));
            parameters.Add(QueryParameter("includeEmpty", "Include scopes without structural or flat inventory data."));
        }

        if (path.Contains("/search"))
        {
            parameters.Add(QueryParameter("q", "Search query. Operators include function:, field:, action:, route:, scope:, guid:, disabled:, flatonly:, message:."));
            parameters.Add(QueryParameter("kind", "Optional result kind filter such as rule, scope, field, resource, message, or reference."));
            parameters.Add(QueryParameter("limit", "Maximum result count."));
        }

        if (path.EndsWith("/fwd/functions", StringComparison.OrdinalIgnoreCase))
        {
            parameters.Add(QueryParameter("q", "Filter function name, category, status result, parameter, behavior, or description."));
            parameters.Add(QueryParameter("includeUnobserved", "When false, omit catalog-only functions not observed in the current snapshot."));
        }

        if (path.EndsWith("/editor-model", StringComparison.OrdinalIgnoreCase))
            parameters.Add(QueryParameter("include", "Optional sections: objectGraph, ruleLists, udfs, selectionLists, runtimeImpacts."));

        if (path.EndsWith("/fwd/object-graph", StringComparison.OrdinalIgnoreCase))
        {
            parameters.Add(QueryParameter("kind", "Optional object kind filter such as Document, Page, Field, Resource, Process, or RuleList."));
            parameters.Add(QueryParameter("q", "Text filter for object ids and names."));
        }

        if (path.EndsWith("/fwd/runtime-impact", StringComparison.OrdinalIgnoreCase))
        {
            parameters.Add(QueryParameter("type", "Optional impact type such as FieldMutation, OperatorRepair, SelectionListLookup, UdfCall, or RuleFlow."));
            parameters.Add(QueryParameter("scopeId", "Optional Rule List scope id."));
            parameters.Add(QueryParameter("q", "Text filter for summary, function, or rule name."));
        }

        return parameters.ToArray();
    }

    private static object PathParameter(string name, string description)
    {
        return new { name, @in = "path", required = true, description, schema = new { type = "string" } };
    }

    private static object QueryParameter(string name, string description)
    {
        return new { name, @in = "query", required = false, description, schema = new { type = "string" } };
    }

    private static string OperationId(ApiRouteDescriptor route)
    {
        string normalized = route.Path.Replace(ApiV1Routes.BasePath, string.Empty)
            .Replace("{", string.Empty)
            .Replace("}", string.Empty)
            .Replace("/", " ")
            .Replace("-", " ")
            .Replace(".", " ")
            .Trim();

        string words = string.Join(string.Empty, normalized.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries).Select(ToPascal));
        if (string.IsNullOrWhiteSpace(words)) words = "Root";
        return route.Method.ToUpperInvariant() + words;
    }

    private static string ToPascal(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;
        return char.ToUpperInvariant(value[0]) + (value.Length > 1 ? value.Substring(1) : string.Empty);
    }

    private static string TagFor(string path)
    {
        if (path.Contains("/health") || path.EndsWith("/routes") || path.EndsWith("/capabilities") || path.EndsWith("/openapi.json") || path.EndsWith("/status")) return "system";
        if (path.Contains("/snapshot")) return "snapshot";
        if (path.Contains("/scopes")) return "scopes";
        if (path.Contains("/rules") || path.Contains("/rule-lists")) return "rules";
        if (path.Contains("/fwd")) return "fwd";
        if (path.Contains("/diagnostics")) return "messages";
        if (path.Contains("/search")) return "search";
        return "system";
    }
}
