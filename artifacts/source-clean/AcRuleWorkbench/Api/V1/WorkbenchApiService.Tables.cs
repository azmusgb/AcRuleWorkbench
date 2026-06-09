using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Text.RegularExpressions;
using System.Text;
using Newtonsoft.Json;
using AcRuleWorkbench.Api;
using AcRuleWorkbench.Api.V1.Contracts;
using AcRuleWorkbench.Core;

namespace AcRuleWorkbench.Api.V1;

internal sealed partial class WorkbenchApiService
{
    private object BuildFwdTablesCanonical(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? q = Get(request, "q");
        string? resourceTypeFilter = Get(request, "resourceType");
        var rules = BuildRuleRelationshipIndex(snapshot);

        var tables = new Dictionary<string, TableVm>(StringComparer.OrdinalIgnoreCase);
        IEnumerable<ResourceBucket> tableBuckets = snapshot.Fwd.Resources.Where(b =>
            string.IsNullOrWhiteSpace(resourceTypeFilter)
                ? IsTableResourceType(b.Type)
                : RuleCorrelation.Eq(b.Type, resourceTypeFilter));

        foreach (ResourceBucket bucket in tableBuckets)
        {
            foreach (string name in bucket.Names)
            {
                string tableName = (name ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(tableName) || !LooksLikeTableIdentifier(tableName))
                    continue;

                if (!tables.ContainsKey(tableName))
                {
                    tables[tableName] = new TableVm
                    {
                        Name = tableName,
                        Canonical = true,
                        ResourceType = bucket.Type,
                        Source = "CanonicalFwdResource",
                        Confidence = "High"
                    };
                }
            }
        }

        foreach (AcRuleRelationship relationship in snapshot.Relationships.Relationships)
        {
            string tableName = (relationship.Target ?? relationship.ParameterName ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(tableName))
                continue;

            if (!tables.TryGetValue(tableName, out TableVm? table))
                continue;

            table.ReferenceCount++;
            table.ScopeIds.Add(RuleCorrelation.ScopeId(relationship.ScopePath, relationship.ScopeType, relationship.ScopeName));

            string ruleKey = string.Join("|",
                RuleCorrelation.ScopeId(relationship.ScopePath, relationship.ScopeType, relationship.ScopeName),
                relationship.RuleGuid ?? string.Empty,
                relationship.RuleIndex.ToString(),
                relationship.RuleName ?? string.Empty,
                relationship.FunctionName ?? string.Empty);
            table.RuleKeys.Add(ruleKey);

            if (!rules.TryGetValue(ruleKey, out List<AcRuleRelationship>? peers))
                continue;

            foreach (AcRuleRelationship peer in peers)
            {
                if (object.ReferenceEquals(peer, relationship)) continue;

                string candidate = (peer.Target ?? peer.ParameterName ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(candidate)) continue;
                if (RuleCorrelation.Eq(candidate, tableName)) continue;

                string targetType = peer.TargetType ?? string.Empty;
                string role = peer.ParameterRole ?? string.Empty;
                string confidence = "Low";
                if (RuleCorrelation.Contains(targetType, "Field") || RuleCorrelation.Contains(targetType, "Attribute") || RuleCorrelation.Contains(role, "Field") || RuleCorrelation.Contains(role, "Column") || RuleCorrelation.Contains(role, "Attribute"))
                    confidence = "High";
                else if (!string.IsNullOrWhiteSpace(peer.ParameterName) && Regex.IsMatch(peer.ParameterName, "field|column|attr", RegexOptions.IgnoreCase))
                    confidence = "Medium";

                if (confidence == "Low")
                    continue;

                if (!table.Columns.TryGetValue(candidate, out TableColumnVm? column))
                {
                    column = new TableColumnVm { Name = candidate, Confidence = confidence };
                    table.Columns[candidate] = column;
                }

                column.Hits++;
                if (string.Equals(confidence, "High", StringComparison.OrdinalIgnoreCase))
                    column.Confidence = "High";
            }
        }

        var items = tables.Values
            .Where(t => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(t.Name, q) || t.Columns.Keys.Any(c => RuleCorrelation.Contains(c, q)))
            .Select(t =>
            {
                ResourceDetail? detail = FindResourceDetail(snapshot.Fwd, t.ResourceType, t.Name) ?? FindResourceDetailByName(snapshot.Fwd, t.Name);
                var parsedColumns = ExtractTableColumnsFromResourceDetail(detail);
                bool schemaParsed = parsedColumns.Count > 0;
                var diagnostics = new List<string>();
                if (!schemaParsed)
                    diagnostics.Add("TableSchemaNotParsed");
                if (t.Columns.Count > 0)
                    diagnostics.Add(schemaParsed ? "UsageDerivedFieldsAlsoAvailable" : "UsageDerivedFieldsNotSchema");
                if (detail == null)
                    diagnostics.Add("ResourceDetailsUnavailable");

                return new
                {
                    name = t.Name,
                    canonical = t.Canonical,
                    source = t.Source,
                    confidence = schemaParsed ? "High" : t.Confidence,
                    resourceType = t.ResourceType,
                    referenceCount = t.ReferenceCount,
                    scopeCount = t.ScopeIds.Count,
                    ruleCount = t.RuleKeys.Count,
                    parsedColumns = parsedColumns
                        .OrderByDescending(c => c.Hits)
                        .ThenBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
                        .Select(c => new { name = c.Name, hits = c.Hits, confidence = c.Confidence })
                        .ToList(),
                    usageDerivedFields = t.Columns.Values
                        .OrderByDescending(c => c.Hits)
                        .ThenBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
                        .Select(c => new { name = c.Name, hits = c.Hits, confidence = c.Confidence })
                        .ToList(),
                    columns = (schemaParsed ? parsedColumns : t.Columns.Values.ToList())
                        .OrderByDescending(c => c.Hits)
                        .ThenBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
                        .Select(c => new { name = c.Name, hits = c.Hits, confidence = c.Confidence })
                        .ToList(),
                    schemaParsed,
                    columnsAreUsageDerived = !schemaParsed,
                    columnsDeprecatedAlias = !schemaParsed,
                    rawResourceDetails = detail == null ? null : new
                    {
                        category = detail.Category,
                        fullConfig = detail.FullAttributes,
                        publicConfig = detail.PublicAttributes,
                        privateTree = detail.PrivateTree,
                        warnings = detail.Warnings
                    },
                    diagnostics
                };
            })
            .OrderByDescending(t => t.referenceCount)
            .ThenBy(t => t.name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new
        {
            count = items.Count,
            items,
            diagnostics = items.SelectMany(i => i.diagnostics).Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
            links = new
            {
                inferred = "/api/v1/fwd/tables/inferred"
            }
        };
    }

private static bool IsTableResourceType(string? value)
    {
        string text = value ?? string.Empty;
        return RuleCorrelation.Eq(text, "Table")
            || RuleCorrelation.Eq(text, "Tables")
            || RuleCorrelation.Eq(text, "SelectionList")
            || RuleCorrelation.Eq(text, "SelectionLists")
            || RuleCorrelation.Eq(text, "Selection List")
            || RuleCorrelation.Contains(text, "table")
            || RuleCorrelation.Contains(text, "selection")
            || RuleCorrelation.Contains(text, "lookup");
    }

private static List<TableColumnVm> ExtractTableColumnsFromResourceDetail(ResourceDetail? detail)
    {
        var columns = new Dictionary<string, TableColumnVm>(StringComparer.OrdinalIgnoreCase);
        if (detail == null)
            return columns.Values.ToList();

        void Add(string? candidate, string confidence)
        {
            string value = (candidate ?? string.Empty).Trim().Trim('"', '\'', '{', '}', '[', ']');
            if (!LooksLikeColumnIdentifier(value))
                return;

            if (!columns.TryGetValue(value, out TableColumnVm? column))
            {
                column = new TableColumnVm { Name = value, Confidence = confidence, Hits = 1 };
                columns[value] = column;
            }
            else
            {
                column.Hits++;
                if (confidence == "High")
                    column.Confidence = "High";
            }
        }

        void AddSplit(string? raw, string confidence)
        {
            if (string.IsNullOrWhiteSpace(raw))
                return;

            foreach (string part in Regex.Split(raw, @"[,;|\r\n\t]+"))
                Add(part, confidence);
        }

        foreach (ResourceAttrEntry attr in detail.FullAttributes.Concat(detail.PublicAttributes))
        {
            string key = attr.Key ?? string.Empty;
            string value = attr.Value ?? string.Empty;

            if (Regex.IsMatch(key, "key\\s*fields?|match\\s*fields?|plug\\s*fields?|output\\s*fields?|columns?|fields?", RegexOptions.IgnoreCase))
                AddSplit(value, "High");

            if (Regex.IsMatch(key, @"(^|[._-])(Field|Column)\d*(Name)?$", RegexOptions.IgnoreCase))
                Add(string.IsNullOrWhiteSpace(value) ? key : value, "High");
        }

        if (detail.PrivateTree != null)
            ExtractTableColumnsFromPrivateTree(detail.PrivateTree, Add, AddSplit, inColumnRegion: false);

        return columns.Values.OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase).ToList();
    }

private static void ExtractTableColumnsFromPrivateTree(ResourcePrivateNode node, Action<string?, string> add, Action<string?, string> addSplit, bool inColumnRegion)
    {
        string name = node.Name ?? string.Empty;
        bool columnRegion = inColumnRegion || Regex.IsMatch(name, "columns?|fields?|schema|tableinfo", RegexOptions.IgnoreCase);

        if (columnRegion)
        {
            add(name, "Medium");
            if (!string.IsNullOrWhiteSpace(node.ValuePreview))
                addSplit(node.ValuePreview, "Medium");
        }

        foreach (ResourcePrivateNode child in node.Children)
            ExtractTableColumnsFromPrivateTree(child, add, addSplit, columnRegion);
    }

private static bool LooksLikeColumnIdentifier(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        string v = value.Trim();
        if (v.Length < 2 || v.Length > 80)
            return false;
        if (Regex.IsMatch(v, "^(True|False|Yes|No|None|Null|Unknown|Table|Field|Fields|Column|Columns|Schema|Config|Info)$", RegexOptions.IgnoreCase))
            return false;
        if (Regex.IsMatch(v, "^[+-]?\\d+(\\.\\d+)?$"))
            return false;
        if (v.IndexOfAny(new[] { '/', '\\', ':', '{', '}', '[', ']', '"', '\'' }) >= 0)
            return false;

        return Regex.IsMatch(v, "^[A-Za-z][A-Za-z0-9_ .-]*$", RegexOptions.CultureInvariant);
    }

