using System;
using AcRuleWorkbench.Core;

namespace AcRuleWorkbench.Api.V1;

internal static class RuleCorrelation
{
    public static string ScopeId(string? scopePath, string? scopeType, string? scopeName)
    {
        if (!string.IsNullOrWhiteSpace(scopePath))
            return NormalizeScopeId(scopePath!);

        string type = string.IsNullOrWhiteSpace(scopeType) ? "Unknown" : scopeType!.Trim();
        string name = string.IsNullOrWhiteSpace(scopeName) ? "Unknown" : scopeName!.Trim();
        return NormalizeScopeId("AC/" + PluralizeScopeType(type) + "/" + name);
    }

    public static string ScopeId(AcRuleSummary rule) => ScopeId(rule.ScopePath, rule.ScopeType, rule.ScopeName);

    public static string ScopeId(AcTreeNode node) => ScopeId(node.ScopePath, node.ScopeType, node.ScopeName);

    public static string NormalizeScopeId(string value)
    {
        string text = (value ?? string.Empty).Trim().Replace('\\', '/');
        while (text.Contains("//"))
            text = text.Replace("//", "/");
        return text.Trim('/');
    }

    public static string NodeId(AcTreeNode node) => "node-" + node.NodeId.ToString("000000");

    public static string InventoryId(AcRuleSummary rule)
    {
        return "flat-" + SafeId(ScopeId(rule)) + "-" + rule.RuleIndex.ToString("000000");
    }

    public static string FlatKey(AcRuleSummary rule)
    {
        return MakeKey(ScopeId(rule), rule.RuleGuid, rule.RuleId, rule.RuleName, rule.FunctionName, rule.RuleIndex);
    }

    public static string StructuralKey(AcTreeNode node)
    {
        return MakeKey(ScopeId(node), node.RuleGuid, node.RuleId, node.RuleName, node.FunctionName, node.RuleIndexWithinScope);
    }

    public static bool Eq(string? left, string? right)
    {
        return string.Equals(left ?? string.Empty, right ?? string.Empty, StringComparison.OrdinalIgnoreCase);
    }

    public static bool Contains(string? text, string? query)
    {
        if (string.IsNullOrWhiteSpace(text) || string.IsNullOrWhiteSpace(query))
            return false;

        return text!.IndexOf(query!, StringComparison.OrdinalIgnoreCase) >= 0;
    }

    public static string SafeId(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return "unknown";

        char[] chars = value!.Trim().ToCharArray();
        for (int i = 0; i < chars.Length; i++)
        {
            char c = chars[i];
            if (!(char.IsLetterOrDigit(c) || c == '-' || c == '_' || c == '.'))
                chars[i] = '_';
        }

        return new string(chars);
    }

    private static string MakeKey(string scopeId, string? guid, string? ruleId, string? ruleName, string? functionName, int index)
    {
        // Do not correlate by scoped GUID alone. FormWorks exports can contain repeated
        // GUID/name/function combinations across copied or repeated rule rows. The key
        // therefore keeps ordinal/name/function context so duplicate groups remain
        // ambiguous instead of being silently collapsed into the first row.
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
