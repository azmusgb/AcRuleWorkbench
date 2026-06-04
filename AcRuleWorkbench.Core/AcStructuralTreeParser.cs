using FormWorks.Core;
using rri.Base;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace AcRuleWorkbench.Core;

/// <summary>
/// Parses the packed AC rule-list byte stream as a structural tree.
/// This parser is based on the same model used by PullACRules: a rule list contains rules,
/// and each rule contains zero or more action sub-lists. ParentNodeId + ActionListIndex are
/// treated as structural evidence and are therefore stronger than flat RuleIndex order.
/// </summary>
internal sealed class AcStructuralTreeParser
{
    private readonly AcTreeOptions _options;
    private readonly AcTreeReport _report;
    private int _nodeCounter;
    private int _ruleCounter;

    public AcStructuralTreeParser(AcTreeOptions options, AcTreeReport report)
    {
        _options = options ?? throw new ArgumentNullException(nameof(options));
        _report = report ?? throw new ArgumentNullException(nameof(report));
    }

    public void ProcessRuleBytes(byte[] data, string scopePath, string scopeType, string scopeName)
    {
        var scope = new AcTreeScopeReport
        {
            ScopePath = scopePath ?? string.Empty,
            ScopeType = scopeType ?? string.Empty,
            ScopeName = scopeName ?? string.Empty
        };
        _report.Scopes.Add(scope);

        if (data == null || data.Length < 2)
        {
            scope.Warnings.Add("No structural rule bytes were available for this AC scope.");
            return;
        }

        try
        {
            _ruleCounter = 0;
            var stream = new RuleByteReader(data);
            int parsedRootCount = 0;

            // Some FWD process-private nodes contain more than one packed rule-list payload
            // concatenated in the same STC object. Earlier versions parsed only the first root
            // tree, which made large Page/Document scopes look structurally incomplete while the
            // flat token inventory still found the later rules. Keep parsing until the payload is
            // exhausted, but only suppress a trailing parse failure when at least one complete
            // root tree has already been decoded.
            while (stream.HasRemainingPayload)
            {
                int startOffset = stream.Offset;
                try
                {
                    DumpRuleTree(stream, scope);
                    parsedRootCount++;
                    stream.SkipTrailingNullPadding();
                }
                catch when (parsedRootCount > 0)
                {
                    stream.Offset = startOffset;
                    break;
                }
            }

            if (parsedRootCount == 0)
                throw new InvalidDataException("No packed structural AC rule-list root was decoded.");

            if (stream.HasRemainingPayload)
            {
                string message = $"Structural parser stopped with {stream.Remaining} unread byte(s) in {scope.ScopePath}. Remaining bytes are retained as diagnostic evidence; flat inventory reconciliation will preserve searchable rules.";
                scope.Warnings.Add(message);
                _report.Diagnostics.Add(new AcTreeDiagnostic
                {
                    Severity = "Warning",
                    ScopePath = scope.ScopePath,
                    Category = "StructuralTrailingPayload",
                    Message = message
                });
            }
        }
        catch (Exception ex)
        {
            bool nonRulePayload = IsLikelyNonRuleTreePayload(scopeType, scopeName, ex);
            string category = nonRulePayload ? "NotRuleTreePayload" : "StructuralParseFailure";
            string severity = nonRulePayload ? "Info" : "Error";
            string message = nonRulePayload
                ? $"Scope {scopePath} does not appear to contain a packed structural AC rule list payload."
                : $"Structural AC tree parse failed for {scopePath}: {ex.GetType().Name}: {ex.Message}";

            scope.Warnings.Add(message);
            if (!nonRulePayload)
                _report.Warnings.Add(message);

            _report.Diagnostics.Add(new AcTreeDiagnostic
            {
                Severity = severity,
                ScopePath = scopePath ?? string.Empty,
                Category = category,
                Message = message
            });
        }
    }

