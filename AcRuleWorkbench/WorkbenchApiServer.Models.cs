using System;

namespace AcRuleWorkbench;

internal sealed partial class WorkbenchApiServer
{
    private sealed class WorkbenchRefreshState
    {
        public bool HasRun { get; set; }
        public bool Ok { get; set; }
        public DateTime? StartedUtc { get; set; }
        public DateTime? CompletedUtc { get; set; }
        public string? FwdPath { get; set; }
        public string? ViewerPath { get; set; }
        public int? ScopeCount { get; set; }
        public int? RuleCount { get; set; }
        public int? RelationshipCount { get; set; }
        public long? ViewerLength { get; set; }
        public DateTime? ViewerLastWriteUtc { get; set; }
        public string? Error { get; set; }
        public string? ExceptionType { get; set; }

        public static WorkbenchRefreshState NotRun() => new WorkbenchRefreshState { HasRun = false, Ok = false };

        public static WorkbenchRefreshState Success(DateTime startedUtc, DateTime completedUtc, string fwdPath, string viewerPath, int scopeCount, int ruleCount, int relationshipCount, long viewerLength, DateTime viewerLastWriteUtc)
        {
            return new WorkbenchRefreshState
            {
                HasRun = true,
                Ok = true,
                StartedUtc = startedUtc,
                CompletedUtc = completedUtc,
                FwdPath = fwdPath,
                ViewerPath = viewerPath,
                ScopeCount = scopeCount,
                RuleCount = ruleCount,
                RelationshipCount = relationshipCount,
                ViewerLength = viewerLength,
                ViewerLastWriteUtc = viewerLastWriteUtc
            };
        }

        public static WorkbenchRefreshState Failure(DateTime startedUtc, DateTime completedUtc, string fwdPath, string viewerPath, Exception ex)
        {
            return new WorkbenchRefreshState
            {
                HasRun = true,
                Ok = false,
                StartedUtc = startedUtc,
                CompletedUtc = completedUtc,
                FwdPath = fwdPath,
                ViewerPath = viewerPath,
                Error = ex.Message,
                ExceptionType = ex.GetType().Name
            };
        }
    }

    private sealed class ApiError
    {
        public string Error { get; set; } = string.Empty;
        public string? ExceptionType { get; set; }
        public string? ExceptionMessage { get; set; }
    }
}
