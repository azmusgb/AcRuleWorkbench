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

        JObject? editorModel = body["data"]?["editorModel"] as JObject;
        Assert.IsNotNull(editorModel);
        Assert.AreEqual("SelectedRulePacket", editorModel!["objectKind"]?.Value<string>());
        Assert.AreEqual("AC/Pages/DentalADA", editorModel["ruleList"]?["scopeId"]?.Value<string>());
        Assert.AreEqual("node-000413", editorModel["parentRule"]?["nodeId"]?.Value<string>());
        Assert.AreEqual("Failed", editorModel["incomingStatusResult"]?["name"]?.Value<string>());
        Assert.AreEqual("ParentRuleStatusResultOwnsSelectedRule", editorModel["incomingStatusResult"]?["relationship"]?.Value<string>());
        Assert.AreEqual("Formatf", editorModel["function"]?["name"]?.Value<string>());
        Assert.IsTrue(editorModel["function"]?["defined"]?.Value<bool>() ?? false);
        Assert.IsTrue(editorModel["function"]?["schemaProfile"]?["writesFields"]?.Value<bool>() ?? false);
        JArray selectedFunctionSchema = (JArray)(editorModel["function"]?["parameterSchema"] ?? new JArray());
        Assert.IsTrue(selectedFunctionSchema.Any(p => string.Equals((string?)p?["role"], "MutatedField", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue((editorModel["actionLists"] as JArray)?.Any(a => string.Equals((string?)a?["statusResult"]?["name"], "OK", StringComparison.OrdinalIgnoreCase)) ?? false);
    }

    [TestMethod]
    public void Dispatch_RuleEditorModel_Returns_SelectedRulePacket_Envelope()
    {
        var service = new WorkbenchApiService(new RuleGuidStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/rules/node-000414/editor-model");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/rules/node-000414/editor-model", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.SelectedRulePacket", body.Value<string>("schema"));
        Assert.AreEqual("SelectedRulePacket", body["data"]?["objectKind"]?.Value<string>());
        Assert.AreEqual("StatusResultOwnsActionList", body["data"]?["actionLists"]?[0]?["statusResult"]?["relationship"]?.Value<string>());
        Assert.AreEqual("node-000415", body["data"]?["actionLists"]?[0]?["children"]?[0]?["nodeId"]?.Value<string>());
    }

    [TestMethod]
    public void Dispatch_EditorModel_Returns_SnapshotWide_ParityCounts()
    {
        var service = new WorkbenchApiService(new RuleGuidStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/editor-model?include=ruleLists,runtimeImpacts");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/editor-model", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.EditorModel", body.Value<string>("schema"));
        Assert.IsTrue(body["data"]?["counts"]?["ruleLists"]?.Value<int>() >= 1);
        Assert.IsTrue(body["data"]?["counts"]?["ruleConfigurations"]?.Value<int>() >= 3);
        Assert.IsTrue(body["data"]?["counts"]?["runtimeImpacts"]?.Value<int>() >= 1);
    }

    [TestMethod]
    public void Dispatch_RuleLists_Returns_StatusResult_And_ActionList_Model()
    {
        var service = new WorkbenchApiService(new RuleGuidStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/rule-lists/AC/Pages/DentalADA");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/rule-lists/AC/Pages/DentalADA", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.RuleListDetail", body.Value<string>("schema"));
        JArray configs = (JArray)(body["data"]?["ruleConfigurations"] ?? new JArray());
        JObject selected = (JObject)configs.First(c => string.Equals((string?)c?["nodeId"], "node-000414", StringComparison.OrdinalIgnoreCase));
        Assert.AreEqual("Failed", selected["incomingStatusResult"]?["name"]?.Value<string>());
        Assert.AreEqual("ParentRuleStatusResultOwnsSubList", selected["incomingStatusResult"]?["relationship"]?.Value<string>());
        Assert.AreEqual("OK", selected["actionLists"]?[0]?["statusResult"]?["name"]?.Value<string>());
        Assert.AreEqual("node-000415", selected["actionLists"]?[0]?["childRuleNodeIds"]?[0]?.Value<string>());
        Assert.IsTrue(selected["functionSchema"]?["defined"]?.Value<bool>() ?? false);
        Assert.IsTrue(((JArray)(selected["sourceHandles"] ?? new JArray())).Any(h => string.Equals((string?)h?["source"], "AcTreeReport.Nodes", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue(((JArray)(selected["rejects"] ?? new JArray())).Any(r => string.Equals((string?)r?["message"], "Subscriber id required", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue(((JArray)(selected["rejects"] ?? new JArray())).Any(r => string.Equals((string?)r?["code"], "SUBID_REQ", StringComparison.OrdinalIgnoreCase)));

        JObject parent = (JObject)configs.First(c => string.Equals((string?)c?["nodeId"], "node-000413", StringComparison.OrdinalIgnoreCase));
        Assert.IsTrue(((JArray)(parent["diagnostics"] ?? new JArray())).Any(d => (d.Value<string>() ?? string.Empty).StartsWith("AmbiguousFlatInventoryMatches", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue(((JArray)(parent["sourceHandles"] ?? new JArray())).Any(h => string.Equals((string?)h?["source"], "AcRuleReport.Rules", StringComparison.OrdinalIgnoreCase) && string.Equals((string?)h?["confidence"], "Low", StringComparison.OrdinalIgnoreCase)));
    }

    [TestMethod]
    public void Dispatch_FwdUdfsCanonical_Returns_CallerBindings_And_FieldListNames()
    {
        var service = new WorkbenchApiService(new UdfDetailStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/fwd/udfs/canonical");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/fwd/udfs/canonical", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.UdfDefinitions", body.Value<string>("schema"));
        JObject udf = (JObject)((JArray)(body["data"]?["items"] ?? new JArray())).First(i => string.Equals((string?)i?["name"], "CopyIfDestBlank", StringComparison.OrdinalIgnoreCase));
        Assert.IsTrue(udf["definitionParsed"]?.Value<bool>() ?? false);
        Assert.IsTrue(udf["bodyParsed"]?.Value<bool>() ?? false);
        Assert.IsTrue(udf["resourceEvidence"]?["hasPrivateTree"]?.Value<bool>() ?? false);
        Assert.IsTrue(((JArray)(udf["fieldListParameters"] ?? new JArray())).Any(p => string.Equals(p.Value<string>(), "Source", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue(((JArray)(udf["callerBindings"] ?? new JArray())).Count >= 1);
        Assert.IsTrue(((JArray)(udf["fieldListParameterBindings"] ?? new JArray())).Any(p =>
            string.Equals((string?)p?["parameterName"], "Source", StringComparison.OrdinalIgnoreCase) &&
            string.Equals((string?)p?["callerValue"], "SubscriberID_OCR", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue(((JArray)(udf["internalRuleTree"]?["candidateRuleNodes"] ?? new JArray())).Any(n => string.Equals((string?)n?["role"], "RuleBody", StringComparison.OrdinalIgnoreCase)));
        Assert.AreEqual("PartiallyParsed", udf["internalRuleTree"]?["parseState"]?.Value<string>());
        Assert.IsTrue(((JArray)(udf["internalRuleTree"]?["internalRuleList"]?["rules"] ?? new JArray())).Any(n =>
            string.Equals((string?)n?["name"], "UdfRuleBody", StringComparison.OrdinalIgnoreCase) &&
            string.Equals((string?)n?["source"], "ResourcePrivateTree", StringComparison.OrdinalIgnoreCase)));
    }

    [TestMethod]
    public void Dispatch_FwdSelectionLists_Returns_UsageDerived_MatchFields()
    {
        var service = new WorkbenchApiService(new TableSemanticStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/fwd/selection-lists");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/fwd/selection-lists", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.SelectionListDefinitions", body.Value<string>("schema"));
        JObject table = (JObject)((JArray)(body["data"]?["items"] ?? new JArray())).First(i => string.Equals((string?)i?["name"], "MemberTable", StringComparison.OrdinalIgnoreCase));
        Assert.IsTrue(table["canonical"]?.Value<bool>() ?? false);
        Assert.IsTrue(table["schemaParsed"]?.Value<bool>() ?? false);
        Assert.IsTrue(table["optionsParsed"]?.Value<bool>() ?? false);
        Assert.IsTrue(((JArray)(table["matchFields"] ?? new JArray())).Any(f => string.Equals((string?)f?["name"], "MemberId", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue(((JArray)(table["plugFields"] ?? new JArray())).Any(f => string.Equals((string?)f?["name"], "MemberName", StringComparison.OrdinalIgnoreCase)));
        JArray options = (JArray)(table["options"] ?? new JArray());
        Assert.IsTrue(options.Any(o => string.Equals((string?)o?["role"], "OperatorPrompt", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue(options.Any(o => string.Equals((string?)o?["role"], "NoGoodMatch", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue(options.Any(o => string.Equals((string?)o?["role"], "EnterBehavior", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue(options.Any(o => string.Equals((string?)o?["role"], "PlugOutcome", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue(options.Any(o => string.Equals((string?)o?["role"], "RejectOutcome", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue(((JArray)(table["usageLinks"] ?? new JArray())).Count >= 1);
    }

    [TestMethod]
    public void Dispatch_FwdObjectGraph_Returns_PrivateResourceNodes()
    {
        var service = new WorkbenchApiService(new UdfDetailStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/fwd/object-graph?kind=ResourcePrivateNode");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/fwd/object-graph", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.FwdObjectGraph", body.Value<string>("schema"));
        JArray nodes = (JArray)(body["data"]?["nodes"] ?? new JArray());
        Assert.IsTrue(nodes.Any(n => string.Equals((string?)n?["name"], "UdfRuleBody", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue(nodes.Any(n => string.Equals((string?)n?["metadata"]?["resourceName"], "CopyIfDestBlank", StringComparison.OrdinalIgnoreCase)));
    }

    [TestMethod]
    public void Dispatch_FwdRuntimeImpact_Returns_StaticOperatorImpact()
    {
        var service = new WorkbenchApiService(new RuleGuidStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/fwd/runtime-impact?type=FieldMutation");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/fwd/runtime-impact", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.RuntimeImpact", body.Value<string>("schema"));
        JArray items = (JArray)(body["data"]?["items"] ?? new JArray());
        JObject format = (JObject)items.First(i => string.Equals((string?)i?["functionName"], "Formatf", StringComparison.OrdinalIgnoreCase));
        Assert.IsTrue(((JArray)(format["behaviorFlags"] ?? new JArray())).Any(f => string.Equals(f.Value<string>(), "WritesField", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue(((JArray)(format["configuredStatusResults"] ?? new JArray())).Any(f => string.Equals(f.Value<string>(), "Failed", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue(((JArray)(format["parameters"]?["_ParamList0"] ?? new JArray())).Any(f => string.Equals(f.Value<string>(), "SubscriberID_OCR", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue(items.All(i => string.Equals((string?)i?["notProven"], "Static configuration evidence only; native runtime execution was not simulated.", StringComparison.OrdinalIgnoreCase)));
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
    public void Dispatch_FwdPageDesigns_Returns_Variants_Fields_And_RuleLinks()
    {
        var service = new WorkbenchApiService(new FieldResolutionStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/fwd/page-designs?page=DentalADA");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/fwd/page-designs", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.PageDesigns", body.Value<string>("schema"));

        JObject page = (JObject)((JArray)(body["data"]?["items"] ?? new JArray())).First();
        Assert.AreEqual("DentalADA", page["page"]?.Value<string>());
        Assert.IsTrue(((JArray)(page["variants"] ?? new JArray())).Any(v => string.Equals((string?)v?["formId"], "ADA2024", StringComparison.OrdinalIgnoreCase)));

        JObject field = (JObject)((JArray)(page["fields"] ?? new JArray())).First(f => string.Equals((string?)f?["name"], "SubscriberID_OCR", StringComparison.OrdinalIgnoreCase));
        Assert.AreEqual(10, field["rect"]?["x"]?.Value<int>());
        Assert.AreEqual(120, field["rect"]?["width"]?.Value<int>());
        Assert.IsTrue(((JArray)(field["roleFlags"] ?? new JArray())).Any(f => string.Equals(f.Value<string>(), "GeometryAvailable", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue(((JArray)(field["relatedRules"] ?? new JArray())).Any(r => string.Equals((string?)r?["target"], "node-000001", StringComparison.OrdinalIgnoreCase)));
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
        Assert.AreEqual("[redacted]\\default.cfd", body["data"]?["source"]?["path"]?.Value<string>());
    }

    [TestMethod]
    public void Dispatch_FwdProcessPrivate_UsesCanonicalProcessName()
    {
        var client = new ProcessPrivateStubClient();
        var service = new WorkbenchApiService(client, new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/fwd/processes/ac/private");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/fwd/processes/ac/private", request);

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
        Assert.AreEqual("PartiallyParsed", body["data"]?["bodyParseState"]?.Value<string>());
        Assert.IsTrue((body["data"]?["definition"]?["ruleBody"] as JArray)?.Count >= 1);
        Assert.IsTrue((body["data"]?["definition"]?["internalRuleList"]?["rules"] as JArray)?.Count >= 1);
        Assert.IsTrue((body["data"]?["usage"]?["directCallers"] as JArray)?.Count >= 1);
    }

    [TestMethod]
    public void Dispatch_FwdFunctions_Returns_Catalog_And_ObservedFunctions()
    {
        var service = new WorkbenchApiService(new UdfDetailStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/fwd/functions");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/fwd/functions", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.FwdFunctions", body.Value<string>("schema"));

        JArray items = (JArray)(body["data"]?["items"] ?? new JArray());
        JObject? formatf = items.FirstOrDefault(i => string.Equals((string?)i?["name"], "Formatf", StringComparison.OrdinalIgnoreCase)) as JObject;
        JObject? udf = items.FirstOrDefault(i => string.Equals((string?)i?["name"], "CopyIfDestBlank", StringComparison.OrdinalIgnoreCase)) as JObject;

        Assert.IsNotNull(formatf);
        Assert.IsTrue(formatf!["defined"]?.Value<bool>() ?? false);
        Assert.IsTrue(formatf["schemaProfile"]?["writesFields"]?.Value<bool>() ?? false);
        JArray formatfParameterSchema = (JArray)(formatf["parameterSchema"] ?? new JArray());
        Assert.IsTrue(formatfParameterSchema.Any(p => string.Equals((string?)p?["targetType"], "Field", StringComparison.OrdinalIgnoreCase)));
        Assert.IsNotNull(udf);
        Assert.IsTrue(udf!["observed"]?.Value<bool>() ?? false);
        Assert.AreEqual("User Defined", udf["category"]?.Value<string>());
        Assert.IsTrue((udf["diagnostics"] as JArray)?.Any(d => string.Equals(d.Value<string>(), "FunctionSchemaUnknown", StringComparison.OrdinalIgnoreCase)) ?? false);
    }

    [TestMethod]
    public void Dispatch_FwdFunctionDetail_Returns_ConfiguredStatuses_And_Parameters()
    {
        var service = new WorkbenchApiService(new UdfDetailStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/fwd/functions/CopyIfDestBlank");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/fwd/functions/CopyIfDestBlank", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.FwdFunctionDetail", body.Value<string>("schema"));
        Assert.AreEqual("CopyIfDestBlank", body["data"]?["name"]?.Value<string>());

        JArray configured = (JArray)(body["data"]?["interfaceModel"]?["configuredStatusResults"] ?? new JArray());
        JArray parameters = (JArray)(body["data"]?["interfaceModel"]?["observedParameterNames"] ?? new JArray());
        JArray unknownParameters = (JArray)(body["data"]?["interfaceModel"]?["unknownObservedParameterNames"] ?? new JArray());

        Assert.IsTrue(configured.Any(x => string.Equals(x.Value<string>(), "Copied", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue(parameters.Any(x => string.Equals(x.Value<string>(), "Source", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue(unknownParameters.Any(x => string.Equals(x.Value<string>(), "Source", StringComparison.OrdinalIgnoreCase)));
        Assert.AreEqual("ObservedParameterNames", body["data"]?["behavior"]?["schemaProfile"]?["source"]?.Value<string>());
        Assert.IsTrue(body["data"]?["usage"]?["ruleCount"]?.Value<int>() >= 1);
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
    public void Dispatch_Routes_Contains_SemanticHonesty_For_Drivers_Tables_Functions_And_Udfs()
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
        JObject? functions = routes.FirstOrDefault(r => string.Equals((string?)r?["path"], "/api/v1/fwd/functions", StringComparison.OrdinalIgnoreCase)) as JObject;
        JObject? udfs = routes.FirstOrDefault(r => string.Equals((string?)r?["path"], "/api/v1/fwd/udfs", StringComparison.OrdinalIgnoreCase)) as JObject;

        Assert.IsNotNull(drivers);
        Assert.IsTrue(((string?)drivers!["description"] ?? string.Empty).IndexOf("Heuristic", StringComparison.OrdinalIgnoreCase) >= 0);

        Assert.IsNotNull(tables);
        Assert.IsTrue(((string?)tables!["description"] ?? string.Empty).IndexOf("usage-derived", StringComparison.OrdinalIgnoreCase) >= 0);

        Assert.IsNotNull(functions);
        Assert.IsTrue(((string?)functions!["description"] ?? string.Empty).IndexOf("curated semantics", StringComparison.OrdinalIgnoreCase) >= 0);

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
    public void Dispatch_FwdProcessDetail_WithLowercaseRoute_Returns_CanonicalProcessName()
    {
        var service = new WorkbenchApiService(new ProcessPrivateStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/fwd/processes/ac");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/fwd/processes/ac", request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AC", body["data"]?["Name"]?.Value<string>());
    }

    [TestMethod]
    public void Dispatch_UnknownFwdRoute_DoesNotBuildSnapshot()
    {
        var client = new CountingSnapshotClient();
        var service = new WorkbenchApiService(client, new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/fwd/not-a-route");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/fwd/not-a-route", request);

        Assert.AreEqual(404, result.StatusCode);
        Assert.AreEqual(0, client.InspectCalls);
        dynamic body = result.Body;
        Assert.AreEqual("RouteNotFound", (string)body.Error.Code);
    }

    [TestMethod]
    public void Dispatch_FwdResources_WithDetails_Uses_SnapshotResourceEvidence()
    {
        var client = new CountingSnapshotClient();
        var service = new WorkbenchApiService(client, new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/fwd/resources?includeDetails=true&includePrivate=true");

        var result = service.Dispatch("api/v1/fwd/resources", requestHandle.Request);

        Assert.AreEqual(200, result.StatusCode);
        Assert.AreEqual(1, client.InspectCalls, "Resource detail hydration should use the already-built snapshot, not a second native FWD inspection.");
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        JObject resource = (JObject)((JArray)(body["data"]?["buckets"]?[0]?["names"] ?? new JArray())).First();
        Assert.AreEqual("MemberTable", resource.Value<string>("name"));
        Assert.IsNotNull(resource["details"]?["privateTree"], "Resource details should include the snapshot private tree when includePrivate=true.");
    }

    [TestMethod]
    public void Dispatch_Snapshot_WithSnapshotModeLive_DoesNotSynchronouslyRebuildForEachRequest()
    {
        var client = new CountingSnapshotClient();
        var service = new WorkbenchApiService(client, new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });

        using (var first = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/snapshot?snapshotMode=live&liveMinRefreshSeconds=3600"))
        {
            var result = service.Dispatch("api/v1/snapshot", first.Request);
            Assert.AreEqual(200, result.StatusCode);
        }

        using (var second = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/snapshot?snapshotMode=live&liveMinRefreshSeconds=3600"))
        {
            var result = service.Dispatch("api/v1/snapshot", second.Request);
            Assert.AreEqual(200, result.StatusCode);
        }

        Assert.AreEqual(1, client.InspectCalls, "Live view should reuse the warm in-memory FWD model for click-time reads instead of rebuilding the full FWD snapshot on every request.");
    }

    [TestMethod]
    public void Dispatch_Snapshot_WithSnapshotModeRebuild_ForcesRebuildForEachRequest()
    {
        var client = new CountingSnapshotClient();
        var service = new WorkbenchApiService(client, new WorkbenchApiServerOptions { DefaultFwdPath = "C:\\default.cfd" });

        using (var first = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/snapshot?snapshotMode=rebuild"))
        {
            var result = service.Dispatch("api/v1/snapshot", first.Request);
            Assert.AreEqual(200, result.StatusCode);
        }

        using (var second = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/snapshot?snapshotMode=rebuild"))
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


    [TestMethod]
    public void RouteCatalog_DoesNotExpose_Ambiguous_Rule_Or_RuleList_Routes()
    {
        var duplicatedPaths = ApiV1Routes.All
            .GroupBy(r => r.Method + " " + r.Path, StringComparer.OrdinalIgnoreCase)
            .Where(g => g.Count() > 1)
            .Select(g => g.Key)
            .ToList();

        CollectionAssert.AreEqual(Array.Empty<string>(), duplicatedPaths);
        Assert.IsTrue(ApiV1Routes.All.Any(r => r.Path == "/api/v1/rule-lists/by-key/{key}"));
        Assert.IsTrue(ApiV1Routes.All.Any(r => r.Path == "/api/v1/rule-lists/by-scope/{scopeId}"));
        Assert.IsTrue(ApiV1Routes.All.Any(r => r.Path == "/api/v1/rules/by-key/{key}"));
        Assert.IsTrue(ApiV1Routes.All.Any(r => r.Path == "/api/v1/rules/by-node/{nodeId}"));
        Assert.IsFalse(ApiV1Routes.All.Any(r => r.Path == "/api/v1/rule-lists/{key}"));
        Assert.IsFalse(ApiV1Routes.All.Any(r => r.Path == "/api/v1/rule-lists/{scopeId}"));
        Assert.IsFalse(ApiV1Routes.All.Any(r => r.Path == "/api/v1/rules/{key}"));
        Assert.IsFalse(ApiV1Routes.All.Any(r => r.Path == "/api/v1/rules/{nodeId}"));
    }

    [TestMethod]
    public void Phase6RuleListKey_RoundTrips_SpecialCharacters()
    {
        string key = Phase6RuleListKeys.EncodePage("Dental:ADA / Primary");

        bool ok = Phase6RuleListKeys.TryParse(key, out Phase6RuleListOwner owner, out string? displayName, out string? error);

        Assert.IsTrue(ok, error);
        Assert.AreEqual("page", owner.OwnerType);
        Assert.AreEqual("Dental:ADA / Primary", owner.OwnerDisplayName);
        Assert.AreEqual("Dental:ADA / Primary", displayName);
    }

    [TestMethod]
    public void Phase6RuleKey_Accepts_CanonicalNodeId_RoundTrip()
    {
        string key = Phase6RuleKeys.MakeForStructuralNode("page", "DentalADA", "node-000414");

        bool ok = Phase6RuleKeys.TryParse(key, out Phase6RuleKey parsed, out string? error);

        Assert.IsTrue(ok, error);
        Assert.AreEqual("page", parsed.ScopeType);
        Assert.AreEqual("DentalADA", parsed.ScopeDisplayName);
        Assert.AreEqual(414, parsed.RawNodeId);
        Assert.AreEqual("node-000414", parsed.NodeId);
    }

    [TestMethod]
    public void Dispatch_Phase6RuleListKey_Returns_MinimalRuleListDto()
    {
        var service = new WorkbenchApiService(new RuleGuidStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = @"C:\default.cfd" });
        string key = Phase6RuleListKeys.EncodePage("DentalADA");
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/rule-lists/by-key/" + WebUtility.UrlEncode(key));
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/rule-lists/by-key/" + WebUtility.UrlEncode(key), request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.RuleListDto", body.Value<string>("schema"));
        Assert.AreEqual(key, body["data"]?["key"]?.Value<string>());
        JArray ruleKeys = (JArray)(body["data"]?["ruleKeysInOrder"] ?? new JArray());
        Assert.IsTrue(ruleKeys.Any(k => string.Equals(k.Value<string>(), "rule:page:DentalADA:AC:node:node-000414", StringComparison.OrdinalIgnoreCase)));
        Assert.IsTrue(((JArray)(body["data"]?["rules"] ?? new JArray())).Count >= 3);
    }

    [TestMethod]
    public void Dispatch_Phase6RuleKey_Returns_MinimalRuleDto()
    {
        var service = new WorkbenchApiService(new RuleGuidStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = @"C:\default.cfd" });
        string key = Phase6RuleKeys.MakeForStructuralNode("page", "DentalADA", "node-000414");
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/rules/by-key/" + WebUtility.UrlEncode(key));
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/rules/by-key/" + WebUtility.UrlEncode(key), request);

        Assert.AreEqual(200, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsTrue(body.Value<bool>("ok"));
        Assert.AreEqual("AcWorkbench.RuleDto", body.Value<string>("schema"));
        Assert.AreEqual(key, body["data"]?["key"]?.Value<string>());
        Assert.AreEqual("Fix no splitting", body["data"]?["name"]?.Value<string>());
        Assert.AreEqual("Formatf", body["data"]?["functionName"]?.Value<string>());
        Assert.AreEqual(6, body["data"]?["ordinal"]?.Value<int>());
        Assert.AreEqual(Phase6RuleListKeys.EncodePage("DentalADA"), body["data"]?["parentRuleListKey"]?.Value<string>());
    }

    [TestMethod]
    public void Dispatch_Phase6RuleListKey_Invalid_Returns_StructuredError()
    {
        var service = new WorkbenchApiService(new RuleGuidStubClient(), new WorkbenchApiServerOptions { DefaultFwdPath = @"C:\default.cfd" });
        using var requestHandle = HttpListenerRequestFactory.Create("GET", "http://localhost/api/v1/rule-lists/by-key/ruleList:bad:DentalADA:AC");
        HttpListenerRequest request = requestHandle.Request;

        var result = service.Dispatch("api/v1/rule-lists/by-key/ruleList:bad:DentalADA:AC", request);

        Assert.AreEqual(400, result.StatusCode);
        JObject body = JObject.Parse(JsonConvert.SerializeObject(result.Body));
        Assert.IsFalse(body.Value<bool>("ok"));
        Assert.AreEqual("rule_list_key_invalid", body["error"]?["code"]?.Value<string>());
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
                FunctionName = "Formatf",
                DisabledState = AcDisabledStates.DisabledDirect
            });
            report.Rules[0].Parameters["_ParamList0"] = new List<string> { "SubscriberID_OCR" };
            report.Rules[0].ActionNames.Add("OK");
            report.Rules[0].ActionNames.Add("Failed");
            report.Rules.Add(new AcRuleSummary
            {
                ScopePath = "AC/Pages/DentalADA",
                ScopeType = "Page",
                ScopeName = "DentalADA",
                RuleIndex = 5,
                RuleGuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                RuleName = "Parent decision",
                FunctionName = "CheckPageNum"
            });
            report.Rules[1].ActionNames.Add("OK");
            report.Rules[1].ActionNames.Add("Failed");
            report.Rules.Add(new AcRuleSummary
            {
                ScopePath = "AC/Pages/DentalADA",
                ScopeType = "Page",
                ScopeName = "DentalADA",
                RuleIndex = 5,
                RuleGuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                RuleName = "Parent decision",
                FunctionName = "CheckPageNum"
            });
            report.Rules[2].ActionNames.Add("OK");
            report.Rules[2].ActionNames.Add("Failed");
            return report;
        }

        public AcRelationshipReport TraceAcRelationships(AcTraceOptions options)
        {
            var report = new AcRelationshipReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
            report.Relationships.Add(new AcRuleRelationship
            {
                ScopePath = "AC/Pages/DentalADA",
                ScopeType = "Page",
                ScopeName = "DentalADA",
                RuleIndex = 6,
                RuleGuid = "db5bf065-618b-44ca-8484-0d12384e7d1a",
                RuleName = "Fix no splitting",
                FunctionName = "Formatf",
                Kind = "RejectOption",
                TargetType = "RejectMessage",
                Target = "Subscriber id required",
                ParameterName = "RejectString",
                ParameterRole = "RejectMessage",
                Confidence = "High",
                Evidence = "Test reject message relationship."
            });
            report.Relationships.Add(new AcRuleRelationship
            {
                ScopePath = "AC/Pages/DentalADA",
                ScopeType = "Page",
                ScopeName = "DentalADA",
                RuleIndex = 6,
                RuleGuid = "db5bf065-618b-44ca-8484-0d12384e7d1a",
                RuleName = "Fix no splitting",
                FunctionName = "Formatf",
                Kind = "RejectOption",
                TargetType = "RejectCode",
                Target = "SUBID_REQ",
                ParameterName = "RejectCode",
                ParameterRole = "RejectCode",
                Confidence = "High",
                Evidence = "Test reject code relationship."
            });
            return report;
        }
        public AcIndexReport BuildAcIndex(AcRuleOptions options) => new AcIndexReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcDisabledReport AnalyzeDisabledRules(AcDisabledOptions options) => new AcDisabledReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
        public AcDiagnosticsReport BuildAcDiagnostics(AcRuleOptions options) => new AcDiagnosticsReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };

        public AcTreeReport BuildAcTree(AcTreeOptions options)
        {
            var report = new AcTreeReport { FwdPath = options.Path ?? string.Empty, ProcessName = options.ProcessName ?? "AC" };
            var parent = new AcTreeNode
            {
                NodeId = 413,
                ParentNodeId = -1,
                ActionListIndex = -1,
                HierarchyLevel = 3,
                RuleIndexWithinScope = 5,
                ScopePath = "AC/Pages/DentalADA",
                ScopeType = "Page",
                ScopeName = "DentalADA",
                IsRuleNode = true,
                RuleGuid = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                RuleName = "Parent decision",
                FunctionName = "CheckPageNum"
            };
            parent.ActionNames.Add("OK");
            parent.ActionNames.Add("Failed");
            report.Nodes.Add(parent);

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
                FunctionName = "Formatf",
                DisabledState = AcDisabledStates.DisabledDirect
            });
            report.Nodes[1].Parameters["_ParamList0"] = new List<string> { "SubscriberID_OCR" };
            report.Nodes[1].ActionNames.Add("OK");
            report.Nodes[1].ActionNames.Add("Failed");

            report.Nodes.Add(new AcTreeNode
            {
                NodeId = 415,
                ParentNodeId = 414,
                ActionListIndex = 0,
                HierarchyLevel = 5,
                RuleIndexWithinScope = 7,
                ScopePath = "AC/Pages/DentalADA",
                ScopeType = "Page",
                ScopeName = "DentalADA",
                IsRuleNode = true,
                RuleGuid = "ffffffff-1111-2222-3333-444444444444",
                RuleName = "Child cleanup",
                FunctionName = "DeleteSpaces"
            });
            report.Edges.Add(new AcTreeEdge
            {
                ScopePath = "AC/Pages/DentalADA",
                FromNodeId = 413,
                ToNodeId = 414,
                ActionListIndex = 1,
                ActionName = "Failed",
                ActionNameResolved = true,
                Evidence = "Test parent status result edge."
            });
            report.Edges.Add(new AcTreeEdge
            {
                ScopePath = "AC/Pages/DentalADA",
                FromNodeId = 414,
                ToNodeId = 415,
                ActionListIndex = 0,
                ActionName = "OK",
                ActionNameResolved = true,
                Evidence = "Test selected rule action-list edge."
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
            var report = new FwdInspectionReport { Path = options.Path ?? "C:\\default.cfd" };
            report.Resources.Add(new ResourceBucket
            {
                Type = "Table",
                Names = { "MemberTable" }
            });
            var detail = new ResourceTypeDetail { Type = "Table" };
            var resource = new ResourceDetail
            {
                Type = "Table",
                Name = "MemberTable",
                Category = "SelectionList"
            };
            resource.PrivateTree = new ResourcePrivateNode
            {
                Name = "MemberTable",
                Path = "MemberTable",
                Depth = 0
            };
            detail.Resources.Add(resource);
            report.ResourceTypeDetails.Add(detail);
            return report;
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
            var detail = new ResourceTypeDetail { Type = "Function" };
            var udf = new ResourceDetail
            {
                Type = "Function",
                Name = "CopyIfDestBlank",
                Category = "UserDefined"
            };
            udf.FullAttributes.Add(new ResourceAttrEntry { Key = "FieldListParameters", Value = "Source, Destination", ValueType = "String" });
            udf.FullAttributes.Add(new ResourceAttrEntry { Key = "StatusResults", Value = "Copied, NotCopied", ValueType = "String" });
            udf.PrivateTree = new ResourcePrivateNode
            {
                Name = "CopyIfDestBlank",
                Path = "CopyIfDestBlank",
                Depth = 0,
                IsCollection = true
            };
            udf.PrivateTree.Children.Add(new ResourcePrivateNode
            {
                Name = "FieldListParameters",
                Path = "CopyIfDestBlank/FieldListParameters",
                Depth = 1,
                ValuePreview = "Source, Destination"
            });
            udf.PrivateTree.Children.Add(new ResourcePrivateNode
            {
                Name = "UdfRuleBody",
                Path = "CopyIfDestBlank/UdfRuleBody",
                Depth = 1,
                ValuePreview = "Rule body: if Source has value then copy Source to Destination."
            });
            detail.Resources.Add(udf);
            report.ResourceTypeDetails.Add(detail);
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
            var detail = new ResourceTypeDetail { Type = "Table" };
            var table = new ResourceDetail
            {
                Type = "Table",
                Name = "MemberTable",
                Category = "SelectionList"
            };
            table.FullAttributes.Add(new ResourceAttrEntry { Key = "MatchFields", Value = "MemberId", ValueType = "String" });
            table.FullAttributes.Add(new ResourceAttrEntry { Key = "PlugFields", Value = "MemberName, MemberAddress", ValueType = "String" });
            table.FullAttributes.Add(new ResourceAttrEntry { Key = "Persistence", Value = "PersistSelectionAcrossRuleList", ValueType = "String" });
            table.FullAttributes.Add(new ResourceAttrEntry { Key = "RerunTrigger", Value = "RerunWhenMemberIdChanges", ValueType = "String" });
            table.FullAttributes.Add(new ResourceAttrEntry { Key = "PopupKeyerBehavior", Value = "ShowKeyerPopup", ValueType = "String" });
            table.FullAttributes.Add(new ResourceAttrEntry { Key = "No Good Match", Value = "AllowNoGoodMatch", ValueType = "String" });
            table.FullAttributes.Add(new ResourceAttrEntry { Key = "EnterBehavior", Value = "EnterSelectsHighlightedRow", ValueType = "String" });
            table.FullAttributes.Add(new ResourceAttrEntry { Key = "PlugOutcome", Value = "PlugSelectedRow", ValueType = "String" });
            table.FullAttributes.Add(new ResourceAttrEntry { Key = "RejectOutcome", Value = "RejectNoGoodMatch", ValueType = "String" });
            table.PrivateTree = new ResourcePrivateNode
            {
                Name = "MemberTable",
                Path = "MemberTable",
                Depth = 0,
                IsCollection = true
            };
            table.PrivateTree.Children.Add(new ResourcePrivateNode
            {
                Name = "MatchFieldList",
                Path = "MemberTable/MatchFieldList",
                Depth = 1,
                ValuePreview = "MemberId"
            });
            table.PrivateTree.Children.Add(new ResourcePrivateNode
            {
                Name = "PlugFieldList",
                Path = "MemberTable/PlugFieldList",
                Depth = 1,
                ValuePreview = "MemberName, MemberAddress"
            });
            detail.Resources.Add(table);
            report.ResourceTypeDetails.Add(detail);
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
            report.Pages.Add("DentalADA");
            report.PageVariants.Add(new PageVariantBucket
            {
                Page = "DentalADA",
                Variants = { "FormID_ADA2024" }
            });
            var bucket = new FieldBucket { ScopeType = "Page", ScopeName = "DentalADA" };
            bucket.Fields.Add(new FieldSummary
            {
                Name = "SubscriberID_OCR",
                Type = "Text",
                Geometry = "10,20,120,18",
                SubfieldCount = 0
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
