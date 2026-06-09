using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AcRuleWorkbench.Core;

namespace AcRuleWorkbench.Api.V1;

internal sealed class WorkbenchSnapshotCache
{
    private readonly IFormWorksExtractionClient _client;
    private readonly EvidenceExportProfile _evidenceExportProfile;
    private readonly object _gate = new object();
    private const int MaxCachedSnapshots = 3;
    private readonly int _maxPendingBuilds;
    private readonly IReadOnlyList<string> _allowedFwdPathRoots;
    private readonly HashSet<string> _allowedProcessNames;
    private readonly Dictionary<SnapshotCacheKey, SnapshotBuildState> _pendingBuilds = new Dictionary<SnapshotCacheKey, SnapshotBuildState>();
    private readonly Dictionary<SnapshotCacheKey, WorkbenchSnapshot> _snapshots = new Dictionary<SnapshotCacheKey, WorkbenchSnapshot>();
    private readonly LinkedList<SnapshotCacheKey> _snapshotLru = new LinkedList<SnapshotCacheKey>();
    private WorkbenchSnapshot? _current;
    private Exception? _lastBuildFailure;
    private SnapshotCacheKey? _lastBuildFailureKey;
    private long _latestBuildGeneration;
    private long _lastCurrentGeneration;

    public WorkbenchSnapshotCache(
        IFormWorksExtractionClient client,
        EvidenceExportProfile evidenceExportProfile = EvidenceExportProfile.ViewerSafe,
        IEnumerable<string>? allowedFwdPathRoots = null,
        IEnumerable<string>? allowedProcessNames = null,
        int maxPendingBuilds = 4)
    {
        _client = client ?? throw new ArgumentNullException(nameof(client));
        _evidenceExportProfile = evidenceExportProfile;
        _allowedFwdPathRoots = NormalizeRoots(allowedFwdPathRoots);
        _allowedProcessNames = new HashSet<string>(
            (allowedProcessNames ?? Array.Empty<string>())
                .Where(p => !string.IsNullOrWhiteSpace(p))
                .Select(p => NormalizeProcessName(p)),
            StringComparer.OrdinalIgnoreCase);
        _maxPendingBuilds = Math.Max(1, maxPendingBuilds);
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
        {
            if (_snapshots.TryGetValue(key, out WorkbenchSnapshot? snapshot))
            {
                TouchSnapshotKey(key);
                return snapshot;
            }

            return null;
        }
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
            if (_snapshots.TryGetValue(key, out WorkbenchSnapshot? snapshot))
            {
                TouchSnapshotKey(key);
                return snapshot;
            }

            pending = GetOrStartBuildTask(key);
        }

