using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Diagnostics;
using Newtonsoft.Json;
using AcRuleWorkbench.Core.Interop;
using Microsoft.Extensions.Logging;
using rri.fwd;
using rri.ocr2;
namespace AcRuleWorkbench.Core;

public sealed partial class FormWorksExtractionClient : IFormWorksExtractionClient
{
    public AcViewerReport ExportAcViewer(AcViewerOptions options)
    {
        if (options == null)
            throw new ArgumentNullException(nameof(options));
        options.CancellationToken.ThrowIfCancellationRequested();

        var ruleOptions = new AcRuleOptions
        {
            Path = options.Path,
            ProcessName = string.IsNullOrWhiteSpace(options.ProcessName) ? "AC" : options.ProcessName,
            Term = options.Term,
            Scope = options.Scope,
            Function = options.Function,
            RequireNativeOk = options.RequireNativeOk
        };

        // Structural hierarchy/order is canonical; reconcile flat inventory once.
        AcRuleReport rules = InspectAcRules(ruleOptions);

        AcRelationshipReport relationships = BuildRelationshipReport(rules, includeRules: false);
        relationships.RebuildCounts();

        AcTreeReport tree = BuildAcTree(new AcTreeOptions
        {
            Path = options.Path,
            ProcessName = string.IsNullOrWhiteSpace(options.ProcessName) ? "AC" : options.ProcessName,
            Term = options.Term,
            Scope = options.Scope,
            IncludeAttributes = true,
            MaxAttributeValueLength = 500,
            MaxHierarchyDepth = 256,
            MaxNodeEntryCount = 100000u,
            MaskSensitiveValues = true,
            RequireNativeOk = options.RequireNativeOk
        });

        AcTreeFlatInventoryReconciler.ReconcileFlatInventoryIntoTree(tree, rules);
        EvidenceExportProfileSettings exportProfile = EvidenceExportProfileSettings.Resolve(options.ExportProfile);
        FwdInspectionReport? fwd = null;
        var fwdWarnings = new List<string>();
        try
        {
            fwd = Inspect(new FwdInspectionOptions
            {
                Path = options.Path,
                IncludeFields = true,
                IncludeResourceConfigs = exportProfile.IncludeResourceConfigs,
                IncludeResourcePrivateTrees = exportProfile.IncludeResourcePrivateTrees,
                MaxPrivateTreeDepth = exportProfile.MaxPrivateTreeDepth,
                MaxPrivateTreeNodes = exportProfile.MaxPrivateTreeNodes,
                RequireNativeOk = options.RequireNativeOk
            });
        }
        catch (Exception ex)
        {
            fwdWarnings.Add("Could not inspect FWD global resources for static viewer payload: " + ex.Message);
        }

        DateTime generatedAtUtc = DateTime.UtcNow;
        string snapshotId = BuildViewerSnapshotId(
            string.IsNullOrWhiteSpace(rules.FwdPath) ? options.Path ?? string.Empty : rules.FwdPath,
            rules.ProcessName,
            options.RequireNativeOk,
            generatedAtUtc);
        ApplyViewerSnapshotIdentity(rules, relationships, tree, snapshotId, generatedAtUtc, options.RequireNativeOk);

        string outputPath = string.IsNullOrWhiteSpace(options.OutputPath)
            ? Path.GetFullPath("ac-rule-viewer-live.html")
            : Path.GetFullPath(options.OutputPath);

        Directory.CreateDirectory(Path.GetDirectoryName(outputPath) ?? Environment.CurrentDirectory);
        object? staticFwdData = fwd == null ? null : BuildAcViewerStaticFwdData(fwd, rules, relationships, tree);
        object? staticObjectGraphData = fwd == null ? null : BuildAcViewerStaticObjectGraph(fwd);
        List<object> staticRuntimeImpactItems = fwd == null ? new List<object>() : BuildStaticRuntimeImpactItems(rules, relationships);
        object? staticRuntimeImpactData = fwd == null ? null : new
        {
            count = staticRuntimeImpactItems.Count,
            items = staticRuntimeImpactItems,
            notes = new[] { "Static runtime impact is inferred from function catalog schemas and observed configuration. Native AC execution is not simulated." }
        };
        File.WriteAllText(outputPath, BuildAcViewerHtml(rules, relationships, tree, staticFwdData), Encoding.UTF8);
        IReadOnlyList<string> staticAssetWarnings = CopyAcViewerStaticAssets(outputPath);

        // Prepare viewer report early so we can attach non-fatal warnings from
        // sidecar JSON generation failures.
        var report = new AcViewerReport
        {
            FwdPath = rules.FwdPath,
            OutputPath = outputPath,
            ScopeCount = rules.ScopeCount,
            RuleCount = rules.RuleCount,
            RelationshipCount = relationships.RelationshipCount,
            EvidenceExportProfile = exportProfile.CommandName
        };

        // Also write evidence sidecar JSON files so the static viewer can load large
        // payloads when the external HTML template does not embed them inline.
        try
        {
            string outDir = Path.GetDirectoryName(outputPath) ?? Environment.CurrentDirectory;
            var serializerSettings = new JsonSerializerSettings
            {
                Formatting = Formatting.Indented,
                StringEscapeHandling = StringEscapeHandling.EscapeHtml
            };

            string rulesJson = JsonConvert.SerializeObject(rules, serializerSettings);
            string relJson = JsonConvert.SerializeObject(relationships, serializerSettings);
            string treeJson = JsonConvert.SerializeObject(tree, serializerSettings);

            File.WriteAllText(Path.Combine(outDir, "ac-rule-viewer.rules.json"), rulesJson, Encoding.UTF8);
            File.WriteAllText(Path.Combine(outDir, "ac-rule-viewer.rel.json"), relJson, Encoding.UTF8);
            File.WriteAllText(Path.Combine(outDir, "ac-rule-viewer.tree.json"), treeJson, Encoding.UTF8);
            if (staticFwdData != null && exportProfile.WriteFwdSidecar)
            {
                File.WriteAllText(Path.Combine(outDir, "ac-rule-viewer.fwd.json"), JsonConvert.SerializeObject(staticFwdData, serializerSettings), Encoding.UTF8);
                if (staticObjectGraphData != null)
                    File.WriteAllText(Path.Combine(outDir, "ac-rule-viewer.advanced.object-graph.json"), JsonConvert.SerializeObject(staticObjectGraphData, serializerSettings), Encoding.UTF8);
                if (staticRuntimeImpactData != null)
                    File.WriteAllText(Path.Combine(outDir, "ac-rule-viewer.advanced.runtime-impact.json"), JsonConvert.SerializeObject(staticRuntimeImpactData, serializerSettings), Encoding.UTF8);
            }
        }
        catch (Exception ex)
        {
            // Non-fatal: record as a warning on the report so the caller can see it.
            report.Warnings.Add("Could not write viewer sidecar JSON files: " + ex.Message);
        }
        // Keep export-profile mechanics internal. The default FW Editor Viewer should not surface evidence/profile terminology.
        report.Warnings.AddRange(fwdWarnings);
        report.Warnings.AddRange(staticAssetWarnings);
        if (fwd != null)
            report.Warnings.AddRange(fwd.Warnings);
        report.Warnings.AddRange(rules.Warnings);
        report.Warnings.AddRange(relationships.Warnings);
        report.Warnings.AddRange(tree.Warnings);

        if (options.OpenBrowser)
        {
            try
            {
                Process.Start(new ProcessStartInfo(outputPath) { UseShellExecute = true });
                report.OpenedBrowser = true;
            }
            catch (Exception ex)
            {
                report.Warnings.Add("Could not open browser: " + ex.Message);
            }
        }

        return report;
    }

private static AcRuleFlowReport BuildFlowReport(AcRuleReport rules, bool includeHeuristicSequence)
    {
        if (rules == null)
            throw new ArgumentNullException(nameof(rules));

        var report = new AcRuleFlowReport
        {
            FwdPath = rules.FwdPath,
            ProcessName = rules.ProcessName
        };

        foreach (var scopeGroup in rules.Rules.GroupBy(r => r.ScopePath).OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase))
        {
            List<AcRuleSummary> ordered = scopeGroup.OrderBy(r => r.RuleIndex).ToList();
            if (ordered.Count == 0)
                continue;

            var scope = new AcRuleFlowScope
            {
                ScopePath = scopeGroup.Key,
                ScopeType = ordered[0].ScopeType,
                ScopeName = ordered[0].ScopeName,
                RuleCount = ordered.Count
            };
            report.Scopes.Add(scope);

            foreach (AcRuleSummary rule in ordered)
            {
                report.Nodes.Add(new AcRuleFlowNode
                {
                    ScopePath = rule.ScopePath,
                    ScopeType = rule.ScopeType,
                    ScopeName = rule.ScopeName,
                    RuleIndex = rule.RuleIndex,
                    RuleGuid = rule.RuleGuid,
                    RuleId = rule.RuleId,
                    RuleName = rule.RuleName,
                    FunctionName = rule.FunctionName,
                    RuleListPath = rule.RuleListPath,
                    DisabledState = rule.DisabledState
                });
            }

            Dictionary<int, AcRuleSummary> byIndex = ordered.ToDictionary(r => r.RuleIndex);
            Dictionary<int, AcRuleSummary> byRuleId = ordered
                .Where(r => TryParseInt(r.RuleId, out _))
                .GroupBy(r => ParseIntOrNull(r.RuleId)!.Value)
                .ToDictionary(g => g.Key, g => g.First());

            AddFlowEdge(report, scope, new AcRuleFlowEdge
            {
                ScopePath = scope.ScopePath,
                FromRuleIndex = 0,
                FromRuleName = "<scope root>",
                ToRuleIndex = ordered[0].RuleIndex,
                ToRuleGuid = ordered[0].RuleGuid,
                ToRuleName = ordered[0].RuleName,
                EdgeKind = AcRuleFlowEdgeKind.RootListEntry,
                Confidence = AcEvidenceConfidence.Parsed,
                ResolutionStatus = "Resolved",
                EvidenceKey = "ScopeRoot",
                Evidence = "First parsed rule in scope."
            });

            for (int i = 0; i < ordered.Count; i++)
            {
                AcRuleSummary rule = ordered[i];

                if (includeHeuristicSequence && i + 1 < ordered.Count)
                {
                    AcRuleSummary next = ordered[i + 1];
                    AddFlowEdge(report, scope, CreateFlowEdge(rule, next, AcRuleFlowEdgeKind.SequentialNext, AcEvidenceConfidence.Heuristic, null, "RuleIndex", "Next rule in same parsed sequence. This is sequence evidence, not branch proof."));
                }

                if (rule.SkipId.HasValue)
                    AddIdTargetEdge(report, scope, rule, rule.SkipId.Value, byRuleId, AcRuleFlowEdgeKind.SkipToRule, "_SkipID");

                if (rule.BackupSkipId.HasValue)
                    AddIdTargetEdge(report, scope, rule, rule.BackupSkipId.Value, byRuleId, AcRuleFlowEdgeKind.BackupSkipToRule, "_BackupSkipID");

                foreach (string actionName in rule.ActionNames)
                {
                    AddFlowEdge(report, scope, new AcRuleFlowEdge
                    {
                        ScopePath = rule.ScopePath,
                        FromRuleIndex = rule.RuleIndex,
                        FromRuleGuid = rule.RuleGuid,
                        FromRuleName = rule.RuleName,
                        ActionName = actionName,
                        StatusResultName = actionName,
                        EdgeKind = IsTerminalAction(actionName) ? AcRuleFlowEdgeKind.ActionToTerminal : AcRuleFlowEdgeKind.UnknownActionTarget,
                        Confidence = AcEvidenceConfidence.Unknown,
                        ResolutionStatus = IsTerminalAction(actionName) ? "TerminalInferred" : "Unresolved",
                        EvidenceKey = "_ActionNames",
                        Evidence = "Action/status name was parsed, but no decoded sub-list target was available in this pass.",
                        RawToken = actionName
                    });
                }
            }

            scope.EdgeCount = report.Edges.Count(e => e.ScopePath == scope.ScopePath);
            scope.UnknownActionTargetCount = report.Edges.Count(e => e.ScopePath == scope.ScopePath && e.EdgeKind == AcRuleFlowEdgeKind.UnknownActionTarget);
            scope.UnresolvedSkipTargetCount = report.Edges.Count(e => e.ScopePath == scope.ScopePath && e.EdgeKind == AcRuleFlowEdgeKind.UnresolvedSkipTarget);
        }

