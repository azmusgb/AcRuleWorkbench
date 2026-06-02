using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Text;

namespace PullACRulesApp;

/// <summary>
/// Export and projection helpers for PullACRules.
/// </summary>
public partial class PullACRules
{
    private void FinalizeAndExportTable(DataTable dt, string binDir, string baseFileName)
    {
        string targetDir = !string.IsNullOrWhiteSpace(binDir) ? binDir : Path.GetTempPath();
        string outputPath = Path.Combine(targetDir, baseFileName + OutputFile.GetExtensionForCurrentFormat());
        int rowCount = dt != null ? dt.Rows.Count : 0;
        int columnCount = dt != null ? dt.Columns.Count : 0;
        PullACRulesRunPhase phase = ResolvePhaseFromExportName(baseFileName);

        Log("[Export] {0}: rows={1}, columns={2}", baseFileName, rowCount, columnCount);
        Log("[Export] Target file: {0}", outputPath);

        EmitRunEvent(
            phase,
            PullACRulesRunEventKind.Info,
            string.Format("Exporting {0} ({1} rows, {2} columns)", baseFileName, rowCount, columnCount));

        if (dt == null || dt.Rows.Count == 0)
        {
            Log("[Export] No data to export for {0}", baseFileName);
            EmitRunEvent(
                phase,
                PullACRulesRunEventKind.Warning,
                string.Format("No rows to export for {0}", baseFileName));
            return;
        }

        OutputFile.RemoveEmptyColumns(dt);
        OutputFile.Export(dt, targetDir, baseFileName);
        OutputFile.ExportDiagram(dt, targetDir, baseFileName);
        ExportRuleAstArtifacts(dt, targetDir, baseFileName);
        EmitRunArtifact(phase, baseFileName, outputPath, rowCount, columnCount);
    }

    private void ExportRuleAstArtifacts(DataTable dt, string targetDir, string baseFileName)
    {
        IReadOnlyList<RuleTree> trees = BuildRuleTreesFromTable(dt);
        if (trees == null || trees.Count == 0)
            return;

        PullACRulesRunPhase phase = ResolvePhaseFromExportName(baseFileName);

        string astBaseName = baseFileName + "_ast";
        string astJsonPath = Path.Combine(targetDir, astBaseName + ".json");

        Directory.CreateDirectory(targetDir);

        string astJson = JsonConvert.SerializeObject(trees, Formatting.Indented);
        File.WriteAllText(astJsonPath, astJson, Encoding.UTF8);
        EmitRunArtifact(phase, astBaseName, astJsonPath, trees.Count, trees.Sum(tree => tree != null ? tree.TotalNodeCount : 0));

        int totalNodes = trees.Sum(tree => tree != null ? tree.TotalNodeCount : 0);
        Log("[AST] Rule AST written to: {0} ({1} tree(s), {2} node(s))", astJsonPath, trees.Count, totalNodes);
        EmitRunEvent(
            phase,
            PullACRulesRunEventKind.Info,
            string.Format("AST written for {0} ({1} trees, {2} nodes)", baseFileName, trees.Count, totalNodes));

        OutputFile.DiagramFormat astDiagramMode = OutputFile.GetEffectiveAstDiagramMode();
        if (astDiagramMode == OutputFile.DiagramFormat.None)
            return;

        string astMmd = RuleAstJsonMermaidPipeline.TreesToMermaid(trees, includeReferences: true, includeStyles: true);
        if (string.IsNullOrWhiteSpace(astMmd))
            return;

        string astMmdPath = MermaidRenderer.WriteMmd(astMmd, targetDir, astBaseName, output);
        EmitRunArtifact(phase, astBaseName + "_diagram", astMmdPath, trees.Count, totalNodes);

        if (astDiagramMode == OutputFile.DiagramFormat.Svg)
            OutputFile.QueueSvgRender(astMmdPath);
    }

