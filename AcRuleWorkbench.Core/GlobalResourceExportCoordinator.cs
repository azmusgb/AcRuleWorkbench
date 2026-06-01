using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json;

namespace AcRuleWorkbench.Core;

public sealed class GlobalResourceExportCoordinator
{
    public ResourceExportResult Export(
        string outputDirectory,
        FwdInspectionReport fwd,
        AcRelationshipReport? relationships = null)
    {
        if (string.IsNullOrWhiteSpace(outputDirectory))
            throw new ArgumentException("Output directory is required.", nameof(outputDirectory));
        if (fwd == null)
            throw new ArgumentNullException(nameof(fwd));

        Directory.CreateDirectory(outputDirectory);

        string resourcesDir = Path.Combine(outputDirectory, "resources");
        string diagnosticsDir = Path.Combine(outputDirectory, "diagnostics");
        string refsDir = Path.Combine(outputDirectory, "references");
        string privateDir = Path.Combine(outputDirectory, "private-stc");
        string tablesDir = Path.Combine(outputDirectory, "tables");

        Directory.CreateDirectory(resourcesDir);
        Directory.CreateDirectory(diagnosticsDir);
        Directory.CreateDirectory(refsDir);
        Directory.CreateDirectory(privateDir);
        Directory.CreateDirectory(tablesDir);

        var result = new ResourceExportResult { OutputDirectory = Path.GetFullPath(outputDirectory) };

        WriteManifest(outputDirectory, fwd);
        WriteResourceInventory(outputDirectory, fwd);
        WriteTableResources(tablesDir, fwd);
        WriteDateFormats(resourcesDir, fwd);
        WriteUdfResources(resourcesDir, fwd);
        WriteDependencies(refsDir, fwd, relationships);
        WriteDiagnostics(diagnosticsDir, fwd, relationships);
        WritePrivateTrees(privateDir, fwd);

        result.WrittenFiles.AddRange(Directory.GetFiles(outputDirectory, "*", SearchOption.AllDirectories));
        return result;
    }

    private static void WriteManifest(string root, FwdInspectionReport fwd)
    {
        var manifest = new
        {
            schema = "AcWorkbench.GlobalResourceManifest",
            generatedAtUtc = DateTime.UtcNow,
            source = new
            {
                path = fwd.Path,
                release = fwd.ReleaseString,
                releaseDate = fwd.ReleaseDateString,
                releaseNumber = fwd.ReleaseNumber
            },
            counts = new
            {
                resourceTypes = fwd.ResourceTypeDetails.Count,
                resources = fwd.ResourceTypeDetails.Sum(r => r.Resources.Count),
                privateTrees = fwd.ResourceTypeDetails.Sum(r => r.Resources.Count(x => x.PrivateTree != null)),
                dependencies = fwd.ResourceDependencies.Count
            }
        };

        File.WriteAllText(Path.Combine(root, "manifest.json"), JsonConvert.SerializeObject(manifest, Formatting.Indented));
    }

    private static void WriteResourceInventory(string root, FwdInspectionReport fwd)
    {
        var rows = fwd.ResourceTypeDetails
            .SelectMany(rt => rt.Resources.Select(r => new
            {
                ResourceType = rt.Type,
                ResourceName = r.Name,
                Category = r.Category,
                HasPublicConfig = r.PublicAttributes.Count > 0,
                HasFullConfig = r.FullAttributes.Count > 0,
                HasPrivateNode = r.PrivateTree != null,
                PrivateChildCount = r.PrivateTree?.Children.Count ?? 0,
                Warnings = string.Join(" | ", r.Warnings)
            }))
            .ToList();

        File.WriteAllText(Path.Combine(root, "ResourceInventory.json"), JsonConvert.SerializeObject(rows, Formatting.Indented));
        WriteCsv(Path.Combine(root, "ResourceInventory.csv"), rows.Select(r => new Dictionary<string, string>
        {
            ["ResourceType"] = r.ResourceType,
            ["ResourceName"] = r.ResourceName,
            ["Category"] = r.Category,
            ["HasPublicConfig"] = r.HasPublicConfig ? "true" : "false",
            ["HasFullConfig"] = r.HasFullConfig ? "true" : "false",
            ["HasPrivateNode"] = r.HasPrivateNode ? "true" : "false",
            ["PrivateChildCount"] = r.PrivateChildCount.ToString(),
            ["Warnings"] = r.Warnings
        }));
    }

