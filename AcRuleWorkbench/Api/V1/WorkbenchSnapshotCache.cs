using System;
using System.Threading.Tasks;
using AcRuleWorkbench.Core;

namespace AcRuleWorkbench.Api.V1;

internal sealed class WorkbenchSnapshotCache
{
    private readonly IFormWorksExtractionClient _client;
    private readonly object _gate = new object();
    private WorkbenchSnapshot? _current;
    private Exception? _lastBuildFailure;

    // In-progress build state. Read/write only under _gate.
    // Using a shared Task lets all concurrent callers join the same build instead of
    // serialising behind a mutex held for the full ~90 s native extraction.
    private Task<WorkbenchSnapshot>? _pendingBuild;
    private string? _pendingFwdPath;
    private string? _pendingProcessName;
    private bool _pendingRequireNativeOk;
    private DateTime _pendingStartedAtUtc;

    public WorkbenchSnapshotCache(IFormWorksExtractionClient client)
    {
        _client = client ?? throw new ArgumentNullException(nameof(client));
    }

    public WorkbenchSnapshot? Current
    {
        get { lock (_gate) return _current; }
    }

    public Exception? LastBuildFailure
    {
        get { lock (_gate) return _lastBuildFailure; }
    }

    /// <summary>True while a background build task is running.</summary>
    public bool IsBuildPending
    {
        get { lock (_gate) return _pendingBuild != null && !_pendingBuild.IsCompleted; }
    }

    /// <summary>UTC timestamp of when the current background build started, or null if no build is running.</summary>
    public DateTime? PendingBuildStartedAtUtc
    {
        get
        {
            lock (_gate)
                return (_pendingBuild != null && !_pendingBuild.IsCompleted) ? _pendingStartedAtUtc : (DateTime?)null;
        }
    }

    /// <summary>
    /// Returns the cached snapshot if it matches, otherwise waits for an in-progress build or starts a new one.
    /// The lock is released immediately after kicking off the Task so other requests are never serialised for 90 s.
    /// </summary>
    public WorkbenchSnapshot GetOrBuild(string fwdPath, string processName, bool requireNativeOk)
    {
        ValidateInputs(fwdPath, processName);

        Task<WorkbenchSnapshot> pending;
        lock (_gate)
        {
            if (Matches(_current, fwdPath, processName, requireNativeOk))
                return _current!;

            pending = GetOrStartBuildTask(fwdPath, processName, requireNativeOk);
        }

        return pending.GetAwaiter().GetResult();
    }

    /// <summary>Forces a new build regardless of cache state.</summary>
    public WorkbenchSnapshot Rebuild(string fwdPath, string processName, bool requireNativeOk)
    {
        ValidateInputs(fwdPath, processName);

        Task<WorkbenchSnapshot> pending;
        lock (_gate)
            pending = StartBuildTask(fwdPath, processName, requireNativeOk);

        return pending.GetAwaiter().GetResult();
    }

    /// <summary>
    /// Fires off a background snapshot build if the cache is not already warm for the given key.
    /// Returns immediately without waiting so callers (e.g. server startup warm-up) are not blocked.
    /// </summary>
    public Task WarmUpAsync(string fwdPath, string processName, bool requireNativeOk)
    {
        ValidateInputs(fwdPath, processName);

        lock (_gate)
        {
            if (Matches(_current, fwdPath, processName, requireNativeOk))
                return Task.CompletedTask;

            return GetOrStartBuildTask(fwdPath, processName, requireNativeOk);
        }
    }

    public void Clear()
    {
        lock (_gate)
        {
            _current = null;
            _lastBuildFailure = null;
        }
    }

    // Must be called under _gate. Reuses the current pending task when its parameters match.
    private Task<WorkbenchSnapshot> GetOrStartBuildTask(string fwdPath, string processName, bool requireNativeOk)
    {
        if (_pendingBuild != null
            && !_pendingBuild.IsCompleted
            && string.Equals(_pendingFwdPath, fwdPath, StringComparison.OrdinalIgnoreCase)
            && string.Equals(_pendingProcessName, processName, StringComparison.OrdinalIgnoreCase)
            && _pendingRequireNativeOk == requireNativeOk)
        {
            return _pendingBuild;
        }

        return StartBuildTask(fwdPath, processName, requireNativeOk);
    }

    // Must be called under _gate. Always creates a fresh build Task.
    private Task<WorkbenchSnapshot> StartBuildTask(string fwdPath, string processName, bool requireNativeOk)
    {
        var task = Task.Run(() =>
        {
            try
            {
                WorkbenchSnapshot built = WorkbenchSnapshotBuilder.Build(_client, fwdPath, processName, requireNativeOk);
                lock (_gate)
                {
                    _current = built;
                    _lastBuildFailure = null;
                }
                return built;
            }
            catch (Exception ex)
            {
                lock (_gate)
                    _lastBuildFailure = ex;
                throw;
            }
        });

        _pendingBuild = task;
        _pendingFwdPath = fwdPath;
        _pendingProcessName = processName;
        _pendingRequireNativeOk = requireNativeOk;
        _pendingStartedAtUtc = DateTime.UtcNow;

        // Clear _pendingBuild when done so IsBuildPending reflects reality.
        task.ContinueWith(t =>
        {
            lock (_gate)
            {
                if (ReferenceEquals(_pendingBuild, t))
                    _pendingBuild = null;
            }
        }, TaskScheduler.Default);

        return task;
    }

    private static bool Matches(WorkbenchSnapshot? snapshot, string fwdPath, string processName, bool requireNativeOk)
    {
        return snapshot != null
            && string.Equals(snapshot.FwdPath, fwdPath, StringComparison.OrdinalIgnoreCase)
            && string.Equals(snapshot.Rules.ProcessName, processName, StringComparison.OrdinalIgnoreCase)
            && snapshot.RequireNativeOk == requireNativeOk;
    }

    private static void ValidateInputs(string fwdPath, string processName)
    {
        if (string.IsNullOrWhiteSpace(fwdPath))
            throw new ArgumentException("An FWD/CFD path is required before building a workbench snapshot.", nameof(fwdPath));
        if (string.IsNullOrWhiteSpace(processName))
            throw new ArgumentException("A process name is required before building a workbench snapshot.", nameof(processName));
    }
}
