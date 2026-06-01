using FormWorks.Core;
using rri.Base;
using rri.fwd;
using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;

namespace PullACRulesApp;

/// <summary>
/// Represents UDF shard export metadata.
/// </summary>
internal sealed class UdfFunctionExportInfo
{
    public string Container { get; set; }
    public string SafeName { get; set; }
    public int RowCount { get; set; }
    public string JsonFile { get; set; }
    public string MmdFile { get; set; }
    public string SvgFile { get; set; }
}

/// <summary>
/// Coordinates the set of global-resource export actions.
/// </summary>
internal sealed class GlobalResourceExportCoordinator
{
    private readonly Action exportSystemInfo;
    private readonly Action exportResourceTypeConfigs;
    private readonly Action exportResourceConfigs;
    private readonly Action exportResourcePrivateTrees;
    private readonly TextWriter output;

    public GlobalResourceExportCoordinator(
        TextWriter output,
        Action exportSystemInfo,
        Action exportResourceTypeConfigs,
        Action exportResourceConfigs,
        Action exportResourcePrivateTrees)
    {
        this.output = output ?? Console.Out;
        this.exportSystemInfo = exportSystemInfo ?? throw new ArgumentNullException(nameof(exportSystemInfo));
        this.exportResourceTypeConfigs = exportResourceTypeConfigs ?? throw new ArgumentNullException(nameof(exportResourceTypeConfigs));
        this.exportResourceConfigs = exportResourceConfigs ?? throw new ArgumentNullException(nameof(exportResourceConfigs));
        this.exportResourcePrivateTrees = exportResourcePrivateTrees ?? throw new ArgumentNullException(nameof(exportResourcePrivateTrees));
    }

    public void ExportAll()
    {
        TryRun(exportSystemInfo,            "[SystemInfo]",       "Error");
        TryRun(exportResourceTypeConfigs,   "[GlobalResources]",  "Error exporting resource type configs");
        TryRun(exportResourceConfigs,       "[GlobalResources]",  "Error exporting resource configs");
        TryRun(exportResourcePrivateTrees,  "[GlobalResources]",  "Error exporting resource private trees");
    }

    private void TryRun(Action step, string tag, string errorLabel)
    {
        try
        {
            step();
        }
        catch (Exception ex)
        {
            output.WriteLine("{0} {1}: {2}", tag, errorLabel, ex.Message);
        }
    }
}

/// <summary>
/// Builds export rows from attribute lists.
/// </summary>
internal sealed class RuleRowBuilder
{
    private readonly FieldListResolver fieldListResolver = new FieldListResolver();

