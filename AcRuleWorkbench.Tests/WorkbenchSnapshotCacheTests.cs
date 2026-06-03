using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using AcRuleWorkbench.Api.V1;
using AcRuleWorkbench.Core;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace AcRuleWorkbench.Tests;

[TestClass]
public sealed class WorkbenchSnapshotCacheTests
{
    [TestMethod]
    public void GetOrBuild_ConcurrentRequests_ReturnsSingleCachedSnapshotInstance()
    {
        var client = new CountingClient(delayMilliseconds: 30);
        var cache = new WorkbenchSnapshotCache(client);
        var snapshots = new ConcurrentBag<WorkbenchSnapshot>();

        Parallel.For(0, 8, _ =>
        {
            WorkbenchSnapshot snapshot = cache.GetOrBuild("C:\\fwd.cfd", "AC", requireNativeOk: false);
            snapshots.Add(snapshot);
        });

        WorkbenchSnapshot first = snapshots.First();
        Assert.IsTrue(snapshots.All(s => ReferenceEquals(first, s)));
        Assert.IsTrue(client.InspectCalls >= 1);
    }

    [TestMethod]
    public void Rebuild_ReplacesCachedSnapshot()
    {
        var client = new CountingClient(delayMilliseconds: 1);
        var cache = new WorkbenchSnapshotCache(client);

        WorkbenchSnapshot original = cache.GetOrBuild("C:\\fwd.cfd", "AC", requireNativeOk: false);
        WorkbenchSnapshot refreshed = cache.Rebuild("C:\\fwd.cfd", "AC", requireNativeOk: false);

        Assert.IsFalse(ReferenceEquals(original, refreshed));
        Assert.IsTrue(client.InspectCalls >= 2);
    }

    [TestMethod]
    public void GetOrBuild_DifferentProcess_RebuildsSnapshot()
    {
        var client = new CountingClient(delayMilliseconds: 1);
        var cache = new WorkbenchSnapshotCache(client);

        WorkbenchSnapshot acSnapshot = cache.GetOrBuild("C:\\fwd.cfd", "AC", requireNativeOk: false);
        WorkbenchSnapshot fipSnapshot = cache.GetOrBuild("C:\\fwd.cfd", "FIP", requireNativeOk: false);

        Assert.IsFalse(ReferenceEquals(acSnapshot, fipSnapshot));
        Assert.AreEqual("FIP", fipSnapshot.Rules.ProcessName);
    }


    [TestMethod]
    public void GetOrBuild_DifferentRequireNativeOk_RebuildsSnapshot()
    {
        var client = new CountingClient(delayMilliseconds: 1);
        var cache = new WorkbenchSnapshotCache(client);

        WorkbenchSnapshot nonStrict = cache.GetOrBuild("C:\\fwd.cfd", "AC", requireNativeOk: false);
        WorkbenchSnapshot strict = cache.GetOrBuild("C:\\fwd.cfd", "AC", requireNativeOk: true);

        Assert.IsFalse(ReferenceEquals(nonStrict, strict));
        Assert.IsFalse(nonStrict.RequireNativeOk);
        Assert.IsTrue(strict.RequireNativeOk);
        Assert.IsTrue(client.InspectCalls >= 2);
    }

    private sealed class CountingClient : IFormWorksExtractionClient
    {
        private int _buildCounter;
        private readonly int _delayMilliseconds;

        public CountingClient(int delayMilliseconds)
        {
            _delayMilliseconds = delayMilliseconds;
        }

        public int InspectCalls => _buildCounter;

        public ProbeReport Probe() => new ProbeReport();

        public FwdInspectionReport Inspect(FwdInspectionOptions options)
        {
            Delay();
            int id = Interlocked.Increment(ref _buildCounter);
            return new FwdInspectionReport { Path = options.Path ?? "C:\\fwd.cfd", ReleaseString = "build-" + id };
        }

        public OcrInspectionReport InspectOcr(OcrInspectionOptions options) => new OcrInspectionReport { Path = options.Path ?? string.Empty };

        public SmokeReport Smoke(SmokeOptions options) => new SmokeReport();

        public StcTreeReport InspectProcessTree(StcTraversalOptions options) => new StcTreeReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };

        public FipInspectionReport InspectFip(FipInspectionOptions options) => new FipInspectionReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "FIP" };

        public AcRuleReport InspectAcRules(AcRuleOptions options)
        {
            Delay();
            return new AcRuleReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        }

        public AcRelationshipReport TraceAcRelationships(AcTraceOptions options)
        {
            Delay();
            return new AcRelationshipReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        }

        public AcIndexReport BuildAcIndex(AcRuleOptions options) => new AcIndexReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };

        public AcDisabledReport AnalyzeDisabledRules(AcDisabledOptions options) => new AcDisabledReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
public AcDiagnosticsReport BuildAcDiagnostics(AcRuleOptions options)
        {
            Delay();
            return new AcDiagnosticsReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        }

        public AcTreeReport BuildAcTree(AcTreeOptions options)
        {
            Delay();
            return new AcTreeReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        }

        public AcViewerReport ExportAcViewer(AcViewerOptions options) => new AcViewerReport { FwdPath = options.Path ?? string.Empty, OutputPath = "viewer.html" };

        private void Delay()
        {
            if (_delayMilliseconds > 0)
                Task.Delay(_delayMilliseconds).GetAwaiter().GetResult();
        }
    }
}
