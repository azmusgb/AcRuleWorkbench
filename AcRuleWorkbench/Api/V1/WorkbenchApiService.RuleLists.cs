using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using AcRuleWorkbench.Api;
using AcRuleWorkbench.Core;

namespace AcRuleWorkbench.Api.V1;

internal sealed partial class WorkbenchApiService
{
    private ApiHttpResult DispatchRuleLists(string tail, HttpListenerRequest request)
    {
        ApiHttpResult? method = RequireMethod(request, "GET");
        if (method != null) return method;

        WorkbenchSnapshot snapshot = GetSnapshot(request);
        string[] parts = tail.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 1)
            return Ok(request, "AcWorkbench.RuleLists", BuildRuleLists(snapshot, request));

        // Phase-6 key format: ruleList:page:<encodedName>:AC or ruleList:document:<encodedName>:AC.
        string joinedKey = DecodeJoined(parts, 1, parts.Length - 1);
        if (joinedKey.StartsWith("ruleList:", StringComparison.OrdinalIgnoreCase))
        {
            if (!Phase6RuleListKeys.TryParse(joinedKey, out Phase6RuleListOwner owner, out string? ownerDisplayName, out string? keyError))
            {
                return Fail(request, "rule_list_key_invalid", keyError ?? "Malformed Phase-6 ruleList key.", 400, joinedKey, "Validate key format.");
            }

            EditorRuleListModel? ruleList = FindRuleListByOwner(snapshot, owner);
            if (ruleList == null)
            {
                return Fail(request, "rule_list_owner_not_found", "AC root rule list owner could not be resolved.", 404, joinedKey, "Inspect editor-model.ruleLists for an exact page/document owner match.");
            }

            return Ok(request, "AcWorkbench.RuleListDto", BuildPhase6RuleListDto(snapshot, joinedKey, owner, ownerDisplayName ?? owner.OwnerDisplayName, ruleList));
        }

        // Legacy / existing behavior: scopeId based rule list detail.
        string scopeId = DecodeJoined(parts, 1, parts.Length - 1);
        EditorRuleListModel? legacyRuleList = snapshot.EditorModel.RuleLists.FirstOrDefault(r => RuleCorrelation.Eq(r.RuleListId, scopeId));
        if (legacyRuleList == null)
            return Fail(request, "RuleListNotFound", "Rule List was not found.", 404, scopeId);

