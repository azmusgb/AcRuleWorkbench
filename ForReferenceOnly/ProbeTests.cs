using DllInteropHarness.Core;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace DllInteropHarness.Tests;

[TestClass]
public sealed class ProbeTests
{
    [TestMethod]
    public void Probe_Returns_Process_And_BaseDirectory()
    {
        var client = new DllClient(NullLogger<DllClient>.Instance);

        ProbeReport report = client.Probe();

        Assert.IsFalse(string.IsNullOrWhiteSpace(report.BaseDirectory));
        Assert.IsFalse(string.IsNullOrWhiteSpace(report.CurrentDirectory));
        Assert.IsTrue(report.Assemblies.Count >= 1);
    }

    [TestMethod]
    public void Smoke_Without_Fixtures_Does_Not_Throw()
    {
        var client = new DllClient(NullLogger<DllClient>.Instance);

        SmokeReport report = client.Smoke(new SmokeOptions
        {
            RequireNativeOk = false
        });

        Assert.IsNotNull(report);
        Assert.IsTrue(report.Warnings.Count >= 1);
    }
}