    private static void WriteTableResources(string tablesDir, FwdInspectionReport fwd)
    {
        var tables = fwd.ResourceTypeDetails
            .Where(rt => ContainsIgnoreCase(rt.Type, "table") || ContainsIgnoreCase(rt.Type, "selection"))
            .SelectMany(rt => rt.Resources.Select(r => new
            {
                ResourceType = rt.Type,
                ResourceName = r.Name,
                SourceKind = GuessSourceKind(r),
                SourceReference = GuessSourceReference(r),
                Columns = GuessColumns(r).ToList(),
                UsedByRuleCount = fwd.ResourceDependencies.Count(d => string.Equals(d.ResourceType, rt.Type, StringComparison.OrdinalIgnoreCase) && string.Equals(d.ResourceName, r.Name, StringComparison.OrdinalIgnoreCase))
            }))
            .ToList();

        File.WriteAllText(Path.Combine(tablesDir, "TableResources.json"), JsonConvert.SerializeObject(tables, Formatting.Indented));
        WriteCsv(Path.Combine(tablesDir, "TableResources.csv"), tables.Select(t => new Dictionary<string, string>
        {
            ["ResourceType"] = t.ResourceType,
            ["ResourceName"] = t.ResourceName,
            ["SourceKind"] = t.SourceKind,
            ["SourceReference"] = t.SourceReference,
            ["ColumnCount"] = t.Columns.Count.ToString(),
            ["Columns"] = string.Join(";", t.Columns),
            ["UsedByRuleCount"] = t.UsedByRuleCount.ToString()
        }));

        var externalSources = tables.Select(t => new
        {
            t.ResourceName,
            t.SourceKind,
            t.SourceReference,
            MissingExternalSource = t.SourceKind != "Embedded" && string.IsNullOrWhiteSpace(t.SourceReference)
        }).ToList();

        File.WriteAllText(Path.Combine(tablesDir, "ExternalTableSources.csv"), CsvFromDictionaries(externalSources.Select(x => new Dictionary<string, string>
        {
            ["ResourceName"] = x.ResourceName,
            ["SourceKind"] = x.SourceKind,
            ["SourceReference"] = x.SourceReference,
            ["MissingExternalSource"] = x.MissingExternalSource ? "true" : "false"
        })));
    }

    private static void WriteDateFormats(string resourcesDir, FwdInspectionReport fwd)
    {
        var dateFormats = fwd.ResourceTypeDetails
            .Where(rt => ContainsIgnoreCase(rt.Type, "date"))
            .SelectMany(rt => rt.Resources)
            .Select(r => new
            {
                r.Type,
                r.Name,
                Config = MergeAttrs(r)
            })
            .ToList();

        File.WriteAllText(Path.Combine(resourcesDir, "DateFormats.json"), JsonConvert.SerializeObject(dateFormats, Formatting.Indented));
    }

    private static void WriteUdfResources(string resourcesDir, FwdInspectionReport fwd)
    {
        var udfs = fwd.ResourceTypeDetails
            .Where(rt => ContainsIgnoreCase(rt.Type, "udf") || ContainsIgnoreCase(rt.Type, "function"))
            .SelectMany(rt => rt.Resources)
            .Select(r => new
            {
                r.Type,
                r.Name,
                Interface = MergeAttrs(r),
                PrivateTree = r.PrivateTree
            })
            .ToList();

        File.WriteAllText(Path.Combine(resourcesDir, "UdfResources.json"), JsonConvert.SerializeObject(udfs, Formatting.Indented));
    }

    private static void WriteDependencies(string refsDir, FwdInspectionReport fwd, AcRelationshipReport? relationships)
    {
        File.WriteAllText(Path.Combine(refsDir, "ResourceDependencyGraph.json"), JsonConvert.SerializeObject(fwd.ResourceDependencies, Formatting.Indented));

        if (relationships == null)
            return;

        var missing = relationships.Relationships
            .Where(r => !string.IsNullOrWhiteSpace(r.Target))
            .Where(r => !fwd.ResourceTypeDetails.SelectMany(rt => rt.Resources).Any(x => string.Equals(x.Name, r.Target, StringComparison.OrdinalIgnoreCase)))
            .Select(r => new
            {
                r.ScopePath,
                r.RuleIndex,
                r.RuleGuid,
                r.RuleName,
                r.FunctionName,
                r.TargetType,
                r.Target,
                r.Kind
            })
            .ToList();

        File.WriteAllText(Path.Combine(refsDir, "MissingResourceReferences.csv"), CsvFromDictionaries(missing.Select(m => new Dictionary<string, string>
        {
            ["ScopePath"] = m.ScopePath,
            ["RuleIndex"] = m.RuleIndex.ToString(),
            ["RuleGuid"] = m.RuleGuid ?? string.Empty,
            ["RuleName"] = m.RuleName ?? string.Empty,
            ["FunctionName"] = m.FunctionName ?? string.Empty,
            ["TargetType"] = m.TargetType,
            ["Target"] = m.Target,
            ["Kind"] = m.Kind
        })));
    }

