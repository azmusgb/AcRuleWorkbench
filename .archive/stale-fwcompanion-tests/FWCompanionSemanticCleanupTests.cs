using System;
using System.IO;
using System.Text.RegularExpressions;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace AcRuleWorkbench.Tests;

[TestClass]
public sealed class FWCompanionSemanticCleanupTests
{
    [TestMethod]
    public void UdfSidecar_Reports_Interface_Body_And_RuleList_Availability_Counts()
    {
        string repoRoot = FindRepositoryRoot();
        string fwd = File.ReadAllText(Path.Combine(repoRoot, "ac-rule-viewer.fwd.json"));

        StringAssert.Contains(fwd, "\"definitionParsedCount\": 0", "The UDF packet must report the parsed definition count explicitly.");
        StringAssert.Contains(fwd, "\"bodyParsedCount\": 0", "The UDF packet must report the parsed body count explicitly.");
        StringAssert.Contains(fwd, "\"ruleListAvailableCount\": 0", "The UDF packet must report the decoded internal Rule List count explicitly.");
        StringAssert.Contains(fwd, "\"availabilityState\": \"RuleListUnavailable\"", "Each UDF row must expose whether the internal Rule List is available.");
        StringAssert.Contains(fwd, "\"availabilityMessage\"", "Each UDF row must carry a plain unavailable-state message for the FW Companion UI.");
    }

    [TestMethod]
    public void Viewer_UdfView_Uses_RuleList_Parity_And_Unavailable_State()
    {
        string repoRoot = FindRepositoryRoot();
        string js = File.ReadAllText(Path.Combine(repoRoot, "ac-rule-viewer.js"));

        StringAssert.Contains(js, "function udfEditorInternalRuleTreeHtml", "UDFs must render through a dedicated Rule List projection function.");
        StringAssert.Contains(js, "Internal Rule List unavailable", "The UDF Rule List tab must say plainly when the internal Rule List is unavailable.");
        StringAssert.Contains(js, "udfAvailabilityMessage", "The UDF unavailable state must be centralized so list, panel, and Message Window stay consistent.");
        StringAssert.Contains(js, "rule lists available", "The UDF FWD Tree count strip must summarize internal Rule List availability.");
        StringAssert.Contains(js, "udfEditorCallerRulesHtml", "UDF caller bindings must remain first-class and openable from the UDF view.");
    }

    [TestMethod]
    public void Advanced_ObjectGraph_And_RuntimeImpact_Are_QueryString_Gated()
    {
        string repoRoot = FindRepositoryRoot();
        string js = File.ReadAllText(Path.Combine(repoRoot, "ac-rule-viewer.js"));

        StringAssert.Contains(js, "function isAdvancedMode", "Advanced surfaces must be gated by a single query-string predicate.");
        StringAssert.Contains(js, "advancedWorkspaceViews", "Advanced workspace registration must be isolated from normal product workspaces.");
        StringAssert.Contains(js, "if(!isAdvancedMode())return;", "Advanced renderers must return before rendering in normal mode.");
        StringAssert.Contains(js, "if(!isAdvancedMode())return []", "Advanced data builders must return no rows in normal mode.");
        StringAssert.Contains(js, "if(isAdvancedMode()){\n      addGlobalDefinitionSearchRows(rows,q,'ObjectGraph'", "Global search must not include Object Graph rows unless advanced mode is enabled.");
        StringAssert.Contains(js, "if(isAdvancedMode()){\n    try{buildObjectGraphDefinitions", "Definition lookup must not route to Object Graph unless advanced mode is enabled.");
    }

    [TestMethod]
    public void RelationshipSidecar_Uses_Coherent_RuleCount_Without_Empty_Rules_Array()
    {
        string repoRoot = FindRepositoryRoot();
        string rel = File.ReadAllText(Path.Combine(repoRoot, "ac-rule-viewer.rel.json"));

        Match match = Regex.Match(rel, "\\\"RuleCount\\\"\\s*:\\s*(\\d+)");
        Assert.IsTrue(match.Success, "Relationship sidecar must expose RuleCount.");
        Assert.IsTrue(int.Parse(match.Groups[1].Value) > 0, "Relationship RuleCount must represent distinct related rules, not zero.");
        Assert.IsFalse(rel.IndexOf("\"Rules\": []", StringComparison.OrdinalIgnoreCase) >= 0, "Relationship sidecar must not serialize an empty Rules array.");
        StringAssert.Contains(rel, "\"RelationshipCount\": 28708", "RelationshipCount must still match the exported relationship row count.");
    }