    private static IReadOnlyList<RuleTree> BuildRuleTreesFromTable(DataTable dt)
    {
        if (dt == null
            || !dt.Columns.Contains(RuleSchema.Columns.NodeId)
            || !dt.Columns.Contains(RuleSchema.Columns.ParentNodeId)
            || !dt.Columns.Contains(RuleSchema.Columns.ActionListIndex))
        {
            return Array.Empty<RuleTree>();
        }

        var collector = new RuleNodeCollector();

        foreach (DataRow row in dt.Rows)
        {
            int nodeId;
            if (!TryGetInt(row, RuleSchema.Columns.NodeId, out nodeId))
                continue;

            int parentNodeId;
            if (!TryGetInt(row, RuleSchema.Columns.ParentNodeId, out parentNodeId))
                parentNodeId = -1;

            int actionListIndex;
            if (!TryGetInt(row, RuleSchema.Columns.ActionListIndex, out actionListIndex))
                actionListIndex = -1;

            int hierarchyLevel;
            if (!TryGetInt(row, RuleSchema.Columns.HierarchyLevel, out hierarchyLevel))
                hierarchyLevel = -1;

            string container = GetString(row, RuleSchema.Columns.Container);
            var attributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

            foreach (DataColumn column in dt.Columns)
            {
                string colName = column.ColumnName;
                if (string.Equals(colName, RuleSchema.Columns.NodeId, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(colName, RuleSchema.Columns.ParentNodeId, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(colName, RuleSchema.Columns.ActionListIndex, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(colName, RuleSchema.Columns.HierarchyLevel, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(colName, RuleSchema.Columns.Container, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                string value = GetString(row, colName);
                if (!string.IsNullOrWhiteSpace(value))
                    attributes[colName] = value;
            }

            collector.AddNode(nodeId, parentNodeId, actionListIndex, hierarchyLevel, container, attributes);
        }

        return collector.BuildTrees();
    }

    private static bool TryGetInt(DataRow row, string columnName, out int value)
    {
        value = -1;
        if (row == null || row.Table == null || !row.Table.Columns.Contains(columnName))
            return false;

        return int.TryParse(GetString(row, columnName), out value);
    }

    private static string GetString(DataRow row, string columnName)
    {
        if (row == null || row.Table == null || !row.Table.Columns.Contains(columnName))
            return string.Empty;

        return Convert.ToString(row[columnName] ?? string.Empty).Trim();
    }

    private List<UdfFunctionExportInfo> ExportPerFunctionRuleTables(DataTable dt, string binDir)
    {
        var exports = new List<UdfFunctionExportInfo>();
        if (dt == null || dt.Rows.Count == 0 || !dt.Columns.Contains("Container"))
            return exports;

        string[] containers = dt.AsEnumerable()
            .Select(row => Convert.ToString(row["Container"]))
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        var usedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (string container in containers)
        {
            DataTable functionTable = dt.Clone();
            foreach (DataRow row in dt.AsEnumerable().Where(r => string.Equals(Convert.ToString(r["Container"]).Trim(), container, StringComparison.OrdinalIgnoreCase)))
                functionTable.ImportRow(row);

            if (functionTable.Rows.Count == 0)
                continue;

            string safeName = BuildUniqueSafeFileNameSegment(container, usedNames);
            string baseName = "UDF_Rules_" + safeName;
            FinalizeAndExportTable(functionTable, binDir, baseName);

            exports.Add(new UdfFunctionExportInfo
            {
                Container = container,
                SafeName = safeName,
                RowCount = functionTable.Rows.Count,
                JsonFile = baseName + ".json",
                MmdFile = baseName + ".mmd",
                SvgFile = baseName + ".svg"
            });
        }

        return exports;
    }

    private void ExportUdfFunctionIndex(IList<UdfFunctionExportInfo> shards, string binDir)
    {
        Directory.CreateDirectory(binDir ?? Path.GetTempPath());
        string fullPath = Path.Combine(binDir ?? Path.GetTempPath(), "UDF_Rules_Index.json");

        using (var fs = new FileStream(fullPath, FileMode.Create, FileAccess.Write, FileShare.None, OutputFile.IOBufferSize))
        using (var sw = new StreamWriter(fs, Encoding.UTF8, OutputFile.IOBufferSize))
        using (var jw = new JsonTextWriter(sw))
        {
            jw.Formatting = Formatting.Indented;
            OutputFile._defaultSerializer.Serialize(jw, shards ?? new List<UdfFunctionExportInfo>());
        }

        Log("[Export] UDF shard index written to: {0}", fullPath);
    }

    private static string BuildUniqueSafeFileNameSegment(string value, HashSet<string> usedNames)
    {
        return FileNameSanitizer.MakeUnique(value, usedNames);
    }
}
