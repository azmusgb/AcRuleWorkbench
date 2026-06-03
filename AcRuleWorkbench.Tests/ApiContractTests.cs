using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Threading.Tasks;
using AcRuleWorkbench.Api.V1;
using AcRuleWorkbench.Core;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace AcRuleWorkbench.Tests;

[TestClass]
public sealed class ApiContractTests
{
    [TestMethod]
    public void Dispatch_OpenApi_With_Post_Returns_MethodNotAllowed_ErrorEnvelope()
    {
        var service = new WorkbenchApiService(new StubClient(), new WorkbenchApiServerOptions());
        using var requestHandle = HttpListenerRequestFactory.Create("POST", "http://localhost/api/v1/openapi.json");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/openapi.json", request);

        Assert.AreEqual(405, result.StatusCode);
        Assert.IsTrue(result.Headers.ContainsKey("X-Error-Code"));
        Assert.AreEqual("MethodNotAllowed", result.Headers["X-Error-Code"]);

        dynamic body = result.Body;
        Assert.IsFalse((bool)body.Ok);
        Assert.AreEqual("MethodNotAllowed", (string)body.Error.Code);
    }

    [TestMethod]
    public void Dispatch_UnknownRoute_Returns_NotFound_Envelope()
    {
        var service = new WorkbenchApiService(new StubClient(), new WorkbenchApiServerOptions());
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/unknown");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/unknown", request);

