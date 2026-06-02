using FormWorks.Core;
using rri.Base;
using rri.fwd;
using rri.fwd.Wrapper;
using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;

namespace PullACRulesApp;

/// <summary>
/// Extraction and resource traversal methods for PullACRules.
/// </summary>
public partial class PullACRules
{
    private void DumpAttrList(UnpackStream ups, DataTable dt, int hierarchyLevel, string container, int parentNodeId, int actionListIndex, int nodeId)
    {
        uint len = ups.ReadIntelUInt();
        if (len <= 2)
        {
            if (len > 0 && probeMode)
                Log("[DumpAttrList] Skipping attribute list - len={0} (too small)", len);

            return;
        }

        if (len > PullACRulesConstants.AttrList.MaxPayloadBytes)
        {
            throw new InvalidDataException(
                string.Format("Attribute list length {0} exceeds safety limit {1}.", len, PullACRulesConstants.AttrList.MaxPayloadBytes));
        }

        byte[] payload = ups.ReadBytes((int)len);
        CaptureAttrListPayloadIfRequested(payload);

        using (var attrs = new AttrList(payload))
        {
            string nodeFieldNames = SafePrintAttr(attrs, "_FieldNames");
            if (string.IsNullOrWhiteSpace(nodeFieldNames))
                nodeFieldNames = SafePrintAttr(attrs, "FieldNames");

            string nodeFieldLists = SafePrintAttr(attrs, "_FieldLists");
            if (string.IsNullOrWhiteSpace(nodeFieldLists))
                nodeFieldLists = SafePrintAttr(attrs, "FieldLists");

            if (!string.IsNullOrWhiteSpace(container) && !string.IsNullOrWhiteSpace(nodeFieldLists))
                containerFieldListsByContainer[container] = nodeFieldLists;

            string inheritedFieldLists = ResolveInheritedFieldLists(container, nodeFieldLists);

            List<KeyValuePair<string, string>> entries = ruleRowBuilder.GetSelectedEntries(attrs);
            TrackSeenKeysIfProbeMode(entries);

            bool emit = ContainsKey(entries, "_RuleGUID") || HasAlternateIdentifiers(entries) || (probeMode && entries.Count > 0);
            if (!emit)
                return;

            ruleRowBuilder.GetAttr(
                entries,
                dt,
                hierarchyLevel,
                container,
                nodeId,
                parentNodeId,
                actionListIndex,
                nodeFieldNames,
                inheritedFieldLists);
        }
    }

    private void CaptureAttrListPayloadIfRequested(byte[] payload)
    {
        if (!captureAttrListPayload || attrListPayloadCaptured || payload == null)
            return;

        try
        {
            string capturePath = !string.IsNullOrWhiteSpace(captureAttrListPath)
                ? captureAttrListPath
                : Path.Combine(OutputFile.BinDir ?? Path.GetTempPath(), "captured_attrlist.bin");

            string captureDir = Path.GetDirectoryName(capturePath);
            if (!string.IsNullOrWhiteSpace(captureDir))
                Directory.CreateDirectory(captureDir);

            File.WriteAllBytes(capturePath, payload);
            attrListPayloadCaptured = true;
            Log("[AttrListCapture] Wrote payload to: {0}", capturePath);
        }
        catch (Exception ex)
        {
            Log("[AttrListCapture] Failed to write payload: {0}", ex.Message);
        }
    }

    private string ResolveInheritedFieldLists(string container, string nodeFieldLists)
    {
        string inheritedFieldLists = nodeFieldLists;
        if (!string.IsNullOrWhiteSpace(inheritedFieldLists) || string.IsNullOrWhiteSpace(container))
            return inheritedFieldLists;

        string cached;
        return containerFieldListsByContainer.TryGetValue(container, out cached) ? cached : inheritedFieldLists;
    }

    private void TrackSeenKeysIfProbeMode(List<KeyValuePair<string, string>> entries)
    {
        if (!probeMode || entries == null)
            return;

        foreach (KeyValuePair<string, string> entry in entries)
            allSeenKeys.Add(OutputFile.NormalizeKey(entry.Key));
    }

    private static bool ContainsKey(List<KeyValuePair<string, string>> entries, string key)
    {
        foreach (KeyValuePair<string, string> entry in entries)
            if (string.Equals(entry.Key, key, StringComparison.OrdinalIgnoreCase))
                return true;
        return false;
    }

    private static bool HasAlternateIdentifiers(List<KeyValuePair<string, string>> entries)
    {
        bool hasRuleCounter = false, hasFieldNames = false, hasObjectName = false, hasObjectType = false;
        bool hasActionNames = false, hasActionMap = false, hasFunctionName = false;

        foreach (KeyValuePair<string, string> entry in entries)
        {
            string k = entry.Key;
            if (string.Equals(k, "_RuleCounter", StringComparison.OrdinalIgnoreCase)) hasRuleCounter = true;
            else if (string.Equals(k, "_FieldNames", StringComparison.OrdinalIgnoreCase)) hasFieldNames = true;
            else if (string.Equals(k, "_ObjectName", StringComparison.OrdinalIgnoreCase)) hasObjectName = true;
            else if (string.Equals(k, "_ObjectType", StringComparison.OrdinalIgnoreCase)) hasObjectType = true;
            else if (string.Equals(k, "_ActionNames", StringComparison.OrdinalIgnoreCase)) hasActionNames = true;
            else if (string.Equals(k, "_ActionMap", StringComparison.OrdinalIgnoreCase)) hasActionMap = true;
            else if (string.Equals(k, "_FunctionName", StringComparison.OrdinalIgnoreCase)) hasFunctionName = true;
        }

        return (hasRuleCounter && hasFieldNames)
            || (hasObjectName && hasObjectType)
            || hasActionNames
            || hasActionMap
            || hasFunctionName;
    }