    private void DumpRuleTree(RuleByteReader ups, AcTreeScopeReport scope)
    {
        int rootNodeId = ++_nodeCounter;
        AcTreeNode root = ReadAttrNode(ups, scope, hierarchyLevel: 0, parentNodeId: -1, actionListIndex: -1, nodeId: rootNodeId);
        if (!root.IsRuleNode)
        {
            root.RuleName = string.IsNullOrWhiteSpace(root.RuleName) ? "Root rule list" : root.RuleName;
        }

        ApplyRouteInfo(root, parentNode: null, actionListIndex: -1);
        LoadList(ups, scope, hierarchyLevel: 0, parentNodeId: rootNodeId, actionListIndex: -1);
    }

    private void LoadActionList(RuleByteReader ups, AcTreeScopeReport scope, int hierarchyLevel, int parentNodeId)
    {
        GuardDepth(hierarchyLevel, scope.ScopePath);
        uint subListCount = ReadCountWithGuard(ups, "Action sub-list", hierarchyLevel, scope.ScopePath);

        for (int i = 0; i < subListCount; i++)
            LoadList(ups, scope, hierarchyLevel + 1, parentNodeId, i);
    }

    private void LoadList(RuleByteReader ups, AcTreeScopeReport scope, int hierarchyLevel, int parentNodeId, int actionListIndex)
    {
        GuardDepth(hierarchyLevel, scope.ScopePath);
        uint ruleCount = ReadCountWithGuard(ups, "Rule", hierarchyLevel, scope.ScopePath);

        for (int i = 0; i < ruleCount; i++)
        {
            int nodeId = ++_nodeCounter;
            AcTreeNode node = ReadAttrNode(ups, scope, hierarchyLevel, parentNodeId, actionListIndex, nodeId);
            AcTreeNode? parentNode = parentNodeId > 0 ? _report.Nodes.FirstOrDefault(n => n.NodeId == parentNodeId) : null;
            ApplyRouteInfo(node, parentNode, actionListIndex);

            if (parentNodeId > 0)
            {
                string? actionName = ResolveActionName(parentNode, actionListIndex);
                bool actionNameResolved = !string.IsNullOrWhiteSpace(actionName);

                _report.Edges.Add(new AcTreeEdge
                {
                    ScopePath = scope.ScopePath,
                    FromNodeId = parentNodeId,
                    ToNodeId = nodeId,
                    ActionListIndex = actionListIndex,
                    ActionName = actionName,
                    ActionNameResolved = actionNameResolved,
                    EdgeKind = actionListIndex < 0 ? "RootListEntry" : "ActionSubListChild",
                    Confidence = "Proven",
                    Evidence = actionListIndex < 0
                        ? "Rule appears in the root list parsed from the packed AC bytes."
                        : actionNameResolved
                            ? $"Rule appears under parent node {parentNodeId} action '{actionName}' at action sub-list index {actionListIndex}."
                            : $"Rule appears in action sub-list index {actionListIndex} of parent node {parentNodeId}; no action label was decoded for this branch."
                });
                scope.EdgeCount++;
            }

            LoadActionList(ups, scope, hierarchyLevel + 1, nodeId);
        }
    }

    private static string? ResolveActionName(AcTreeNode? parentNode, int actionListIndex)
    {
        if (parentNode == null || actionListIndex < 0)
            return null;

        if (actionListIndex >= parentNode.ActionNames.Count)
            return null;

        string value = parentNode.ActionNames[actionListIndex];
        return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }

