using System;
using AcRuleWorkbench.Core;

namespace AcRuleWorkbench.Api.V1;

internal sealed class WorkbenchSnapshotCache
{
    private readonly IFormWorksExtractionClient _client;
    private readonly object _gate = new object();
    private WorkbenchSnapshot? _current;
    private Exception? _lastBuildFailure;

    public WorkbenchSnapshotCache(IFormWorksExtractionClient client)
    {
        _client = client ?? throw new ArgumentNullException(nameof(client));
    }

    public WorkbenchSnapshot? Current
    {
        get
        {
            lock (_gate)
                return _current;
        }
    }

    public Exception? LastBuildFailure
    {
        get
        {
            lock (_gate)
                return _lastBuildFailure;
        }
    }

    public WorkbenchSnapshot GetOrBuild(string fwdPath, string processName, bool requireNativeOk)
    {
        ValidateInputs(fwdPath, processName);

        lock (_gate)
        {
            if (Matches(_current, fwdPath, processName))
                return _current!;

            return BuildUnderLock(fwdPath, processName, requireNativeOk);
        }
    }

    public WorkbenchSnapshot Rebuild(string fwdPath, string processName, bool requireNativeOk)
    {
        ValidateInputs(fwdPath, processName);

        lock (_gate)
            return BuildUnderLock(fwdPath, processName, requireNativeOk);
    }

    public void Clear()
    {
        lock (_gate)
        {
            _current = null;
            _lastBuildFailure = null;
        }
    }

    private WorkbenchSnapshot BuildUnderLock(string fwdPath, string processName, bool requireNativeOk)
    {
        try
        {
            WorkbenchSnapshot built = WorkbenchSnapshotBuilder.Build(_client, fwdPath, processName, requireNativeOk);
            _current = built;
            _lastBuildFailure = null;
            return built;
        }
        catch (Exception ex)
        {
            _lastBuildFailure = ex;
            throw;
        }
    }

    private static bool Matches(WorkbenchSnapshot? snapshot, string fwdPath, string processName)
    {
        return snapshot != null
            && string.Equals(snapshot.FwdPath, fwdPath, StringComparison.OrdinalIgnoreCase)
            && string.Equals(snapshot.Rules.ProcessName, processName, StringComparison.OrdinalIgnoreCase);
    }

    private static void ValidateInputs(string fwdPath, string processName)
    {
        if (string.IsNullOrWhiteSpace(fwdPath))
            throw new ArgumentException("An FWD/CFD path is required before building a workbench snapshot.", nameof(fwdPath));
        if (string.IsNullOrWhiteSpace(processName))
            throw new ArgumentException("A process name is required before building a workbench snapshot.", nameof(processName));
    }
}
