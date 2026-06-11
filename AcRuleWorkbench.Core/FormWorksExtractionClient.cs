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
    private readonly ILogger<FormWorksExtractionClient> _logger;

    public FormWorksExtractionClient(ILogger<FormWorksExtractionClient> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public ProbeReport Probe()
    {
        var report = new ProbeReport
        {
            Is64BitProcess = Environment.Is64BitProcess,
            BaseDirectory = AppDomain.CurrentDomain.BaseDirectory,
            CurrentDirectory = Environment.CurrentDirectory,
            PathEnvironmentVariable = Environment.GetEnvironmentVariable("PATH")
        };

        ProbeAssembly(report, "rribase_net");
        ProbeAssembly(report, "rrifwd_net");
        ProbeAssembly(report, "rridc_net");
        ProbeAssembly(report, "rriwf2_net");
        ProbeAssembly(report, "FormWorks.Core");
        ProbeAssembly(report, "FormWorks.Versioning");

        foreach (NativeVersionCheckResult check in NativeVersionChecker.RunOfficialChecks())
            report.NativeVersionChecks.Add(check);

        try
        {
            foreach (string nativeDll in NativeDependencyScanner.GetNativeDllImports())
                report.RequiredNativeDllNames.Add(nativeDll);

            foreach (var native in NativeDependencyScanner.ProbeNativeDependencies(report.BaseDirectory))
                report.NativeDependencies.Add(native);
        }
        catch (Exception ex)
        {
            report.Notes.Add("Could not reflect DllImport metadata. One or more managed dependencies may be missing.");
            report.Notes.Add(ex.GetType().Name + ": " + ex.Message);
        }

        report.Notes.Add("Official native version checks come from CheckExplicitDependencies() where available.");
        report.Notes.Add("Expected native DLLs from current dumps include rribase.dll, rrifwd.dll, rridc.dll, and rriwf2.dll.");
        report.Notes.Add("If BadImageFormatException occurs, rebuild x86/x64 to match the native DLLs.");
        report.Notes.Add("Workflow/inventory APIs require live server, port, worker type, and DCM runtime state. They are not exposed by default.");

        return report;
    }

    public FwdInspectionReport Inspect(FwdInspectionOptions options)
    {
        if (options == null)
            throw new ArgumentNullException(nameof(options));
        options.CancellationToken.ThrowIfCancellationRequested();

        if (options.RequireNativeOk)
            RequireNativeChecksPassed();

        string path = ResolveFwdPath(options.Path);

        if (!File.Exists(path) && !Directory.Exists(path))
            throw new FileNotFoundException($"FWD path was not found: {path}", path);

        _logger.LogInformation("Opening FWD path read-only: {Path}", path);

        try
        {
            using var session = new FwdSession(path);
            Fwd fwd = session.Client;

            var report = new FwdInspectionReport
            {
                Path = path
            };

            TryReadReleaseInfo(fwd, report);

            AddRangeSafe(report.Documents, () => fwd.GetDocumentNames(), report, "documents");
            AddRangeSafe(report.Pages, () => fwd.GetPageNames(), report, "pages");
            AddRangeSafe(report.Batches, () => fwd.GetBatchNames(), report, "batches");
            AddRangeSafe(report.Processes, () => fwd.GetProcessNames(), report, "processes");
            PopulateConfiguredHierarchy(fwd, report);

            foreach (string page in report.Pages)
            {
                var bucket = new PageVariantBucket { Page = page };
                AddRangeSafe(bucket.Variants, () => fwd.GetVariantNames(page), report, $"variants for page '{page}'");
                report.PageVariants.Add(bucket);
            }

            foreach (string resourceType in options.ResourceTypes.Where(s => !string.IsNullOrWhiteSpace(s)))
            {
                var bucket = new ResourceBucket { Type = resourceType };
                AddRangeSafe(bucket.Names, () => fwd.GetResourceNames(resourceType), report, $"resources '{resourceType}'");
                report.Resources.Add(bucket);
            }

            PopulateResourceDetails(fwd, options, report);

            if (options.IncludeFields)
                PopulateFields(fwd, report);

            return report;
        }
        catch (Exception ex)
        {
            throw FormWorksInteropException.From("Failed to inspect FWD configuration.", ex);
        }
    }

    public OcrInspectionReport InspectOcr(OcrInspectionOptions options)
    {
        if (options == null)
            throw new ArgumentNullException(nameof(options));
        options.CancellationToken.ThrowIfCancellationRequested();

        if (options.RequireNativeOk)
            RequireNativeChecksPassed();

        if (string.IsNullOrWhiteSpace(options.Path))
            throw new ArgumentException("OCR path is required.", nameof(options));

        string path = Path.GetFullPath(options.Path);

        if (!File.Exists(path))
            throw new FileNotFoundException($"OCR result file was not found: {path}", path);

        _logger.LogInformation("Opening OCR2 result file: {Path}", path);

        try
        {
            using var result = new OCR2Result(path);

            var report = new OcrInspectionReport
            {
                Path = path
            };

            try
            {
                report.FileType = result.GetFileType().ToString();
            }
            catch (Exception ex)
            {
                report.Warnings.Add("Could not read OCR file type: " + ex.Message);
            }

            try
            {
                foreach (string fieldName in result.GetFieldNames())
                    report.FieldNames.Add(fieldName);
            }
            catch (Exception ex)
            {
                report.Warnings.Add("Could not read OCR field names: " + ex.Message);
            }

            return report;
        }
        catch (Exception ex)
        {
            throw FormWorksInteropException.From("Failed to inspect OCR2 result file.", ex);
        }
    }

    // Captures type-level/resource-level config and private STC trees for global resources.
public SmokeReport Smoke(SmokeOptions options)
    {
        if (options == null)
            throw new ArgumentNullException(nameof(options));
        options.CancellationToken.ThrowIfCancellationRequested();

        var report = new SmokeReport();

        try
        {
            report.Probe = Probe();

            if (options.RequireNativeOk && !report.Probe.NativeChecksPassed)
                report.Failures.Add("Native version checks failed. Run doctor for details.");
        }
        catch (Exception ex)
        {
            report.Failures.Add("Probe failed: " + ex.Message);
        }

        if (!string.IsNullOrWhiteSpace(options.FwdPath))
        {
            try
            {
                report.Fwd = Inspect(new FwdInspectionOptions
                {
                    Path = options.FwdPath,
                    IncludeFields = false,
                    RequireNativeOk = false
                });
            }
            catch (Exception ex)
            {
                report.Failures.Add("FWD smoke test failed: " + ex.Message);
            }
        }
        else
        {
            report.Warnings.Add("No --fwd path supplied; FWD smoke test skipped.");
        }

        if (!string.IsNullOrWhiteSpace(options.OcrPath))
        {
            try
            {
                report.Ocr = InspectOcr(new OcrInspectionOptions
                {
                    Path = options.OcrPath,
                    RequireNativeOk = false
                });
            }
            catch (Exception ex)
            {
                report.Failures.Add("OCR smoke test failed: " + ex.Message);
            }
        }
        else
        {
            report.Warnings.Add("No --ocr path supplied; OCR smoke test skipped.");
        }

        report.Success = report.Failures.Count == 0;
        return report;
    }


    public StcTreeReport InspectProcessTree(StcTraversalOptions options)
    {
        if (options == null)
            throw new ArgumentNullException(nameof(options));
        options.CancellationToken.ThrowIfCancellationRequested();

        if (options.RequireNativeOk)
            RequireNativeChecksPassed();

        if (string.IsNullOrWhiteSpace(options.ProcessName))
            throw new ArgumentException("Process name is required. Use --process AC, FIP, Store, OCR, etc.", nameof(options));

        options.MaxDepth = Math.Max(0, options.MaxDepth);
        options.MaxNodes = Math.Max(1, options.MaxNodes);
        options.MaxPreviewBytes = Math.Max(0, options.MaxPreviewBytes);

        string path = ResolveFwdPath(options.Path);

        if (!File.Exists(path) && !Directory.Exists(path))
            throw new FileNotFoundException($"FWD path was not found: {path}", path);

        _logger.LogInformation("Opening FWD path read-only for STC traversal: {Path}", path);

        try
        {
            using var session = new FwdSession(path);
            Fwd fwd = session.Client;

            var report = new StcTreeReport
            {
                FwdPath = path,
                ProcessName = options.ProcessName!.Trim(),
                MaxDepth = options.MaxDepth,
                MaxNodes = options.MaxNodes
            };

            using IDisposable? root = fwd.GetProcessNodePrivateNoCache(report.ProcessName) as IDisposable;
            if (root == null)
            {
                report.Warnings.Add($"Process '{report.ProcessName}' did not return a disposable node handle.");
                return report;
            }

            TraverseStcNode(root, report, options, name: report.ProcessName, logicalPath: report.ProcessName, depth: 0);
            return report;
        }
        catch (Exception ex)
        {
            throw FormWorksInteropException.From($"Failed to inspect private STC tree for process '{options.ProcessName}'.", ex);
        }
    }

    public FipInspectionReport InspectFip(FipInspectionOptions options)
    {
        if (options == null)
            throw new ArgumentNullException(nameof(options));
        options.CancellationToken.ThrowIfCancellationRequested();

        if (options.RequireNativeOk)
            RequireNativeChecksPassed();

        string path = ResolveFwdPath(options.Path);

        if (!File.Exists(path) && !Directory.Exists(path))
            throw new FileNotFoundException($"FWD path was not found: {path}", path);

        options.MaxVariants = Math.Max(1, options.MaxVariants);

        _logger.LogInformation("Opening FWD path read-only for FIP inspection: {Path}", path);

        try
        {
            using var session = new FwdSession(path);
            Fwd fwd = session.Client;

            var report = new FipInspectionReport
            {
                FwdPath = path,
                ProcessName = string.IsNullOrWhiteSpace(options.ProcessName) ? "FIP" : options.ProcessName.Trim()
            };

            var pageVariantPairs = ResolvePageVariantPairs(fwd, options, report);

            foreach (var pair in pageVariantPairs.Take(options.MaxVariants))
            {
                var variantReport = new FipVariantReport
                {
                    Page = pair.Page,
                    Variant = pair.Variant
                };

                try
                {
                    object pageVariant = fwd.PageVariant(pair.Page, pair.Variant);

                    try
                    {
                        object? dropoutRegionsObj = InvokeMethod(pageVariant, "GetDropoutRegionInfo", report.ProcessName);
                        if (dropoutRegionsObj is ICollection dropoutCollection)
                            variantReport.DropoutRegionCount = dropoutCollection.Count;

                        if (dropoutRegionsObj is IEnumerable dropoutRegions)
                        {
                            foreach (object region in dropoutRegions)
                            {
                                object? location = GetPropertyValue(region, "Location");
                                object? flags = GetPropertyValue(region, "Flags");
                                variantReport.DropoutRegions.Add(new FipDropoutRegionSummary
                                {
                                    Geometry = location is System.Drawing.Rectangle rect ? FormatRect(rect) : string.Empty,
                                    Flags = flags?.ToString() ?? string.Empty
                                });
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        variantReport.Warnings.Add("Could not read dropout regions: " + ex.Message);
                    }

                    try
                    {
                        object? omrFieldsObj = InvokeMethod(pageVariant, "GetOMRFieldConfigs", report.ProcessName);
                        if (omrFieldsObj is ICollection omrCollection)
                            variantReport.OmrFieldCount = omrCollection.Count;

                        if (omrFieldsObj is IEnumerable omrFields)
                        {
                            foreach (object omr in omrFields)
                            {
                                object? subfieldsObj = GetPropertyValue(omr, "OMRSubfields");
                                var omrSummary = new FipOmrFieldSummary
                                {
                                    Name = GetPropertyValue(omr, "Name")?.ToString() ?? string.Empty,
                                    Geometry = GetPropertyValue(omr, "Geometry") is System.Drawing.Rectangle rect ? FormatRect(rect) : string.Empty,
                                    FieldType = ToUInt32Safe(GetPropertyValue(omr, "FieldType")),
                                    CheckType = ToUInt32Safe(GetPropertyValue(omr, "CheckType")),
                                    AvgCount = ToUInt32Safe(GetPropertyValue(omr, "AvgCount")),
                                    Flags = ToUInt32Safe(GetPropertyValue(omr, "Flags")),
                                    UseAura = ToBoolSafe(GetPropertyValue(omr, "UseAura")),
                                    CheckThick = ToBoolSafe(GetPropertyValue(omr, "CheckThick")),
                                    LetterOval = ToBoolSafe(GetPropertyValue(omr, "LetterOval")),
                                    SubfieldCount = subfieldsObj is ICollection subfieldCollection ? subfieldCollection.Count : 0
                                };

                                if (subfieldsObj is IEnumerable subfields)
                                {
                                    foreach (object sub in subfields)
                                    {
                                        omrSummary.Subfields.Add(new FipOmrSubfieldSummary
                                        {
                                            Name = GetPropertyValue(sub, "Name")?.ToString() ?? string.Empty,
                                            Geometry = GetPropertyValue(sub, "Geometry") is System.Drawing.Rectangle subRect ? FormatRect(subRect) : string.Empty,
                                            CheckLevel = ToUInt32Safe(GetPropertyValue(sub, "CheckLevel")),
                                            WidthHorz = ToUInt32Safe(GetPropertyValue(sub, "WidthHorz")),
                                            WidthVert = ToUInt32Safe(GetPropertyValue(sub, "WidthVert")),
                                            AuraHorz = ToUInt32Safe(GetPropertyValue(sub, "AuraHorz")),
                                            AuraVert = ToUInt32Safe(GetPropertyValue(sub, "AuraVert")),
                                            Baseline = ToUInt32Safe(GetPropertyValue(sub, "Baseline"))
                                        });
                                    }
                                }

                                variantReport.OmrFields.Add(omrSummary);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        variantReport.Warnings.Add("Could not read OMR fields: " + ex.Message);
                    }
                }
                catch (Exception ex)
                {
                    variantReport.Warnings.Add("Could not inspect page variant: " + ex.Message);
                }

                report.Variants.Add(variantReport);
                report.VariantCountInspected++;
            }

            report.Truncated = pageVariantPairs.Count > options.MaxVariants;
            if (report.Truncated)
                report.Warnings.Add($"Variant inspection truncated at {options.MaxVariants} of {pageVariantPairs.Count} variants. Increase --max-variants if needed.");

            return report;
        }
        catch (Exception ex)
        {
            throw FormWorksInteropException.From("Failed to inspect FIP process data.", ex);
        }
    }


    public AcRuleReport InspectAcRules(AcRuleOptions options)
    {
        if (options == null)
            throw new ArgumentNullException(nameof(options));
        options.CancellationToken.ThrowIfCancellationRequested();

        if (options.RequireNativeOk)
            RequireNativeChecksPassed();

        string path = ResolveFwdPath(options.Path);

        if (!File.Exists(path) && !Directory.Exists(path))
            throw new FileNotFoundException($"FWD path was not found: {path}", path);

        string processName = string.IsNullOrWhiteSpace(options.ProcessName) ? "AC" : options.ProcessName.Trim();
        options.MaxRawTokensPerScope = Math.Max(0, options.MaxRawTokensPerScope);

        _logger.LogInformation("Opening FWD path read-only for AC rule parsing: {Path}", path);

        try
        {
            using var session = new FwdSession(path);
            Fwd fwd = session.Client;

            var report = new AcRuleReport
            {
                FwdPath = path,
                ProcessName = processName
            };

            using IDisposable? root = fwd.GetProcessNodePrivateNoCache(processName) as IDisposable;
            if (root == null)
            {
                report.Warnings.Add($"Process '{processName}' did not return a disposable node handle.");
                return report;
            }

            foreach (string branchName in new[] { "Documents", "Pages", "System" })
            {
                object? branch = null;
                try
                {
                    branch = InvokeMethod(root, "GetChildNode", branchName, false);
                    if (branch == null)
                    {
                        report.Warnings.Add($"AC branch '{branchName}' returned null.");
                        continue;
                    }

                    if (string.Equals(branchName, "System", StringComparison.OrdinalIgnoreCase))
                    {
                        ParseAcScopeNode(report, options, branch, "AC/System", "System", "System");
                        continue;
                    }

                    object? rawChildren = GetPropertyValue(branch, "ChildNames");
                    string[] childNames = rawChildren as string[] ?? Array.Empty<string>();
                    foreach (string childName in childNames.Where(c => !c.StartsWith(".", StringComparison.Ordinal)).OrderBy(c => c, StringComparer.OrdinalIgnoreCase))
                    {
                        object? child = null;
                        try
                        {
                            child = InvokeMethod(branch, "GetChildNode", childName, false);
                            if (child == null)
                                continue;

                            ParseAcScopeNode(
                                report,
                                options,
                                child,
                                $"AC/{branchName}/{childName}",
                                branchName.EndsWith("s", StringComparison.OrdinalIgnoreCase) ? branchName.Substring(0, branchName.Length - 1) : branchName,
                                childName);
                        }
                        catch (Exception ex)
                        {
                            report.Warnings.Add($"Could not parse AC scope AC/{branchName}/{childName}: {ex.Message}");
                        }
                        finally
                        {
                            if (child is IDisposable disposableChild)
                                disposableChild.Dispose();
                        }
                    }
                }
                catch (Exception ex)
                {
                    report.Warnings.Add($"Could not inspect AC branch '{branchName}': {ex.Message}");
                }
                finally
                {
                    if (branch is IDisposable disposableBranch)
                        disposableBranch.Dispose();
                }
            }

            AnnotateDisabledStates(report, inheritDisabled: true);
            ApplyAcRuleFilters(report, options);
            report.RebuildCounts();
            return report;
        }
        catch (Exception ex)
        {
            throw FormWorksInteropException.From("Failed to parse AC rules.", ex);
        }
    }


    public AcRelationshipReport TraceAcRelationships(AcTraceOptions options)
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

        AcRuleReport ruleReport = InspectAcRules(ruleOptions);
        AcRelationshipReport relationshipReport = BuildRelationshipReport(ruleReport, includeRules: options.IncludeRules);

        ApplyRelationshipFilters(relationshipReport, options);

        if (options.MaxRelationships > 0 && relationshipReport.Relationships.Count > options.MaxRelationships)
        {
            var kept = relationshipReport.Relationships.Take(options.MaxRelationships).ToList();
            relationshipReport.Relationships.Clear();
            relationshipReport.Relationships.AddRange(kept);
            relationshipReport.Truncated = true;
            relationshipReport.Warnings.Add($"Relationship output truncated at {options.MaxRelationships}. Increase --max-relationships for full output.");
        }

        relationshipReport.RebuildCounts();
        return relationshipReport;
    }

    public AcIndexReport BuildAcIndex(AcRuleOptions options)
    {
        if (options == null)
            throw new ArgumentNullException(nameof(options));
        options.CancellationToken.ThrowIfCancellationRequested();

        AcRuleReport rules = InspectAcRules(options);
        AcRelationshipReport relationships = BuildRelationshipReport(rules, includeRules: false);
        relationships.RebuildCounts();
        var index = new AcIndexReport();
        index.Rebuild(rules, relationships);
        return index;
    }

    public AcDiagnosticsReport BuildAcDiagnostics(AcRuleOptions options)
    {
        if (options == null)
            throw new ArgumentNullException(nameof(options));
        options.CancellationToken.ThrowIfCancellationRequested();

        var ruleOptions = new AcRuleOptions
        {
            Path = options.Path,
            ProcessName = string.IsNullOrWhiteSpace(options.ProcessName) ? "AC" : options.ProcessName,
            Scope = options.Scope,
            Term = options.Term,
            Function = options.Function,
            RequireNativeOk = options.RequireNativeOk
        };

        AcRuleReport rules = InspectAcRules(ruleOptions);
        AcRelationshipReport relationships = BuildRelationshipReport(rules, includeRules: false);
        relationships.RebuildCounts();

        var report = new AcDiagnosticsReport
        {
            FwdPath = rules.FwdPath,
            ProcessName = rules.ProcessName,
            ScopeCount = rules.ScopeCount,
            RuleCount = rules.RuleCount,
            RelationshipCount = relationships.RelationshipCount,
            ProvenFlowEdgeCount = 0,
            ParsedFlowEdgeCount = 0,
            HeuristicFlowEdgeCount = 0,
            UnknownFlowEdgeCount = 0,
            MissingRuleGuidCount = rules.Rules.Count(r => string.IsNullOrWhiteSpace(r.RuleGuid)),
            MissingRuleIdCount = rules.Rules.Count(r => string.IsNullOrWhiteSpace(r.RuleId)),
            MissingFunctionCount = rules.Rules.Count(r => string.IsNullOrWhiteSpace(r.FunctionName)),
            RulesWithActionNamesCount = rules.Rules.Count(r => r.ActionNames.Count > 0),
            RulesWithActionMapCount = rules.Rules.Count(r => !string.IsNullOrWhiteSpace(r.ActionMapRaw)),
            RulesWithSkipIdCount = rules.Rules.Count(r => r.SkipId.HasValue),
            RulesWithBackupSkipIdCount = rules.Rules.Count(r => r.BackupSkipId.HasValue),
            UnknownActionTargetCount = 0,
            UnresolvedSkipTargetCount = 0,
            DisabledDirectCount = rules.Rules.Count(r => r.DisabledState == AcDisabledStates.DisabledDirect),
            DisabledInheritedCount = rules.Rules.Count(r => r.DisabledState == AcDisabledStates.DisabledInherited),
            PossiblyDisabledInheritedCount = rules.Rules.Count(r => r.DisabledState == AcDisabledStates.PossiblyDisabledInherited),
            PossibleDisabledSequenceOnlyCount = rules.Rules.Count(r => r.DisabledState == AcDisabledStates.PossibleDisabledSequenceOnly)
        };

        report.Warnings.AddRange(rules.Warnings);
        report.Warnings.AddRange(relationships.Warnings);

        AddCounts(report.RulesByScope, rules.Rules.GroupBy(r => r.ScopePath));
        AddCounts(report.RulesByFunction, rules.Rules.GroupBy(r => string.IsNullOrWhiteSpace(r.FunctionName) ? "(missing)" : r.FunctionName));

        foreach (var duplicate in rules.Rules
                     .Where(r => !string.IsNullOrWhiteSpace(r.RuleGuid))
                     .GroupBy(r => r.RuleGuid!, StringComparer.OrdinalIgnoreCase)
                     .Where(g => g.Count() > 1)
                     .OrderByDescending(g => g.Count())
                     .ThenBy(g => g.Key)
                     .Take(100))
        {
            var item = new AcDuplicateRuleGuidDiagnostic
            {
                RuleGuid = duplicate.Key,
                Count = duplicate.Count()
            };
            foreach (AcRuleSummary rule in duplicate.Take(25))
                item.Occurrences.Add($"{rule.ScopePath} #{rule.RuleIndex} {rule.RuleName}".Trim());
            report.DuplicateRuleGuids.Add(item);
        }

        AddDiagnostic(report, "Warning", "Parser", "Rules are missing RuleID, which limits SkipID/ActionMap resolution.", report.MissingRuleIdCount, rules.Rules.Where(r => string.IsNullOrWhiteSpace(r.RuleId)).Select(FormatRuleExample));
        AddDiagnostic(report, "Warning", "Parser", "Rules have action names but no decoded ActionMap target.", report.RulesWithActionNamesCount - report.RulesWithActionMapCount, rules.Rules.Where(r => r.ActionNames.Count > 0 && string.IsNullOrWhiteSpace(r.ActionMapRaw)).Select(FormatRuleExample));
        AddDiagnostic(report, "Info", "Disabled", "Rules are directly disabled by source marker.", report.DisabledDirectCount, rules.Rules.Where(r => r.DisabledState == AcDisabledStates.DisabledDirect).Select(FormatRuleExample));
        AddDiagnostic(report, "Info", "Disabled", "Rules have possible disabled evidence from flat sequence fallback only. This is audit-only evidence, not structural inheritance.", report.PossibleDisabledSequenceOnlyCount, rules.Rules.Where(r => r.DisabledState == AcDisabledStates.PossibleDisabledSequenceOnly).Select(FormatRuleExample));

        return report;
    }
    private static void AddCounts<T>(List<AcRuleCount> target, IEnumerable<IGrouping<string?, T>> groups)
    {
        target.Clear();
        target.AddRange(groups
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key ?? string.Empty)
            .Select(g => new AcRuleCount { Name = string.IsNullOrWhiteSpace(g.Key) ? "(blank)" : g.Key!, Count = g.Count() }));
    }

    private static void AddDiagnostic(AcDiagnosticsReport report, string severity, string category, string message, int count, IEnumerable<string> examples)
    {
        if (count <= 0)
            return;

        var diagnostic = new AcParserDiagnostic
        {
            Severity = severity,
            Category = category,
            Message = message,
            Count = count
        };
        diagnostic.Examples.AddRange(examples.Where(e => !string.IsNullOrWhiteSpace(e)).Take(20));
        report.Diagnostics.Add(diagnostic);
    }

    private static string FormatRuleExample(AcRuleSummary rule)
    {
        return $"{rule.ScopePath} #{rule.RuleIndex} {rule.RuleName} [{rule.FunctionName}]".Trim();
    }

    private static string FormatFlowEdgeExample(AcRuleFlowEdge edge)
    {
        string to = edge.ToRuleIndex.HasValue ? " -> #" + edge.ToRuleIndex.Value + " " + edge.ToRuleName : " -> unresolved";
        return $"{edge.ScopePath} #{edge.FromRuleIndex} {edge.FromRuleName} --{edge.ActionName ?? edge.EdgeKind}--{to}".Trim();
    }

public AcTreeReport BuildAcTree(AcTreeOptions options)
    {
        if (options == null)
            throw new ArgumentNullException(nameof(options));
        options.CancellationToken.ThrowIfCancellationRequested();

        string path = ResolveFwdPath(options.Path);
        if (!File.Exists(path))
            throw new FileNotFoundException("FWD configuration file was not found.", path);

        string processName = string.IsNullOrWhiteSpace(options.ProcessName) ? "AC" : options.ProcessName.Trim();
        _logger.LogInformation("Opening FWD path read-only for structural AC tree parsing: {Path}", path);

        try
        {
            using var session = new FwdSession(path);
            Fwd fwd = session.Client;

            var report = new AcTreeReport
            {
                FwdPath = path,
                ProcessName = processName
            };

            using IDisposable? root = fwd.GetProcessNodePrivateNoCache(processName) as IDisposable;
            if (root == null)
            {
                report.Warnings.Add($"Process '{processName}' did not return a disposable node handle.");
                return report;
            }

            var parser = new AcStructuralTreeParser(options, report);

            foreach (string branchName in new[] { "Documents", "Pages", "System" })
            {
                object? branch = null;
                try
                {
                    branch = InvokeMethod(root, "GetChildNode", branchName, false);
                    if (branch == null)
                    {
                        report.Warnings.Add($"AC branch '{branchName}' returned null.");
                        continue;
                    }

                    if (string.Equals(branchName, "System", StringComparison.OrdinalIgnoreCase))
                    {
                        ParseAcStructuralScopeNode(parser, report, options, branch, "AC/System", "System", "System");
                        continue;
                    }

                    object? rawChildren = GetPropertyValue(branch, "ChildNames");
                    string[] childNames = rawChildren as string[] ?? Array.Empty<string>();
                    foreach (string childName in childNames.Where(c => !c.StartsWith(".", StringComparison.Ordinal)).OrderBy(c => c, StringComparer.OrdinalIgnoreCase))
                    {
                        if (!string.IsNullOrWhiteSpace(options.Scope))
                        {
                            string scopeFilter = options.Scope!.Trim();
                            if (childName.IndexOf(scopeFilter, StringComparison.OrdinalIgnoreCase) < 0
                                && $"AC/{branchName}/{childName}".IndexOf(scopeFilter, StringComparison.OrdinalIgnoreCase) < 0)
                            {
                                continue;
                            }
                        }

                        object? child = null;
                        try
                        {
                            child = InvokeMethod(branch, "GetChildNode", childName, false);
                            if (child == null)
                                continue;

                            ParseAcStructuralScopeNode(
                                parser,
                                report,
                                options,
                                child,
                                $"AC/{branchName}/{childName}",
                                branchName.EndsWith("s", StringComparison.OrdinalIgnoreCase) ? branchName.Substring(0, branchName.Length - 1) : branchName,
                                childName);
                        }
                        catch (Exception ex)
                        {
                            report.Warnings.Add($"Could not parse structural AC scope AC/{branchName}/{childName}: {ex.Message}");
                        }
                        finally
                        {
                            if (child is IDisposable disposableChild)
                                disposableChild.Dispose();
                        }
                    }
                }
                catch (Exception ex)
                {
                    report.Warnings.Add($"Could not inspect AC branch '{branchName}' for structural tree: {ex.Message}");
                }
                finally
                {
                    if (branch is IDisposable disposableBranch)
                        disposableBranch.Dispose();
                }
            }

            parser.ApplyInheritedDisabledState();
            ApplyAcTreeFilters(report, options);
            report.RebuildCounts();
            return report;
        }
        catch (Exception ex)
        {
            throw FormWorksInteropException.From("Failed to parse structural AC tree.", ex);
        }
    }

    private static void ParseAcStructuralScopeNode(
        AcStructuralTreeParser parser,
        AcTreeReport report,
        AcTreeOptions options,
        object node,
        string scopePath,
        string scopeType,
        string scopeName)
    {
        byte[] bytes = ReadNodePayloadBytes(node);
        if (bytes.Length == 0)
        {
            report.Warnings.Add($"No Data bytes found for structural AC scope {scopePath}. Falling back to text parser may still work for ac-rules, but ac-tree cannot prove hierarchy here.");
        }

        parser.ProcessRuleBytes(bytes, scopePath, scopeType, scopeName);
    }

    private static byte[] ReadNodePayloadBytes(object node)
    {
        try
        {
            object? data = GetPropertyValue(node, "Data");
            if (data is byte[] bytes && bytes.Length > 0)
                return bytes;
        }
        catch
        {
            // No readable binary data.
        }

        return Array.Empty<byte>();
    }

    private static void ApplyAcTreeFilters(AcTreeReport report, AcTreeOptions options)
    {
        if (report == null || options == null)
            return;

        if (!string.IsNullOrWhiteSpace(options.Term))
        {
            string term = options.Term!.Trim();
            var keepNodeIds = new HashSet<int>(report.Nodes
                .Where(n => AcTreeNodeContains(n, term))
                .Select(n => n.NodeId));

            report.Nodes.RemoveAll(n => !keepNodeIds.Contains(n.NodeId));
            report.Edges.RemoveAll(e => !keepNodeIds.Contains(e.FromNodeId) || !keepNodeIds.Contains(e.ToNodeId));
        }

        if (!string.IsNullOrWhiteSpace(options.Scope))
        {
            string scope = options.Scope!.Trim();
            report.Scopes.RemoveAll(s => s.ScopePath.IndexOf(scope, StringComparison.OrdinalIgnoreCase) < 0 && s.ScopeName.IndexOf(scope, StringComparison.OrdinalIgnoreCase) < 0);
            var allowedScopes = new HashSet<string>(report.Scopes.Select(s => s.ScopePath), StringComparer.OrdinalIgnoreCase);
            report.Nodes.RemoveAll(n => !allowedScopes.Contains(n.ScopePath));
            report.Edges.RemoveAll(e => !allowedScopes.Contains(e.ScopePath));
        }
    }

    private static bool AcTreeNodeContains(AcTreeNode node, string term)
    {
        if (node == null || string.IsNullOrWhiteSpace(term))
            return true;

        bool Contains(string? value) => value?.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0;
        return Contains(node.ScopePath)
            || Contains(node.ScopeName)
            || Contains(node.RuleGuid)
            || Contains(node.RuleId)
            || Contains(node.RuleName)
            || Contains(node.FunctionName)
            || Contains(node.Description)
            || node.ActionNames.Any(Contains)
            || node.Sources.Any(Contains)
            || node.Parameters.Any(p => Contains(p.Key) || p.Value.Any(Contains));
    }

private readonly struct PackedRulePayloadCandidate
    {
        public PackedRulePayloadCandidate(byte[] bytes, int offset)
        {
            Bytes = bytes;
            Offset = offset;
        }

        public byte[] Bytes { get; }
        public int Offset { get; }
    }

private static string StaticRelationshipRuleKey(AcRuleSummary rule)
    {
        return string.Join("|", StaticScopeId(rule.ScopePath, rule.ScopeType, rule.ScopeName), rule.RuleGuid ?? string.Empty, rule.RuleIndex.ToString(), rule.RuleName ?? string.Empty, rule.FunctionName ?? string.Empty);
    }

private static void AddIdTargetEdge(AcRuleFlowReport report, AcRuleFlowScope scope, AcRuleSummary rule, int targetId, Dictionary<int, AcRuleSummary> byRuleId, string edgeKind, string evidenceKey)
    {
        if (byRuleId.TryGetValue(targetId, out AcRuleSummary target))
        {
            AddFlowEdge(report, scope, CreateFlowEdge(rule, target, edgeKind, AcEvidenceConfidence.Parsed, null, evidenceKey, evidenceKey + " resolved to RuleID " + targetId + "."));
            return;
        }

        AddFlowEdge(report, scope, new AcRuleFlowEdge
        {
            ScopePath = rule.ScopePath,
            FromRuleIndex = rule.RuleIndex,
            FromRuleGuid = rule.RuleGuid,
            FromRuleName = rule.RuleName,
            EdgeKind = AcRuleFlowEdgeKind.UnresolvedSkipTarget,
            Confidence = AcEvidenceConfidence.Parsed,
            ResolutionStatus = "Unresolved",
            EvidenceKey = evidenceKey,
            Evidence = evidenceKey + "=" + targetId + " was present but no matching _RuleID was found in the parsed scope.",
            RawToken = targetId.ToString()
        });
    }

    private static AcRuleFlowEdge CreateFlowEdge(AcRuleSummary from, AcRuleSummary to, string edgeKind, string confidence, string? actionName, string evidenceKey, string evidence)
    {
        return new AcRuleFlowEdge
        {
            ScopePath = from.ScopePath,
            FromRuleIndex = from.RuleIndex,
            FromRuleGuid = from.RuleGuid,
            FromRuleName = from.RuleName,
            ToRuleIndex = to.RuleIndex,
            ToRuleGuid = to.RuleGuid,
            ToRuleName = to.RuleName,
            ActionName = actionName,
            StatusResultName = actionName,
            EdgeKind = edgeKind,
            Confidence = confidence,
            ResolutionStatus = "Resolved",
            EvidenceKey = evidenceKey,
            Evidence = evidence
        };
    }

    private static void AddFlowEdge(AcRuleFlowReport report, AcRuleFlowScope scope, AcRuleFlowEdge edge)
    {
        report.Edges.Add(edge);
    }

    private static void FilterFlowFromRule(AcRuleFlowReport flow, int? fromRuleIndex, string? fromRuleGuid)
    {
        var matchingKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (AcRuleFlowNode node in flow.Nodes)
        {
            bool match = (fromRuleIndex.HasValue && node.RuleIndex == fromRuleIndex.Value) ||
                         (!string.IsNullOrWhiteSpace(fromRuleGuid) && string.Equals(node.RuleGuid, fromRuleGuid!.Trim(), StringComparison.OrdinalIgnoreCase));
            if (match)
                matchingKeys.Add(node.ScopePath + "#" + node.RuleIndex);
        }

        if (matchingKeys.Count == 0)
        {
            flow.Nodes.Clear();
            flow.Edges.Clear();
            flow.Scopes.Clear();
            flow.Warnings.Add("No matching --from-rule or --from-guid was found.");
            flow.RebuildCounts();
            return;
        }

        List<AcRuleFlowEdge> edges = flow.Edges
            .Where(e => matchingKeys.Contains(e.ScopePath + "#" + e.FromRuleIndex) ||
                        (e.ToRuleIndex.HasValue && matchingKeys.Contains(e.ScopePath + "#" + e.ToRuleIndex.Value)))
            .ToList();

        var nodeKeys = new HashSet<string>(edges.Select(e => e.ScopePath + "#" + e.FromRuleIndex), StringComparer.OrdinalIgnoreCase);
        foreach (AcRuleFlowEdge edge in edges.Where(e => e.ToRuleIndex.HasValue))
            nodeKeys.Add(edge.ScopePath + "#" + edge.ToRuleIndex!.Value);

        flow.Edges.Clear();
        flow.Edges.AddRange(edges);
        flow.Nodes.RemoveAll(n => !nodeKeys.Contains(n.ScopePath + "#" + n.RuleIndex));
        var scopes = new HashSet<string>(flow.Nodes.Select(n => n.ScopePath), StringComparer.OrdinalIgnoreCase);
        flow.Scopes.RemoveAll(s => !scopes.Contains(s.ScopePath));
        flow.RebuildCounts();
    }

    private static bool IsTerminalAction(string actionName)
    {
        if (string.IsNullOrWhiteSpace(actionName))
            return false;

        return actionName.IndexOf("Reject", StringComparison.OrdinalIgnoreCase) >= 0 ||
               actionName.IndexOf("Do Nothing", StringComparison.OrdinalIgnoreCase) >= 0 ||
               actionName.IndexOf("None", StringComparison.OrdinalIgnoreCase) >= 0;
    }

    private static bool TryParseInt(string? value, out int parsed)
    {
        return int.TryParse(value, out parsed);
    }

    private static int? ParseIntOrNull(string? value)
    {
        return int.TryParse(value, out int parsed) ? parsed : null;
    }

private sealed class ParameterClassification
    {
        public string TargetType { get; set; } = "Parameter";

        public string Kind { get; set; } = "UsesParameter";

        public string ParameterRole { get; set; } = "Parameter";

        public bool IsOptionParameter { get; set; }
    }

private static readonly string[] KnownOptionNames =
    {
        "RegularExpression",
        "MaxLength",
        "MinLength",
        "DateFormat",
        "LinesFrom",
        "LinesTo",
        "DelBlanksBefore",
        "DelBlanksAfter",
        "SelectionList",
        "SelectionListAutoPop",
        "Default",
        "DelayEval",
        "Languages",
        "Languages_Fields",
        "OutputFormat",
        "RejectCode",
        "AttributeName",
        "WorkerType",
        "MaxNum",
        "DeleteBlanks",
        "MinLinesBeforeDelete",
        "CaseSensitive",
        "EndWhiteSpaceSensitive"
    };

private static void ParseAcScopeNode(
        AcRuleReport report,
        AcRuleOptions options,
        object node,
        string scopePath,
        string scopeType,
        string scopeName)
    {
        string payload = ReadNodePayload(node);
        var tokens = TokenizePackedValue(payload);

        var scopeReport = new AcRuleScopeReport
        {
            Path = scopePath,
            ScopeType = scopeType,
            ScopeName = scopeName,
            TokenCount = tokens.Count
        };

        if (options.IncludeRawTokens && options.MaxRawTokensPerScope > 0)
            scopeReport.RawTokens.AddRange(tokens.Take(options.MaxRawTokensPerScope));

        var rules = ParseAcRulesFromTokens(tokens, scopePath, scopeType, scopeName, includeRawTokens: options.IncludeRawTokens);
        scopeReport.RuleCount = rules.Count;
        if (options.MaxScopeCount > 0 && report.Scopes.Count >= options.MaxScopeCount)
            return;

        report.Scopes.Add(scopeReport);
        report.Rules.AddRange(rules);
    }

    private static string ReadNodePayload(object node)
    {
        try
        {
            object? value = GetPropertyValue(node, "Value");
            if (value is string text && !string.IsNullOrEmpty(text))
                return text;
        }
        catch
        {
            // Fall through to Data.
        }

        try
        {
            object? data = GetPropertyValue(node, "Data");
            if (data is byte[] bytes && bytes.Length > 0)
                return Encoding.Default.GetString(bytes);
        }
        catch
        {
            // No readable payload.
        }

        return string.Empty;
    }

    private static System.Collections.Generic.List<string> TokenizePackedValue(string payload)
    {
        var tokens = new System.Collections.Generic.List<string>();
        if (string.IsNullOrEmpty(payload))
            return tokens;

        var sb = new StringBuilder();

        foreach (char ch in payload)
        {
            if (char.IsControl(ch))
            {
                FlushToken(sb, tokens);
            }
            else
            {
                sb.Append(ch);
            }
        }

        FlushToken(sb, tokens);
        return tokens;
    }

    private static void FlushToken(StringBuilder sb, System.Collections.Generic.List<string> tokens)
    {
        if (sb.Length == 0)
            return;

        string token = CleanPackedToken(sb.ToString());
        sb.Clear();

        if (token.Length >= 2)
            tokens.Add(token);
    }

    private static string CleanPackedToken(string token)
    {
        string cleaned = token.Replace("\0", string.Empty).Trim();

        while (cleaned.Length > 0 && !char.IsLetterOrDigit(cleaned[0]) && cleaned[0] != '_')
            cleaned = cleaned.Substring(1).TrimStart();

        while (cleaned.Length > 0 && !char.IsLetterOrDigit(cleaned[cleaned.Length - 1]) && cleaned[cleaned.Length - 1] != '_' && cleaned[cleaned.Length - 1] != '.')
            cleaned = cleaned.Substring(0, cleaned.Length - 1).TrimEnd();

        return cleaned;
    }

    private static System.Collections.Generic.List<AcRuleSummary> ParseAcRulesFromTokens(
        System.Collections.Generic.IReadOnlyList<string> tokens,
        string scopePath,
        string scopeType,
        string scopeName,
        bool includeRawTokens)
    {
        var rules = new System.Collections.Generic.List<AcRuleSummary>();
        AcRuleSummary? current = null;
        string? pendingKey = null;
        int ruleIndex = 0;

        foreach (string token in tokens)
        {
            if (string.Equals(token, "_RuleGUID", StringComparison.Ordinal))
            {
                current = new AcRuleSummary
                {
                    ScopePath = scopePath,
                    ScopeType = scopeType,
                    ScopeName = scopeName,
                    RuleIndex = ++ruleIndex
                };
                rules.Add(current);
                pendingKey = token;
                if (includeRawTokens)
                    current.RawTokens.Add(token);
                continue;
            }

            if (current == null)
                continue;

            if (includeRawTokens)
                current.RawTokens.Add(token);

            if (IsAcRuleKey(token))
            {
                pendingKey = token;
                continue;
            }

            if (pendingKey == null)
                continue;

            AssignAcRuleValue(current, pendingKey, token);
            pendingKey = IsMultiValueAcRuleKey(pendingKey) ? pendingKey : null;
        }

        return rules;
    }

    private static bool IsAcRuleKey(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
            return false;

        if (token is "_RuleGUID" or "_RuleName" or "_RuleID" or "_RuleCounter" or "_FunctionName" or "_FunctionVersion" or "_Description" or "_Sources" or "_ActionNames" or "_ActionMap" or "_SkipID" or "_BackupSkipID")
            return true;

        if (token is "AttrName" or "Value" or "RejectString" or "PageNums" or "FieldName" or "FieldNames" or "DocName" or "PageName")
            return true;

        return Regex.IsMatch(token, @"^_?ParamList(OMRIndex)?\d+$", RegexOptions.CultureInvariant);
    }

    private static bool IsMultiValueAcRuleKey(string key)
    {
        return key == "_Sources" || key == "_ActionNames";
    }

    private static void AssignAcRuleValue(AcRuleSummary rule, string key, string value)
    {
        if (string.IsNullOrWhiteSpace(value) || IsAcRuleKey(value))
            return;

        switch (key)
        {
            case "_RuleGUID":
                rule.RuleGuid ??= value;
                break;
            case "_RuleID":
                rule.RuleId ??= value;
                break;
            case "_ActionMap":
                rule.ActionMapRaw ??= value;
                AddParameterValue(rule, key, value);
                break;
            case "_SkipID":
                rule.SkipId ??= ParseIntOrNull(value);
                AddParameterValue(rule, key, value);
                break;
            case "_BackupSkipID":
                rule.BackupSkipId ??= ParseIntOrNull(value);
                AddParameterValue(rule, key, value);
                break;
            case "_RuleCounter":
                rule.RuleCounter ??= ParseIntOrNull(value);
                AddParameterValue(rule, key, value);
                break;
            case "_RuleName":
                rule.RuleName ??= value;
                break;
            case "_FunctionName":
                rule.FunctionName ??= value;
                break;
            case "_FunctionVersion":
                rule.FunctionVersion ??= value;
                break;
            case "_Description":
                rule.Description ??= value;
                break;
            case "_Sources":
                AddUnique(rule.Sources, value);
                break;
            case "_ActionNames":
                AddUnique(rule.ActionNames, value);
                break;
            default:
                AddParameterValue(rule, key, value);
                break;
        }
    }

    private static void AddParameterValue(AcRuleSummary rule, string key, string value)
    {
        if (!rule.Parameters.TryGetValue(key, out var list))
        {
            list = new System.Collections.Generic.List<string>();
            rule.Parameters[key] = list;
        }
        AddUnique(list, value);
    }

    private static void AddUnique(System.Collections.Generic.List<string> values, string value)
    {
        if (!values.Contains(value, StringComparer.OrdinalIgnoreCase))
            values.Add(value);
    }

    private static void ApplyAcRuleFilters(AcRuleReport report, AcRuleOptions options)
    {
        string? term = string.IsNullOrWhiteSpace(options.Term) ? null : options.Term!.Trim();
        string? scope = string.IsNullOrWhiteSpace(options.Scope) ? null : options.Scope!.Trim();
        string? function = string.IsNullOrWhiteSpace(options.Function) ? null : options.Function!.Trim();

        var filtered = report.Rules.AsEnumerable();

        if (scope != null)
            filtered = filtered.Where(r => ContainsIgnoreCase(r.ScopeName, scope) || ContainsIgnoreCase(r.ScopePath, scope) || ContainsIgnoreCase(r.ScopeType, scope));

        if (function != null)
            filtered = filtered.Where(r => ContainsIgnoreCase(r.FunctionName, function));

        if (term != null)
            filtered = filtered.Where(r => AcRuleContains(r, term));

        var filteredRules = filtered.ToList();
        report.Rules.Clear();
        report.Rules.AddRange(filteredRules);

        if (scope != null || term != null || function != null)
        {
            var scopePaths = new System.Collections.Generic.HashSet<string>(report.Rules.Select(r => r.ScopePath), StringComparer.OrdinalIgnoreCase);
            report.Scopes.RemoveAll(s => !scopePaths.Contains(s.Path));
            foreach (var s in report.Scopes)
                s.RuleCount = report.Rules.Count(r => string.Equals(r.ScopePath, s.Path, StringComparison.OrdinalIgnoreCase));
        }
    }

    private static bool AcRuleContains(AcRuleSummary rule, string term)
    {
        if (ContainsIgnoreCase(rule.ScopePath, term) || ContainsIgnoreCase(rule.ScopeType, term) || ContainsIgnoreCase(rule.ScopeName, term) ||
            ContainsIgnoreCase(rule.RuleGuid, term) || ContainsIgnoreCase(rule.RuleId, term) || ContainsIgnoreCase(rule.RuleName, term) ||
            ContainsIgnoreCase(rule.FunctionName, term) || ContainsIgnoreCase(rule.Description, term))
            return true;

        if (rule.Sources.Any(s => ContainsIgnoreCase(s, term)) || rule.ActionNames.Any(a => ContainsIgnoreCase(a, term)))
            return true;

        return rule.Parameters.Any(p => ContainsIgnoreCase(p.Key, term) || p.Value.Any(v => ContainsIgnoreCase(v, term)));
    }

    private static bool ContainsIgnoreCase(string? value, string term)
    {
        return value?.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0;
    }

    private static uint ToUInt32Safe(object? value)
    {
        if (value == null)
            return 0U;

        try
        {
            return Convert.ToUInt32(value);
        }
        catch
        {
            return 0U;
        }
    }

    private static bool ToBoolSafe(object? value)
    {
        if (value is bool b)
            return b;

        if (value == null)
            return false;

        try
        {
            return Convert.ToBoolean(value);
        }
        catch
        {
            return false;
        }
    }

    private static System.Collections.Generic.List<(string Page, string Variant)> ResolvePageVariantPairs(
        Fwd fwd,
        FipInspectionOptions options,
        FipInspectionReport report)
    {
        var pairs = new System.Collections.Generic.List<(string Page, string Variant)>();

        if (!string.IsNullOrWhiteSpace(options.Page) && !string.IsNullOrWhiteSpace(options.Variant))
        {
            pairs.Add((options.Page!.Trim(), options.Variant!.Trim()));
            return pairs;
        }

        if (!string.IsNullOrWhiteSpace(options.Page))
        {
            string page = options.Page!.Trim();
            foreach (string variant in fwd.GetVariantNames(page) ?? Array.Empty<string>())
                pairs.Add((page, variant));
            return pairs;
        }

        foreach (string page in fwd.GetPageNames() ?? Array.Empty<string>())
        {
            try
            {
                foreach (string variant in fwd.GetVariantNames(page) ?? Array.Empty<string>())
                    pairs.Add((page, variant));
            }
            catch (Exception ex)
            {
                report.Warnings.Add($"Could not list variants for page '{page}': {ex.Message}");
            }
        }

        return pairs;
    }

    private static void TraverseStcNode(
        object node,
        StcTreeReport report,
        StcTraversalOptions options,
        string name,
        string logicalPath,
        int depth)
    {
        if (report.VisitedNodeCount >= options.MaxNodes)
        {
            report.Truncated = true;
            return;
        }

        var summary = new StcNodeSummary
        {
            Name = name,
            Path = logicalPath,
            Depth = depth
        };

        report.Nodes.Add(summary);
        report.VisitedNodeCount++;

        bool isCollection = false;
        bool isCollectionKnown = false;

        try
        {
            object? value = GetPropertyValue(node, "IsCollection");
            if (value is bool b)
            {
                isCollection = b;
                isCollectionKnown = true;
                summary.IsCollection = b;
            }
        }
        catch (Exception ex)
        {
            summary.Warnings.Add("Could not read IsCollection: " + ex.Message);
        }

        if (options.IncludeDataPreview)
            TryReadNodeDataAndValue(node, summary, options.MaxPreviewBytes);

        if (depth >= options.MaxDepth)
            return;

        string[] childNames = Array.Empty<string>();
        if (!isCollectionKnown || isCollection)
        {
            try
            {
                object? rawChildren = GetPropertyValue(node, "ChildNames");
                childNames = ReadChildNames(rawChildren);
            }
            catch (Exception ex)
            {
                summary.Warnings.Add("Could not read ChildNames: " + ex.Message);
            }
        }

        if (!options.IncludeDotNodes)
            childNames = childNames.Where(c => !c.StartsWith(".", StringComparison.Ordinal)).ToArray();

        summary.ChildCount = childNames.Length;

        foreach (string childName in childNames.OrderBy(c => c, StringComparer.OrdinalIgnoreCase))
        {
            if (report.VisitedNodeCount >= options.MaxNodes)
            {
                report.Truncated = true;
                return;
            }

            object? child = null;
            try
            {
                child = InvokeMethod(node, "GetChildNode", childName, false);
                if (child == null)
                {
                    summary.Warnings.Add($"Child '{childName}' returned null.");
                    continue;
                }

                string childPath = string.IsNullOrWhiteSpace(logicalPath)
                    ? childName
                    : logicalPath + "/" + childName;

                TraverseStcNode(child, report, options, childName, childPath, depth + 1);
            }
            catch (Exception ex)
            {
                var failedNode = new StcNodeSummary
                {
                    Name = childName,
                    Path = logicalPath + "/" + childName,
                    Depth = depth + 1,
                    ValuePreview = null,
                    DataPreviewText = null
                };
                failedNode.Warnings.Add("TraversalFailed: " + ex.Message);
                report.Nodes.Add(failedNode);
                report.VisitedNodeCount++;
                report.Warnings.Add($"Could not traverse child '{logicalPath}/{childName}': {ex.Message}");
            }
            finally
            {
                if (child is IDisposable disposable)
                    disposable.Dispose();
            }
        }
    }

    // Normalize ChildNames property payloads from reflection into a clean, deduplicated array.
    private static string[] ReadChildNames(object? rawChildren)
    {
        if (rawChildren is string[] stringArray)
        {
            return stringArray
                .Where(name => !string.IsNullOrWhiteSpace(name))
                .Select(name => name!.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        if (rawChildren is IEnumerable enumerable)
        {
            var names = new List<string>();
            foreach (object? item in enumerable)
            {
                string? name = item as string;
                if (string.IsNullOrWhiteSpace(name))
                    continue;

                names.Add(name!.Trim());
            }

            return names
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        return Array.Empty<string>();
    }

    private static void TryReadNodeDataAndValue(object node, StcNodeSummary summary, int maxPreviewBytes)
    {
        try
        {
            object? value = GetPropertyValue(node, "Value");
            if (value is string text && !string.IsNullOrEmpty(text))
                summary.ValuePreview = Truncate(text.Replace("\0", ""), 500);
        }
        catch
        {
            // Value is frequently invalid for collection/binary nodes. Suppress to avoid noisy output.
        }

        try
        {
            object? rawData = GetPropertyValue(node, "Data");
            if (rawData is byte[] data)
            {
                summary.DataLength = data.Length;
                int previewLength = Math.Min(data.Length, maxPreviewBytes);
                if (previewLength > 0)
                {
                    byte[] preview = data.Take(previewLength).ToArray();
                    summary.DataPreviewHex = BitConverter.ToString(preview).Replace("-", " ");
                    summary.DataPreviewText = DecodeBestEffort(preview);
                }
            }
        }
        catch
        {
            // Data may throw on collection nodes. Suppress to keep traversal resilient.
        }
    }

    private static object? GetPropertyValue(object target, string propertyName)
    {
        PropertyInfo? prop = target.GetType().GetProperty(propertyName, BindingFlags.Public | BindingFlags.Instance);
        if (prop == null)
            return null;

        try
        {
            return prop.GetValue(target, null);
        }
        catch (TargetInvocationException ex) when (ex.InnerException != null)
        {
            throw ex.InnerException;
        }
    }

    private static object? InvokeMethod(object target, string methodName, params object[] args)
    {
        Type[] argTypes = args.Select(a => a.GetType()).ToArray();
        MethodInfo? method = target.GetType().GetMethod(methodName, BindingFlags.Public | BindingFlags.Instance, null, argTypes, null);
        if (method == null)
            throw new MissingMethodException(target.GetType().FullName, methodName);

        try
        {
            return method.Invoke(target, args);
        }
        catch (TargetInvocationException ex) when (ex.InnerException != null)
        {
            throw ex.InnerException;
        }
    }

    private static string DecodeBestEffort(byte[] data)
    {
        if (data.Length == 0)
            return string.Empty;

        string text = Encoding.Default.GetString(data);
        var chars = text.Select(ch => char.IsControl(ch) && ch != '\r' && ch != '\n' && ch != '\t' ? '.' : ch).ToArray();
        return Truncate(new string(chars), 500);
    }

    private static string Truncate(string text, int maxLength)
    {
        if (text.Length <= maxLength)
            return text;

        return text.Substring(0, maxLength) + "...";
    }

    private static string FormatRect(System.Drawing.Rectangle rect)
    {
        return $"{rect.X},{rect.Y},{rect.Width},{rect.Height}";
    }

    private void RequireNativeChecksPassed()
    {
        ProbeReport probe = Probe();

        if (probe.NativeChecksPassed)
            return;

        string messages = string.Join(
            Environment.NewLine,
            probe.NativeVersionChecks
                .Where(c => !c.Passed)
                .SelectMany(c => c.Messages.Select(m => $"{c.NativeDllName}: {m}")));

        throw new InvalidOperationException("Native dependency checks failed:" + Environment.NewLine + messages);
    }

    private static string ResolveFwdPath(string? requestedPath)
    {
        if (!string.IsNullOrWhiteSpace(requestedPath))
            return Path.GetFullPath(requestedPath);

        string? found = Fwd.FindDefaultFWD();

        if (string.IsNullOrWhiteSpace(found))
            throw new FileNotFoundException("No FWD path supplied and Fwd.FindDefaultFWD() did not find fwd.cfd, fwd.sfd, or fwd.fwd.");

        return Path.GetFullPath(found);
    }

    private static void TryReadReleaseInfo(Fwd fwd, FwdInspectionReport report)
    {
        try
        {
            report.ReleaseNumber = fwd.ReleaseNumber;
        }
        catch (Exception ex)
        {
            report.Warnings.Add("Could not read ReleaseNumber: " + ex.Message);
        }

        try
        {
            report.ReleaseString = fwd.GetReleaseString();
        }
        catch (Exception ex)
        {
            report.Warnings.Add("Could not read ReleaseNumberString: " + ex.Message);
        }

        try
        {
            report.ReleaseDateString = fwd.GetReleaseDateString();
        }
        catch (Exception ex)
        {
            report.Warnings.Add("Could not read ReleaseDateString: " + ex.Message);
        }
    }

    private static void AddRangeSafe(
        System.Collections.Generic.List<string> target,
        Func<string[]> producer,
        FwdInspectionReport report,
        string label)
    {
        try
        {
            string[] values = producer() ?? Array.Empty<string>();
            target.AddRange(values.Where(v => !string.IsNullOrWhiteSpace(v)));
        }
        catch (Exception ex)
        {
            report.Warnings.Add($"Could not read {label}: {ex.Message}");
        }
    }

    private static void PopulateConfiguredHierarchy(Fwd fwd, FwdInspectionReport report)
    {
        foreach (string batch in report.Batches)
        {
            var documents = new List<string>();
            AddRangeSafe(documents, () => fwd.GetDocsInBatch(batch), report, $"documents in batch '{batch}'");
            report.DocsInBatch[batch] = documents
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        foreach (string document in report.Documents)
        {
            var pages = new List<string>();
            AddRangeSafe(pages, () => fwd.GetPagesInDoc(document), report, $"pages in document '{document}'");
            report.PagesInDoc[document] = pages
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
    }

    private static void PopulateFields(Fwd fwd, FwdInspectionReport report)
    {
        foreach (string doc in report.Documents)
        {
            try
            {
                var cfg = fwd.Document(doc);
                var bucket = new FieldBucket { ScopeType = "Document", ScopeName = doc };
                AddFields(bucket, cfg.Fields);
                report.Fields.Add(bucket);
            }
            catch (Exception ex)
            {
                report.Warnings.Add($"Could not read fields for document '{doc}': {ex.Message}");
            }
        }

        foreach (string page in report.Pages)
        {
            try
            {
                var cfg = fwd.Page(page);
                var bucket = new FieldBucket { ScopeType = "Page", ScopeName = page };
                AddFields(bucket, cfg.Fields);
                report.Fields.Add(bucket);
            }
            catch (Exception ex)
            {
                report.Warnings.Add($"Could not read fields for page '{page}': {ex.Message}");
            }
        }
    }

    private static void AddFields(FieldBucket bucket, FormWorks.Core.IFieldConfig[] fields)
    {
        if (fields == null)
            return;

        foreach (var field in fields)
        {
            var summary = new FieldSummary
            {
                Name = field.Name
            };

            try
            {
                summary.Type = field.Type.ToString();
            }
            catch
            {
                summary.Type = null;
            }

            try
            {
                var rect = field.Geometry;
                summary.Geometry = $"{rect.X},{rect.Y},{rect.Width},{rect.Height}";
            }
            catch
            {
                summary.Geometry = null;
            }

            try
            {
                summary.SubfieldCount = field.SubfieldNames?.Length ?? 0;
            }
            catch
            {
                summary.SubfieldCount = 0;
            }

            bucket.Fields.Add(summary);
        }
    }

    private static void ProbeAssembly(ProbeReport report, string simpleName)
    {
        try
        {
            var assembly = AppDomain.CurrentDomain.GetAssemblies()
                .FirstOrDefault(a => string.Equals(a.GetName().Name, simpleName, StringComparison.OrdinalIgnoreCase))
                ?? System.Reflection.Assembly.Load(simpleName);

            report.Assemblies.Add(new AssemblyProbeResult
            {
                Name = simpleName,
                Version = assembly.GetName().Version?.ToString(),
                Location = assembly.Location,
                Loaded = true
            });
        }
        catch (Exception ex)
        {
            report.Assemblies.Add(new AssemblyProbeResult
            {
                Name = simpleName,
                Loaded = false,
                Error = ex.GetType().Name + ": " + ex.Message
            });
        }
    }
}
