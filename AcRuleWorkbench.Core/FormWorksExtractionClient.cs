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

public sealed class FormWorksExtractionClient : IFormWorksExtractionClient
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
    private static void PopulateResourceDetails(Fwd fwd, FwdInspectionOptions options, FwdInspectionReport report)
    {
        if ((!options.IncludeResourceConfigs && !options.IncludeResourcePrivateTrees) || report.Resources.Count == 0)
            return;

        int maxDepth = Math.Max(1, options.MaxPrivateTreeDepth);
        int maxNodes = Math.Max(1, options.MaxPrivateTreeNodes);

        foreach (ResourceBucket bucket in report.Resources)
        {
            var detail = new ResourceTypeDetail { Type = bucket.Type };

            if (options.IncludeResourceConfigs)
            {
                try
                {
                    object? typeConfig = fwd.GetResourceTypeConfig(bucket.Type);
                    detail.TypeAttributes.AddRange(ReadAttrEntries(typeConfig));
                }
                catch (Exception ex)
                {
                    report.Warnings.Add($"Could not read type config for resource type '{bucket.Type}': {ex.Message}");
                }
            }

            foreach (string resourceName in bucket.Names)
            {
                var resource = new ResourceDetail
                {
                    Type = bucket.Type,
                    Name = resourceName,
                    Category = ClassifyResourceCategory(bucket.Type)
                };

                if (options.IncludeResourceConfigs)
                {
                    try
                    {
                        object? fullConfig = fwd.GetResourceConfig(bucket.Type, resourceName);
                        resource.FullAttributes.AddRange(ReadAttrEntries(fullConfig));
                    }
                    catch (Exception ex)
                    {
                        resource.Warnings.Add($"Could not read full config: {ex.Message}");
                    }

                    try
                    {
                        object? publicConfig = fwd.GetResourcePublicConfig(bucket.Type, resourceName);
                        resource.PublicAttributes.AddRange(ReadAttrEntries(publicConfig));
                    }
                    catch (Exception ex)
                    {
                        resource.Warnings.Add($"Could not read public config: {ex.Message}");
                    }
                }

                if (options.IncludeResourcePrivateTrees)
                {
                    try
                    {
                        object? privateNode = fwd.GetResourceNodePrivate(bucket.Type, resourceName);
                        if (privateNode != null)
                        {
                            int visited = 0;
                            resource.PrivateTree = ReadResourcePrivateTreeNode(privateNode, resourceName, resourceName, 0, maxDepth, maxNodes, ref visited);

                            if (privateNode is IDisposable disposable)
                                disposable.Dispose();
                        }
                    }
                    catch (Exception ex)
                    {
                        resource.Warnings.Add($"Could not read private STC tree: {ex.Message}");
                    }
                }

                detail.Resources.Add(resource);
            }

            report.ResourceTypeDetails.Add(detail);
        }

        BuildResourceDependencyMap(report);
    }

    private static void BuildResourceDependencyMap(FwdInspectionReport report)
    {
        var knownResources = report.ResourceTypeDetails
            .SelectMany(rt => rt.Resources.Select(r => new { r.Type, r.Name }))
            .Where(x => !string.IsNullOrWhiteSpace(x.Name))
            .ToList();

        if (knownResources.Count == 0)
            return;

        foreach (ResourceTypeDetail type in report.ResourceTypeDetails)
        {
            foreach (ResourceDetail resource in type.Resources)
            {
                foreach (ResourceAttrEntry attr in resource.FullAttributes.Concat(resource.PublicAttributes))
                {
                    foreach (var other in knownResources)
                    {
                        if (string.Equals(other.Type, resource.Type, StringComparison.OrdinalIgnoreCase)
                            && string.Equals(other.Name, resource.Name, StringComparison.OrdinalIgnoreCase))
                            continue;

                        if (ContainsIgnoreCase(attr.Value, other.Name))
                        {
                            report.ResourceDependencies.Add(new ResourceDependencyEdge
                            {
                                ResourceType = other.Type,
                                ResourceName = other.Name,
                                ScopePath = resource.Type + "/" + resource.Name,
                                RuleIndex = -1,
                                RuleName = resource.Name,
                                FunctionName = null,
                                Kind = "ResourceConfigReference"
                            });
                        }
                    }
                }
            }
        }
    }

    private static IEnumerable<ResourceAttrEntry> ReadAttrEntries(object? attrCollection)
    {
        if (attrCollection == null)
            return Array.Empty<ResourceAttrEntry>();

        var results = new List<ResourceAttrEntry>();

        if (attrCollection is IDictionary dictionary)
        {
            foreach (DictionaryEntry entry in dictionary)
            {
                string key = Convert.ToString(entry.Key) ?? string.Empty;
                string value = Convert.ToString(entry.Value) ?? string.Empty;
                results.Add(new ResourceAttrEntry
                {
                    Key = key,
                    Value = Truncate(value, 4000),
                    ValueType = entry.Value?.GetType().Name ?? string.Empty
                });
            }
            return results;
        }

        try
        {
            object? keysObj = GetPropertyValue(attrCollection, "Keys");
            IEnumerable keys = keysObj as IEnumerable ?? Array.Empty<object>();

            foreach (object keyObj in keys)
            {
                string key = Convert.ToString(keyObj) ?? string.Empty;
                string value;
                try
                {
                    object? raw = InvokeMethod(attrCollection, "Print", key);
                    value = Convert.ToString(raw) ?? string.Empty;
                }
                catch { value = string.Empty; }

                string typeName = string.Empty;
                try
                {
                    MethodInfo? getTypeName = attrCollection.GetType().GetMethod("TypeName", BindingFlags.Public | BindingFlags.Instance, null, new[] { typeof(string) }, null);
                    if (getTypeName != null)
                        typeName = Convert.ToString(getTypeName.Invoke(attrCollection, new object[] { key })) ?? string.Empty;
                }
                catch
                {
                    typeName = string.Empty;
                }

                results.Add(new ResourceAttrEntry
                {
                    Key = key ?? string.Empty,
                    Value = Truncate(value.Trim(), 4000),
                    ValueType = typeName
                });
            }
        }
        catch
        {
            // If this object does not expose enumerable keys/print access, return empty entries.
        }

        return results;
    }

    private static ResourcePrivateNode ReadResourcePrivateTreeNode(
        object node,
        string name,
        string path,
        int depth,
        int maxDepth,
        int maxNodes,
        ref int visited)
    {
        visited++;
        var summary = new ResourcePrivateNode
        {
            Name = name,
            Path = path,
            Depth = depth
        };

        try
        {
            object? isCollection = GetPropertyValue(node, "IsCollection");
            if (isCollection is bool b)
                summary.IsCollection = b;
        }
        catch (Exception ex)
        {
            summary.Warnings.Add("Could not read IsCollection: " + ex.Message);
        }

        try
        {
            object? size = GetPropertyValue(node, "Size");
            if (size != null)
                summary.Size = Convert.ToInt32(size);
        }
        catch
        {
            // Size isn't guaranteed on all node types.
        }

        try
        {
            object? value = GetPropertyValue(node, "Value");
            if (value is string text && !string.IsNullOrWhiteSpace(text))
                summary.ValuePreview = Truncate(text.Replace("\0", string.Empty), 500);
        }
        catch
        {
            // Value is optional for many node types.
        }

        try
        {
            object? data = GetPropertyValue(node, "Data");
            if (data is byte[] bytes && bytes.Length > 0)
            {
                summary.IsBinaryPayload = bytes.Any(b => b == 0) || bytes.Any(b => b < 9);
                using var sha = SHA256.Create();
                summary.DataSha256 = BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-", string.Empty).ToLowerInvariant();
            }
        }
        catch
        {
            // Data is optional.
        }

        if (depth >= maxDepth || visited >= maxNodes)
            return summary;

        string[] childNames = Array.Empty<string>();
        try
        {
            object? rawChildren = GetPropertyValue(node, "ChildNames");
            if (rawChildren is string[] names)
                childNames = names;
        }
        catch (Exception ex)
        {
            summary.Warnings.Add("Could not read ChildNames: " + ex.Message);
        }

        foreach (string childName in childNames.Where(c => !string.IsNullOrWhiteSpace(c)))
        {
            if (visited >= maxNodes)
                break;

            object? child = null;
            try
            {
                try
                {
                    child = InvokeMethod(node, "GetChildHandle", childName, false);
                }
                catch
                {
                    child = InvokeMethod(node, "GetChildNode", childName, false);
                }

                if (child == null)
                    continue;

                string childPath = path + "/" + childName;
                summary.Children.Add(ReadResourcePrivateTreeNode(child, childName, childPath, depth + 1, maxDepth, maxNodes, ref visited));
            }
            catch (Exception ex)
            {
                summary.Warnings.Add($"Could not traverse child '{childName}': {ex.Message}");
            }
            finally
            {
                if (child is IDisposable disposable)
                    disposable.Dispose();
            }
        }

        return summary;
    }

    private static string ClassifyResourceCategory(string resourceType)
    {
        string t = resourceType ?? string.Empty;
        if (ContainsIgnoreCase(t, "table") || ContainsIgnoreCase(t, "selection")) return "Table";
        if (ContainsIgnoreCase(t, "date")) return "DateFormat";
        if (ContainsIgnoreCase(t, "udf") || ContainsIgnoreCase(t, "function")) return "UDFOrFunction";
        if (ContainsIgnoreCase(t, "regex") || ContainsIgnoreCase(t, "expr") || ContainsIgnoreCase(t, "charset")) return "ExpressionOrCharset";
        if (ContainsIgnoreCase(t, "store") || ContainsIgnoreCase(t, "template")) return "StoreOrTemplate";
        return "Unknown";
    }

    public SmokeReport Smoke(SmokeOptions options)
    {
        if (options == null)
            throw new ArgumentNullException(nameof(options));

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
                ProcessName = options.ProcessName.Trim(),
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

        AcRuleReport rules = InspectAcRules(options);
        AcRelationshipReport relationships = BuildRelationshipReport(rules, includeRules: false);
        relationships.RebuildCounts();
        AcRuleFlowReport flow = BuildFlowReport(rules, includeHeuristicSequence: true);

        var index = new AcIndexReport();
        index.Rebuild(rules, relationships);
        return index;
    }


    public AcRuleFlowReport BuildAcFlow(AcFlowOptions options)
    {
        if (options == null)
            throw new ArgumentNullException(nameof(options));

        var ruleOptions = new AcRuleOptions
        {
            Path = options.Path,
            ProcessName = string.IsNullOrWhiteSpace(options.ProcessName) ? "AC" : options.ProcessName,
            Term = options.Term,
            Scope = options.Scope,
            RequireNativeOk = options.RequireNativeOk
        };

        AcRuleReport rules = InspectAcRules(ruleOptions);
        AcRuleFlowReport flow = BuildFlowReport(rules, options.IncludeHeuristicSequence);

        if (options.FromRuleIndex.HasValue || !string.IsNullOrWhiteSpace(options.FromRuleGuid))
            FilterFlowFromRule(flow, options.FromRuleIndex, options.FromRuleGuid);

        flow.RebuildCounts();
        return flow;
    }

    public AcFlowDebugReport BuildAcFlowDebug(AcFlowDebugOptions options)
    {
        if (options == null)
            throw new ArgumentNullException(nameof(options));

        var ruleOptions = new AcRuleOptions
        {
            Path = options.Path,
            ProcessName = string.IsNullOrWhiteSpace(options.ProcessName) ? "AC" : options.ProcessName,
            Scope = options.Scope,
            Term = options.Term,
            IncludeRawTokens = true,
            MaxRawTokensPerScope = options.MaxRawTokensPerScope <= 0 ? 400 : options.MaxRawTokensPerScope,
            RequireNativeOk = options.RequireNativeOk
        };

        AcRuleReport ruleReport = InspectAcRules(ruleOptions);
        var report = new AcFlowDebugReport
        {
            FwdPath = ruleReport.FwdPath,
            ProcessName = ruleReport.ProcessName
        };
        report.Warnings.AddRange(ruleReport.Warnings);

        foreach (AcRuleScopeReport scope in ruleReport.Scopes)
        {
            var debugScope = new AcFlowDebugScope
            {
                ScopePath = scope.Path,
                ScopeType = scope.ScopeType,
                ScopeName = scope.ScopeName,
                RuleCount = scope.RuleCount,
                TokenCount = scope.TokenCount
            };
            debugScope.RawTokens.AddRange(scope.RawTokens);
            report.Scopes.Add(debugScope);
        }

        IEnumerable<AcRuleSummary> selected = ruleReport.Rules;

        if (options.FromRuleIndex.HasValue)
            selected = selected.Where(r => r.RuleIndex == options.FromRuleIndex.Value);

        if (!string.IsNullOrWhiteSpace(options.FromRuleGuid))
            selected = selected.Where(r => string.Equals(r.RuleGuid, options.FromRuleGuid.Trim(), StringComparison.OrdinalIgnoreCase));

        if (!string.IsNullOrWhiteSpace(options.Term))
            selected = selected.Where(r => AcRuleContains(r, options.Term.Trim()));

        int maxRules = options.MaxRules <= 0 ? 25 : options.MaxRules;
        int maxRawTokens = options.MaxRawTokensPerRule <= 0 ? 80 : options.MaxRawTokensPerRule;
        List<AcRuleSummary> selectedList = selected.Take(maxRules + 1).ToList();
        if (selectedList.Count > maxRules)
        {
            report.Truncated = true;
            selectedList = selectedList.Take(maxRules).ToList();
            report.Warnings.Add($"Flow debug output truncated at {maxRules} rules. Increase --max-rules for more.");
        }

        foreach (AcRuleSummary rule in selectedList)
            report.Rules.Add(CreateFlowDebugRule(rule, maxRawTokens));

        if (report.Rules.Count == 0)
            report.Warnings.Add("No rules matched the requested flow-debug filters.");

        report.RebuildCounts();
        return report;
    }

    public AcDiagnosticsReport BuildAcDiagnostics(AcRuleOptions options)
    {
        if (options == null)
            throw new ArgumentNullException(nameof(options));

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
        AcRuleFlowReport flow = BuildFlowReport(rules, includeHeuristicSequence: true);
        flow.RebuildCounts();

        var report = new AcDiagnosticsReport
        {
            FwdPath = rules.FwdPath,
            ProcessName = rules.ProcessName,
            ScopeCount = rules.ScopeCount,
            RuleCount = rules.RuleCount,
            RelationshipCount = relationships.RelationshipCount,
            FlowEdgeCount = flow.EdgeCount,
            ProvenFlowEdgeCount = flow.ProvenEdgeCount,
            ParsedFlowEdgeCount = flow.ParsedEdgeCount,
            HeuristicFlowEdgeCount = flow.HeuristicEdgeCount,
            UnknownFlowEdgeCount = flow.UnknownEdgeCount,
            MissingRuleGuidCount = rules.Rules.Count(r => string.IsNullOrWhiteSpace(r.RuleGuid)),
            MissingRuleIdCount = rules.Rules.Count(r => string.IsNullOrWhiteSpace(r.RuleId)),
            MissingFunctionCount = rules.Rules.Count(r => string.IsNullOrWhiteSpace(r.FunctionName)),
            RulesWithActionNamesCount = rules.Rules.Count(r => r.ActionNames.Count > 0),
            RulesWithActionMapCount = rules.Rules.Count(r => !string.IsNullOrWhiteSpace(r.ActionMapRaw)),
            RulesWithSkipIdCount = rules.Rules.Count(r => r.SkipId.HasValue),
            RulesWithBackupSkipIdCount = rules.Rules.Count(r => r.BackupSkipId.HasValue),
            UnknownActionTargetCount = flow.Edges.Count(e => e.EdgeKind == AcRuleFlowEdgeKind.UnknownActionTarget),
            UnresolvedSkipTargetCount = flow.Edges.Count(e => e.EdgeKind == AcRuleFlowEdgeKind.UnresolvedSkipTarget),
            DisabledDirectCount = rules.Rules.Count(r => r.DisabledState == AcDisabledStates.DisabledDirect),
            DisabledInheritedCount = rules.Rules.Count(r => r.DisabledState == AcDisabledStates.DisabledInherited),
            PossiblyDisabledInheritedCount = rules.Rules.Count(r => r.DisabledState == AcDisabledStates.PossiblyDisabledInherited),
            PossibleDisabledSequenceOnlyCount = rules.Rules.Count(r => r.DisabledState == AcDisabledStates.PossibleDisabledSequenceOnly)
        };

        report.Warnings.AddRange(rules.Warnings);
        report.Warnings.AddRange(relationships.Warnings);
        report.Warnings.AddRange(flow.Warnings);

        AddCounts(report.RulesByScope, rules.Rules.GroupBy(r => r.ScopePath));
        AddCounts(report.RulesByFunction, rules.Rules.GroupBy(r => string.IsNullOrWhiteSpace(r.FunctionName) ? "(missing)" : r.FunctionName));
        AddCounts(report.FlowEdgesByKind, flow.Edges.GroupBy(e => string.IsNullOrWhiteSpace(e.EdgeKind) ? "(missing)" : e.EdgeKind));
        AddCounts(report.FlowEdgesByConfidence, flow.Edges.GroupBy(e => string.IsNullOrWhiteSpace(e.Confidence) ? "(missing)" : e.Confidence));

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

        AddDiagnostic(report, "Info", "Flow", "Action names were parsed but action/sub-list targets are unresolved.", report.UnknownActionTargetCount, flow.Edges.Where(e => e.EdgeKind == AcRuleFlowEdgeKind.UnknownActionTarget).Select(FormatFlowEdgeExample));
        AddDiagnostic(report, "Info", "Flow", "SequentialNext edges are heuristic sequence evidence, not runtime branch proof.", report.HeuristicFlowEdgeCount, flow.Edges.Where(e => e.EdgeKind == AcRuleFlowEdgeKind.SequentialNext).Select(FormatFlowEdgeExample));
        AddDiagnostic(report, "Warning", "Parser", "Rules are missing RuleID, which limits SkipID/ActionMap resolution.", report.MissingRuleIdCount, rules.Rules.Where(r => string.IsNullOrWhiteSpace(r.RuleId)).Select(FormatRuleExample));
        AddDiagnostic(report, "Warning", "Parser", "Rules have action names but no decoded ActionMap target.", report.RulesWithActionNamesCount - report.RulesWithActionMapCount, rules.Rules.Where(r => r.ActionNames.Count > 0 && string.IsNullOrWhiteSpace(r.ActionMapRaw)).Select(FormatRuleExample));
        AddDiagnostic(report, "Info", "Disabled", "Rules are directly disabled by source marker.", report.DisabledDirectCount, rules.Rules.Where(r => r.DisabledState == AcDisabledStates.DisabledDirect).Select(FormatRuleExample));
        AddDiagnostic(report, "Info", "Disabled", "Rules have possible disabled evidence from flat sequence fallback only. This is audit-only evidence, not structural inheritance.", report.PossibleDisabledSequenceOnlyCount, rules.Rules.Where(r => r.DisabledState == AcDisabledStates.PossibleDisabledSequenceOnly).Select(FormatRuleExample));
        AddDiagnostic(report, "Info", "Disabled", "Rules are disabled by parsed flow evidence from disabled ancestors.", report.PossiblyDisabledInheritedCount, rules.Rules.Where(r => r.DisabledState == AcDisabledStates.PossiblyDisabledInherited).Select(FormatRuleExample));

        return report;
    }

    private static AcFlowDebugRule CreateFlowDebugRule(AcRuleSummary rule, int maxRawTokens)
    {
        var debug = new AcFlowDebugRule
        {
            ScopePath = rule.ScopePath,
            ScopeType = rule.ScopeType,
            ScopeName = rule.ScopeName,
            RuleIndex = rule.RuleIndex,
            RuleGuid = rule.RuleGuid,
            RuleId = rule.RuleId,
            RuleCounter = rule.RuleCounter,
            RuleName = rule.RuleName,
            FunctionName = rule.FunctionName,
            FunctionVersion = rule.FunctionVersion,
            ActionMapRaw = rule.ActionMapRaw,
            SkipId = rule.SkipId,
            BackupSkipId = rule.BackupSkipId,
            RuleListPath = rule.RuleListPath
        };

        debug.ActionNames.AddRange(rule.ActionNames);
        debug.Sources.AddRange(rule.Sources);

        foreach (var pair in rule.Parameters)
        {
            if (IsFlowParameterKey(pair.Key))
                debug.FlowParameters[pair.Key] = pair.Value.ToList();
        }

        if (maxRawTokens > 0)
            debug.RawTokens.AddRange(rule.RawTokens.Take(maxRawTokens));

        foreach (string token in rule.RawTokens.Where(IsFlowDebugToken).Take(maxRawTokens <= 0 ? 80 : maxRawTokens))
            debug.RawFlowTokens.Add(token);

        if (string.IsNullOrWhiteSpace(rule.RuleId))
            debug.Warnings.Add("_RuleID was not parsed for this rule; skip/action target resolution may be limited.");
        if (rule.ActionNames.Count > 0 && string.IsNullOrWhiteSpace(rule.ActionMapRaw))
            debug.Warnings.Add("Action names were parsed, but _ActionMap was not parsed for this rule.");
        if (rule.RawTokens.Count == 0)
            debug.Warnings.Add("Raw tokens were not available. Ensure flow debug requests raw-token capture.");

        return debug;
    }

    private static bool IsFlowParameterKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key))
            return false;

        return key.Equals("_ActionMap", StringComparison.OrdinalIgnoreCase) ||
               key.Equals("_SkipID", StringComparison.OrdinalIgnoreCase) ||
               key.Equals("_BackupSkipID", StringComparison.OrdinalIgnoreCase) ||
               key.Equals("_RuleID", StringComparison.OrdinalIgnoreCase) ||
               key.Equals("_RuleCounter", StringComparison.OrdinalIgnoreCase) ||
               key.Equals("_ActionNames", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsFlowDebugToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
            return false;

        return token.IndexOf("Rule", StringComparison.OrdinalIgnoreCase) >= 0 ||
               token.IndexOf("Action", StringComparison.OrdinalIgnoreCase) >= 0 ||
               token.IndexOf("Skip", StringComparison.OrdinalIgnoreCase) >= 0 ||
               token.IndexOf("Sub", StringComparison.OrdinalIgnoreCase) >= 0 ||
               token.IndexOf("Status", StringComparison.OrdinalIgnoreCase) >= 0 ||
               token.Equals("_RuleGUID", StringComparison.OrdinalIgnoreCase) ||
               token.Equals("_RuleID", StringComparison.OrdinalIgnoreCase) ||
               token.Equals("_ActionMap", StringComparison.OrdinalIgnoreCase) ||
               token.Equals("_ActionNames", StringComparison.OrdinalIgnoreCase) ||
               token.Equals("_SkipID", StringComparison.OrdinalIgnoreCase) ||
               token.Equals("_BackupSkipID", StringComparison.OrdinalIgnoreCase);
    }

    private static void AddCounts<T>(List<AcRuleCount> target, IEnumerable<IGrouping<string, T>> groups)
    {
        target.Clear();
        target.AddRange(groups
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key)
            .Select(g => new AcRuleCount { Name = string.IsNullOrWhiteSpace(g.Key) ? "(blank)" : g.Key, Count = g.Count() }));
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

    public AcDisabledReport AnalyzeDisabledRules(AcDisabledOptions options)
    {
        if (options == null)
            throw new ArgumentNullException(nameof(options));

        var ruleOptions = new AcRuleOptions
        {
            Path = options.Path,
            ProcessName = string.IsNullOrWhiteSpace(options.ProcessName) ? "AC" : options.ProcessName,
            Term = options.Term,
            Scope = options.Scope,
            Function = options.Function,
            RequireNativeOk = options.RequireNativeOk
        };

        AcRuleReport rules = InspectAcRules(ruleOptions);

        // Re-apply the selected disabled propagation mode after rule extraction. The default
        // intentionally marks downstream same-scope rules as inherited-disabled when a direct
        // disabled gate is found. This is a conservative inspection signal, not a runtime proof.
        AnnotateDisabledStates(rules, options.InheritDisabled);

        var report = new AcDisabledReport
        {
            FwdPath = rules.FwdPath,
            ProcessName = rules.ProcessName
        };
        report.Warnings.AddRange(rules.Warnings);

        foreach (AcDisabledBlock block in BuildDisabledBlocks(rules))
            report.DisabledBlocks.Add(block);

        IEnumerable<AcRuleSummary> selected = rules.Rules;

        if (!string.IsNullOrWhiteSpace(options.State))
        {
            string state = NormalizeDisabledState(options.State.Trim());
            selected = selected.Where(r => string.Equals(r.DisabledState, state, StringComparison.OrdinalIgnoreCase));
        }
        else
        {
            selected = selected.Where(r => r.DisabledState != AcDisabledStates.Enabled);
        }

        report.Rules.AddRange(selected);

        report.RebuildCounts();
        return report;
    }


    public AcTreeReport BuildAcTree(AcTreeOptions options)
    {
        if (options == null)
            throw new ArgumentNullException(nameof(options));

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
                        if (!string.IsNullOrWhiteSpace(options.Scope)
                            && childName.IndexOf(options.Scope.Trim(), StringComparison.OrdinalIgnoreCase) < 0
                            && $"AC/{branchName}/{childName}".IndexOf(options.Scope.Trim(), StringComparison.OrdinalIgnoreCase) < 0)
                        {
                            continue;
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
            string term = options.Term.Trim();
            var keepNodeIds = new HashSet<int>(report.Nodes
                .Where(n => AcTreeNodeContains(n, term))
                .Select(n => n.NodeId));

            report.Nodes.RemoveAll(n => !keepNodeIds.Contains(n.NodeId));
            report.Edges.RemoveAll(e => !keepNodeIds.Contains(e.FromNodeId) || !keepNodeIds.Contains(e.ToNodeId));
        }

        if (!string.IsNullOrWhiteSpace(options.Scope))
        {
            string scope = options.Scope.Trim();
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

        bool Contains(string? value) => !string.IsNullOrWhiteSpace(value) && value.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0;
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

    public AcViewerReport ExportAcViewer(AcViewerOptions options)
    {
        if (options == null)
            throw new ArgumentNullException(nameof(options));

        var ruleOptions = new AcRuleOptions
        {
            Path = options.Path,
            ProcessName = string.IsNullOrWhiteSpace(options.ProcessName) ? "AC" : options.ProcessName,
            Term = options.Term,
            Scope = options.Scope,
            Function = options.Function,
            RequireNativeOk = options.RequireNativeOk
        };

        AcRuleReport rules = InspectAcRules(ruleOptions);
        AcRelationshipReport relationships = BuildRelationshipReport(rules, includeRules: false);
        relationships.RebuildCounts();
        AcRuleFlowReport flow = BuildFlowReport(rules, includeHeuristicSequence: true);
        AcTreeReport tree = BuildAcTree(new AcTreeOptions
        {
            Path = options.Path,
            ProcessName = string.IsNullOrWhiteSpace(options.ProcessName) ? "AC" : options.ProcessName,
            Term = options.Term,
            Scope = options.Scope,
            IncludeAttributes = false,
            MaskSensitiveValues = true,
            RequireNativeOk = options.RequireNativeOk
        });

        string outputPath = string.IsNullOrWhiteSpace(options.OutputPath)
            ? Path.GetFullPath("ac-rule-viewer.html")
            : Path.GetFullPath(options.OutputPath);

        Directory.CreateDirectory(Path.GetDirectoryName(outputPath) ?? Environment.CurrentDirectory);
        File.WriteAllText(outputPath, BuildAcViewerHtml(rules, relationships, flow, tree), Encoding.UTF8);

        // Prepare viewer report early so we can attach non-fatal warnings from
        // sidecar JSON generation failures.
        var report = new AcViewerReport
        {
            FwdPath = rules.FwdPath,
            OutputPath = outputPath,
            ScopeCount = rules.ScopeCount,
            RuleCount = rules.RuleCount,
            RelationshipCount = relationships.RelationshipCount,
            FlowEdgeCount = flow.EdgeCount
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
            string flowJson = JsonConvert.SerializeObject(flow, serializerSettings);
            string treeJson = JsonConvert.SerializeObject(tree, serializerSettings);

            File.WriteAllText(Path.Combine(outDir, "ac-rule-viewer.rules.json"), rulesJson, Encoding.UTF8);
            File.WriteAllText(Path.Combine(outDir, "ac-rule-viewer.rel.json"), relJson, Encoding.UTF8);
            File.WriteAllText(Path.Combine(outDir, "ac-rule-viewer.flow.json"), flowJson, Encoding.UTF8);
            File.WriteAllText(Path.Combine(outDir, "ac-rule-viewer.tree.json"), treeJson, Encoding.UTF8);
        }
        catch (Exception ex)
        {
            // Non-fatal: record as a warning on the report so the caller can see it.
            report.Warnings.Add("Could not write viewer sidecar JSON files: " + ex.Message);
        }
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

        report.Warnings.Add("Flow graph distinguishes sequence evidence from branch evidence. SequentialNext edges are heuristic and must not be treated as proof of runtime parent/child hierarchy.");
        report.Warnings.Add("Action names are parsed, but ActionMap/sub-list targets may remain unresolved until the proprietary action-map encoding is decoded.");
        report.RebuildCounts();
        return report;
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
                         (!string.IsNullOrWhiteSpace(fromRuleGuid) && string.Equals(node.RuleGuid, fromRuleGuid.Trim(), StringComparison.OrdinalIgnoreCase));
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

    private static AcRelationshipReport BuildRelationshipReport(AcRuleReport rules, bool includeRules)
    {
        var report = new AcRelationshipReport
        {
            FwdPath = rules.FwdPath,
            ProcessName = rules.ProcessName
        };
        report.Warnings.AddRange(rules.Warnings);

        if (includeRules)
            report.Rules.AddRange(rules.Rules);

        foreach (AcRuleSummary rule in rules.Rules)
        {
            foreach (AcRuleRelationship rel in ClassifyRuleRelationships(rule))
                AddRelationship(report.Relationships, rel);
        }

        report.RebuildCounts();
        return report;
    }

    private static IEnumerable<AcRuleRelationship> ClassifyRuleRelationships(AcRuleSummary rule)
    {
        string function = rule.FunctionName ?? string.Empty;

        foreach (var param in rule.Parameters)
        {
            string key = param.Key ?? string.Empty;
            foreach (string value in param.Value.Where(v => !string.IsNullOrWhiteSpace(v)))
            {
                ParameterClassification classification = ClassifyParameter(function, key, value);

                yield return new AcRuleRelationship
                {
                    ScopePath = rule.ScopePath,
                    ScopeType = rule.ScopeType,
                    ScopeName = rule.ScopeName,
                    RuleIndex = rule.RuleIndex,
                    RuleGuid = rule.RuleGuid,
                    RuleName = rule.RuleName,
                    FunctionName = rule.FunctionName,
                    Kind = classification.Kind,
                    TargetType = classification.TargetType,
                    Target = value,
                    ParameterName = key,
                    ParameterRole = classification.ParameterRole,
                    IsOptionParameter = classification.IsOptionParameter,
                    Confidence = classification.IsOptionParameter ? "High" : "Medium",
                    RelationshipReason = classification.ParameterRole,
                    Evidence = $"{key}={value}"
                };
            }
        }

        if (string.Equals(function, "_IRejectFields", StringComparison.OrdinalIgnoreCase))
        {
            foreach (string message in GetParameterValues(rule, "RejectString"))
            {
                yield return new AcRuleRelationship
                {
                    ScopePath = rule.ScopePath,
                    ScopeType = rule.ScopeType,
                    ScopeName = rule.ScopeName,
                    RuleIndex = rule.RuleIndex,
                    RuleGuid = rule.RuleGuid,
                    RuleName = rule.RuleName,
                    FunctionName = rule.FunctionName,
                    Kind = "EmitsRejectMessage",
                    TargetType = "RejectMessage",
                    Target = message,
                    ParameterName = "RejectString",
                    ParameterRole = "RejectMessage",
                    Confidence = "High",
                    RelationshipReason = "RejectString parameter",
                    Evidence = message
                };
            }
        }

        foreach (AcRuleRelationship disabledRelationship in ClassifyDisabledRelationships(rule))
            yield return disabledRelationship;

        foreach (string source in rule.Sources)
        {
            yield return new AcRuleRelationship
            {
                ScopePath = rule.ScopePath,
                ScopeType = rule.ScopeType,
                ScopeName = rule.ScopeName,
                RuleIndex = rule.RuleIndex,
                RuleGuid = rule.RuleGuid,
                RuleName = rule.RuleName,
                FunctionName = rule.FunctionName,
                Kind = source.Equals("_Disabled", StringComparison.OrdinalIgnoreCase) ? "DisabledBySource" : "UsesSource",
                TargetType = "Source",
                Target = source,
                ParameterName = "_Sources",
                ParameterRole = "SourceTag",
                Confidence = "High",
                RelationshipReason = source.Equals("_Disabled", StringComparison.OrdinalIgnoreCase) ? "Direct disabled source" : "Rule source tag",
                Evidence = source
            };
        }
    }

    private static IEnumerable<AcRuleRelationship> ClassifyDisabledRelationships(AcRuleSummary rule)
    {
        if (rule.DisabledState == AcDisabledStates.DisabledDirect)
        {
            yield return new AcRuleRelationship
            {
                ScopePath = rule.ScopePath,
                ScopeType = rule.ScopeType,
                ScopeName = rule.ScopeName,
                RuleIndex = rule.RuleIndex,
                RuleGuid = rule.RuleGuid,
                RuleName = rule.RuleName,
                FunctionName = rule.FunctionName,
                Kind = "DisablesRuleBlock",
                TargetType = "RuleBlock",
                Target = rule.RuleName ?? ("#" + rule.RuleIndex),
                ParameterName = "_Sources",
                ParameterRole = "DisabledMarker",
                Confidence = "High",
                RelationshipReason = "Direct disabled marker",
                Evidence = rule.DisabledReason ?? "Rule contains direct disabled marker."
            };
        }

        if (rule.DisabledState == AcDisabledStates.DisabledInherited ||
            rule.DisabledState == AcDisabledStates.PossiblyDisabledInherited ||
            rule.DisabledState == AcDisabledStates.PossibleDisabledSequenceOnly)
        {
            yield return new AcRuleRelationship
            {
                ScopePath = rule.ScopePath,
                ScopeType = rule.ScopeType,
                ScopeName = rule.ScopeName,
                RuleIndex = rule.RuleIndex,
                RuleGuid = rule.RuleGuid,
                RuleName = rule.RuleName,
                FunctionName = rule.FunctionName,
                Kind = rule.DisabledState == AcDisabledStates.DisabledInherited
                    ? "DisabledInheritedFrom"
                    : rule.DisabledState == AcDisabledStates.PossibleDisabledSequenceOnly
                        ? "PossibleDisabledSequenceOnlyFrom"
                        : "PossiblyDisabledInheritedFrom",
                TargetType = "Rule",
                Target = rule.DisabledAncestorRuleName ?? (rule.DisabledAncestorRuleIndex.HasValue ? "#" + rule.DisabledAncestorRuleIndex.Value : "Unknown ancestor"),
                ParameterName = "DisabledAncestorRuleIndex",
                ParameterRole = rule.DisabledState == AcDisabledStates.PossibleDisabledSequenceOnly ? "DisabledSequenceFallback" : "DisabledInheritance",
                Confidence = rule.DisabledConfidence,
                RelationshipReason = "Disabled inheritance",
                Evidence = rule.DisabledReason
            };
        }
    }

    private sealed class ParameterClassification
    {
        public string TargetType { get; set; } = "Parameter";

        public string Kind { get; set; } = "UsesParameter";

        public string ParameterRole { get; set; } = "Parameter";

        public bool IsOptionParameter { get; set; }
    }

    private static ParameterClassification ClassifyParameter(string functionName, string parameterName, string value)
    {
        string f = functionName ?? string.Empty;
        string p = parameterName ?? string.Empty;
        string v = value ?? string.Empty;

        if (p.Equals("RejectString", StringComparison.OrdinalIgnoreCase))
        {
            return new ParameterClassification
            {
                TargetType = "RejectMessage",
                Kind = "EmitsRejectMessage",
                ParameterRole = "RejectMessage"
            };
        }

        AcFunctionCatalog.Classification? catalog = AcFunctionCatalog.TryClassify(f, p);
        if (catalog != null)
        {
            return new ParameterClassification
            {
                TargetType = catalog.TargetType,
                Kind = catalog.RelationshipKind,
                ParameterRole = catalog.ParameterRole,
                IsOptionParameter = catalog.IsOptionParameter
            };
        }

        if (IsAttributeParameter(p))
        {
            return new ParameterClassification
            {
                TargetType = "Attribute",
                Kind = DetermineAttributeRelationshipKind(f),
                ParameterRole = "AttributeParameter"
            };
        }

        if (IsOptionParameter(p, v))
        {
            return new ParameterClassification
            {
                TargetType = IsRejectCodeOption(v) ? "RejectCode" : "Option",
                Kind = IsRejectCodeOption(v) ? "UsesRejectCode" : "UsesOption",
                ParameterRole = "OptionParameter",
                IsOptionParameter = true
            };
        }

        if (p.StartsWith("_ParamList", StringComparison.OrdinalIgnoreCase) || p.IndexOf("Field", StringComparison.OrdinalIgnoreCase) >= 0)
        {
            bool looksField = v.Contains(".") || LooksLikeFieldName(v);
            if (looksField)
            {
                return new ParameterClassification
                {
                    TargetType = "Field",
                    Kind = DetermineFieldRelationshipKind(f, p),
                    ParameterRole = "FieldParameter"
                };
            }
        }

        if (p.IndexOf("Page", StringComparison.OrdinalIgnoreCase) >= 0)
        {
            return new ParameterClassification
            {
                TargetType = "Page",
                Kind = "UsesPage",
                ParameterRole = "PageParameter"
            };
        }

        return new ParameterClassification
        {
            TargetType = "Parameter",
            Kind = "UsesParameter",
            ParameterRole = "GenericParameter"
        };
    }

    private static bool IsAttributeParameter(string parameterName)
    {
        return parameterName.Equals("AttrName", StringComparison.OrdinalIgnoreCase) ||
               parameterName.EndsWith("Attr", StringComparison.OrdinalIgnoreCase) ||
               parameterName.Equals("AttributeName", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsOptionParameter(string parameterName, string value)
    {
        if (parameterName.IndexOf("OMRIndex", StringComparison.OrdinalIgnoreCase) >= 0)
            return true;

        if (KnownOptionNames.Contains(value, StringComparer.OrdinalIgnoreCase))
            return true;

        return false;
    }

    private static bool IsRejectCodeOption(string value)
    {
        return value.Equals("RejectCode", StringComparison.OrdinalIgnoreCase) ||
               value.EndsWith("RejectCode", StringComparison.OrdinalIgnoreCase);
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

    private static string DetermineAttributeRelationshipKind(string functionName)
    {
        string f = functionName ?? string.Empty;

        if (f.IndexOf("Clear", StringComparison.OrdinalIgnoreCase) >= 0)
            return "ClearsAttribute";
        if (f.IndexOf("Set", StringComparison.OrdinalIgnoreCase) >= 0)
            return "WritesAttribute";
        if (f.IndexOf("Get", StringComparison.OrdinalIgnoreCase) >= 0 || f.IndexOf("Test", StringComparison.OrdinalIgnoreCase) >= 0)
            return "ReadsAttribute";

        return "UsesAttribute";
    }

    private static string DetermineFieldRelationshipKind(string functionName, string parameterName)
    {
        string f = functionName ?? string.Empty;
        string p = parameterName ?? string.Empty;

        if (f.IndexOf("Reject", StringComparison.OrdinalIgnoreCase) >= 0)
            return "RejectsField";
        if (f.Equals("Copy", StringComparison.OrdinalIgnoreCase) && p.EndsWith("1", StringComparison.OrdinalIgnoreCase))
            return "WritesField";
        if (f.Equals("Formatf", StringComparison.OrdinalIgnoreCase) ||
            f.Equals("DeleteLines", StringComparison.OrdinalIgnoreCase) ||
            f.StartsWith("LimitLine", StringComparison.OrdinalIgnoreCase) ||
            f.Equals("FormatDate", StringComparison.OrdinalIgnoreCase))
            return "MutatesField";
        if (f.IndexOf("SetFieldAttr", StringComparison.OrdinalIgnoreCase) >= 0)
            return "WritesFieldAttribute";
        if (f.IndexOf("ClearFieldAttr", StringComparison.OrdinalIgnoreCase) >= 0)
            return "ClearsFieldAttribute";

        return "UsesField";
    }

    private static bool LooksLikeFieldName(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        if (KnownOptionNames.Contains(value, StringComparer.OrdinalIgnoreCase))
            return false;

        if (value.StartsWith("temp", StringComparison.OrdinalIgnoreCase))
            return true;

        if (value.IndexOf('_') >= 0)
            return true;

        return value.Any(char.IsUpper) && value.Any(char.IsLower);
    }

    private static IEnumerable<string> GetParameterValues(AcRuleSummary rule, string key)
    {
        return rule.Parameters.TryGetValue(key, out var values) ? values : Enumerable.Empty<string>();
    }

    private static void AddRelationship(List<AcRuleRelationship> relationships, AcRuleRelationship candidate)
    {
        if (relationships.Any(r =>
            string.Equals(r.ScopePath, candidate.ScopePath, StringComparison.OrdinalIgnoreCase) &&
            r.RuleIndex == candidate.RuleIndex &&
            string.Equals(r.Kind, candidate.Kind, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(r.TargetType, candidate.TargetType, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(r.Target, candidate.Target, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(r.ParameterName, candidate.ParameterName, StringComparison.OrdinalIgnoreCase)))
        {
            return;
        }

        relationships.Add(candidate);
    }

    private static void ApplyRelationshipFilters(AcRelationshipReport report, AcTraceOptions options)
    {
        var filtered = report.Relationships.AsEnumerable();

        if (!string.IsNullOrWhiteSpace(options.Field))
            filtered = filtered.Where(r => r.TargetType == "Field" && ContainsIgnoreCase(r.Target, options.Field.Trim()));

        if (!string.IsNullOrWhiteSpace(options.Attr))
            filtered = filtered.Where(r => r.TargetType == "Attribute" && ContainsIgnoreCase(r.Target, options.Attr.Trim()));

        if (!string.IsNullOrWhiteSpace(options.RelationshipKind))
            filtered = filtered.Where(r => ContainsIgnoreCase(r.Kind, options.RelationshipKind.Trim()));

        if (!string.IsNullOrWhiteSpace(options.Term))
        {
            string term = options.Term.Trim();
            filtered = filtered.Where(r =>
                ContainsIgnoreCase(r.ScopePath, term) ||
                ContainsIgnoreCase(r.ScopeName, term) ||
                ContainsIgnoreCase(r.RuleName, term) ||
                ContainsIgnoreCase(r.FunctionName, term) ||
                ContainsIgnoreCase(r.Kind, term) ||
                ContainsIgnoreCase(r.TargetType, term) ||
                ContainsIgnoreCase(r.Target, term) ||
                ContainsIgnoreCase(r.ParameterRole, term) ||
                ContainsIgnoreCase(r.Evidence, term));
        }

        var kept = filtered.ToList();
        report.Relationships.Clear();
        report.Relationships.AddRange(kept);

        if (options.IncludeRules)
        {
            var keys = new HashSet<string>(report.Relationships.Select(r => r.ScopePath + "#" + r.RuleIndex), StringComparer.OrdinalIgnoreCase);
            report.Rules.RemoveAll(r => !keys.Contains(r.ScopePath + "#" + r.RuleIndex));
        }
    }

    private static void AnnotateDisabledStates(AcRuleReport report, bool inheritDisabled)
    {
        if (report == null)
            throw new ArgumentNullException(nameof(report));

        foreach (AcRuleSummary rule in report.Rules)
            ResetDisabledState(rule);

        foreach (AcRuleSummary rule in report.Rules.Where(IsDirectlyDisabled))
            MarkDirectDisabled(rule);

        if (!inheritDisabled)
            return;

        AcRuleFlowReport flow = BuildFlowReport(report, includeHeuristicSequence: true);
        var byKey = report.Rules.ToDictionary(r => r.ScopePath + "#" + r.RuleIndex, StringComparer.OrdinalIgnoreCase);

        // Parsed skip/branch descendants can be marked inherited. Heuristic sequence descendants
        // are intentionally marked as possible only, because order alone is not runtime branch proof.
        foreach (AcRuleSummary ancestor in report.Rules.Where(r => r.DisabledState == AcDisabledStates.DisabledDirect))
        {
            string ancestorKey = ancestor.ScopePath + "#" + ancestor.RuleIndex;
            foreach (AcRuleFlowEdge edge in flow.Edges.Where(e => string.Equals(e.ScopePath + "#" + e.FromRuleIndex, ancestorKey, StringComparison.OrdinalIgnoreCase)))
            {
                if (!edge.ToRuleIndex.HasValue)
                    continue;

                if (!byKey.TryGetValue(edge.ScopePath + "#" + edge.ToRuleIndex.Value, out AcRuleSummary target))
                    continue;

                if (target.DisabledState == AcDisabledStates.DisabledDirect)
                    continue;

                bool provenByFlow = edge.Confidence == AcEvidenceConfidence.Proven ||
                                    edge.Confidence == AcEvidenceConfidence.Parsed ||
                                    edge.EdgeKind == AcRuleFlowEdgeKind.SkipToRule ||
                                    edge.EdgeKind == AcRuleFlowEdgeKind.BackupSkipToRule ||
                                    edge.EdgeKind == AcRuleFlowEdgeKind.ActionBranch ||
                                    edge.EdgeKind == AcRuleFlowEdgeKind.ActionToSubList;

                if (provenByFlow && edge.EdgeKind != AcRuleFlowEdgeKind.SequentialNext)
                    MarkInheritedDisabled(target, ancestor, edge, hardInherited: true);
                else if (edge.EdgeKind == AcRuleFlowEdgeKind.SequentialNext)
                    MarkInheritedDisabled(target, ancestor, edge, hardInherited: false);
            }
        }

        // Conservative sequence fallback: once a direct disabled rule appears, subsequent same-scope
        // rules are marked only as possibly inherited-disabled until action-map/sub-list proof exists.
        foreach (IGrouping<string, AcRuleSummary> scopeGroup in report.Rules.GroupBy(r => r.ScopePath))
        {
            AcRuleSummary? currentDirectDisabled = null;
            foreach (AcRuleSummary rule in scopeGroup.OrderBy(r => r.RuleIndex))
            {
                if (rule.DisabledState == AcDisabledStates.DisabledDirect)
                {
                    currentDirectDisabled = rule;
                    continue;
                }

                if (currentDirectDisabled == null || rule.DisabledState != AcDisabledStates.Enabled)
                    continue;

                MarkPossiblyInheritedBySequence(rule, currentDirectDisabled);
            }
        }
    }

    private static bool IsDirectlyDisabled(AcRuleSummary rule)
    {
        return rule.Sources.Any(source => string.Equals(source, "_Disabled", StringComparison.OrdinalIgnoreCase)) ||
               rule.Parameters.Any(pair => pair.Value.Any(value => string.Equals(value, "_Disabled", StringComparison.OrdinalIgnoreCase)));
    }

    private static void ResetDisabledState(AcRuleSummary rule)
    {
        rule.DisabledState = AcDisabledStates.Enabled;
        rule.DisabledConfidence = "High";
        rule.DisabledReason = null;
        rule.DisabledAncestorRuleIndex = null;
        rule.DisabledAncestorRuleGuid = null;
        rule.DisabledAncestorRuleName = null;
        rule.DisabledBoundaryMethod = null;
        rule.DisabledEvidence.Clear();
    }

    private static void MarkDirectDisabled(AcRuleSummary rule)
    {
        rule.DisabledState = AcDisabledStates.DisabledDirect;
        rule.DisabledConfidence = "High";
        rule.DisabledReason = "Rule contains a direct disabled marker such as _Disabled.";
        rule.DisabledBoundaryMethod = "DirectSourceMarker";
        rule.DisabledEvidence.Add("Source/parameter marker: _Disabled");
    }

    private static void MarkInheritedDisabled(AcRuleSummary rule, AcRuleSummary ancestor, AcRuleFlowEdge edge, bool hardInherited)
    {
        rule.DisabledState = hardInherited ? AcDisabledStates.DisabledInherited : AcDisabledStates.PossibleDisabledSequenceOnly;
        rule.DisabledConfidence = hardInherited ? "High" : "Low";
        rule.DisabledReason = hardInherited
            ? "Rule is reached through a parsed flow edge from a directly disabled rule."
            : "Rule follows a directly disabled rule by sequence edge only; branch proof is not available.";
        rule.DisabledAncestorRuleIndex = ancestor.RuleIndex;
        rule.DisabledAncestorRuleGuid = ancestor.RuleGuid;
        rule.DisabledAncestorRuleName = ancestor.RuleName;
        rule.DisabledBoundaryMethod = hardInherited ? edge.EdgeKind : "SequenceFallback";
        rule.DisabledEvidence.Add($"Inherited from #{ancestor.RuleIndex} {ancestor.RuleName ?? "(unnamed)"}");
        rule.DisabledEvidence.Add($"Flow edge: {edge.EdgeKind}; confidence: {edge.Confidence}; evidence: {edge.Evidence}");
    }

    private static void MarkPossiblyInheritedBySequence(AcRuleSummary rule, AcRuleSummary ancestor)
    {
        rule.DisabledState = AcDisabledStates.PossibleDisabledSequenceOnly;
        rule.DisabledConfidence = "Low";
        rule.DisabledReason = "Rule follows a directly disabled rule in the same AC scope, but no decoded structural/action-list edge proves inheritance. This is audit-only sequence evidence.";
        rule.DisabledAncestorRuleIndex = ancestor.RuleIndex;
        rule.DisabledAncestorRuleGuid = ancestor.RuleGuid;
        rule.DisabledAncestorRuleName = ancestor.RuleName;
        rule.DisabledBoundaryMethod = "SameScopeSequenceFallback";
        rule.DisabledEvidence.Add($"Possible inheritance from #{ancestor.RuleIndex} {ancestor.RuleName ?? "(unnamed)"}");
        rule.DisabledEvidence.Add("Propagation method: same-scope following-rule fallback. Treat as possible, not proven.");
    }

    private static List<AcDisabledBlock> BuildDisabledBlocks(AcRuleReport report)
    {
        var blocks = new List<AcDisabledBlock>();

        foreach (IGrouping<string, AcRuleSummary> scopeGroup in report.Rules.GroupBy(r => r.ScopePath))
        {
            foreach (AcRuleSummary direct in scopeGroup.Where(r => r.DisabledState == AcDisabledStates.DisabledDirect).OrderBy(r => r.RuleIndex))
            {
                List<AcRuleSummary> affected = scopeGroup
                    .Where(r => r.DisabledAncestorRuleIndex == direct.RuleIndex &&
                                (r.DisabledState == AcDisabledStates.DisabledInherited || r.DisabledState == AcDisabledStates.PossiblyDisabledInherited || r.DisabledState == AcDisabledStates.PossibleDisabledSequenceOnly))
                    .OrderBy(r => r.RuleIndex)
                    .ToList();

                if (affected.Count == 0)
                    continue;

                var block = new AcDisabledBlock
                {
                    ScopePath = direct.ScopePath,
                    ScopeType = direct.ScopeType,
                    ScopeName = direct.ScopeName,
                    AncestorRuleIndex = direct.RuleIndex,
                    AncestorRuleGuid = direct.RuleGuid,
                    AncestorRuleName = direct.RuleName,
                    AncestorFunctionName = direct.FunctionName ?? string.Empty,
                    AffectedRuleCount = affected.Count,
                    Confidence = affected.Any(r => r.DisabledState == AcDisabledStates.PossiblyDisabledInherited || r.DisabledState == AcDisabledStates.PossibleDisabledSequenceOnly) ? "Low/Medium" : "Medium",
                    BoundaryMethod = "SameScopeFollowingRules",
                    Reason = "Directly disabled rule appears to gate subsequent same-scope rules. This is a heuristic disabled-inheritance marker."
                };

                block.AffectedRuleIndexes.AddRange(affected.Select(r => r.RuleIndex));
                blocks.Add(block);
            }
        }

        return blocks;
    }

    private static string NormalizeDisabledState(string state)
    {
        if (string.Equals(state, "direct", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(state, "disabled", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(state, AcDisabledStates.DisabledDirect, StringComparison.OrdinalIgnoreCase))
            return AcDisabledStates.DisabledDirect;

        if (string.Equals(state, "inherited", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(state, "inherit", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(state, AcDisabledStates.DisabledInherited, StringComparison.OrdinalIgnoreCase))
            return AcDisabledStates.DisabledInherited;

        if (string.Equals(state, "possible", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(state, "possibly", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(state, AcDisabledStates.PossiblyDisabledInherited, StringComparison.OrdinalIgnoreCase))
            return AcDisabledStates.PossiblyDisabledInherited;

        if (string.Equals(state, "sequence", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(state, "sequence-only", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(state, AcDisabledStates.PossibleDisabledSequenceOnly, StringComparison.OrdinalIgnoreCase))
            return AcDisabledStates.PossibleDisabledSequenceOnly;

        if (string.Equals(state, "enabled", StringComparison.OrdinalIgnoreCase))
            return AcDisabledStates.Enabled;

        return state;
    }

    private static string BuildAcViewerHtml(AcRuleReport rules, AcRelationshipReport relationships, AcRuleFlowReport flow, AcTreeReport tree)
    {
        // The viewer embeds the snapshot directly into a self-contained HTML file.
        // EscapeHtml prevents raw FWD/STC text from terminating the script block
        // with values such as </script> or from introducing accidental markup.
        var jsonSettings = new JsonSerializerSettings
        {
            StringEscapeHandling = StringEscapeHandling.EscapeHtml
        };

        string rulesJson = JsonConvert.SerializeObject(rules, Formatting.None, jsonSettings);
        string relJson = JsonConvert.SerializeObject(relationships, Formatting.None, jsonSettings);
        string flowJson = JsonConvert.SerializeObject(flow, Formatting.None, jsonSettings);
        string treeJson = JsonConvert.SerializeObject(tree, Formatting.None, jsonSettings);

        string rulesJsonEscaped = JsonConvert.ToString(rulesJson);
        string relJsonEscaped = JsonConvert.ToString(relJson);
        string flowJsonEscaped = JsonConvert.ToString(flowJson);
        string treeJsonEscaped = JsonConvert.ToString(treeJson);

        return LoadAcViewerHtmlTemplate()
            .Replace("\"__RULES_JSON__\"", rulesJsonEscaped)
            .Replace("\"__RELATIONSHIPS_JSON__\"", relJsonEscaped)
            .Replace("\"__FLOW_JSON__\"", flowJsonEscaped)
            .Replace("\"__TREE_JSON__\"", treeJsonEscaped)
            .Replace("__RULES_JSON__", rulesJson)
            .Replace("__RELATIONSHIPS_JSON__", relJson)
            .Replace("__FLOW_JSON__", flowJson)
            .Replace("__TREE_JSON__", treeJson);
    }

    private static string LoadAcViewerHtmlTemplate()
    {
        // Prefer the external viewer template when present. This keeps the large
        // HTML/CSS/JavaScript viewer out of C# string editing and prevents future
        // quote-escaping regressions. The embedded Base64 template remains as a
        // fallback so the harness still works if the content file is missing.
        string baseDirectory = AppDomain.CurrentDomain.BaseDirectory;
        string assemblyDirectory = Path.GetDirectoryName(typeof(FormWorksExtractionClient).Assembly.Location) ?? baseDirectory;

        string[] candidates =
        {
            Path.Combine(baseDirectory, "Viewer", "ac-viewer-template.html"),
            Path.Combine(assemblyDirectory, "Viewer", "ac-viewer-template.html"),
            Path.Combine(Environment.CurrentDirectory, "AcRuleWorkbench.Core", "Viewer", "ac-viewer-template.html"),
            Path.Combine(Environment.CurrentDirectory, "Viewer", "ac-viewer-template.html")
        };

        foreach (string candidate in candidates)
        {
            if (!File.Exists(candidate))
                continue;

            string content = File.ReadAllText(candidate, Encoding.UTF8);
            // If the external template contains the JSON placeholders return it so
            // the export embeds the snapshot inline. Otherwise ignore the external
            // template to avoid producing an HTML viewer that requires external
            // sidecar files which are brittle when opened via file:// URLs.
            if (content.Contains("__RULES_JSON__") || content.Contains("__RELATIONSHIPS_JSON__") || content.Contains("__TREE_JSON__") || content.Contains("__FLOW_JSON__"))
                return content;
        }

        // No suitable external template found; use the embedded template which
        // includes JSON placeholders that will be replaced with the snapshot.
        return AcViewerHtmlTemplate();
    }

    private static string AcViewerHtmlTemplate()
    {
        const string templateBase64 =
            "PCFkb2N0eXBlIGh0bWw+CjxodG1sIGxhbmc9ImVuIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij4KPG1ldGEgbmFtZT0idmlld3Bvcn" +
            "QiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCxpbml0aWFsLXNjYWxlPTEiPgo8dGl0bGU+QUMgUnVsZSBXb3JrYmVuY2g8L3RpdGxlPgo8" +
            "c3R5bGU+Cgo6cm9vdHsKICBjb2xvci1zY2hlbWU6ZGFyazsKICAtLWJnOiMwYjBkMTI7LS1iZzI6IzEwMTQxYjstLXBhbmVsOiMxMTE3MjI7LS" +
            "1wYW5lbDI6IzE1MWQyYTstLXBhbmVsMzojMWEyNDMzOwogIC0tY2FyZDojMTIxYTI2Oy0tY2FyZDI6IzBmMTYyMTstLWxpbmU6cmdiYSgxNTIs" +
            "MTYzLDE3OSwuMTgpOy0tbGluZTI6cmdiYSgxNTIsMTYzLDE3OSwuMzApOwogIC0tdGV4dDojZjJmNWY4Oy0tbXV0ZWQ6I2E3YjBiZTstLWZhaW" +
            "50OiM3MzdmOTA7CiAgLS1hY2NlbnQ6IzZlYThmZTstLWFjY2VudDI6IzhkZDNjNzstLXZpb2xldDojYjdhNmZmOy0tYmx1ZTojN2NjN2ZmOy0t" +
            "Z3JlZW46IzVlZTJiNzstLWFtYmVyOiNmZmQxNjY7LS1yZWQ6I2ZmN2E5MDsKICAtLWRpc2FibGVkOiM4OTkzYTM7LS1pbmhlcml0ZWQ6IzY4Nz" +
            "M4NDstLXNoYWRvdzowIDE4cHggNThweCByZ2JhKDAsMCwwLC4zNCk7CiAgLS1yYWRpdXM6MTZweDstLWxlZnQ6MzI2cHg7LS1yaWdodDo0MzBw" +
            "eDstLXJvdzozNHB4OwogIC0tZm9udDpTZWdvZSBVSSBWYXJpYWJsZSxTZWdvZSBVSSxJbnRlcix1aS1zYW5zLXNlcmlmLHN5c3RlbS11aSwtYX" +
            "BwbGUtc3lzdGVtLHNhbnMtc2VyaWY7CiAgLS1tb25vOkNhc2NhZGlhIE1vbm8sQ29uc29sYXMsdWktbW9ub3NwYWNlLFNGTW9uby1SZWd1bGFy" +
            "LG1vbm9zcGFjZTsKfQoqe2JveC1zaXppbmc6Ym9yZGVyLWJveH1odG1sLGJvZHl7aGVpZ2h0OjEwMCV9CmJvZHl7bWFyZ2luOjA7b3ZlcmZsb3" +
            "c6aGlkZGVuO2NvbG9yOnZhcigtLXRleHQpO2ZvbnQtZmFtaWx5OnZhcigtLWZvbnQpO2ZvbnQtc2l6ZToxM3B4O2JhY2tncm91bmQ6bGluZWFy" +
            "LWdyYWRpZW50KDE4MGRlZywjMGIwZDEyIDAlLCMwZjE0MWQgNTAlLCMwYjBmMTcgMTAwJSl9CmJvZHk6YmVmb3Jle2NvbnRlbnQ6IiI7cG9zaX" +
            "Rpb246Zml4ZWQ7aW5zZXQ6MDtwb2ludGVyLWV2ZW50czpub25lO2JhY2tncm91bmQ6cmFkaWFsLWdyYWRpZW50KGNpcmNsZSBhdCAxOCUgLTEw" +
            "JSxyZ2JhKDExMCwxNjgsMjU0LC4xMiksdHJhbnNwYXJlbnQgMzAlKSxyYWRpYWwtZ3JhZGllbnQoY2lyY2xlIGF0IDkyJSAwLHJnYmEoMTQxLD" +
            "IxMSwxOTksLjEwKSx0cmFuc3BhcmVudCAyOCUpO29wYWNpdHk6Ljl9CmJ1dHRvbixpbnB1dCxzZWxlY3R7Zm9udDppbmhlcml0O2NvbG9yOnZh" +
            "cigtLXRleHQpO2JhY2tncm91bmQ6cmdiYSgxMiwxNywyNSwuOTIpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZTIpO2JvcmRlci1yYWRpdX" +
            "M6MTFweDtwYWRkaW5nOjhweCAxMHB4O291dGxpbmU6bm9uZX0KYnV0dG9ue2N1cnNvcjpwb2ludGVyfWJ1dHRvbjpob3Zlcntib3JkZXItY29s" +
            "b3I6cmdiYSgxMTAsMTY4LDI1NCwuNTgpO2JhY2tncm91bmQ6cmdiYSgyMywzMiw0NiwuOTYpfWJ1dHRvbjpmb2N1cyxpbnB1dDpmb2N1cyxzZW" +
            "xlY3Q6Zm9jdXN7Ym9yZGVyLWNvbG9yOnZhcigtLWFjY2VudCk7Ym94LXNoYWRvdzowIDAgMCAzcHggcmdiYSgxMTAsMTY4LDI1NCwuMTQpfQpi" +
            "dXR0b24uYWN0aXZlLC5tb2RlLXRhYi5hY3RpdmV7Ym9yZGVyLWNvbG9yOnJnYmEoMTEwLDE2OCwyNTQsLjc2KTtiYWNrZ3JvdW5kOmxpbmVhci" +
            "1ncmFkaWVudCgxMzVkZWcscmdiYSgxMTAsMTY4LDI1NCwuMTgpLHJnYmEoMTQxLDIxMSwxOTksLjEwKSk7Ym94LXNoYWRvdzppbnNldCAwIDFw" +
            "eCAwIHJnYmEoMjU1LDI1NSwyNTUsLjA1KX0KLmFwcHtoZWlnaHQ6MTAwJTtkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1yb3dzOjY2cHggMW" +
            "ZyfS50b3B7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoxZnIgYXV0bzthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjE4cHg7cGFk" +
            "ZGluZzoxMnB4IDE4cHg7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgdmFyKC0tbGluZSk7YmFja2dyb3VuZDpyZ2JhKDgsMTEsMTcsLjkyKTtiYW" +
            "NrZHJvcC1maWx0ZXI6Ymx1cigxOHB4KX0KLmJyYW5kIGgxe21hcmdpbjowO2ZvbnQtc2l6ZToxOHB4O2xldHRlci1zcGFjaW5nOi4wMWVtfS5i" +
            "cmFuZCAuc3Vie21hcmdpbi10b3A6NHB4O2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTFweH0uc3RhdHN7ZGlzcGxheTpmbGV4O2dhcD" +
            "o4cHh9LnN0YXR7bWluLXdpZHRoOjkwcHg7cGFkZGluZzo4cHggMTBweDtib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JvcmRlci1yYWRp" +
            "dXM6MTRweDtiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCgxODBkZWcscmdiYSgyNCwzMiw0NSwuOTUpLHJnYmEoMTQsMTksMjgsLjg4KSk7Ym" +
            "94LXNoYWRvdzowIDEwcHggMjRweCByZ2JhKDAsMCwwLC4yMCl9LnN0YXQgYntkaXNwbGF5OmJsb2NrO2ZvbnQtc2l6ZToxNnB4fS5zdGF0IHNw" +
            "YW57ZGlzcGxheTpibG9jazt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7Zm9udC1zaXplOjEwcHg7Y29sb3I6dmFyKC0tbXV0ZWQpO2xldHRlci" +
            "1zcGFjaW5nOi4wOGVtfQouc2hlbGx7bWluLWhlaWdodDowO2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6dmFyKC0tbGVmdCkg" +
            "bWlubWF4KDcwMHB4LDFmcikgdmFyKC0tcmlnaHQpfS5wYW5le21pbi1oZWlnaHQ6MDtvdmVyZmxvdzpoaWRkZW47Ym9yZGVyLXJpZ2h0OjFweC" +
            "Bzb2xpZCB2YXIoLS1saW5lKTtiYWNrZ3JvdW5kOnJnYmEoMTMsMTgsMjcsLjc0KX0ucGFuZTpsYXN0LWNoaWxke2JvcmRlci1yaWdodDowfS5w" +
            "YW5lLXNjcm9sbHtoZWlnaHQ6MTAwJTtvdmVyZmxvdzphdXRvfS5sZWZ0LWhlYWQsLmNvbmZpZy1oZWFkLC5pbnNwZWN0b3ItaGVhZHtwb3NpdG" +
            "lvbjpzdGlja3k7dG9wOjA7ei1pbmRleDo1O3BhZGRpbmc6MTNweCAxNHB4O2JvcmRlci1ib3R0b206MXB4IHNvbGlkIHZhcigtLWxpbmUpO2Jh" +
            "Y2tncm91bmQ6cmdiYSgxMywxNywyNSwuOTYpO2JhY2tkcm9wLWZpbHRlcjpibHVyKDE4cHgpfQouZXllYnJvd3tkaXNwbGF5OmZsZXg7YWxpZ2" +
            "4taXRlbXM6Y2VudGVyO2dhcDo3cHg7Y29sb3I6I2M0Y2NkYTt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6LjEwZW07" +
            "Zm9udC1zaXplOjEwcHg7Zm9udC13ZWlnaHQ6ODAwfS5kb3R7d2lkdGg6N3B4O2hlaWdodDo3cHg7Ym9yZGVyLXJhZGl1czozcHg7YmFja2dyb3" +
            "VuZDpsaW5lYXItZ3JhZGllbnQoMTM1ZGVnLHZhcigtLWFjY2VudCksdmFyKC0tYWNjZW50MikpfS50cmVlLWZpbHRlcnt3aWR0aDoxMDAlO21h" +
            "cmdpbi10b3A6MTFweH0ubGVmdC1ub3Rle21hcmdpbi10b3A6MTBweDtjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjExcHg7bGluZS1oZW" +
            "lnaHQ6MS40NX0uZndkLXRyZWV7cGFkZGluZzoxMHB4IDhweCAyOHB4fS50cmVlLWdyb3Vwe21hcmdpbjoxMHB4IDAgNnB4fS5ncm91cC10aXRs" +
            "ZXtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2dhcDo4cHg7Y29sb3I6I2Q4ZGVlODtmb250LXdlaWdodDo4NTA7Zm9udC1zaXplOj" +
            "EycHg7cGFkZGluZzo3cHggMTBweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6LjA2ZW19LnNjb3BlLWl0ZW17ZGlz" +
            "cGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczoyMHB4IDFmciBhdXRvO2dhcDo4cHg7YWxpZ24taXRlbXM6Y2VudGVyO21pbi1oZWlnaH" +
            "Q6NDBweDtwYWRkaW5nOjhweCA5cHg7bWFyZ2luOjNweCAwO2JvcmRlcjoxcHggc29saWQgdHJhbnNwYXJlbnQ7Ym9yZGVyLXJhZGl1czoxMnB4" +
            "O2N1cnNvcjpwb2ludGVyO3Bvc2l0aW9uOnJlbGF0aXZlfS5zY29wZS1pdGVtOmJlZm9yZXtjb250ZW50OicnO3Bvc2l0aW9uOmFic29sdXRlO2" +
            "xlZnQ6LTVweDt0b3A6OHB4O2JvdHRvbTo4cHg7d2lkdGg6M3B4O2JvcmRlci1yYWRpdXM6OTk5cHg7YmFja2dyb3VuZDp0cmFuc3BhcmVudH0u" +
            "c2NvcGUtaXRlbTpob3ZlcntiYWNrZ3JvdW5kOnJnYmEoMTEwLDE2OCwyNTQsLjEwKTtib3JkZXItY29sb3I6cmdiYSgxMTAsMTY4LDI1NCwuMj" +
            "UpO2JveC1zaGFkb3c6aW5zZXQgMCAxcHggMCByZ2JhKDI1NSwyNTUsMjU1LC4wMzUpfS5zY29wZS1pdGVtLmFjdGl2ZXtiYWNrZ3JvdW5kOmxp" +
            "bmVhci1ncmFkaWVudCg5MGRlZyxyZ2JhKDExMCwxNjgsMjU0LC4xOCkscmdiYSgxNDEsMjExLDE5OSwuMDgpKTtib3JkZXItY29sb3I6cmdiYS" +
            "gxMTAsMTY4LDI1NCwuNDIpO2JveC1zaGFkb3c6MCAxMHB4IDI4cHggcmdiYSgwLDAsMCwuMjApfS5zY29wZS1pdGVtLmFjdGl2ZTpiZWZvcmV7" +
            "YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoMTgwZGVnLHZhcigtLWFjY2VudCksdmFyKC0tYWNjZW50MikpfS5zY29wZS1pdGVtLm11dGVke2" +
            "9wYWNpdHk6LjcyO2N1cnNvcjpkZWZhdWx0fS5zY29wZS1pY29ue2NvbG9yOnZhcigtLWJsdWUpO2ZvbnQtc2l6ZToxMnB4fS5zY29wZS1tYWlu" +
            "IGJ7ZGlzcGxheTpibG9jazt3aGl0ZS1zcGFjZTpub3dyYXA7b3ZlcmZsb3c6aGlkZGVuO3RleHQtb3ZlcmZsb3c6ZWxsaXBzaXN9LnNjb3BlLW" +
            "1haW4gc3BhbntkaXNwbGF5OmJsb2NrO2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTFweH0uc2NvcGUtY291bnR7Zm9udC1zaXplOjEw" +
            "cHg7Y29sb3I6I2U2ZWVmOTtib3JkZXI6MXB4IHNvbGlkIHJnYmEoMTUyLDE2MywxNzksLjIyKTtib3JkZXItcmFkaXVzOjk5OXB4O3BhZGRpbm" +
            "c6MnB4IDdweDtiYWNrZ3JvdW5kOnJnYmEoMTYsMjIsMzMsLjg2KTttaW4td2lkdGg6MjRweDt0ZXh0LWFsaWduOmNlbnRlcn0uc2NvcGUtaXRl" +
            "bS5hY3RpdmUgLnNjb3BlLWNvdW50e2JvcmRlci1jb2xvcjpyZ2JhKDExMCwxNjgsMjU0LC40NCk7YmFja2dyb3VuZDpyZ2JhKDExMCwxNjgsMj" +
            "U0LC4xNil9Ci5jb25maWctaGVhZHtkaXNwbGF5OmdyaWQ7Z2FwOjExcHh9LmNvbmZpZy10aXRsZXtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6" +
            "ZmxleC1zdGFydDtqdXN0aWZ5LWNvbnRlbnQ6c3BhY2UtYmV0d2VlbjtnYXA6MTZweH0uY29uZmlnLXRpdGxlIGgye2ZvbnQtc2l6ZToxNXB4O2" +
            "1hcmdpbjowfS5jb25maWctdGl0bGUgLmNhcHRpb257Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxMXB4O21hcmdpbi10b3A6M3B4fS5z" +
            "Y29wZS1zdGF0c3tkaXNwbGF5OmZsZXg7Z2FwOjhweDtmbGV4LXdyYXA6d3JhcDtqdXN0aWZ5LWNvbnRlbnQ6ZmxleC1lbmR9Lm1pbmktc3RhdH" +
            "tib3JkZXI6MXB4IHNvbGlkIHZhcigtLWxpbmUpO2JhY2tncm91bmQ6cmdiYSgxOCwyNSwzNywuNzIpO2JvcmRlci1yYWRpdXM6OTk5cHg7cGFk" +
            "ZGluZzo0cHggOHB4O2ZvbnQtc2l6ZToxMXB4O2NvbG9yOiNkNWRjZTh9Lm1vZGUtdGFic3tkaXNwbGF5OmZsZXg7Z2FwOjdweDtmbGV4LXdyYX" +
            "A6d3JhcH0ubW9kZS10YWJ7Zm9udC1zaXplOjEycHg7cGFkZGluZzo4cHggMTBweH0udG9vbGJhci1yb3d7ZGlzcGxheTpmbGV4O2dhcDo4cHg7" +
            "YWxpZ24taXRlbXM6Y2VudGVyO2ZsZXgtd3JhcDp3cmFwfS50b29sYmFyLXJvdyBpbnB1dHttaW4td2lkdGg6MzIwcHg7ZmxleDoxfS50b29sYm" +
            "FyLXJvdyAuYWR2LXRvZ2dsZXtib3JkZXItY29sb3I6cmdiYSgxNDEsMjExLDE5OSwuNTApO2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEz" +
            "NWRlZyxyZ2JhKDE0MSwyMTEsMTk5LC4xMSkscmdiYSgxMTAsMTY4LDI1NCwuMDgpKX0udG9vbGJhci1yb3cgLmFkdi10b2dnbGUuYWN0aXZle2" +
            "JvcmRlci1jb2xvcjpyZ2JhKDE0MSwyMTEsMTk5LC43OCk7Ym94LXNoYWRvdzowIDAgMCAzcHggcmdiYSgxNDEsMjExLDE5OSwuMTApfQouYWR2" +
            "YW5jZWQtcGFuZWx7ZGlzcGxheTpub25lO21hcmdpbi10b3A6OXB4O2JvcmRlcjoxcHggc29saWQgcmdiYSgxNDEsMjExLDE5OSwuMjIpO2Jvcm" +
            "Rlci1yYWRpdXM6MTVweDtiYWNrZ3JvdW5kOmxpbmVhci1ncmFkaWVudCgxODBkZWcscmdiYSgxOCwyNywzOCwuOTYpLHJnYmEoMTMsMTksMjks" +
            "Ljk0KSk7cGFkZGluZzoxMnB4O2JveC1zaGFkb3c6dmFyKC0tc2hhZG93KX0uYWR2YW5jZWQtcGFuZWwub3BlbntkaXNwbGF5OmJsb2NrfS5hZH" +
            "ZhbmNlZC1oZWFke2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OnNwYWNlLWJldHdlZW47Z2FwOjEycHg7" +
            "bWFyZ2luLWJvdHRvbToxMHB4fS5hZHZhbmNlZC1oZWFkIGJ7Zm9udC1zaXplOjEycHh9LmFkdmFuY2VkLWhlYWQgc3Bhbntmb250LXNpemU6MT" +
            "FweDtjb2xvcjp2YXIoLS1tdXRlZCl9LmFkdi1ncmlke2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6cmVwZWF0KDQsbWlubWF4" +
            "KDE0MHB4LDFmcikpO2dhcDo4cHh9LmFkdi1ncmlkIGxhYmVse2Rpc3BsYXk6Z3JpZDtnYXA6NHB4O2NvbG9yOnZhcigtLW11dGVkKTtmb250LX" +
            "NpemU6MTBweDt0ZXh0LXRyYW5zZm9ybTp1cHBlcmNhc2U7bGV0dGVyLXNwYWNpbmc6LjA2ZW19LmFkdi1ncmlkIGlucHV0LC5hZHYtZ3JpZCBz" +
            "ZWxlY3R7d2lkdGg6MTAwJTtmb250LXNpemU6MTJweH0uYWR2LW9wdGlvbnN7ZGlzcGxheTpmbGV4O2dhcDoxMnB4O2FsaWduLWl0ZW1zOmNlbn" +
            "RlcjtmbGV4LXdyYXA6d3JhcDttYXJnaW4tdG9wOjlweDtjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjEycHh9LmFkdi1vcHRpb25zIGxh" +
            "YmVse2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjZweH0uYWR2LW9wdGlvbnMgaW5wdXR7d2lkdGg6YXV0b30uc2VhcmNoLX" +
            "N1bW1hcnl7ZGlzcGxheTpmbGV4O2dhcDo2cHg7ZmxleC13cmFwOndyYXA7bWFyZ2luLXRvcDo4cHh9LnNlYXJjaC1jaGlwe2ZvbnQtc2l6ZTox" +
            "MHB4O3BhZGRpbmc6M3B4IDdweDtib3JkZXI6MXB4IHNvbGlkIHJnYmEoMTQxLDIxMSwxOTksLjI4KTtib3JkZXItcmFkaXVzOjk5OXB4O2JhY2" +
            "tncm91bmQ6cmdiYSgxNDEsMjExLDE5OSwuMDkpO2NvbG9yOiNkOGZmZjZ9Ci5jb250ZW50e2hlaWdodDpjYWxjKDEwMCUgLSAwcHgpO292ZXJm" +
            "bG93OmF1dG87cGFkZGluZzoxMnB4IDE0cHggMzZweH0uZW1wdHktc3RhdGV7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcm" +
            "FkaXVzOnZhcigtLXJhZGl1cyk7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoMTgwZGVnLHJnYmEoMjAsMjgsMzksLjgyKSxyZ2JhKDEzLDE4" +
            "LDI3LC43NikpO3BhZGRpbmc6MjZweDtib3gtc2hhZG93OnZhcigtLXNoYWRvdyl9LmVtcHR5LXN0YXRlIGgze21hcmdpbjowIDAgOHB4O2Zvbn" +
            "Qtc2l6ZToxN3B4fS5lbXB0eS1zdGF0ZSBwe21hcmdpbjowO2NvbG9yOnZhcigtLW11dGVkKTtsaW5lLWhlaWdodDoxLjU1fS5sYXVuY2gtc3Rh" +
            "dGV7bWF4LXdpZHRoOjk4MHB4O21hcmdpbjoxOHB4IGF1dG8gMDtiYWNrZ3JvdW5kOnJhZGlhbC1ncmFkaWVudChjaXJjbGUgYXQgMTglIDAscm" +
            "diYSgxMTAsMTY4LDI1NCwuMTQpLHRyYW5zcGFyZW50IDM0JSksbGluZWFyLWdyYWRpZW50KDE4MGRlZyxyZ2JhKDIxLDI5LDQyLC45NCkscmdi" +
            "YSgxMywxOCwyNywuODYpKTtwYWRkaW5nOjMwcHh9LmxhdW5jaC1raWNrZXJ7ZGlzcGxheTppbmxpbmUtZmxleDtnYXA6N3B4O2FsaWduLWl0ZW" +
            "1zOmNlbnRlcjtjb2xvcjojZGJlN2Y3O2ZvbnQtc2l6ZToxMXB4O3RleHQtdHJhbnNmb3JtOnVwcGVyY2FzZTtsZXR0ZXItc3BhY2luZzouMTBl" +
            "bTtmb250LXdlaWdodDo4NTA7bWFyZ2luLWJvdHRvbToxMnB4fS5sYXVuY2gta2lja2VyOmJlZm9yZXtjb250ZW50OicnO3dpZHRoOjhweDtoZW" +
            "lnaHQ6OHB4O2JvcmRlci1yYWRpdXM6M3B4O2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDEzNWRlZyx2YXIoLS1hY2NlbnQpLHZhcigtLWFj" +
            "Y2VudDIpKX0ucXVpY2stc3RhcnQtZ3JpZHtkaXNwbGF5OmdyaWQ7Z3JpZC10ZW1wbGF0ZS1jb2x1bW5zOnJlcGVhdCgzLG1pbm1heCgxNjBweC" +
            "wxZnIpKTtnYXA6MTBweDttYXJnaW4tdG9wOjE4cHh9LnF1aWNrLXNjb3Ble2JvcmRlcjoxcHggc29saWQgcmdiYSgxNTIsMTYzLDE3OSwuMjAp" +
            "O2JvcmRlci1yYWRpdXM6MTVweDtiYWNrZ3JvdW5kOnJnYmEoMTAsMTUsMjIsLjYyKTtwYWRkaW5nOjEzcHg7dGV4dC1hbGlnbjpsZWZ0fS5xdW" +
            "ljay1zY29wZTpob3Zlcntib3JkZXItY29sb3I6cmdiYSgxMTAsMTY4LDI1NCwuNTIpO2JhY2tncm91bmQ6cmdiYSgxMTAsMTY4LDI1NCwuMTAp" +
            "fS5xdWljay1zY29wZSBie2Rpc3BsYXk6YmxvY2s7Zm9udC1zaXplOjEzcHh9LnF1aWNrLXNjb3BlIHNwYW57ZGlzcGxheTpibG9jazttYXJnaW" +
            "4tdG9wOjRweDtjb2xvcjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjExcHh9LmVtcHR5LXN0ZXBze2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRl" +
            "LWNvbHVtbnM6cmVwZWF0KDMsbWlubWF4KDAsMWZyKSk7Z2FwOjEwcHg7bWFyZ2luLXRvcDoxNnB4fS5lbXB0eS1zdGVwe2JvcmRlcjoxcHggc2" +
            "9saWQgcmdiYSgxNTIsMTYzLDE3OSwuMTQpO2JvcmRlci1yYWRpdXM6MTRweDtwYWRkaW5nOjEycHg7YmFja2dyb3VuZDpyZ2JhKDEwLDE1LDIy" +
            "LC40OCl9LmVtcHR5LXN0ZXAgYntkaXNwbGF5OmJsb2NrO2NvbG9yOiNlZGY1ZmZ9LmVtcHR5LXN0ZXAgc3BhbntkaXNwbGF5OmJsb2NrO21hcm" +
            "dpbi10b3A6NHB4O2NvbG9yOnZhcigtLW11dGVkKTtmb250LXNpemU6MTFweDtsaW5lLWhlaWdodDoxLjQ1fS50b29sYmFyLWRpc2FibGVke3dp" +
            "ZHRoOjEwMCU7Ym9yZGVyOjFweCBkYXNoZWQgcmdiYSgxNTIsMTYzLDE3OSwuMjIpO2JvcmRlci1yYWRpdXM6MTRweDtwYWRkaW5nOjExcHggMT" +
            "JweDtjb2xvcjp2YXIoLS1tdXRlZCk7YmFja2dyb3VuZDpyZ2JhKDEwLDE1LDIyLC40Mil9Lm1vZGUtaGVscHttYXJnaW46MCAwIDEycHg7Ym9y" +
            "ZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjE0cHg7YmFja2dyb3VuZDpyZ2JhKDE3LDI0LDM1LC43MCk7cGFkZGluZz" +
            "oxMXB4IDEycHg7Y29sb3I6dmFyKC0tbXV0ZWQpO2xpbmUtaGVpZ2h0OjEuNDV9Lm1vZGUtaGVscCBie2NvbG9yOiNlZWY0ZmJ9LmJyZWFkY3J1" +
            "bWJ7ZGlzcGxheTpmbGV4O2dhcDo2cHg7ZmxleC13cmFwOndyYXA7YWxpZ24taXRlbXM6Y2VudGVyO21hcmdpbi1ib3R0b206MTBweDtjb2xvcj" +
            "p2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjExcHh9LmNydW1ie2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czo5OTlw" +
            "eDtwYWRkaW5nOjNweCA4cHg7YmFja2dyb3VuZDpyZ2JhKDE0LDIwLDMwLC44Mik7Y29sb3I6I2RiZTRlZn0KLnJ1bGUtbGlzdHtkaXNwbGF5Om" +
            "dyaWQ7Z2FwOjZweH0ucm93LWNhcmR7ZGlzcGxheTpncmlkO2dyaWQtdGVtcGxhdGUtY29sdW1uczo1OHB4IDFmciBhdXRvO2dhcDoxMHB4O2Fs" +
            "aWduLWl0ZW1zOmNlbnRlcjttaW4taGVpZ2h0OjQwcHg7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtib3JkZXItcmFkaXVzOjEycHg7cG" +
            "FkZGluZzo4cHggMTBweDtiYWNrZ3JvdW5kOnJnYmEoMTgsMjUsMzcsLjY4KTtjdXJzb3I6cG9pbnRlcn0ucm93LWNhcmQ6aG92ZXIsLnJvdy1j" +
            "YXJkLmFjdGl2ZXtib3JkZXItY29sb3I6cmdiYSgxMTAsMTY4LDI1NCwuNDgpO2JhY2tncm91bmQ6cmdiYSgyNiwzNiw1MSwuODgpfS5yb3ctY2" +
            "FyZC5zZWN0aW9uLXJvd3tiYWNrZ3JvdW5kOnJnYmEoMjUsMjYsMzAsLjU4KTtib3JkZXItc3R5bGU6ZGFzaGVkfS5yb3ctbnVte2ZvbnQtZmFt" +
            "aWx5OnZhcigtLW1vbm8pO2NvbG9yOiNhOWNmZmZ9LnJvdy10aXRsZSBie2Rpc3BsYXk6YmxvY2t9LnJvdy10aXRsZSBzcGFue2Rpc3BsYXk6Ym" +
            "xvY2s7Y29sb3I6dmFyKC0tbXV0ZWQpO2ZvbnQtc2l6ZToxMXB4O21hcmdpbi10b3A6MnB4fS5jaGlwc3tkaXNwbGF5OmZsZXg7Z2FwOjVweDtm" +
            "bGV4LXdyYXA6d3JhcDtqdXN0aWZ5LWNvbnRlbnQ6ZmxleC1lbmR9LmNoaXB7Zm9udC1zaXplOjEwcHg7Ym9yZGVyOjFweCBzb2xpZCByZ2JhKD" +
            "E1MiwxNjMsMTc5LC4yMik7Ym9yZGVyLXJhZGl1czo5OTlweDtwYWRkaW5nOjJweCA3cHg7Y29sb3I6I2QyZDllNDtiYWNrZ3JvdW5kOnJnYmEo" +
            "OCwxMiwxOCwuNTgpfS5jaGlwLnJ1bGV7Ym9yZGVyLWNvbG9yOnJnYmEoMTI0LDE5OSwyNTUsLjMwKTtjb2xvcjojY2RlYWZmfS5jaGlwLmFjdG" +
            "lvbntib3JkZXItY29sb3I6cmdiYSgxODMsMTY2LDI1NSwuMzQpO2NvbG9yOiNlOGUxZmZ9LmNoaXAuYmFke2JvcmRlci1jb2xvcjpyZ2JhKDI1" +
            "NSwxMjIsMTQ0LC4zOCk7Y29sb3I6I2ZmZDFkYX0uY2hpcC53YXJue2JvcmRlci1jb2xvcjpyZ2JhKDI1NSwyMDksMTAyLC40MCk7Y29sb3I6I2" +
            "ZmZTdhNn0uY2hpcC5nb29ke2JvcmRlci1jb2xvcjpyZ2JhKDk0LDIyNiwxODMsLjM4KTtjb2xvcjojY2ZmZmVlfQoucmFpbC10cmVley0tZGVw" +
            "dGg6MDtkaXNwbGF5OmdyaWQ7Z2FwOjFweH0udHJlZS1saW5le3Bvc2l0aW9uOnJlbGF0aXZlO2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLW" +
            "NvbHVtbnM6MjRweCAxZnIgYXV0bztnYXA6N3B4O2FsaWduLWl0ZW1zOmNlbnRlcjttaW4taGVpZ2h0OnZhcigtLXJvdyk7bWFyZ2luLWxlZnQ6" +
            "Y2FsYyh2YXIoLS1kZXB0aCkgKiAyNHB4KTtib3JkZXItcmFkaXVzOjEwcHg7cGFkZGluZzo0cHggOXB4O2JvcmRlcjoxcHggc29saWQgdHJhbn" +
            "NwYXJlbnR9LnRyZWUtbGluZTpiZWZvcmV7Y29udGVudDoiIjtwb3NpdGlvbjphYnNvbHV0ZTtsZWZ0Oi0xM3B4O3RvcDotNHB4O2JvdHRvbTot" +
            "NHB4O3dpZHRoOjFweDtiYWNrZ3JvdW5kOnJnYmEoMTUyLDE2MywxNzksLjE4KTtkaXNwbGF5OmJsb2NrfS50cmVlLWxpbmU6YWZ0ZXJ7Y29udG" +
            "VudDoiIjtwb3NpdGlvbjphYnNvbHV0ZTtsZWZ0Oi0xM3B4O3RvcDo1MCU7d2lkdGg6MTJweDtoZWlnaHQ6MXB4O2JhY2tncm91bmQ6cmdiYSgx" +
            "NTIsMTYzLDE3OSwuMTgpO2Rpc3BsYXk6YmxvY2t9LnRyZWUtbGluZVtkYXRhLWRlcHRoPSIwIl06YmVmb3JlLC50cmVlLWxpbmVbZGF0YS1kZX" +
            "B0aD0iMCJdOmFmdGVye2Rpc3BsYXk6bm9uZX0udHJlZS1saW5lOmhvdmVyLC50cmVlLWxpbmUuYWN0aXZle2JhY2tncm91bmQ6cmdiYSgxMTAs" +
            "MTY4LDI1NCwuMTApO2JvcmRlci1jb2xvcjpyZ2JhKDExMCwxNjgsMjU0LC4yMil9LnRyZWUtbGluZS5ydWxlLXJvd3tiYWNrZ3JvdW5kOnJnYm" +
            "EoMTgsMjUsMzcsLjUyKX0udHJlZS1saW5lLmFjdGlvbi1yb3d7bWluLWhlaWdodDozMHB4O2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDkw" +
            "ZGVnLHJnYmEoMTQxLDIxMSwxOTksLjEzKSxyZ2JhKDE4LDI1LDM3LC40MykpO2JvcmRlci1jb2xvcjpyZ2JhKDE0MSwyMTEsMTk5LC4xMyl9Ln" +
            "RyZWUtbGluZS5zZWN0aW9uLXJvd3tiYWNrZ3JvdW5kOnJnYmEoMjIsMjQsMjgsLjUwKTtib3JkZXItc3R5bGU6ZGFzaGVkfS50d2lzdHl7d2lk" +
            "dGg6MjFweDtoZWlnaHQ6MjFweDtib3JkZXItcmFkaXVzOjdweDtkaXNwbGF5OmdyaWQ7cGxhY2UtaXRlbXM6Y2VudGVyO3BhZGRpbmc6MDtmb2" +
            "50LXNpemU6MTBweDtiYWNrZ3JvdW5kOnJnYmEoOCwxMiwxOCwuNzIpfS50d2lzdHkuYmxhbmt7b3BhY2l0eTouMjI7cG9pbnRlci1ldmVudHM6" +
            "bm9uZX0ubm9kZS1sYWJlbHttaW4td2lkdGg6MH0ubm9kZS1sYWJlbCBie2Rpc3BsYXk6YmxvY2s7d2hpdGUtc3BhY2U6bm93cmFwO292ZXJmbG" +
            "93OmhpZGRlbjt0ZXh0LW92ZXJmbG93OmVsbGlwc2lzO2ZvbnQtc2l6ZToxMnB4fS5ub2RlLWxhYmVsIHNwYW57ZGlzcGxheTpibG9jaztjb2xv" +
            "cjp2YXIoLS1tdXRlZCk7Zm9udC1zaXplOjEwcHg7d2hpdGUtc3BhY2U6bm93cmFwO292ZXJmbG93OmhpZGRlbjt0ZXh0LW92ZXJmbG93OmVsbG" +
            "lwc2lzO21hcmdpbi10b3A6MXB4fS5hY3Rpb24tcm93IC5ub2RlLWxhYmVsIGJ7Y29sb3I6I2Q5ZmZmNztmb250LXdlaWdodDo3NjB9LmRpc2Fi" +
            "bGVkLWRpcmVjdCAubm9kZS1sYWJlbCBiLC5yb3ctY2FyZC5kaXNhYmxlZC1kaXJlY3QgLnJvdy10aXRsZSBie2NvbG9yOnZhcigtLWRpc2FibG" +
            "VkKTt0ZXh0LWRlY29yYXRpb246bGluZS10aHJvdWdofS5kaXNhYmxlZC1pbmhlcml0ZWQgLm5vZGUtbGFiZWwgYiwucm93LWNhcmQuZGlzYWJs" +
            "ZWQtaW5oZXJpdGVkIC5yb3ctdGl0bGUgYntjb2xvcjp2YXIoLS1pbmhlcml0ZWQpfS5tYXRjaC1oaXR7Ym94LXNoYWRvdzppbnNldCAzcHggMC" +
            "AwIHZhcigtLWFjY2VudCl9Ci5pbnNwZWN0b3ItaGVhZHtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyO2p1c3RpZnktY29udGVudDpz" +
            "cGFjZS1iZXR3ZWVuO2dhcDo4cHh9Lmluc3BlY3Rvci10YWJze2Rpc3BsYXk6ZmxleDtnYXA6NnB4fS5pbnNwZWN0b3ItdGFicyBidXR0b257Zm" +
            "9udC1zaXplOjExcHg7cGFkZGluZzo2cHggOHB4fS5pbnNwZWN0b3ItYm9keXtoZWlnaHQ6Y2FsYygxMDAlIC0gNTRweCk7b3ZlcmZsb3c6YXV0" +
            "bztwYWRkaW5nOjE0cHh9LnBhbmVse2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxNnB4O2JhY2tncm91bmQ6bG" +
            "luZWFyLWdyYWRpZW50KDE4MGRlZyxyZ2JhKDIwLDI4LDM5LC44MikscmdiYSgxMywxOCwyNywuNzYpKTtwYWRkaW5nOjE0cHg7bWFyZ2luLWJv" +
            "dHRvbToxMnB4fS5wYW5lbCBoM3ttYXJnaW46MCAwIDEwcHg7Zm9udC1zaXplOjE0cHh9Lmt2e2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLW" +
            "NvbHVtbnM6MTMwcHggMWZyO2dhcDoxMHB4O3BhZGRpbmc6N3B4IDA7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgcmdiYSgxNTIsMTYzLDE3OSwu" +
            "MTEpfS5rdjpsYXN0LWNoaWxke2JvcmRlci1ib3R0b206MH0ua3YgZGl2OmZpcnN0LWNoaWxke2NvbG9yOnZhcigtLW11dGVkKX0ubWVzc2FnZS" +
            "1ncmlke2Rpc3BsYXk6Z3JpZDtncmlkLXRlbXBsYXRlLWNvbHVtbnM6NjRweCAxMTBweCAxZnI7Z2FwOjA7Ym9yZGVyOjFweCBzb2xpZCB2YXIo" +
            "LS1saW5lKTtib3JkZXItcmFkaXVzOjE0cHg7b3ZlcmZsb3c6aGlkZGVufS5tZXNzYWdlLWdyaWQgZGl2e3BhZGRpbmc6OHB4O2JvcmRlci1ib3" +
            "R0b206MXB4IHNvbGlkIHJnYmEoMTUyLDE2MywxNzksLjExKX0ubWVzc2FnZS1ncmlkIGRpdjpudGgtbGFzdC1jaGlsZCgtbiszKXtib3JkZXIt" +
            "Ym90dG9tOjB9LnNldi1pbmZve2NvbG9yOiNjZGVhZmZ9LnNldi13YXJue2NvbG9yOiNmZmU3YTZ9LnNldi1lcnJvcntjb2xvcjojZmZkMWRhfX" +
            "ByZXttYXgtaGVpZ2h0OjMxMHB4O292ZXJmbG93OmF1dG87d2hpdGUtc3BhY2U6cHJlLXdyYXA7YmFja2dyb3VuZDojMDgwYjEwO2JvcmRlcjox" +
            "cHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxNHB4O3BhZGRpbmc6MTJweDtjb2xvcjojZGZlN2YxfS5yZWwtcm93e3BhZGRpbm" +
            "c6OXB4IDA7Ym9yZGVyLWJvdHRvbToxcHggc29saWQgcmdiYSgxNTIsMTYzLDE3OSwuMTEpfS5yZWwtcm93IGJ7Y29sb3I6dmFyKC0tYWNjZW50" +
            "KX0uc3VidGxle2NvbG9yOnZhcigtLW11dGVkKX0ubW9ub3tmb250LWZhbWlseTp2YXIoLS1tb25vKX0KQG1lZGlhKG1heC13aWR0aDoxMzIwcH" +
            "gpezpyb290ey0tbGVmdDoyOTJweDstLXJpZ2h0OjM5MHB4fS50b29sYmFyLXJvdyBpbnB1dHttaW4td2lkdGg6MjIwcHh9LmFkdi1ncmlke2dy" +
            "aWQtdGVtcGxhdGUtY29sdW1uczpyZXBlYXQoMixtaW5tYXgoMTQwcHgsMWZyKSl9fUBtZWRpYShtYXgtd2lkdGg6MTEyMHB4KXsuc2hlbGx7Z3" +
            "JpZC10ZW1wbGF0ZS1jb2x1bW5zOjI5MHB4IDFmcn0uaW5zcGVjdG9ye2Rpc3BsYXk6bm9uZX19QG1lZGlhKHByZWZlcnMtcmVkdWNlZC1tb3Rp" +
            "b246bm8tcHJlZmVyZW5jZSl7YnV0dG9uLC5zY29wZS1pdGVtLC5yb3ctY2FyZCwudHJlZS1saW5le3RyYW5zaXRpb246Ym9yZGVyLWNvbG9yIC" +
            "4xNnMsYmFja2dyb3VuZCAuMTZzLGJveC1zaGFkb3cgLjE2cyxjb2xvciAuMTZzfX0KCjwvc3R5bGU+CjwvaGVhZD4KPGJvZHk+CjxkaXYgY2xh" +
            "c3M9ImFwcCI+CiAgPGhlYWRlciBjbGFzcz0idG9wIj48ZGl2IGNsYXNzPSJicmFuZCI+PGgxPkFDIFJ1bGUgV29ya2JlbmNoPC9oMT48ZGl2IG" +
            "NsYXNzPSJzdWIiIGlkPSJtZXRhIj48L2Rpdj48L2Rpdj48ZGl2IGNsYXNzPSJzdGF0cyIgaWQ9InN0YXRzIj48L2Rpdj48L2hlYWRlcj4KICA8" +
            "ZGl2IGNsYXNzPSJzaGVsbCI+CiAgICA8YXNpZGUgY2xhc3M9InBhbmUiPjxkaXYgY2xhc3M9InBhbmUtc2Nyb2xsIj48ZGl2IGNsYXNzPSJsZW" +
            "Z0LWhlYWQiPjxkaXYgY2xhc3M9ImV5ZWJyb3ciPjxpIGNsYXNzPSJkb3QiPjwvaT5GV0QgVHJlZTwvZGl2PjxpbnB1dCBpZD0idHJlZUZpbHRl" +
            "ciIgY2xhc3M9InRyZWUtZmlsdGVyIiBwbGFjZWhvbGRlcj0iRmlsdGVyIGRvY3VtZW50cy9wYWdlcy4uLiI+PGRpdiBjbGFzcz0ibGVmdC1ub3" +
            "RlIj5TZWxlY3QgYSBEb2N1bWVudCB0eXBlIG9yIFBhZ2UgdHlwZSB1bmRlciA8Yj5Qcm9jZXNzZXMg4oaSIEFDPC9iPi4gVmlldyBtb2RlcyBs" +
            "aXZlIGluIHRoZSBDb25maWd1cmF0aW9uIFdpbmRvdy48L2Rpdj48L2Rpdj48ZGl2IGlkPSJzY29wZXMiIGNsYXNzPSJmd2QtdHJlZSI+PC9kaX" +
            "Y+PC9kaXY+PC9hc2lkZT4KICAgIDxtYWluIGNsYXNzPSJwYW5lIj48ZGl2IGNsYXNzPSJwYW5lLXNjcm9sbCI+PGRpdiBjbGFzcz0iY29uZmln" +
            "LWhlYWQiPjxkaXYgY2xhc3M9ImNvbmZpZy10aXRsZSI+PGRpdj48aDI+Q29uZmlndXJhdGlvbiBXaW5kb3c8L2gyPjxkaXYgY2xhc3M9ImNhcH" +
            "Rpb24iIGlkPSJjYXB0aW9uIj48L2Rpdj48L2Rpdj48ZGl2IGNsYXNzPSJzY29wZS1zdGF0cyIgaWQ9InNjb3BlU3RhdHMiPjwvZGl2PjwvZGl2" +
            "PjxkaXYgY2xhc3M9Im1vZGUtdGFicyIgaWQ9Im1vZGVUYWJzIj48L2Rpdj48ZGl2IGNsYXNzPSJ0b29sYmFyLXJvdyIgaWQ9InRvb2xiYXIiPj" +
            "wvZGl2PjwvZGl2PjxkaXYgaWQ9Imxpc3QiIGNsYXNzPSJjb250ZW50Ij48L2Rpdj48L2Rpdj48L21haW4+CiAgICA8YXNpZGUgY2xhc3M9InBh" +
            "bmUgaW5zcGVjdG9yIj48ZGl2IGNsYXNzPSJpbnNwZWN0b3ItaGVhZCI+PGRpdiBjbGFzcz0iZXllYnJvdyI+PGkgY2xhc3M9ImRvdCI+PC9pPk" +
            "luc3BlY3RvcjwvZGl2PjxkaXYgY2xhc3M9Imluc3BlY3Rvci10YWJzIj48YnV0dG9uIHR5cGU9ImJ1dHRvbiIgY2xhc3M9ImFjdGl2ZSIgZGF0" +
            "YS1pbnNwZWN0b3I9ImRldGFpbHMiPkRldGFpbHM8L2J1dHRvbj48YnV0dG9uIHR5cGU9ImJ1dHRvbiIgZGF0YS1pbnNwZWN0b3I9Im1lc3NhZ2" +
            "VzIj5NZXNzYWdlczwvYnV0dG9uPjxidXR0b24gdHlwZT0iYnV0dG9uIiBkYXRhLWluc3BlY3Rvcj0icmF3Ij5SYXc8L2J1dHRvbj48L2Rpdj48" +
            "L2Rpdj48ZGl2IGNsYXNzPSJpbnNwZWN0b3ItYm9keSIgaWQ9ImRldGFpbCI+PC9kaXY+PC9hc2lkZT4KICA8L2Rpdj4KPC9kaXY+CjxzY3JpcH" +
            "Q+CmNvbnN0IHJ1bGVzRGF0YT1fX1JVTEVTX0pTT05fXzsKY29uc3QgcmVsYXRpb25zaGlwc0RhdGE9X19SRUxBVElPTlNISVBTX0pTT05fXzsK" +
            "Y29uc3QgZmxvd0RhdGE9X19GTE9XX0pTT05fXzsKY29uc3QgdHJlZURhdGE9X19UUkVFX0pTT05fXzsKY29uc3QgJD1pZD0+ZG9jdW1lbnQuZ2" +
            "V0RWxlbWVudEJ5SWQoaWQpOwpjb25zdCBhcnI9dj0+QXJyYXkuaXNBcnJheSh2KT92Oih2PT1udWxsP1tdOlt2XSk7CmNvbnN0IGZtdD1uPT4o" +
            "bnx8MCkudG9Mb2NhbGVTdHJpbmcoKTsKY29uc3QgZXNjPXM9PlN0cmluZyhzPz8nJykucmVwbGFjZSgvJi9nLCcmYW1wOycpLnJlcGxhY2UoLz" +
            "wvZywnJmx0OycpLnJlcGxhY2UoLz4vZywnJmd0OycpLnJlcGxhY2UoLyIvZywnJnF1b3Q7JykucmVwbGFjZSgvJy9nLCcmIzM5OycpOwpsZXQg" +
            "bW9kZT0naGllcmFyY2h5Jywgc2NvcGU9JycsIHNlbGVjdGVkPW51bGwsIHNlbGVjdGVkUmF3PW51bGwsIGluc3BlY3RvclRhYj0nZGV0YWlscy" +
            "csIHF1ZXJ5PScnLCB0cmVlUXVlcnk9JycsIHRyZWVNYXRjaGVzPVtdLCB0cmVlTWF0Y2hJeD0tMSwgdHJlZUZpbHRlcj0nJywgYWR2YW5jZWRP" +
            "cGVuPWZhbHNlOwpjb25zdCBhZHZhbmNlZD17dGV4dDonJyxydWxlOicnLGZpZWxkOicnLGF0dHI6JycsZnVuY3Rpb25OYW1lOicnLHNvdXJjZT" +
            "onJyxndWlkOicnLGRpc2FibGVkOicnLHJlbGF0aW9uc2hpcEtpbmQ6JycsdGFyZ2V0VHlwZTonJyxub2RlSWQ6JycsY2FzZVNlbnNpdGl2ZTpm" +
            "YWxzZSxyZWdleDpmYWxzZX07CmNvbnN0IG9wZW5Ob2Rlcz1uZXcgU2V0KCk7CmZ1bmN0aW9uIGluaXQoKXtyZW5kZXJTdGF0cygpO3dpcmVTdG" +
            "F0aWMoKTtyZW5kZXJTY29wZXMoKTtyZW5kZXJNb2RlVGFicygpO3JlbmRlclRvb2xiYXIoKTtyZW5kZXJMaXN0KCk7cmVuZGVySW5zcGVjdG9y" +
            "RGVmYXVsdCgpOyQoJ21ldGEnKS50ZXh0Q29udGVudD1ydWxlc0RhdGEuRndkUGF0aHx8dHJlZURhdGEuRndkUGF0aHx8Jyc7fQpmdW5jdGlvbi" +
            "ByZW5kZXJTdGF0cygpe2NvbnN0IGRpcmVjdD10cmVlRGF0YS5EaXJlY3REaXNhYmxlZENvdW50fHwwLCBpbmhlcml0ZWQ9dHJlZURhdGEuSW5o" +
            "ZXJpdGVkRGlzYWJsZWRDb3VudHx8MDsgJCgnc3RhdHMnKS5pbm5lckhUTUw9W1snUnVsZXMnLHJ1bGVzRGF0YS5SdWxlQ291bnRdLFsnU2NvcG" +
            "VzJyxydWxlc0RhdGEuU2NvcGVDb3VudF0sWydSZWxhdGlvbnMnLHJlbGF0aW9uc2hpcHNEYXRhLlJlbGF0aW9uc2hpcENvdW50XSxbJ0RpcmVj" +
            "dCBvZmYnLGRpcmVjdF0sWydJbmhlcml0ZWQgb2ZmJyxpbmhlcml0ZWRdXS5tYXAoeD0+YDxkaXYgY2xhc3M9InN0YXQiPjxiPiR7Zm10KHhbMV" +
            "0pfTwvYj48c3Bhbj4ke2VzYyh4WzBdKX08L3NwYW4+PC9kaXY+YCkuam9pbignJyk7fQoKLy8gTG9jYWwtZmlsZSBuYXZpZ2F0aW9uIGhhcmRl" +
            "bmluZzogdGhpcyB2aWV3ZXIgaXMgYSBzZWxmLWNvbnRhaW5lZCwgc2luZ2xlLXBhZ2UgYXBwLgovLyBTb21lIGJyb3dzZXJzL2V4dGVuc2lvbn" +
            "MgdHJlYXQgdW50eXBlZCBidXR0b25zIG9yIGltcGxpY2l0IGZvcm0vbmF2aWdhdGlvbiBiZWhhdmlvciBhcwovLyBhbiB1bnNhZmUgYXR0ZW1w" +
            "dCB0byByZWxvYWQgZmlsZTovLyBwYWdlcy4gUHJldmVudCBkZWZhdWx0IG5hdmlnYXRpb24gZm9yIGFsbCB2aWV3ZXIKLy8gYnV0dG9ucyBhbm" +
            "QgZW1wdHkvaGFzaCBsaW5rcyB3aGlsZSBwcmVzZXJ2aW5nIG5vcm1hbCBjbGljayBoYW5kbGVycy4KZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5l" +
            "cignY2xpY2snLCBlPT57CiAgY29uc3QgYnRuPWUudGFyZ2V0LmNsb3Nlc3QgJiYgZS50YXJnZXQuY2xvc2VzdCgnYnV0dG9uJyk7CiAgaWYoYn" +
            "RuKXtlLnByZXZlbnREZWZhdWx0KCk7IHJldHVybjt9CiAgY29uc3QgYT1lLnRhcmdldC5jbG9zZXN0ICYmIGUudGFyZ2V0LmNsb3Nlc3QoJ2En" +
            "KTsKICBpZihhKXsKICAgIGNvbnN0IGhyZWY9YS5nZXRBdHRyaWJ1dGUoJ2hyZWYnKTsKICAgIGlmKCFocmVmIHx8IGhyZWY9PT0nIycpe2UucH" +
            "JldmVudERlZmF1bHQoKTt9CiAgfQp9LCB0cnVlKTsKZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcignc3VibWl0JywgZT0+ZS5wcmV2ZW50RGVm" +
            "YXVsdCgpLCB0cnVlKTsKCmZ1bmN0aW9uIHdpcmVTdGF0aWMoKXtkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1pbnNwZWN0b3JdJy" +
            "kuZm9yRWFjaChiPT5iLm9uY2xpY2s9KCk9PntpbnNwZWN0b3JUYWI9Yi5kYXRhc2V0Lmluc3BlY3Rvcjtkb2N1bWVudC5xdWVyeVNlbGVjdG9y" +
            "QWxsKCdbZGF0YS1pbnNwZWN0b3JdJykuZm9yRWFjaCh4PT54LmNsYXNzTGlzdC50b2dnbGUoJ2FjdGl2ZScseD09PWIpKTtyZW5kZXJJbnNwZW" +
            "N0b3IoKTt9KTskKCd0cmVlRmlsdGVyJykub25pbnB1dD1lPT57dHJlZUZpbHRlcj1lLnRhcmdldC52YWx1ZXx8Jyc7cmVuZGVyU2NvcGVzKCk7" +
            "fTt9CmZ1bmN0aW9uIHNldE1vZGUobSl7bW9kZT1tO3NlbGVjdGVkPW51bGw7c2VsZWN0ZWRSYXc9bnVsbDtyZW5kZXJNb2RlVGFicygpO3Jlbm" +
            "RlclRvb2xiYXIoKTtyZW5kZXJMaXN0KCk7cmVuZGVySW5zcGVjdG9yRGVmYXVsdCgpO30KZnVuY3Rpb24gcmVuZGVyTW9kZVRhYnMoKXtjb25z" +
            "dCBtb2Rlcz1bWydoaWVyYXJjaHknLCdSdWxlIFRyZWUnXSxbJ3J1bGVzJywnUnVsZSBMaXN0J10sWydyZWxhdGlvbnNoaXBzJywnUmVsYXRpb2" +
            "5zaGlwcyddLFsnZGlzYWJsZWQnLCdEaXNhYmxlZCddLFsnaW5kZXgnLCdJbmRleCddXTskKCdtb2RlVGFicycpLmlubmVySFRNTD1tb2Rlcy5t" +
            "YXAoKFttLGxdKT0+YDxidXR0b24gdHlwZT0iYnV0dG9uIiBjbGFzcz0ibW9kZS10YWIgJHttb2RlPT09bT8nYWN0aXZlJzonJ30iIGRhdGEtbW" +
            "9kZT0iJHttfSI+JHtsfTwvYnV0dG9uPmApLmpvaW4oJycpO2RvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLW1vZGVdJykuZm9yRWFj" +
            "aChiPT5iLm9uY2xpY2s9KCk9PnNldE1vZGUoYi5kYXRhc2V0Lm1vZGUpKTt9CmZ1bmN0aW9uIHJlbmRlclNjb3Blcygpe2NvbnN0IHNjb3Blcz" +
            "1ydWxlc0RhdGEuU2NvcGVzfHxbXTtjb25zdCBmPXRyZWVGaWx0ZXIudHJpbSgpLnRvTG93ZXJDYXNlKCk7Y29uc3QgZG9jcz1zY29wZXMuZmls" +
            "dGVyKHM9PnMuU2NvcGVUeXBlPT09J0RvY3VtZW50JyYmKCFmfHxzLlNjb3BlTmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKGYpKSk7Y29uc3" +
            "QgcGFnZXM9c2NvcGVzLmZpbHRlcihzPT5zLlNjb3BlVHlwZT09PSdQYWdlJyYmKCFmfHxzLlNjb3BlTmFtZS50b0xvd2VyQ2FzZSgpLmluY2x1" +
            "ZGVzKGYpKSk7Y29uc3Qgb3RoZXI9c2NvcGVzLmZpbHRlcihzPT5zLlNjb3BlVHlwZSE9PSdEb2N1bWVudCcmJnMuU2NvcGVUeXBlIT09J1BhZ2" +
            "UnJiYoIWZ8fHMuU2NvcGVOYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoZikpKTtsZXQgaHRtbD1gPGRpdiBjbGFzcz0idHJlZS1ncm91cCI+" +
            "PGRpdiBjbGFzcz0iZ3JvdXAtdGl0bGUiPjxzcGFuPuKWvjwvc3Bhbj5Qcm9jZXNzZXM8L2Rpdj48ZGl2IGNsYXNzPSJzY29wZS1pdGVtIG11dG" +
            "VkIj48c3BhbiBjbGFzcz0ic2NvcGUtaWNvbiI+4pePPC9zcGFuPjxkaXYgY2xhc3M9InNjb3BlLW1haW4iPjxiPkFDPC9iPjxzcGFuPlByb2Nl" +
            "c3MgY29uZmlndXJhdGlvbjwvc3Bhbj48L2Rpdj48L2Rpdj48L2Rpdj5gO2h0bWwrPXNjb3BlR3JvdXAoJ0RvY3VtZW50cycsZG9jcywnRG9jdW" +
            "1lbnQgdHlwZScpO2h0bWwrPXNjb3BlR3JvdXAoJ1BhZ2VzJyxwYWdlcywnUGFnZSB0eXBlJyk7aWYob3RoZXIubGVuZ3RoKWh0bWwrPXNjb3Bl" +
            "R3JvdXAoJ090aGVyJyxvdGhlciwnU3lzdGVtIC8gbm9uLXJ1bGUgc2NvcGUnKTskKCdzY29wZXMnKS5pbm5lckhUTUw9aHRtbDtkb2N1bWVudC" +
            "5xdWVyeVNlbGVjdG9yQWxsKCcuc2NvcGUtaXRlbVtkYXRhLXNjb3BlXScpLmZvckVhY2goZWw9PmVsLm9uY2xpY2s9KCk9PntzY29wZT1lbC5k" +
            "YXRhc2V0LnNjb3BlO21vZGU9J2hpZXJhcmNoeSc7cXVlcnk9Jyc7dHJlZVF1ZXJ5PScnO3RyZWVNYXRjaGVzPVtdO3RyZWVNYXRjaEl4PS0xO2" +
            "9wZW5Ob2Rlcy5jbGVhcigpO3NlbGVjdGVkPW51bGw7c2VsZWN0ZWRSYXc9bnVsbDtyZW5kZXJTY29wZXMoKTtyZW5kZXJNb2RlVGFicygpO3Jl" +
            "bmRlclRvb2xiYXIoKTtyZW5kZXJMaXN0KCk7cmVuZGVySW5zcGVjdG9yRGVmYXVsdCgpO30pO30KZnVuY3Rpb24gc2NvcGVHcm91cCh0aXRsZS" +
            "xpdGVtcyxsYWJlbCl7cmV0dXJuIGA8ZGl2IGNsYXNzPSJ0cmVlLWdyb3VwIj48ZGl2IGNsYXNzPSJncm91cC10aXRsZSI+PHNwYW4+4pa+PC9z" +
            "cGFuPiR7ZXNjKHRpdGxlKX08L2Rpdj4ke2l0ZW1zLm1hcChzPT5gPGRpdiBjbGFzcz0ic2NvcGUtaXRlbSAke3Njb3BlPT09cy5TY29wZU5hbW" +
            "U/J2FjdGl2ZSc6Jyd9IiBkYXRhLXNjb3BlPSIke2VzYyhzLlNjb3BlTmFtZSl9Ij48c3BhbiBjbGFzcz0ic2NvcGUtaWNvbiI+4peHPC9zcGFu" +
            "PjxkaXYgY2xhc3M9InNjb3BlLW1haW4iPjxiPiR7ZXNjKHMuU2NvcGVOYW1lKX08L2I+PHNwYW4+JHtsYWJlbH0gwrcgJHtmbXQocy5SdWxlQ2" +
            "91bnR8fDApfSBydWxlczwvc3Bhbj48L2Rpdj48c3BhbiBjbGFzcz0ic2NvcGUtY291bnQiPiR7Zm10KHMuUnVsZUNvdW50fHwwKX08L3NwYW4+" +
            "PC9kaXY+YCkuam9pbignJyl9PC9kaXY+YDt9CmZ1bmN0aW9uIHJlbmRlclRvb2xiYXIoKXsKIGNvbnN0IGRpc2FibGVkT3B0aW9ucz0nPG9wdG" +
            "lvbiB2YWx1ZT0iIj5BbGwgc3RhdGVzPC9vcHRpb24+PG9wdGlvbj5FbmFibGVkPC9vcHRpb24+PG9wdGlvbj5EaXNhYmxlZERpcmVjdDwvb3B0" +
            "aW9uPjxvcHRpb24+RGlzYWJsZWRJbmhlcml0ZWQ8L29wdGlvbj48b3B0aW9uPlBvc3NpYmx5RGlzYWJsZWRJbmhlcml0ZWQ8L29wdGlvbj4nOw" +
            "ogY29uc3QgYWR2QnV0dG9uPWA8YnV0dG9uIHR5cGU9ImJ1dHRvbiIgY2xhc3M9ImFkdi10b2dnbGUgJHthZHZhbmNlZE9wZW4/J2FjdGl2ZSc6" +
            "Jyd9IiBpZD0iYWR2YW5jZWRUb2dnbGUiPkFkdmFuY2VkPC9idXR0b24+YDsKIGlmKCFzY29wZSYmbW9kZSE9PSdpbmRleCcpewogICAkKCd0b2" +
            "9sYmFyJykuaW5uZXJIVE1MPWA8ZGl2IGNsYXNzPSJ0b29sYmFyLWRpc2FibGVkIj48Yj5TZWxlY3QgYSBjb25maWd1cmF0aW9uIG9iamVjdCBm" +
            "aXJzdC48L2I+IENob29zZSBhIERvY3VtZW50IG9yIFBhZ2UgdW5kZXIgPGI+UHJvY2Vzc2VzIOKGkiBBQzwvYj4gaW4gdGhlIEZXRCBUcmVlLi" +
            "BTZWFyY2ggYW5kIGV4cGFuZC9jb2xsYXBzZSBjb250cm9scyBhY3RpdmF0ZSBhZnRlciBhIHNjb3BlIGlzIHNlbGVjdGVkLjwvZGl2PmA7CiAg" +
            "IHJldHVybjsKIH0KIGlmKG1vZGU9PT0naGllcmFyY2h5Jyl7JCgndG9vbGJhcicpLmlubmVySFRNTD1gPGlucHV0IGlkPSJ0cmVlUSIgcGxhY2" +
            "Vob2xkZXI9IkZpbmQgaW4gJHtlc2Moc2NvcGV8fCdzZWxlY3RlZCBzY29wZScpfSBzdHJ1Y3R1cmFsIHRyZWUuLi4iPiR7YWR2QnV0dG9ufTxi" +
            "dXR0b24gdHlwZT0iYnV0dG9uIiBpZD0icHJldk1hdGNoIj5QcmV2PC9idXR0b24+PGJ1dHRvbiB0eXBlPSJidXR0b24iIGlkPSJuZXh0TWF0Y2" +
            "giPk5leHQ8L2J1dHRvbj48YnV0dG9uIHR5cGU9ImJ1dHRvbiIgaWQ9ImV4cGFuZE1hdGNoZXMiPkV4cGFuZCBtYXRjaGVzPC9idXR0b24+PGJ1" +
            "dHRvbiB0eXBlPSJidXR0b24iIGlkPSJleHBhbmRBbGwiPkV4cGFuZCBhbGw8L2J1dHRvbj48YnV0dG9uIHR5cGU9ImJ1dHRvbiIgaWQ9ImNvbG" +
            "xhcHNlQWxsIj5Db2xsYXBzZSBhbGw8L2J1dHRvbj4ke2FkdmFuY2VkUGFuZWxIdG1sKCl9YDskKCd0cmVlUScpLnZhbHVlPXRyZWVRdWVyeTsk" +
            "KCd0cmVlUScpLm9uaW5wdXQ9ZT0+e3RyZWVRdWVyeT1lLnRhcmdldC52YWx1ZXx8Jyc7Y29tcHV0ZVRyZWVNYXRjaGVzKCk7cmVuZGVyTGlzdC" +
            "gpO307JCgncHJldk1hdGNoJykub25jbGljaz0oKT0+Z290b1RyZWVNYXRjaCgtMSk7JCgnbmV4dE1hdGNoJykub25jbGljaz0oKT0+Z290b1Ry" +
            "ZWVNYXRjaCgxKTskKCdleHBhbmRNYXRjaGVzJykub25jbGljaz1leHBhbmRUcmVlTWF0Y2hlczskKCdleHBhbmRBbGwnKS5vbmNsaWNrPSgpPT" +
            "57dHJlZU5vZGVzRm9yU2NvcGUoKS5mb3JFYWNoKG49Pm9wZW5Ob2Rlcy5hZGQoJ24nK24uTm9kZUlkKSk7cmVuZGVyTGlzdCgpO307JCgnY29s" +
            "bGFwc2VBbGwnKS5vbmNsaWNrPSgpPT57b3Blbk5vZGVzLmNsZWFyKCk7cmVuZGVyTGlzdCgpO307d2lyZUFkdmFuY2VkU2VhcmNoKCk7cmV0dX" +
            "JuO30KIGlmKG1vZGU9PT0ncnVsZXMnKXskKCd0b29sYmFyJykuaW5uZXJIVE1MPWA8aW5wdXQgaWQ9InEiIHBsYWNlaG9sZGVyPSJTZWFyY2gg" +
            "JHtlc2Moc2NvcGV8fCdzZWxlY3RlZCBzY29wZScpfSBydWxlIGxpc3QuLi4iPiR7YWR2QnV0dG9ufTxzZWxlY3QgaWQ9ImZ1bmN0aW9uRmlsdG" +
            "VyIj48b3B0aW9uIHZhbHVlPSIiPkFsbCBmdW5jdGlvbnM8L29wdGlvbj48L3NlbGVjdD48c2VsZWN0IGlkPSJzdGF0ZUZpbHRlciI+JHtkaXNh" +
            "YmxlZE9wdGlvbnN9PC9zZWxlY3Q+JHthZHZhbmNlZFBhbmVsSHRtbCgpfWA7d2lyZUNvbW1vbkZpbHRlcnMoKTt3aXJlQWR2YW5jZWRTZWFyY2" +
            "goKTtyZXR1cm47fQogaWYobW9kZT09PSdyZWxhdGlvbnNoaXBzJyl7JCgndG9vbGJhcicpLmlubmVySFRNTD1gPGlucHV0IGlkPSJxIiBwbGFj" +
            "ZWhvbGRlcj0iU2VhcmNoICR7ZXNjKHNjb3BlfHwnc2VsZWN0ZWQgc2NvcGUnKX0gcmVsYXRpb25zaGlwcywgZmllbGRzLCBhdHRycy4uLiI+JH" +
            "thZHZCdXR0b259PHNlbGVjdCBpZD0ia2luZCI+PG9wdGlvbiB2YWx1ZT0iIj5BbGwgcmVsYXRpb25zaGlwIGtpbmRzPC9vcHRpb24+PC9zZWxl" +
            "Y3Q+PHNlbGVjdCBpZD0idGFyZ2V0VHlwZSI+PG9wdGlvbiB2YWx1ZT0iIj5BbGwgdGFyZ2V0IHR5cGVzPC9vcHRpb24+PC9zZWxlY3Q+JHthZH" +
            "ZhbmNlZFBhbmVsSHRtbCgpfWA7d2lyZUNvbW1vbkZpbHRlcnMoKTt3aXJlQWR2YW5jZWRTZWFyY2goKTtyZXR1cm47fQogaWYobW9kZT09PSdk" +
            "aXNhYmxlZCcpeyQoJ3Rvb2xiYXInKS5pbm5lckhUTUw9YDxpbnB1dCBpZD0icSIgcGxhY2Vob2xkZXI9IlNlYXJjaCBkaXNhYmxlZCBydWxlcy" +
            "BpbiAke2VzYyhzY29wZXx8J3NlbGVjdGVkIHNjb3BlJyl9Li4uIj4ke2FkdkJ1dHRvbn08c2VsZWN0IGlkPSJzdGF0ZUZpbHRlciI+JHtkaXNh" +
            "YmxlZE9wdGlvbnN9PC9zZWxlY3Q+JHthZHZhbmNlZFBhbmVsSHRtbCgpfWA7d2lyZUNvbW1vbkZpbHRlcnMoKTt3aXJlQWR2YW5jZWRTZWFyY2" +
            "goKTtyZXR1cm47fQogJCgndG9vbGJhcicpLmlubmVySFRNTD1gPGlucHV0IGlkPSJxIiBwbGFjZWhvbGRlcj0iU2VhcmNoIHJlbGF0aW9uc2hp" +
            "cCBpbmRleCBhY3Jvc3MgQUMuLi4iPiR7YWR2QnV0dG9ufSR7YWR2YW5jZWRQYW5lbEh0bWwoKX1gO3dpcmVDb21tb25GaWx0ZXJzKCk7d2lyZU" +
            "FkdmFuY2VkU2VhcmNoKCk7fQpmdW5jdGlvbiBhZHZhbmNlZFBhbmVsSHRtbCgpewogY29uc3Qgb3Blbj1hZHZhbmNlZE9wZW4/J29wZW4nOicn" +
            "OwogcmV0dXJuIGA8ZGl2IGNsYXNzPSJhZHZhbmNlZC1wYW5lbCAke29wZW59IiBpZD0iYWR2YW5jZWRQYW5lbCI+PGRpdiBjbGFzcz0iYWR2YW" +
            "5jZWQtaGVhZCI+PGRpdj48Yj5BZHZhbmNlZCBzZWFyY2g8L2I+PGJyPjxzcGFuPkNvbWJpbmUgdGV4dCwgZnVuY3Rpb24sIGZpZWxkLCBhdHRy" +
            "aWJ1dGUsIHNvdXJjZSwgZGlzYWJsZWQgc3RhdGUsIEdVSUQsIHJlbGF0aW9uc2hpcCBraW5kLCBhbmQgdGFyZ2V0IHR5cGUgZmlsdGVycy48L3" +
            "NwYW4+PC9kaXY+PGJ1dHRvbiB0eXBlPSJidXR0b24iIGlkPSJhZHZhbmNlZENsZWFyIj5SZXNldDwvYnV0dG9uPjwvZGl2PjxkaXYgY2xhc3M9" +
            "ImFkdi1ncmlkIj4KIDxsYWJlbD5UZXh0PGlucHV0IGRhdGEtYWR2PSJ0ZXh0IiBwbGFjZWhvbGRlcj0iYW55IHRleHQgLyBxdW90ZWQgcGhyYX" +
            "NlIj48L2xhYmVsPgogPGxhYmVsPlJ1bGUgbmFtZTxpbnB1dCBkYXRhLWFkdj0icnVsZSIgcGxhY2Vob2xkZXI9IlJlamVjdExldHRlciwgQ09C" +
            "LCBzcGxpdC4uLiI+PC9sYWJlbD4KIDxsYWJlbD5GaWVsZDxpbnB1dCBkYXRhLWFkdj0iZmllbGQiIHBsYWNlaG9sZGVyPSJEZW50YWxBREEuQ0" +
            "9CSW5kaWNhdG9yIj48L2xhYmVsPgogPGxhYmVsPkF0dHJpYnV0ZTxpbnB1dCBkYXRhLWFkdj0iYXR0ciIgcGxhY2Vob2xkZXI9IlJlamVjdExl" +
            "dHRlciI+PC9sYWJlbD4KIDxsYWJlbD5GdW5jdGlvbjxpbnB1dCBkYXRhLWFkdj0iZnVuY3Rpb25OYW1lIiBwbGFjZWhvbGRlcj0iX0lHZXREb2" +
            "NBdHRyIj48L2xhYmVsPgogPGxhYmVsPlNvdXJjZTxpbnB1dCBkYXRhLWFkdj0ic291cmNlIiBwbGFjZWhvbGRlcj0iT0NSX0FFRywgX0Rpc2Fi" +
            "bGVkIj48L2xhYmVsPgogPGxhYmVsPkdVSUQgLyBOb2RlPGlucHV0IGRhdGEtYWR2PSJndWlkIiBwbGFjZWhvbGRlcj0iR1VJRCBmcmFnbWVudC" +
            "I+PC9sYWJlbD4KIDxsYWJlbD5Ob2RlIElEPGlucHV0IGRhdGEtYWR2PSJub2RlSWQiIHBsYWNlaG9sZGVyPSI0MTMiPjwvbGFiZWw+CiA8bGFi" +
            "ZWw+RGlzYWJsZWQ8c2VsZWN0IGRhdGEtYWR2PSJkaXNhYmxlZCI+PG9wdGlvbiB2YWx1ZT0iIj5Bbnk8L29wdGlvbj48b3B0aW9uPkVuYWJsZW" +
            "Q8L29wdGlvbj48b3B0aW9uPkRpc2FibGVkRGlyZWN0PC9vcHRpb24+PG9wdGlvbj5EaXNhYmxlZEluaGVyaXRlZDwvb3B0aW9uPjxvcHRpb24+" +
            "UG9zc2libHlEaXNhYmxlZEluaGVyaXRlZDwvb3B0aW9uPjwvc2VsZWN0PjwvbGFiZWw+CiA8bGFiZWw+UmVsYXRpb25zaGlwPHNlbGVjdCBkYX" +
            "RhLWFkdj0icmVsYXRpb25zaGlwS2luZCI+PG9wdGlvbiB2YWx1ZT0iIj5Bbnk8L29wdGlvbj48L3NlbGVjdD48L2xhYmVsPgogPGxhYmVsPlRh" +
            "cmdldCB0eXBlPHNlbGVjdCBkYXRhLWFkdj0idGFyZ2V0VHlwZSI+PG9wdGlvbiB2YWx1ZT0iIj5Bbnk8L29wdGlvbj48L3NlbGVjdD48L2xhYm" +
            "VsPgogPC9kaXY+PGRpdiBjbGFzcz0iYWR2LW9wdGlvbnMiPjxsYWJlbD48aW5wdXQgdHlwZT0iY2hlY2tib3giIGRhdGEtYWR2LWNoZWNrPSJj" +
            "YXNlU2Vuc2l0aXZlIj4gQ2FzZSBzZW5zaXRpdmU8L2xhYmVsPjxsYWJlbD48aW5wdXQgdHlwZT0iY2hlY2tib3giIGRhdGEtYWR2LWNoZWNrPS" +
            "JyZWdleCI+IFJlZ2V4PC9sYWJlbD48YnV0dG9uIHR5cGU9ImJ1dHRvbiIgaWQ9ImFkdmFuY2VkQXBwbHkiPkFwcGx5PC9idXR0b24+PC9kaXY+" +
            "PGRpdiBjbGFzcz0ic2VhcmNoLXN1bW1hcnkiIGlkPSJzZWFyY2hTdW1tYXJ5Ij4ke2FkdmFuY2VkU3VtbWFyeSgpfTwvZGl2PjwvZGl2PmA7Cn" +
            "0KZnVuY3Rpb24gYWR2YW5jZWRTdW1tYXJ5KCl7Y29uc3QgZW50cmllcz1PYmplY3QuZW50cmllcyhhZHZhbmNlZCkuZmlsdGVyKChbayx2XSk9" +
            "PnR5cGVvZiB2PT09J3N0cmluZycmJnYpO2lmKCFlbnRyaWVzLmxlbmd0aCYmIWFkdmFuY2VkLnJlZ2V4JiYhYWR2YW5jZWQuY2FzZVNlbnNpdG" +
            "l2ZSlyZXR1cm4gJzxzcGFuIGNsYXNzPSJzdWJ0bGUiPk5vIGFkdmFuY2VkIGZpbHRlcnMgYWN0aXZlLjwvc3Bhbj4nO3JldHVybiBlbnRyaWVz" +
            "Lm1hcCgoW2ssdl0pPT5gPHNwYW4gY2xhc3M9InNlYXJjaC1jaGlwIj4ke2VzYyhrKX06ICR7ZXNjKHYpfTwvc3Bhbj5gKS5qb2luKCcnKSsoYW" +
            "R2YW5jZWQucmVnZXg/JzxzcGFuIGNsYXNzPSJzZWFyY2gtY2hpcCI+cmVnZXg8L3NwYW4+JzonJykrKGFkdmFuY2VkLmNhc2VTZW5zaXRpdmU/" +
            "JzxzcGFuIGNsYXNzPSJzZWFyY2gtY2hpcCI+Y2FzZTwvc3Bhbj4nOicnKTt9CmZ1bmN0aW9uIHdpcmVBZHZhbmNlZFNlYXJjaCgpe2NvbnN0IH" +
            "Q9JCgnYWR2YW5jZWRUb2dnbGUnKTtpZih0KXQub25jbGljaz0oKT0+e2FkdmFuY2VkT3Blbj0hYWR2YW5jZWRPcGVuO3JlbmRlclRvb2xiYXIo" +
            "KTt9O2NvbnN0IGNsZWFyPSQoJ2FkdmFuY2VkQ2xlYXInKTtpZihjbGVhciljbGVhci5vbmNsaWNrPSgpPT57T2JqZWN0LmtleXMoYWR2YW5jZW" +
            "QpLmZvckVhY2goaz0+YWR2YW5jZWRba109dHlwZW9mIGFkdmFuY2VkW2tdPT09J2Jvb2xlYW4nP2ZhbHNlOicnKTt0cmVlTWF0Y2hlcz1bXTt0" +
            "cmVlTWF0Y2hJeD0tMTtyZW5kZXJUb29sYmFyKCk7cmVuZGVyTGlzdCgpO307Y29uc3QgYXBwbHk9JCgnYWR2YW5jZWRBcHBseScpO2lmKGFwcG" +
            "x5KWFwcGx5Lm9uY2xpY2s9KCk9Pnt0cmVlTWF0Y2hlcz1bXTt0cmVlTWF0Y2hJeD0tMTtyZW5kZXJMaXN0KCk7fTtkb2N1bWVudC5xdWVyeVNl" +
            "bGVjdG9yQWxsKCdbZGF0YS1hZHZdJykuZm9yRWFjaChlbD0+e2NvbnN0IGs9ZWwuZGF0YXNldC5hZHY7aWYoaz09PSdyZWxhdGlvbnNoaXBLaW" +
            "5kJylmaWxsQWR2U2VsZWN0KGVsLFsuLi5uZXcgU2V0KChyZWxhdGlvbnNoaXBzRGF0YS5SZWxhdGlvbnNoaXBzfHxbXSkubWFwKHI9PnIuS2lu" +
            "ZCkuZmlsdGVyKEJvb2xlYW4pKV0pO2lmKGs9PT0ndGFyZ2V0VHlwZScpZmlsbEFkdlNlbGVjdChlbCxbLi4ubmV3IFNldCgocmVsYXRpb25zaG" +
            "lwc0RhdGEuUmVsYXRpb25zaGlwc3x8W10pLm1hcChyPT5yLlRhcmdldFR5cGUpLmZpbHRlcihCb29sZWFuKSldKTtlbC52YWx1ZT1hZHZhbmNl" +
            "ZFtrXXx8Jyc7ZWwub25pbnB1dD1lbC5vbmNoYW5nZT1lPT57YWR2YW5jZWRba109ZS50YXJnZXQudmFsdWV8fCcnO3RyZWVNYXRjaGVzPVtdO3" +
            "RyZWVNYXRjaEl4PS0xO2lmKGs9PT0ndGV4dCcmJm1vZGU9PT0naGllcmFyY2h5Jyljb21wdXRlVHJlZU1hdGNoZXMoKTtyZW5kZXJMaXN0KCk7" +
            "fTt9KTtkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1hZHYtY2hlY2tdJykuZm9yRWFjaChlbD0+e2NvbnN0IGs9ZWwuZGF0YXNldC" +
            "5hZHZDaGVjaztlbC5jaGVja2VkPSEhYWR2YW5jZWRba107ZWwub25jaGFuZ2U9ZT0+e2FkdmFuY2VkW2tdPSEhZS50YXJnZXQuY2hlY2tlZDt0" +
            "cmVlTWF0Y2hlcz1bXTt0cmVlTWF0Y2hJeD0tMTtyZW5kZXJMaXN0KCk7fTt9KTt9CmZ1bmN0aW9uIGZpbGxBZHZTZWxlY3QoZWwsdmFscyl7Y2" +
            "9uc3QgY3VyPWFkdmFuY2VkW2VsLmRhdGFzZXQuYWR2XXx8Jyc7ZWwuaW5uZXJIVE1MPSc8b3B0aW9uIHZhbHVlPSIiPkFueTwvb3B0aW9uPicr" +
            "dmFscy5zb3J0KCkubWFwKHY9PmA8b3B0aW9uPiR7ZXNjKHYpfTwvb3B0aW9uPmApLmpvaW4oJycpO2VsLnZhbHVlPWN1cjt9CmZ1bmN0aW9uIG" +
            "FkdkFjdGl2ZSgpe3JldHVybiBPYmplY3QuZW50cmllcyhhZHZhbmNlZCkuc29tZSgoW2ssdl0pPT50eXBlb2Ygdj09PSdzdHJpbmcnJiZ2KXx8" +
            "YWR2YW5jZWQucmVnZXh8fGFkdmFuY2VkLmNhc2VTZW5zaXRpdmU7fQpmdW5jdGlvbiBub3JtVGV4dChzKXtzPVN0cmluZyhzPz8nJyk7cmV0dX" +
            "JuIGFkdmFuY2VkLmNhc2VTZW5zaXRpdmU/czpzLnRvTG93ZXJDYXNlKCk7fQpmdW5jdGlvbiB0ZXN0TmVlZGxlKGhheSxuZWVkbGUpe2lmKCFu" +
            "ZWVkbGUpcmV0dXJuIHRydWU7aGF5PVN0cmluZyhoYXk/PycnKTtpZihhZHZhbmNlZC5yZWdleCl7dHJ5e3JldHVybiBuZXcgUmVnRXhwKG5lZW" +
            "RsZSxhZHZhbmNlZC5jYXNlU2Vuc2l0aXZlPycnOidpJykudGVzdChoYXkpO31jYXRjaHtyZXR1cm4gZmFsc2U7fX1yZXR1cm4gbm9ybVRleHQo" +
            "aGF5KS5pbmNsdWRlcyhub3JtVGV4dChuZWVkbGUpKTt9CmZ1bmN0aW9uIG9ialRleHQobyl7dHJ5e3JldHVybiBKU09OLnN0cmluZ2lmeShvKT" +
            "t9Y2F0Y2h7cmV0dXJuIFN0cmluZyhvPz8nJyk7fX0KZnVuY3Rpb24gYXJyVGV4dCh2KXtyZXR1cm4gYXJyKHYpLmpvaW4oJyAnKTt9CmZ1bmN0" +
            "aW9uIGFkdmFuY2VkTWF0Y2hlc1J1bGUocil7aWYoIWFkdkFjdGl2ZSgpKXJldHVybiB0cnVlO2NvbnN0IHRleHQ9b2JqVGV4dChyKTtyZXR1cm" +
            "4gdGVzdE5lZWRsZSh0ZXh0LGFkdmFuY2VkLnRleHQpJiZ0ZXN0TmVlZGxlKHJ1bGVUaXRsZShyKXx8bm9kZVRpdGxlKHIpLGFkdmFuY2VkLnJ1" +
            "bGUpJiZ0ZXN0TmVlZGxlKHRleHQsYWR2YW5jZWQuZmllbGQpJiZ0ZXN0TmVlZGxlKGFyclRleHQoci5QYXJhbWV0ZXJzPy5BdHRyTmFtZSl8fH" +
            "RleHQsYWR2YW5jZWQuYXR0cikmJnRlc3ROZWVkbGUoci5GdW5jdGlvbk5hbWV8fCcnLGFkdmFuY2VkLmZ1bmN0aW9uTmFtZSkmJnRlc3ROZWVk" +
            "bGUoYXJyVGV4dChyLlNvdXJjZXMpLGFkdmFuY2VkLnNvdXJjZSkmJnRlc3ROZWVkbGUoKHIuUnVsZUd1aWR8fCcnKSsnICcrKHIuTm9kZUlkfH" +
            "wnJyksYWR2YW5jZWQuZ3VpZCkmJnRlc3ROZWVkbGUoU3RyaW5nKHIuTm9kZUlkfHwnJyksYWR2YW5jZWQubm9kZUlkKSYmKCFhZHZhbmNlZC5k" +
            "aXNhYmxlZHx8U3RyaW5nKHIuRGlzYWJsZWRTdGF0ZXx8J0VuYWJsZWQnKT09PWFkdmFuY2VkLmRpc2FibGVkKTt9CmZ1bmN0aW9uIGFkdmFuY2" +
            "VkTWF0Y2hlc1JlbGF0aW9uc2hpcChyKXtpZighYWR2QWN0aXZlKCkpcmV0dXJuIHRydWU7Y29uc3QgdGV4dD1vYmpUZXh0KHIpO3JldHVybiB0" +
            "ZXN0TmVlZGxlKHRleHQsYWR2YW5jZWQudGV4dCkmJnRlc3ROZWVkbGUoci5SdWxlTmFtZXx8JycsYWR2YW5jZWQucnVsZSkmJnRlc3ROZWVkbG" +
            "UodGV4dCxhZHZhbmNlZC5maWVsZCkmJnRlc3ROZWVkbGUodGV4dCxhZHZhbmNlZC5hdHRyKSYmdGVzdE5lZWRsZShyLkZ1bmN0aW9uTmFtZXx8" +
            "JycsYWR2YW5jZWQuZnVuY3Rpb25OYW1lKSYmdGVzdE5lZWRsZSh0ZXh0LGFkdmFuY2VkLnNvdXJjZSkmJnRlc3ROZWVkbGUoci5SdWxlR3VpZH" +
            "x8JycsYWR2YW5jZWQuZ3VpZCkmJighYWR2YW5jZWQucmVsYXRpb25zaGlwS2luZHx8ci5LaW5kPT09YWR2YW5jZWQucmVsYXRpb25zaGlwS2lu" +
            "ZCkmJighYWR2YW5jZWQudGFyZ2V0VHlwZXx8ci5UYXJnZXRUeXBlPT09YWR2YW5jZWQudGFyZ2V0VHlwZSkmJighYWR2YW5jZWQuZGlzYWJsZW" +
            "R8fHRlc3ROZWVkbGUodGV4dCxhZHZhbmNlZC5kaXNhYmxlZCkpO30KZnVuY3Rpb24gYWR2YW5jZWRNYXRjaGVzVHJlZU5vZGUobil7cmV0dXJu" +
            "IGFkdmFuY2VkTWF0Y2hlc1J1bGUobik7fQoKZnVuY3Rpb24gd2lyZUNvbW1vbkZpbHRlcnMoKXtjb25zdCBxPSQoJ3EnKTsgaWYocSl7cS52YW" +
            "x1ZT1xdWVyeTtxLm9uaW5wdXQ9ZT0+e3F1ZXJ5PWUudGFyZ2V0LnZhbHVlfHwnJztyZW5kZXJMaXN0KCk7fTt9IGZpbGxTZWxlY3RzKCk7IFsn" +
            "ZnVuY3Rpb25GaWx0ZXInLCdzdGF0ZUZpbHRlcicsJ2tpbmQnLCd0YXJnZXRUeXBlJ10uZm9yRWFjaChpZD0+e2NvbnN0IGVsPSQoaWQpOyBpZi" +
            "hlbCllbC5vbmNoYW5nZT1yZW5kZXJMaXN0O30pO30KZnVuY3Rpb24gZmlsbFNlbGVjdHMoKXtjb25zdCBmbj0kKCdmdW5jdGlvbkZpbHRlcicp" +
            "OyBpZihmbil7Y29uc3QgdmFscz1bLi4ubmV3IFNldCgocnVsZXNEYXRhLlJ1bGVzfHxbXSkuZmlsdGVyKHI9PiFzY29wZXx8ci5TY29wZU5hbW" +
            "U9PT1zY29wZSkubWFwKHI9PnIuRnVuY3Rpb25OYW1lKS5maWx0ZXIoQm9vbGVhbikpXS5zb3J0KCk7Zm4uaW5uZXJIVE1MPSc8b3B0aW9uIHZh" +
            "bHVlPSIiPkFsbCBmdW5jdGlvbnM8L29wdGlvbj4nK3ZhbHMubWFwKHY9PmA8b3B0aW9uPiR7ZXNjKHYpfTwvb3B0aW9uPmApLmpvaW4oJycpO3" +
            "1jb25zdCBraW5kPSQoJ2tpbmQnKTsgaWYoa2luZCl7Y29uc3QgdmFscz1bLi4ubmV3IFNldCgocmVsYXRpb25zaGlwc0RhdGEuUmVsYXRpb25z" +
            "aGlwc3x8W10pLm1hcChyPT5yLktpbmQpLmZpbHRlcihCb29sZWFuKSldLnNvcnQoKTtraW5kLmlubmVySFRNTD0nPG9wdGlvbiB2YWx1ZT0iIj" +
            "5BbGwgcmVsYXRpb25zaGlwIGtpbmRzPC9vcHRpb24+Jyt2YWxzLm1hcCh2PT5gPG9wdGlvbj4ke2VzYyh2KX08L29wdGlvbj5gKS5qb2luKCcn" +
            "KTt9Y29uc3QgdHQ9JCgndGFyZ2V0VHlwZScpOyBpZih0dCl7Y29uc3QgdmFscz1bLi4ubmV3IFNldCgocmVsYXRpb25zaGlwc0RhdGEuUmVsYX" +
            "Rpb25zaGlwc3x8W10pLm1hcChyPT5yLlRhcmdldFR5cGUpLmZpbHRlcihCb29sZWFuKSldLnNvcnQoKTt0dC5pbm5lckhUTUw9JzxvcHRpb24g" +
            "dmFsdWU9IiI+QWxsIHRhcmdldCB0eXBlczwvb3B0aW9uPicrdmFscy5tYXAodj0+YDxvcHRpb24+JHtlc2Modil9PC9vcHRpb24+YCkuam9pbi" +
            "gnJyk7fX0KZnVuY3Rpb24gdXBkYXRlSGVhZGVyKCl7Y29uc3Qgcz0ocnVsZXNEYXRhLlNjb3Blc3x8W10pLmZpbmQoeD0+eC5TY29wZU5hbWU9" +
            "PT1zY29wZSk7Y29uc3QgbGFiZWw9bW9kZT09PSdoaWVyYXJjaHknPydTdHJ1Y3R1cmFsIFJ1bGUgVHJlZSc6bW9kZT09PSdydWxlcyc/J1J1bG" +
            "UgTGlzdCc6bW9kZT09PSdyZWxhdGlvbnNoaXBzJz8nUmVsYXRpb25zaGlwcyc6bW9kZT09PSdkaXNhYmxlZCc/J0Rpc2FibGVkIFJ1bGVzJzon" +
            "UmVsYXRpb25zaGlwIEluZGV4JzskKCdjYXB0aW9uJykudGV4dENvbnRlbnQ9cz9gJHtzLlNjb3BlTmFtZX0gwrcgJHtzLlNjb3BlVHlwZX0gdH" +
            "lwZSDCtyAke2xhYmVsfWA6YE5vIGRvY3VtZW50L3BhZ2UgdHlwZSBzZWxlY3RlZCDCtyAke2xhYmVsfWA7aWYoIXMpeyQoJ3Njb3BlU3RhdHMn" +
            "KS5pbm5lckhUTUw9Jyc7cmV0dXJuO31jb25zdCB0cmVlU2NvcGU9KHRyZWVEYXRhLlNjb3Blc3x8W10pLmZpbmQoeD0+eC5TY29wZU5hbWU9PT" +
            "1zY29wZSk7JCgnc2NvcGVTdGF0cycpLmlubmVySFRNTD1gPHNwYW4gY2xhc3M9Im1pbmktc3RhdCI+JHtmbXQocy5SdWxlQ291bnQpfSBmbGF0" +
            "IHJ1bGVzPC9zcGFuPjxzcGFuIGNsYXNzPSJtaW5pLXN0YXQiPiR7Zm10KHRyZWVTY29wZT8uUnVsZU5vZGVDb3VudHx8MCl9IHRyZWUgcnVsZX" +
            "M8L3NwYW4+PHNwYW4gY2xhc3M9Im1pbmktc3RhdCI+JHtmbXQodHJlZVNjb3BlPy5EaXJlY3REaXNhYmxlZENvdW50fHwwKX0gZGlyZWN0IGRp" +
            "c2FibGVkPC9zcGFuPjxzcGFuIGNsYXNzPSJtaW5pLXN0YXQiPiR7Zm10KHRyZWVTY29wZT8uSW5oZXJpdGVkRGlzYWJsZWRDb3VudHx8MCl9IG" +
            "luaGVyaXRlZDwvc3Bhbj5gO30KZnVuY3Rpb24gcmVjb21tZW5kZWRTY29wZXMoKXsKIGNvbnN0IHByZWZlcnJlZD1bJ0RlbnRhbEFEQScsJ0Rl" +
            "bnRhbF9Eb2MnLCdHZW5lcmFsJ107CiBjb25zdCBzY29wZXM9KHJ1bGVzRGF0YS5TY29wZXN8fFtdKS5maWx0ZXIocz0+cy5TY29wZVR5cGU9PT" +
            "0nUGFnZSd8fHMuU2NvcGVUeXBlPT09J0RvY3VtZW50Jyk7CiBjb25zdCBwaWNrZWQ9W107CiBwcmVmZXJyZWQuZm9yRWFjaChuYW1lPT57Y29u" +
            "c3QgaGl0PXNjb3Blcy5maW5kKHM9PnMuU2NvcGVOYW1lPT09bmFtZSk7aWYoaGl0JiYhcGlja2VkLmluY2x1ZGVzKGhpdCkpcGlja2VkLnB1c2" +
            "goaGl0KTt9KTsKIHNjb3Blcy5zbGljZSgpLnNvcnQoKGEsYik9PihiLlJ1bGVDb3VudHx8MCktKGEuUnVsZUNvdW50fHwwKSkuZm9yRWFjaChz" +
            "PT57aWYocGlja2VkLmxlbmd0aDwzJiYhcGlja2VkLnNvbWUoeD0+eC5TY29wZU5hbWU9PT1zLlNjb3BlTmFtZSkpcGlja2VkLnB1c2gocyk7fS" +
            "k7CiByZXR1cm4gcGlja2VkLnNsaWNlKDAsMyk7Cn0KZnVuY3Rpb24gc2VsZWN0U2NvcGVOYW1lKG5hbWUpe3Njb3BlPW5hbWU7bW9kZT0naGll" +
            "cmFyY2h5JztxdWVyeT0nJzt0cmVlUXVlcnk9Jyc7dHJlZU1hdGNoZXM9W107dHJlZU1hdGNoSXg9LTE7b3Blbk5vZGVzLmNsZWFyKCk7c2VsZW" +
            "N0ZWQ9bnVsbDtzZWxlY3RlZFJhdz1udWxsO3JlbmRlclNjb3BlcygpO3JlbmRlck1vZGVUYWJzKCk7cmVuZGVyVG9vbGJhcigpO3JlbmRlckxp" +
            "c3QoKTtyZW5kZXJJbnNwZWN0b3JEZWZhdWx0KCk7fQpmdW5jdGlvbiBsYXVuY2hFbXB0eUh0bWwoKXsKIGNvbnN0IHJlY3M9cmVjb21tZW5kZW" +
            "RTY29wZXMoKTsKIHJldHVybiBgPGRpdiBjbGFzcz0iZW1wdHktc3RhdGUgbGF1bmNoLXN0YXRlIj48ZGl2IGNsYXNzPSJsYXVuY2gta2lja2Vy" +
            "Ij5GV0VkaXRvci1zdHlsZSB3b3JrZmxvdzwvZGl2PjxoMz5TZWxlY3QgYSBjb25maWd1cmF0aW9uIG9iamVjdDwvaDM+PHA+Q2hvb3NlIGEgPG" +
            "I+RG9jdW1lbnQgdHlwZTwvYj4gb3IgPGI+UGFnZSB0eXBlPC9iPiBmcm9tIHRoZSBGV0QgVHJlZSB0byBpbnNwZWN0IEFDIHJ1bGVzLiBOb3Ro" +
            "aW5nIGlzIHNlbGVjdGVkIGF1dG9tYXRpY2FsbHksIGFuZCB0aGVyZSBpcyBubyBpbXBsaWNpdCBhbGwtc2NvcGUgbW9kZS4gRm9yIGNsZWFuIG" +
            "Jyb3dzZXIgYmVoYXZpb3IsIG9wZW4gdGhyb3VnaCB0aGUgaW5jbHVkZWQgbG9jYWwgSFRUUCBzY3JpcHQgaW5zdGVhZCBvZiBkaXJlY3RseSBh" +
            "cyBmaWxlOi8vIHdoZW4gbmVlZGVkLjwvcD48ZGl2IGNsYXNzPSJxdWljay1zdGFydC1ncmlkIj4ke3JlY3MubWFwKHM9PmA8YnV0dG9uIHR5cG" +
            "U9ImJ1dHRvbiIgY2xhc3M9InF1aWNrLXNjb3BlIiBkYXRhLXF1aWNrLXNjb3BlPSIke2VzYyhzLlNjb3BlTmFtZSl9Ij48Yj4ke2VzYyhzLlNj" +
            "b3BlTmFtZSl9PC9iPjxzcGFuPiR7ZXNjKHMuU2NvcGVUeXBlKX0gdHlwZSDCtyAke2ZtdChzLlJ1bGVDb3VudHx8MCl9IHJ1bGVzPC9zcGFuPj" +
            "wvYnV0dG9uPmApLmpvaW4oJycpfTwvZGl2PjxkaXYgY2xhc3M9ImVtcHR5LXN0ZXBzIj48ZGl2IGNsYXNzPSJlbXB0eS1zdGVwIj48Yj4xLiBQ" +
            "aWNrIGEgc2NvcGU8L2I+PHNwYW4+VXNlIFByb2Nlc3NlcyDihpIgQUMg4oaSIERvY3VtZW50cyBvciBQYWdlcyBpbiB0aGUgRldEIFRyZWUuPC" +
            "9zcGFuPjwvZGl2PjxkaXYgY2xhc3M9ImVtcHR5LXN0ZXAiPjxiPjIuIEluc3BlY3QgdGhlIHRyZWU8L2I+PHNwYW4+UnVsZSBUcmVlIHNob3dz" +
            "IHJ1bGUg4oaSIGFjdGlvbi9zdGF0dXMgcmVzdWx0IOKGkiBjaGlsZCBydWxlcy48L3NwYW4+PC9kaXY+PGRpdiBjbGFzcz0iZW1wdHktc3RlcC" +
            "I+PGI+My4gU2VhcmNoIG9yIGRyaWxsIGluPC9iPjxzcGFuPlVzZSBhZHZhbmNlZCBzZWFyY2gsIGV4cGFuZCBtYXRjaGVzLCB0aGVuIHNlbGVj" +
            "dCBhIHJ1bGUvYWN0aW9uIGZvciBkZXRhaWxzLjwvc3Bhbj48L2Rpdj48L2Rpdj48L2Rpdj5gOwp9CmZ1bmN0aW9uIHdpcmVMYXVuY2hFbXB0eS" +
            "gpe2RvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLXF1aWNrLXNjb3BlXScpLmZvckVhY2goYj0+Yi5vbmNsaWNrPSgpPT5zZWxlY3RT" +
            "Y29wZU5hbWUoYi5kYXRhc2V0LnF1aWNrU2NvcGUpKTt9CmZ1bmN0aW9uIHJlbmRlckxpc3QoKXt1cGRhdGVIZWFkZXIoKTtpZihtb2RlPT09J2" +
            "luZGV4JylyZXR1cm4gcmVuZGVySW5kZXgoKTtpZighc2NvcGUpeyQoJ2xpc3QnKS5pbm5lckhUTUw9bGF1bmNoRW1wdHlIdG1sKCk7d2lyZUxh" +
            "dW5jaEVtcHR5KCk7cmV0dXJuO31pZihtb2RlPT09J2hpZXJhcmNoeScpcmV0dXJuIHJlbmRlclRyZWUoKTtpZihtb2RlPT09J3JlbGF0aW9uc2" +
            "hpcHMnKXJldHVybiByZW5kZXJSZWxhdGlvbnNoaXBzKCk7aWYobW9kZT09PSdkaXNhYmxlZCcpcmV0dXJuIHJlbmRlckRpc2FibGVkKCk7cmV0" +
            "dXJuIHJlbmRlclJ1bGVzKCk7fQpmdW5jdGlvbiBydWxlVGl0bGUocil7cmV0dXJuIHIuUnVsZU5hbWV8fHIuTmFtZXx8Jyh1bm5hbWVkIHJ1bG" +
            "UpJzt9ZnVuY3Rpb24gZnVuY05hbWUocil7cmV0dXJuIHIuRnVuY3Rpb25OYW1lfHwnKG1pc3NpbmcgZnVuY3Rpb24pJzt9ZnVuY3Rpb24gZGlz" +
            "YWJsZWRDbGFzcyhyKXtjb25zdCBzPVN0cmluZyhyLkRpc2FibGVkU3RhdGV8fCcnKTtyZXR1cm4gcz09PSdEaXNhYmxlZERpcmVjdCc/J2Rpc2" +
            "FibGVkLWRpcmVjdCc6cy5pbmNsdWRlcygnSW5oZXJpdGVkJyk/J2Rpc2FibGVkLWluaGVyaXRlZCc6Jyc7fWZ1bmN0aW9uIHN0YXRlQ2hpcChy" +
            "KXtjb25zdCBzPVN0cmluZyhyLkRpc2FibGVkU3RhdGV8fCdFbmFibGVkJyk7aWYocz09PSdEaXNhYmxlZERpcmVjdCcpcmV0dXJuICc8c3Bhbi" +
            "BjbGFzcz0iY2hpcCBiYWQiPmRpc2FibGVkPC9zcGFuPic7aWYocz09PSdEaXNhYmxlZEluaGVyaXRlZCcpcmV0dXJuICc8c3BhbiBjbGFzcz0i" +
            "Y2hpcCI+aW5oZXJpdGVkPC9zcGFuPic7aWYocz09PSdQb3NzaWJseURpc2FibGVkSW5oZXJpdGVkJylyZXR1cm4gJzxzcGFuIGNsYXNzPSJjaG" +
            "lwIHdhcm4iPnBvc3NpYmxlPC9zcGFuPic7cmV0dXJuICcnO31mdW5jdGlvbiBpc1NlY3Rpb24ocil7Y29uc3QgbmFtZT0ocnVsZVRpdGxlKHIp" +
            "fHxub2RlVGl0bGUocil8fCcnKS50cmltKCk7Y29uc3QgZm49KHIuRnVuY3Rpb25OYW1lfHwnJykudHJpbSgpO3JldHVybiAvXlwqezQsfSQvLn" +
            "Rlc3QobmFtZSl8fC9yZWFkIHRoaXMgY29tbWVudC9pLnRlc3QobmFtZSl8fCFmbnx8Zm49PT0nKG1pc3NpbmcgZnVuY3Rpb24pJzt9CmZ1bmN0" +
            "aW9uIGZpbHRlcmVkUnVsZXMoKXtjb25zdCBxPXF1ZXJ5LnRvTG93ZXJDYXNlKCksIGZuPSQoJ2Z1bmN0aW9uRmlsdGVyJyk/LnZhbHVlfHwnJy" +
            "wgc3Q9JCgnc3RhdGVGaWx0ZXInKT8udmFsdWV8fCcnO3JldHVybiAocnVsZXNEYXRhLlJ1bGVzfHxbXSkuZmlsdGVyKHI9PnIuU2NvcGVOYW1l" +
            "PT09c2NvcGUpLmZpbHRlcihyPT4hcXx8SlNPTi5zdHJpbmdpZnkocikudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxKSkuZmlsdGVyKHI9PiFmbn" +
            "x8ci5GdW5jdGlvbk5hbWU9PT1mbikuZmlsdGVyKHI9PiFzdHx8U3RyaW5nKHIuRGlzYWJsZWRTdGF0ZXx8J0VuYWJsZWQnKT09PXN0KS5maWx0" +
            "ZXIoYWR2YW5jZWRNYXRjaGVzUnVsZSk7fQpmdW5jdGlvbiByZW5kZXJSdWxlcygpe2NvbnN0IGxpc3Q9ZmlsdGVyZWRSdWxlcygpOyQoJ2xpc3" +
            "QnKS5pbm5lckhUTUw9YDxkaXYgY2xhc3M9Im1vZGUtaGVscCI+PGI+UnVsZSBMaXN0PC9iPjxicj5GbGF0IG9yZGVyZWQgcnVsZS1saXN0IHZp" +
            "ZXcuIFRoaXMgaXMgdXNlZnVsIGZvciByZXZpZXdpbmcgb3JkZXIsIGJ1dCBpdCBpcyBub3QgdGhlIGFjdGlvbi9zdWItbGlzdCBoaWVyYXJjaH" +
            "kuIFVzZSA8Yj5SdWxlIFRyZWU8L2I+IGZvciBzdHJ1Y3R1cmFsIG5hdmlnYXRpb24uPC9kaXY+PGRpdiBjbGFzcz0icnVsZS1saXN0Ij4ke2xp" +
            "c3Quc2xpY2UoMCwxODAwKS5tYXAoKHIsaSk9PnJ1bGVSb3cocixpKSkuam9pbignJyl9PC9kaXY+JHtsaXN0Lmxlbmd0aD4xODAwP2A8ZGl2IG" +
            "NsYXNzPSJlbXB0eS1zdGF0ZSI+U2hvd2luZyBmaXJzdCAxLDgwMCBvZiAke2ZtdChsaXN0Lmxlbmd0aCl9IG1hdGNoZXMuPC9kaXY+YDonJ31g" +
            "O2RvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5yb3ctY2FyZCcpLmZvckVhY2goZWw9PmVsLm9uY2xpY2s9KCk9PnNob3dSdWxlKGxpc3RbK2" +
            "VsLmRhdGFzZXQuaV0pKTt9CmZ1bmN0aW9uIHJ1bGVSb3cocixpKXtjb25zdCBzZWN0aW9uPWlzU2VjdGlvbihyKTtyZXR1cm4gYDxkaXYgY2xh" +
            "c3M9InJvdy1jYXJkICR7ZGlzYWJsZWRDbGFzcyhyKX0gJHtzZWN0aW9uPydzZWN0aW9uLXJvdyc6Jyd9IiBkYXRhLWk9IiR7aX0iPjxkaXYgY2" +
            "xhc3M9InJvdy1udW0iPiMke3IuUnVsZUluZGV4fHxyLlJ1bGVJbmRleFdpdGhpblNjb3BlfHwnJ308L2Rpdj48ZGl2IGNsYXNzPSJyb3ctdGl0" +
            "bGUiPjxiPiR7ZXNjKHJ1bGVUaXRsZShyKSl9PC9iPjxzcGFuPiR7ZXNjKGZ1bmNOYW1lKHIpKX0gwrcgJHtlc2Moci5TY29wZU5hbWV8fCcnKX" +
            "0gwrcgJHthcnIoci5BY3Rpb25OYW1lcykubGVuZ3RofSBhY3Rpb25zPC9zcGFuPjwvZGl2PjxkaXYgY2xhc3M9ImNoaXBzIj4ke3NlY3Rpb24/" +
            "JzxzcGFuIGNsYXNzPSJjaGlwIj5zZWN0aW9uPC9zcGFuPic6Jyd9JHtzdGF0ZUNoaXAocil9JHthcnIoci5Tb3VyY2VzKS5zbGljZSgwLDIpLm" +
            "1hcCh4PT5gPHNwYW4gY2xhc3M9ImNoaXAiPiR7ZXNjKHgpfTwvc3Bhbj5gKS5qb2luKCcnKX08L2Rpdj48L2Rpdj5gO30KZnVuY3Rpb24gZmls" +
            "dGVyZWRSZWxzKCl7Y29uc3QgcT1xdWVyeS50b0xvd2VyQ2FzZSgpLCBraW5kPSQoJ2tpbmQnKT8udmFsdWV8fCcnLCB0dD0kKCd0YXJnZXRUeX" +
            "BlJyk/LnZhbHVlfHwnJztyZXR1cm4gKHJlbGF0aW9uc2hpcHNEYXRhLlJlbGF0aW9uc2hpcHN8fFtdKS5maWx0ZXIocj0+ci5TY29wZU5hbWU9" +
            "PT1zY29wZXx8ci5TY29wZVBhdGg/LmluY2x1ZGVzKCcvJytzY29wZSkpLmZpbHRlcihyPT4hcXx8SlNPTi5zdHJpbmdpZnkocikudG9Mb3dlck" +
            "Nhc2UoKS5pbmNsdWRlcyhxKSkuZmlsdGVyKHI9PiFraW5kfHxyLktpbmQ9PT1raW5kKS5maWx0ZXIocj0+IXR0fHxyLlRhcmdldFR5cGU9PT10" +
            "dCkuZmlsdGVyKGFkdmFuY2VkTWF0Y2hlc1JlbGF0aW9uc2hpcCk7fQpmdW5jdGlvbiByZW5kZXJSZWxhdGlvbnNoaXBzKCl7Y29uc3QgbGlzdD" +
            "1maWx0ZXJlZFJlbHMoKTskKCdsaXN0JykuaW5uZXJIVE1MPWA8ZGl2IGNsYXNzPSJtb2RlLWhlbHAiPjxiPlJlbGF0aW9uc2hpcHM8L2I+PGJy" +
            "PlNlbWFudGljIHJlZmVyZW5jZXMgZXh0cmFjdGVkIGZyb20gcnVsZXM6IGZpZWxkIHVzZSwgYXR0cmlidXRlIHJlYWRzL3dyaXRlcywgcmVqZW" +
            "N0cywgc291cmNlcywgb3B0aW9ucywgYW5kIGRpc2FibGVkIGV2aWRlbmNlLjwvZGl2PjxkaXYgY2xhc3M9InJ1bGUtbGlzdCI+JHtsaXN0LnNs" +
            "aWNlKDAsMjAwMCkubWFwKChyLGkpPT5gPGRpdiBjbGFzcz0icm93LWNhcmQiIGRhdGEtaT0iJHtpfSI+PGRpdiBjbGFzcz0icm93LW51bSI+JH" +
            "tlc2Moci5LaW5kfHwncmVsJyl9PC9kaXY+PGRpdiBjbGFzcz0icm93LXRpdGxlIj48Yj4ke2VzYyhyLlRhcmdldFR5cGV8fCdUYXJnZXQnKX06" +
            "ICR7ZXNjKHIuVGFyZ2V0TmFtZXx8ci5UYXJnZXR8fCcnKX08L2I+PHNwYW4+IyR7ci5SdWxlSW5kZXh8fCcnfSAke2VzYyhyLlJ1bGVOYW1lfH" +
            "wnJyl9IMK3ICR7ZXNjKHIuRnVuY3Rpb25OYW1lfHwnJyl9PC9zcGFuPjwvZGl2PjxkaXYgY2xhc3M9ImNoaXBzIj48c3BhbiBjbGFzcz0iY2hp" +
            "cCBnb29kIj4ke2VzYyhyLkNvbmZpZGVuY2V8fCcnKX08L3NwYW4+PC9kaXY+PC9kaXY+YCkuam9pbignJyl9PC9kaXY+YDtkb2N1bWVudC5xdW" +
            "VyeVNlbGVjdG9yQWxsKCcucm93LWNhcmQnKS5mb3JFYWNoKGVsPT5lbC5vbmNsaWNrPSgpPT5zaG93UmVsKGxpc3RbK2VsLmRhdGFzZXQuaV0p" +
            "KTt9CmZ1bmN0aW9uIHJlbmRlckRpc2FibGVkKCl7Y29uc3QgbGlzdD1maWx0ZXJlZFJ1bGVzKCkuZmlsdGVyKHI9PlN0cmluZyhyLkRpc2FibG" +
            "VkU3RhdGV8fCcnKS5pbmNsdWRlcygnRGlzYWJsZWQnKSk7JCgnbGlzdCcpLmlubmVySFRNTD1gPGRpdiBjbGFzcz0ibW9kZS1oZWxwIj48Yj5E" +
            "aXNhYmxlZCBSdWxlczwvYj48YnI+RGlyZWN0IGRpc2FibGVkIHJ1bGVzIGFyZSBleHBsaWNpdC4gSW5oZXJpdGVkIGRpc2FibGVkIHJ1bGVzIG" +
            "FyZSBkZXJpdmVkIGZyb20gc3RydWN0dXJhbCBwYXJlbnQvYWN0aW9uLXN1Yi1saXN0IGRlc2NlbnQgd2hlbiBhdmFpbGFibGUuPC9kaXY+PGRp" +
            "diBjbGFzcz0icnVsZS1saXN0Ij4ke2xpc3QubWFwKChyLGkpPT5ydWxlUm93KHIsaSkpLmpvaW4oJycpfTwvZGl2PmA7ZG9jdW1lbnQucXVlcn" +
            "lTZWxlY3RvckFsbCgnLnJvdy1jYXJkJykuZm9yRWFjaChlbD0+ZWwub25jbGljaz0oKT0+c2hvd1J1bGUobGlzdFsrZWwuZGF0YXNldC5pXSkp" +
            "O30KZnVuY3Rpb24gcmVuZGVySW5kZXgoKXt1cGRhdGVIZWFkZXIoKTtjb25zdCByZWxzPXJlbGF0aW9uc2hpcHNEYXRhLlJlbGF0aW9uc2hpcH" +
            "N8fFtdO2NvbnN0IGdyb3Vwcz1uZXcgTWFwKCk7cmVscy5mb3JFYWNoKHI9Pntjb25zdCBrPShyLlRhcmdldFR5cGV8fCdUYXJnZXQnKSsnOiAn" +
            "KyhyLlRhcmdldE5hbWV8fHIuVGFyZ2V0fHwnJyk7aWYoIWdyb3Vwcy5oYXMoaykpZ3JvdXBzLnNldChrLFtdKTtncm91cHMuZ2V0KGspLnB1c2" +
            "gocik7fSk7Y29uc3QgcT1xdWVyeS50b0xvd2VyQ2FzZSgpO2NvbnN0IHJvd3M9Wy4uLmdyb3Vwcy5lbnRyaWVzKCldLmZpbHRlcigoW2tdKT0+" +
            "IXF8fGsudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxKSkuc29ydCgoYSxiKT0+YlsxXS5sZW5ndGgtYVsxXS5sZW5ndGgpLnNsaWNlKDAsMTAwMC" +
            "k7JCgnbGlzdCcpLmlubmVySFRNTD1gPGRpdiBjbGFzcz0ibW9kZS1oZWxwIj48Yj5SZWxhdGlvbnNoaXAgSW5kZXg8L2I+PGJyPkNyb3NzLXJl" +
            "ZmVyZW5jZSBpbmRleCBhY3Jvc3MgYWxsIGNvbmZpZ3VyZWQgQUMgcnVsZXMuPC9kaXY+PGRpdiBjbGFzcz0icnVsZS1saXN0Ij4ke3Jvd3MubW" +
            "FwKChbayx2XSxpKT0+YDxkaXYgY2xhc3M9InJvdy1jYXJkIiBkYXRhLWk9IiR7aX0iPjxkaXYgY2xhc3M9InJvdy1udW0iPiR7Zm10KHYubGVu" +
            "Z3RoKX08L2Rpdj48ZGl2IGNsYXNzPSJyb3ctdGl0bGUiPjxiPiR7ZXNjKGspfTwvYj48c3Bhbj4ke2ZtdCh2Lmxlbmd0aCl9IHJlbGF0aW9uc2" +
            "hpcHM8L3NwYW4+PC9kaXY+PHNwYW4gY2xhc3M9ImNoaXAiPmluZGV4PC9zcGFuPjwvZGl2PmApLmpvaW4oJycpfTwvZGl2PmA7fQpmdW5jdGlv" +
            "biB0cmVlTm9kZXNGb3JTY29wZSgpe3JldHVybiAodHJlZURhdGEuTm9kZXN8fFtdKS5maWx0ZXIobj0+bi5TY29wZU5hbWU9PT1zY29wZSk7fW" +
            "Z1bmN0aW9uIGJ1aWxkVHJlZU1vZGVsKCl7Y29uc3Qgbm9kZXM9dHJlZU5vZGVzRm9yU2NvcGUoKTtjb25zdCBieVBhcmVudD1uZXcgTWFwKCk7" +
            "bm9kZXMuZm9yRWFjaChuPT57Y29uc3Qgaz1uLlBhcmVudE5vZGVJZDtpZighYnlQYXJlbnQuaGFzKGspKWJ5UGFyZW50LnNldChrLFtdKTtieV" +
            "BhcmVudC5nZXQoaykucHVzaChuKTt9KTtmb3IoY29uc3QgbGlzdCBvZiBieVBhcmVudC52YWx1ZXMoKSlsaXN0LnNvcnQoKGEsYik9PihhLkFj" +
            "dGlvbkxpc3RJbmRleC1iLkFjdGlvbkxpc3RJbmRleCl8fChhLlJ1bGVJbmRleFdpdGhpblNjb3BlLWIuUnVsZUluZGV4V2l0aGluU2NvcGUpfH" +
            "woYS5Ob2RlSWQtYi5Ob2RlSWQpKTtyZXR1cm4ge25vZGVzLGJ5UGFyZW50fTt9CmZ1bmN0aW9uIG5vZGVUaXRsZShuKXtyZXR1cm4gbj8uUnVs" +
            "ZU5hbWV8fCdSb290IHJ1bGUgbGlzdCc7fWZ1bmN0aW9uIG5vZGVGdW5jdGlvbihuKXtyZXR1cm4gbj8uRnVuY3Rpb25OYW1lfHwnKG1pc3Npbm" +
            "cgZnVuY3Rpb24pJzt9ZnVuY3Rpb24gbm9ybWFsaXplQWN0aW9uTmFtZShzKXtyZXR1cm4gU3RyaW5nKHM/PycnKS5yZXBsYWNlKC9be31dL2cs" +
            "JycpLnJlcGxhY2UoL14iK3wiKyQvZywnJykucmVwbGFjZSgvIiIvZywnIC8gJykudHJpbSgpfHwnVW5uYW1lZCByZXN1bHQnO31mdW5jdGlvbi" +
            "BhY3Rpb25OYW1lKHBhcmVudCxpbmRleCl7Y29uc3QgbmFtZXM9YXJyKHBhcmVudD8uQWN0aW9uTmFtZXMpLmZsYXRNYXAoeD0+U3RyaW5nKHgp" +
            "LnNwbGl0KC8iInwiLCIvKSkubWFwKG5vcm1hbGl6ZUFjdGlvbk5hbWUpLmZpbHRlcihCb29sZWFuKTtyZXR1cm4gbmFtZXNbaW5kZXhdfHxgQW" +
            "N0aW9uICR7aW5kZXh9YDt9ZnVuY3Rpb24gZ3JvdXBCeUFjdGlvbihjaGlsZHJlbixwYXJlbnQpe2NvbnN0IG1hcD1uZXcgTWFwKCk7Y2hpbGRy" +
            "ZW4uZmlsdGVyKGM9PmMuSXNSdWxlTm9kZSE9PWZhbHNlKS5mb3JFYWNoKGM9Pntjb25zdCBpeD1jLkFjdGlvbkxpc3RJbmRleD09bnVsbD8wOm" +
            "MuQWN0aW9uTGlzdEluZGV4O2lmKCFtYXAuaGFzKGl4KSltYXAuc2V0KGl4LHtpbmRleDppeCxuYW1lOmFjdGlvbk5hbWUocGFyZW50LGl4KSxw" +
            "YXJlbnQsY2hpbGRyZW46W119KTttYXAuZ2V0KGl4KS5jaGlsZHJlbi5wdXNoKGMpO30pO3JldHVybiBbLi4ubWFwLnZhbHVlcygpXS5zb3J0KC" +
            "hhLGIpPT5hLmluZGV4LWIuaW5kZXgpO30KZnVuY3Rpb24gY29tcHV0ZVRyZWVNYXRjaGVzKCl7Y29uc3QgcT10cmVlUXVlcnkudHJpbSgpLnRv" +
            "TG93ZXJDYXNlKCk7dHJlZU1hdGNoZXM9dHJlZU5vZGVzRm9yU2NvcGUoKS5maWx0ZXIobj0+KCFxfHxKU09OLnN0cmluZ2lmeShuKS50b0xvd2" +
            "VyQ2FzZSgpLmluY2x1ZGVzKHEpKSYmYWR2YW5jZWRNYXRjaGVzVHJlZU5vZGUobikpLm1hcChuPT5uLk5vZGVJZCk7dHJlZU1hdGNoSXg9dHJl" +
            "ZU1hdGNoZXMubGVuZ3RoPzA6LTE7fWZ1bmN0aW9uIHRyZWVNYXRjaChuKXtyZXR1cm4gdHJlZU1hdGNoZXMuaW5jbHVkZXMobi5Ob2RlSWQpO3" +
            "1mdW5jdGlvbiBleHBhbmRBbmNlc3RvcnMobm9kZSl7Y29uc3Qgbm9kZXM9dHJlZU5vZGVzRm9yU2NvcGUoKTtjb25zdCBieUlkPW5ldyBNYXAo" +
            "bm9kZXMubWFwKG49PltuLk5vZGVJZCxuXSkpO2xldCBjdXI9bm9kZTt3aGlsZShjdXImJmN1ci5QYXJlbnROb2RlSWQ+PTApe29wZW5Ob2Rlcy" +
            "5hZGQoJ24nK2N1ci5QYXJlbnROb2RlSWQpO2NvbnN0IHA9YnlJZC5nZXQoY3VyLlBhcmVudE5vZGVJZCk7aWYocClvcGVuTm9kZXMuYWRkKCdh" +
            "JytwLk5vZGVJZCsnXycrY3VyLkFjdGlvbkxpc3RJbmRleCk7Y3VyPXA7fX0KZnVuY3Rpb24gZXhwYW5kVHJlZU1hdGNoZXMoKXtjb25zdCBieU" +
            "lkPW5ldyBNYXAodHJlZU5vZGVzRm9yU2NvcGUoKS5tYXAobj0+W24uTm9kZUlkLG5dKSk7dHJlZU1hdGNoZXMuZm9yRWFjaChpZD0+e2NvbnN0" +
            "IG49YnlJZC5nZXQoaWQpO2lmKG4pZXhwYW5kQW5jZXN0b3JzKG4pO30pO3JlbmRlckxpc3QoKTt9CmZ1bmN0aW9uIGdvdG9UcmVlTWF0Y2goZG" +
            "VsdGEpe2lmKCF0cmVlTWF0Y2hlcy5sZW5ndGgpcmV0dXJuO3RyZWVNYXRjaEl4PSh0cmVlTWF0Y2hJeCtkZWx0YSt0cmVlTWF0Y2hlcy5sZW5n" +
            "dGgpJXRyZWVNYXRjaGVzLmxlbmd0aDtjb25zdCBieUlkPW5ldyBNYXAodHJlZU5vZGVzRm9yU2NvcGUoKS5tYXAobj0+W24uTm9kZUlkLG5dKS" +
            "k7Y29uc3Qgbj1ieUlkLmdldCh0cmVlTWF0Y2hlc1t0cmVlTWF0Y2hJeF0pO2lmKG4pe2V4cGFuZEFuY2VzdG9ycyhuKTtyZW5kZXJMaXN0KCk7" +
            "c2V0VGltZW91dCgoKT0+ZG9jdW1lbnQucXVlcnlTZWxlY3RvcihgW2RhdGEtbm9kZT0iJHtuLk5vZGVJZH0iXWApPy5zY3JvbGxJbnRvVmlldy" +
            "h7YmxvY2s6J2NlbnRlcid9KSwwKTt9fQpmdW5jdGlvbiByZW5kZXJUcmVlKCl7Y29uc3Qge25vZGVzLGJ5UGFyZW50fT1idWlsZFRyZWVNb2Rl" +
            "bCgpO2lmKCFub2Rlcy5sZW5ndGgpeyQoJ2xpc3QnKS5pbm5lckhUTUw9JzxkaXYgY2xhc3M9ImVtcHR5LXN0YXRlIj48aDM+Tm8gc3RydWN0dX" +
            "JhbCB0cmVlIG5vZGVzPC9oMz48cD5UaGlzIHNjb3BlIGhhcyBubyBwYXJzZWQgc3RydWN0dXJhbCBBQyBydWxlLWxpc3QgcGF5bG9hZC48L3A+" +
            "PC9kaXY+JztyZXR1cm47fWlmKCh0cmVlUXVlcnl8fGFkdkFjdGl2ZSgpKSYmIXRyZWVNYXRjaGVzLmxlbmd0aCljb21wdXRlVHJlZU1hdGNoZX" +
            "MoKTtjb25zdCByb290cz1ub2Rlcy5maWx0ZXIobj0+bi5QYXJlbnROb2RlSWQ8MCk7bGV0IGh0bWw9YDxkaXYgY2xhc3M9ImJyZWFkY3J1bWIi" +
            "PjxzcGFuIGNsYXNzPSJjcnVtYiI+UHJvY2Vzc2VzPC9zcGFuPjxzcGFuPuKGkjwvc3Bhbj48c3BhbiBjbGFzcz0iY3J1bWIiPkFDPC9zcGFuPj" +
            "xzcGFuPuKGkjwvc3Bhbj48c3BhbiBjbGFzcz0iY3J1bWIiPiR7ZXNjKHNjb3BlKX08L3NwYW4+PHNwYW4+4oaSPC9zcGFuPjxzcGFuIGNsYXNz" +
            "PSJjcnVtYiI+UnVsZSBUcmVlPC9zcGFuPjwvZGl2PjxkaXYgY2xhc3M9Im1vZGUtaGVscCI+PGI+U3RydWN0dXJhbCBSdWxlIFRyZWU8L2I+PG" +
            "JyPk5hdmlnYXRlIGFzIDxiPnJ1bGUg4oaSIGFjdGlvbi9zdGF0dXMgcmVzdWx0IOKGkiBjaGlsZCBydWxlczwvYj4uIFJ1bGUgbm9kZXMgYW5k" +
            "IGFjdGlvbiBicmFuY2hlcyBjYW4gYm90aCBiZSBzZWxlY3RlZC4gUHNldWRvLXJvb3QgbGlzdHMgYXJlIHN1bW1hcml6ZWQgaGVyZSByYXRoZX" +
            "IgdGhhbiBzaG93biBhcyBidWxreSByb3dzLiAke3RyZWVNYXRjaGVzLmxlbmd0aD8nPGJyPjxiPicrZm10KHRyZWVNYXRjaGVzLmxlbmd0aCkr" +
            "JyB0cmVlIG1hdGNoZXMgYWN0aXZlLjwvYj4nOicnfTwvZGl2PjxkaXYgY2xhc3M9InJhaWwtdHJlZSI+YDtyb290cy5mb3JFYWNoKHJvb3Q9Pn" +
            "tjb25zdCByb290Q2hpbGRyZW49YnlQYXJlbnQuZ2V0KHJvb3QuTm9kZUlkKXx8W107cm9vdENoaWxkcmVuLmZvckVhY2gobj0+aHRtbCs9cmVu" +
            "ZGVyUnVsZU5vZGUobiwwLGJ5UGFyZW50KSk7fSk7aHRtbCs9JzwvZGl2Pic7JCgnbGlzdCcpLmlubmVySFRNTD1odG1sO3dpcmVUcmVlKCk7fQ" +
            "pmdW5jdGlvbiByZW5kZXJSdWxlTm9kZShuLGRlcHRoLGJ5UGFyZW50KXtjb25zdCBpZD0nbicrbi5Ob2RlSWQ7Y29uc3QgY2hpbGRyZW49YnlQ" +
            "YXJlbnQuZ2V0KG4uTm9kZUlkKXx8W107Y29uc3QgYWN0aW9ucz1ncm91cEJ5QWN0aW9uKGNoaWxkcmVuLG4pO2NvbnN0IGhhcz1hY3Rpb25zLm" +
            "xlbmd0aD4wO2NvbnN0IG9wZW49b3Blbk5vZGVzLmhhcyhpZCk7Y29uc3Qgc2VjdGlvbj1pc1NlY3Rpb24obik7Y29uc3QgY2xzPWB0cmVlLWxp" +
            "bmUgcnVsZS1yb3cgJHtkaXNhYmxlZENsYXNzKG4pfSAke3RyZWVNYXRjaChuKT8nbWF0Y2gtaGl0JzonJ30gJHtzZWN0aW9uPydzZWN0aW9uLX" +
            "Jvdyc6Jyd9YDtsZXQgaHRtbD1gPGRpdiBjbGFzcz0iJHtjbHN9IiBkYXRhLWRlcHRoPSIke2RlcHRofSIgc3R5bGU9Ii0tZGVwdGg6JHtkZXB0" +
            "aH0iIGRhdGEtbm9kZT0iJHtuLk5vZGVJZH0iIGRhdGEta2luZD0icnVsZSI+PGJ1dHRvbiB0eXBlPSJidXR0b24iIGNsYXNzPSJ0d2lzdHkgJH" +
            "toYXM/Jyc6J2JsYW5rJ30iIGRhdGEtdG9nZ2xlPSIke2lkfSI+JHtoYXM/KG9wZW4/J+KWvic6J+KWuCcpOifCtyd9PC9idXR0b24+PGRpdiBj" +
            "bGFzcz0ibm9kZS1sYWJlbCI+PGI+IyR7bi5SdWxlSW5kZXhXaXRoaW5TY29wZXx8Jyd9ICR7ZXNjKG5vZGVUaXRsZShuKSl9PC9iPjxzcGFuPi" +
            "R7ZXNjKG5vZGVGdW5jdGlvbihuKSl9IMK3ICR7ZXNjKG4uU2NvcGVOYW1lfHwnJyl9JHtuLkRpc2FibGVkU3RhdGUmJm4uRGlzYWJsZWRTdGF0" +
            "ZSE9PSdFbmFibGVkJz8nIMK3ICcrZXNjKG4uRGlzYWJsZWRTdGF0ZSk6Jyd9PC9zcGFuPjwvZGl2PjxkaXYgY2xhc3M9ImNoaXBzIj4ke3NlY3" +
            "Rpb24/JzxzcGFuIGNsYXNzPSJjaGlwIj5zZWN0aW9uPC9zcGFuPic6Jyd9PHNwYW4gY2xhc3M9ImNoaXAgcnVsZSI+cnVsZTwvc3Bhbj4ke3N0" +
            "YXRlQ2hpcChuKX08L2Rpdj48L2Rpdj5gO2lmKGhhcyYmb3BlbilhY3Rpb25zLmZvckVhY2goYT0+aHRtbCs9cmVuZGVyQWN0aW9uTm9kZShuLG" +
            "EsZGVwdGgrMSxieVBhcmVudCkpO3JldHVybiBodG1sO30KZnVuY3Rpb24gcmVuZGVyQWN0aW9uTm9kZShwYXJlbnQsYSxkZXB0aCxieVBhcmVu" +
            "dCl7Y29uc3Qga2V5PSdhJytwYXJlbnQuTm9kZUlkKydfJythLmluZGV4O2NvbnN0IG9wZW49b3Blbk5vZGVzLmhhcyhrZXkpO2xldCBodG1sPW" +
            "A8ZGl2IGNsYXNzPSJ0cmVlLWxpbmUgYWN0aW9uLXJvdyIgZGF0YS1kZXB0aD0iJHtkZXB0aH0iIHN0eWxlPSItLWRlcHRoOiR7ZGVwdGh9IiBk" +
            "YXRhLWFjdGlvbj0iJHtrZXl9IiBkYXRhLXBhcmVudD0iJHtwYXJlbnQuTm9kZUlkfSIgZGF0YS1hY3Rpb24taW5kZXg9IiR7YS5pbmRleH0iPj" +
            "xidXR0b24gdHlwZT0iYnV0dG9uIiBjbGFzcz0idHdpc3R5IiBkYXRhLXRvZ2dsZT0iJHtrZXl9Ij4ke29wZW4/J+KWvic6J+KWuCd9PC9idXR0" +
            "b24+PGRpdiBjbGFzcz0ibm9kZS1sYWJlbCI+PGI+QWN0aW9uICR7YS5pbmRleH0g4oCUICR7ZXNjKGEubmFtZSl9PC9iPjxzcGFuPiR7Zm10KG" +
            "EuY2hpbGRyZW4ubGVuZ3RoKX0gaW1tZWRpYXRlIHJ1bGUke2EuY2hpbGRyZW4ubGVuZ3RoPT09MT8nJzoncyd9JHthLmNoaWxkcmVuWzBdPycg" +
            "wrcgc3RhcnRzICMnKyhhLmNoaWxkcmVuWzBdLlJ1bGVJbmRleFdpdGhpblNjb3BlfHwnJyk6Jyd9PC9zcGFuPjwvZGl2PjxkaXYgY2xhc3M9Im" +
            "NoaXBzIj48c3BhbiBjbGFzcz0iY2hpcCBhY3Rpb24iPmFjdGlvbjwvc3Bhbj48L2Rpdj48L2Rpdj5gO2lmKG9wZW4pYS5jaGlsZHJlbi5mb3JF" +
            "YWNoKGM9Pmh0bWwrPXJlbmRlclJ1bGVOb2RlKGMsZGVwdGgrMSxieVBhcmVudCkpO3JldHVybiBodG1sO30KZnVuY3Rpb24gd2lyZVRyZWUoKX" +
            "tkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS10b2dnbGVdJykuZm9yRWFjaChiPT5iLm9uY2xpY2s9ZT0+e2Uuc3RvcFByb3BhZ2F0" +
            "aW9uKCk7Y29uc3Qgaz1iLmRhdGFzZXQudG9nZ2xlO29wZW5Ob2Rlcy5oYXMoayk/b3Blbk5vZGVzLmRlbGV0ZShrKTpvcGVuTm9kZXMuYWRkKG" +
            "spO3JlbmRlckxpc3QoKTt9KTtkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1ub2RlXScpLmZvckVhY2goZWw9PmVsLm9uY2xpY2s9" +
            "ZT0+e2lmKGUudGFyZ2V0LmRhdGFzZXQudG9nZ2xlKXJldHVybjtjb25zdCBpZD0rZWwuZGF0YXNldC5ub2RlO2NvbnN0IG49dHJlZU5vZGVzRm" +
            "9yU2NvcGUoKS5maW5kKHg9PnguTm9kZUlkPT09aWQpO3Nob3dUcmVlUnVsZShuKTt9KTtkb2N1bWVudC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0" +
            "YS1hY3Rpb25dJykuZm9yRWFjaChlbD0+ZWwub25jbGljaz1lPT57aWYoZS50YXJnZXQuZGF0YXNldC50b2dnbGUpcmV0dXJuO2NvbnN0IHBhcm" +
            "VudD10cmVlTm9kZXNGb3JTY29wZSgpLmZpbmQoeD0+eC5Ob2RlSWQ9PT0rZWwuZGF0YXNldC5wYXJlbnQpO2NvbnN0IGNoaWxkcmVuPXRyZWVO" +
            "b2Rlc0ZvclNjb3BlKCkuZmlsdGVyKG49Pm4uUGFyZW50Tm9kZUlkPT09cGFyZW50Lk5vZGVJZCYmbi5BY3Rpb25MaXN0SW5kZXg9PT0rZWwuZG" +
            "F0YXNldC5hY3Rpb25JbmRleCk7c2hvd0FjdGlvbih7aW5kZXg6K2VsLmRhdGFzZXQuYWN0aW9uSW5kZXgsbmFtZTphY3Rpb25OYW1lKHBhcmVu" +
            "dCwrZWwuZGF0YXNldC5hY3Rpb25JbmRleCkscGFyZW50LGNoaWxkcmVufSk7fSk7fQpmdW5jdGlvbiBzaG93UnVsZShyKXtzZWxlY3RlZD17dH" +
            "lwZToncnVsZScsZGF0YTpyfTtzZWxlY3RlZFJhdz1yO2luc3BlY3RvclRhYj0nZGV0YWlscyc7c3luY0luc3BlY3RvclRhYnMoKTtyZW5kZXJJ" +
            "bnNwZWN0b3IoKTt9ZnVuY3Rpb24gc2hvd1RyZWVSdWxlKHIpe3NlbGVjdGVkPXt0eXBlOid0cmVlUnVsZScsZGF0YTpyfTtzZWxlY3RlZFJhdz" +
            "1yO2luc3BlY3RvclRhYj0nZGV0YWlscyc7c3luY0luc3BlY3RvclRhYnMoKTtyZW5kZXJJbnNwZWN0b3IoKTt9ZnVuY3Rpb24gc2hvd0FjdGlv" +
            "bihhKXtzZWxlY3RlZD17dHlwZTonYWN0aW9uJyxkYXRhOmF9O3NlbGVjdGVkUmF3PWE7aW5zcGVjdG9yVGFiPSdkZXRhaWxzJztzeW5jSW5zcG" +
            "VjdG9yVGFicygpO3JlbmRlckluc3BlY3RvcigpO31mdW5jdGlvbiBzaG93UmVsKHIpe3NlbGVjdGVkPXt0eXBlOidyZWxhdGlvbnNoaXAnLGRh" +
            "dGE6cn07c2VsZWN0ZWRSYXc9cjtpbnNwZWN0b3JUYWI9J2RldGFpbHMnO3N5bmNJbnNwZWN0b3JUYWJzKCk7cmVuZGVySW5zcGVjdG9yKCk7fW" +
            "Z1bmN0aW9uIHN5bmNJbnNwZWN0b3JUYWJzKCl7ZG9jdW1lbnQucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtaW5zcGVjdG9yXScpLmZvckVhY2go" +
            "eD0+eC5jbGFzc0xpc3QudG9nZ2xlKCdhY3RpdmUnLHguZGF0YXNldC5pbnNwZWN0b3I9PT1pbnNwZWN0b3JUYWIpKTt9CmZ1bmN0aW9uIHJlbm" +
            "Rlckluc3BlY3RvckRlZmF1bHQoKXtzZWxlY3RlZD1udWxsO3NlbGVjdGVkUmF3PW51bGw7cmVuZGVySW5zcGVjdG9yKCk7fWZ1bmN0aW9uIHJl" +
            "bmRlckluc3BlY3Rvcigpe3N5bmNJbnNwZWN0b3JUYWJzKCk7aWYoaW5zcGVjdG9yVGFiPT09J21lc3NhZ2VzJylyZXR1cm4gcmVuZGVyTWVzc2" +
            "FnZXMoKTtpZihpbnNwZWN0b3JUYWI9PT0ncmF3JylyZXR1cm4gcmVuZGVyUmF3KCk7aWYoIXNlbGVjdGVkKXskKCdkZXRhaWwnKS5pbm5lckhU" +
            "TUw9KCFzY29wZT9gPGRpdiBjbGFzcz0icGFuZWwiPjxoMz5JbnNwZWN0b3I8L2gzPjxwIGNsYXNzPSJzdWJ0bGUiPk5vIGl0ZW0gc2VsZWN0ZW" +
            "QuIFN0YXJ0IGZyb20gdGhlIEZXRCBUcmVlLCB0aGVuIGNob29zZSBhIHZpZXcgaW4gdGhlIENvbmZpZ3VyYXRpb24gV2luZG93LjwvcD48ZGl2" +
            "IGNsYXNzPSJpbnNwZWN0b3Itc3RlcHMiPjxkaXYgY2xhc3M9Imluc3BlY3Rvci1zdGVwIj48Yj4xLjwvYj4gU2VsZWN0IGEgRG9jdW1lbnQgb3" +
            "IgUGFnZSB1bmRlciBQcm9jZXNzZXMg4oaSIEFDLjwvZGl2PjxkaXYgY2xhc3M9Imluc3BlY3Rvci1zdGVwIj48Yj4yLjwvYj4gVXNlIFJ1bGUg" +
            "VHJlZSBmb3IgaGllcmFyY2h5IG9yIFJ1bGUgTGlzdCBmb3IgZmxhdCBvcmRlci48L2Rpdj48ZGl2IGNsYXNzPSJpbnNwZWN0b3Itc3RlcCI+PG" +
            "I+My48L2I+IFNlbGVjdCBhIHJ1bGUgb3IgYWN0aW9uIHRvIGluc3BlY3QgZGV0YWlscyBoZXJlLjwvZGl2PjwvZGl2PjwvZGl2PmA6YDxkaXYg" +
            "Y2xhc3M9InBhbmVsIj48aDM+SW5zcGVjdG9yPC9oMz48cCBjbGFzcz0ic3VidGxlIj5TZWxlY3QgYSBydWxlLCBhY3Rpb24sIHJlbGF0aW9uc2" +
            "hpcCwgb3IgaW5kZXggaXRlbSB0byBpbnNwZWN0IGNvbmZpZ3VyYXRpb24gZGV0YWlscy48L3A+PC9kaXY+YCkrbWVzc2FnZUdyaWQoKTtyZXR1" +
            "cm47fWNvbnN0IHQ9c2VsZWN0ZWQudHlwZSxkPXNlbGVjdGVkLmRhdGE7aWYodD09PSdhY3Rpb24nKXJldHVybiByZW5kZXJBY3Rpb25JbnNwZW" +
            "N0b3IoZCk7aWYodD09PSdyZWxhdGlvbnNoaXAnKXJldHVybiByZW5kZXJSZWxJbnNwZWN0b3IoZCk7cmV0dXJuIHJlbmRlclJ1bGVJbnNwZWN0" +
            "b3IoZCx0PT09J3RyZWVSdWxlJyk7fQpmdW5jdGlvbiByZW5kZXJSdWxlSW5zcGVjdG9yKHIsaXNUcmVlKXtjb25zdCBhY3Rpb25zPWlzVHJlZT" +
            "9ncm91cEJ5QWN0aW9uKHRyZWVOb2Rlc0ZvclNjb3BlKCkuZmlsdGVyKG49Pm4uUGFyZW50Tm9kZUlkPT09ci5Ob2RlSWQpLHIpOltdOyQoJ2Rl" +
            "dGFpbCcpLmlubmVySFRNTD1gPGRpdiBjbGFzcz0icGFuZWwiPjxoMz4ke2lzVHJlZT8nU3RydWN0dXJhbCBSdWxlJzonUnVsZSd9PC9oMz48ZG" +
            "l2IGNsYXNzPSJrdiI+PGRpdj5OYW1lPC9kaXY+PGRpdj4ke2VzYyhpc1RyZWU/bm9kZVRpdGxlKHIpOnJ1bGVUaXRsZShyKSl9PC9kaXY+PC9k" +
            "aXY+PGRpdiBjbGFzcz0ia3YiPjxkaXY+RnVuY3Rpb248L2Rpdj48ZGl2PiR7ZXNjKGlzVHJlZT9ub2RlRnVuY3Rpb24ocik6ZnVuY05hbWUoci" +
            "kpfTwvZGl2PjwvZGl2PjxkaXYgY2xhc3M9Imt2Ij48ZGl2PlNjb3BlPC9kaXY+PGRpdj4ke2VzYyhyLlNjb3BlUGF0aHx8ci5TY29wZU5hbWV8" +
            "fCcnKX08L2Rpdj48L2Rpdj48ZGl2IGNsYXNzPSJrdiI+PGRpdj5SdWxlIEdVSUQ8L2Rpdj48ZGl2IGNsYXNzPSJtb25vIj4ke2VzYyhyLlJ1bG" +
            "VHdWlkfHwnJyl9PC9kaXY+PC9kaXY+JHtpc1RyZWU/YDxkaXYgY2xhc3M9Imt2Ij48ZGl2Pk5vZGVJZDwvZGl2PjxkaXY+JHtyLk5vZGVJZH08" +
            "L2Rpdj48L2Rpdj48ZGl2IGNsYXNzPSJrdiI+PGRpdj5QYXJlbnROb2RlSWQ8L2Rpdj48ZGl2PiR7ci5QYXJlbnROb2RlSWR9PC9kaXY+PC9kaX" +
            "Y+PGRpdiBjbGFzcz0ia3YiPjxkaXY+QWN0aW9uIGluZGV4PC9kaXY+PGRpdj4ke3IuQWN0aW9uTGlzdEluZGV4fTwvZGl2PjwvZGl2PjxkaXYg" +
            "Y2xhc3M9Imt2Ij48ZGl2PkhpZXJhcmNoeSBsZXZlbDwvZGl2PjxkaXY+JHtyLkhpZXJhcmNoeUxldmVsfTwvZGl2PjwvZGl2PmA6Jyd9PGRpdi" +
            "BjbGFzcz0ia3YiPjxkaXY+RGlzYWJsZWQ8L2Rpdj48ZGl2PiR7ZXNjKHIuRGlzYWJsZWRTdGF0ZXx8J0VuYWJsZWQnKX08L2Rpdj48L2Rpdj4k" +
            "e3IuRGlzYWJsZWRBbmNlc3Rvck5vZGVJZD9gPGRpdiBjbGFzcz0ia3YiPjxkaXY+QmxvY2tlZCBieTwvZGl2PjxkaXY+Tm9kZSAke3IuRGlzYW" +
            "JsZWRBbmNlc3Rvck5vZGVJZH0gwrcgJHtlc2Moci5EaXNhYmxlZEFuY2VzdG9yUnVsZU5hbWV8fCcnKX08L2Rpdj48L2Rpdj5gOicnfTwvZGl2" +
            "PiR7YWN0aW9ucy5sZW5ndGg/YDxkaXYgY2xhc3M9InBhbmVsIj48aDM+SW1tZWRpYXRlIGFjdGlvbnM8L2gzPiR7YWN0aW9ucy5tYXAoYT0+YD" +
            "xkaXYgY2xhc3M9InJlbC1yb3ciPjxiPkFjdGlvbiAke2EuaW5kZXh9IOKAlCAke2VzYyhhLm5hbWUpfTwvYj48YnI+PHNwYW4gY2xhc3M9InN1" +
            "YnRsZSI+JHtmbXQoYS5jaGlsZHJlbi5sZW5ndGgpfSBpbW1lZGlhdGUgcnVsZXMke2EuY2hpbGRyZW5bMF0/JyDCtyBzdGFydHMgIycrKGEuY2" +
            "hpbGRyZW5bMF0uUnVsZUluZGV4V2l0aGluU2NvcGV8fCcnKTonJ308L3NwYW4+PC9kaXY+YCkuam9pbignJyl9PC9kaXY+YDonJ308ZGl2IGNs" +
            "YXNzPSJwYW5lbCI+PGgzPlBhcmFtZXRlcnM8L2gzPiR7cGFyYW1IdG1sKHIuUGFyYW1ldGVycyl9PC9kaXY+YDt9CmZ1bmN0aW9uIHJlbmRlck" +
            "FjdGlvbkluc3BlY3RvcihhKXskKCdkZXRhaWwnKS5pbm5lckhUTUw9YDxkaXYgY2xhc3M9InBhbmVsIj48aDM+QWN0aW9uIC8gU3RhdHVzIFJl" +
            "c3VsdDwvaDM+PGRpdiBjbGFzcz0ia3YiPjxkaXY+TmFtZTwvZGl2PjxkaXY+QWN0aW9uICR7YS5pbmRleH0g4oCUICR7ZXNjKGEubmFtZSl9PC" +
            "9kaXY+PC9kaXY+PGRpdiBjbGFzcz0ia3YiPjxkaXY+UGFyZW50IHJ1bGU8L2Rpdj48ZGl2PiMke2EucGFyZW50Py5SdWxlSW5kZXhXaXRoaW5T" +
            "Y29wZXx8Jyd9ICR7ZXNjKG5vZGVUaXRsZShhLnBhcmVudCkpfTwvZGl2PjwvZGl2PjxkaXYgY2xhc3M9Imt2Ij48ZGl2PlBhcmVudCBmdW5jdG" +
            "lvbjwvZGl2PjxkaXY+JHtlc2Mobm9kZUZ1bmN0aW9uKGEucGFyZW50KSl9PC9kaXY+PC9kaXY+PGRpdiBjbGFzcz0ia3YiPjxkaXY+SW1tZWRp" +
            "YXRlIHJ1bGVzPC9kaXY+PGRpdj4ke2ZtdChhLmNoaWxkcmVuLmxlbmd0aCl9PC9kaXY+PC9kaXY+PC9kaXY+PGRpdiBjbGFzcz0icGFuZWwiPj" +
            "xoMz5JbW1lZGlhdGUgY2hpbGQgcnVsZXM8L2gzPiR7YS5jaGlsZHJlbi5tYXAoYz0+YDxkaXYgY2xhc3M9InJlbC1yb3ciPjxiPiMke2MuUnVs" +
            "ZUluZGV4V2l0aGluU2NvcGV8fCcnfSAke2VzYyhub2RlVGl0bGUoYykpfTwvYj48YnI+PHNwYW4gY2xhc3M9InN1YnRsZSI+JHtlc2Mobm9kZU" +
            "Z1bmN0aW9uKGMpKX0gwrcgJHtlc2MoYy5EaXNhYmxlZFN0YXRlfHwnRW5hYmxlZCcpfTwvc3Bhbj48L2Rpdj5gKS5qb2luKCcnKXx8JzxzcGFu" +
            "IGNsYXNzPSJzdWJ0bGUiPk5vbmU8L3NwYW4+J308L2Rpdj5gO30KZnVuY3Rpb24gcmVuZGVyUmVsSW5zcGVjdG9yKHIpeyQoJ2RldGFpbCcpLm" +
            "lubmVySFRNTD1gPGRpdiBjbGFzcz0icGFuZWwiPjxoMz5SZWxhdGlvbnNoaXA8L2gzPjxkaXYgY2xhc3M9Imt2Ij48ZGl2PktpbmQ8L2Rpdj48" +
            "ZGl2PiR7ZXNjKHIuS2luZCl9PC9kaXY+PC9kaXY+PGRpdiBjbGFzcz0ia3YiPjxkaXY+VGFyZ2V0PC9kaXY+PGRpdj4ke2VzYyhyLlRhcmdldF" +
            "R5cGUpfTogJHtlc2Moci5UYXJnZXROYW1lfHxyLlRhcmdldCl9PC9kaXY+PC9kaXY+PGRpdiBjbGFzcz0ia3YiPjxkaXY+UnVsZTwvZGl2Pjxk" +
            "aXY+IyR7ci5SdWxlSW5kZXh8fCcnfSAke2VzYyhyLlJ1bGVOYW1lfHwnJyl9PC9kaXY+PC9kaXY+PGRpdiBjbGFzcz0ia3YiPjxkaXY+RnVuY3" +
            "Rpb248L2Rpdj48ZGl2PiR7ZXNjKHIuRnVuY3Rpb25OYW1lfHwnJyl9PC9kaXY+PC9kaXY+PC9kaXY+YDt9CmZ1bmN0aW9uIHJlbmRlck1lc3Nh" +
            "Z2VzKCl7JCgnZGV0YWlsJykuaW5uZXJIVE1MPWA8ZGl2IGNsYXNzPSJwYW5lbCI+PGgzPk1lc3NhZ2UgV2luZG93PC9oMz48cCBjbGFzcz0ic3" +
            "VidGxlIj5FZGl0b3Itc3R5bGUgc3RhdHVzIGFuZCBkaWFnbm9zdGljcyBwYW5lbC48L3A+PC9kaXY+JHttZXNzYWdlR3JpZCgpfWA7fWZ1bmN0" +
            "aW9uIHJlbmRlclJhdygpeyQoJ2RldGFpbCcpLmlubmVySFRNTD1gPGRpdiBjbGFzcz0icGFuZWwiPjxoMz5SYXcgZXZpZGVuY2U8L2gzPjxwcm" +
            "U+JHtlc2MoSlNPTi5zdHJpbmdpZnkoc2VsZWN0ZWRSYXd8fHtzY29wZSxtb2RlfSxudWxsLDIpKX08L3ByZT48L2Rpdj5gO30KZnVuY3Rpb24g" +
            "bWVzc2FnZUdyaWQoKXtjb25zdCBtc2dzPVtbJ0luZm8nLCdGV0QgVHJlZScsJ1NlbGVjdCBhIERvY3VtZW50IG9yIFBhZ2UgdW5kZXIgUHJvY2" +
            "Vzc2VzIOKGkiBBQyB0byBpbnNwZWN0IGNvbmZpZ3VyYXRpb24uJ10sWydJbmZvJywnUnVsZSBUcmVlJywnU3RydWN0dXJhbCB0cmVlIHVzZXMg" +
            "Tm9kZUlkLCBQYXJlbnROb2RlSWQsIGFuZCBBY3Rpb25MaXN0SW5kZXggZnJvbSBwYWNrZWQgcnVsZS1saXN0IHBheWxvYWRzLiddLFsodHJlZU" +
            "RhdGEuRGlhZ25vc3RpY0NvdW50fHwwKT8nV2FybmluZyc6J0luZm8nLCdEaWFnbm9zdGljcycsYCR7Zm10KHRyZWVEYXRhLkRpYWdub3N0aWND" +
            "b3VudHx8MCl9IHN0cnVjdHVyYWwgZGlhZ25vc3RpY3MgwrcgJHtmbXQodHJlZURhdGEuTm9uUnVsZVRyZWVTY29wZUNvdW50fHwwKX0gbm9uLX" +
            "J1bGUgc2NvcGVzLmBdXTtyZXR1cm4gYDxkaXYgY2xhc3M9Im1lc3NhZ2UtZ3JpZCI+JHttc2dzLm1hcChtPT5gPGRpdiBjbGFzcz0ic2V2LSR7" +
            "bVswXS50b0xvd2VyQ2FzZSgpPT09J3dhcm5pbmcnPyd3YXJuJzptWzBdLnRvTG93ZXJDYXNlKCl9Ij4ke21bMF19PC9kaXY+PGRpdj4ke2VzYy" +
            "htWzFdKX08L2Rpdj48ZGl2PiR7ZXNjKG1bMl0pfTwvZGl2PmApLmpvaW4oJycpfTwvZGl2PmA7fQpmdW5jdGlvbiBwYXJhbUh0bWwocCl7Y29u" +
            "c3QgZW50cmllcz1PYmplY3QuZW50cmllcyhwfHx7fSkuZmlsdGVyKChbayx2XSk9PmFycih2KS5sZW5ndGgpO3JldHVybiBlbnRyaWVzLmxlbm" +
            "d0aD9lbnRyaWVzLm1hcCgoW2ssdl0pPT5gPGRpdiBjbGFzcz0ia3YiPjxkaXY+JHtlc2Moayl9PC9kaXY+PGRpdj4ke2Fycih2KS5tYXAoeD0+" +
            "YDxzcGFuIGNsYXNzPSJjaGlwIj4ke2VzYyh4KX08L3NwYW4+YCkuam9pbignJyl9PC9kaXY+PC9kaXY+YCkuam9pbignJyk6JzxzcGFuIGNsYX" +
            "NzPSJzdWJ0bGUiPk5vbmU8L3NwYW4+Jzt9CndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJyxlPT57aWYoZS5rZXk9PT0nLycmJiEv" +
            "aW5wdXR8c2VsZWN0fHRleHRhcmVhL2kudGVzdChkb2N1bWVudC5hY3RpdmVFbGVtZW50LnRhZ05hbWUpKXtlLnByZXZlbnREZWZhdWx0KCk7KG" +
            "1vZGU9PT0naGllcmFyY2h5Jz8kKCd0cmVlUScpOiQoJ3EnKSk/LmZvY3VzKCk7fWlmKGUuY3RybEtleSYmZS5zaGlmdEtleSYmZS5rZXkudG9M" +
            "b3dlckNhc2UoKT09PSdmJyl7ZS5wcmV2ZW50RGVmYXVsdCgpO2FkdmFuY2VkT3Blbj0hYWR2YW5jZWRPcGVuO3JlbmRlclRvb2xiYXIoKTt9aW" +
            "YobW9kZT09PSdoaWVyYXJjaHknJiZlLmtleT09PSdBcnJvd1JpZ2h0Jyl7ZG9jdW1lbnQucXVlcnlTZWxlY3RvcignLnRyZWUtbGluZTpob3Zl" +
            "ciAudHdpc3R5Jyk/LmNsaWNrKCk7fX0pOwppbml0KCk7Cjwvc2NyaXB0Pgo8L2JvZHk+CjwvaHRtbD4K";
        return Encoding.UTF8.GetString(Convert.FromBase64String(templateBase64));
    }

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
        string? term = string.IsNullOrWhiteSpace(options.Term) ? null : options.Term.Trim();
        string? scope = string.IsNullOrWhiteSpace(options.Scope) ? null : options.Scope.Trim();
        string? function = string.IsNullOrWhiteSpace(options.Function) ? null : options.Function.Trim();

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
        return !string.IsNullOrEmpty(value) && value.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0;
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
            pairs.Add((options.Page.Trim(), options.Variant.Trim()));
            return pairs;
        }

        if (!string.IsNullOrWhiteSpace(options.Page))
        {
            string page = options.Page.Trim();
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
                .Select(name => name.Trim())
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

                names.Add(name.Trim());
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
