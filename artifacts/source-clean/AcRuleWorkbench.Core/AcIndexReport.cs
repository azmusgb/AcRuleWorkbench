using System.Collections.Generic;
using System.Linq;

namespace AcRuleWorkbench.Core;

public sealed class AcIndexReport
{
    public string FwdPath { get; set; } = string.Empty;

    public string ProcessName { get; set; } = "AC";

    public int RuleCount { get; set; }

    public int RelationshipCount { get; set; }

    public List<AcRuleCount> RulesByScope { get; } = new();

    public List<AcRuleCount> RulesByFunction { get; } = new();

    public List<AcRuleCount> RelationshipsByKind { get; } = new();

    public List<AcRuleCount> FieldsByRelationshipCount { get; } = new();

    public List<AcRuleCount> AttributesByRelationshipCount { get; } = new();

    public List<AcRuleCount> OptionsByRelationshipCount { get; } = new();

    public List<AcRuleCount> RejectMessagesByCount { get; } = new();

    public List<AcRuleCount> DisabledRulesByScope { get; } = new();

    public List<AcRuleCount> DisabledRulesByState { get; } = new();

    public List<string> Warnings { get; } = new();

    public void Rebuild(AcRuleReport rules, AcRelationshipReport relationships)
    {
        FwdPath = rules.FwdPath;
        ProcessName = rules.ProcessName;
        RuleCount = rules.RuleCount;
        RelationshipCount = relationships.RelationshipCount;

        AddCounts(RulesByScope, rules.Rules.GroupBy(r => r.ScopeType + ":" + r.ScopeName));
        AddCounts(RulesByFunction, rules.Rules.GroupBy(r => string.IsNullOrWhiteSpace(r.FunctionName) ? "(missing)" : r.FunctionName));
        AddCounts(RelationshipsByKind, relationships.Relationships.GroupBy(r => string.IsNullOrWhiteSpace(r.Kind) ? "Unknown" : r.Kind));
        AddCounts(FieldsByRelationshipCount, relationships.Relationships.Where(r => r.TargetType == "Field").GroupBy(r => r.Target));
        AddCounts(AttributesByRelationshipCount, relationships.Relationships.Where(r => r.TargetType == "Attribute").GroupBy(r => r.Target));
        AddCounts(OptionsByRelationshipCount, relationships.Relationships.Where(r => r.TargetType == "Option").GroupBy(r => r.Target));
        AddCounts(RejectMessagesByCount, relationships.Relationships.Where(r => r.TargetType == "RejectMessage").GroupBy(r => r.Target));
        AddCounts(DisabledRulesByScope, rules.Rules.Where(r => r.DisabledState != AcDisabledStates.Enabled).GroupBy(r => r.ScopeType + ":" + r.ScopeName));
        AddCounts(DisabledRulesByState, rules.Rules.Where(r => r.DisabledState != AcDisabledStates.Enabled).GroupBy(r => r.DisabledState));

        Warnings.AddRange(rules.Warnings);
        Warnings.AddRange(relationships.Warnings);
    }

    private static void AddCounts<T>(List<AcRuleCount> target, IEnumerable<IGrouping<string, T>> groups)
    {
        target.Clear();
        target.AddRange(groups
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key)
            .Select(g => new AcRuleCount { Name = g.Key, Count = g.Count() }));
    }
}
