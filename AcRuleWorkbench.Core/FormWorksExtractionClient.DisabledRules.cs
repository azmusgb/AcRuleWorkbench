using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Diagnostics;
using Newtonsoft.Json;
using AcRuleWorkbench.Core.Interop;
using Microsoft.Extensions.Logging;
using rri.fwd;
using rri.ocr2;
namespace AcRuleWorkbench.Core;

public sealed partial class FormWorksExtractionClient : IFormWorksExtractionClient
{
    public AcDisabledReport AnalyzeDisabledRules(AcDisabledOptions options)
    {
        if (options == null)
            throw new ArgumentNullException(nameof(options));
        options.CancellationToken.ThrowIfCancellationRequested();

        var ruleOptions = new AcRuleOptions
        {
            Path = options.Path,
            ProcessName = string.IsNullOrWhiteSpace(options.ProcessName) ? "AC" : options.ProcessName,
            Term = options.Term,
            Scope = options.Scope,
            Function = options.Function,
            RequireNativeOk = options.RequireNativeOk
        };

        AcRuleReport rules = InspectAcRules(ruleOptions);

        // Re-apply the selected disabled propagation mode after rule extraction. The default
        // intentionally marks downstream same-scope rules as inherited-disabled when a direct
        // disabled gate is found. This is a conservative inspection signal, not a runtime proof.
        AnnotateDisabledStates(rules, options.InheritDisabled);

        var report = new AcDisabledReport
        {
            FwdPath = rules.FwdPath,
            ProcessName = rules.ProcessName
        };
        report.Warnings.AddRange(rules.Warnings);

        foreach (AcDisabledBlock block in BuildDisabledBlocks(rules))
            report.DisabledBlocks.Add(block);

        IEnumerable<AcRuleSummary> selected = rules.Rules;

        string stateFilter = options.State ?? string.Empty;
        if (!string.IsNullOrWhiteSpace(stateFilter))
        {
            string state = NormalizeDisabledState(stateFilter.Trim());
            selected = selected.Where(r => string.Equals(r.DisabledState, state, StringComparison.OrdinalIgnoreCase));
        }
        else
        {
            selected = selected.Where(r => r.DisabledState != AcDisabledStates.Enabled);
        }

        report.Rules.AddRange(selected);

        report.RebuildCounts();
        return report;
    }

private static void AnnotateDisabledStates(AcRuleReport report, bool inheritDisabled)
    {
        if (report == null)
            throw new ArgumentNullException(nameof(report));

        foreach (AcRuleSummary rule in report.Rules)
            ResetDisabledState(rule);

        foreach (AcRuleSummary rule in report.Rules.Where(IsDirectlyDisabled))
            MarkDirectDisabled(rule);

        if (!inheritDisabled)
            return;

        AcRuleFlowReport flow = BuildFlowReport(report, includeHeuristicSequence: true);
        var byKey = report.Rules.ToDictionary(r => r.ScopePath + "#" + r.RuleIndex, StringComparer.OrdinalIgnoreCase);

        // Parsed skip/branch descendants can be marked inherited. Heuristic sequence descendants
        // are intentionally marked as possible only, because order alone is not runtime branch proof.
        foreach (AcRuleSummary ancestor in report.Rules.Where(r => r.DisabledState == AcDisabledStates.DisabledDirect))
        {
            string ancestorKey = ancestor.ScopePath + "#" + ancestor.RuleIndex;
            foreach (AcRuleFlowEdge edge in flow.Edges.Where(e => string.Equals(e.ScopePath + "#" + e.FromRuleIndex, ancestorKey, StringComparison.OrdinalIgnoreCase)))
            {
                if (!edge.ToRuleIndex.HasValue)
                    continue;

                if (!byKey.TryGetValue(edge.ScopePath + "#" + edge.ToRuleIndex.Value, out AcRuleSummary target))
                    continue;

                if (target.DisabledState == AcDisabledStates.DisabledDirect)
                    continue;

                bool provenByFlow = edge.Confidence == AcEvidenceConfidence.Proven ||
                                    edge.Confidence == AcEvidenceConfidence.Parsed ||
                                    edge.EdgeKind == AcRuleFlowEdgeKind.SkipToRule ||
                                    edge.EdgeKind == AcRuleFlowEdgeKind.BackupSkipToRule ||
                                    edge.EdgeKind == AcRuleFlowEdgeKind.ActionBranch ||
                                    edge.EdgeKind == AcRuleFlowEdgeKind.ActionToSubList;

                if (provenByFlow && edge.EdgeKind != AcRuleFlowEdgeKind.SequentialNext)
                    MarkInheritedDisabled(target, ancestor, edge, hardInherited: true);
                else if (edge.EdgeKind == AcRuleFlowEdgeKind.SequentialNext)
                    MarkInheritedDisabled(target, ancestor, edge, hardInherited: false);
            }
        }

        // Conservative sequence fallback: once a direct disabled rule appears, subsequent same-scope
        // rules are marked only as possibly inherited-disabled until action-map/sub-list proof exists.
        foreach (IGrouping<string, AcRuleSummary> scopeGroup in report.Rules.GroupBy(r => r.ScopePath))
        {
            AcRuleSummary? currentDirectDisabled = null;
            foreach (AcRuleSummary rule in scopeGroup.OrderBy(r => r.RuleIndex))
            {
                if (rule.DisabledState == AcDisabledStates.DisabledDirect)
                {
                    currentDirectDisabled = rule;
                    continue;
                }

                if (currentDirectDisabled == null || rule.DisabledState != AcDisabledStates.Enabled)
                    continue;

                MarkPossiblyInheritedBySequence(rule, currentDirectDisabled);
            }
        }
    }

private static bool IsDirectlyDisabled(AcRuleSummary rule)
    {
        return rule.Sources.Any(source => string.Equals(source, "_Disabled", StringComparison.OrdinalIgnoreCase)) ||
               rule.Parameters.Any(pair => pair.Value.Any(value => string.Equals(value, "_Disabled", StringComparison.OrdinalIgnoreCase)));
    }

private static void ResetDisabledState(AcRuleSummary rule)
    {
        rule.DisabledState = AcDisabledStates.Enabled;
        rule.DisabledConfidence = "High";
        rule.DisabledReason = null;
        rule.DisabledAncestorRuleIndex = null;
        rule.DisabledAncestorRuleGuid = null;
        rule.DisabledAncestorRuleName = null;
        rule.DisabledBoundaryMethod = null;
        rule.DisabledEvidence.Clear();
    }

private static void MarkDirectDisabled(AcRuleSummary rule)
    {
        rule.DisabledState = AcDisabledStates.DisabledDirect;
        rule.DisabledConfidence = "High";
        rule.DisabledReason = "Rule contains a direct disabled marker such as _Disabled.";
        rule.DisabledBoundaryMethod = "DirectSourceMarker";
        rule.DisabledEvidence.Add("Source/parameter marker: _Disabled");
    }

private static void MarkInheritedDisabled(AcRuleSummary rule, AcRuleSummary ancestor, AcRuleFlowEdge edge, bool hardInherited)
    {
        rule.DisabledState = hardInherited ? AcDisabledStates.DisabledInherited : AcDisabledStates.PossibleDisabledSequenceOnly;
        rule.DisabledConfidence = hardInherited ? "High" : "Low";
        rule.DisabledReason = hardInherited
            ? "Rule is reached through a parsed flow edge from a directly disabled rule."
            : "Rule follows a directly disabled rule by sequence edge only; branch proof is not available.";
        rule.DisabledAncestorRuleIndex = ancestor.RuleIndex;
        rule.DisabledAncestorRuleGuid = ancestor.RuleGuid;
        rule.DisabledAncestorRuleName = ancestor.RuleName;
        rule.DisabledBoundaryMethod = hardInherited ? edge.EdgeKind : "SequenceFallback";
        rule.DisabledEvidence.Add($"Inherited from #{ancestor.RuleIndex} {ancestor.RuleName ?? "(unnamed)"}");
        rule.DisabledEvidence.Add($"Flow edge: {edge.EdgeKind}; confidence: {edge.Confidence}; evidence: {edge.Evidence}");
    }

private static void MarkPossiblyInheritedBySequence(AcRuleSummary rule, AcRuleSummary ancestor)
    {
        rule.DisabledState = AcDisabledStates.PossibleDisabledSequenceOnly;
        rule.DisabledConfidence = "Low";
        rule.DisabledReason = "Rule follows a directly disabled rule in the same AC scope, but no decoded structural/action-list edge proves inheritance. This is audit-only sequence evidence.";
        rule.DisabledAncestorRuleIndex = ancestor.RuleIndex;
        rule.DisabledAncestorRuleGuid = ancestor.RuleGuid;
        rule.DisabledAncestorRuleName = ancestor.RuleName;
        rule.DisabledBoundaryMethod = "SameScopeSequenceFallback";
        rule.DisabledEvidence.Add($"Possible inheritance from #{ancestor.RuleIndex} {ancestor.RuleName ?? "(unnamed)"}");
        rule.DisabledEvidence.Add("Propagation method: same-scope following-rule fallback. Treat as possible, not proven.");
    }

private static List<AcDisabledBlock> BuildDisabledBlocks(AcRuleReport report)
    {
        var blocks = new List<AcDisabledBlock>();

        foreach (IGrouping<string, AcRuleSummary> scopeGroup in report.Rules.GroupBy(r => r.ScopePath))
        {
            foreach (AcRuleSummary direct in scopeGroup.Where(r => r.DisabledState == AcDisabledStates.DisabledDirect).OrderBy(r => r.RuleIndex))
            {
                List<AcRuleSummary> affected = scopeGroup
                    .Where(r => r.DisabledAncestorRuleIndex == direct.RuleIndex &&
                                (r.DisabledState == AcDisabledStates.DisabledInherited || r.DisabledState == AcDisabledStates.PossiblyDisabledInherited || r.DisabledState == AcDisabledStates.PossibleDisabledSequenceOnly))
                    .OrderBy(r => r.RuleIndex)
                    .ToList();

                if (affected.Count == 0)
                    continue;

                var block = new AcDisabledBlock
                {
                    ScopePath = direct.ScopePath,
                    ScopeType = direct.ScopeType,
                    ScopeName = direct.ScopeName,
                    AncestorRuleIndex = direct.RuleIndex,
                    AncestorRuleGuid = direct.RuleGuid,
                    AncestorRuleName = direct.RuleName,
                    AncestorFunctionName = direct.FunctionName ?? string.Empty,
                    AffectedRuleCount = affected.Count,
                    Confidence = affected.Any(r => r.DisabledState == AcDisabledStates.PossiblyDisabledInherited || r.DisabledState == AcDisabledStates.PossibleDisabledSequenceOnly) ? "Low/Medium" : "Medium",
                    BoundaryMethod = "SameScopeFollowingRules",
                    Reason = "Directly disabled rule appears to gate subsequent same-scope rules. This is a heuristic disabled-inheritance marker."
                };

                block.AffectedRuleIndexes.AddRange(affected.Select(r => r.RuleIndex));
                blocks.Add(block);
            }
        }

        return blocks;
    }

private static string NormalizeDisabledState(string state)
    {
        if (string.Equals(state, "direct", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(state, "disabled", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(state, AcDisabledStates.DisabledDirect, StringComparison.OrdinalIgnoreCase))
            return AcDisabledStates.DisabledDirect;

        if (string.Equals(state, "inherited", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(state, "inherit", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(state, AcDisabledStates.DisabledInherited, StringComparison.OrdinalIgnoreCase))
            return AcDisabledStates.DisabledInherited;

        if (string.Equals(state, "possible", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(state, "possibly", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(state, AcDisabledStates.PossiblyDisabledInherited, StringComparison.OrdinalIgnoreCase))
            return AcDisabledStates.PossiblyDisabledInherited;

        if (string.Equals(state, "sequence", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(state, "sequence-only", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(state, AcDisabledStates.PossibleDisabledSequenceOnly, StringComparison.OrdinalIgnoreCase))
            return AcDisabledStates.PossibleDisabledSequenceOnly;

        if (string.Equals(state, "enabled", StringComparison.OrdinalIgnoreCase))
            return AcDisabledStates.Enabled;

        return state;
    }
}
