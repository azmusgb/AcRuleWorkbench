using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using AcRuleWorkbench.Core;

namespace AcRuleWorkbench.Api.V1;

internal sealed class WorkbenchSnapshot
{
    public string SnapshotId { get; set; } = string.Empty;
    public DateTime GeneratedAtUtc { get; set; }
    public long BuildDurationMs { get; set; }
    public bool RequireNativeOk { get; set; }
    public string FwdPath { get; set; } = string.Empty;
    public FwdInspectionReport Fwd { get; set; } = new FwdInspectionReport();
    public AcRuleReport Rules { get; set; } = new AcRuleReport();
    public AcTreeReport Tree { get; set; } = new AcTreeReport();
    public AcRelationshipReport Relationships { get; set; } = new AcRelationshipReport();
    public AcDiagnosticsReport Diagnostics { get; set; } = new AcDiagnosticsReport();
    public FormWorksEditorModel EditorModel { get; set; } = new FormWorksEditorModel();
    public Dictionary<string, ScopeModel> ScopesById { get; set; } = new Dictionary<string, ScopeModel>(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, RuleModel> RulesByNodeId { get; set; } = new Dictionary<string, RuleModel>(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, RuleModel> RulesByStructuralKey { get; set; } = new Dictionary<string, RuleModel>(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, List<AcRuleSummary>> FlatRulesByScopeId { get; set; } = new Dictionary<string, List<AcRuleSummary>>(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, List<AcRuleRelationship>> RelationshipsByScopeId { get; set; } = new Dictionary<string, List<AcRuleRelationship>>(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, List<AcTreeDiagnostic>> TreeDiagnosticsByScopeId { get; set; } = new Dictionary<string, List<AcTreeDiagnostic>>(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, List<FieldCatalogEntry>> FieldCatalogByName { get; set; } = new Dictionary<string, List<FieldCatalogEntry>>(StringComparer.OrdinalIgnoreCase);
}

internal sealed class ScopeModel
{
    public string ScopeId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Kind { get; set; } = string.Empty;
    public int StructuralRuleCount { get; set; }
    public int FlatInventoryCount { get; set; }
    public int FlatOnlyCount { get; set; }
    public int DirectDisabledCount { get; set; }
    public int InheritedDisabledCount { get; set; }
    public int ReferenceCount { get; set; }
    public int DiagnosticCount { get; set; }
    public int StructuralCoverageGap { get; set; }
    public double StructuralCoverageRatio { get; set; } = 1.0d;
    public bool StructuralCoverageFailure { get; set; }
    public List<AcTreeNode> StructuralNodes { get; } = new List<AcTreeNode>();
    public List<AcTreeEdge> StructuralEdges { get; } = new List<AcTreeEdge>();
    public List<AcRuleSummary> FlatRules { get; } = new List<AcRuleSummary>();
    public List<AcRuleRelationship> Relationships { get; } = new List<AcRuleRelationship>();
    public List<AcTreeDiagnostic> TreeDiagnostics { get; } = new List<AcTreeDiagnostic>();
}

internal sealed class RuleModel
{
    public string NodeId { get; set; } = string.Empty;
    public string ScopeId { get; set; } = string.Empty;
    public AcTreeNode Node { get; set; } = new AcTreeNode();
    public AcRuleSummary? FlatRule { get; set; }
    public List<AcRuleRelationship> Relationships { get; } = new List<AcRuleRelationship>();
    public List<AcTreeDiagnostic> Diagnostics { get; } = new List<AcTreeDiagnostic>();
    public List<RuleFieldResolutionEntry> FieldResolutions { get; } = new List<RuleFieldResolutionEntry>();

    public string Authority { get; set; } = "StructuralTree";

    public string DisabledAuthority { get; set; } = "Structural";
}

internal sealed class FieldCatalogEntry
{
    public string Name { get; set; } = string.Empty;
    public string ScopeType { get; set; } = string.Empty;
    public string ScopeName { get; set; } = string.Empty;
    public string? FieldType { get; set; }
    public string? Geometry { get; set; }
    public int? X { get; set; }
    public int? Y { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
    public string Source { get; set; } = "Fwd.FieldCatalog";
}

internal sealed class RuleFieldResolutionEntry
{
    public string ParameterName { get; set; } = string.Empty;
    public string ParameterValue { get; set; } = string.Empty;
    public string ReferencedField { get; set; } = string.Empty;
    public bool FieldExists { get; set; }
    public string Confidence { get; set; } = "Low";
    public string Source { get; set; } = "RuleParameter";
    public List<FieldCatalogEntry> Matches { get; } = new List<FieldCatalogEntry>();
}

internal static class WorkbenchSnapshotBuilder
{
    public static WorkbenchSnapshot Build(IFormWorksExtractionClient client, string fwdPath, string processName, bool requireNativeOk)
    {
        if (client == null) throw new ArgumentNullException(nameof(client));
        if (string.IsNullOrWhiteSpace(fwdPath)) throw new ArgumentException("FWD/CFD path is required.", nameof(fwdPath));

        var started = DateTime.UtcNow;
        var fwd = client.Inspect(new FwdInspectionOptions
        {
            Path = fwdPath,
            IncludeFields = true,
            IncludeResourceConfigs = true,
            IncludeResourcePrivateTrees = true,
            MaxPrivateTreeDepth = 8,
            MaxPrivateTreeNodes = 5000,
            RequireNativeOk = requireNativeOk
        });
        var rules = client.InspectAcRules(new AcRuleOptions { Path = fwdPath, ProcessName = processName, RequireNativeOk = requireNativeOk });
        var tree = client.BuildAcTree(new AcTreeOptions
        {
            Path = fwdPath,
            ProcessName = processName,
            IncludeAttributes = true,
            MaxAttributeValueLength = 500,
            MaxHierarchyDepth = 256,
            MaxNodeEntryCount = 100000u,
            MaskSensitiveValues = true,
            RequireNativeOk = requireNativeOk
        });
        var relationships = client.TraceAcRelationships(new AcTraceOptions { Path = fwdPath, ProcessName = processName, IncludeRules = false, RequireNativeOk = requireNativeOk });
        var diagnostics = client.BuildAcDiagnostics(new AcRuleOptions { Path = fwdPath, ProcessName = processName, RequireNativeOk = requireNativeOk });
        var completed = DateTime.UtcNow;

        var snapshot = new WorkbenchSnapshot
        {
            SnapshotId = BuildSnapshotId(fwd.Path ?? fwdPath, processName, requireNativeOk, completed),
            GeneratedAtUtc = completed,
            BuildDurationMs = (long)(completed - started).TotalMilliseconds,
            RequireNativeOk = requireNativeOk,
            FwdPath = fwd.Path ?? fwdPath,
            Fwd = fwd,
            Rules = rules,
            Tree = tree,
            Relationships = relationships,
            Diagnostics = diagnostics
        };

        IndexSnapshot(snapshot);
        return snapshot;
    }

    internal static string BuildSnapshotId(string fwdPath, string processName, bool requireNativeOk, DateTime generatedAtUtc)
    {
        string material = (fwdPath ?? string.Empty).Trim()
            + "|"
            + (string.IsNullOrWhiteSpace(processName) ? "AC" : processName.Trim())
            + "|"
            + requireNativeOk.ToString();

        using var sha = SHA256.Create();
        string digest = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(material)))
            .Replace("-", string.Empty)
            .Substring(0, 12)
            .ToLowerInvariant();

        return "fwd-" + generatedAtUtc.ToString("yyyyMMdd-HHmmss-fffffff") + "-" + digest;
    }

    private static void IndexSnapshot(WorkbenchSnapshot snapshot)
    {
        var scopes = new Dictionary<string, ScopeModel>(StringComparer.OrdinalIgnoreCase);
        var structuralKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (AcTreeNode node in snapshot.Tree.Nodes)
        {
            string scopeId = RuleCorrelation.ScopeId(node);
            ScopeModel scope = GetOrCreateScope(scopes, scopeId, node.ScopeName, node.ScopeType);
            scope.StructuralNodes.Add(node);
            if (node.IsRuleNode)
            {
                scope.StructuralRuleCount++;
                structuralKeys.Add(RuleCorrelation.StructuralKey(node));
            }

            if (node.DisabledState == AcDisabledStates.DisabledDirect) scope.DirectDisabledCount++;
            if (node.DisabledState == AcDisabledStates.DisabledInherited) scope.InheritedDisabledCount++;
        }

        foreach (AcTreeEdge edge in snapshot.Tree.Edges)
        {
            string scopeId = RuleCorrelation.NormalizeScopeId(edge.ScopePath);
            ScopeModel scope = GetOrCreateScope(scopes, scopeId, LastSegment(scopeId), "Unknown");
            scope.StructuralEdges.Add(edge);
        }

        foreach (AcRuleSummary rule in snapshot.Rules.Rules)
        {
            string scopeId = RuleCorrelation.ScopeId(rule);
            ScopeModel scope = GetOrCreateScope(scopes, scopeId, rule.ScopeName, rule.ScopeType);
            scope.FlatRules.Add(rule);
            scope.FlatInventoryCount++;
            if (!structuralKeys.Contains(RuleCorrelation.FlatKey(rule)))
                scope.FlatOnlyCount++;

            if (!snapshot.FlatRulesByScopeId.TryGetValue(scopeId, out List<AcRuleSummary>? flatList))
            {
                flatList = new List<AcRuleSummary>();
                snapshot.FlatRulesByScopeId[scopeId] = flatList;
            }

            flatList.Add(rule);
        }

        foreach (AcRuleRelationship relationship in snapshot.Relationships.Relationships)
        {
            string scopeId = RuleCorrelation.ScopeId(relationship.ScopePath, relationship.ScopeType, relationship.ScopeName);
            ScopeModel scope = GetOrCreateScope(scopes, scopeId, relationship.ScopeName, relationship.ScopeType);
            scope.Relationships.Add(relationship);
            scope.ReferenceCount++;

            if (!snapshot.RelationshipsByScopeId.TryGetValue(scopeId, out List<AcRuleRelationship>? relList))
            {
                relList = new List<AcRuleRelationship>();
                snapshot.RelationshipsByScopeId[scopeId] = relList;
            }

            relList.Add(relationship);
        }

        foreach (AcTreeDiagnostic diagnostic in snapshot.Tree.Diagnostics)
        {
            string scopeId = RuleCorrelation.NormalizeScopeId(diagnostic.ScopePath);
            ScopeModel scope = GetOrCreateScope(scopes, scopeId, LastSegment(scopeId), "Unknown");
            scope.TreeDiagnostics.Add(diagnostic);
            scope.DiagnosticCount++;

            if (!snapshot.TreeDiagnosticsByScopeId.TryGetValue(scopeId, out List<AcTreeDiagnostic>? diagList))
            {
                diagList = new List<AcTreeDiagnostic>();
                snapshot.TreeDiagnosticsByScopeId[scopeId] = diagList;
            }

            diagList.Add(diagnostic);
        }

        ApplyStructuralCoverageDiagnostics(snapshot, scopes);

        snapshot.ScopesById = scopes;
        snapshot.FieldCatalogByName = BuildFieldCatalog(snapshot);

        var flatByKey = snapshot.Rules.Rules
            .GroupBy(RuleCorrelation.FlatKey, StringComparer.OrdinalIgnoreCase)
            .Where(g => g.Count() == 1)
            .ToDictionary(g => g.Key, g => g.Single(), StringComparer.OrdinalIgnoreCase);

        foreach (AcTreeNode node in snapshot.Tree.Nodes.Where(n => n.IsRuleNode))
        {
            string nodeId = RuleCorrelation.NodeId(node);
            string scopeId = RuleCorrelation.ScopeId(node);
            string key = RuleCorrelation.StructuralKey(node);

            bool hasFlatRule = flatByKey.TryGetValue(key, out AcRuleSummary? flat);
            var model = new RuleModel
            {
                NodeId = nodeId,
                ScopeId = scopeId,
                Node = node,
                FlatRule = hasFlatRule ? flat : null,
                Authority = hasFlatRule ? "StructuralTree+FlatInventory" : "StructuralTree",
                DisabledAuthority = node.DisabledState == AcDisabledStates.DisabledDirect
                    ? "StructuralDirect"
                    : node.DisabledState == AcDisabledStates.DisabledInherited
                        ? "StructuralInherited"
                        : "Structural"
            };

            if (model.FlatRule != null && node.DisabledState != AcDisabledStates.Enabled)
            {
                model.FlatRule.DisabledState = node.DisabledState;
                model.FlatRule.DisabledConfidence = node.DisabledConfidence;
                model.FlatRule.DisabledReason = "Structural tree disabled state is authoritative for this matched rule.";
                model.FlatRule.DisabledEvidence.Clear();
                model.FlatRule.DisabledEvidence.AddRange(node.DisabledEvidence);
            }

            if (snapshot.RelationshipsByScopeId.TryGetValue(scopeId, out List<AcRuleRelationship>? rels))
            {
                foreach (AcRuleRelationship relationship in rels.Where(r => RelationshipMatchesNode(r, node)))
                    model.Relationships.Add(relationship);
            }

            if (snapshot.TreeDiagnosticsByScopeId.TryGetValue(scopeId, out List<AcTreeDiagnostic>? diags))
            {
                foreach (AcTreeDiagnostic diagnostic in diags.Where(d => d.NodeId == node.NodeId))
                    model.Diagnostics.Add(diagnostic);
            }

            model.FieldResolutions.AddRange(ResolveRuleFieldReferences(snapshot, model));

            snapshot.RulesByNodeId[nodeId] = model;
            snapshot.RulesByStructuralKey[key] = model;
        }

        ResolveEdgeActionNamesFromFlatInventory(snapshot);
        snapshot.EditorModel = FormWorksEditorModelBuilder.Build(snapshot);
    }

    private static void ResolveEdgeActionNamesFromFlatInventory(WorkbenchSnapshot snapshot)
    {
        foreach (ScopeModel scope in snapshot.ScopesById.Values)
        {
            foreach (AcTreeEdge edge in scope.StructuralEdges)
            {
                if (edge.ActionNameResolved || edge.ActionListIndex < 0)
                    continue;

                string parentNodeId = "node-" + edge.FromNodeId.ToString("000000");
                if (!snapshot.RulesByNodeId.TryGetValue(parentNodeId, out RuleModel? parentRule))
                    continue;

                List<string>? names = parentRule.FlatRule?.ActionNames;
                if (names == null || edge.ActionListIndex >= names.Count)
                    continue;

                string value = names[edge.ActionListIndex];
                if (string.IsNullOrWhiteSpace(value))
                    continue;

                edge.ActionName = value.Trim();
                edge.ActionNameResolved = true;
                edge.Evidence = string.IsNullOrWhiteSpace(edge.Evidence)
                    ? "Action label resolved from matched flat rule inventory ActionNames."
                    : edge.Evidence + " Action label resolved from matched flat rule inventory ActionNames.";
            }
        }
    }

    private static ScopeModel GetOrCreateScope(Dictionary<string, ScopeModel> scopes, string scopeId, string name, string kind)
    {
        if (string.IsNullOrWhiteSpace(scopeId)) scopeId = "AC/Unknown";
        if (!scopes.TryGetValue(scopeId, out ScopeModel? scope))
        {
            scope = new ScopeModel
            {
                ScopeId = scopeId,
                Name = string.IsNullOrWhiteSpace(name) ? LastSegment(scopeId) : name,
                Kind = string.IsNullOrWhiteSpace(kind) ? InferKind(scopeId) : kind
            };
            scopes[scopeId] = scope;
        }

        return scope;
    }

    private static void ApplyStructuralCoverageDiagnostics(WorkbenchSnapshot snapshot, Dictionary<string, ScopeModel> scopes)
    {
        foreach (ScopeModel scope in scopes.Values)
        {
            scope.StructuralCoverageGap = Math.Max(0, scope.FlatInventoryCount - scope.StructuralRuleCount);
            scope.StructuralCoverageRatio = scope.StructuralRuleCount <= 0
                ? scope.FlatInventoryCount > 0 ? double.PositiveInfinity : 1.0d
                : (double)scope.FlatInventoryCount / scope.StructuralRuleCount;
            scope.StructuralCoverageFailure = IsStructuralCoverageFailure(scope);

            if (!scope.StructuralCoverageFailure)
                continue;

            var diagnostic = new AcTreeDiagnostic
            {
                Severity = "Critical",
                ScopePath = scope.ScopeId,
                NodeId = null,
                Category = "StructuralCoverageFailure",
                Message = scope.FlatInventoryCount + " flat inventory rows were extracted, but only " + scope.StructuralRuleCount + " structural rule nodes were parsed. Treat this scope as unreconciled; do not use it for order, route, or disabled-state review until extraction is corrected."
            };

            scope.TreeDiagnostics.Add(diagnostic);
            scope.DiagnosticCount++;

            if (!snapshot.TreeDiagnosticsByScopeId.TryGetValue(scope.ScopeId, out List<AcTreeDiagnostic>? diagList))
            {
                diagList = new List<AcTreeDiagnostic>();
                snapshot.TreeDiagnosticsByScopeId[scope.ScopeId] = diagList;
            }

            diagList.Add(diagnostic);
        }
    }

    private static bool IsStructuralCoverageFailure(ScopeModel scope)
    {
        if (scope.FlatInventoryCount <= 0)
            return false;

        if (scope.StructuralRuleCount <= 0)
            return true;

        int gap = scope.FlatInventoryCount - scope.StructuralRuleCount;
        return (scope.FlatInventoryCount > scope.StructuralRuleCount * 2 && gap > 100) || gap > 500;
    }

    private static bool RelationshipMatchesNode(AcRuleRelationship relationship, AcTreeNode node)
    {
        // Relationship evidence is accepted only when the flat relationship row
        // agrees with the structural ordinal and at least one identity signal.
        // A GUID-only match is deliberately not enough because repeated GUIDs
        // are common in copied/reused AC rules.
        if (relationship.RuleIndex != node.RuleIndexWithinScope)
            return false;

        if (!string.IsNullOrWhiteSpace(node.RuleGuid) && RuleCorrelation.Eq(relationship.RuleGuid, node.RuleGuid)) return true;
        if (RuleCorrelation.Eq(relationship.FunctionName, node.FunctionName) && RuleCorrelation.Eq(relationship.RuleName, node.RuleName)) return true;
        if (RuleCorrelation.Eq(relationship.FunctionName, node.FunctionName) && string.IsNullOrWhiteSpace(relationship.RuleName)) return true;
        return false;
    }

    private static string LastSegment(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "Unknown";
        string[] parts = value.Trim('/').Split('/');
        return parts.Length == 0 ? value : parts[parts.Length - 1];
    }

    private static string InferKind(string scopeId)
    {
        if (scopeId.IndexOf("/Pages/", StringComparison.OrdinalIgnoreCase) >= 0) return "Page";
        if (scopeId.IndexOf("/Documents/", StringComparison.OrdinalIgnoreCase) >= 0) return "Document";
        if (scopeId.IndexOf("/Batches/", StringComparison.OrdinalIgnoreCase) >= 0) return "Batch";
        return "Unknown";
    }

    private static Dictionary<string, List<FieldCatalogEntry>> BuildFieldCatalog(WorkbenchSnapshot snapshot)
    {
        var result = new Dictionary<string, List<FieldCatalogEntry>>(StringComparer.OrdinalIgnoreCase);
        foreach (FieldBucket bucket in snapshot.Fwd.Fields)
        {
            foreach (FieldSummary field in bucket.Fields)
            {
                string name = (field.Name ?? string.Empty).Trim();
                if (string.IsNullOrWhiteSpace(name))
                    continue;

                var entry = new FieldCatalogEntry
                {
                    Name = name,
                    ScopeType = bucket.ScopeType ?? string.Empty,
                    ScopeName = bucket.ScopeName ?? string.Empty,
                    FieldType = field.Type,
                    Geometry = field.Geometry
                };

                ParseGeometry(field.Geometry, out int? x, out int? y, out int? width, out int? height);
                entry.X = x;
                entry.Y = y;
                entry.Width = width;
                entry.Height = height;

                if (!result.TryGetValue(name, out List<FieldCatalogEntry>? entries))
                {
                    entries = new List<FieldCatalogEntry>();
                    result[name] = entries;
                }

                entries.Add(entry);
            }
        }

        return result;
    }

    private static IEnumerable<RuleFieldResolutionEntry> ResolveRuleFieldReferences(WorkbenchSnapshot snapshot, RuleModel model)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (KeyValuePair<string, List<string>> parameter in model.Node.Parameters)
        {
            string parameterName = parameter.Key ?? string.Empty;
            foreach (string rawValue in parameter.Value)
            {
                string parameterValue = (rawValue ?? string.Empty).Trim();
                foreach (string token in TokenizeFieldCandidates(parameterValue))
                {
                    if (token.Length < 2)
                        continue;

                    string dedupeKey = parameterName + "|" + parameterValue + "|" + token;
                    if (!seen.Add(dedupeKey))
                        continue;

                    bool hasMatch = snapshot.FieldCatalogByName.TryGetValue(token, out List<FieldCatalogEntry>? matches);
                    bool fieldLikeParam = LooksLikeFieldParameter(parameterName);
                    if (!hasMatch && !fieldLikeParam)
                        continue;

                    var entry = new RuleFieldResolutionEntry
                    {
                        ParameterName = parameterName,
                        ParameterValue = parameterValue,
                        ReferencedField = token,
                        FieldExists = hasMatch,
                        Confidence = hasMatch ? (fieldLikeParam ? "High" : "Medium") : "Low"
                    };

                    if (matches != null)
                        entry.Matches.AddRange(matches.Take(10));

                    yield return entry;
                }
            }
        }
    }

    private static IEnumerable<string> TokenizeFieldCandidates(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            yield break;

        string cleaned = value.Trim().Trim('{', '}', '"', '\'').Trim();
        string[] parts = cleaned.Split(new[] { ',', ';', '|', '\r', '\n', '\t', ' ' }, StringSplitOptions.RemoveEmptyEntries);
        foreach (string part in parts)
        {
            string token = part.Trim().Trim('{', '}', '"', '\'').Trim();
            if (token.Length < 2 || token.Length > 120)
                continue;

            if (!token.All(c => char.IsLetterOrDigit(c) || c == '_' || c == '-' || c == '.'))
                continue;

            if (char.IsDigit(token[0]))
                continue;

            yield return token;
        }
    }

    private static bool LooksLikeFieldParameter(string parameterName)
    {
        if (string.IsNullOrWhiteSpace(parameterName))
            return false;

        string key = parameterName.ToLowerInvariant();
        return key.Contains("field") || key.Contains("column");
    }

    private static void ParseGeometry(string? geometry, out int? x, out int? y, out int? width, out int? height)
    {
        x = null;
        y = null;
        width = null;
        height = null;

        if (string.IsNullOrWhiteSpace(geometry))
            return;

        string[] numbers = new string((geometry ?? string.Empty).Select(c => (char.IsDigit(c) || c == '-') ? c : ' ').ToArray())
            .Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
        if (numbers.Length < 4)
            return;

        if (int.TryParse(numbers[0], out int px)) x = px;
        if (int.TryParse(numbers[1], out int py)) y = py;
        if (int.TryParse(numbers[2], out int pw)) width = pw;
        if (int.TryParse(numbers[3], out int ph)) height = ph;
    }
}
