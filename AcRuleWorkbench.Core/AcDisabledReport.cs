using System;
using System.Collections.Generic;
using System.Linq;

namespace AcRuleWorkbench.Core;

public sealed class AcDisabledReport
{
    public string FwdPath { get; set; } = string.Empty;

    public string ProcessName { get; set; } = "AC";

    public int RuleCount { get; set; }

    public int DirectDisabledCount { get; set; }

    public int InheritedDisabledCount { get; set; }

    public int PossiblyInheritedDisabledCount { get; set; }

    public int EnabledCount { get; set; }

    public List<AcDisabledScopeSummary> Scopes { get; } = new();

    public List<AcDisabledBlock> DisabledBlocks { get; } = new();

    public List<AcRuleSummary> Rules { get; } = new();

    public List<AcRuleCount> RulesByDisabledState { get; } = new();

    public List<AcRuleCount> RulesByScope { get; } = new();

    public List<string> Warnings { get; } = new();

    public void RebuildCounts()
    {
        RuleCount = Rules.Count;
        DirectDisabledCount = Rules.Count(r => r.DisabledState == AcDisabledStates.DisabledDirect);
        InheritedDisabledCount = Rules.Count(r => r.DisabledState == AcDisabledStates.DisabledInherited);
        PossiblyInheritedDisabledCount = Rules.Count(r => r.DisabledState == AcDisabledStates.DisabledInherited || r.DisabledState == AcDisabledStates.PossiblyDisabledInherited || r.DisabledState == AcDisabledStates.PossibleDisabledSequenceOnly);
        EnabledCount = Rules.Count(r => string.IsNullOrWhiteSpace(r.DisabledState) || r.DisabledState == AcDisabledStates.Enabled);

        RulesByDisabledState.Clear();
        RulesByDisabledState.AddRange(Rules
            .GroupBy(r => string.IsNullOrWhiteSpace(r.DisabledState) ? AcDisabledStates.Enabled : r.DisabledState)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
            .Select(g => new AcRuleCount { Name = g.Key, Count = g.Count() }));

        RulesByScope.Clear();
        RulesByScope.AddRange(Rules
            .GroupBy(r => string.IsNullOrWhiteSpace(r.ScopeName) ? "(unknown)" : r.ScopeType + ":" + r.ScopeName)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
            .Select(g => new AcRuleCount { Name = g.Key, Count = g.Count() }));

        Scopes.Clear();
        Scopes.AddRange(Rules
            .GroupBy(r => r.ScopePath)
            .OrderBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
            .Select(g => new AcDisabledScopeSummary
            {
                ScopePath = g.Key,
                ScopeType = g.First().ScopeType,
                ScopeName = g.First().ScopeName,
                RuleCount = g.Count(),
                DirectDisabledCount = g.Count(r => r.DisabledState == AcDisabledStates.DisabledDirect),
                InheritedDisabledCount = g.Count(r => r.DisabledState == AcDisabledStates.DisabledInherited),
                PossiblyInheritedDisabledCount = g.Count(r => r.DisabledState == AcDisabledStates.DisabledInherited || r.DisabledState == AcDisabledStates.PossiblyDisabledInherited || r.DisabledState == AcDisabledStates.PossibleDisabledSequenceOnly),
                EnabledCount = g.Count(r => string.IsNullOrWhiteSpace(r.DisabledState) || r.DisabledState == AcDisabledStates.Enabled)
            }));
    }
}

public sealed class AcDisabledScopeSummary
{
    public string ScopePath { get; set; } = string.Empty;
    public string ScopeType { get; set; } = string.Empty;
    public string ScopeName { get; set; } = string.Empty;
    public int RuleCount { get; set; }
    public int DirectDisabledCount { get; set; }
    public int InheritedDisabledCount { get; set; }
    public int PossiblyInheritedDisabledCount { get; set; }
    public int EnabledCount { get; set; }
}

public sealed class AcDisabledBlock
{
    public string ScopePath { get; set; } = string.Empty;
    public string ScopeType { get; set; } = string.Empty;
    public string ScopeName { get; set; } = string.Empty;
    public int AncestorRuleIndex { get; set; }
    public string? AncestorRuleGuid { get; set; }
    public string? AncestorRuleName { get; set; }
    public string AncestorFunctionName { get; set; } = string.Empty;
    public int AffectedRuleCount { get; set; }
    public string Confidence { get; set; } = "Medium";
    public string BoundaryMethod { get; set; } = "SameScopeFollowingRules";
    public string Reason { get; set; } = string.Empty;
    public List<int> AffectedRuleIndexes { get; } = new();
}

public static class AcDisabledStates
{
    public const string Enabled = "Enabled";
    public const string DisabledDirect = "DisabledDirect";
    public const string DisabledInherited = "DisabledInherited";
    public const string PossiblyDisabledInherited = "PossiblyDisabledInherited";
    public const string PossibleDisabledSequenceOnly = "PossibleDisabledSequenceOnly";
}