    private static void WriteDiagnostics(string diagnosticsDir, FwdInspectionReport fwd, AcRelationshipReport? relationships)
    {
        var warnings = new List<string>();
        warnings.AddRange(fwd.Warnings);
        if (relationships != null)
            warnings.AddRange(relationships.Warnings);

        File.WriteAllText(Path.Combine(diagnosticsDir, "warnings.json"), JsonConvert.SerializeObject(warnings, Formatting.Indented));
    }

    private static void WritePrivateTrees(string privateDir, FwdInspectionReport fwd)
    {
        var all = fwd.ResourceTypeDetails
            .SelectMany(rt => rt.Resources.Where(r => r.PrivateTree != null).Select(r => new
            {
                rt.Type,
                r.Name,
                Tree = r.PrivateTree
            }))
            .ToList();

        File.WriteAllText(Path.Combine(privateDir, "PrivateStcTree.json"), JsonConvert.SerializeObject(all, Formatting.Indented));
    }

    private static Dictionary<string, string> MergeAttrs(ResourceDetail resource)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (ResourceAttrEntry entry in resource.FullAttributes)
            map[entry.Key] = entry.Value;
        foreach (ResourceAttrEntry entry in resource.PublicAttributes)
            map[entry.Key] = entry.Value;
        return map;
    }

    private static IEnumerable<string> GuessColumns(ResourceDetail resource)
    {
        var attrs = resource.FullAttributes.Concat(resource.PublicAttributes).ToList();
        return attrs
            .Where(a => ContainsIgnoreCase(a.Key, "column") || ContainsIgnoreCase(a.Key, "field"))
            .Select(a => a.Value)
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(200);
    }

    private static string GuessSourceKind(ResourceDetail resource)
    {
        var values = resource.FullAttributes.Concat(resource.PublicAttributes).Select(a => a.Value).ToList();
        if (values.Any(v => ContainsIgnoreCase(v, "odbc") || ContainsIgnoreCase(v, "dsn"))) return "ODBC";
        if (values.Any(v => ContainsIgnoreCase(v, "indexed") || ContainsIgnoreCase(v, ".idx") || ContainsIgnoreCase(v, ".dat"))) return "IndexedFile";
        if (values.Any(v => ContainsIgnoreCase(v, "table") || ContainsIgnoreCase(v, "query"))) return "ExternalTable";
        return resource.PrivateTree == null ? "Unknown" : "Embedded";
    }

    private static string GuessSourceReference(ResourceDetail resource)
    {
        ResourceAttrEntry? match = resource.FullAttributes.Concat(resource.PublicAttributes)
            .FirstOrDefault(a => ContainsIgnoreCase(a.Key, "dsn")
                              || ContainsIgnoreCase(a.Key, "path")
                              || ContainsIgnoreCase(a.Key, "file")
                              || ContainsIgnoreCase(a.Key, "query")
                              || ContainsIgnoreCase(a.Key, "table"));
        return match?.Value ?? string.Empty;
    }

    private static void WriteCsv(string path, IEnumerable<Dictionary<string, string>> rows)
    {
        File.WriteAllText(path, CsvFromDictionaries(rows));
    }

    private static string CsvFromDictionaries(IEnumerable<Dictionary<string, string>> rows)
    {
        List<Dictionary<string, string>> list = rows.ToList();
        if (list.Count == 0) return string.Empty;

        List<string> headers = list.SelectMany(r => r.Keys).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var sb = new StringBuilder();
        sb.AppendLine(string.Join(",", headers.Select(EscapeCsv)));

        foreach (Dictionary<string, string> row in list)
            sb.AppendLine(string.Join(",", headers.Select(h => EscapeCsv(row.TryGetValue(h, out string? value) ? value : string.Empty))));

        return sb.ToString();
    }

    private static string EscapeCsv(string? value)
    {
        string text = value ?? string.Empty;
        if (text.Contains("\"") || text.Contains(",") || text.Contains("\n") || text.Contains("\r"))
            return "\"" + text.Replace("\"", "\"\"") + "\"";
        return text;
    }

    private static bool ContainsIgnoreCase(string? value, string term)
    {
        return !string.IsNullOrWhiteSpace(value)
            && value.IndexOf(term, StringComparison.OrdinalIgnoreCase) >= 0;
    }
}

public sealed class ResourceExportResult
{
    public string OutputDirectory { get; set; } = string.Empty;

    public List<string> WrittenFiles { get; } = new List<string>();
}
