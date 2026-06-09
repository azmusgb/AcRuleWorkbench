using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

namespace AcRuleWorkbench.Core;

/// <summary>
/// Keeps the read-only FW Editor Viewer complete without exposing parser mechanics as the product model.
/// Structural AC/DV nodes remain authoritative for normal Rule List and Action List placement.
/// Flat inventory rows that cannot be matched to decoded structural nodes are shown under an
/// explicit "Additional Rules" branch so users can still search and inspect them.
/// </summary>
public static class AcTreeFlatInventoryReconciler
{
    private const string AdditionalRulesRootName = "Additional Rules";

    public static int ReconcileFlatInventoryIntoTree(AcTreeReport tree, AcRuleReport rules)
    {
        if (tree == null) throw new ArgumentNullException(nameof(tree));
        if (rules == null) throw new ArgumentNullException(nameof(rules));
        if (rules.Rules.Count == 0)
            return 0;

        int added = 0;
        int nextNodeId = tree.Nodes.Count == 0 ? 1 : tree.Nodes.Max(n => n.NodeId) + 1;
        var structuralByScope = tree.Nodes
            .Where(n => n.IsRuleNode)
            .GroupBy(ScopeId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.OrderBy(n => n.RuleIndexWithinScope).ThenBy(n => n.NodeId).ToList(), StringComparer.OrdinalIgnoreCase);

        foreach (IGrouping<string, AcRuleSummary> flatScope in rules.Rules.GroupBy(ScopeId, StringComparer.OrdinalIgnoreCase))
        {
            string scopeId = flatScope.Key;
            List<AcTreeNode> structuralNodes = structuralByScope.TryGetValue(scopeId, out List<AcTreeNode>? existing)
                ? existing
                : new List<AcTreeNode>();

            var matchedStructuralNodeIds = new HashSet<int>();
            var additionalRules = new List<AcRuleSummary>();

            foreach (AcRuleSummary flatRule in flatScope.OrderBy(r => r.RuleIndex))
            {
                AcTreeNode? match = FindBestStructuralMatch(flatRule, structuralNodes, matchedStructuralNodeIds);
                if (match == null)
                {
                    additionalRules.Add(flatRule);
                }
                else
                {
                    matchedStructuralNodeIds.Add(match.NodeId);
                }
            }

            if (additionalRules.Count == 0)
                continue;

            AcTreeNode root = GetOrCreateScopeRoot(tree, scopeId, additionalRules[0], ref nextNodeId);
            AcTreeNode additionalRoot = GetOrCreateAdditionalRulesRoot(tree, root, additionalRules[0], ref nextNodeId);

            foreach (AcRuleSummary flatRule in additionalRules)
            {
                int nodeId = nextNodeId++;
                var node = CreateAdditionalRuleNode(flatRule, additionalRoot, nodeId);
                tree.Nodes.Add(node);
                structuralNodes.Add(node);
                added++;

                tree.Edges.Add(new AcTreeEdge
                {
                    ScopePath = flatRule.ScopePath,
                    FromNodeId = additionalRoot.NodeId,
                    ToNodeId = node.NodeId,
                    EdgeKind = "AdditionalRule",
                    ActionListIndex = -1,
                    ActionName = null,
                    ActionNameResolved = false,
                    Confidence = "Inventory",
                    Evidence = "Rule was loaded from the AC rule inventory, but confirmed Rule List / Action List placement was not available. It is shown under Additional Rules for read-only inspection and search."
                });
            }

            tree.Diagnostics.Add(new AcTreeDiagnostic
            {
                Severity = "Info",
                ScopePath = scopeId,
                Category = "AdditionalRules",
                Message = $"{additionalRules.Count} rule(s) are available under Additional Rules because their Rule List / Action List placement could not be confirmed."
            });
        }

        tree.RebuildCounts();
        return added;
    }

