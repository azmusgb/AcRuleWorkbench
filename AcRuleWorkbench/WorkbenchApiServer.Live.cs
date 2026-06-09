using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using AcRuleWorkbench.Api.V1;

namespace AcRuleWorkbench;

internal sealed partial class WorkbenchApiServer
{
    private void StartLiveSessionWarmupMonitor(string prefix, string fwdPath, string processName, bool requireNativeOk)
    {
        var stopwatch = Stopwatch.StartNew();
        string readyHealthUrl = CombineUrl(prefix, "api/v1/health/ready");
        string fileName = Path.GetFileName(fwdPath);

        Console.WriteLine("[3/3] Live-lazy FWD session opening for " + (string.IsNullOrWhiteSpace(fileName) ? fwdPath : fileName) + ".");
        Console.WriteLine("      Full snapshot warm-up is skipped. Scope/resource endpoints hydrate on demand.");
        Console.WriteLine("      Progress: poll " + readyHealthUrl + " for machine-readable live readiness.");

        Task<LiveFwdSessionStatus> warmupTask = _liveSessionCache.WarmUpAsync(fwdPath, processName, requireNativeOk);
        if (warmupTask.IsCompleted)
        {
            CompleteLiveSessionWarmup(prefix, fwdPath, processName, requireNativeOk, stopwatch, warmupTask);
            return;
        }

        Timer? progressTimer = null;
        progressTimer = new Timer(
            _ => Console.WriteLine("[OPENING] Live FWD session still opening (" + FormatDuration(stopwatch.Elapsed) + " elapsed)."),
            null,
            TimeSpan.FromSeconds(5),
            TimeSpan.FromSeconds(10));

        warmupTask.ContinueWith(t =>
        {
            try
            {
                progressTimer?.Dispose();
            }
            catch
            {
                // Best-effort cleanup for console progress timer.
            }

            CompleteLiveSessionWarmup(prefix, fwdPath, processName, requireNativeOk, stopwatch, t);
        }, TaskScheduler.Default);
    }

    private void CompleteLiveSessionWarmup(string prefix, string fwdPath, string processName, bool requireNativeOk, Stopwatch stopwatch, Task<LiveFwdSessionStatus> warmupTask)
    {
        stopwatch.Stop();

        if (warmupTask.IsFaulted)
        {
            Exception failure = warmupTask.Exception?.GetBaseException() ?? new InvalidOperationException("Unknown live FWD session failure.");
            Console.WriteLine("[FAIL] Live FWD session failed after " + FormatDuration(stopwatch.Elapsed) + ": " + failure.Message);
            Console.WriteLine("[READY] API listener is still live, but FWD-backed routes are not ready. Check " + CombineUrl(prefix, "api/v1/status") + ".");
            return;
        }

        if (warmupTask.IsCanceled)
        {
            Console.WriteLine("[FAIL] Live FWD session was cancelled after " + FormatDuration(stopwatch.Elapsed) + ".");
            Console.WriteLine("[READY] API listener is still live, but FWD-backed routes are not ready. Check " + CombineUrl(prefix, "api/v1/status") + ".");
            return;
        }

        LiveFwdSessionStatus session = warmupTask.GetAwaiter().GetResult();
        string status = "Live-lazy FWD session ready in " + FormatDuration(TimeSpan.FromMilliseconds(session.OpenDurationMs))
            + " (" + session.DocumentCount + " docs, " + session.PageCount + " pages, " + session.ProcessCount + " processes). Full snapshot not prebuilt.";
        Console.WriteLine("[READY] " + status);
        WriteServerFullyReady(prefix, status);
    }

}