        report.Warnings.Add("Action names are parsed, but ActionMap/sub-list targets may remain unresolved until the proprietary action-map encoding is decoded.");
        report.RebuildCounts();
        return report;
    }

private static object BuildAcViewerStaticFwdData(FwdInspectionReport fwd, AcRuleReport rules, AcRelationshipReport relationships, AcTreeReport tree)
    {
        var usedByTarget = relationships.Relationships
            .Where(r => !string.IsNullOrWhiteSpace(r.Target))
            .GroupBy(r => r.Target, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        ResourceDetail? DetailFor(string type, string name)
        {
            return fwd.ResourceTypeDetails
                .Where(t => Eq(t.Type, type))
                .SelectMany(t => t.Resources)
                .FirstOrDefault(r => Eq(r.Name, name));
        }

        List<object> UsageFor(string name)
        {
            return usedByTarget.TryGetValue(name, out List<AcRuleRelationship>? refs)
                ? refs.Take(160).Select(r => (object)new
                {
                    r.ScopePath,
                    r.ScopeType,
                    r.ScopeName,
                    r.RuleIndex,
                    r.RuleGuid,
                    r.RuleName,
                    r.FunctionName,
                    r.Kind,
                    r.TargetType,
                    r.ParameterName,
                    r.ParameterRole,
                    r.Confidence
                }).ToList()
                : new List<object>();
        }

        object? DetailPayload(ResourceDetail? detail)
        {
            if (detail == null)
                return null;

            return new
            {
                category = detail.Category,
                fullConfig = detail.FullAttributes,
                publicConfig = detail.PublicAttributes,
                privateTree = detail.PrivateTree,
                warnings = detail.Warnings
            };
        }

        object ResourceEvidence(ResourceDetail? detail, string resourceKind)
        {
            return BuildStaticResourceEvidencePayload(detail, resourceKind);
        }

        var resourceBuckets = fwd.Resources
            .OrderBy(b => b.Type, StringComparer.OrdinalIgnoreCase)
            .Select(bucket => new
            {
                type = bucket.Type,
                count = bucket.Names.Count,
                names = bucket.Names
                    .Where(n => !string.IsNullOrWhiteSpace(n))
                    .OrderBy(n => n, StringComparer.OrdinalIgnoreCase)
                    .Select(name =>
                    {
                        ResourceDetail? detail = DetailFor(bucket.Type, name);
                        List<object> usage = UsageFor(name);
                        return new
                        {
                            name,
                            usedByRuleCount = usage.Count,
                            usedBy = usage.Take(100).ToList(),
                            details = DetailPayload(detail)
                        };
                    })
                    .ToList()
            })
            .ToList();

        var resourceEntries = fwd.Resources
            .SelectMany(bucket => bucket.Names
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .Select(name => new
                {
                    type = bucket.Type,
                    name,
                    detail = DetailFor(bucket.Type, name),
                    usage = UsageFor(name)
                }))
            .ToList();

        var tableItems = resourceEntries
            .Where(r => IsTableResourceType(r.type))
            .OrderBy(r => r.name, StringComparer.OrdinalIgnoreCase)
            .Select(r =>
            {
                string? tableDriver = InferStaticTableDriver(r.detail);
                bool schemaEligible = !Eq(tableDriver, "CharSet");
                List<object> parsedColumns = schemaEligible ? BuildStaticTableFieldRows(r.detail, "Column") : new List<object>();
                var diagnostics = new List<string>();
                if (!schemaEligible)
                    diagnostics.Add("TableResourceUsesCharSetDriver");
                else if (parsedColumns.Count == 0)
                    diagnostics.Add("TableSchemaNotParsedFromStaticResourceEvidence");

                return new
                {
                    name = r.name,
                    resourceType = r.type,
                    tableDriver,
                    defined = true,
                    canonical = true,
                    source = "StaticFwdResource",
                    confidence = parsedColumns.Count > 0 ? "High" : "Medium",
                    referenceCount = r.usage.Count,
                    ruleCount = r.usage.Count,
                    parsedColumns,
                    usageDerivedFields = Array.Empty<object>(),
                    columns = parsedColumns,
                    schemaParsed = parsedColumns.Count > 0,
                    schemaParseState = parsedColumns.Count > 0 ? "Parsed" : schemaEligible ? "NotParsed" : "DriverNotSchema",
                    columnsAreUsageDerived = false,
                    columnsDeprecatedAlias = false,
                    authority = "TableResource",
                    authorityNote = "This entry is a table/resource definition. SelectionList behavior is shown only when a SelectionList resource or SelectionList/TableSelector driver is explicitly parsed.",
                    resourceEvidence = ResourceEvidence(r.detail, "Table"),
                    rawResourceDetails = DetailPayload(r.detail),
                    diagnostics = diagnostics.ToArray()
                };
            })
            .ToList();

        var selectionListItems = resourceEntries
            .Where(r => IsSelectionListResourceType(r.type) || (IsTableResourceType(r.type) && (Eq(InferStaticTableDriver(r.detail), "SelectionList") || Eq(InferStaticTableDriver(r.detail), "TableSelector"))))
            .OrderBy(r => r.name, StringComparer.OrdinalIgnoreCase)
            .Select(r =>
            {
                string? tableDriver = InferStaticTableDriver(r.detail);
                List<object> matchFields = BuildStaticTableFieldRows(r.detail, "MatchField");
                List<object> plugFields = BuildStaticTableFieldRows(r.detail, "PlugField");
                List<object> columns = BuildStaticTableFieldRows(r.detail, "Column");
                List<object> options = BuildStaticSelectionListOptions(r.detail);
                bool schemaParsed = matchFields.Count > 0 || plugFields.Count > 0 || columns.Count > 0;
                var diagnostics = new List<string>();
                if (schemaParsed && matchFields.Count == 0 && plugFields.Count == 0)
                    diagnostics.Add("SelectionListFieldsParsedAsColumnsOnly");
                else if (!schemaParsed && options.Count == 0)
                    diagnostics.Add("SelectionListSchemaNotParsedFromStaticResourceEvidence");

                return new
                {
                    name = r.name,
                    resourceType = r.type,
                    tableDriver,
                    canonical = true,
                    schemaParsed,
                    optionsParsed = options.Count > 0,
                    source = IsSelectionListResourceType(r.type) ? "StaticFwdSelectionListResource" : "StaticFwdTableDriver",
                    authority = IsSelectionListResourceType(r.type) ? "SelectionListResource" : "SelectionListDriverOnTableResource",
                    authorityNote = IsSelectionListResourceType(r.type)
                        ? "SelectionList configuration was parsed from a SelectionList resource bucket."
                        : "SelectionList configuration was inferred from a table resource whose driver is SelectionList/TableSelector; table-only references are not promoted here.",
                    confidence = schemaParsed || options.Count > 0 ? "High" : r.detail?.PrivateTree != null ? "Medium" : "Low",
                    usageLinks = r.usage,
                    matchFields,
                    plugFields,
                    columns,
                    options,
                    diagnostics = diagnostics.ToArray(),
                    resourceEvidence = ResourceEvidence(r.detail, "SelectionList"),
                    rawResourceDetails = DetailPayload(r.detail)
                };
            })
            .ToList();

        var selectionListUsageCandidates = BuildStaticSelectionListUsageCandidates(relationships, selectionListItems.Select(i => i.name));
        var allSelectionListItems = selectionListItems.Cast<object>().Concat(selectionListUsageCandidates).ToList();

        var udfItems = resourceEntries
            .Where(r => IsUdfResourceType(r.type))
            .OrderBy(r => r.name, StringComparer.OrdinalIgnoreCase)
            .Select(r =>
            {
                List<string> fieldListParameters = ExtractStaticResourceNamesByRole(r.detail, "Udf", "FieldListParameter");
                List<string> statusResults = ExtractStaticResourceNamesByRole(r.detail, "Udf", "StatusResult");
                List<Dictionary<string, object?>> bodyHits = BuildStaticPrivateTreeHits(r.detail?.PrivateTree, "Udf")
                    .Where(h => Eq(Convert.ToString(h["role"]), "RuleBody") || Eq(Convert.ToString(h["role"]), "RuleNode"))
                    .ToList();
                List<object> callerBindings = BuildStaticUdfCallerBindings(rules, tree, r.name);
                List<object> parameterBindings = BuildStaticUdfParameterBindings(callerBindings, fieldListParameters);
                object internalRuleTree = BuildStaticUdfInternalRuleTree(r.name, statusResults, bodyHits, r.detail?.PrivateTree);
                bool definitionParsed = fieldListParameters.Count > 0 || statusResults.Count > 0;
                bool bodyParsed = bodyHits.Count > 0 || StaticUdfInternalTreeParsed(internalRuleTree);
                string availabilityState = bodyParsed ? "RuleListAvailable" : r.detail?.PrivateTree != null ? "RuleListOpaque" : "RuleListUnavailable";
                string availabilityMessage = bodyParsed
                    ? "Internal UDF Rule List candidate nodes were extracted from the resource private tree."
                    : r.detail?.PrivateTree != null
                        ? "The UDF resource has private data, but the internal Rule List could not be decoded into FW Editor rule rows."
                        : "The internal UDF Rule List was not available in this snapshot payload.";
                return new
                {
                    name = r.name,
                    resourceType = r.type,
                    usedByRuleCount = callerBindings.Count > 0 ? callerBindings.Count : r.usage.Count,
                    defined = true,
                    classification = "CandidateUdfDefinition",
                    source = "StaticFwdResource",
                    definitionParsed,
                    bodyParsed,
                    availabilityState,
                    availabilityMessage,
                    fieldListParameters,
                    statusResults,
                    callerBindings,
                    fieldListParameterBindings = parameterBindings,
                    internalRuleTree,
                    diagnostics = StaticUdfDiagnostics(definitionParsed, bodyParsed, r.detail?.PrivateTree != null),
                    resourceEvidence = ResourceEvidence(r.detail, "Udf"),
                    rawResourceDetails = DetailPayload(r.detail)
                };
            })
            .ToList();

        List<Tuple<string, string>> resourceNames = resourceEntries.Select(r => Tuple.Create(r.type, r.name)).ToList();
        List<object> functionItems = BuildStaticFunctionCatalogItems(rules, relationships, resourceNames);

        return new
        {
            source = "StaticViewerExport",
            overview = new
            {
                path = fwd.Path,
                release = fwd.ReleaseString,
                releaseDate = fwd.ReleaseDateString,
                counts = new
                {
                    documents = fwd.Documents.Count,
                    pages = fwd.Pages.Count,
                    batches = fwd.Batches.Count,
                    processes = fwd.Processes.Count,
                    resources = fwd.Resources.Sum(b => b.Names.Count),
                    resourceTypes = fwd.Resources.Count,
                    fields = fwd.Fields.Sum(b => b.Fields.Count),
                    ruleScopes = tree.Scopes.Count,
                    rules = rules.Rules.Count
                }
            },
            documents = new
            {
                count = fwd.Documents.Count,
                items = fwd.Documents.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).Select(name => new
                {
                    key = "document:" + name,
                    type = "documentType",
                    name,
                    parentBatchKeys = fwd.DocsInBatch
                        .Where(pair => pair.Value.Contains(name, StringComparer.OrdinalIgnoreCase))
                        .Select(pair => "batch:" + pair.Key)
                        .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
                        .ToList(),
                    pageKeys = fwd.PagesInDoc.TryGetValue(name, out List<string>? pages)
                        ? pages.Select(page => "page:" + page).ToList()
                        : new List<string>()
                }).ToList()
            },
            pages = new
            {
                count = fwd.Pages.Count,
                items = fwd.Pages.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).Select(name => new
                {
                    key = "page:" + name,
                    type = "pageType",
                    name,
                    parentDocumentKeys = fwd.PagesInDoc
                        .Where(pair => pair.Value.Contains(name, StringComparer.OrdinalIgnoreCase))
                        .Select(pair => "document:" + pair.Key)
                        .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
                        .ToList()
                }).ToList()
            },
            batches = new
            {
                count = fwd.Batches.Count,
                items = fwd.Batches.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).Select(name => new
                {
                    key = "batch:" + name,
                    type = "batchType",
                    name,
                    documentKeys = fwd.DocsInBatch.TryGetValue(name, out List<string>? documents)
                        ? documents.Select(document => "document:" + document).ToList()
                        : new List<string>()
                }).ToList()
            },
            processes = new { count = fwd.Processes.Count, items = fwd.Processes.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).Select(name => new { name, processName = name }).ToList() },
            processDrivers = new { count = 0, items = Array.Empty<object>(), notes = new[] { "Process driver details require the live API process-private traversal endpoint." } },
            resources = new { count = resourceBuckets.Sum(b => b.count), buckets = resourceBuckets },
            functions = new { count = functionItems.Count, items = functionItems, notes = new[] { "Static export function catalog combines curated AC function metadata, observed rule usage, and FWD function resources." } },
            ruleLists = new { count = tree.Scopes.Count, items = tree.Scopes.Select(s => new { scopeId = s.ScopePath, name = s.ScopeName, kind = s.ScopeType }).ToList() },
            tables = new { count = tableItems.Count, items = tableItems },
            selectionLists = new
            {
                count = allSelectionListItems.Count,
                parsedCount = selectionListItems.Count(i => (bool)i.GetType().GetProperty("schemaParsed")!.GetValue(i)!),
                resourceCandidateCount = selectionListItems.Count(i => !(bool)i.GetType().GetProperty("schemaParsed")!.GetValue(i)!),
                usageCandidateCount = selectionListUsageCandidates.Count,
                authority = "ParsedOrRuleUsageCandidateSeparated",
                authorityNote = "Parsed SelectionList configuration and rule references are separated by each row authority. Rule references are not parsed schemas.",
                items = allSelectionListItems
            },
            udfs = new
            {
                count = udfItems.Count,
                definitionParsedCount = udfItems.Count(i => (bool)i.GetType().GetProperty("definitionParsed")!.GetValue(i)!),
                bodyParsedCount = udfItems.Count(i => (bool)i.GetType().GetProperty("bodyParsed")!.GetValue(i)!),
                ruleListAvailableCount = udfItems.Count(i => string.Equals(Convert.ToString(i.GetType().GetProperty("availabilityState")!.GetValue(i)), "RuleListAvailable", StringComparison.OrdinalIgnoreCase)),
                items = udfItems
            },
            canonicalUdfs = new
            {
                count = udfItems.Count,
                definitionParsedCount = udfItems.Count(i => (bool)i.GetType().GetProperty("definitionParsed")!.GetValue(i)!),
                bodyParsedCount = udfItems.Count(i => (bool)i.GetType().GetProperty("bodyParsed")!.GetValue(i)!),
                ruleListAvailableCount = udfItems.Count(i => string.Equals(Convert.ToString(i.GetType().GetProperty("availabilityState")!.GetValue(i)), "RuleListAvailable", StringComparison.OrdinalIgnoreCase)),
                items = udfItems
            },
            pageDesigns = new { count = 0, items = Array.Empty<object>() },
            pageVariants = new { count = fwd.PageVariants.Sum(v => v.Variants.Count), items = fwd.PageVariants.Select(v => new { page = v.Page, variants = v.Variants }).ToList() },
            fields = new
            {
                count = fwd.Fields.Sum(b => b.Fields.Count),
                items = fwd.Fields.SelectMany(bucket => bucket.Fields.Select(field => new
                {
                    scopeType = bucket.ScopeType,
                    scopeName = bucket.ScopeName,
                    field.Name,
                    field.Type,
                    field.Geometry,
                    field.SubfieldCount
                })).ToList()
            },
            warnings = fwd.Warnings
        };
    }

