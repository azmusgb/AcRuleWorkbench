using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AcRuleWorkbench.Core;

namespace AcRuleWorkbench.Api.V1;

internal sealed class LiveFwdSessionStatus
{
    public string SourcePath { get; set; } = string.Empty;
    public string ProcessName { get; set; } = "AC";
    public DateTime OpenedAtUtc { get; set; }
    public long OpenDurationMs { get; set; }
    public string? ReleaseString { get; set; }
    public string? ReleaseDateString { get; set; }
    public int? ReleaseNumber { get; set; }
    public int DocumentCount { get; set; }
    public int PageCount { get; set; }
    public int BatchCount { get; set; }
    public int ProcessCount { get; set; }
    public int PageVariantCount { get; set; }
    public IReadOnlyList<string> Documents { get; set; } = Array.Empty<string>();
    public IReadOnlyList<string> Pages { get; set; } = Array.Empty<string>();
    public IReadOnlyList<string> Batches { get; set; } = Array.Empty<string>();
    public IReadOnlyList<string> Processes { get; set; } = Array.Empty<string>();
    public IReadOnlyList<LivePageVariantStatus> PageVariants { get; set; } = Array.Empty<LivePageVariantStatus>();
    public IReadOnlyList<string> Warnings { get; set; } = Array.Empty<string>();
}

internal sealed class LivePageVariantStatus
{
    public string Page { get; set; } = string.Empty;
    public IReadOnlyList<string> Variants { get; set; } = Array.Empty<string>();
}

/// <summary>
/// Lightweight read-through cache for live mode. It validates that the FWD can be opened
/// read-only and captures cheap catalog metadata without building the complete rule/tree
/// snapshot. Full snapshots remain available on demand through WorkbenchSnapshotCache.
/// </summary>
internal sealed class LiveFwdSessionCache
{
    private readonly IFormWorksExtractionClient _client;
    private readonly object _gate = new object();
    private readonly int _maxPendingBuilds;
    private readonly int _maxCachedSessions;
    private readonly IReadOnlyList<string> _allowedFwdPathRoots;
    private readonly HashSet<string> _allowedProcessNames;
    private readonly Dictionary<LiveFwdSessionKey, LiveFwdSessionStatus> _sessions = new Dictionary<LiveFwdSessionKey, LiveFwdSessionStatus>();
    private readonly Dictionary<LiveFwdSessionKey, LiveFwdSessionBuildState> _pending = new Dictionary<LiveFwdSessionKey, LiveFwdSessionBuildState>();
    private readonly LinkedList<LiveFwdSessionKey> _sessionLru = new LinkedList<LiveFwdSessionKey>();
    private Exception? _lastFailure;
    private LiveFwdSessionKey? _lastFailureKey;

    public LiveFwdSessionCache(
        IFormWorksExtractionClient client,
        IEnumerable<string>? allowedFwdPathRoots = null,
        IEnumerable<string>? allowedProcessNames = null,
        int maxPendingBuilds = 4,
        int maxCachedSessions = 8)
    {
        _client = client ?? throw new ArgumentNullException(nameof(client));
        _allowedFwdPathRoots = NormalizeRoots(allowedFwdPathRoots);
        _allowedProcessNames = new HashSet<string>(
            (allowedProcessNames ?? Array.Empty<string>())
                .Where(p => !string.IsNullOrWhiteSpace(p))
                .Select(p => NormalizeProcessName(p)),
            StringComparer.OrdinalIgnoreCase);
        _maxPendingBuilds = Math.Max(1, maxPendingBuilds);
        _maxCachedSessions = Math.Max(1, maxCachedSessions);
    }

    public LiveFwdSessionStatus? GetCurrent(string fwdPath, string processName, bool requireNativeOk)
    {
        LiveFwdSessionKey key = BuildKey(fwdPath, processName, requireNativeOk);
        lock (_gate)
        {
            if (_sessions.TryGetValue(key, out LiveFwdSessionStatus? session))
            {
                TouchSessionKey(key);
                return session;
            }

            return null;
        }
    }

    public bool HasCurrent(string fwdPath, string processName, bool requireNativeOk)
    {
        return GetCurrent(fwdPath, processName, requireNativeOk) != null;
    }

    public bool HasPendingBuild(string fwdPath, string processName, bool requireNativeOk)
    {
        LiveFwdSessionKey key = BuildKey(fwdPath, processName, requireNativeOk);
        lock (_gate)
            return _pending.ContainsKey(key);
    }