        return pending.GetAwaiter().GetResult();
    }

    /// <summary>
    /// Returns a live-coherent snapshot without rebuilding synchronously for every request.
    /// If a matching snapshot is already warm, callers receive it immediately and a throttled
    /// background refresh is started only when the snapshot is older than <paramref name="minimumRefreshInterval"/>.
    /// If no matching snapshot exists yet, this falls back to the normal shared build path.
    /// </summary>
    public WorkbenchSnapshot GetLiveOrBuild(string fwdPath, string processName, bool requireNativeOk, TimeSpan minimumRefreshInterval)
    {
        SnapshotCacheKey key = BuildKey(fwdPath, processName, requireNativeOk);

        Task<WorkbenchSnapshot>? pending = null;
        lock (_gate)
        {
            if (_snapshots.TryGetValue(key, out WorkbenchSnapshot? current))
            {
                TouchSnapshotKey(key);
                TimeSpan age = DateTime.UtcNow - current.GeneratedAtUtc;
                if (age >= minimumRefreshInterval && !_pendingBuilds.ContainsKey(key))
                    StartBuildTask(key);

                return current;
            }

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
        {
            CancelPendingBuildIfAny(key);
            pending = StartBuildTask(key);
        }

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
            if (_snapshots.ContainsKey(key))
            {
                TouchSnapshotKey(key);
                return Task.CompletedTask;
            }

            return GetOrStartBuildTask(key);
        }
    }

    public void Clear()
    {
        lock (_gate)
        {
            foreach (SnapshotBuildState build in _pendingBuilds.Values)
                build.Cancellation.Cancel();

            _current = null;
            _snapshots.Clear();
            _snapshotLru.Clear();
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
        EnforcePendingBuildLimit(key);

        long generation = ++_latestBuildGeneration;
        var completion = new TaskCompletionSource<WorkbenchSnapshot>(TaskCreationOptions.RunContinuationsAsynchronously);
        var cancellation = new CancellationTokenSource();
        _pendingBuilds[key] = new SnapshotBuildState(completion.Task, DateTime.UtcNow, generation, cancellation);

        Task.Run(() =>
        {
            try
            {
                cancellation.Token.ThrowIfCancellationRequested();
                WorkbenchSnapshot built = WorkbenchSnapshotBuilder.Build(_client, key.FwdPath, key.ProcessName, key.RequireNativeOk, key.EvidenceExportProfile, cancellation.Token);
                cancellation.Token.ThrowIfCancellationRequested();

                bool shouldCompleteAsCanceled = false;
                lock (_gate)
                {
                    if (IsActiveBuild(key, generation) && !cancellation.IsCancellationRequested)
                    {
                        // Every successful active build may be cached under its own key.
                        // Only the most recently completed build is allowed to become Current.
                        StoreSnapshot(key, built);
                        if (generation >= _lastCurrentGeneration)
                        {
                            _lastCurrentGeneration = generation;
                            _current = built;
                        }
                        _lastBuildFailure = null;
                        _lastBuildFailureKey = null;
                    }
                    else if (cancellation.IsCancellationRequested)
                    {
                        shouldCompleteAsCanceled = true;
                    }
                }

                if (shouldCompleteAsCanceled)
                    completion.SetCanceled();
                else
                    completion.SetResult(built);
            }
            catch (OperationCanceledException)
            {
                completion.SetCanceled();
            }
            catch (Exception ex)
            {
                lock (_gate)
                {
                    if (IsActiveBuild(key, generation))
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
                cancellation.Dispose();
            }
        });

        return completion.Task;
    }

    private void CancelPendingBuildIfAny(SnapshotCacheKey key)
    {
        if (_pendingBuilds.TryGetValue(key, out SnapshotBuildState? existing))
        {
            existing.Cancellation.Cancel();
            _pendingBuilds.Remove(key);
        }
    }

    private void StoreSnapshot(SnapshotCacheKey key, WorkbenchSnapshot snapshot)
    {
        _snapshots[key] = snapshot;
        TouchSnapshotKey(key);

        while (_snapshotLru.Count > MaxCachedSnapshots)
        {
            SnapshotCacheKey oldest = _snapshotLru.Last!.Value;
            _snapshotLru.RemoveLast();
            _snapshots.Remove(oldest);
        }
    }

    private void TouchSnapshotKey(SnapshotCacheKey key)
    {
        LinkedListNode<SnapshotCacheKey>? node = _snapshotLru.Find(key);
        if (node != null)
            _snapshotLru.Remove(node);
        _snapshotLru.AddFirst(key);
    }

    private bool IsActiveBuild(SnapshotCacheKey key, long generation)
    {
        return _pendingBuilds.TryGetValue(key, out SnapshotBuildState? build)
            && build.Generation == generation;
    }

    private void EnforcePendingBuildLimit(SnapshotCacheKey key)
    {
        if (_pendingBuilds.Count < _maxPendingBuilds)
            return;

        throw new InvalidOperationException(
            "Too many snapshot builds are already pending. Reuse an existing path/process key, wait for a build to finish, or raise --max-pending-snapshot-builds after reviewing resource impact.");
    }

    private SnapshotCacheKey BuildKey(string fwdPath, string processName, bool requireNativeOk)
    {
        ValidateInputs(fwdPath, processName);
        string normalizedPath = NormalizeFwdPath(fwdPath);
        string normalizedProcess = NormalizeProcessName(processName);
        ValidateAllowedPath(normalizedPath);
        ValidateAllowedProcess(normalizedProcess);
        return new SnapshotCacheKey(normalizedPath, normalizedProcess, requireNativeOk, _evidenceExportProfile);
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

    private void ValidateAllowedPath(string normalizedPath)
    {
        if (_allowedFwdPathRoots.Count == 0)
            return;

        if (_allowedFwdPathRoots.Any(root => IsUnderRoot(normalizedPath, root)))
            return;

        throw new UnauthorizedAccessException("The requested FWD/CFD path is outside the configured allowed path roots.");
    }

    private void ValidateAllowedProcess(string normalizedProcess)
    {
        if (_allowedProcessNames.Count == 0 || _allowedProcessNames.Contains(normalizedProcess))
            return;

        throw new UnauthorizedAccessException("The requested process name is outside the configured process allowlist.");
    }

    private static IReadOnlyList<string> NormalizeRoots(IEnumerable<string>? roots)
    {
        if (roots == null)
            return Array.Empty<string>();

        var result = new List<string>();
        foreach (string root in roots)
        {
            if (string.IsNullOrWhiteSpace(root))
                continue;

            string normalized;
            try { normalized = Path.GetFullPath(root.Trim()).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar); }
            catch { normalized = root.Trim().TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar); }

            if (!string.IsNullOrWhiteSpace(normalized) && !result.Contains(normalized, StringComparer.OrdinalIgnoreCase))
                result.Add(normalized);
        }

        return result;
    }

    private static bool IsUnderRoot(string path, string root)
    {
        string normalizedPath = path.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        string normalizedRoot = root.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

        return string.Equals(normalizedPath, normalizedRoot, StringComparison.OrdinalIgnoreCase)
            || normalizedPath.StartsWith(normalizedRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
            || normalizedPath.StartsWith(normalizedRoot + Path.AltDirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    }

    private readonly struct SnapshotCacheKey : IEquatable<SnapshotCacheKey>
    {
        public SnapshotCacheKey(string fwdPath, string processName, bool requireNativeOk, EvidenceExportProfile evidenceExportProfile)
        {
            FwdPath = fwdPath;
            ProcessName = processName;
            RequireNativeOk = requireNativeOk;
            EvidenceExportProfile = evidenceExportProfile;
        }

        public string FwdPath { get; }

        public string ProcessName { get; }

        public bool RequireNativeOk { get; }

        public EvidenceExportProfile EvidenceExportProfile { get; }

        public bool Equals(SnapshotCacheKey other)
        {
            return RequireNativeOk == other.RequireNativeOk
                && EvidenceExportProfile == other.EvidenceExportProfile
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
                hash = (hash * 397) ^ EvidenceExportProfile.GetHashCode();
                return hash;
            }
        }
    }

    private sealed class SnapshotBuildState
    {
        public SnapshotBuildState(Task<WorkbenchSnapshot> task, DateTime startedAtUtc, long generation, CancellationTokenSource cancellation)
        {
            Task = task;
            StartedAtUtc = startedAtUtc;
            Generation = generation;
            Cancellation = cancellation ?? throw new ArgumentNullException(nameof(cancellation));
        }

        public Task<WorkbenchSnapshot> Task { get; }

        public DateTime StartedAtUtc { get; }

        public long Generation { get; }

        public CancellationTokenSource Cancellation { get; }
    }
}