        Assert.AreEqual(404, result.StatusCode);
        dynamic body = result.Body;
        Assert.IsFalse((bool)body.Ok);
        Assert.AreEqual("RouteNotFound", (string)body.Error.Code);
    }

    [TestMethod]
    public void Dispatch_SnapshotRefresh_WhenDisabled_Returns_Conflict_Envelope()
    {
        var service = new WorkbenchApiService(new StubClient(), new WorkbenchApiServerOptions { AllowMutatingCommands = false, DefaultFwdPath = "C:\\fwd.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("POST", "http://localhost/api/v1/snapshot/refresh");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/snapshot/refresh", request);

        Assert.AreEqual(409, result.StatusCode);
        dynamic body = result.Body;
        Assert.IsFalse((bool)body.Ok);
        Assert.AreEqual("RefreshDisabled", (string)body.Error.Code);
    }

    [TestMethod]
    public void Dispatch_Status_WithPathOverrideDisabled_Returns_Forbidden_Envelope()
    {
        var service = new WorkbenchApiService(new StubClient(), new WorkbenchApiServerOptions
        {
            AllowPathQuery = false,
            DefaultFwdPath = "C:\\default.cfd"
        });

        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/status?path=C:%5C%5Coverride.cfd");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/status", request);

        Assert.AreEqual(403, result.StatusCode);
        dynamic body = result.Body;
        Assert.IsFalse((bool)body.Ok);
        Assert.AreEqual("PathOverrideDisabled", (string)body.Error.Code);
    }

    [TestMethod]
    public void Dispatch_RuleDetail_WithRuleGuid_Returns_RuleDetail_Envelope()
    {
        var service = new WorkbenchApiService(new RuleGuidStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/rules/db5bf065-618b-44ca-8484-0d12384e7d1a");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/rules/db5bf065-618b-44ca-8484-0d12384e7d1a", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.RuleDetail", body.Value<string>("schema"));
        Assert.AreEqual("node-000414", body["data"]?["identity"]?["NodeId"]?.Value<string>());
        Assert.AreEqual("db5bf065-618b-44ca-8484-0d12384e7d1a", body["data"]?["identity"]?["RuleGuid"]?.Value<string>());
        Assert.IsNotNull(body["data"]?["fieldResolution"]?["summary"]);
    }

    [TestMethod]
    public void Dispatch_RuleDetail_FieldResolution_Returns_Resolved_And_Unresolved_Items()
    {
        var service = new WorkbenchApiService(new FieldResolutionStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/rules/field-resolve-guid");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/rules/field-resolve-guid", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));

        JObject? summary = body["data"]?["fieldResolution"]?["summary"] as JObject;
        Assert.IsNotNull(summary);
        Assert.AreEqual(2, summary!["referenced"]?.Value<int>());
        Assert.AreEqual(1, summary["resolved"]?.Value<int>());
        Assert.AreEqual(1, summary["unresolved"]?.Value<int>());

        JArray? items = body["data"]?["fieldResolution"]?["items"] as JArray;
        Assert.IsNotNull(items);
        Assert.IsTrue(items!.Any(i => string.Equals((string?)i?["referencedField"], "SubscriberID_OCR", StringComparison.OrdinalIgnoreCase) && (i?["fieldExists"]?.Value<bool>() ?? false)));
        Assert.IsTrue(items.Any(i => string.Equals((string?)i?["referencedField"], "UnknownField999", StringComparison.OrdinalIgnoreCase) && !(i?["fieldExists"]?.Value<bool>() ?? true)));
    }

    [TestMethod]
    public void Dispatch_FwdOverview_Returns_CanonicalEnvelope()
    {
        var service = new WorkbenchApiService(new StubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/fwd/overview");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/fwd/overview", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.FwdOverview", body.Value<string>("schema"));
        Assert.AreEqual("C:\\default.cfd", body["data"]?["source"]?["path"]?.Value<string>());
    }

    [TestMethod]
    public void Dispatch_FwdProcessPrivate_UsesRequestedProcessName()
    {
        var client = new ProcessPrivateStubClient();
        var service = new WorkbenchApiService(client, new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/fwd/processes/AC/private");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/fwd/processes/AC/private", request);

        Assert.AreEqual(200, result.StatusCode);
        Assert.AreEqual("AC", client.LastProcessName);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.AreEqual("AcWorkbench.FwdProcessPrivate", body.Value<string>("schema"));
    }

    [TestMethod]
    public void Dispatch_FwdTables_Returns_TablePayloadEnvelope()
    {
        var service = new WorkbenchApiService(new TableSemanticStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/fwd/tables");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/fwd/tables", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.FwdTables", body.Value<string>("schema"));
        Assert.IsNotNull(body["data"]?["count"]);
        Assert.IsNotNull(body["data"]?["items"]);
        Assert.IsNotNull(body["data"]?["diagnostics"]);
        JArray? items = body["data"]?["items"] as JArray;
        Assert.IsNotNull(items);
        Assert.IsTrue(items!.Count >= 1);
        JObject first = (JObject)items[0]!;
        Assert.IsNotNull(first["parsedColumns"]);
        Assert.IsNotNull(first["usageDerivedFields"]);
        Assert.IsNotNull(first["diagnostics"]);
    }

    [TestMethod]
    public void Dispatch_FwdTablesInferred_Returns_InferredTableEnvelope()
    {
        var service = new WorkbenchApiService(new StubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/fwd/tables/inferred");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/fwd/tables/inferred", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.FwdTablesInferred", body.Value<string>("schema"));
        Assert.IsNotNull(body["data"]?["count"]);
        Assert.IsNotNull(body["data"]?["items"]);
    }

    [TestMethod]
    public void Dispatch_FwdUdfs_Returns_CanonicalUdfEnvelope()
    {
        var service = new WorkbenchApiService(new StubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/fwd/udfs");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/fwd/udfs", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.FwdUdfs", body.Value<string>("schema"));
        Assert.IsNotNull(body["data"]?["count"]);
        Assert.IsNotNull(body["data"]?["items"]);
    }

    [TestMethod]
    public void Dispatch_FwdUdfDetail_Returns_Parameters_And_ConfiguredRules()
    {
        var service = new WorkbenchApiService(new UdfDetailStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/fwd/udfs/CopyIfDestBlank");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/fwd/udfs/CopyIfDestBlank", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.FwdUdfDetail", body.Value<string>("schema"));
        Assert.AreEqual("CopyIfDestBlank", body["data"]?["name"]?.Value<string>());
        Assert.IsTrue(body["data"]?["fieldListCount"]?.Value<int>() >= 1);
        Assert.IsTrue((body["data"]?["usage"]?["directCallers"] as JArray)?.Count >= 1);
    }

    [TestMethod]
    public void Dispatch_FwdProcessDrivers_Returns_ProcessDriverEnvelope()
    {
        var service = new WorkbenchApiService(new ProcessPrivateStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/fwd/processes/drivers");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/fwd/processes/drivers", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.FwdProcessDrivers", body.Value<string>("schema"));
        Assert.IsNotNull(body["data"]?["count"]);
        Assert.IsNotNull(body["data"]?["items"]);
        JArray? items = body["data"]?["items"] as JArray;
        Assert.IsNotNull(items);
        Assert.IsTrue(items!.Count >= 1);
        JObject first = (JObject)items[0]!;
        Assert.IsNotNull(first["classification"]);
        Assert.IsNotNull(first["parsedDriverConfig"]);
        Assert.IsNotNull(first["diagnostics"]);
    }

    [TestMethod]
    public void Dispatch_Routes_Contains_SemanticHonesty_For_Drivers_Tables_And_Udfs()
    {
        var service = new WorkbenchApiService(new StubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/routes");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/routes", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));

        JArray routes = (JArray)(body["data"]?["routes"] ?? new JArray());

        JObject? drivers = routes.FirstOrDefault(r => string.Equals((string?)r?["path"], "/api/v1/fwd/processes/drivers", StringComparison.OrdinalIgnoreCase)) as JObject;
        JObject? tables = routes.FirstOrDefault(r => string.Equals((string?)r?["path"], "/api/v1/fwd/tables", StringComparison.OrdinalIgnoreCase)) as JObject;
        JObject? udfs = routes.FirstOrDefault(r => string.Equals((string?)r?["path"], "/api/v1/fwd/udfs", StringComparison.OrdinalIgnoreCase)) as JObject;

        Assert.IsNotNull(drivers);
        Assert.IsTrue(((string?)drivers!["description"] ?? string.Empty).IndexOf("Heuristic", StringComparison.OrdinalIgnoreCase) >= 0);

        Assert.IsNotNull(tables);
        Assert.IsTrue(((string?)tables!["description"] ?? string.Empty).IndexOf("usage-derived", StringComparison.OrdinalIgnoreCase) >= 0);

        Assert.IsNotNull(udfs);
        Assert.IsTrue(((string?)udfs!["description"] ?? string.Empty).IndexOf("caller-side usage evidence", StringComparison.OrdinalIgnoreCase) >= 0);
    }

    [TestMethod]
    public void Dispatch_FwdProcessDetail_Returns_CanonicalProcessSummaryEnvelope()
    {
        var service = new WorkbenchApiService(new ProcessPrivateStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/fwd/processes/AC");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/fwd/processes/AC", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.FwdProcessDetail", body.Value<string>("schema"));
        Assert.AreEqual("AC", body["data"]?["Name"]?.Value<string>());
        Assert.AreEqual("Fwd.ProcessNames", body["data"]?["Source"]?.Value<string>());
    }
    [TestMethod]
    public void Dispatch_Snapshot_WithSnapshotModeLive_Rebuilds_ForEachRequest()
    {
        var client = new CountingSnapshotClient();
        var service = new WorkbenchApiService(client, new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });

        using (var first = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/snapshot?snapshotMode=live"))
        {
            var result = service.Dispatch("api/v1/snapshot", first.Request);
            Assert.AreEqual(200, result.StatusCode);
        }

        using (var second = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/snapshot?snapshotMode=live"))
        {
            var result = service.Dispatch("api/v1/snapshot", second.Request);
            Assert.AreEqual(200, result.StatusCode);
        }

        Assert.AreEqual(2, client.InspectCalls);
    }

    [TestMethod]
    public void Dispatch_Snapshot_WithSnapshotModeSnapshot_UsesCache_WhenNoCacheServerModeEnabled()
    {
        var client = new CountingSnapshotClient();
        var service = new WorkbenchApiService(client, new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd", DisableSnapshotCache = true });

        using (var first = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/snapshot?snapshotMode=snapshot"))
        {
            var result = service.Dispatch("api/v1/snapshot", first.Request);
            Assert.AreEqual(200, result.StatusCode);
        }

        using (var second = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/snapshot?snapshotMode=snapshot"))
        {
            var result = service.Dispatch("api/v1/snapshot", second.Request);
            Assert.AreEqual(200, result.StatusCode);
        }

        Assert.AreEqual(1, client.InspectCalls);
    }

    [TestMethod]
    public void Dispatch_UnknownRoute_WithDisposedRequest_Returns_NotFound_Envelope()
    {
        var service = new WorkbenchApiService(new StubClient(), new WorkbenchApiServerOptions());
        HttpListenerRequest request;

        using (var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/unknown"))
        {
            request = requestHandle.Request;
        }

        var result = service.Dispatch("api/v1/unknown", request);

        Assert.AreEqual(404, result.StatusCode);
        Assert.IsTrue(result.Headers.ContainsKey("X-Request-Id"));
        Assert.IsFalse(string.IsNullOrWhiteSpace(result.Headers["X-Request-Id"]));
        dynamic body = result.Body;
        Assert.IsFalse((bool)body.Ok);
        Assert.AreEqual("RouteNotFound", (string)body.Error.Code);
    }

    private sealed class StubClient : IFormWorksExtractionClient
    {
        public ProbeReport Probe() => new ProbeReport();
        public FwdInspectionReport Inspect(FwdInspectionOptions options) => new FwdInspectionReport { Path = options.Path ?? "C:\\default.cfd" };
        public OcrInspectionReport InspectOcr(OcrInspectionOptions options) => new OcrInspectionReport { Path = options.Path ?? string.Empty };
        public SmokeReport Smoke(SmokeOptions options) => new SmokeReport();
        public StcTreeReport InspectProcessTree(StcTraversalOptions options) => new StcTreeReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public FipInspectionReport InspectFip(FipInspectionOptions options) => new FipInspectionReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "FIP" };
        public AcRuleReport InspectAcRules(AcRuleOptions options) => new AcRuleReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcRelationshipReport TraceAcRelationships(AcTraceOptions options) => new AcRelationshipReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcIndexReport BuildAcIndex(AcRuleOptions options) => new AcIndexReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcDisabledReport AnalyzeDisabledRules(AcDisabledOptions options) => new AcDisabledReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
public AcDiagnosticsReport BuildAcDiagnostics(AcRuleOptions options) => new AcDiagnosticsReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcTreeReport BuildAcTree(AcTreeOptions options) => new AcTreeReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcViewerReport ExportAcViewer(AcViewerOptions options) => new AcViewerReport { FwdPath = options.Path ?? string.Empty, OutputPath = "viewer.html" };
    }

    private sealed class RuleGuidStubClient : IFormWorksExtractionClient
    {
        public ProbeReport Probe() => new ProbeReport();
        public FwdInspectionReport Inspect(FwdInspectionOptions options) => new FwdInspectionReport { Path = options.Path ?? "C:\\default.cfd" };
        public OcrInspectionReport InspectOcr(OcrInspectionOptions options) => new OcrInspectionReport { Path = options.Path ?? string.Empty };
        public SmokeReport Smoke(SmokeOptions options) => new SmokeReport();
        public StcTreeReport InspectProcessTree(StcTraversalOptions options) => new StcTreeReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public FipInspectionReport InspectFip(FipInspectionOptions options) => new FipInspectionReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };

        public AcRuleReport InspectAcRules(AcRuleOptions options)
        {
            var report = new AcRuleReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
            report.Rules.Add(new AcRuleSummary
            {
                ScopePath = "AC/Pages/DentalADA",
                ScopeType = "Page",
                ScopeName = "DentalADA",
                RuleIndex = 6,
                RuleGuid = "db5bf065-618b-44ca-8484-0d12384e7d1a",
                RuleName = "Fix no splitting",
                DisabledState = AcDisabledStates.DisabledDirect
            });
            return report;
        }

        public AcRelationshipReport TraceAcRelationships(AcTraceOptions options) => new AcRelationshipReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcIndexReport BuildAcIndex(AcRuleOptions options) => new AcIndexReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcDisabledReport AnalyzeDisabledRules(AcDisabledOptions options) => new AcDisabledReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
public AcDiagnosticsReport BuildAcDiagnostics(AcRuleOptions options) => new AcDiagnosticsReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };

        public AcTreeReport BuildAcTree(AcTreeOptions options)
        {
            var report = new AcTreeReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
            report.Nodes.Add(new AcTreeNode
            {
                NodeId = 414,
                ParentNodeId = 413,
                ActionListIndex = 0,
                HierarchyLevel = 4,
                RuleIndexWithinScope = 6,
                ScopePath = "AC/Pages/DentalADA",
                ScopeType = "Page",
                ScopeName = "DentalADA",
                IsRuleNode = true,
                RuleGuid = "db5bf065-618b-44ca-8484-0d12384e7d1a",
                RuleName = "Fix no splitting",
                DisabledState = AcDisabledStates.DisabledDirect
            });
            report.RebuildCounts();
            return report;
        }

        public AcViewerReport ExportAcViewer(AcViewerOptions options) => new AcViewerReport { FwdPath = options.Path ?? string.Empty, OutputPath = "viewer.html" };
    }

    private sealed class CountingSnapshotClient : IFormWorksExtractionClient
    {
        public int InspectCalls { get; private set; }

        public ProbeReport Probe() => new ProbeReport();

        public FwdInspectionReport Inspect(FwdInspectionOptions options)
        {
            InspectCalls++;
            return new FwdInspectionReport { Path = options.Path ?? "C:\\default.cfd" };
        }

        public OcrInspectionReport InspectOcr(OcrInspectionOptions options) => new OcrInspectionReport { Path = options.Path ?? string.Empty };
        public SmokeReport Smoke(SmokeOptions options) => new SmokeReport();
        public StcTreeReport InspectProcessTree(StcTraversalOptions options) => new StcTreeReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public FipInspectionReport InspectFip(FipInspectionOptions options) => new FipInspectionReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcRuleReport InspectAcRules(AcRuleOptions options) => new AcRuleReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcRelationshipReport TraceAcRelationships(AcTraceOptions options) => new AcRelationshipReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcIndexReport BuildAcIndex(AcRuleOptions options) => new AcIndexReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcDisabledReport AnalyzeDisabledRules(AcDisabledOptions options) => new AcDisabledReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
public AcDiagnosticsReport BuildAcDiagnostics(AcRuleOptions options) => new AcDiagnosticsReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };

        public AcTreeReport BuildAcTree(AcTreeOptions options)
        {
            var report = new AcTreeReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
            report.RebuildCounts();
            return report;
        }

        public AcViewerReport ExportAcViewer(AcViewerOptions options) => new AcViewerReport { FwdPath = options.Path ?? string.Empty, OutputPath = "viewer.html" };
    }

    private sealed class ProcessPrivateStubClient : IFormWorksExtractionClient
    {
        public string? LastProcessName { get; private set; }

        public ProbeReport Probe() => new ProbeReport();
        public FwdInspectionReport Inspect(FwdInspectionOptions options)
        {
            var report = new FwdInspectionReport { Path = options.Path ?? "C:\\default.cfd" };
            report.Processes.Add("AC");
            return report;
        }
        public OcrInspectionReport InspectOcr(OcrInspectionOptions options) => new OcrInspectionReport { Path = options.Path ?? string.Empty };
        public SmokeReport Smoke(SmokeOptions options) => new SmokeReport();

        public StcTreeReport InspectProcessTree(StcTraversalOptions options)
        {
            LastProcessName = options.ProcessName;
            return new StcTreeReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        }

        public FipInspectionReport InspectFip(FipInspectionOptions options) => new FipInspectionReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "FIP" };
        public AcRuleReport InspectAcRules(AcRuleOptions options) => new AcRuleReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcRelationshipReport TraceAcRelationships(AcTraceOptions options) => new AcRelationshipReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcIndexReport BuildAcIndex(AcRuleOptions options) => new AcIndexReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcDisabledReport AnalyzeDisabledRules(AcDisabledOptions options) => new AcDisabledReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
public AcDiagnosticsReport BuildAcDiagnostics(AcRuleOptions options) => new AcDiagnosticsReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };

        public AcTreeReport BuildAcTree(AcTreeOptions options)
        {
            var report = new AcTreeReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
            report.RebuildCounts();
            return report;
        }

        public AcViewerReport ExportAcViewer(AcViewerOptions options) => new AcViewerReport { FwdPath = options.Path ?? string.Empty, OutputPath = "viewer.html" };
    }

    private sealed class UdfDetailStubClient : IFormWorksExtractionClient
    {
        public ProbeReport Probe() => new ProbeReport();

        public FwdInspectionReport Inspect(FwdInspectionOptions options)
        {
            var report = new FwdInspectionReport { Path = options.Path ?? "C:\\default.cfd" };
            report.Resources.Add(new ResourceBucket
            {
                Type = "Function",
                Names = { "CopyIfDestBlank" }
            });
            return report;
        }

        public OcrInspectionReport InspectOcr(OcrInspectionOptions options) => new OcrInspectionReport { Path = options.Path ?? string.Empty };
        public SmokeReport Smoke(SmokeOptions options) => new SmokeReport();
        public StcTreeReport InspectProcessTree(StcTraversalOptions options) => new StcTreeReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public FipInspectionReport InspectFip(FipInspectionOptions options) => new FipInspectionReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "FIP" };

        public AcRuleReport InspectAcRules(AcRuleOptions options)
        {
            var report = new AcRuleReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
            var rule = new AcRuleSummary
            {
                ScopePath = "AC/Pages/DentalADA",
                ScopeType = "Page",
                ScopeName = "DentalADA",
                RuleIndex = 11,
                RuleGuid = "11111111-2222-3333-4444-555555555555",
                RuleName = "Run CopyIfDestBlank",
                FunctionName = "CopyIfDestBlank"
            };
            rule.Parameters["Source"] = new List<string> { "SubscriberID_OCR" };
            rule.Parameters["Destination"] = new List<string> { "SubscriberID_Final" };
            rule.ActionNames.Add("Copied");
            rule.ActionNames.Add("NotCopied");
            report.Rules.Add(rule);
            return report;
        }

        public AcRelationshipReport TraceAcRelationships(AcTraceOptions options) => new AcRelationshipReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcIndexReport BuildAcIndex(AcRuleOptions options) => new AcIndexReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcDisabledReport AnalyzeDisabledRules(AcDisabledOptions options) => new AcDisabledReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
public AcDiagnosticsReport BuildAcDiagnostics(AcRuleOptions options) => new AcDiagnosticsReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };

        public AcTreeReport BuildAcTree(AcTreeOptions options)
        {
            var report = new AcTreeReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
            report.RebuildCounts();
            return report;
        }

        public AcViewerReport ExportAcViewer(AcViewerOptions options) => new AcViewerReport { FwdPath = options.Path ?? string.Empty, OutputPath = "viewer.html" };
    }

    private sealed class TableSemanticStubClient : IFormWorksExtractionClient
    {
        public ProbeReport Probe() => new ProbeReport();

        public FwdInspectionReport Inspect(FwdInspectionOptions options)
        {
            var report = new FwdInspectionReport { Path = options.Path ?? "C:\\default.cfd" };
            report.Resources.Add(new ResourceBucket
            {
                Type = "Table",
                Names = { "MemberTable" }
            });
            return report;
        }

        public OcrInspectionReport InspectOcr(OcrInspectionOptions options) => new OcrInspectionReport { Path = options.Path ?? string.Empty };
        public SmokeReport Smoke(SmokeOptions options) => new SmokeReport();
        public StcTreeReport InspectProcessTree(StcTraversalOptions options) => new StcTreeReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public FipInspectionReport InspectFip(FipInspectionOptions options) => new FipInspectionReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "FIP" };
        public AcRuleReport InspectAcRules(AcRuleOptions options) => new AcRuleReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };

        public AcRelationshipReport TraceAcRelationships(AcTraceOptions options)
        {
            var report = new AcRelationshipReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
            report.Relationships.Add(new AcRuleRelationship
            {
                ScopePath = "AC/Pages/DentalADA",
                ScopeType = "Page",
                ScopeName = "DentalADA",
                RuleIndex = 1,
                RuleGuid = "11111111-1111-1111-1111-111111111111",
                RuleName = "Lookup member",
                FunctionName = "LookupFn",
                Kind = "Read",
                TargetType = "Table",
                Target = "MemberTable",
                ParameterRole = "SourceTable",
                Confidence = "High"
            });
            report.Relationships.Add(new AcRuleRelationship
            {
                ScopePath = "AC/Pages/DentalADA",
                ScopeType = "Page",
                ScopeName = "DentalADA",
                RuleIndex = 1,
                RuleGuid = "11111111-1111-1111-1111-111111111111",
                RuleName = "Lookup member",
                FunctionName = "LookupFn",
                Kind = "Read",
                TargetType = "Field",
                Target = "MemberId",
                ParameterRole = "Column",
                Confidence = "High"
            });
            return report;
        }

        public AcIndexReport BuildAcIndex(AcRuleOptions options) => new AcIndexReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcDisabledReport AnalyzeDisabledRules(AcDisabledOptions options) => new AcDisabledReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
public AcDiagnosticsReport BuildAcDiagnostics(AcRuleOptions options) => new AcDiagnosticsReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcTreeReport BuildAcTree(AcTreeOptions options) => new AcTreeReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcViewerReport ExportAcViewer(AcViewerOptions options) => new AcViewerReport { FwdPath = options.Path ?? string.Empty, OutputPath = "viewer.html" };
    }

    private sealed class FieldResolutionStubClient : IFormWorksExtractionClient
    {
        public ProbeReport Probe() => new ProbeReport();

        public FwdInspectionReport Inspect(FwdInspectionOptions options)
        {
            var report = new FwdInspectionReport { Path = options.Path ?? "C:\\default.cfd" };
            var bucket = new FieldBucket { ScopeType = "Page", ScopeName = "DentalADA" };
            bucket.Fields.Add(new FieldSummary
            {
                Name = "SubscriberID_OCR",
                Type = "Text",
                Geometry = "10,20,120,18"
            });
            report.Fields.Add(bucket);
            return report;
        }

        public OcrInspectionReport InspectOcr(OcrInspectionOptions options) => new OcrInspectionReport { Path = options.Path ?? string.Empty };
        public SmokeReport Smoke(SmokeOptions options) => new SmokeReport();
        public StcTreeReport InspectProcessTree(StcTraversalOptions options) => new StcTreeReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public FipInspectionReport InspectFip(FipInspectionOptions options) => new FipInspectionReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "FIP" };

        public AcRuleReport InspectAcRules(AcRuleOptions options)
        {
            var report = new AcRuleReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
            report.Rules.Add(new AcRuleSummary
            {
                ScopePath = "AC/Pages/DentalADA",
                ScopeType = "Page",
                ScopeName = "DentalADA",
                RuleIndex = 1,
                RuleGuid = "field-resolve-guid",
                RuleName = "Resolve field refs"
            });
            return report;
        }

        public AcRelationshipReport TraceAcRelationships(AcTraceOptions options) => new AcRelationshipReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcIndexReport BuildAcIndex(AcRuleOptions options) => new AcIndexReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcDisabledReport AnalyzeDisabledRules(AcDisabledOptions options) => new AcDisabledReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
public AcDiagnosticsReport BuildAcDiagnostics(AcRuleOptions options) => new AcDiagnosticsReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };

        public AcTreeReport BuildAcTree(AcTreeOptions options)
        {
            var report = new AcTreeReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
            var node = new AcTreeNode
            {
                NodeId = 1,
                ParentNodeId = -1,
                ActionListIndex = -1,
                HierarchyLevel = 0,
                RuleIndexWithinScope = 1,
                ScopePath = "AC/Pages/DentalADA",
                ScopeType = "Page",
                ScopeName = "DentalADA",
                IsRuleNode = true,
                RuleGuid = "field-resolve-guid",
                RuleName = "Resolve field refs"
            };
            node.Parameters["SourceField"] = new List<string> { "SubscriberID_OCR" };
            node.Parameters["DestinationField"] = new List<string> { "UnknownField999" };
            report.Nodes.Add(node);
            report.RebuildCounts();
            return report;
        }

        public AcViewerReport ExportAcViewer(AcViewerOptions options) => new AcViewerReport { FwdPath = options.Path ?? string.Empty, OutputPath = "viewer.html" };
    }

    private static class HttpListenerRequestFactory
    {
        public static RequestHandle Create(string method, string url)
        {
            Uri uri = new Uri(url);
            int port = AllocateLoopbackPort();
            string prefix = "http://127.0.0.1:" + port + "/";
            string requestUrl = prefix.TrimEnd('/') + uri.PathAndQuery;

            var listener = new HttpListener();
            listener.Prefixes.Add(prefix);
            listener.Start();

            Task sendTask = Task.Run(() => Send(method, requestUrl));
            HttpListenerContext context = listener.GetContext();
            context.Response.StatusCode = 204;
            return new RequestHandle(listener, context, sendTask);
        }

        private static void Send(string method, string requestUrl)
        {
            var request = (HttpWebRequest)WebRequest.Create(requestUrl);
            request.Method = method;
            request.Timeout = 5000;
            request.ReadWriteTimeout = 5000;
            if (string.Equals(method, "POST", StringComparison.OrdinalIgnoreCase)
                || string.Equals(method, "PUT", StringComparison.OrdinalIgnoreCase)
                || string.Equals(method, "PATCH", StringComparison.OrdinalIgnoreCase))
            {
                request.ContentLength = 0;
            }
            try
            {
                using (var response = (HttpWebResponse)request.GetResponse())
                {
                }
            }
            catch (WebException ex)
            {
                ex.Response?.Close();
                throw;
            }
        }

        private static int AllocateLoopbackPort()
        {
            var tcpListener = new TcpListener(IPAddress.Loopback, 0);
            tcpListener.Start();
            int port = ((IPEndPoint)tcpListener.LocalEndpoint).Port;
            tcpListener.Stop();
            return port;
        }

        public sealed class RequestHandle : IDisposable
        {
            private readonly HttpListener _listener;
            private readonly HttpListenerContext _context;
            private readonly Task _sendTask;

            public RequestHandle(HttpListener listener, HttpListenerContext context, Task sendTask)
            {
                _listener = listener;
                _context = context;
                _sendTask = sendTask;
                Request = context.Request;
            }

            public HttpListenerRequest Request { get; }

            public void Dispose()
            {
                try
                {
                    _context.Response.Close();
                    _sendTask.GetAwaiter().GetResult();
                }
                finally
                {
                    _listener.Close();
                }
            }
        }
    }
}
