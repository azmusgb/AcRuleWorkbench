using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using AcRuleWorkbench.Core;

namespace AcRuleWorkbench.Api.V1;

internal sealed class WorkbenchSnapshotCache
{
    private readonly IFormWorksExtractionClient _client;
    private readonly object _gate = new object();
    private readonly Dictionary<SnapshotCacheKey, SnapshotBuildState> _pendingBuilds = new Dictionary<SnapshotCacheKey, SnapshotBuildState>();
    private WorkbenchSnapshot? _current;
    private Exception? _lastBuildFailure;
    private SnapshotCacheKey? _lastBuildFailureKey;
    private long _latestBuildGeneration;

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
        get { lock (_gate) return _pendingBuilds.Count > 0; }
    }

    /// <summary>UTC timestamp of when the current background build started, or null if no build is running.</summary>
    public DateTime? PendingBuildStartedAtUtc
    {
        get
        {
            lock (_gate)
                return _pendingBuilds.Count == 0 ? (DateTime?)null : _pendingBuilds.Values.Min(b => b.StartedAtUtc);
        }
    }

    public WorkbenchSnapshot? GetCurrent(string fwdPath, string processName, bool requireNativeOk)
    {
        SnapshotCacheKey key = BuildKey(fwdPath, processName, requireNativeOk);
        lock (_gate)
            return Matches(_current, key) ? _current : null;
    }

    public bool HasCurrent(string fwdPath, string processName, bool requireNativeOk)
    {
        return GetCurrent(fwdPath, processName, requireNativeOk) != null;
    }

    public Exception? GetLastBuildFailure(string fwdPath, string processName, bool requireNativeOk)
    {
        SnapshotCacheKey key = BuildKey(fwdPath, processName, requireNativeOk);
        lock (_gate)
            return _lastBuildFailureKey.HasValue && _lastBuildFailureKey.Value.Equals(key) ? _lastBuildFailure : null;
    }

    public bool HasPendingBuild(string fwdPath, string processName, bool requireNativeOk)
    {
        SnapshotCacheKey key = BuildKey(fwdPath, processName, requireNativeOk);
        lock (_gate)
            return _pendingBuilds.ContainsKey(key);
    }

    public DateTime? GetPendingBuildStartedAtUtc(string fwdPath, string processName, bool requireNativeOk)
    {
        SnapshotCacheKey key = BuildKey(fwdPath, processName, requireNativeOk);
        lock (_gate)
            return _pendingBuilds.TryGetValue(key, out SnapshotBuildState? build) ? build.StartedAtUtc : (DateTime?)null;
    }

    /// <summary>
    /// Returns the cached snapshot if it matches, otherwise waits for an in-progress build or starts a new one.
    /// The lock is released immediately after kicking off the Task so other requests are never serialised for 90 s.
    /// </summary>
    public WorkbenchSnapshot GetOrBuild(string fwdPath, string processName, bool requireNativeOk)
    {
        SnapshotCacheKey key = BuildKey(fwdPath, processName, requireNativeOk);

        Task<WorkbenchSnapshot> pending;
        lock (_gate)
        {
            if (Matches(_current, key))
                return _current!;

            pending = GetOrStartBuildTask(key);
        }

        return pending.GetAwaiter().GetResult();
    }

    /// <summary>Forces a new build regardless of cache state.</summary>
    public WorkbenchSnapshot Rebuild(string fwdPath, string processName, bool requireNativeOk)
    {
        SnapshotCacheKey key = BuildKey(fwdPath, processName, requireNativeOk);

        Task<WorkbenchSnapshot> pending;
        lock (_gate)
            pending = StartBuildTask(key);

        return pending.GetAwaiter().GetResult();
    }

    /// <summary>
    /// Fires off a background snapshot build if the cache is not already warm for the given key.
    /// Returns immediately without waiting so callers (e.g. server startup warm-up) are not blocked.
    /// </summary>
    public Task WarmUpAsync(string fwdPath, string processName, bool requireNativeOk)
    {
        SnapshotCacheKey key = BuildKey(fwdPath, processName, requireNativeOk);

        lock (_gate)
        {
            if (Matches(_current, key))
                return Task.CompletedTask;

            return GetOrStartBuildTask(key);
        }
    }

    public void Clear()
    {
        lock (_gate)
        {
            _current = null;
            _lastBuildFailure = null;
            _lastBuildFailureKey = null;
            _pendingBuilds.Clear();
        }
    }

    // Must be called under _gate. Reuses the current pending task when its parameters match.
    private Task<WorkbenchSnapshot> GetOrStartBuildTask(SnapshotCacheKey key)
    {
        if (_pendingBuilds.TryGetValue(key, out SnapshotBuildState? build))
            return build.Task;

        return StartBuildTask(key);
    }

    // Must be called under _gate. Always creates a fresh build Task.
    private Task<WorkbenchSnapshot> StartBuildTask(SnapshotCacheKey key)
    {
        long generation = ++_latestBuildGeneration;
        var completion = new TaskCompletionSource<WorkbenchSnapshot>();
        _pendingBuilds[key] = new SnapshotBuildState(completion.Task, DateTime.UtcNow, generation);

        Task.Run(() =>
        {
            try
            {
                WorkbenchSnapshot built = WorkbenchSnapshotBuilder.Build(_client, key.FwdPath, key.ProcessName, key.RequireNativeOk);
                lock (_gate)
                {
                    if (IsActiveBuild(key, generation) && generation == _latestBuildGeneration)
                    {
                        _current = built;
                        _lastBuildFailure = null;
                        _lastBuildFailureKey = null;
                    }
                }
                completion.SetResult(built);
            }
            catch (Exception ex)
            {
                lock (_gate)
                {
                    if (IsActiveBuild(key, generation) && generation == _latestBuildGeneration)
                    {
                        _lastBuildFailure = ex;
                        _lastBuildFailureKey = key;
                    }
                }
                completion.SetException(ex);
            }
            finally
            {
                lock (_gate)
                {
                    if (IsActiveBuild(key, generation))
                        _pendingBuilds.Remove(key);
                }
            }
        });

        return completion.Task;
    }

    private bool IsActiveBuild(SnapshotCacheKey key, long generation)
    {
        return _pendingBuilds.TryGetValue(key, out SnapshotBuildState? build)
            && build.Generation == generation;
    }

    private static bool Matches(WorkbenchSnapshot? snapshot, SnapshotCacheKey key)
    {
        return snapshot != null
            && string.Equals(NormalizeFwdPath(snapshot.FwdPath), key.FwdPath, StringComparison.OrdinalIgnoreCase)
            && string.Equals(NormalizeProcessName(snapshot.Rules.ProcessName), key.ProcessName, StringComparison.OrdinalIgnoreCase)
            && snapshot.RequireNativeOk == key.RequireNativeOk;
    }

    private static SnapshotCacheKey BuildKey(string fwdPath, string processName, bool requireNativeOk)
    {
        ValidateInputs(fwdPath, processName);
        return new SnapshotCacheKey(NormalizeFwdPath(fwdPath), NormalizeProcessName(processName), requireNativeOk);
    }

    private static string NormalizeFwdPath(string fwdPath)
    {
        string trimmed = (fwdPath ?? string.Empty).Trim();
        try
        {
            return Path.GetFullPath(trimmed);
        }
        catch
        {
            return trimmed;
        }
    }

    private static string NormalizeProcessName(string processName)
    {
        return string.IsNullOrWhiteSpace(processName) ? "AC" : processName.Trim();
    }

    private static void ValidateInputs(string fwdPath, string processName)
    {
        if (string.IsNullOrWhiteSpace(fwdPath))
            throw new ArgumentException("An FWD/CFD path is required before building a workbench snapshot.", nameof(fwdPath));
        if (string.IsNullOrWhiteSpace(processName))
            throw new ArgumentException("A process name is required before building a workbench snapshot.", nameof(processName));
    }

    private readonly struct SnapshotCacheKey : IEquatable<SnapshotCacheKey>
    {
        public SnapshotCacheKey(string fwdPath, string processName, bool requireNativeOk)
        {
            FwdPath = fwdPath;
            ProcessName = processName;
            RequireNativeOk = requireNativeOk;
        }

        public string FwdPath { get; }

        public string ProcessName { get; }

        public bool RequireNativeOk { get; }

        public bool Equals(SnapshotCacheKey other)
        {
            return RequireNativeOk == other.RequireNativeOk
                && string.Equals(FwdPath, other.FwdPath, StringComparison.OrdinalIgnoreCase)
                && string.Equals(ProcessName, other.ProcessName, StringComparison.OrdinalIgnoreCase);
        }

        public override bool Equals(object? obj)
        {
            return obj is SnapshotCacheKey other && Equals(other);
        }

        public override int GetHashCode()
        {
            unchecked
            {
                int hash = StringComparer.OrdinalIgnoreCase.GetHashCode(FwdPath);
                hash = (hash * 397) ^ StringComparer.OrdinalIgnoreCase.GetHashCode(ProcessName);
                hash = (hash * 397) ^ RequireNativeOk.GetHashCode();
                return hash;
            }
        }
    }

    private sealed class SnapshotBuildState
    {
        public SnapshotBuildState(Task<WorkbenchSnapshot> task, DateTime startedAtUtc, long generation)
        {
            Task = task;
            StartedAtUtc = startedAtUtc;
            Generation = generation;
        }

        public Task<WorkbenchSnapshot> Task { get; }

        public DateTime StartedAtUtc { get; }

        public long Generation { get; }
    }
}
