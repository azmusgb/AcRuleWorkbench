using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;

namespace AcRuleWorkbench.Core;

public sealed class AcRuleReport
{
    [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
    public string? SnapshotId { get; set; }

    [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
    public DateTime? GeneratedAtUtc { get; set; }

    [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
    public bool? RequireNativeOk { get; set; }

    public string FwdPath { get; set; } = string.Empty;

    public string ProcessName { get; set; } = "AC";

    public int ScopeCount { get; set; }

    public int RuleCount { get; set; }

    public List<AcRuleScopeReport> Scopes { get; } = new();

    public List<AcRuleSummary> Rules { get; } = new();

    public List<AcRuleCount> RulesByScopeType { get; } = new();

    public List<AcRuleCount> RulesByFunction { get; } = new();

    public List<AcRuleCount> RulesBySource { get; } = new();

    public List<AcRuleCount> RulesByActionName { get; } = new();

    public List<AcRuleCount> RulesByDisabledState { get; } = new();

    public List<string> Warnings { get; } = new();

    public void RebuildCounts()
    {
        ScopeCount = Scopes.Count;
        RuleCount = Rules.Count;

        RulesByScopeType.Clear();
        RulesByScopeType.AddRange(Rules
            .GroupBy(r => string.IsNullOrWhiteSpace(r.ScopeType) ? "Unknown" : r.ScopeType)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key)
            .Select(g => new AcRuleCount { Name = g.Key ?? "(missing)", Count = g.Count() }));

        RulesByFunction.Clear();
        RulesByFunction.AddRange(Rules
            .GroupBy(r => string.IsNullOrWhiteSpace(r.FunctionName) ? "(missing)" : r.FunctionName)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key)
            .Select(g => new AcRuleCount { Name = g.Key ?? "(missing)", Count = g.Count() }));

        RulesBySource.Clear();
        var sourceNames = new List<string>();
        foreach (AcRuleSummary rule in Rules)
        {
            if (rule.Sources.Count == 0)
            {
                sourceNames.Add("(none)");
                continue;
            }

            foreach (string source in rule.Sources)
                sourceNames.Add(string.IsNullOrWhiteSpace(source) ? "(blank)" : source);
        }

        RulesBySource.AddRange(sourceNames
            .GroupBy(s => s)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key)
            .Select(g => new AcRuleCount { Name = g.Key ?? "(missing)", Count = g.Count() }));

        RulesByActionName.Clear();
        var actionNames = new List<string>();
        foreach (AcRuleSummary rule in Rules)
        {
            if (rule.ActionNames.Count == 0)
            {
                actionNames.Add("(none)");
                continue;
            }

            foreach (string actionName in rule.ActionNames)
                actionNames.Add(string.IsNullOrWhiteSpace(actionName) ? "(blank)" : actionName);
        }

        RulesByActionName.AddRange(actionNames
            .GroupBy(s => s)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key)
            .Select(g => new AcRuleCount { Name = g.Key ?? "(missing)", Count = g.Count() }));

        RulesByDisabledState.Clear();
        RulesByDisabledState.AddRange(Rules
            .GroupBy(r => string.IsNullOrWhiteSpace(r.DisabledState) ? AcDisabledStates.Enabled : r.DisabledState)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key)
            .Select(g => new AcRuleCount { Name = g.Key ?? "(missing)", Count = g.Count() }));
    }
}

public sealed class AcRuleScopeReport
{
    public string Path { get; set; } = string.Empty;

    public string ScopeType { get; set; } = string.Empty;

    public string ScopeName { get; set; } = string.Empty;

    public int RuleCount { get; set; }

    public int TokenCount { get; set; }

    public List<string> RawTokens { get; } = new();

    public List<string> Warnings { get; } = new();
}

public sealed class AcRuleSummary
{
    public string ScopePath { get; set; } = string.Empty;

    public string ScopeType { get; set; } = string.Empty;

    public string ScopeName { get; set; } = string.Empty;

    public int RuleIndex { get; set; }

    public string? RuleGuid { get; set; }

    public string? RuleId { get; set; }

    public string? RuleName { get; set; }

    public string? FunctionName { get; set; }

    public string? FunctionVersion { get; set; }

    public string? Description { get; set; }

    public List<string> Sources { get; } = new();

    public List<string> ActionNames { get; } = new();

    public Dictionary<string, List<string>> Parameters { get; } = new();

    // Flow-related fields are parsed from the packed AC payload when available.
    // They are intentionally stored separately from Parameters because they define
    // rule-list control flow, not normal function parameters.
    public string? ActionMapRaw { get; set; }

    public int? SkipId { get; set; }

    public int? BackupSkipId { get; set; }

    public int? RuleCounter { get; set; }

    public string RuleListPath { get; set; } = "Root";

    public string DisabledState { get; set; } = AcDisabledStates.Enabled;

    public string DisabledConfidence { get; set; } = "High";

    public string? DisabledReason { get; set; }

    public int? DisabledAncestorRuleIndex { get; set; }

    public string? DisabledAncestorRuleGuid { get; set; }

    public string? DisabledAncestorRuleName { get; set; }

    public string? DisabledBoundaryMethod { get; set; }

    public List<string> DisabledEvidence { get; } = new();

    public List<string> RawTokens { get; } = new();
}

public sealed class AcRuleCount
{
    public string Name { get; set; } = string.Empty;

    public int Count { get; set; }
}


// Compatibility DTOs retained for older call sites during rapid harness iteration.
public sealed class AcRuleScopeSummary
{
    public string Path { get; set; } = string.Empty;
    public string ScopeType { get; set; } = string.Empty;
    public string ScopeName { get; set; } = string.Empty;
    public int RuleCount { get; set; }
    public int TokenCount { get; set; }
}

public sealed class AcRuleTokenSummary
{
    public string ScopePath { get; set; } = string.Empty;
    public string Token { get; set; } = string.Empty;
    public int Index { get; set; }
}
