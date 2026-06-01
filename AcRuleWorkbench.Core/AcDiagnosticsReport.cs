using System.Collections.Generic;
using System.Linq;

namespace AcRuleWorkbench.Core;

public sealed class AcDiagnosticsReport
{
    public string FwdPath { get; set; } = string.Empty;

    public string ProcessName { get; set; } = "AC";

    public int ScopeCount { get; set; }

    public int RuleCount { get; set; }

    public int RelationshipCount { get; set; }

    public int FlowEdgeCount { get; set; }

    public int ProvenFlowEdgeCount { get; set; }

    public int ParsedFlowEdgeCount { get; set; }

    public int HeuristicFlowEdgeCount { get; set; }

    public int UnknownFlowEdgeCount { get; set; }

    public int MissingRuleGuidCount { get; set; }

    public int MissingRuleIdCount { get; set; }

    public int MissingFunctionCount { get; set; }

    public int RulesWithActionNamesCount { get; set; }

    public int RulesWithActionMapCount { get; set; }

    public int RulesWithSkipIdCount { get; set; }

    public int RulesWithBackupSkipIdCount { get; set; }

    public int UnknownActionTargetCount { get; set; }

    public int UnresolvedSkipTargetCount { get; set; }

    public int DisabledDirectCount { get; set; }

    public int DisabledInheritedCount { get; set; }

    public int PossiblyDisabledInheritedCount { get; set; }

    public List<AcRuleCount> RulesByScope { get; } = new();

    public List<AcRuleCount> RulesByFunction { get; } = new();

    public List<AcRuleCount> FlowEdgesByKind { get; } = new();

    public List<AcRuleCount> FlowEdgesByConfidence { get; } = new();

    public List<AcDuplicateRuleGuidDiagnostic> DuplicateRuleGuids { get; } = new();

    public List<AcParserDiagnostic> Diagnostics { get; } = new();

    public List<string> Warnings { get; } = new();
}

public sealed class AcDuplicateRuleGuidDiagnostic
{
    public string RuleGuid { get; set; } = string.Empty;

    public int Count { get; set; }

    public List<string> Occurrences { get; } = new();
}

public sealed class AcParserDiagnostic
{
    public string Severity { get; set; } = "Info";

    public string Category { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;

    public int Count { get; set; }

    public List<string> Examples { get; } = new();
}