    private object BuildFwdTablesInferred(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? q = Get(request, "q");
        bool includeCanonical = GetBool(request, "includeCanonical", false);
        var rules = BuildRuleRelationshipIndex(snapshot);

        var canonicalTableNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (ResourceBucket bucket in snapshot.Fwd.Resources.Where(b => RuleCorrelation.Eq(b.Type, "Table")))
        {
            foreach (string name in bucket.Names)
            {
                string candidate = (name ?? string.Empty).Trim();
                if (!LooksLikeTableIdentifier(candidate))
                    continue;
                canonicalTableNames.Add(candidate);
            }
        }

        var tables = new Dictionary<string, TableVm>(StringComparer.OrdinalIgnoreCase);
        foreach (AcRuleRelationship relationship in snapshot.Relationships.Relationships)
        {
            string tableName = (relationship.Target ?? relationship.ParameterName ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(tableName))
                continue;

            string signal = string.Join(" ", relationship.TargetType ?? string.Empty, relationship.Kind ?? string.Empty, relationship.ParameterRole ?? string.Empty);
            bool tableSignal = Regex.IsMatch(signal, "table|indexed|lookup|db|database", RegexOptions.IgnoreCase);
            bool nameSignal = Regex.IsMatch(tableName, @"(?:^|[_-])(tbl|table|lookup|db)(?:$|[_-])|(?:table|lookup)$", RegexOptions.IgnoreCase);
            if (!tableSignal && !nameSignal)
                continue;
            if (!LooksLikeTableIdentifier(tableName))
                continue;

            bool isCanonical = canonicalTableNames.Contains(tableName);
            if (!includeCanonical && isCanonical)
                continue;

            if (!tables.TryGetValue(tableName, out TableVm? table))
            {
                table = new TableVm
                {
                    Name = tableName,
                    Canonical = isCanonical,
                    ResourceType = "Unknown",
                    Source = "InferredFromRuleRelationship",
                    Confidence = isCanonical ? "Medium" : "Low"
                };
                tables[tableName] = table;
            }

            table.ReferenceCount++;
            table.ScopeIds.Add(RuleCorrelation.ScopeId(relationship.ScopePath, relationship.ScopeType, relationship.ScopeName));

            string ruleKey = string.Join("|",
                RuleCorrelation.ScopeId(relationship.ScopePath, relationship.ScopeType, relationship.ScopeName),
                relationship.RuleGuid ?? string.Empty,
                relationship.RuleIndex.ToString(),
                relationship.RuleName ?? string.Empty,
                relationship.FunctionName ?? string.Empty);
            table.RuleKeys.Add(ruleKey);

            if (!rules.TryGetValue(ruleKey, out List<AcRuleRelationship>? peers))
                continue;

            foreach (AcRuleRelationship peer in peers)
            {
                if (object.ReferenceEquals(peer, relationship)) continue;

                string candidate = (peer.Target ?? peer.ParameterName ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(candidate)) continue;
                if (RuleCorrelation.Eq(candidate, tableName)) continue;

                string targetType = peer.TargetType ?? string.Empty;
                string role = peer.ParameterRole ?? string.Empty;
                string confidence = "Low";
                if (RuleCorrelation.Contains(targetType, "Field") || RuleCorrelation.Contains(targetType, "Attribute") || RuleCorrelation.Contains(role, "Field") || RuleCorrelation.Contains(role, "Column") || RuleCorrelation.Contains(role, "Attribute"))
                    confidence = "High";
                else if (!string.IsNullOrWhiteSpace(peer.ParameterName) && Regex.IsMatch(peer.ParameterName, "field|column|attr", RegexOptions.IgnoreCase))
                    confidence = "Medium";

                if (confidence == "Low")
                    continue;

                if (!table.Columns.TryGetValue(candidate, out TableColumnVm? column))
                {
                    column = new TableColumnVm { Name = candidate, Confidence = confidence };
                    table.Columns[candidate] = column;
                }

                column.Hits++;
                if (string.Equals(confidence, "High", StringComparison.OrdinalIgnoreCase))
                    column.Confidence = "High";
            }
        }

        var items = tables.Values
            .Where(t => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(t.Name, q) || t.Columns.Keys.Any(c => RuleCorrelation.Contains(c, q)))
            .Select(t => new
            {
                name = t.Name,
                canonical = t.Canonical,
                source = t.Source,
                confidence = t.Confidence,
                notCanonicalResource = !t.Canonical,
                referenceCount = t.ReferenceCount,
                scopeCount = t.ScopeIds.Count,
                ruleCount = t.RuleKeys.Count,
                parsedColumns = new List<object>(),
                usageDerivedFields = t.Columns.Values
                    .OrderByDescending(c => c.Hits)
                    .ThenBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
                    .Select(c => new { name = c.Name, hits = c.Hits, confidence = c.Confidence })
                    .ToList(),
                columns = t.Columns.Values
                    .OrderByDescending(c => c.Hits)
                    .ThenBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
                    .Select(c => new { name = c.Name, hits = c.Hits, confidence = c.Confidence })
                    .ToList(),
                schemaParsed = false,
                columnsAreUsageDerived = true,
                columnsDeprecatedAlias = true,
                diagnostics = new[] { "TableSchemaNotParsed", "UsageDerivedFieldsNotSchema" }
            })
            .OrderByDescending(t => t.referenceCount)
            .ThenBy(t => t.name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new
        {
            count = items.Count,
            items,
            diagnostics = new[] { "TableSchemaNotParsed", "UsageDerivedFieldsNotSchema" },
            links = new
            {
                canonical = "/api/v1/fwd/tables"
            }
        };
    }
}