    public static string ScopeId(AcRuleSummary rule) => ScopeId(rule.ScopePath, rule.ScopeType, rule.ScopeName);

    public static string ScopeId(AcTreeNode node) => ScopeId(node.ScopePath, node.ScopeType, node.ScopeName);

    public static string ScopeId(string? scopePath, string? scopeType, string? scopeName)
    {
        if (!string.IsNullOrWhiteSpace(scopePath))
            return NormalizeScopeId(scopePath!);

        string type = string.IsNullOrWhiteSpace(scopeType) ? "Unknown" : scopeType!.Trim();
        string name = string.IsNullOrWhiteSpace(scopeName) ? "Unknown" : scopeName!.Trim();
        return NormalizeScopeId("AC/" + PluralizeScopeType(type) + "/" + name);
    }

    public static string NormalizeScopeId(string value)
    {
        string text = (value ?? string.Empty).Trim().Replace('\\', '/');
        while (text.Contains("//"))
            text = text.Replace("//", "/");
        return text.Trim('/');
    }

    public static string FlatKey(AcRuleSummary rule)
    {
        return MakeKey(ScopeId(rule), rule.RuleGuid, rule.RuleId, rule.RuleName, rule.FunctionName, rule.RuleIndex);
    }

    public static string StructuralKey(AcTreeNode node)
    {
        return MakeKey(ScopeId(node), node.RuleGuid, node.RuleId, node.RuleName, node.FunctionName, node.RuleIndexWithinScope);
    }

    private static AcTreeNode? FindBestStructuralMatch(AcRuleSummary flatRule, List<AcTreeNode> structuralNodes, HashSet<int> alreadyMatched)
    {
        AcTreeNode? sameIndex = structuralNodes
            .Where(n => !alreadyMatched.Contains(n.NodeId) && n.RuleIndexWithinScope == flatRule.RuleIndex)
            .FirstOrDefault(n => RulesLikelyMatch(flatRule, n));
        if (sameIndex != null)
            return sameIndex;

        AcTreeNode? sameIdentity = structuralNodes
            .Where(n => !alreadyMatched.Contains(n.NodeId) && SameNormalizedIdentity(flatRule, n))
            .OrderBy(n => Math.Abs(n.RuleIndexWithinScope - flatRule.RuleIndex))
            .ThenBy(n => n.NodeId)
            .FirstOrDefault();
        if (sameIdentity != null)
            return sameIdentity;

        return null;
    }

    private static bool RulesLikelyMatch(AcRuleSummary flatRule, AcTreeNode node)
    {
        bool sameGuid = !string.IsNullOrWhiteSpace(flatRule.RuleGuid)
            && string.Equals(flatRule.RuleGuid, node.RuleGuid, StringComparison.OrdinalIgnoreCase);
        bool sameFunctionAndName = NormalizedToken(flatRule.FunctionName) == NormalizedToken(node.FunctionName)
            && NormalizedToken(flatRule.RuleName) == NormalizedToken(node.RuleName);
        return sameGuid || sameFunctionAndName;
    }

    private static bool SameNormalizedIdentity(AcRuleSummary flatRule, AcTreeNode node)
    {
        if (!string.IsNullOrWhiteSpace(flatRule.RuleGuid) && !string.Equals(flatRule.RuleGuid, node.RuleGuid, StringComparison.OrdinalIgnoreCase))
            return false;

        return NormalizedToken(flatRule.FunctionName) == NormalizedToken(node.FunctionName)
            && NormalizedToken(flatRule.RuleName) == NormalizedToken(node.RuleName);
    }

    private static string NormalizedToken(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        string normalized = (value ?? string.Empty).Trim().ToLowerInvariant();
        var builder = new StringBuilder(normalized.Length);
        bool lastWasSpace = false;
        foreach (char c in normalized)
        {
            if (char.IsLetterOrDigit(c))
            {
                builder.Append(c);
                lastWasSpace = false;
            }
            else if (!lastWasSpace)
            {
                builder.Append(' ');
                lastWasSpace = true;
            }
        }

        return builder.ToString().Trim();
    }