    // Reusable per-row buffers — RuleRowBuilder is used single-threaded
    private readonly List<string> _colNames = new List<string>();
    private readonly List<object> _rowData = new List<object>();
    private readonly List<string> _paramList = new List<string>();
    private readonly List<string> _paramListOMR = new List<string>();
    private readonly List<KeyValuePair<string, string>> _entries = new List<KeyValuePair<string, string>>();
    private readonly HashSet<string> _seenOutputKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    public List<KeyValuePair<string, string>> GetSelectedEntries(AttrList attrs)
    {
        _entries.Clear();
        _seenOutputKeys.Clear();

        foreach (string key in attrs.Keys)
        {
            bool includeForDiagram = OutputFile.DiagramMode != OutputFile.DiagramFormat.None
                && (string.Equals(key, "_ActionNames", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(key, "ActionNames", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(key, "_ActionMap", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(key, "ActionMap", StringComparison.OrdinalIgnoreCase));

            if (!includeForDiagram && !OutputFile.ShouldIncludeAttribute(key))
                continue;

            string outputKey = OutputFile.NormalizeKey(key);
            if (string.IsNullOrWhiteSpace(outputKey))
                outputKey = key;

            string value = SafePrintAttr(attrs, key);
            if (string.IsNullOrWhiteSpace(value))
                continue;

            if (!_seenOutputKeys.Add(outputKey))
                continue;

            _entries.Add(new KeyValuePair<string, string>(key, value));
        }

        return _entries;
    }

    public void GetAttr(
        List<KeyValuePair<string, string>> entries,
        DataTable dt,
        int hierarchyLevel,
        string container,
        int nodeId,
        int parentNodeId,
        int actionListIndex,
        string nodeFieldNames,
        string inheritedFieldLists)
    {
        _colNames.Clear();
        _rowData.Clear();
        _paramList.Clear();
        _paramListOMR.Clear();

        EnsureColumnExists("NodeId", dt);
        _colNames.Add("NodeId");
        _rowData.Add(nodeId.ToString());

        EnsureColumnExists("ParentNodeId", dt);
        _colNames.Add("ParentNodeId");
        _rowData.Add(parentNodeId.ToString());

        EnsureColumnExists("ActionListIndex", dt);
        _colNames.Add("ActionListIndex");
        _rowData.Add(actionListIndex.ToString());

        EnsureColumnExists("Container", dt);
        _colNames.Add("Container");
        _rowData.Add(container);

        if (OutputFile.AttributeMode == OutputFile.AttrFilterMode.All)
        {
            EnsureColumnExists("HierarchyLevel", dt);
            _colNames.Add("HierarchyLevel");
            _rowData.Add(hierarchyLevel.ToString());
        }

        foreach (KeyValuePair<string, string> entry in entries)
        {
            string key = entry.Key;
            string value = entry.Value;

            string outputKey = OutputFile.NormalizeKey(key);

            EnsureColumnExists(outputKey, dt);
            _colNames.Add(outputKey);
            _rowData.Add(value);

            string normalizedParamKey = OutputFile.NormalizeParamKey(key);
            if (normalizedParamKey.StartsWith("P_", StringComparison.OrdinalIgnoreCase))
                _paramList.Add(normalizedParamKey);

            if (key.StartsWith("_P_", StringComparison.OrdinalIgnoreCase))
                _paramListOMR.Add(normalizedParamKey);
        }

        EnsureColumnExists("ParamList", dt);
        _colNames.Add("ParamList");
        _rowData.Add(string.Join(",", _paramList));

        EnsureColumnExists("ParamListOMR", dt);
        _colNames.Add("ParamListOMR");
        _rowData.Add(string.Join(",", _paramListOMR));

        EnsureColumnExists("NodeFieldNames", dt);
        _colNames.Add("NodeFieldNames");
        _rowData.Add(nodeFieldNames ?? string.Empty);

        EnsureColumnExists("InheritedFieldLists", dt);
        _colNames.Add("InheritedFieldLists");
        _rowData.Add(inheritedFieldLists ?? string.Empty);

        // Parse field lists once and resolve both param lists from the same map
        IDictionary<int, string> fieldMap = fieldListResolver.ParseFieldLists(inheritedFieldLists);

        EnsureColumnExists("ParamListResolved", dt);
        _colNames.Add("ParamListResolved");
        _rowData.Add(fieldListResolver.ResolveParamListFromMap(_paramList, fieldMap));

        EnsureColumnExists("ParamListOMRResolved", dt);
        _colNames.Add("ParamListOMRResolved");
        _rowData.Add(fieldListResolver.ResolveParamListFromMap(_paramListOMR, fieldMap));

        WriteRows(dt, _colNames, _rowData);
    }

    public static string SafePrintAttr(AttrList attrs, string key)
    {
        if (attrs == null || string.IsNullOrWhiteSpace(key))
            return string.Empty;

        try
        {
            return NormalizePrintedValue(attrs.Print(key));
        }
        catch
        {
            return string.Empty;
        }
    }

    private static string NormalizePrintedValue(string printedValue)
    {
        return string.IsNullOrWhiteSpace(printedValue) ? string.Empty : printedValue.Trim();
    }

    private static void EnsureColumnExists(string columnName, DataTable dt)
    {
        if (!dt.Columns.Contains(columnName))
            dt.Columns.Add(columnName, typeof(string));
    }

    private static void WriteRows(DataTable dt, IList<string> colNames, IList<object> rowData)
    {
        DataRow row = dt.NewRow();

        for (int i = 0; i < colNames.Count; i++)
            row[colNames[i]] = rowData[i] ?? string.Empty;

        dt.Rows.Add(row);
    }
}

/// <summary>
/// Parses FormWorks rule tree bytes into tabular rows.
/// </summary>
internal sealed class RuleTreeParser
{
    private readonly int maxHierarchyDepth;
    private readonly uint maxNodeEntryCount;
    private readonly Action<UnpackStream, DataTable, int, string, int, int, int> dumpAttrList;
    private TextWriter output;
    private int nodeCounter;

    internal TextWriter Output
    {
        set { output = value ?? Console.Out; }
    }

    public RuleTreeParser(
        int maxHierarchyDepth,
        uint maxNodeEntryCount,
        Action<UnpackStream, DataTable, int, string, int, int, int> dumpAttrList,
        TextWriter output = null)
    {
        this.maxHierarchyDepth = maxHierarchyDepth;
        this.maxNodeEntryCount = maxNodeEntryCount;
        this.dumpAttrList = dumpAttrList ?? throw new ArgumentNullException(nameof(dumpAttrList));
        this.output = output ?? Console.Out;
    }

    public void ProcessRuleBytes(byte[] data, string container, DataTable dt)
    {
        if (data == null || data.Length < 2)
            return;

        try
        {
            DumpRuleTree(new UnpackStream(data), dt, container);
        }
        catch (Exception ex)
        {
            output.WriteLine("[ProcessRuleBytes] Error processing '{0}': {1}", container, ex.Message);
        }
    }

    private void DumpRuleTree(UnpackStream ups, DataTable dt, string container)
    {
        int rootNodeId = ++nodeCounter;
        dumpAttrList(ups, dt, 0, container, -1, -1, rootNodeId);
        LoadList(ups, dt, 0, container, rootNodeId, -1);
    }

    private void LoadActionList(UnpackStream ups, DataTable dt, int hierarchyLevel, string container, int parentNodeId)
    {
        if (hierarchyLevel > maxHierarchyDepth)
        {
            throw new InvalidDataException(
                string.Format("Hierarchy depth {0} exceeds safety limit {1}.", hierarchyLevel, maxHierarchyDepth));
        }

        uint numSubList = PullACRulesHelpers.ReadCountWithGuard(ups, "Action sub-list", hierarchyLevel, maxNodeEntryCount);
        for (int i = 0; i < numSubList; i++)
            LoadList(ups, dt, hierarchyLevel + 1, container, parentNodeId, i);
    }

    private void LoadList(UnpackStream ups, DataTable dt, int hierarchyLevel, string container, int parentNodeId, int actionListIndex)
    {
        if (hierarchyLevel > maxHierarchyDepth)
        {
            throw new InvalidDataException(
                string.Format("Hierarchy depth {0} exceeds safety limit {1}.", hierarchyLevel, maxHierarchyDepth));
        }

        uint numRules = PullACRulesHelpers.ReadCountWithGuard(ups, "Rule", hierarchyLevel, maxNodeEntryCount);
        for (int i = 0; i < numRules; i++)
        {
            int nodeId = ++nodeCounter;
            dumpAttrList(ups, dt, hierarchyLevel, container, parentNodeId, actionListIndex, nodeId);
            LoadActionList(ups, dt, hierarchyLevel + 1, container, nodeId);
        }
    }
}

/// <summary>
/// Shared parsing helpers.
/// </summary>
internal static class PullACRulesHelpers
{
    public static uint ReadCountWithGuard(UnpackStream ups, string label, int hierarchyLevel, uint maxNodeEntryCount)
    {
        uint count = ups.ReadIntelUInt();
        if (count > maxNodeEntryCount)
        {
            throw new InvalidDataException(
                string.Format("{0} count {1} exceeds safety limit {2} at hierarchy level {3}.", label, count, maxNodeEntryCount, hierarchyLevel));
        }

        return count;
    }

    public static STCHandle RequireStcHandle(object node, string context)
    {
        STCHandle stcHandle = node as STCHandle;
        if (stcHandle == null)
            throw new InvalidOperationException(context + " did not return an STCHandle.");

        return stcHandle;
    }

    public static string[] ParseCsvArg(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return Array.Empty<string>();

        return value.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(segment => segment.Trim())
            .Where(segment => !string.IsNullOrWhiteSpace(segment))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    public static string SafePreview(string value, int maxLen)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        string trimmed = value.Trim();
        if (OutputFile.FullValueMode)
            return trimmed;

        return trimmed.Length <= maxLen ? trimmed : trimmed.Substring(0, maxLen) + "...";
    }

    public static string JoinLimited(IEnumerable<string> values, int maxCount)
    {
        if (values == null)
            return string.Empty;

        return string.Join(",", values.Where(value => !string.IsNullOrWhiteSpace(value)).Take(maxCount));
    }
}
