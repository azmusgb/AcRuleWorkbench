using System;
using System.Globalization;
using System.Net;

namespace AcRuleWorkbench.Api.V1;

internal static class Phase6RuleKeys
{
    // Canonical: rule:<scopeType>:<encodedScopeName>:AC:node:<nodeId>
    // Where scopeType is "page" or "document" and nodeId may be either
    // the canonical structural id (node-000005) or its integer value (5).

    public static string MakeForStructuralNode(string scopeType, string scopeName, int nodeId)
    {
        if (nodeId < 0) throw new ArgumentOutOfRangeException(nameof(nodeId));
        return MakeForStructuralNode(scopeType, scopeName, FormatNodeId(nodeId));
    }

    public static string MakeForStructuralNode(string scopeType, string scopeName, string nodeId)
    {
        if (string.IsNullOrWhiteSpace(scopeType)) throw new ArgumentNullException(nameof(scopeType));
        if (string.IsNullOrWhiteSpace(scopeName)) throw new ArgumentNullException(nameof(scopeName));
        if (!TryParseNodeId(nodeId, out int rawNodeId)) throw new ArgumentException("Node id must be a non-negative integer or node-000000 value.", nameof(nodeId));

        string safeScopeType = scopeType.Equals("page", StringComparison.OrdinalIgnoreCase) ? "page" :
            scopeType.Equals("document", StringComparison.OrdinalIgnoreCase) ? "document" :
            throw new ArgumentException("Scope type must be page or document.", nameof(scopeType));

        string encodedScopeName = WebUtility.UrlEncode(scopeName) ?? string.Empty;
        return $"rule:{safeScopeType}:{encodedScopeName}:AC:node:{FormatNodeId(rawNodeId)}";
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
        string trimmedKey = key!.Trim();
        string[] parts = trimmedKey.Split(':');
        if (parts.Length < 6)
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

        // Encoded scope names should normally be one segment, but this keeps
        // manually-created keys with unencoded ':' recoverable by using the last
        // AC:node:<nodeId> tail as the structural delimiter.
        int acIndex = -1;
        for (int i = 2; i < parts.Length; i++)
        {
            if (parts[i].Equals("AC", StringComparison.OrdinalIgnoreCase))
                acIndex = i;
        }

        if (acIndex < 0 || acIndex + 2 >= parts.Length)
        {
            error = "rule_key_invalid: missing AC/node tail.";
            return false;
        }

        if (!parts[acIndex + 1].Equals("node", StringComparison.OrdinalIgnoreCase))
        {
            error = "rule_key_invalid: missing node token.";
            return false;
        }

        if (acIndex + 3 != parts.Length)
        {
            error = "rule_key_invalid: unexpected tokens after node id.";
            return false;
        }

        string encodedScopeName = string.Join(":", parts, 2, acIndex - 2);
        string decoded;
        try
        {
            decoded = WebUtility.UrlDecode(encodedScopeName) ?? string.Empty;
        }
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

        if (!TryParseNodeId(parts[acIndex + 2], out int nodeId))
        {
            error = "rule_key_invalid: nodeId is invalid.";
            return false;
        }

        parsed = new Phase6RuleKey(
            scopeType.Equals("page", StringComparison.OrdinalIgnoreCase) ? "page" : "document",
            decoded,
            nodeId,
            FormatNodeId(nodeId));
        return true;
    }

    public static bool TryParseNodeId(string? nodeId, out int rawNodeId)
    {
        rawNodeId = 0;
        if (string.IsNullOrWhiteSpace(nodeId))
            return false;

        string text = nodeId!.Trim();
        if (text.StartsWith("node-", StringComparison.OrdinalIgnoreCase))
            text = text.Substring("node-".Length);

        return int.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out rawNodeId) && rawNodeId >= 0;
    }

    public static string FormatNodeId(int rawNodeId)
    {
        if (rawNodeId < 0) throw new ArgumentOutOfRangeException(nameof(rawNodeId));
        return "node-" + rawNodeId.ToString("000000", CultureInfo.InvariantCulture);
    }
}

internal readonly struct Phase6RuleKey
{
    public Phase6RuleKey(string scopeType, string scopeDisplayName, int rawNodeId, string nodeId)
    {
        ScopeType = scopeType;
        ScopeDisplayName = scopeDisplayName;
        RawNodeId = rawNodeId;
        NodeId = nodeId;
    }

    public string ScopeType { get; }
    public string ScopeDisplayName { get; }
    public int RawNodeId { get; }
    public string NodeId { get; }
}
