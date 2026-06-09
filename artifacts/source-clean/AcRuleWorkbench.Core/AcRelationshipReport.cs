using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;

namespace AcRuleWorkbench.Core;

public sealed class AcRelationshipReport
{
    [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
    public string? SnapshotId { get; set; }

    [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
    public DateTime? GeneratedAtUtc { get; set; }

    [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
    public bool? RequireNativeOk { get; set; }

    public string FwdPath { get; set; } = string.Empty;

    public string ProcessName { get; set; } = "AC";

    [JsonProperty(NullValueHandling = NullValueHandling.Ignore)]
    public string? RuleSource { get; set; } = "ac-rule-viewer.rules.json";

    // Distinct rule count represented by this relationship packet.
    // When Rules is not serialized, this count is computed from relationship rows.
    public int RuleCount { get; set; }

    public int RelationshipCount { get; set; }

    public bool Truncated { get; set; }

    public List<AcRuleRelationship> Relationships { get; } = new();

    public List<AcRuleSummary> Rules { get; } = new();

    public bool ShouldSerializeRules() => Rules.Count > 0;

    public List<AcRuleCount> RelationshipsByKind { get; } = new();

    public List<AcRuleCount> RelationshipsByTargetType { get; } = new();

    public List<AcRuleCount> RelationshipsByParameterRole { get; } = new();

    public List<AcRuleCount> RelationshipsByFunction { get; } = new();

    public List<string> Warnings { get; } = new();

    public void RebuildCounts()
    {
        RuleCount = Rules.Count > 0
            ? Rules.Count
            : Relationships
                .GroupBy(r => string.Join("|", r.ScopePath ?? string.Empty, r.RuleGuid ?? string.Empty, r.RuleIndex.ToString(System.Globalization.CultureInfo.InvariantCulture), r.RuleName ?? string.Empty, r.FunctionName ?? string.Empty), StringComparer.OrdinalIgnoreCase)
                .Count();
        RelationshipCount = Relationships.Count;

        RelationshipsByKind.Clear();
        RelationshipsByKind.AddRange(Relationships
            .GroupBy(r => string.IsNullOrWhiteSpace(r.Kind) ? "Unknown" : r.Kind)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key)
            .Select(g => new AcRuleCount { Name = g.Key, Count = g.Count() }));

        RelationshipsByTargetType.Clear();
        RelationshipsByTargetType.AddRange(Relationships
            .GroupBy(r => string.IsNullOrWhiteSpace(r.TargetType) ? "Unknown" : r.TargetType)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key)
            .Select(g => new AcRuleCount { Name = g.Key, Count = g.Count() }));

        RelationshipsByParameterRole.Clear();
        RelationshipsByParameterRole.AddRange(Relationships
            .GroupBy(r => string.IsNullOrWhiteSpace(r.ParameterRole) ? "Unknown" : r.ParameterRole)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key)
            .Select(g => new AcRuleCount { Name = g.Key, Count = g.Count() }));

        RelationshipsByFunction.Clear();
        RelationshipsByFunction.AddRange(Relationships
            .GroupBy(r => string.IsNullOrWhiteSpace(r.FunctionName) ? "(missing)" : r.FunctionName)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key)
            .Select(g => new AcRuleCount { Name = g.Key, Count = g.Count() }));
    }
}

public sealed class AcRuleRelationship
{
    public string ScopePath { get; set; } = string.Empty;

    public string ScopeType { get; set; } = string.Empty;

    public string ScopeName { get; set; } = string.Empty;

    public int RuleIndex { get; set; }

    public string? RuleGuid { get; set; }

    public string? RuleName { get; set; }

    public string? FunctionName { get; set; }

    public string Kind { get; set; } = string.Empty;

    public string TargetType { get; set; } = string.Empty;

    public string Target { get; set; } = string.Empty;

    public string? ParameterName { get; set; }

    public string ParameterRole { get; set; } = "Unknown";

    public bool IsOptionParameter { get; set; }

    public string Confidence { get; set; } = "Medium";

    public string? RelationshipReason { get; set; }

    public string? Evidence { get; set; }
}
