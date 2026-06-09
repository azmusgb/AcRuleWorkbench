using System;
using System.Net;

namespace AcRuleWorkbench.Api.V1;

internal static class Phase6RuleKeys
{
    // NOTE: Phase 6 task requires GET /api/v1/rules/{key}.
    // The repository already uses structural node ids (node-000000) and rule correlation keys.
    // For Phase 6 minimal identity hydration, we start with a canonical key that is stable
    // and unambiguous for structural nodes.
    //
    // Canonical: rule:<scopeType>:<scopeName>:AC:node:<nodeId>
    // Where scopeType is "page" or "document".

    public static string MakeForStructuralNode(string scopeType, string scopeName, int nodeId)
    {
        if (string.IsNullOrWhiteSpace(scopeType)) throw new ArgumentNullException(nameof(scopeType));
        if (string.IsNullOrWhiteSpace(scopeName)) throw new ArgumentNullException(nameof(scopeName));

        string encodedScopeName = WebUtility.UrlEncode(scopeName) ?? "";
        return $"rule:{scopeType}:{encodedScopeName}:AC:node:{nodeId}";
    }

    public static bool TryParse(string? key, out Phase6RuleKey parsed, out string? error)
    {
        error = null;
        parsed = default;

        if (string.IsNullOrWhiteSpace(key))
        {
            error = "rule_key_invalid: key is empty.";
            return false;
        }

        // Expected: rule:<scopeType>:<encodedScopeName>:AC:node:<nodeId>
        string[] parts = key.Trim().Split(':');
        if (parts.Length < 7)
        {
            error = "rule_key_invalid: key did not match expected format.";
            return false;
        }

        if (!parts[0].Equals("rule", StringComparison.OrdinalIgnoreCase))
        {
            error = "rule_key_invalid: missing 'rule' prefix.";
            return false;
        }

        string scopeType = parts[1];
        if (!scopeType.Equals("page", StringComparison.OrdinalIgnoreCase) && !scopeType.Equals("document", StringComparison.OrdinalIgnoreCase))
        {
            error = "rule_key_invalid: scope type must be page or document.";
            return false;
        }

        // encoded scope name can contain ':' so we rebuild from parts[2..n-4]
        // structure is: rule | scopeType | encodedScopeName... | AC | node | nodeId
        // so we locate last 3 tokens: AC, node, nodeId
        int acIndex = -1;
        for (int i = 2; i < parts.Length; i++)
        {
            if (parts[i].Equals("AC", StringComparison.OrdinalIgnoreCase))
            {
                acIndex = i;
            }
        }

        if (acIndex < 0 || acIndex + 2 >= parts.Length)
        {
            error = "rule_key_invalid: missing AC/node tail.";
            return false;
        }

        // We expect tail: AC:node:<nodeId>
        if (!parts[acIndex + 1].Equals("node", StringComparison.OrdinalIgnoreCase))
        {
            error = "rule_key_invalid: missing node token.";
            return false;
        }

        string encodedScopeName = string.Join(":", parts, 2, acIndex - 2);
        string decoded;
        try { decoded = WebUtility.UrlDecode(encodedScopeName) ?? string.Empty; }
        catch
        {
            error = "rule_key_invalid: encoded scope name is not URL-decodable.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(decoded))
        {
            error = "rule_key_invalid: decoded scope name is empty.";
            return false;
        }

        if (!int.TryParse(parts[acIndex + 2], out int nodeId) || nodeId < 0)
        {
            error = "rule_key_invalid: nodeId is invalid.";
            return false;
        }

        parsed = new Phase6RuleKey(scopeType.Equals("page", StringComparison.OrdinalIgnoreCase) ? "page" : "document", decoded, nodeId);
        return true;
    }
}

internal readonly record struct Phase6RuleKey(string ScopeType, string ScopeDisplayName, int NodeId);