private static object BuildAcViewerStaticObjectGraph(FwdInspectionReport fwd)
    {
        var nodes = new List<Dictionary<string, object?>>();
        var edges = new List<Dictionary<string, object?>>();
        string rootId = "fwd:" + ViewerSafeId(fwd.Path);

        AddStaticGraphNode(nodes, rootId, "FwdRoot", fwd.Path, "StaticViewerExport", "High", new Dictionary<string, object?>());

        foreach (string batch in fwd.Batches.OrderBy(value => value, StringComparer.OrdinalIgnoreCase))
        {
            string batchId = "batchtype:" + ViewerSafeId(batch);
            AddStaticGraphNode(nodes, batchId, "BatchType", batch, "Fwd.GetBatchNames", "High", new Dictionary<string, object?>());
            AddStaticGraphEdge(edges, rootId, batchId, "containsBatch", "Fwd.GetBatchNames", "High");
        }

        foreach (string document in fwd.Documents.OrderBy(value => value, StringComparer.OrdinalIgnoreCase))
        {
            string documentId = "documenttype:" + ViewerSafeId(document);
            AddStaticGraphNode(nodes, documentId, "DocumentType", document, "Fwd.GetDocumentNames", "High", new Dictionary<string, object?>());
            AddStaticGraphEdge(edges, rootId, documentId, "containsDocument", "Fwd.GetDocumentNames", "High");
        }

        foreach (string page in fwd.Pages.OrderBy(value => value, StringComparer.OrdinalIgnoreCase))
        {
            string pageId = "pagetype:" + ViewerSafeId(page);
            AddStaticGraphNode(nodes, pageId, "PageType", page, "Fwd.GetPageNames", "High", new Dictionary<string, object?>());
            AddStaticGraphEdge(edges, rootId, pageId, "containsPage", "Fwd.GetPageNames", "High");
        }

        foreach (KeyValuePair<string, List<string>> membership in fwd.DocsInBatch)
        {
            string batchId = "batchtype:" + ViewerSafeId(membership.Key);
            foreach (string document in membership.Value)
                AddStaticGraphEdge(edges, batchId, "documenttype:" + ViewerSafeId(document), "containsDocument", "Fwd.GetDocsInBatch", "High");
        }

        foreach (KeyValuePair<string, List<string>> membership in fwd.PagesInDoc)
        {
            string documentId = "documenttype:" + ViewerSafeId(membership.Key);
            foreach (string page in membership.Value)
                AddStaticGraphEdge(edges, documentId, "pagetype:" + ViewerSafeId(page), "containsPage", "Fwd.GetPagesInDoc", "High");
        }

        foreach (ResourceBucket bucket in fwd.Resources.OrderBy(b => b.Type, StringComparer.OrdinalIgnoreCase))
        {
            foreach (string name in bucket.Names.Where(n => !string.IsNullOrWhiteSpace(n)).OrderBy(n => n, StringComparer.OrdinalIgnoreCase))
            {
                ResourceDetail? detail = fwd.ResourceTypeDetails
                    .Where(t => Eq(t.Type, bucket.Type))
                    .SelectMany(t => t.Resources)
                    .FirstOrDefault(r => Eq(r.Name, name));
                string resourceId = "resource:" + ViewerSafeId(bucket.Type) + ":" + ViewerSafeId(name);
                AddStaticGraphNode(nodes, resourceId, "Resource", name, "Fwd.Resources", "High", new Dictionary<string, object?>
                {
                    ["resourceType"] = bucket.Type,
                    ["resourceName"] = name,
                    ["hasConfig"] = detail != null && (detail.FullAttributes.Count > 0 || detail.PublicAttributes.Count > 0),
                    ["hasPrivateTree"] = detail?.PrivateTree != null,
                    ["category"] = detail?.Category
                });
                AddStaticGraphEdge(edges, rootId, resourceId, "hasResource", "Fwd.Resources", "High");

                if (detail?.PrivateTree != null)
                {
                    int nextId = 0;
                    AddStaticPrivateTreeGraph(nodes, edges, resourceId, detail.PrivateTree, bucket.Type, name, ref nextId);
                }
            }
        }

        return new
        {
            nodes,
            edges,
            diagnostics = new[] { "Static export object graph includes configured batch, document, page, resource, and resource-private nodes. Live API adds fields, rule lists, variants, and process-private nodes." }
        };
    }