    public DateTime? GetPendingBuildStartedAtUtc(string fwdPath, string processName, bool requireNativeOk)
    {
        LiveFwdSessionKey key = BuildKey(fwdPath, processName, requireNativeOk);
        lock (_gate)
            return _pending.TryGetValue(key, out LiveFwdSessionBuildState? build) ? build.StartedAtUtc : (DateTime?)null;
    }

    public Exception? GetLastFailure(string fwdPath, string processName, bool requireNativeOk)
    {
        LiveFwdSessionKey key = BuildKey(fwdPath, processName, requireNativeOk);
        lock (_gate)
            return _lastFailureKey.HasValue && _lastFailureKey.Value.Equals(key) ? _lastFailure : null;
    }

    public LiveFwdSessionStatus GetOrOpen(string fwdPath, string processName, bool requireNativeOk)
    {
        LiveFwdSessionKey key = BuildKey(fwdPath, processName, requireNativeOk);
        Task<LiveFwdSessionStatus> pending;
        lock (_gate)
        {
            if (_sessions.TryGetValue(key, out LiveFwdSessionStatus? session))
            {
                TouchSessionKey(key);
                return session;
            }

            pending = GetOrStartBuildTask(key);
        }

        return pending.GetAwaiter().GetResult();
    }

    public Task<LiveFwdSessionStatus> WarmUpAsync(string fwdPath, string processName, bool requireNativeOk)
    {
        LiveFwdSessionKey key = BuildKey(fwdPath, processName, requireNativeOk);
        lock (_gate)
        {
            if (_sessions.TryGetValue(key, out LiveFwdSessionStatus? session))
            {
                TouchSessionKey(key);
                return Task.FromResult(session);
            }

            return GetOrStartBuildTask(key);
        }
    }

    public void Clear()
    {
        lock (_gate)
        {
            foreach (LiveFwdSessionBuildState build in _pending.Values)
                build.Cancellation.Cancel();

            _sessions.Clear();
            _sessionLru.Clear();
            _pending.Clear();
            _lastFailure = null;
            _lastFailureKey = null;
        }
    }

    private Task<LiveFwdSessionStatus> GetOrStartBuildTask(LiveFwdSessionKey key)
    {
        if (_pending.TryGetValue(key, out LiveFwdSessionBuildState? existing))
            return existing.Task;

        return StartBuildTask(key);
    }

    private Task<LiveFwdSessionStatus> StartBuildTask(LiveFwdSessionKey key)
    {
        EnforcePendingBuildLimit();

        var completion = new TaskCompletionSource<LiveFwdSessionStatus>(TaskCreationOptions.RunContinuationsAsynchronously);
        var cancellation = new CancellationTokenSource();
        _pending[key] = new LiveFwdSessionBuildState(completion.Task, DateTime.UtcNow, cancellation);

        Task.Run(() =>
        {
            try
            {
                cancellation.Token.ThrowIfCancellationRequested();
                LiveFwdSessionStatus session = BuildLiveSession(key, cancellation.Token);
                cancellation.Token.ThrowIfCancellationRequested();

                lock (_gate)
                {
                    if (_pending.TryGetValue(key, out LiveFwdSessionBuildState? active) && ReferenceEquals(active.Task, completion.Task))
                    {
                        StoreSession(key, session);
                        _lastFailure = null;
                        _lastFailureKey = null;
                    }
                }

                completion.SetResult(session);
            }
            catch (OperationCanceledException)
            {
                completion.SetCanceled();
            }
            catch (Exception ex)
            {
                lock (_gate)
                {
                    _lastFailure = ex;
                    _lastFailureKey = key;
                }
                completion.SetException(ex);
            }
            finally
            {
                lock (_gate)
                {
                    if (_pending.TryGetValue(key, out LiveFwdSessionBuildState? active) && ReferenceEquals(active.Task, completion.Task))
                        _pending.Remove(key);
                }
                cancellation.Dispose();
            }
        });

        return completion.Task;
    }

    private void EnforcePendingBuildLimit()
    {
        if (_pending.Count < _maxPendingBuilds)
            return;

        throw new InvalidOperationException(
            "Too many live FWD session opens are already pending. Reuse an existing path/process key, wait for a session to finish opening, or raise --max-pending-live-builds after reviewing resource impact.");
    }

    private void StoreSession(LiveFwdSessionKey key, LiveFwdSessionStatus session)
    {
        _sessions[key] = session;
        TouchSessionKey(key);

        while (_sessionLru.Count > _maxCachedSessions)
        {
            LiveFwdSessionKey oldest = _sessionLru.Last!.Value;
            _sessionLru.RemoveLast();
            _sessions.Remove(oldest);
        }
    }