    private AcTreeNode ReadAttrNode(RuleByteReader ups, AcTreeScopeReport scope, int hierarchyLevel, int parentNodeId, int actionListIndex, int nodeId)
    {
        uint length = ups.ReadUInt32();
        if (length > _options.MaxAttrListPayloadBytes)
        {
            throw new InvalidDataException($"Attribute list length {length} exceeds safety limit {_options.MaxAttrListPayloadBytes} at node {nodeId}.");
        }

        byte[] payload = length == 0 ? Array.Empty<byte>() : ups.ReadBytes((int)length);
        var node = new AcTreeNode
        {
            ScopePath = scope.ScopePath,
            ScopeType = scope.ScopeType,
            ScopeName = scope.ScopeName,
            NodeId = nodeId,
            ParentNodeId = parentNodeId,
            ActionListIndex = actionListIndex,
            HierarchyLevel = hierarchyLevel
        };

        if (payload.Length > 2)
        {
            try
            {
                using var attrs = new AttrList(payload);
                foreach (string key in attrs.Keys)
                {
                    string value = SafePrintAttr(attrs, key);
                    if (string.IsNullOrWhiteSpace(value))
                        continue;

                    AssignAttribute(node, key, value);
                    if (_options.IncludeAttributes)
                        node.Attributes[NormalizeKey(key)] = MaskAndTruncate(key, value);
                }
            }
            catch (Exception ex)
            {
                _report.Diagnostics.Add(new AcTreeDiagnostic
                {
                    Severity = "Warning",
                    ScopePath = scope.ScopePath,
                    NodeId = nodeId,
                    Category = "AttrListParseFailure",
                    Message = $"Could not parse AttrList payload for node {nodeId}: {ex.GetType().Name}: {ex.Message}"
                });
            }
        }

        node.IsRuleNode = !string.IsNullOrWhiteSpace(node.RuleGuid)
            || !string.IsNullOrWhiteSpace(node.RuleName)
            || !string.IsNullOrWhiteSpace(node.FunctionName);

        if (node.IsRuleNode)
            node.RuleIndexWithinScope = ++_ruleCounter;

        ApplyDirectDisabled(node);
        _report.Nodes.Add(node);
        return node;
    }

    public void ApplyInheritedDisabledState()
    {
        var byParent = _report.Nodes.GroupBy(n => n.ParentNodeId).ToDictionary(g => g.Key, g => g.ToList());
        var byId = _report.Nodes.ToDictionary(n => n.NodeId, n => n);

        foreach (AcTreeNode root in _report.Nodes.Where(n => n.ParentNodeId < 0).OrderBy(n => n.NodeId))
            PropagateDisabled(root, inheritedAncestor: null, byParent, byId);
    }

    private static void PropagateDisabled(AcTreeNode node, AcTreeNode? inheritedAncestor, Dictionary<int, List<AcTreeNode>> byParent, Dictionary<int, AcTreeNode> byId)
    {
        AcTreeNode? activeAncestor = inheritedAncestor;

        if (node.DisabledState == AcDisabledStates.DisabledDirect)
        {
            activeAncestor = node;
        }
        else if (activeAncestor != null && node.IsRuleNode)
        {
            node.DisabledState = AcDisabledStates.DisabledInherited;
            node.DisabledConfidence = "High";
            node.DisabledAncestorNodeId = activeAncestor.NodeId;
            node.DisabledAncestorRuleGuid = activeAncestor.RuleGuid;
            node.DisabledAncestorRuleName = activeAncestor.RuleName;
            node.DisabledReason = $"Structural child of disabled rule node {activeAncestor.NodeId}.";
            node.DisabledEvidence.Add($"Parent/ancestor node {activeAncestor.NodeId} is DisabledDirect or DisabledInherited in the parsed AC rule tree.");
        }

        if (!byParent.TryGetValue(node.NodeId, out List<AcTreeNode>? children))
            return;

        foreach (AcTreeNode child in children.OrderBy(c => c.ActionListIndex).ThenBy(c => c.RuleIndexWithinScope).ThenBy(c => c.NodeId))
            PropagateDisabled(child, activeAncestor, byParent, byId);
    }

    private static void ApplyDirectDisabled(AcTreeNode node)
    {
        bool disabled = node.Sources.Any(s => string.Equals(s, "_Disabled", StringComparison.OrdinalIgnoreCase))
            || node.Attributes.Any(kv => string.Equals(kv.Key, "_Disabled", StringComparison.OrdinalIgnoreCase)
                || string.Equals(kv.Value, "_Disabled", StringComparison.OrdinalIgnoreCase));

        if (!disabled)
            return;

        node.DisabledState = AcDisabledStates.DisabledDirect;
        node.DisabledConfidence = "High";
        node.DisabledReason = "Rule has direct _Disabled evidence in sources or attributes.";
        node.DisabledEvidence.Add("Direct _Disabled marker found in structural rule payload.");
    }

    private static string SafePrintAttr(AttrList attrs, string key)
    {
        try
        {
            return NormalizeScalarValue(attrs.Print(key));
        }
        catch
        {
            return string.Empty;
        }
    }