private static object BuildStaticResourceEvidencePayload(ResourceDetail? detail, string resourceKind)
    {
        return new
        {
            hasConfig = detail != null && (detail.FullAttributes.Count > 0 || detail.PublicAttributes.Count > 0),
            hasPrivateTree = detail?.PrivateTree != null,
            attributeHits = BuildStaticAttributeHits(detail, resourceKind),
            privateTreeHits = BuildStaticPrivateTreeHits(detail?.PrivateTree, resourceKind),
            diagnostics = detail?.Warnings ?? new List<string>()
        };
    }

private static List<Dictionary<string, object?>> BuildStaticAttributeHits(ResourceDetail? detail, string resourceKind)
    {
        var hits = new List<Dictionary<string, object?>>();
        if (detail == null)
            return hits;

        foreach (ResourceAttrEntry attr in detail.FullAttributes.Concat(detail.PublicAttributes))
        {
            string role = ClassifyStaticResourceEvidenceRole(attr.Key, attr.Value, resourceKind);
            if (role == "Unknown")
                continue;

            hits.Add(new Dictionary<string, object?>
            {
                ["key"] = attr.Key,
                ["value"] = attr.Value,
                ["role"] = role,
                ["source"] = "ResourceConfig",
                ["confidence"] = "High"
            });
        }

        return hits;
    }