        return Ok(request, "AcWorkbench.RuleListDetail", legacyRuleList);
    }

    private static object BuildPhase6RuleListDto(WorkbenchSnapshot snapshot, string key, Phase6RuleListOwner owner, string ownerDisplayName, EditorRuleListModel ruleList)
    {
        var orderedRules = ruleList.RuleConfigurations
            .OrderBy(rc => rc.Ordinal)
            .ThenBy(rc => rc.NodeId, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var ruleSummaries = new List<object>();
        var ruleKeysInOrder = new List<string>();
        var diagnostics = new List<object>();
        var seenKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (EditorRuleConfigurationModel rc in orderedRules)
        {
            string ruleKey;
            try
            {
                ruleKey = Phase6RuleKeys.MakeForStructuralNode(owner.OwnerType, ownerDisplayName, rc.NodeId);
            }
            catch (Exception ex)
            {
                string fallbackKey = key + ":partial:" + (string.IsNullOrWhiteSpace(rc.NodeId) ? rc.Ordinal.ToString("000000") : UrlEncode(rc.NodeId));
                var failureDiagnostic = Phase6Diagnostic(
                    "rule_entry_parse_failed",
                    "Warning",
                    "Rule entry could not be converted to a canonical Phase-6 key, but the partial rule row was preserved in sequence.",
                    ex.Message,
                    fallbackKey,
                    ruleList.RuleListPath + "/" + rc.Ordinal.ToString("000000"),
                    "Inspect the structural node id for this rule entry.");
                diagnostics.Add(failureDiagnostic);
                ruleKeysInOrder.Add(fallbackKey);
                ruleSummaries.Add(new
                {
                    key = fallbackKey,
                    type = "rule",
                    name = string.IsNullOrWhiteSpace(rc.Name) ? "(unparsed rule)" : rc.Name,
                    path = ruleList.RuleListPath + "/" + rc.Ordinal.ToString("000000"),
                    ordinal = rc.Ordinal,
                    guid = rc.RuleGuid,
                    disabled = new { state = string.IsNullOrWhiteSpace(rc.DisabledState) ? AcDisabledStates.Enabled : rc.DisabledState, authority = rc.DisabledAuthority },
                    scope = owner.OwnerType,
                    ownerKey = owner.OwnerType + ":" + ownerDisplayName,
                    parentRuleListKey = key,
                    functionName = rc.FunctionName,
                    functionKey = string.IsNullOrWhiteSpace(rc.FunctionName) ? null : "function:" + rc.FunctionName,
                    sourceRefs = new object[] { new { source = "EditorModel.RuleConfigurations", nodeId = rc.NodeId, ruleListId = ruleList.RuleListId } },
                    rawAvailable = true,
                    rawSummary = "Partial structural rule configuration was preserved because canonical Phase-6 key generation failed.",
                    parseConfidence = "Failed",
                    diagnostics = new object[] { failureDiagnostic }
                });
                continue;
            }

            if (!seenKeys.Add(ruleKey))
            {
                diagnostics.Add(Phase6Diagnostic(
                    "rule_key_duplicate",
                    "Warning",
                    "Duplicate rule key was generated for a rule entry.",
                    "Duplicate keys indicate repeated structural node ids under the same root rule list.",
                    ruleKey,
                    ruleList.RuleListPath,
                    "Inspect structural rule extraction for duplicate node ids."));
            }

            ruleKeysInOrder.Add(ruleKey);

            var ruleDiagnostics = BuildPhase6RuleDiagnostics(rc, ruleKey, ruleList.RuleListPath).ToList();
            diagnostics.AddRange(ruleDiagnostics);

            ruleSummaries.Add(new
            {
                key = ruleKey,
                type = "rule",
                name = string.IsNullOrWhiteSpace(rc.Name) ? "(unnamed rule)" : rc.Name,
                path = ruleList.RuleListPath + "/" + rc.Ordinal.ToString("000000"),
                ordinal = rc.Ordinal,
                guid = rc.RuleGuid,
                disabled = new { state = string.IsNullOrWhiteSpace(rc.DisabledState) ? AcDisabledStates.Enabled : rc.DisabledState, authority = rc.DisabledAuthority },
                scope = owner.OwnerType,
                ownerKey = owner.OwnerType + ":" + ownerDisplayName,
                parentRuleListKey = key,
                functionName = rc.FunctionName,
                functionKey = string.IsNullOrWhiteSpace(rc.FunctionName) ? null : "function:" + rc.FunctionName,
                sourceRefs = new object[] { new { source = "EditorModel.RuleConfigurations", nodeId = rc.NodeId, ruleListId = ruleList.RuleListId } },
                rawAvailable = true,
                rawSummary = "Structural rule configuration summary is available from the normalized editor model.",
                parseConfidence = ruleDiagnostics.Count == 0 ? "High" : "Partial",
                diagnostics = ruleDiagnostics
            });
        }

        if (ruleKeysInOrder.Count == 0)
        {
            diagnostics.Add(Phase6Diagnostic(
                "rule_list_empty",
                "Info",
                "Rule list is empty.",
                "No rule configurations were found for this AC root.",
                key,
                ruleList.RuleListPath,
                "Inspect snapshot editor-model rule lists for this owner."));
        }

        return new
        {
            key,
            type = "rule-list",
            name = ruleList.Name,
            path = ruleList.RuleListPath,
            scope = owner.OwnerType,
            ownerKey = owner.OwnerType + ":" + ownerDisplayName,
            ownerDisplayName,
            ruleKeysInOrder,
            rules = ruleSummaries,
            sourceRefs = new object[] { new { source = "EditorModel.RuleLists", ruleListId = ruleList.RuleListId } },
            diagnostics,
            hydrationState = ruleKeysInOrder.Count == 0 ? "empty" : "hydrated"
        };
    }

    private static IEnumerable<object> BuildPhase6RuleDiagnostics(EditorRuleConfigurationModel rc, string affectedKey, string path)
    {
        if (string.IsNullOrWhiteSpace(rc.Name))
        {
            yield return Phase6Diagnostic(
                "rule_name_missing",
                "Warning",
                "Rule name is missing.",
                "The structural rule entry did not include a display rule name.",
                affectedKey,
                path,
                "Inspect the raw structural tree node for this rule entry.");
        }

        if (string.IsNullOrWhiteSpace(rc.FunctionName))
        {
            yield return Phase6Diagnostic(
                "rule_function_missing",
                "Warning",
                "Function name is missing.",
                "The structural rule entry did not include a callable function name.",
                affectedKey,
                path,
                "Inspect the rule in the full selected-rule packet or raw structural tree evidence.");
        }
    }

    private static object BuildPhase6RuleDto(WorkbenchSnapshot snapshot, Phase6RuleKey key, RuleModel rule, string originalKey, EditorRuleListModel? parentRuleList)
    {
        AcTreeNode node = rule.Node;
        string parentRuleListKey = Phase6RuleListKeys.BuildForOwner(key.ScopeType, key.ScopeDisplayName);
        string ownerKey = key.ScopeType + ":" + key.ScopeDisplayName;
        string path = (parentRuleList?.RuleListPath ?? rule.ScopeId) + "/" + node.RuleIndexWithinScope.ToString("000000");

        var diagnostics = new List<object>();
        if (string.IsNullOrWhiteSpace(node.RuleName))
        {
            diagnostics.Add(Phase6Diagnostic(
                "rule_name_missing",
                "Warning",
                "Rule name is missing.",
                "The structural rule node did not include a display rule name.",
                originalKey,
                path,
                "Inspect raw structural tree evidence for this node."));
        }
        if (string.IsNullOrWhiteSpace(node.FunctionName))
        {
            diagnostics.Add(Phase6Diagnostic(
                "rule_function_missing",
                "Warning",
                "Function name is missing.",
                "The structural rule node did not include a callable function name.",
                originalKey,
                path,
                "Inspect the full selected-rule packet for parameters and attributes."));
        }

        string? functionName = string.IsNullOrWhiteSpace(node.FunctionName) ? null : node.FunctionName;

        return new
        {
            key = originalKey,
            type = "rule",
            name = string.IsNullOrWhiteSpace(node.RuleName) ? "(unnamed rule)" : node.RuleName,
            path,
            ordinal = node.RuleIndexWithinScope,
            guid = node.RuleGuid,
            ruleId = node.RuleId,
            disabled = DisabledPayload(node),
            scope = key.ScopeType,
            ownerKey,
            ownerDisplayName = key.ScopeDisplayName,
            parentRuleListKey,
            parentRuleListPath = parentRuleList?.RuleListPath ?? rule.ScopeId,
            functionName,
            functionKey = functionName == null ? null : "function:" + functionName,
            functionType = functionName == null ? null : AcFunctionCatalog.InferCategory(functionName!),
            sourceRefs = new object[] { new { source = "StructuralTree", nodeId = rule.NodeId, scopeId = rule.ScopeId } },
            rawAvailable = true,
            rawSummary = "Normalized structural rule node is available. Full status/action/sub-list evidence remains in selected-rule packet and Phase 7 views.",
            parseConfidence = diagnostics.Count == 0 ? "High" : "Partial",
            diagnostics,
            links = new
            {
                selectedRulePacket = "/api/v1/rules/" + UrlEncode(rule.NodeId) + "/editor-model",
                legacyDetail = "/api/v1/rules/" + UrlEncode(rule.NodeId)
            }
        };
    }

    private static object Phase6Diagnostic(string code, string severity, string message, string technicalDetail, string affectedObjectKey, string affectedObjectPath, string suggestedInspectionStep)
    {
        return new
        {
            code,
            severity,
            category = "Phase6",
            message,
            technicalDetail,
            affectedObjectKey,
            affectedObjectPath,
            sourceRefs = Array.Empty<object>(),
            suggestedInspectionStep
        };
    }

    private static EditorRuleListModel? FindRuleListByOwner(WorkbenchSnapshot snapshot, Phase6RuleListOwner owner)
    {
        return snapshot.EditorModel.RuleLists
            .Where(r => OwnerKindMatches(r.Kind, owner.OwnerType))
            .FirstOrDefault(r => OwnerNameMatches(r, owner.OwnerDisplayName));
    }

    private static bool OwnerKindMatches(string? actualKind, string expectedOwnerType)
    {
        string kind = actualKind?.Trim() ?? string.Empty;
        if (kind.Length == 0) return false;
        if (expectedOwnerType.Equals("page", StringComparison.OrdinalIgnoreCase))
            return kind.Equals("page", StringComparison.OrdinalIgnoreCase) || kind.Equals("PageType", StringComparison.OrdinalIgnoreCase);
        if (expectedOwnerType.Equals("document", StringComparison.OrdinalIgnoreCase))
            return kind.Equals("document", StringComparison.OrdinalIgnoreCase) || kind.Equals("DocumentType", StringComparison.OrdinalIgnoreCase);
        return false;
    }

    private static bool OwnerNameMatches(EditorRuleListModel ruleList, string ownerDisplayName)
    {
        if (string.Equals(ruleList.Name, ownerDisplayName, StringComparison.OrdinalIgnoreCase))
            return true;

        string normalizedOwner = RuleCorrelation.NormalizeScopeId(ownerDisplayName);
        string normalizedName = RuleCorrelation.NormalizeScopeId(ruleList.Name);
        if (string.Equals(normalizedName, normalizedOwner, StringComparison.OrdinalIgnoreCase))
            return true;

        string id = RuleCorrelation.NormalizeScopeId(ruleList.RuleListId);
        string[] idParts = id.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
        return idParts.Length > 0 && string.Equals(idParts[idParts.Length - 1], normalizedOwner, StringComparison.OrdinalIgnoreCase);
    }

    private static bool TryResolvePhase6Rule(WorkbenchSnapshot snapshot, Phase6RuleKey key, out RuleModel? rule, out EditorRuleListModel? parentRuleList)
    {
        EditorRuleListModel? resolvedParentRuleList = FindRuleListByOwner(snapshot, new Phase6RuleListOwner(key.ScopeType, key.ScopeDisplayName));
        parentRuleList = resolvedParentRuleList;
        if (resolvedParentRuleList == null)
        {
            rule = null;
            return false;
        }

        string resolvedRuleListId = resolvedParentRuleList.RuleListId;
        if (snapshot.RulesByNodeId.TryGetValue(key.NodeId, out RuleModel? byNodeId) && RuleCorrelation.Eq(byNodeId.ScopeId, resolvedRuleListId))
        {
            rule = byNodeId;
            return true;
        }

        string canonicalNodeId = Phase6RuleKeys.FormatNodeId(key.RawNodeId);
        rule = snapshot.RulesByNodeId.Values.FirstOrDefault(r =>
            RuleCorrelation.Eq(r.ScopeId, resolvedRuleListId) &&
            RuleCorrelation.Eq(r.NodeId, canonicalNodeId));
        return rule != null;
    }

    private object BuildRuleLists(WorkbenchSnapshot snapshot, HttpListenerRequest request)
    {
        string? q = Get(request, "q");
        string? kind = Get(request, "kind");
        var items = snapshot.EditorModel.RuleLists
            .Where(r => string.IsNullOrWhiteSpace(kind) || RuleCorrelation.Eq(r.Kind, kind))
            .Where(r => string.IsNullOrWhiteSpace(q) || RuleCorrelation.Contains(r.Name, q) || RuleCorrelation.Contains(r.RuleListId, q))
            .OrderBy(r => r.RuleListId, StringComparer.OrdinalIgnoreCase)
            .Select(r => new
            {
                r.RuleListId,
                r.Name,
                r.Kind,
                r.StructuralRuleCount,
                r.FlatInventoryCount,
                ruleConfigurationCount = r.RuleConfigurations.Count,
                diagnostics = r.Diagnostics,
                links = new { self = "/api/v1/rule-lists/" + UrlEncode(r.RuleListId) }
            })
            .ToList();

        return new
        {
            count = items.Count,
            items,
            caveat = "Rule Lists are read-only static projections; use selected rule packets for per-rule evidence drill-through."
        };
    }

}