    private void ExecuteExtraction(Fwd fwd)
    {
        if (fwd == null)
            throw new ArgumentNullException(nameof(fwd));

        string[] allACRuleLists = fwd.GetResourceNames(PullACRulesConstants.ResourceTypes.ACRuleList);
        string[] allPageNames = fwd.GetPageNames();
        string[] allFunctions = fwd.GetResourceNames(PullACRulesConstants.ResourceTypes.Function);
        string[] allTableNames = fwd.GetResourceNames(PullACRulesConstants.ResourceTypes.Table);

        EmitRunEvent(
            PullACRulesRunPhase.ACRuleList,
            PullACRulesRunEventKind.Info,
            string.Format("Discovered {0} AC rule list(s)", allACRuleLists != null ? allACRuleLists.Length : 0));
        EmitRunEvent(
            PullACRulesRunPhase.PageRules,
            PullACRulesRunEventKind.Info,
            string.Format("Discovered {0} page(s)", allPageNames != null ? allPageNames.Length : 0));
        EmitRunEvent(
            PullACRulesRunPhase.UdfRules,
            PullACRulesRunEventKind.Info,
            string.Format("Discovered {0} function(s)", allFunctions != null ? allFunctions.Length : 0));
        EmitRunEvent(
            PullACRulesRunPhase.TableInfo,
            PullACRulesRunEventKind.Info,
            string.Format("Discovered {0} table(s)", allTableNames != null ? allTableNames.Length : 0));

        if (includeGlobalResourceExports)
        {
            EmitRunEvent(PullACRulesRunPhase.SystemInfo, PullACRulesRunEventKind.Info, "Starting global resource exports");
            CreateGlobalResourceExportCoordinator(fwd).ExportAll();
        }

        GetACRuleListInfo(fwd, allACRuleLists);
        DataTable pageRulesTable = GetPageRules(fwd, allPageNames);
        GetFunctionInfo(fwd, allFunctions);
        GetTableInfo(fwd, allTableNames);

        // Semantic layer: page variant inventory, field catalog, rule field resolution
        GetPageVariantInventory(fwd, allPageNames);
        Dictionary<string, FieldCatalogEntry> fieldCatalog = GetFieldCatalog(fwd, allPageNames);
        GetRuleFieldResolution(pageRulesTable, fieldCatalog, "PageRules");
    }

    private GlobalResourceExportCoordinator CreateGlobalResourceExportCoordinator(Fwd fwd)
    {
        return new GlobalResourceExportCoordinator(
            output,
            delegate { GetSystemInfo(fwd); },
            delegate { GetGlobalResourceTypeConfigs(fwd, configuredGlobalResourceTypes); },
            delegate { GetGlobalResourceConfigs(fwd, configuredGlobalResourceTypes); },
            delegate { GetGlobalResourcePrivateTree(fwd, configuredGlobalResourceTypes); });
    }

    private void GetACRuleListInfo(Fwd fwd, string[] allACRuleLists)
    {
        const string typeName = "ACRuleList";
        string binDir = OutputFile.BinDir;
        var dt = new DataTable();

        foreach (string listName in allACRuleLists ?? Array.Empty<string>())
        {
            try
            {
                using (var nodeObj = fwd.GetResourceNodePrivate(typeName, listName))
                {
                    STCHandle stcHandle = nodeObj as STCHandle;
                    if (stcHandle == null)
                        continue;

                    if (stcHandle.IsCollection)
                    {
                        foreach (string childName in stcHandle.ChildNames ?? Array.Empty<string>())
                        {
                            using (STCHandle child = stcHandle.GetChildHandle(childName, false))
                                ruleTreeParser.ProcessRuleBytes(child.Data, listName + "/" + childName, dt);
                        }
                    }
                    else
                    {
                        ruleTreeParser.ProcessRuleBytes(stcHandle.Data, listName, dt);
                    }
                }
            }
            catch (Exception ex)
            {
                Log("[ACRuleList] Error processing '{0}': {1}", listName, ex.Message);
            }
        }

        FinalizeAndExportTable(dt, binDir, "ACRuleList_Rules");
    }