    private static AcTreeNode GetOrCreateScopeRoot(AcTreeReport tree, string scopeId, AcRuleSummary firstRule, ref int nextNodeId)
    {
        AcTreeNode? root = tree.Nodes
            .Where(n => ScopeId(n) == scopeId && n.ParentNodeId < 0 && !n.IsRuleNode)
            .OrderBy(n => n.NodeId)
            .FirstOrDefault();
        if (root != null)
            return root;

        root = new AcTreeNode
        {
            NodeId = nextNodeId++,
            ParentNodeId = -1,
            ActionListIndex = -1,
            HierarchyLevel = 0,
            RuleIndexWithinScope = 0,
            ScopePath = firstRule.ScopePath,
            ScopeType = firstRule.ScopeType,
            ScopeName = firstRule.ScopeName,
            IsRuleNode = false,
            RuleName = "Root rule list",
            RuleListPath = "Root",
            StructuralPath = "Root",
            DisplayPath = "Root"
        };
        root.Attributes["_ReaderStatus"] = "Root created so Additional Rules can be shown in a normal read-only FW Editor Viewer tree.";
        tree.Nodes.Add(root);
        return root;
    }

    private static AcTreeNode GetOrCreateAdditionalRulesRoot(AcTreeReport tree, AcTreeNode scopeRoot, AcRuleSummary firstRule, ref int nextNodeId)
    {
        AcTreeNode? existing = tree.Nodes
            .Where(n => ScopeId(n) == ScopeId(scopeRoot)
                && n.ParentNodeId == scopeRoot.NodeId
                && !n.IsRuleNode
                && (string.Equals(n.RuleName, AdditionalRulesRootName, StringComparison.OrdinalIgnoreCase)
                    || n.Attributes.ContainsKey("_AdditionalRulesRoot")))
            .OrderBy(n => n.NodeId)
            .FirstOrDefault();
        if (existing != null)
            return existing;

        var node = new AcTreeNode
        {
            NodeId = nextNodeId++,
            ParentNodeId = scopeRoot.NodeId,
            ActionListIndex = -1,
            HierarchyLevel = scopeRoot.HierarchyLevel + 1,
            RuleIndexWithinScope = int.MaxValue - 1,
            ScopePath = firstRule.ScopePath,
            ScopeType = firstRule.ScopeType,
            ScopeName = firstRule.ScopeName,
            IsRuleNode = false,
            RuleName = AdditionalRulesRootName,
            Description = "Rules available for read-only inspection whose exact Rule List / Action List placement was not confirmed.",
            RuleListPath = AdditionalRulesRootName,
            StructuralPath = AdditionalRulesRootName,
            DisplayPath = AdditionalRulesRootName
        };
        node.Attributes["_AdditionalRulesRoot"] = "true";
        node.Attributes["_ReaderStatus"] = "Rules below this branch are searchable and inspectable, but their parent/action placement is not confirmed.";
        tree.Nodes.Add(node);

        tree.Edges.Add(new AcTreeEdge
        {
            ScopePath = firstRule.ScopePath,
            FromNodeId = scopeRoot.NodeId,
            ToNodeId = node.NodeId,
            EdgeKind = "AdditionalRulesGroup",
            ActionListIndex = -1,
            ActionName = AdditionalRulesRootName,
            ActionNameResolved = true,
            Confidence = "Inventory",
            Evidence = "Read-only grouping branch for rules recovered from inventory without confirmed placement."
        });

        return node;
    }