    private void AssignAttribute(AcTreeNode node, string key, string value)
    {
        string normalized = NormalizeKey(key);
        switch (normalized)
        {
            case "_RuleGUID":
                node.RuleGuid ??= value;
                break;
            case "_RuleID":
                node.RuleId ??= value;
                break;
            case "_RuleName":
                node.RuleName ??= value;
                break;
            case "_FunctionName":
                node.FunctionName ??= value;
                break;
            case "_FunctionVersion":
                node.FunctionVersion ??= value;
                break;
            case "_Description":
                node.Description ??= value;
                break;
            case "_ActionNames":
            case "ActionNames":
                AddSplitValues(node.ActionNames, value);
                break;
            case "_Sources":
            case "Sources":
                AddSplitValues(node.Sources, value);
                break;
            case "_Disabled":
                AddDistinct(node.Sources, "_Disabled");
                node.DisabledEvidence.Add("_Disabled attribute key found in structural AttrList payload.");
                break;
            default:
                if (IsParameterKey(normalized))
                    AddParameterValue(node, normalized, value);
                break;
        }
    }

    private static bool IsParameterKey(string key)
    {
        return key.StartsWith("_ParamList", StringComparison.OrdinalIgnoreCase)
            || key.StartsWith("ParamList", StringComparison.OrdinalIgnoreCase)
            || string.Equals(key, "AttrName", StringComparison.OrdinalIgnoreCase)
            || string.Equals(key, "RejectString", StringComparison.OrdinalIgnoreCase)
            || string.Equals(key, "Value", StringComparison.OrdinalIgnoreCase)
            || string.Equals(key, "PageNums", StringComparison.OrdinalIgnoreCase);
    }

    private static void AddParameterValue(AcTreeNode node, string key, string value)
    {
        if (!node.Parameters.TryGetValue(key, out List<string>? values))
        {
            values = new List<string>();
            node.Parameters[key] = values;
        }

        bool suppressNegativeOne = key.IndexOf("OMRIndex", StringComparison.OrdinalIgnoreCase) >= 0;
        if (IsListLikeParameterKey(key))
            AddSplitValues(values, value, suppressNegativeOne);
        else
            AddDistinct(values, value);
    }

    private static bool IsListLikeParameterKey(string key)
    {
        return key.StartsWith("_ParamList", StringComparison.OrdinalIgnoreCase)
            || key.StartsWith("ParamList", StringComparison.OrdinalIgnoreCase)
            || key.Equals("PageNums", StringComparison.OrdinalIgnoreCase)
            || key.EndsWith("List", StringComparison.OrdinalIgnoreCase)
            || key.EndsWith("Fields", StringComparison.OrdinalIgnoreCase);
    }

    private static void AddSplitValues(List<string> target, string value)
    {
        AddSplitValues(target, value, suppressNegativeOne: false);
    }

    private static void AddSplitValues(List<string> target, string value, bool suppressNegativeOne)
    {
        foreach (string part in SplitNormalizedValues(value))
        {
            if (suppressNegativeOne && string.Equals(part, "-1", StringComparison.OrdinalIgnoreCase))
                continue;

            AddDistinct(target, part);
        }
    }

    private static IEnumerable<string> SplitNormalizedValues(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            yield break;

        string listText = StripOuterBraces(value.Trim()).Replace("\\\"", "\"").Trim();

        // AttrList.Print commonly returns FormWorks status/action names as:
        //     Yes\",\"No
        // after scalar unescaping. That is not a normal quoted CSV string because
        // the first and last quotes are stripped by the native printer. Split that
        // shape before falling back to the generic FormWorks-list tokenizer.
        if (listText.IndexOf("\",\"", StringComparison.Ordinal) >= 0)
        {
            foreach (string item in Regex.Split(listText, "\\\"\\s*,\\s*\\\""))
            {
                string normalized = NormalizeScalarValue(item);
                if (!string.IsNullOrWhiteSpace(normalized))
                    yield return normalized;
            }
            yield break;
        }

        foreach (string item in TokenizeFormWorksList(listText))
        {
            string normalized = NormalizeScalarValue(item);
            if (!string.IsNullOrWhiteSpace(normalized))
                yield return normalized;
        }
    }