private static List<Dictionary<string, object?>> BuildStaticPrivateTreeHits(ResourcePrivateNode? node, string resourceKind)
    {
        var hits = new List<Dictionary<string, object?>>();
        if (node == null)
            return hits;

        void Walk(ResourcePrivateNode current)
        {
            List<string> fragments = ExtractStaticPrivateNodeTextFragments(current).ToList();
            string combined = string.Join(" ", fragments);
            string role = ClassifyStaticResourceEvidenceRole(current.Name + " " + current.Path, combined, resourceKind);
            if (role != "Unknown")
            {
                hits.Add(new Dictionary<string, object?>
                {
                    ["path"] = current.Path,
                    ["name"] = current.Name,
                    ["valuePreview"] = current.ValuePreview,
                    ["rawTextPreview"] = Truncate(combined, 700),
                    ["role"] = role,
                    ["source"] = current.RawDataBytes != null && current.RawDataBytes.Length > 0 ? "ResourcePrivateTreeRawBytes" : "ResourcePrivateTree",
                    ["confidence"] = fragments.Any(f => !string.IsNullOrWhiteSpace(f)) ? "High" : "Medium"
                });
            }

            foreach (ResourcePrivateNode child in current.Children)
                Walk(child);
        }

        Walk(node);
        return hits;
    }

private static string ClassifyStaticResourceEvidenceRole(string key, string value, string resourceKind)
    {
        string probe = ((key ?? string.Empty) + " " + (value ?? string.Empty)).ToLowerInvariant();
        if (probe.Contains("fieldlist") || probe.Contains("field list") || probe.Contains("paramlist") || probe.Contains("parameter"))
            return "FieldListParameter";
        if (probe.Contains("status result") || probe.Contains("statusresult") || probe.Contains("return code") || probe.Contains("actionname"))
            return "StatusResult";
        if (resourceKind == "Udf" && (probe.Contains("rule body") || probe.Contains("udf body") || probe.Contains("function body") || probe.Contains("private body")))
            return "RuleBody";
        if (probe.Contains("rule tree") || probe.Contains("rulelist") || probe.Contains("rule list") || (resourceKind == "Udf" && probe.Contains("rule")))
            return "RuleNode";
        if (probe.Contains("reject") && (probe.Contains("outcome") || probe.Contains("action") || probe.Contains("result") || probe.Contains("code")))
            return "RejectOutcome";
        if (probe.Contains("plug") && (probe.Contains("outcome") || probe.Contains("action") || probe.Contains("result")))
            return "PlugOutcome";
        if (probe.Contains("match") && (probe.Contains("field") || probe.Contains("column")))
            return "MatchField";
        if ((probe.Contains("plug") || probe.Contains("output") || probe.Contains("destination")) && (probe.Contains("field") || probe.Contains("column")))
            return "PlugField";
        if (probe.Contains("persist") || probe.Contains("keep") || probe.Contains("retain"))
            return "Persistence";
        if (probe.Contains("rerun") || probe.Contains("changed") || probe.Contains("trigger"))
            return "RerunTrigger";
        if (probe.Contains("popup") || probe.Contains("prompt") || probe.Contains("keyer") || probe.Contains("selection"))
            return "OperatorPrompt";
        if (probe.Contains("no good match") || probe.Contains("nogoodmatch") || probe.Contains("no match"))
            return "NoGoodMatch";
        if (probe.Contains("enter"))
            return "EnterBehavior";
        if (probe.Contains("table") || probe.Contains("selectionlist") || probe.Contains("selection list"))
            return "TableOption";
        return "Unknown";
    }

