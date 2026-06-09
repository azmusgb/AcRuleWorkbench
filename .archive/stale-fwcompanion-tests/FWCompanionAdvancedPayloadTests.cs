using System;
using System.IO;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace AcRuleWorkbench.Tests;

[TestClass]
public sealed class FWCompanionAdvancedPayloadTests
{
    [TestMethod]
    public void NormalFwdSidecar_Does_Not_Ship_Advanced_ObjectGraph_Or_RuntimeImpact()
    {
        string root = FindRepositoryRoot();
        string fwd = File.ReadAllText(Path.Combine(root, "ac-rule-viewer.fwd.json"));
        Assert.IsFalse(fwd.IndexOf("\"objectGraph\"", StringComparison.OrdinalIgnoreCase) >= 0, "Normal FWD sidecar must not include Object Graph payload.");
        Assert.IsFalse(fwd.IndexOf("\"runtimeImpact\"", StringComparison.OrdinalIgnoreCase) >= 0, "Normal FWD sidecar must not include Runtime Impact payload.");
        Assert.IsTrue(File.Exists(Path.Combine(root, "ac-rule-viewer.advanced.object-graph.json")), "Object Graph payload must be split to an advanced sidecar.");
        Assert.IsTrue(File.Exists(Path.Combine(root, "ac-rule-viewer.advanced.runtime-impact.json")), "Runtime Impact payload must be split to an advanced sidecar.");
    }

    [TestMethod]
    public void Viewer_Loads_Advanced_Sidecars_Only_In_Advanced_Mode()
    {
        string root = FindRepositoryRoot();
        string js = File.ReadAllText(Path.Combine(root, "ac-rule-viewer.js"));
        StringAssert.Contains(js, "loadAdvancedStaticFwdSidecars", "Viewer must isolate optional advanced payload loading.");
        StringAssert.Contains(js, "if(!isAdvancedMode()||advancedSidecarState.loaded)return;", "Advanced sidecars must not be loaded in normal mode.");
        StringAssert.Contains(js, "ac-rule-viewer.advanced.object-graph.json", "Viewer must know the Object Graph advanced sidecar name.");
        StringAssert.Contains(js, "ac-rule-viewer.advanced.runtime-impact.json", "Viewer must know the Runtime Impact advanced sidecar name.");
    }

    [TestMethod]
    public void Udf_Internal_Rule_List_Parser_Path_Is_Code_Backed_Not_Only_Text_Backed()
    {
        string root = FindRepositoryRoot();
        string source = File.ReadAllText(Path.Combine(root, "AcRuleWorkbench.Core", "FormWorksExtractionClient.cs"));
        StringAssert.Contains(source, "TryParseUdfInternalRuleRowsFromPrivateTree", "UDF internal Rule List extraction must attempt a packed-rule parser path.");
        StringAssert.Contains(source, "ResourcePrivateTreePackedRuleList", "Decoded UDF rows must identify packed private-tree Rule List authority.");
        StringAssert.Contains(source, "RawDataBytes", "Private resource bytes must remain available to the exporter without serializing raw bytes into sidecars.");
    }

    [TestMethod]
    public void Structural_Parser_Has_Resync_And_Rollback_For_Trailing_Payloads()
    {
        string root = FindRepositoryRoot();
        string source = File.ReadAllText(Path.Combine(root, "AcRuleWorkbench.Core", "AcStructuralTreeParser.cs"));
        StringAssert.Contains(source, "TrySeekNextLikelyRootPayload", "Structural parser must be able to resynchronize after trailing non-root bytes.");
        StringAssert.Contains(source, "RollBackPartialRoot", "Failed partial parse attempts must not leak half-created nodes into the tree.");
        StringAssert.Contains(source, "StructuralResync", "Resync events must be visible in Reader Status diagnostics.");
        StringAssert.Contains(source, "StructuralInitialResync", "Initial header/prefix recovery must be visible in Reader Status diagnostics.");
    }

    private static string FindRepositoryRoot()
    {
        var dir = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);
        while (dir != null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "AcRuleWorkbench.sln")))
                return dir.FullName;
            dir = dir.Parent;
        }
        throw new DirectoryNotFoundException("Could not locate repository root containing AcRuleWorkbench.sln.");
    }
}