    private static IEnumerable<string> TokenizeFormWorksList(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            yield break;

        var current = new System.Text.StringBuilder();
        int braceDepth = 0;
        bool inQuote = false;
        bool escaped = false;

        foreach (char ch in value)
        {
            if (escaped)
            {
                current.Append(ch);
                escaped = false;
                continue;
            }

            if (ch == '\\')
            {
                current.Append(ch);
                escaped = true;
                continue;
            }

            if (ch == '"')
            {
                inQuote = !inQuote;
                current.Append(ch);
                continue;
            }

            if (!inQuote)
            {
                if (ch == '{')
                {
                    braceDepth++;
                    current.Append(ch);
                    continue;
                }

                if (ch == '}')
                {
                    if (braceDepth > 0) braceDepth--;
                    current.Append(ch);
                    continue;
                }

                if (braceDepth == 0 && (ch == ',' || ch == ';' || ch == '|' || ch == '\r' || ch == '\n' || ch == '\t'))
                {
                    string token = current.ToString().Trim();
                    if (token.Length > 0) yield return token;
                    current.Clear();
                    continue;
                }
            }

            current.Append(ch);
        }

        string finalToken = current.ToString().Trim();
        if (finalToken.Length > 0)
            yield return finalToken;
    }

    private static void AddDistinct(List<string> target, string value)
    {
        string normalized = NormalizeScalarValue(value);
        if (string.IsNullOrWhiteSpace(normalized))
            return;

        if (!target.Any(existing => string.Equals(existing, normalized, StringComparison.OrdinalIgnoreCase)))
            target.Add(normalized);
    }

    private static string NormalizeScalarValue(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        string text = value.Trim()
            .Replace("\\015\\012", Environment.NewLine)
            .Replace("\\r\\n", Environment.NewLine)
            .Replace("\\n", Environment.NewLine)
            .Replace("\\r", Environment.NewLine)
            .Replace("\\\"", "\"");

        for (int i = 0; i < 6; i++)
        {
            string next = StripOuterQuotes(StripOuterBraces(text)).Trim();
            if (string.Equals(next, text, StringComparison.Ordinal))
                break;

            text = next;
        }

        for (int i = 0; i < 3; i++)
        {
            string next = text.Trim().Trim('{', '}', '"').Trim();
            if (string.Equals(next, text, StringComparison.Ordinal))
                break;

            text = next;
        }

        return text.Trim();
    }

    private static string StripOuterBraces(string value)
    {
        string text = value.Trim();
        while (text.Length >= 2 && text[0] == '{' && text[text.Length - 1] == '}')
            text = text.Substring(1, text.Length - 2).Trim();

        return text;
    }

    private static string StripOuterQuotes(string value)
    {
        string text = value.Trim();
        while (text.Length >= 2 && text[0] == '"' && text[text.Length - 1] == '"')
            text = text.Substring(1, text.Length - 2).Trim();

        return text;
    }