private static List<object> BuildStaticTableFieldRows(ResourceDetail? detail, string preferredRole)
    {
        var fields = new Dictionary<string, Dictionary<string, object?>>(StringComparer.OrdinalIgnoreCase);

        void Add(string? candidate, string role, string confidence)
        {
            string name = Regex.Replace(candidate ?? string.Empty, @"[\x00-\x1F]+", " ").Trim().Trim('"', '\'', '{', '}', '[', ']');
            if (role == "Parsed column" ? !LooksLikeStaticTableColumnName(name) : !LooksLikeStaticIdentifier(name))
                return;

            if (!fields.TryGetValue(name, out Dictionary<string, object?>? row))
            {
                row = new Dictionary<string, object?>
                {
                    ["name"] = name,
                    ["hits"] = 0,
                    ["matchLevel"] = confidence,
                    ["confidence"] = confidence,
                    ["role"] = role
                };
                fields[name] = row;
            }

            row["hits"] = Convert.ToInt32(row["hits"]) + 1;
            if (confidence == "High")
            {
                row["matchLevel"] = "High";
                row["confidence"] = "High";
            }
        }

        void AddSplit(string? raw, string role, string confidence)
        {
            if (string.IsNullOrWhiteSpace(raw))
                return;

            foreach (string part in Regex.Split(raw, @"[\x00-\x1F,;|]+"))
                Add(part, role, confidence);
        }

        if (detail != null)
        {
            foreach (ResourceAttrEntry attr in detail.FullAttributes.Concat(detail.PublicAttributes))
            {
                string role = ClassifyStaticResourceEvidenceRole(attr.Key ?? string.Empty, attr.Value, "SelectionList");
                if (preferredRole == "Column" && Regex.IsMatch(attr.Key ?? string.Empty, "key\\s*fields?|match\\s*fields?|plug\\s*fields?|output\\s*fields?|columns?|fields?", RegexOptions.IgnoreCase))
                    AddSplit(attr.Value, "Parsed column", "High");
                else if (role == preferredRole)
                    AddSplit(attr.Value, role, "High");
            }

            if (detail.PrivateTree != null)
                ExtractStaticTableColumnsFromPrivateTree(detail.PrivateTree, Add, AddSplit, preferredRole, inColumnRegion: false);
        }

        return fields.Values
            .OrderByDescending(r => Convert.ToInt32(r["hits"]))
            .ThenBy(r => Convert.ToString(r["name"]), StringComparer.OrdinalIgnoreCase)
            .Select(r => (object)r)
            .ToList();
    }

private static string? InferStaticTableDriver(ResourceDetail? detail)
    {
        if (detail?.PrivateTree == null)
            return null;

        string? found = null;
        void Walk(ResourcePrivateNode node)
        {
            if (found != null)
                return;

            List<string> tokens = ExtractStaticPrivateNodeTextFragments(node).SelectMany(ExtractStaticPayloadTokens).ToList();
            for (int i = 0; i < tokens.Count - 1; i++)
            {
                if (Eq(tokens[i], "_TableDriver") || Eq(tokens[i], "TableDriver"))
                {
                    found = tokens[i + 1];
                    return;
                }
            }

            foreach (ResourcePrivateNode child in node.Children)
                Walk(child);
        }

        Walk(detail.PrivateTree);
        return found;
    }

private static IEnumerable<string> ExtractStaticPayloadTokens(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            yield break;

        foreach (string part in Regex.Split(raw, @"[\x00-\x1F,;|]+"))
        {
            string token = part.Trim().Trim('"', '\'', '{', '}', '[', ']');
            if (token.Length is < 2 or > 80)
                continue;
            if (!Regex.IsMatch(token, "[A-Za-z_]"))
                continue;

            yield return token;
        }
    }

private static IEnumerable<string> ExtractStaticPrivateNodeTextFragments(ResourcePrivateNode? node)
    {
        if (node == null)
            yield break;

        if (!string.IsNullOrWhiteSpace(node.Name))
            yield return node.Name;
        if (!string.IsNullOrWhiteSpace(node.Path))
            yield return node.Path;
        if (!string.IsNullOrWhiteSpace(node.ValuePreview))
            yield return node.ValuePreview!;

        if (node.RawDataBytes == null || node.RawDataBytes.Length == 0)
            yield break;

        foreach (string fragment in ExtractPrintableStrings(node.RawDataBytes, minLength: 3, maxFragments: 240))
            yield return fragment;
    }

private static IEnumerable<string> ExtractPrintableStrings(byte[] bytes, int minLength, int maxFragments)
    {
        if (bytes == null || bytes.Length == 0 || maxFragments <= 0)
            yield break;

        var buffer = new List<byte>();
        int emitted = 0;

        foreach (byte b in bytes)
        {
            if ((b >= 32 && b <= 126) || b == 9)
            {
                buffer.Add(b);
                if (buffer.Count <= 220)
                    continue;
            }

            foreach (string value in FlushPrintableBuffer(buffer, minLength))
            {
                yield return value;
                emitted++;
                if (emitted >= maxFragments)
                    yield break;
            }
        }

        foreach (string value in FlushPrintableBuffer(buffer, minLength))
        {
            yield return value;
            emitted++;
            if (emitted >= maxFragments)
                yield break;
        }
    }

private static IEnumerable<string> FlushPrintableBuffer(List<byte> buffer, int minLength)
    {
        if (buffer.Count < minLength)
        {
            buffer.Clear();
            yield break;
        }

        string value = Encoding.ASCII.GetString(buffer.ToArray()).Trim();
        buffer.Clear();
        if (value.Length < minLength || !Regex.IsMatch(value, "[A-Za-z_]"))
            yield break;

        yield return value;
    }

private static void ExtractStaticTableColumnsFromPrivateTree(
        ResourcePrivateNode node,
        Action<string?, string, string> add,
        Action<string?, string, string> addSplit,
        string preferredRole,
        bool inColumnRegion)
    {
        string name = node.Name ?? string.Empty;
        string nodeText = string.Join(" ", ExtractStaticPrivateNodeTextFragments(node));
        string role = ClassifyStaticResourceEvidenceRole(node.Name + " " + node.Path, nodeText, "SelectionList");
        bool columnRegion = inColumnRegion || Regex.IsMatch(name, "columns?|fields?|schema|tableinfo", RegexOptions.IgnoreCase);

        if (preferredRole == "Column" && columnRegion)
        {
            if (!IsStaticTableContainerName(name))
                add(name, "Parsed column", "Medium");
            addSplit(nodeText, "Parsed column", node.RawDataBytes != null ? "High" : "Medium");
        }
        else if (role == preferredRole)
        {
            addSplit(nodeText, role, string.IsNullOrWhiteSpace(nodeText) ? "Medium" : "High");
            add(name, role, "Medium");
        }

        foreach (ResourcePrivateNode child in node.Children)
            ExtractStaticTableColumnsFromPrivateTree(child, add, addSplit, preferredRole, columnRegion);
    }

private static List<object> BuildStaticSelectionListUsageCandidates(AcRelationshipReport relationships, IEnumerable<string> parsedSelectionListNames)
    {
        var parsed = new HashSet<string>(parsedSelectionListNames.Where(n => !string.IsNullOrWhiteSpace(n)), StringComparer.OrdinalIgnoreCase);
        return relationships.Relationships
            .Where(LooksLikeSelectionListUsageRelationship)
            .Where(r => !string.IsNullOrWhiteSpace(r.Target))
            .Where(r => !parsed.Contains(r.Target))
            .GroupBy(r => r.Target, StringComparer.OrdinalIgnoreCase)
            .OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
            .Select(g =>
            {
                List<AcRuleRelationship> rows = g.OrderBy(r => r.ScopePath, StringComparer.OrdinalIgnoreCase).ThenBy(r => r.RuleIndex).ToList();
                List<object> matchFields = rows
                    .Where(r => Regex.IsMatch(r.ParameterRole ?? string.Empty, "match|key|input|lookup", RegexOptions.IgnoreCase))
                    .Select(r => (object)new Dictionary<string, object?>
                    {
                        ["name"] = r.ParameterName ?? r.Target,
                        ["role"] = "Usage-derived match field",
                        ["confidence"] = r.Confidence,
                        ["source"] = "RuleRelationshipUsage"
                    })
                    .ToList();
                List<object> plugFields = rows
                    .Where(r => Regex.IsMatch(r.ParameterRole ?? string.Empty, "plug|output|destination|write", RegexOptions.IgnoreCase))
                    .Select(r => (object)new Dictionary<string, object?>
                    {
                        ["name"] = r.ParameterName ?? r.Target,
                        ["role"] = "Usage-derived plug field",
                        ["confidence"] = r.Confidence,
                        ["source"] = "RuleRelationshipUsage"
                    })
                    .ToList();

                return (object)new
                {
                    name = g.Key,
                    resourceType = "RuleUsageCandidate",
                    tableDriver = "Unknown",
                    canonical = false,
                    schemaParsed = false,
                    optionsParsed = false,
                    source = "RuleRelationshipUsage",
                    authority = "RuleUsageCandidate",
                    authorityNote = "Rules reference this table/SelectionList name, but no parsed SelectionList schema was found. Treat this as usage evidence only.",
                    confidence = rows.Any(r => string.Equals(r.Confidence, "High", StringComparison.OrdinalIgnoreCase)) ? "Medium" : "Low",
                    usageLinks = rows.Take(160).Select(r => new
                    {
                        r.ScopePath,
                        r.ScopeType,
                        r.ScopeName,
                        r.RuleIndex,
                        r.RuleGuid,
                        r.RuleName,
                        r.FunctionName,
                        r.Kind,
                        r.TargetType,
                        r.ParameterName,
                        r.ParameterRole,
                        r.Confidence
                    }).ToList(),
                    matchFields,
                    plugFields,
                    columns = Array.Empty<object>(),
                    options = Array.Empty<object>(),
                    diagnostics = new[] { "SelectionListSchemaNotParsed_RuleUsageCandidateOnly" },
                    resourceEvidence = new { hasConfig = false, hasPrivateTree = false, attributeHits = Array.Empty<object>(), privateTreeHits = Array.Empty<object>(), diagnostics = Array.Empty<string>() },
                    rawResourceDetails = (object?)null
                };
            })
            .ToList();
    }

