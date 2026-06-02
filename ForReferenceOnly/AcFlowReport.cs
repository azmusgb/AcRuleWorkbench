using System;
using System.Collections.Generic;
using System.Linq;

namespace DllInteropHarness.Core;

public sealed class AcRuleFlowReport
{
    public string FwdPath { get; set; } = string.Empty;

    public string ProcessName { get; set; } = "AC";

    public int ScopeCount { get; set; }

    public int NodeCount { get; set; }

    public int EdgeCount { get; set; }

    public int ProvenEdgeCount { get; set; }

    public int ParsedEdgeCount { get; set; }

    public int InferredEdgeCount { get; set; }

    public int HeuristicEdgeCount { get; set; }

    public int UnknownEdgeCount { get; set; }

    public List<AcRuleFlowScope> Scopes { get; } = new();

    public List<AcRuleFlowNode> Nodes { get; } = new();

    public List<AcRuleFlowEdge> Edges { get; } = new();

    public List<string> Warnings { get; } = new();

    public void RebuildCounts()
    {
        ScopeCount = Scopes.Count;
        NodeCount = Nodes.Count;
        EdgeCount = Edges.Count;
        ProvenEdgeCount = Edges.Count(e => e.Confidence == AcEvidenceConfidence.Proven);
        ParsedEdgeCount = Edges.Count(e => e.Confidence == AcEvidenceConfidence.Parsed);
        InferredEdgeCount = Edges.Count(e => e.Confidence == AcEvidenceConfidence.Inferred);
        HeuristicEdgeCount = Edges.Count(e => e.Confidence == AcEvidenceConfidence.Heuristic);
        UnknownEdgeCount = Edges.Count(e => e.Confidence == AcEvidenceConfidence.Unknown);
    }
}

public sealed class AcRuleFlowScope
{
    public string ScopePath { get; set; } = string.Empty;
    public string ScopeType { get; set; } = string.Empty;
    public string ScopeName { get; set; } = string.Empty;
    public int RuleCount { get; set; }
    public int EdgeCount { get; set; }
    public int UnknownActionTargetCount { get; set; }
    public int UnresolvedSkipTargetCount { get; set; }
}

public sealed class AcRuleFlowNode
{
    public string ScopePath { get; set; } = string.Empty;
    public string ScopeType { get; set; } = string.Empty;
    public string ScopeName { get; set; } = string.Empty;
    public int RuleIndex { get; set; }
    public string? RuleGuid { get; set; }
    public string? RuleId { get; set; }
    public string? RuleName { get; set; }
    public string? FunctionName { get; set; }
    public string RuleListPath { get; set; } = "Root";
    public string DisabledState { get; set; } = AcDisabledStates.Enabled;
}

public sealed class AcRuleFlowEdge
{
    public string ScopePath { get; set; } = string.Empty;

    public int FromRuleIndex { get; set; }
    public string? FromRuleGuid { get; set; }
    public string? FromRuleName { get; set; }

    public int? ToRuleIndex { get; set; }
    public string? ToRuleGuid { get; set; }
    public string? ToRuleName { get; set; }

    public string? ActionName { get; set; }
    public string? StatusResultName { get; set; }

    public string EdgeKind { get; set; } = AcRuleFlowEdgeKind.UnknownActionTarget;
    public string Confidence { get; set; } = AcEvidenceConfidence.Unknown;

    public string EvidenceKey { get; set; } = string.Empty;
    public string Evidence { get; set; } = string.Empty;
    public string RawToken { get; set; } = string.Empty;

    public string ResolutionStatus { get; set; } = "Unresolved";

    public List<string> Warnings { get; } = new();
}

public static class AcRuleFlowEdgeKind
{
    public const string RootListEntry = "RootListEntry";
    public const string SequentialNext = "SequentialNext";
    public const string SubListSequentialNext = "SubListSequentialNext";
    public const string ActionBranch = "ActionBranch";
    public const string ActionToSubList = "ActionToSubList";
    public const string ActionToTerminal = "ActionToTerminal";
    public const string SkipToRule = "SkipToRule";
    public const string BackupSkipToRule = "BackupSkipToRule";
    public const string DisabledGate = "DisabledGate";
    public const string EndScope = "EndScope";
    public const string TerminalReject = "TerminalReject";
    public const string TerminalDoNothing = "TerminalDoNothing";
    public const string UnknownActionTarget = "UnknownActionTarget";
    public const string UnresolvedSkipTarget = "UnresolvedSkipTarget";
}

public static class AcEvidenceConfidence
{
    public const string Proven = "Proven";
    public const string Parsed = "Parsed";
    public const string Inferred = "Inferred";
    public const string Heuristic = "Heuristic";
    public const string Unknown = "Unknown";
}