    private DataTable GetPageRules(Fwd fwd, string[] allPageNames)
    {
        string binDir = OutputFile.BinDir;
        var dt = new DataTable();

        try
        {
            string processName = ResolveAcProcessName(fwd);
            using (var processNodeObj = fwd.GetProcessNodePrivate(processName))
            {
                STCHandle processNode = PullACRulesHelpers.RequireStcHandle(processNodeObj, "GetProcessNodePrivate(AC)");
                if (!processNode.HasChild(PullACRulesConstants.ChildNodes.Pages))
                {
                    Log("[PageRules] Missing '{0}' child under AC process.", PullACRulesConstants.ChildNodes.Pages);
                    EmitRunEvent(
                        PullACRulesRunPhase.PageRules,
                        PullACRulesRunEventKind.Warning,
                        "Pages child node missing under AC process",
                        PullACRulesRunIssueCategory.MissingNode);

                    FinalizeAndExportTable(dt, binDir, "Page_Rules");
                    return dt;
                }

                using (STCHandle pagesNode = processNode.GetChildHandle(PullACRulesConstants.ChildNodes.Pages, false))
                {
                    foreach (string pageName in allPageNames ?? Array.Empty<string>())
                    {
                        try
                        {
                            if (!pagesNode.HasChild(pageName))
                                continue;

                            using (STCHandle pageNode = pagesNode.GetChildHandle(pageName, false))
                                ruleTreeParser.ProcessRuleBytes(pageNode.Data, pageName, dt);
                        }
                        catch (Exception ex)
                        {
                            Log("[PageRules] Error processing page '{0}': {1}", pageName, ex.Message);
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            Log("[PageRules] Error accessing AC process/page tree: {0}", ex.Message);
            EmitRunEvent(
                PullACRulesRunPhase.PageRules,
                PullACRulesRunEventKind.Error,
                ex.Message,
                PullACRulesRunIssueCategory.MissingNode);
        }

        FinalizeAndExportTable(dt, binDir, "Page_Rules");
        return dt;
    }

    private void GetFunctionInfo(Fwd fwd, string[] allFunctions)
    {
        string binDir = OutputFile.BinDir;
        var dt = new DataTable();
        int functionCount = allFunctions != null ? allFunctions.Length : 0;
        int processedCount = 0;
        int fallbackCount = 0;

        foreach (string funcName in allFunctions ?? Array.Empty<string>())
        {
            try
            {
                using (var nodeObj = fwd.GetResourceNodePrivate(PullACRulesConstants.ResourceTypes.Function, funcName))
                {
                    STCHandle node = nodeObj as STCHandle;
                    if (node == null)
                        continue;

                    if (node.HasChild(PullACRulesConstants.ChildNodes.FunctionInfo))
                    {
                        using (STCHandle infoNode = node.GetChildHandle(PullACRulesConstants.ChildNodes.FunctionInfo, false))
                        {
                            ruleTreeParser.ProcessRuleBytes(infoNode.Data, funcName, dt);
                            processedCount++;
                        }
                    }
                    else if (node.IsCollection)
                    {
                        foreach (string childName in node.ChildNames ?? Array.Empty<string>())
                        {
                            using (STCHandle child = node.GetChildHandle(childName, false))
                                ruleTreeParser.ProcessRuleBytes(child.Data, funcName + "/" + childName, dt);
                        }

                        processedCount++;
                        fallbackCount++;
                    }
                    else
                    {
                        ruleTreeParser.ProcessRuleBytes(node.Data, funcName, dt);
                        processedCount++;
                        fallbackCount++;
                    }
                }
            }
            catch (Exception ex)
            {
                Log("[FunctionInfo] Error processing function '{0}': {1}", funcName, ex.Message);
            }
        }

        Log("[FunctionInfo] {0} function(s) found, {1} processed ({2} via fallback)", functionCount, processedCount, fallbackCount);

        if (fallbackCount > 0)
        {
            EmitRunEvent(
                PullACRulesRunPhase.UdfRules,
                PullACRulesRunEventKind.Warning,
                string.Format("{0} function(s) required fallback parse path", fallbackCount),
                PullACRulesRunIssueCategory.FallbackParse);
        }

        var originalFormat = OutputFile.Format;
        try
        {
            OutputFile.Format = OutputFile.ExportFormat.Json;
            FinalizeAndExportTable(dt, binDir, "UDF_Rules");

            List<UdfFunctionExportInfo> shards = ExportPerFunctionRuleTables(dt, binDir);
            ExportUdfFunctionIndex(shards, binDir);
        }
        finally
        {
            OutputFile.Format = originalFormat;
        }
    }

    private void GetTableInfo(Fwd fwd, string[] allTableNames)
    {
        string binDir = OutputFile.BinDir;
        var dt = new DataTable();
        dt.Columns.Add("TableName", typeof(string));
        dt.Columns.Add("TableDriver", typeof(string));
        dt.Columns.Add("FileName", typeof(string));
        dt.Columns.Add("ConnectionString", typeof(string));
        dt.Columns.Add("SQLTableName", typeof(string));
        dt.Columns.Add("KeyFields", typeof(string));
        dt.Columns.Add("CacheMode", typeof(string));
        dt.Columns.Add("ReadOnly", typeof(string));
        dt.Columns.Add("FieldCount", typeof(int));
        dt.Columns.Add("AllAttributes", typeof(string));

        foreach (string name in allTableNames ?? Array.Empty<string>())
        {
            try
            {
                using (var nodeObj = fwd.GetResourceNodePrivate(PullACRulesConstants.ResourceTypes.Table, name))
                {
                    STCHandle node = PullACRulesHelpers.RequireStcHandle(nodeObj, "GetResourceNodePrivate(Table)");
                    if (!node.HasChild(PullACRulesConstants.ChildNodes.TableInfo))
                        continue;

                    using (AttrList attrs = node.LoadAttrList(PullACRulesConstants.ChildNodes.TableInfo))
                    {
                        DataRow row = dt.NewRow();
                        row["TableName"] = name;
                        row["TableDriver"] = SafePrintAttr(attrs, "_TableDriver");
                        row["FileName"] = SafePrintAttr(attrs, "_FileName");
                        row["ConnectionString"] = MaskSensitiveValue("_ConnectionString", SafePrintAttr(attrs, "_ConnectionString"));
                        row["SQLTableName"] = SafePrintAttr(attrs, "_SQLTableName");
                        row["KeyFields"] = SafePrintAttr(attrs, "_KeyFields");
                        row["CacheMode"] = SafePrintAttr(attrs, "_CacheMode");
                        row["ReadOnly"] = SafePrintAttr(attrs, "_ReadOnly");

                        int fieldCount;
                        row["FieldCount"] = int.TryParse(SafePrintAttr(attrs, "_FieldCount"), out fieldCount) ? fieldCount : 0;

                        row["AllAttributes"] = string.Join(
                            "; ",
                            attrs.Keys.Take(PullACRulesConstants.Table.AttrKeyDisplayLimit)
                                .Select(key =>
                                    OutputFile.NormalizeKey(key) + "=" +
                                    PullACRulesHelpers.SafePreview(
                                        MaskSensitiveValue(key, SafePrintAttr(attrs, key)),
                                        PullACRulesConstants.Table.AttrValuePreviewLength)));

                        dt.Rows.Add(row);
                    }
                }
            }
            catch (Exception ex)
            {
                Log("[TableInfo] Error processing table '{0}': {1}", name, ex.Message);
            }
        }

        FinalizeAndExportTable(dt, binDir, "TableInfo_Details");
    }

    private void GetSystemInfo(Fwd fwd)
    {
        var dt = new DataTable();
        dt.Columns.Add("Key", typeof(string));
        dt.Columns.Add("Value", typeof(string));

        AddKeyValueRow(dt, "ConfigPath", activeConfigPath ?? string.Empty);

        try
        {
            AddKeyValueRow(dt, "ReleaseNumber", Convert.ToString(fwd.ReleaseNumber));
        }
        catch (Exception ex)
        {
            AddKeyValueRow(dt, "ReleaseNumber_Error", ex.Message);
        }

        try
        {
            AddKeyValueRow(dt, "ReleaseString", fwd.GetReleaseString() ?? string.Empty);
        }
        catch (Exception ex)
        {
            AddKeyValueRow(dt, "ReleaseString_Error", ex.Message);
        }

        try
        {
            AddKeyValueRow(dt, "ReleaseDateString", fwd.GetReleaseDateString() ?? string.Empty);
        }
        catch (Exception ex)
        {
            AddKeyValueRow(dt, "ReleaseDateString_Error", ex.Message);
        }

        try
        {
            using (AttrList attrs = new AttrList(fwd.GetFWDAttributes()))
            {
                foreach (string key in attrs.Keys)
                    AddKeyValueRow(dt, "FWDAttr:" + OutputFile.NormalizeKey(key), MaskSensitiveValue(key, SafePrintAttr(attrs, key)));
            }
        }
        catch (Exception ex)
        {
            AddKeyValueRow(dt, "FWDAttributes_Error", ex.Message);
        }

        FinalizeAndExportTable(dt, OutputFile.BinDir, "Fwd_SystemInfo");
    }

    private static void AddKeyValueRow(DataTable dt, string key, string value)
    {
        DataRow row = dt.NewRow();
        row["Key"] = key ?? string.Empty;
        row["Value"] = value ?? string.Empty;
        dt.Rows.Add(row);
    }

    private void AddResourceAttrRows(DataTable dt, string resourceType, string resourceName, string configScope, IAttrCollection attrCollection)
    {
        if (attrCollection == null)
            return;

        using (AttrList attrs = new AttrList(attrCollection))
        {
            foreach (string key in attrs.Keys)
            {
                DataRow row = dt.NewRow();
                row["ResourceType"] = resourceType ?? string.Empty;
                row["ResourceName"] = resourceName ?? string.Empty;
                row["ConfigScope"] = configScope ?? string.Empty;
                row["AttrKey"] = OutputFile.NormalizeKey(key);
                row["OriginalAttrKey"] = key ?? string.Empty;
                row["AttrType"] = SafeAttrTypeName(attrs, key);
                row["AttrValue"] = PullACRulesHelpers.SafePreview(
                    MaskSensitiveValue(key, SafePrintAttr(attrs, key)),
                    PullACRulesConstants.ResourceTree.AttrValuePreviewLength);
                dt.Rows.Add(row);
            }
        }
    }

    private void GetGlobalResourceTypeConfigs(Fwd fwd, string[] resourceTypes)
    {
        var dt = new DataTable();
        dt.Columns.Add("ResourceType", typeof(string));
        dt.Columns.Add("AttrKey", typeof(string));
        dt.Columns.Add("OriginalAttrKey", typeof(string));
        dt.Columns.Add("AttrType", typeof(string));
        dt.Columns.Add("AttrValue", typeof(string));

        foreach (string resourceType in resourceTypes ?? Array.Empty<string>())
        {
            try
            {
                using (AttrList attrs = new AttrList(fwd.GetResourceTypeConfig(resourceType)))
                {
                    foreach (string key in attrs.Keys)
                    {
                        DataRow row = dt.NewRow();
                        row["ResourceType"] = resourceType ?? string.Empty;
                        row["AttrKey"] = OutputFile.NormalizeKey(key);
                        row["OriginalAttrKey"] = key ?? string.Empty;
                        row["AttrType"] = SafeAttrTypeName(attrs, key);
                        row["AttrValue"] = PullACRulesHelpers.SafePreview(
                            SafePrintAttr(attrs, key),
                            PullACRulesConstants.ResourceTree.AttrValuePreviewLength);
                        dt.Rows.Add(row);
                    }
                }
            }
            catch (Exception ex)
            {
                if (probeMode)
                    Log("[GlobalResources] Failed type config for '{0}': {1}", resourceType, ex.Message);

                EmitRunEvent(
                    PullACRulesRunPhase.ResourceTypeConfigs,
                    PullACRulesRunEventKind.Warning,
                    string.Format("Failed type config for {0}: {1}", resourceType, ex.Message),
                    PullACRulesRunIssueCategory.ResourceConfigFailure);
            }
        }

        FinalizeAndExportTable(dt, OutputFile.BinDir, "Fwd_ResourceTypeConfigs");
    }

    private void GetGlobalResourceConfigs(Fwd fwd, string[] resourceTypes)
    {
        var dt = new DataTable();
        dt.Columns.Add("ResourceType", typeof(string));
        dt.Columns.Add("ResourceName", typeof(string));
        dt.Columns.Add("ConfigScope", typeof(string));
        dt.Columns.Add("AttrKey", typeof(string));
        dt.Columns.Add("OriginalAttrKey", typeof(string));
        dt.Columns.Add("AttrType", typeof(string));
        dt.Columns.Add("AttrValue", typeof(string));

        foreach (string resourceType in resourceTypes ?? Array.Empty<string>())
        {
            string[] resourceNames = null;
            try
            {
                resourceNames = fwd.GetResourceNames(resourceType);
                Log("[GlobalResources] Resource type '{0}': {1} instance(s)", resourceType, resourceNames != null ? resourceNames.Length : 0);
            }
            catch (Exception ex)
            {
                if (probeMode)
                    Log("[GlobalResources] Failed to enumerate '{0}': {1}", resourceType, ex.Message);

                EmitRunEvent(
                    PullACRulesRunPhase.ResourceConfigs,
                    PullACRulesRunEventKind.Warning,
                    string.Format("Failed to enumerate {0}: {1}", resourceType, ex.Message),
                    PullACRulesRunIssueCategory.ResourceEnumerationFailure);
                continue;
            }

            foreach (string resourceName in resourceNames ?? Array.Empty<string>())
            {
                try
                {
                    AddResourceAttrRows(dt, resourceType, resourceName, "PrivateConfig", fwd.GetResourceConfig(resourceType, resourceName));
                }
                catch (Exception ex)
                {
                    if (probeMode)
                        Log("[GlobalResources] Failed private config for '{0}/{1}': {2}", resourceType, resourceName, ex.Message);

                    EmitRunEvent(
                        PullACRulesRunPhase.ResourceConfigs,
                        PullACRulesRunEventKind.Warning,
                        string.Format("Failed private config for {0}/{1}: {2}", resourceType, resourceName, ex.Message),
                        PullACRulesRunIssueCategory.ResourceConfigFailure);
                }

                try
                {
                    AddResourceAttrRows(dt, resourceType, resourceName, "PublicConfig", fwd.GetResourcePublicConfig(resourceType, resourceName));
                }
                catch (Exception ex)
                {
                    if (probeMode)
                        Log("[GlobalResources] Failed public config for '{0}/{1}': {2}", resourceType, resourceName, ex.Message);

                    EmitRunEvent(
                        PullACRulesRunPhase.ResourceConfigs,
                        PullACRulesRunEventKind.Warning,
                        string.Format("Failed public config for {0}/{1}: {2}", resourceType, resourceName, ex.Message),
                        PullACRulesRunIssueCategory.ResourceConfigFailure);
                }
            }
        }

        FinalizeAndExportTable(dt, OutputFile.BinDir, "Fwd_ResourceConfigs");
    }

    private void WalkResourcePrivateTree(STCHandle currentNode, string resourceType, string resourceName, string currentPath, int depth, DataTable dt)
    {
        if (currentNode == null || depth > PullACRulesConstants.ResourceTree.MaxDepth)
            return;

        string[] childNames;
        try
        {
            childNames = currentNode.ChildNames;
        }
        catch (Exception)
        {
            childNames = null;
        }

        DataRow row = dt.NewRow();
        row["ResourceType"] = resourceType ?? string.Empty;
        row["ResourceName"] = resourceName ?? string.Empty;
        row["NodePath"] = currentPath ?? string.Empty;
        row["Depth"] = depth;
        row["ChildCount"] = childNames != null ? childNames.Length : 0;
        row["ChildNames"] = PullACRulesHelpers.JoinLimited(childNames ?? Enumerable.Empty<string>(), PullACRulesConstants.ResourceTree.ChildDisplayLimit);

        try
        {
            row["NodeValuePreview"] = PullACRulesHelpers.SafePreview(currentNode.Value, PullACRulesConstants.ResourceTree.NodePreviewLength);
        }
        catch (Exception)
        {
            row["NodeValuePreview"] = string.Empty;
        }

        try
        {
            using (AttrList attrs = TryLoadKnownAttrList(currentNode))
            {
                if (attrs != null)
                {
                    row["AttrKeyCount"] = attrs.Keys != null ? attrs.Keys.Count : 0;
                    row["AttrKeys"] = PullACRulesHelpers.JoinLimited(attrs.Keys ?? Enumerable.Empty<string>(), PullACRulesConstants.ResourceTree.AttrKeyDisplayLimit);
                }
                else
                {
                    row["AttrKeyCount"] = 0;
                    row["AttrKeys"] = string.Empty;
                }
            }
        }
        catch (Exception)
        {
            row["AttrKeyCount"] = 0;
            row["AttrKeys"] = string.Empty;
        }

        dt.Rows.Add(row);

        foreach (string childName in childNames ?? Array.Empty<string>())
        {
            if (string.IsNullOrWhiteSpace(childName))
                continue;

            try
            {
                using (STCHandle childHandle = currentNode.GetChildHandle(childName, false))
                {
                    string childPath = string.IsNullOrEmpty(currentPath) ? childName : currentPath + "/" + childName;
                    WalkResourcePrivateTree(childHandle, resourceType, resourceName, childPath, depth + 1, dt);
                }
            }
            catch (Exception ex)
            {
                DataRow errRow = dt.NewRow();
                errRow["ResourceType"] = resourceType ?? string.Empty;
                errRow["ResourceName"] = resourceName ?? string.Empty;
                errRow["NodePath"] = string.IsNullOrEmpty(currentPath) ? childName : currentPath + "/" + childName;
                errRow["Depth"] = depth + 1;
                errRow["ChildCount"] = 0;
                errRow["ChildNames"] = string.Empty;
                errRow["AttrKeyCount"] = 0;
                errRow["AttrKeys"] = string.Empty;
                errRow["NodeValuePreview"] = "ERROR: " + ex.Message;
                dt.Rows.Add(errRow);
            }
        }
    }

    private AttrList TryLoadKnownAttrList(STCHandle node)
    {
        if (node == null)
            return null;

        string[] candidates =
        {
            PullACRulesConstants.ChildNodes.FwdInfo,
            PullACRulesConstants.ChildNodes.TableInfo,
            PullACRulesConstants.ChildNodes.FunctionInfo,
            PullACRulesConstants.ChildNodes.DriverInfo
        };

        foreach (string candidate in candidates)
        {
            try
            {
                if (node.HasChild(candidate))
                    return node.LoadAttrList(candidate);
            }
            catch (Exception)
            {
            }
        }

        return null;
    }

    private void GetGlobalResourcePrivateTree(Fwd fwd, string[] resourceTypes)
    {
        var dt = new DataTable();
        dt.Columns.Add("ResourceType", typeof(string));
        dt.Columns.Add("ResourceName", typeof(string));
        dt.Columns.Add("NodePath", typeof(string));
        dt.Columns.Add("Depth", typeof(int));
        dt.Columns.Add("ChildCount", typeof(int));
        dt.Columns.Add("ChildNames", typeof(string));
        dt.Columns.Add("AttrKeyCount", typeof(int));
        dt.Columns.Add("AttrKeys", typeof(string));
        dt.Columns.Add("NodeValuePreview", typeof(string));

        foreach (string resourceType in resourceTypes ?? Array.Empty<string>())
        {
            string[] resourceNames;
            try
            {
                resourceNames = fwd.GetResourceNames(resourceType);
            }
            catch (Exception ex)
            {
                if (probeMode)
                {
                    Log(
                        "[GlobalResources] Failed to enumerate '{0}' for private tree export: {1}",
                        resourceType,
                        ex.Message);
                }

                EmitRunEvent(
                    PullACRulesRunPhase.ResourcePrivateTree,
                    PullACRulesRunEventKind.Warning,
                    string.Format("Failed private-tree enumeration for {0}: {1}", resourceType, ex.Message),
                    PullACRulesRunIssueCategory.ResourceEnumerationFailure);
                continue;
            }

            foreach (string resourceName in resourceNames ?? Array.Empty<string>())
            {
                try
                {
                    using (var nodeObj = fwd.GetResourceNodePrivate(resourceType, resourceName))
                    {
                        if (nodeObj == null)
                            continue;

                        STCHandle node = PullACRulesHelpers.RequireStcHandle(nodeObj, "GetResourceNodePrivate(" + resourceType + ")");
                        WalkResourcePrivateTree(node, resourceType, resourceName, string.Empty, 0, dt);
                    }
                }
                catch (Exception ex)
                {
                    if (probeMode)
                    {
                        Log(
                            "[GlobalResources] Failed private tree export for '{0}/{1}': {2}",
                            resourceType,
                            resourceName,
                            ex.Message);
                    }

                    EmitRunEvent(
                        PullACRulesRunPhase.ResourcePrivateTree,
                        PullACRulesRunEventKind.Warning,
                        string.Format("Failed private tree export for {0}/{1}: {2}", resourceType, resourceName, ex.Message),
                        PullACRulesRunIssueCategory.ResourceConfigFailure);
                }
            }
        }

        FinalizeAndExportTable(dt, OutputFile.BinDir, "Fwd_ResourcePrivateTree");
    }

    // ================================================================
    //  Resilient AC process discovery
    // ================================================================

    // Code was generated by Copilot.
    /// <summary>
    /// Returns the FWD process name to use for page-rule and FIP queries.
    /// Prefers an exact "AC" match; falls back to any available process and
    /// logs a warning so the discrepancy is auditable.
    /// </summary>
    private string ResolveAcProcessName(Fwd fwd)
    {
        string[] processes;
        try
        {
            processes = fwd.GetProcessNames();
        }
        catch (Exception ex)
        {
            Log("[ProcessDiscovery] GetProcessNames failed: {0} — defaulting to '{1}'",
                ex.Message, PullACRulesConstants.ResourceTypes.Process);
            return PullACRulesConstants.ResourceTypes.Process;
        }

        if (processes == null || processes.Length == 0)
        {
            Log("[ProcessDiscovery] No processes found in FWD; defaulting to '{0}'",
                PullACRulesConstants.ResourceTypes.Process);
            return PullACRulesConstants.ResourceTypes.Process;
        }

        Log("[ProcessDiscovery] Found {0} process(es): {1}",
            processes.Length, string.Join(", ", processes.Take(10)));

        // Exact match preferred
        string exact = Array.Find(processes, p =>
            string.Equals(p, PullACRulesConstants.ResourceTypes.Process, StringComparison.OrdinalIgnoreCase));
        if (exact != null)
            return exact;

        // Probe for a name containing "AC"
        string candidate = Array.Find(processes, p =>
            p.IndexOf("AC", StringComparison.OrdinalIgnoreCase) >= 0);
        if (candidate != null)
        {
            Log("[ProcessDiscovery] Exact 'AC' process not found; using '{0}'", candidate);
            EmitRunEvent(PullACRulesRunPhase.PageRules, PullACRulesRunEventKind.Warning,
                string.Format("AC process not found by exact name; using '{0}'", candidate),
                PullACRulesRunIssueCategory.MissingNode);
            return candidate;
        }

        // Last resort: use first available process
        Log("[ProcessDiscovery] 'AC' not found; falling back to first process: '{0}'", processes[0]);
        EmitRunEvent(PullACRulesRunPhase.PageRules, PullACRulesRunEventKind.Warning,
            string.Format("AC process not found; using first available '{0}'", processes[0]),
            PullACRulesRunIssueCategory.MissingNode);
        return processes[0];
    }

    // ================================================================
    //  Fwd_PageVariantInventory
    // ================================================================

    // Code was generated by Copilot.
    /// <summary>
    /// Exports a per-page-variant inventory row using the wrapper's semantic surface:
    /// FormID, viewable field count, blank-image availability, dropout region count,
    /// and OMR field count — one row per (page, variant) pair.
    /// </summary>
    private void GetPageVariantInventory(Fwd fwd, string[] allPageNames)
    {
        var dt = new DataTable();
        dt.Columns.Add("PageName",           typeof(string));
        dt.Columns.Add("VariantName",        typeof(string));
        dt.Columns.Add("VariantFullName",    typeof(string));
        dt.Columns.Add("FormID",             typeof(long));
        dt.Columns.Add("ViewableFieldCount", typeof(int));
        dt.Columns.Add("HasBlankImage",      typeof(bool));
        dt.Columns.Add("BlankImageBytes",    typeof(int));
        dt.Columns.Add("DropoutRegionCount", typeof(int));
        dt.Columns.Add("OmrFieldCount",      typeof(int));
        dt.Columns.Add("Notes",              typeof(string));

        string fipProcess = PullACRulesConstants.DefaultFipProcessName;
        int totalRows = 0;

        foreach (string pageName in allPageNames ?? Array.Empty<string>())
        {
            string[] variants;
            try { variants = fwd.GetVariantNames(pageName); }
            catch (Exception ex)
            {
                Log("[PageVariantInventory] GetVariantNames failed for '{0}': {1}", pageName, ex.Message);
                continue;
            }

            if (variants == null || variants.Length == 0)
                continue;

            foreach (string variantName in variants)
            {
                DataRow row = dt.NewRow();
                row["PageName"]        = pageName;
                row["VariantName"]     = variantName ?? string.Empty;
                row["VariantFullName"] = string.IsNullOrEmpty(variantName)
                    ? pageName : pageName + "." + variantName;
                row["Notes"] = string.Empty;

                PageVariantConfig pvc = null;
                try { pvc = fwd.PageVariant(pageName, variantName) as PageVariantConfig; }
                catch (Exception ex)
                {
                    row["Notes"] = "PageVariant error: " + ex.Message;
                    dt.Rows.Add(row);
                    totalRows++;
                    continue;
                }

                if (pvc == null)
                {
                    row["Notes"] = "PageVariant returned null or cast failed";
                    dt.Rows.Add(row);
                    totalRows++;
                    continue;
                }

                // FormID
                try { row["FormID"] = (long)pvc.FormID; }
                catch { row["FormID"] = -1L; }

                // Viewable field count (best available public enumeration per page)
                try
                {
                    IList<string> viewable = fwd.GetViewableFieldList(pageName);
                    row["ViewableFieldCount"] = viewable != null ? viewable.Count : 0;
                }
                catch { row["ViewableFieldCount"] = -1; }

                // Blank image
                try
                {
                    byte[] img = pvc.ReadImageData();
                    row["HasBlankImage"]   = img != null && img.Length > 0;
                    row["BlankImageBytes"] = img != null ? img.Length : 0;
                }
                catch
                {
                    row["HasBlankImage"]   = false;
                    row["BlankImageBytes"] = 0;
                }

                // Dropout regions
                try
                {
                    IList<DropoutRegion> dr = pvc.GetDropoutRegionInfo(fipProcess);
                    row["DropoutRegionCount"] = dr != null ? dr.Count : 0;
                }
                catch { row["DropoutRegionCount"] = 0; }

                // OMR fields
                try
                {
                    IList<OMRField> omr = pvc.GetOMRFieldConfigs(fipProcess);
                    row["OmrFieldCount"] = omr != null ? omr.Count : 0;
                }
                catch { row["OmrFieldCount"] = 0; }

                dt.Rows.Add(row);
                totalRows++;
            }
        }

        Log("[PageVariantInventory] {0} row(s) emitted", totalRows);
        FinalizeAndExportTable(dt, OutputFile.BinDir, PullACRulesConstants.ExportNames.PageVariantInventory);
    }

    // ================================================================
    //  Fwd_FieldCatalog
    // ================================================================

    // Code was generated by Copilot.
    /// <summary>
    /// Exports a field catalog: all viewable fields per page (with geometry and type),
    /// plus all OMR subfields per page variant.
    /// Returns an in-memory lookup dictionary for use by <see cref="GetRuleFieldResolution"/>.
    /// </summary>
    private Dictionary<string, FieldCatalogEntry> GetFieldCatalog(Fwd fwd, string[] allPageNames)
    {
        var dt = new DataTable();
        dt.Columns.Add("ContainerType",    typeof(string));
        dt.Columns.Add("ContainerName",    typeof(string));
        dt.Columns.Add("PageName",         typeof(string));
        dt.Columns.Add("VariantName",      typeof(string));
        dt.Columns.Add("FieldName",        typeof(string));
        dt.Columns.Add("FieldType",        typeof(string));
        dt.Columns.Add("X",               typeof(int));
        dt.Columns.Add("Y",               typeof(int));
        dt.Columns.Add("Width",           typeof(int));
        dt.Columns.Add("Height",          typeof(int));
        dt.Columns.Add("IsOmrSubfield",   typeof(bool));
        dt.Columns.Add("OmrParentField",  typeof(string));

        // Lookup keyed by field name; page-level entry wins on collision
        var lookup = new Dictionary<string, FieldCatalogEntry>(StringComparer.OrdinalIgnoreCase);
        string fipProcess = PullACRulesConstants.DefaultFipProcessName;
        int totalRows = 0;

        foreach (string pageName in allPageNames ?? Array.Empty<string>())
        {
            // --- Page-level viewable fields (geometry + type via FieldsInfo) ---
            IList<string> viewableFields = null;
            try { viewableFields = fwd.GetViewableFieldList(pageName); }
            catch (Exception ex)
            { Log("[FieldCatalog] GetViewableFieldList failed for '{0}': {1}", pageName, ex.Message); }

            // Obtain FieldsInfo for the page to resolve geometry/type per field name
            FieldsInfo pageFieldsInfo = null;
            try { pageFieldsInfo = FieldsInfo.GetPageFieldsInfo(fwd, pageName); }
            catch { }

            foreach (string fieldName in viewableFields ?? (IList<string>)Array.Empty<string>())
            {
                if (string.IsNullOrWhiteSpace(fieldName)) continue;

                var entry = new FieldCatalogEntry
                {
                    ContainerName = pageName,
                    PageName      = pageName,
                    VariantName   = string.Empty
                };

                if (pageFieldsInfo != null)
                {
                    try
                    {
                        FieldType ft = pageFieldsInfo.GetFieldType(fieldName);
                        entry.FieldType = ft.ToString();
                    }
                    catch { entry.FieldType = string.Empty; }

                    try
                    {
                        System.Drawing.Rectangle g = pageFieldsInfo.GetGeometry(fieldName);
                        entry.X = g.X; entry.Y = g.Y;
                        entry.Width = g.Width; entry.Height = g.Height;
                    }
                    catch { }
                }

                // Page-level entry wins — only add if not already cataloged
                if (!lookup.ContainsKey(fieldName))
                    lookup[fieldName] = entry;

                DataRow row = dt.NewRow();
                row["ContainerType"]   = "Page";
                row["ContainerName"]   = pageName;
                row["PageName"]        = pageName;
                row["VariantName"]     = string.Empty;
                row["FieldName"]       = fieldName;
                row["FieldType"]       = entry.FieldType ?? string.Empty;
                row["X"] = entry.X; row["Y"] = entry.Y;
                row["Width"] = entry.Width; row["Height"] = entry.Height;
                row["IsOmrSubfield"]   = false;
                row["OmrParentField"]  = string.Empty;
                dt.Rows.Add(row);
                totalRows++;
            }

            pageFieldsInfo?.Dispose();

            // --- Variant-level OMR fields ---
            string[] variants = null;
            try { variants = fwd.GetVariantNames(pageName); }
            catch { }

            foreach (string variantName in variants ?? Array.Empty<string>())
            {
                string containerName = pageName + "." + variantName;
                PageVariantConfig pvc = null;
                try { pvc = fwd.PageVariant(pageName, variantName) as PageVariantConfig; }
                catch { continue; }
                if (pvc == null) continue;

                IList<OMRField> omrFields = null;
                try { omrFields = pvc.GetOMRFieldConfigs(fipProcess); }
                catch { }

                foreach (OMRField omr in omrFields ?? (IList<OMRField>)new List<OMRField>())
                {
                    if (omr == null || string.IsNullOrWhiteSpace(omr.Name)) continue;

                    // Parent OMR field row
                    var entry = new FieldCatalogEntry
                    {
                        ContainerName = containerName,
                        PageName      = pageName,
                        VariantName   = variantName,
                        FieldType     = "OMR",
                        X      = omr.Geometry.X,
                        Y      = omr.Geometry.Y,
                        Width  = omr.Geometry.Width,
                        Height = omr.Geometry.Height
                    };

                    if (!lookup.ContainsKey(omr.Name))
                        lookup[omr.Name] = entry;

                    DataRow row = dt.NewRow();
                    row["ContainerType"]  = "Variant";
                    row["ContainerName"]  = containerName;
                    row["PageName"]       = pageName;
                    row["VariantName"]    = variantName;
                    row["FieldName"]      = omr.Name;
                    row["FieldType"]      = "OMR";
                    row["X"] = omr.Geometry.X; row["Y"] = omr.Geometry.Y;
                    row["Width"] = omr.Geometry.Width; row["Height"] = omr.Geometry.Height;
                    row["IsOmrSubfield"]  = false;
                    row["OmrParentField"] = string.Empty;
                    dt.Rows.Add(row);
                    totalRows++;

                    // OMR subfield rows
                    foreach (OMRSubfield sub in omr.OMRSubfields ?? (IList<OMRSubfield>)new List<OMRSubfield>())
                    {
                        if (sub == null) continue;
                        DataRow subRow = dt.NewRow();
                        subRow["ContainerType"]  = "Variant";
                        subRow["ContainerName"]  = containerName;
                        subRow["PageName"]       = pageName;
                        subRow["VariantName"]    = variantName;
                        subRow["FieldName"]      = sub.Name ?? string.Empty;
                        subRow["FieldType"]      = "OMRSubfield";
                        subRow["X"] = sub.Geometry.X; subRow["Y"] = sub.Geometry.Y;
                        subRow["Width"] = sub.Geometry.Width; subRow["Height"] = sub.Geometry.Height;
                        subRow["IsOmrSubfield"]  = true;
                        subRow["OmrParentField"] = omr.Name;
                        dt.Rows.Add(subRow);
                        totalRows++;
                    }
                }
            }
        }

        Log("[FieldCatalog] {0} row(s) emitted, {1} unique field name(s) in catalog", totalRows, lookup.Count);
        FinalizeAndExportTable(dt, OutputFile.BinDir, PullACRulesConstants.ExportNames.FieldCatalog);
        return lookup;
    }

    // ================================================================
    //  Fwd_RuleFieldResolution
    // ================================================================

    // Code was generated by Copilot.
    /// <summary>
    /// Cross-references parsed rule field-name references against the field catalog.
    /// Each output row answers: does this referenced field exist, on which container,
    /// what type, and what are its coordinates?
    /// </summary>
    private void GetRuleFieldResolution(
        DataTable ruleTable,
        Dictionary<string, FieldCatalogEntry> fieldCatalog,
        string exportSuffix)
    {
        if (ruleTable == null || ruleTable.Rows.Count == 0 || fieldCatalog == null)
        {
            Log("[RuleFieldResolution] No rule rows or empty catalog for '{0}' — skipping", exportSuffix);
            return;
        }

        var dt = new DataTable();
        dt.Columns.Add("RuleContainer",     typeof(string));
        dt.Columns.Add("RuleNodeId",        typeof(string));
        dt.Columns.Add("ReferencedField",   typeof(string));
        dt.Columns.Add("ResolvedContainer", typeof(string));
        dt.Columns.Add("ResolvedPage",      typeof(string));
        dt.Columns.Add("ResolvedVariant",   typeof(string));
        dt.Columns.Add("FieldExists",       typeof(bool));
        dt.Columns.Add("FieldType",         typeof(string));
        dt.Columns.Add("X",                 typeof(int));
        dt.Columns.Add("Y",                 typeof(int));
        dt.Columns.Add("Width",             typeof(int));
        dt.Columns.Add("Height",            typeof(int));

        bool hasNodeFieldNames = ruleTable.Columns.Contains("NodeFieldNames");
        bool hasContainer      = ruleTable.Columns.Contains("Container");
        bool hasNodeId         = ruleTable.Columns.Contains("NodeId");

        int resolvedCount = 0;
        int missingCount  = 0;

        foreach (DataRow ruleRow in ruleTable.Rows)
        {
            string container = hasContainer
                ? Convert.ToString(ruleRow["Container"]) ?? string.Empty
                : string.Empty;
            string nodeId = hasNodeId
                ? Convert.ToString(ruleRow["NodeId"]) ?? string.Empty
                : string.Empty;
            string rawFields = hasNodeFieldNames
                ? Convert.ToString(ruleRow["NodeFieldNames"]) ?? string.Empty
                : string.Empty;

            // Skip rows that have no field references
            if (string.IsNullOrWhiteSpace(rawFields))
                continue;

            string[] fieldRefs = rawFields.Split(
                new[] { ' ', ',', ';', '\t', '\r', '\n' },
                StringSplitOptions.RemoveEmptyEntries);

            foreach (string fieldRef in fieldRefs)
            {
                if (string.IsNullOrWhiteSpace(fieldRef)) continue;

                DataRow res = dt.NewRow();
                res["RuleContainer"]   = container;
                res["RuleNodeId"]      = nodeId;
                res["ReferencedField"] = fieldRef;

                FieldCatalogEntry entry;
                if (fieldCatalog.TryGetValue(fieldRef, out entry))
                {
                    res["ResolvedContainer"] = entry.ContainerName;
                    res["ResolvedPage"]      = entry.PageName;
                    res["ResolvedVariant"]   = entry.VariantName;
                    res["FieldExists"]       = true;
                    res["FieldType"]         = entry.FieldType ?? string.Empty;
                    res["X"]      = entry.X;
                    res["Y"]      = entry.Y;
                    res["Width"]  = entry.Width;
                    res["Height"] = entry.Height;
                    resolvedCount++;
                }
                else
                {
                    res["ResolvedContainer"] = string.Empty;
                    res["ResolvedPage"]      = string.Empty;
                    res["ResolvedVariant"]   = string.Empty;
                    res["FieldExists"]       = false;
                    res["FieldType"]         = string.Empty;
                    res["X"] = res["Y"] = res["Width"] = res["Height"] = 0;
                    missingCount++;
                }

                dt.Rows.Add(res);
            }
        }

        Log("[RuleFieldResolution/{0}] {1} resolved, {2} unresolved", exportSuffix, resolvedCount, missingCount);
        if (missingCount > 0)
            EmitRunEvent(
                PullACRulesRunPhase.RuleFieldResolution,
                PullACRulesRunEventKind.Warning,
                string.Format("[{0}] {1} rule field reference(s) not found in field catalog", exportSuffix, missingCount),
                PullACRulesRunIssueCategory.MissingNode);

        FinalizeAndExportTable(dt, OutputFile.BinDir,
            PullACRulesConstants.ExportNames.RuleFieldResolution + "_" + exportSuffix);
    }

    // Value type — no heap allocation per catalog entry
    private struct FieldCatalogEntry
    {
        public string ContainerName;
        public string PageName;
        public string VariantName;
        public string FieldType;
        public int X, Y, Width, Height;
    }
}