    [TestMethod]
    public void Tables_And_SelectionLists_Are_Separated_By_Authority()
    {
        string repoRoot = FindRepositoryRoot();
        string fwd = File.ReadAllText(Path.Combine(repoRoot, "ac-rule-viewer.fwd.json"));
        string js = File.ReadAllText(Path.Combine(repoRoot, "ac-rule-viewer.js"));

        StringAssert.Contains(fwd, "\"authority\": \"TableResource\"", "Table rows must identify table authority explicitly.");
        StringAssert.Contains(fwd, "\"authority\": \"ParsedOrRuleUsageCandidateSeparated\"", "SelectionList packet must separate parsed schemas from rule-usage candidates.");
        StringAssert.Contains(fwd, "Rule-usage candidates are not parsed schemas", "SelectionList authority note must avoid implying usage-derived schemas.");
        StringAssert.Contains(js, "This is not a parsed schema unless the Schema field says Parsed", "The SelectionList UI must not imply usage candidates are parsed schemas.");
    }


    [TestMethod]
    public void NativeResourceProbeList_Uses_Only_FwdResourceType_Tokens()
    {
        string repoRoot = FindRepositoryRoot();
        string options = File.ReadAllText(Path.Combine(repoRoot, "AcRuleWorkbench.Core", "FwdInspectionOptions.cs"));

        Assert.IsFalse(options.Contains("\"User Defined\""), "Human label 'User Defined' must not be passed to FWD_ResourceListGet.");
        Assert.IsFalse(options.Contains("\"User Defined Function\""), "Human label 'User Defined Function' must not be passed to FWD_ResourceListGet.");
        Assert.IsFalse(options.Contains("\"User Defined Functions\""), "Human label 'User Defined Functions' must not be passed to FWD_ResourceListGet.");
        Assert.IsFalse(options.Contains("\"Selection List\""), "Human label 'Selection List' must not be passed to FWD_ResourceListGet.");
        Assert.IsFalse(options.Contains("\"Selection Lists\""), "Human label 'Selection Lists' must not be passed to FWD_ResourceListGet.");

        StringAssert.Contains(options, "\"Function\"", "Function resources are the authoritative native source for UDF/resource-function definitions in this FWD.");
        StringAssert.Contains(options, "\"Table\"", "Table resources must remain in the native probe list.");
        StringAssert.Contains(options, "\"DateFormat\"", "DateFormat resources must remain in the native probe list.");
        StringAssert.Contains(options, "\"ACRuleList\"", "ACRuleList resources must remain in the native probe list.");
    }

    [TestMethod]
    public void Internal_Docs_Are_Separated_From_Operator_Admin_Docs()
    {
        string repoRoot = FindRepositoryRoot();
        string docs = Path.Combine(repoRoot, "docs");

        Assert.IsTrue(File.Exists(Path.Combine(docs, "internal", "README.md")), "Internal engineering docs need their own index.");
        Assert.IsTrue(File.Exists(Path.Combine(docs, "internal", "reader-authority-model.md")), "Reader authority model belongs under docs/internal.");
        Assert.IsTrue(File.Exists(Path.Combine(docs, "internal", "reader-status-model.md")), "Reader status/evidence model belongs under docs/internal.");
        Assert.IsFalse(File.Exists(Path.Combine(docs, "evidence-model.md")), "Evidence/debug model should not remain in top-level operator docs.");
        Assert.IsFalse(File.Exists(Path.Combine(docs, "rule-logic-authority-model.md")), "Authority internals should not remain in top-level operator docs.");

        string operatorGuide = File.ReadAllText(Path.Combine(docs, "operator-guide.md"));
        string adminGuide = File.ReadAllText(Path.Combine(docs, "admin-guide.md"));
        Assert.IsFalse(operatorGuide.IndexOf("Object Graph", StringComparison.OrdinalIgnoreCase) >= 0, "Operator guide should not expose advanced Object Graph wording.");
        Assert.IsFalse(operatorGuide.IndexOf("Runtime Impact", StringComparison.OrdinalIgnoreCase) >= 0, "Operator guide should not expose advanced Runtime Impact wording.");
        Assert.IsFalse(adminGuide.IndexOf("forensic", StringComparison.OrdinalIgnoreCase) >= 0, "Admin guide should not use forensic product framing.");
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
