using System.Collections.Generic;
using System.Linq;

namespace DllInteropHarness.Core;

public sealed class AcFlowDebugReport
{
    public string FwdPath { get; set; } = string.Empty;

    public string ProcessName { get; set; } = "AC";

    public int ScopeCount { get; set; }

    public int RuleCount { get; set; }

    public int ReturnedRuleCount { get; set; }

    public bool Truncated { get; set; }

    public List<AcFlowDebugScope> Scopes { get; } = new();

    public List<AcFlowDebugRule> Rules { get; } = new();

    public List<string> Warnings { get; } = new();

    public void RebuildCounts()
    {
        ScopeCount = Scopes.Count;
        RuleCount = Scopes.Sum(s => s.RuleCount);
        ReturnedRuleCount = Rules.Count;
    }
}

public sealed class AcFlowDebugScope
{
    public string ScopePath { get; set; } = string.Empty;

    public string ScopeType { get; set; } = string.Empty;

    public string ScopeName { get; set; } = string.Empty;

    public int RuleCount { get; set; }

    public int TokenCount { get; set; }

    public List<string> RawTokens { get; } = new();
}

public sealed class AcFlowDebugRule
{
    public string ScopePath { get; set; } = string.Empty;

    public string ScopeType { get; set; } = string.Empty;

    public string ScopeName { get; set; } = string.Empty;

    public int RuleIndex { get; set; }

    public string? RuleGuid { get; set; }

    public string? RuleId { get; set; }

    public int? RuleCounter { get; set; }

    public string? RuleName { get; set; }

    public string? FunctionName { get; set; }

    public string? FunctionVersion { get; set; }

    public string? ActionMapRaw { get; set; }

    public int? SkipId { get; set; }

    public int? BackupSkipId { get; set; }

    public string RuleListPath { get; set; } = "Root";

    public List<string> ActionNames { get; } = new();

    public List<string> Sources { get; } = new();

    public Dictionary<string, List<string>> FlowParameters { get; } = new();

    public List<string> RawTokens { get; } = new();

    public List<string> RawFlowTokens { get; } = new();

    public List<string> Warnings { get; } = new();
}