    private void TouchSessionKey(LiveFwdSessionKey key)
    {
        LinkedListNode<LiveFwdSessionKey>? node = _sessionLru.Find(key);
        if (node != null)
            _sessionLru.Remove(node);
        _sessionLru.AddFirst(key);
    }

    private LiveFwdSessionStatus BuildLiveSession(LiveFwdSessionKey key, CancellationToken cancellationToken)
    {
        DateTime started = DateTime.UtcNow;
        FwdInspectionReport report = _client.Inspect(new FwdInspectionOptions
        {
            Path = key.FwdPath,
            IncludeFields = false,
            IncludeResourceConfigs = false,
            IncludeResourcePrivateTrees = false,
            ResourceTypes = Array.Empty<string>(),
            RequireNativeOk = key.RequireNativeOk,
            CancellationToken = cancellationToken
        });
        DateTime completed = DateTime.UtcNow;

        return new LiveFwdSessionStatus
        {
            SourcePath = report.Path ?? key.FwdPath,
            ProcessName = key.ProcessName,
            OpenedAtUtc = completed,
            OpenDurationMs = (long)(completed - started).TotalMilliseconds,
            ReleaseString = report.ReleaseString,
            ReleaseDateString = report.ReleaseDateString,
            ReleaseNumber = report.ReleaseNumber,
            DocumentCount = report.Documents.Count,
            PageCount = report.Pages.Count,
            BatchCount = report.Batches.Count,
            ProcessCount = report.Processes.Count,
            PageVariantCount = report.PageVariants.Sum(p => p.Variants.Count),
            Documents = report.Documents.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray(),
            Pages = report.Pages.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray(),
            Batches = report.Batches.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray(),
            Processes = report.Processes.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray(),
            PageVariants = report.PageVariants
                .OrderBy(x => x.Page, StringComparer.OrdinalIgnoreCase)
                .Select(x => new LivePageVariantStatus
                {
                    Page = x.Page,
                    Variants = x.Variants.OrderBy(v => v, StringComparer.OrdinalIgnoreCase).ToArray()
                })
                .ToArray(),
            Warnings = report.Warnings.ToArray()
        };
    }

    private LiveFwdSessionKey BuildKey(string fwdPath, string processName, bool requireNativeOk)
    {
        if (string.IsNullOrWhiteSpace(fwdPath))
            throw new ArgumentException("An FWD/CFD path is required before opening a live FWD session.", nameof(fwdPath));

        string normalizedPath = NormalizeFwdPath(fwdPath);
        string normalizedProcess = NormalizeProcessName(processName);
        ValidateAllowedPath(normalizedPath);
        ValidateAllowedProcess(normalizedProcess);
        return new LiveFwdSessionKey(normalizedPath, normalizedProcess, requireNativeOk);
    }

    private static string NormalizeFwdPath(string fwdPath)
    {
        string trimmed = (fwdPath ?? string.Empty).Trim();
        try { return Path.GetFullPath(trimmed); }
        catch { return trimmed; }
    }

    private static string NormalizeProcessName(string processName)
    {
        return string.IsNullOrWhiteSpace(processName) ? "AC" : processName.Trim();
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

    private readonly struct LiveFwdSessionKey : IEquatable<LiveFwdSessionKey>
    {
        public LiveFwdSessionKey(string fwdPath, string processName, bool requireNativeOk)
        {
            FwdPath = fwdPath;
            ProcessName = processName;
            RequireNativeOk = requireNativeOk;
        }

        public string FwdPath { get; }

        public string ProcessName { get; }

        public bool RequireNativeOk { get; }

        public bool Equals(LiveFwdSessionKey other)
        {
            return RequireNativeOk == other.RequireNativeOk
                && string.Equals(FwdPath, other.FwdPath, StringComparison.OrdinalIgnoreCase)
                && string.Equals(ProcessName, other.ProcessName, StringComparison.OrdinalIgnoreCase);
        }

        public override bool Equals(object? obj)
        {
            return obj is LiveFwdSessionKey other && Equals(other);
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

    private sealed class LiveFwdSessionBuildState
    {
        public LiveFwdSessionBuildState(Task<LiveFwdSessionStatus> task, DateTime startedAtUtc, CancellationTokenSource cancellation)
        {
            Task = task;
            StartedAtUtc = startedAtUtc;
            Cancellation = cancellation ?? throw new ArgumentNullException(nameof(cancellation));
        }

        public Task<LiveFwdSessionStatus> Task { get; }

        public DateTime StartedAtUtc { get; }

        public CancellationTokenSource Cancellation { get; }
    }
}