    private static bool IsLikelyNonRuleTreePayload(string scopeType, string scopeName, Exception ex)
    {
        if (string.Equals(scopeType, "System", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(scopeName, "System", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return ex is ArgumentOutOfRangeException || ex is EndOfStreamException;
    }

    private static string NormalizeKey(string key)
    {
        return string.IsNullOrWhiteSpace(key) ? string.Empty : key.Trim();
    }

    private string MaskAndTruncate(string key, string value)
    {
        string safe = _options.MaskSensitiveValues && IsSensitiveKey(key) ? "********" : value;
        int max = _options.MaxAttributeValueLength <= 0 ? 500 : _options.MaxAttributeValueLength;
        return safe.Length <= max ? safe : safe.Substring(0, max) + "...";
    }

    private static bool IsSensitiveKey(string key)
    {
        if (string.IsNullOrWhiteSpace(key))
            return false;

        string normalized = key.Trim().ToLowerInvariant();
        return normalized.Contains("password")
            || normalized.Contains("passwd")
            || normalized.Contains("pwd")
            || normalized.Contains("secret")
            || normalized.Contains("token")
            || normalized.Contains("apikey")
            || normalized.Contains("api_key")
            || normalized.Contains("connectionstring")
            || normalized.Contains("connection_string")
            || normalized.Contains("connstring")
            || normalized.Contains("connstr");
    }

    private static void ApplyRouteInfo(AcTreeNode node, AcTreeNode? parentNode, int actionListIndex)
    {
        node.Route.Clear();

        if (parentNode != null)
        {
            foreach (AcRuleRouteSegment segment in parentNode.Route)
                node.Route.Add(segment);
        }

        string? actionName = ResolveActionName(parentNode, actionListIndex);
        node.Route.Add(new AcRuleRouteSegment
        {
            NodeId = node.NodeId,
            RuleGuid = node.RuleGuid,
            RuleName = node.RuleName,
            FunctionName = node.FunctionName,
            ActionListIndex = actionListIndex >= 0 ? actionListIndex : null,
            ActionName = actionName
        });

        node.RuleListPath = BuildMachineRoutePath(node);
        node.StructuralPath = node.RuleListPath;
        node.DisplayPath = BuildDisplayRoutePath(node);
    }

    private static string BuildMachineRoutePath(AcTreeNode node)
    {
        if (node.ParentNodeId < 0 || node.Route.Count <= 1)
            return "Root";

        return string.Join("/", node.Route.Select(r =>
        {
            string action = r.ActionListIndex.HasValue ? "Action:" + r.ActionListIndex.Value : "Root";
            return $"Node:{r.NodeId}:{action}";
        }));
    }

    private static string BuildDisplayRoutePath(AcTreeNode node)
    {
        if (node.Route.Count == 0)
            return "Root";

        return string.Join(" > ", node.Route.Select(r =>
        {
            string name = string.IsNullOrWhiteSpace(r.RuleName) ? (r.FunctionName ?? ("Node " + r.NodeId)) : r.RuleName!;
            if (!r.ActionListIndex.HasValue)
                return name;

            string action = string.IsNullOrWhiteSpace(r.ActionName) ? ("Action " + r.ActionListIndex.Value) : r.ActionName!;
            return action + " / " + name;
        }));
    }

    private void GuardDepth(int hierarchyLevel, string scopePath)
    {
        int limit = _options.MaxHierarchyDepth <= 0 ? 256 : _options.MaxHierarchyDepth;
        if (hierarchyLevel > limit)
            throw new InvalidDataException($"Hierarchy depth {hierarchyLevel} exceeds safety limit {limit} in {scopePath}.");
    }

    private uint ReadCountWithGuard(RuleByteReader ups, string label, int hierarchyLevel, string scopePath)
    {
        uint count = ups.ReadUInt32();
        uint limit = _options.MaxNodeEntryCount == 0 ? 100000u : _options.MaxNodeEntryCount;
        if (count > limit)
        {
            throw new InvalidDataException($"{label} count {count} exceeds safety limit {limit} at hierarchy level {hierarchyLevel} in {scopePath}.");
        }

        return count;
    }


    private sealed class RuleByteReader
    {
        private readonly byte[] _data;

        public RuleByteReader(byte[] data)
        {
            _data = data ?? Array.Empty<byte>();
        }

        public int Offset { get; set; }

        public int Remaining => Math.Max(0, _data.Length - Offset);

        public bool HasRemainingPayload
        {
            get
            {
                int i = Offset;
                while (i < _data.Length && _data[i] == 0)
                    i++;
                return _data.Length - i >= 4;
            }
        }

        public uint ReadUInt32()
        {
            EnsureAvailable(4);
            uint value = 0;
            for (int i = 0; i < 4; i++)
                value += (uint)_data[Offset + i] << (8 * i);
            Offset += 4;
            return value;
        }

        public byte[] ReadBytes(int length)
        {
            if (length < 0)
                throw new InvalidDataException("Negative byte length requested from AC structural payload.");

            EnsureAvailable(length);
            byte[] result = new byte[length];
            Buffer.BlockCopy(_data, Offset, result, 0, length);
            Offset += length;
            return result;
        }

        public void SkipTrailingNullPadding()
        {
            while (Offset < _data.Length && _data[Offset] == 0)
                Offset++;
        }

        private void EnsureAvailable(int length)
        {
            if (length < 0 || Offset + length > _data.Length)
                throw new EndOfStreamException($"AC structural payload ended at offset {Offset}; requested {length} byte(s), remaining {Remaining}.");
        }
    }

}