private static bool LooksLikeSelectionListUsageRelationship(AcRuleRelationship relationship)
    {
        string blob = string.Join(" ", relationship.TargetType, relationship.Kind, relationship.FunctionName, relationship.ParameterRole, relationship.ParameterName, relationship.RelationshipReason);
        return Regex.IsMatch(blob, "SelectionList|Selection List|Table|TableLookup|UsesTable|IsInTable|SelectTable|PlugFuzzy|CheckSL|ClearSL|LogSL", RegexOptions.IgnoreCase);
    }

private static List<object> BuildStaticSelectionListOptions(ResourceDetail? detail)
    {
        string[] optionRoles =
        {
            "Persistence",
            "RerunTrigger",
            "OperatorPrompt",
            "NoGoodMatch",
            "EnterBehavior",
            "PlugOutcome",
            "RejectOutcome",
            "TableOption"
        };
        var rows = new List<object>();
        foreach (Dictionary<string, object?> hit in BuildStaticAttributeHits(detail, "SelectionList").Concat(BuildStaticPrivateTreeHits(detail?.PrivateTree, "SelectionList")))
        {
            string role = Convert.ToString(hit["role"]) ?? string.Empty;
            if (!optionRoles.Contains(role, StringComparer.OrdinalIgnoreCase))
                continue;

            rows.Add(new
            {
                role,
                name = Convert.ToString(hit.ContainsKey("key") ? hit["key"] : hit["name"]) ?? role,
                value = Convert.ToString(hit.ContainsKey("value") ? hit["value"] : hit["valuePreview"]) ?? string.Empty,
                source = Convert.ToString(hit.ContainsKey("source") ? hit["source"] : "ResourcePrivateTree") ?? "ResourceEvidence",
                confidence = Convert.ToString(hit["confidence"]) ?? "Medium"
            });
        }

        return rows;
    }