    private static AcTreeNode CreateAdditionalRuleNode(AcRuleSummary flatRule, AcTreeNode additionalRoot, int nodeId)
    {
        string displayName = string.IsNullOrWhiteSpace(flatRule.RuleName)
            ? flatRule.FunctionName ?? ("Rule " + flatRule.RuleIndex)
            : flatRule.RuleName!;

        var node = new AcTreeNode
        {
            NodeId = nodeId,
            ParentNodeId = additionalRoot.NodeId,
            ActionListIndex = -1,
            HierarchyLevel = additionalRoot.HierarchyLevel + 1,
            RuleIndexWithinScope = flatRule.RuleIndex,
            ScopePath = flatRule.ScopePath,
            ScopeType = flatRule.ScopeType,
            ScopeName = flatRule.ScopeName,
            IsRuleNode = true,
            RuleGuid = flatRule.RuleGuid,
            RuleId = flatRule.RuleId,
            RuleName = flatRule.RuleName,
            FunctionName = flatRule.FunctionName,
            FunctionVersion = flatRule.FunctionVersion,
            Description = flatRule.Description,
            RuleListPath = AdditionalRulesRootName + "/" + flatRule.RuleIndex.ToString("000000"),
            StructuralPath = AdditionalRulesRootName + "/" + flatRule.RuleIndex.ToString("000000"),
            DisplayPath = AdditionalRulesRootName + " > " + displayName,
            DisabledState = flatRule.DisabledState,
            DisabledConfidence = flatRule.DisabledConfidence,
            DisabledReason = flatRule.DisabledReason
        };

        node.ActionNames.AddRange(flatRule.ActionNames.Where(v => !string.IsNullOrWhiteSpace(v)).Distinct(StringComparer.OrdinalIgnoreCase));
        node.Sources.AddRange(flatRule.Sources.Where(v => !string.IsNullOrWhiteSpace(v)).Distinct(StringComparer.OrdinalIgnoreCase));
        foreach (KeyValuePair<string, List<string>> kv in flatRule.Parameters)
            node.Parameters[kv.Key] = kv.Value.Where(v => !string.IsNullOrWhiteSpace(v)).Distinct(StringComparer.OrdinalIgnoreCase).ToList();

        node.Attributes["_AdditionalRule"] = "true";
        node.Attributes["_ReaderStatus"] = "Loaded from rule inventory. Rule is visible/searchable; confirmed Rule List / Action List placement is unavailable.";
        node.DisabledEvidence.AddRange(flatRule.DisabledEvidence);
        node.Route.Add(new AcRuleRouteSegment
        {
            NodeId = node.NodeId,
            RuleGuid = node.RuleGuid,
            RuleName = node.RuleName,
            FunctionName = node.FunctionName,
            ActionListIndex = null,
            ActionName = AdditionalRulesRootName
        });

        return node;
    }

    private static string MakeKey(string scopeId, string? guid, string? ruleId, string? ruleName, string? functionName, int index)
    {
        string safeName = ruleName ?? string.Empty;
        string safeFunction = functionName ?? string.Empty;

        if (!string.IsNullOrWhiteSpace(ruleId))
            return (scopeId + "|id:" + ruleId + "|idx:" + index + "|name:" + safeName + "|fn:" + safeFunction).ToLowerInvariant();

        if (!string.IsNullOrWhiteSpace(guid))
            return (scopeId + "|guid:" + guid + "|idx:" + index + "|name:" + safeName + "|fn:" + safeFunction).ToLowerInvariant();

        return (scopeId + "|idx:" + index + "|name:" + safeName + "|fn:" + safeFunction).ToLowerInvariant();
    }

    private static string PluralizeScopeType(string type)
    {
        if (type.Equals("Page", StringComparison.OrdinalIgnoreCase)) return "Pages";
        if (type.Equals("Document", StringComparison.OrdinalIgnoreCase)) return "Documents";
        if (type.Equals("Batch", StringComparison.OrdinalIgnoreCase)) return "Batches";
        if (type.EndsWith("s", StringComparison.OrdinalIgnoreCase)) return type;
        return type + "s";
    }
}
