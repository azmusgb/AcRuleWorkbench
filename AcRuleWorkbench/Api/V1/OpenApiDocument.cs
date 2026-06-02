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
                title = "AC Rule Workbench API",
                version = ApiV1Routes.ApiVersion,
                description = "Stable product API for FormWorks/DCM AutoCapture rule inspection. This contract is evidence-first, read-only by default, and separates structural order proof from flat inventory evidence."
            },
            servers = new[] { new { url, description = "Local AC Rule Workbench server" } },
            tags = new[]
            {
                new { name = "system", description = "Server status, capabilities, health, and OpenAPI." },
                new { name = "snapshot", description = "Cached normalized extraction snapshot." },
                new { name = "scopes", description = "Scope-centered rule inspection." },
                new { name = "rules", description = "Rule-centered evidence packets." },
                new { name = "search", description = "Evidence-aware search." },
                new { name = "export", description = "Product-safe export workflows." }
            },
            paths,
            components = new
            {
                schemas = new Dictionary<string, object>
                {
                    ["ApiEnvelope"] = new { type = "object", required = new[] { "ok", "schema", "schemaVersion", "apiVersion", "requestId", "data" } },
                    ["ApiErrorEnvelope"] = new { type = "object", required = new[] { "ok", "apiVersion", "requestId", "error" } },
                    ["ApiError"] = new { type = "object", required = new[] { "code", "message", "correlationId" } },
                    ["DisabledState"] = new { type = "string", description = "Structural disabled state is authoritative when a structural node is available. Flat inventory disabled values such as PossiblyDisabledInherited are audit-only and never override structure.", @enum = new[] { "Enabled", "DisabledDirect", "DisabledInherited", "PossiblyDisabledInherited", "PossiblyDisabledSequenceOnly", "Unknown" } },
                    ["Confidence"] = new { type = "string", description = "Evidence confidence. High/Medium/Low/Unknown plus correlation labels are product-safe confidence labels, not runtime certainty.", @enum = new[] { "Authoritative", "Strong", "High", "Medium", "Weak", "Low", "Unsafe", "Unknown", "None" } },
                    ["RelationshipKind"] = new { type = "string", description = "Common relationship kinds produced by static AC rule extraction.", @enum = new[] { "UsesField", "MutatesField", "RejectsField", "EmitsRejectMessage", "UsesRejectCode", "UsesSource", "UsesOption", "UsesParameter", "WritesAttribute", "ReadsAttribute", "MentionsToken", "PossiblyDisabledInheritedFrom" } },
                    ["RouteState"] = new { type = "string", description = "Route-label resolution status for structural edges.", @enum = new[] { "Root", "Resolved", "Unresolved", "IndexOnly" } },
                    ["EvidenceClass"] = new { type = "string", description = "Trust class for the returned evidence.", @enum = new[] { "Structural", "FlatInventory", "FlatInventory+Structural", "FlatInventoryAudit", "Relationship", "Diagnostic", "ExperimentalFlow" } },
                    ["CorrelationStatus"] = new { type = "string", description = "Flat-to-structural reconciliation status. Only Exact and UniqueGuid are accepted structural links; name/function and ambiguous matches are audit-only.", @enum = new[] { "Exact", "UniqueGuid", "AmbiguousExact", "AmbiguousGuid", "UniqueNameFunction", "AmbiguousNameFunction", "None" } },
                    ["ActionBranch"] = new { type = "object", description = "Selectable structural action branch. A branch is not a rule; it is a parent rule action-list entry that groups child rules.", required = new[] { "branchId", "parentNodeId", "actionListIndex", "routeState", "childCount" }, properties = new Dictionary<string, object> { ["branchId"] = new { type = "string", example = "AC/Pages/DentalADA|node-000416|action:0" }, ["parentNodeId"] = new { type = "string", example = "node-000416" }, ["actionListIndex"] = new { type = "integer", example = 0 }, ["actionName"] = new { type = "string", nullable = true, example = "No - Run normal rules" }, ["actionNameResolved"] = new { type = "boolean", example = true }, ["routeState"] = new Dictionary<string, string> { ["$ref"] = "#/components/schemas/RouteState" }, ["childCount"] = new { type = "integer", example = 32 } } },
                    ["ExportView"] = new { type = "string", description = "Product-safe export target. Rule, route, branch, subtree, diagnostics, scopePacket, and reviewerReport exports include provenance and not-proven caveats.", @enum = new[] { "auto", "rule", "route", "branch", "subtree", "structure", "diagnostics", "scopePacket", "snapshot", "reviewerReport" } },
                    ["SearchOperator"] = new { type = "string", description = "Supported evidence search operator names.", @enum = new[] { "function", "fn", "field", "target", "action", "route", "disabled", "scope", "guid", "flatonly", "diagnostic" } }
                }
            }
        };
    }

    private static object Operation(ApiRouteDescriptor route)
    {
        var operation = new Dictionary<string, object>
        {
            ["operationId"] = OperationId(route),
            ["summary"] = route.Description,
            ["tags"] = new[] { TagFor(route.Path) },
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

        if (route.Method == "POST" && route.Path.EndsWith("/export", StringComparison.OrdinalIgnoreCase))
            operation["requestBody"] = ExportRequestBody();

        return operation;
    }

    private static object ExportRequestBody()
    {
        return new
        {
            required = false,
            content = new Dictionary<string, object>
            {
                ["application/json"] = new
                {
                    schema = new
                    {
                        type = "object",
                        properties = new Dictionary<string, object>
                        {
                            ["scopeId"] = new { type = "string", example = "AC/Pages/DentalADA" },
                            ["nodeId"] = new { type = "string", example = "node-000419" },
                            ["view"] = new { type = "string", @enum = new[] { "auto", "rule", "route", "branch", "subtree", "structure", "diagnostics", "scopePacket", "snapshot", "reviewerReport" }, example = "rule" },
                            ["format"] = new { type = "string", @enum = new[] { "json" }, example = "json" },
                            ["includeEvidence"] = new { type = "boolean", example = true },
                            ["includeReferences"] = new { type = "boolean", example = true },
                            ["includeDiagnostics"] = new { type = "boolean", example = true },
                            ["includeRawAttributes"] = new { type = "boolean", example = false },
                            ["reportFormat"] = new { type = "string", @enum = new[] { "json", "markdown" }, example = "json" }
                        }
                    },
                    examples = new Dictionary<string, object>
                    {
                        ["selectedRuleEvidenceExport"] = new
                        {
                            summary = "Export selected rule evidence",
                            value = new { format = "json", view = "rule", nodeId = "node-000419", includeEvidence = true }
                        },
                        ["scopeStructureExport"] = new
                        {
                            summary = "Export scope structure",
                            value = new { format = "json", view = "structure", scopeId = "AC/Pages/DentalADA", includeEvidence = true }
                        },
                        ["selectedActionBranchExport"] = new
                        {
                            summary = "Export selected action branch subtree",
                            value = new { format = "json", view = "branch", scopeId = "AC/Pages/DentalADA", nodeId = "node-000416", includeEvidence = true, includeReferences = true, includeDiagnostics = true }
                        },
                        ["reviewerReportExport"] = new
                        {
                            summary = "Generate reviewer report data",
                            value = new { format = "json", view = "reviewerReport", scopeId = "AC/Pages/DentalADA", nodeId = "node-000419", includeEvidence = true, reportFormat = "markdown" }
                        }
                    }
                }
            }
        };
    }

    private static object JsonContent(string schemaName, string? path = null)
    {
        object content = new
        {
            schema = new Dictionary<string, string> { ["$ref"] = "#/components/schemas/" + schemaName },
            examples = ExampleFor(path)
        };

        return new Dictionary<string, object>
        {
            ["application/json"] = content
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
                    summary = "Rule detail evidence packet",
                    value = new
                    {
                        ok = true,
                        schema = "AcWorkbench.RuleDetail",
                        data = new
                        {
                            identity = new { nodeId = "node-000419", name = "First page?", functionName = "CheckPageNum", scopeId = "AC/Pages/DentalADA" },
                            position = new { depth = 8, parentNodeId = "node-000416", branch = new { label = "No", actionNameResolved = true }, routePath = new[] { "Run Rules or FIP Reject?", "Run normal Rules/Does RejectLetter attr exist?", "Is this DV/KE?", "Is this an EDI claim?" } },
                            disabled = new { state = "Enabled", authority = "Structural" },
                            reconciliation = new { structuralNode = true, flatInventoryMatch = true, runtimeOrderProof = true },
                            query = new { acceptedIdentifiers = new[] { "node-000419", "db5bf065-618b-44ca-8484-0d12384e7d1a" } },
                            notProven = new[] { "Native runtime execution was not simulated.", "ac-flow.json is experimental / low-confidence." }
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
                    value = new
                    {
                        ok = true,
                        schema = "AcWorkbench.ScopeStructure",
                        data = new
                        {
                            scopeId = "AC/Pages/DentalADA",
                            evidenceClass = "Structural",
                            summary = new { nodeCount = 4196, edgeCount = 4196, directDisabled = 128, inheritedDisabled = 1624 },
                            nodes = new[] { new { nodeId = "node-000419", name = "First page?", functionName = "CheckPageNum", incomingBranch = new { label = "No", actionNameResolved = true } } },
                            edges = new[] { new { fromNodeId = "node-000416", toNodeId = "node-000419", label = "No", actionNameResolved = true } }
                        }
                    }
                }
            };
        }

        if (path.EndsWith("/scopes/{scopeId}/inventory", StringComparison.OrdinalIgnoreCase))
        {
            return new Dictionary<string, object>
            {
                ["scopeInventory"] = new
                {
                    summary = "Flat inventory with structural disabled authority when matched",
                    value = new
                    {
                        ok = true,
                        schema = "AcWorkbench.ScopeInventory",
                        data = new
                        {
                            scopeId = "AC/Pages/DentalADA",
                            evidenceClass = "FlatInventory",
                            summary = new { total = 4863, structuralMatch = 4196, flatOnly = 512, unacceptedCorrelation = 155, ambiguousCorrelation = 42 },
                            items = new[] { new { inventoryId = "flat-000419", classification = "StructuralMatch", structuralNodeId = "node-000419", correlationStatus = "Exact", correlationConfidence = "Authoritative", disabled = new { state = "Enabled", authority = "Structural", flatInventory = new { state = "PossiblyDisabledInherited", authority = "FlatInventoryAudit" } } } }
                        }
                    }
                }
            };
        }

        if (path.EndsWith("/scopes/{scopeId}/diagnostics", StringComparison.OrdinalIgnoreCase))
        {
            return new Dictionary<string, object>
            {
                ["scopeDiagnostics"] = new
                {
                    summary = "Actionable scope diagnostics",
                    value = new
                    {
                        ok = true,
                        schema = "AcWorkbench.ScopeDiagnostics",
                        data = new
                        {
                            scopeId = "AC/Pages/DentalADA",
                            health = new { status = "Warning", diagnosticCount = 1 },
                            checks = new[] { new { code = "FlatOnlyRows", severity = "Info", impact = "Flat rows are not execution-order evidence.", recommendation = "Open inventory with classification=FlatOnly." } }
                        }
                    }
                }
            };
        }

        if (path.EndsWith("/scopes/{scopeId}/references", StringComparison.OrdinalIgnoreCase))
        {
            return new Dictionary<string, object>
            {
                ["scopeReferences"] = new
                {
                    summary = "Confidence-coded static references",
                    value = new
                    {
                        ok = true,
                        schema = "AcWorkbench.ScopeReferences",
                        data = new
                        {
                            scopeId = "AC/Pages/DentalADA",
                            summary = new { total = 2201, returned = 1000, runtimeDependencies = 920, heuristicMentions = 118 },
                            items = new[] { new { sourceNodeId = "node-000419", kind = "UsesField", targetType = "Field", target = "ProviderNPI", confidence = "High", runtimeDependency = true, evidence = "RuleParameter" } }
                        }
                    }
                }
            };
        }

        if (path.EndsWith("/search", StringComparison.OrdinalIgnoreCase))
        {
            return new Dictionary<string, object>
            {
                ["routeActionSearch"] = new
                {
                    summary = "Search by route/action label",
                    value = new
                    {
                        ok = true,
                        schema = "AcWorkbench.Search",
                        data = new
                        {
                            query = "Match",
                            count = 2,
                            caveat = "Search hits are not dependencies.",
                            items = new object[]
                            {
                                new { kind = "StructuralRule", scopeId = "AC/Pages/DentalADA", nodeId = "node-000419", title = "First page?", subtitle = "CheckPageNum - incoming route: No - outgoing action: Match", evidenceClass = "Structural", routeState = "Resolved" },
                                new { kind = "ActionBranch", scopeId = "AC/Pages/DentalADA", branchId = "AC/Pages/DentalADA|node-000416|action:0", title = "Action: No - Run normal rules", subtitle = "Parent: Run normal Rules/Does RejectLetter attr exist? - 32 child rules", evidenceClass = "Structural", routeState = "Resolved" }
                            }
                        }
                    }
                }
            };
        }

        if (path.EndsWith("/export", StringComparison.OrdinalIgnoreCase))
        {
            return new Dictionary<string, object>
            {
                ["ruleExport"] = new
                {
                    summary = "Product-safe JSON export with provenance",
                    value = new
                    {
                        ok = true,
                        schema = "AcWorkbench.Export",
                        data = new
                        {
                            format = "json",
                            view = "rule",
                            nodeId = "node-000419",
                            provenance = new { snapshotId = "fwd-20260527-113018", apiVersion = ApiV1Routes.ApiVersion },
                            payload = new { identity = new { nodeId = "node-000419", name = "First page?" } }
                        }
                    }
                }
            };
        }

        return null;
    }

    private static string OperationId(ApiRouteDescriptor route)
    {
        string clean = route.Path.Replace(ApiV1Routes.BasePath, string.Empty).Replace("{", string.Empty).Replace("}", string.Empty).Trim('/');
        if (string.IsNullOrWhiteSpace(clean)) clean = "root";
        clean = clean.Replace("/", "_").Replace(".", "_").Replace("-", "_");
        return route.Method.ToLowerInvariant() + "_" + clean;
    }

    private static string TagFor(string path)
    {
        if (path.Contains("/snapshot")) return "snapshot";
        if (path.Contains("/scopes")) return "scopes";
        if (path.Contains("/rules")) return "rules";
        if (path.Contains("/search")) return "search";
        if (path.Contains("/export")) return "export";
        return "system";
    }
}