private static List<string> ExtractStaticResourceNamesByRole(ResourceDetail? detail, string resourceKind, string role)
    {
        return BuildStaticAttributeHits(detail, resourceKind)
            .Concat(BuildStaticPrivateTreeHits(detail?.PrivateTree, resourceKind))
            .Where(h => Eq(Convert.ToString(h["role"]), role))
            .SelectMany(h => ExtractStaticNamesFromText((Convert.ToString(h.ContainsKey("key") ? h["key"] : h["name"]) ?? string.Empty) + " " + (Convert.ToString(h.ContainsKey("value") ? h["value"] : h["valuePreview"]) ?? string.Empty)))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(x => x, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

private static IEnumerable<string> ExtractStaticNamesFromText(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            yield break;

        foreach (Match match in Regex.Matches(value, @"[A-Za-z][A-Za-z0-9_]{1,80}"))
        {
            string name = match.Value.Trim();
            if (!IsStaticNoiseName(name))
                yield return name;
        }
    }

private static bool IsStaticNoiseName(string value)
    {
        string v = value ?? string.Empty;
        if (Regex.IsMatch(v, "^template_\\d+$", RegexOptions.IgnoreCase))
            return true;

        return Regex.IsMatch(v, "^(fieldlist|fieldlistparameters|field|fields|list|parameter|parameters|paramlist|status|statusresults|result|return|code|rule|rules|table|tableinfo|selectionlist|selection|match|matches|matchfields|plug|plugs|plugfields|option|options|true|false|null|version|_version|modtime|tabledriver|_tabledriver|storetemplateset|template|header|charset|charsets|description|flags|resourcesubtype|fieldtypes)$", RegexOptions.IgnoreCase);
    }

private static bool IsStaticTableContainerName(string value)
    {
        return Regex.IsMatch(value ?? string.Empty, "^(tableinfo|schema|columns?|fields?|header|template_\\d+)$", RegexOptions.IgnoreCase);
    }

private static bool IsStaticTableColumnNoiseName(string value)
    {
        string v = value ?? string.Empty;
        if (Regex.IsMatch(v, "^template_\\d+$", RegexOptions.IgnoreCase))
            return true;

        return Regex.IsMatch(v, "^(columns?|table|tableinfo|schema|field|fields|version|_version|modtime|tabledriver|_tabledriver|storetemplateset|template|header|charset|charsets|description|flags|resourcesubtype|fieldtypes|dsn|login|password|odbc|externally derived)$", RegexOptions.IgnoreCase);
    }

private static bool LooksLikeStaticTableColumnName(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        string v = value.Trim();
        if (v.Length < 2 || v.Length > 80)
            return false;
        if (IsStaticTableColumnNoiseName(v))
            return false;
        if (Regex.IsMatch(v, "^[+-]?\\d+(\\.\\d+)?$"))
            return false;
        if (v.IndexOfAny(new[] { '/', '\\', ':', '{', '}', '[', ']', '"', '\'' }) >= 0)
            return false;

        return Regex.IsMatch(v, "^[A-Za-z][A-Za-z0-9_ .#&+-]*$", RegexOptions.CultureInvariant);
    }

private static bool LooksLikeStaticIdentifier(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        string v = value.Trim();
        if (v.Length < 2 || v.Length > 80)
            return false;
        if (IsStaticNoiseName(v))
            return false;
        if (Regex.IsMatch(v, "^[+-]?\\d+(\\.\\d+)?$"))
            return false;
        if (v.IndexOfAny(new[] { '/', '\\', ':', '{', '}', '[', ']', '"', '\'' }) >= 0)
            return false;

        return Regex.IsMatch(v, "^[A-Za-z][A-Za-z0-9_ .#&+-]*$", RegexOptions.CultureInvariant);
    }

private static List<object> BuildStaticUdfCallerBindings(AcRuleReport rules, AcTreeReport tree, string udfName)
    {
        return rules.Rules
            .Where(r => Eq(r.FunctionName, udfName) || (LooksLikeUdfIteratorName(r.FunctionName) && r.Parameters.Values.SelectMany(v => v).Any(value => Eq(value, udfName))))
            .OrderBy(r => r.ScopePath, StringComparer.OrdinalIgnoreCase)
            .ThenBy(r => r.RuleIndex)
            .Select(r => (object)new
            {
                scopeId = StaticScopeId(r.ScopePath, r.ScopeType, r.ScopeName),
                ruleNodeId = StaticNodeIdForRule(tree, r),
                ruleGuid = r.RuleGuid,
                ruleName = r.RuleName,
                functionName = r.FunctionName,
                bindingKind = Eq(r.FunctionName, udfName) ? "DirectFunctionCall" : "IteratorWrapperCall",
                parameters = r.Parameters
            })
            .ToList();
    }

private static bool LooksLikeUdfIteratorName(string? functionName)
    {
        return Regex.IsMatch(functionName ?? string.Empty, "foreach|for\\s*each|iterator|udf", RegexOptions.IgnoreCase);
    }

private static string StaticNodeIdForRule(AcTreeReport tree, AcRuleSummary rule)
    {
        AcTreeNode? byGuid = !string.IsNullOrWhiteSpace(rule.RuleGuid)
            ? tree.Nodes.FirstOrDefault(n => Eq(n.RuleGuid, rule.RuleGuid))
            : null;
        AcTreeNode? node = byGuid ?? tree.Nodes.FirstOrDefault(n =>
            n.IsRuleNode &&
            Eq(n.ScopePath, rule.ScopePath) &&
            n.RuleIndexWithinScope == rule.RuleIndex);
        return node == null ? string.Empty : "node-" + node.NodeId.ToString("000000");
    }

private static List<object> BuildStaticUdfParameterBindings(List<object> callers, List<string> fieldListParameters)
    {
        var rows = new List<object>();
        List<string> named = fieldListParameters
            .Where(p => !Regex.IsMatch(p, "^_?ParamList(?:OMRIndex)?\\d*$", RegexOptions.IgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
            .ToList();

        foreach (object caller in callers)
        {
            object? parametersObject = caller.GetType().GetProperty("parameters")?.GetValue(caller);
            if (parametersObject is not Dictionary<string, List<string>> parameters)
                continue;

            int ordinal = 0;
            foreach (KeyValuePair<string, List<string>> slot in parameters.OrderBy(p => p.Key, StringComparer.OrdinalIgnoreCase))
            {
                string mapped = ordinal < named.Count ? named[ordinal] : slot.Key ?? string.Empty;
                foreach (string value in slot.Value)
                {
                    bool hasNamedResourceInterface = ordinal < named.Count;
                    rows.Add(new
                    {
                        parameterName = mapped,
                        callerSlot = slot.Key,
                        callerValue = value,
                        confidence = EvidenceConfidenceModel.ToApiValue(EvidenceConfidenceModel.ForUdfCallerBinding(hasNamedResourceInterface, Regex.IsMatch(slot.Key ?? string.Empty, "^_?ParamList(?:OMRIndex)?\\d*$", RegexOptions.IgnoreCase))),
                        source = EvidenceConfidenceModel.SourceForUdfCallerBinding(hasNamedResourceInterface)
                    });
                }

                ordinal++;
            }
        }

        return rows;
    }

private static object BuildStaticUdfInternalRuleTree(string udfName, List<string> statusResults, List<Dictionary<string, object?>> bodyHits, ResourcePrivateNode? privateTree)
    {
        List<object> parsedRuleRows = TryParseUdfInternalRuleRowsFromPrivateTree(udfName, privateTree);
        bool hasPrivateTree = privateTree != null;
        string source = parsedRuleRows.Count > 0 ? "ResourcePrivateTreePackedRuleList" : bodyHits.Count > 0 ? "ResourcePrivateTreeTextSignals" : "Unavailable";
        string confidence = parsedRuleRows.Count > 0 ? "High" : bodyHits.Count > 0 ? "Medium" : "Low";

        List<object> candidateRows = parsedRuleRows.Count > 0
            ? parsedRuleRows
            : bodyHits.Select((hit, index) => (object)new
            {
                nodeId = "udf-private-" + (index + 1).ToString("000000", System.Globalization.CultureInfo.InvariantCulture),
                ordinal = index + 1,
                ruleName = string.IsNullOrWhiteSpace(Convert.ToString(hit["name"])) ? "Private body node " + (index + 1).ToString(System.Globalization.CultureInfo.InvariantCulture) : Convert.ToString(hit["name"]),
                functionName = Convert.ToString(hit["role"]) == "RuleBody" ? "PrivateRuleBody" : null,
                path = Convert.ToString(hit["path"]) ?? string.Empty,
                source = "ResourcePrivateTreeTextSignals",
                confidence = Convert.ToString(hit["confidence"]) ?? "Medium",
                textPreview = Convert.ToString(hit["valuePreview"]) ?? string.Empty,
                parameters = new Dictionary<string, List<string>>(),
                statusResults = Array.Empty<string>()
            }).ToList();

        string parseState = parsedRuleRows.Count > 0
            ? "Parsed"
            : candidateRows.Count > 0
                ? "PartiallyParsed"
                : hasPrivateTree ? "Opaque" : "Unavailable";

        return new
        {
            parsed = candidateRows.Count > 0,
            parseState,
            candidateRuleNodes = bodyHits,
            internalRuleList = new
            {
                ruleListId = "UDF/" + ViewerSafeId(udfName),
                name = udfName,
                source,
                confidence,
                statusResults,
                rules = candidateRows
            },
            diagnostics = candidateRows.Count > 0
                ? Array.Empty<string>()
                : hasPrivateTree ? new[] { "PrivateTreePresentButNoRuleBodySignals" } : new[] { "PrivateTreeUnavailable" }
        };
    }

private static List<object> TryParseUdfInternalRuleRowsFromPrivateTree(string udfName, ResourcePrivateNode? privateTree)
    {
        var rows = new List<object>();
        if (privateTree == null)
            return rows;

        foreach (ResourcePrivateNode node in EnumeratePrivateTree(privateTree))
        {
            byte[]? bytes = node.RawDataBytes;
            if (bytes == null || bytes.Length < 12)
                continue;

            foreach (var candidate in CandidatePackedRulePayloads(bytes))
            {
                var report = new AcTreeReport();
                var parser = new AcStructuralTreeParser(new AcTreeOptions
                {
                    IncludeAttributes = true,
                    MaxAttributeValueLength = 500,
                    MaxHierarchyDepth = 256,
                    MaxNodeEntryCount = 100000u,
                    MaskSensitiveValues = true
                }, report);

                try
                {
                    parser.ProcessRuleBytes(candidate.Bytes, "UDF/" + udfName, "UDF", udfName);
                }
                catch
                {
                    continue;
                }

                var parsed = report.Nodes
                    .Where(n => n.IsRuleNode)
                    .OrderBy(n => n.RuleIndexWithinScope)
                    .ThenBy(n => n.NodeId)
                    .ToList();

                if (parsed.Count == 0)
                    continue;

                foreach (AcTreeNode rule in parsed)
                {
                    rows.Add(new
                    {
                        nodeId = "udf-node-" + rule.NodeId.ToString("000000", System.Globalization.CultureInfo.InvariantCulture),
                        ordinal = rule.RuleIndexWithinScope > 0 ? rule.RuleIndexWithinScope : rows.Count + 1,
                        ruleName = rule.RuleName,
                        functionName = rule.FunctionName,
                        ruleGuid = rule.RuleGuid,
                        ruleId = rule.RuleId,
                        actionNames = rule.ActionNames,
                        statusResults = rule.ActionNames,
                        parameters = rule.Parameters,
                        attributes = rule.Attributes,
                        path = candidate.Offset == 0 ? node.Path : node.Path + "@" + candidate.Offset.ToString(System.Globalization.CultureInfo.InvariantCulture),
                        source = candidate.Offset == 0 ? "ResourcePrivateTreePackedRuleList" : "ResourcePrivateTreePackedRuleListEmbedded",
                        confidence = "High"
                    });
                }

                break;
            }

            if (rows.Count > 0)
                break;
        }

        return rows;
    }
}
