using System;
using System.Text;
using System.Text.RegularExpressions;
using System.Net;

namespace AcRuleWorkbench.Api.V1;

internal static class Phase6RuleListKeys
{
    // Canonical Phase-6 key formats (as specified in TODO_PHASE6.md)
    // ruleList:page:<encodedPageName>:AC
    // ruleList:document:<encodedDocumentName>:AC

    private static readonly Regex KeyRegex = new Regex(
        "^ruleList:(?<ownerType>page|document):(?<encodedName>[^:]+):AC$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static bool TryParse(string? key, out Phase6RuleListOwner owner, out string? ownerDisplayName, out string? error)
    {
        ownerDisplayName = null;
        error = null;

        if (string.IsNullOrWhiteSpace(key))
        {
            error = "rule_list_key_invalid: key is empty.";
            owner = default;
            return false;
        }

        string trimmedKey = key!.Trim();
        Match m = KeyRegex.Match(trimmedKey);
        if (!m.Success)
        {
            error = "rule_list_key_invalid: key did not match ruleList:(page|document):<name>:AC.";
            owner = default;
            return false;
        }

        string ownerTypeRaw = m.Groups["ownerType"].Value;
        string encodedName = m.Groups["encodedName"].Value;

        string decoded;
        try
        {
            decoded = WebUtility.UrlDecode(encodedName) ?? string.Empty;
        }
        catch
        {
            error = "rule_list_key_invalid: encoded name is not URL-decodable.";
            owner = default;
            return false;
        }

        if (string.IsNullOrWhiteSpace(decoded))
        {
            error = "rule_list_key_invalid: decoded name is empty.";
            owner = default;
            return false;
        }

        ownerDisplayName = decoded;
        owner = new Phase6RuleListOwner(ownerTypeRaw.Equals("page", StringComparison.OrdinalIgnoreCase) ? "page" : "document", decoded);
        return true;
    }

    public static string EncodePage(string pageName)
    {
        return Build("page", pageName);
    }

    public static string EncodeDocument(string documentName)
    {
        return Build("document", documentName);
    }

    public static string BuildForOwner(string ownerType, string ownerDisplayName)
    {
        return Build(ownerType, ownerDisplayName);
    }

    private static string Build(string ownerType, string ownerDisplayName)
    {
        string safeType = ownerType.Equals("page", StringComparison.OrdinalIgnoreCase) ? "page" : "document";
        if (string.IsNullOrWhiteSpace(ownerDisplayName))
            ownerDisplayName = "";

        string encoded = WebUtility.UrlEncode(ownerDisplayName) ?? "";
        return "ruleList:" + safeType + ":" + encoded + ":AC";
    }
}

internal readonly struct Phase6RuleListOwner
{
    public Phase6RuleListOwner(string ownerType, string ownerDisplayName)
    {
        OwnerType = ownerType;
        OwnerDisplayName = ownerDisplayName;
    }

    public string OwnerType { get; }
    public string OwnerDisplayName { get; }
}

