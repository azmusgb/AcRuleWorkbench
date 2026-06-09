using System;
using System.IO;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace AcRuleWorkbench.Tests;

[TestClass]
public sealed class FWCompanionProductContractTests
{
    [TestMethod]
    public void ViewerShell_Uses_FWCompanion_ProductLanguage()
    {
        string repoRoot = FindRepositoryRoot();
        string html = File.ReadAllText(Path.Combine(repoRoot, "ac-rule-viewer.html"));
        string js = File.ReadAllText(Path.Combine(repoRoot, "ac-rule-viewer.js"));
        string readme = File.ReadAllText(Path.Combine(repoRoot, "README.md"));

        StringAssert.Contains(html, "FW Companion", "The shipped viewer must present as FW Companion.");
        StringAssert.Contains(html, "data-ui-build=\"v71-2026-fw-companion-refresh\"", "The viewer build marker must match the FW Companion cache key.");
        StringAssert.Contains(js, "v71-fw-companion-2026-refresh", "Viewer persisted state must use the FW Companion build key.");
        StringAssert.Contains(readme, "Reader Status", "Product documentation must explain Reader Status as a secondary interpretation aid.");
        StringAssert.Contains(readme, "Additional Rules", "Product documentation must explain Additional Rules without parser-heavy language.");

        Assert.IsFalse(html.IndexOf("fonts.googleapis.com", StringComparison.OrdinalIgnoreCase) >= 0, "Viewer HTML must not depend on external Google Fonts.");
        Assert.IsFalse(html.IndexOf("FormWorks Editor Viewer", StringComparison.OrdinalIgnoreCase) >= 0, "Old viewer product name should not be visible.");
        Assert.IsFalse(readme.IndexOf("AC Rule Workbench", StringComparison.OrdinalIgnoreCase) >= 0, "README should use the FW Companion product name.");
    }

    [TestMethod]
    public void ShippedTreeSidecar_Contains_AdditionalRules_For_UnplacedRules()
    {
        string repoRoot = FindRepositoryRoot();
        string tree = File.ReadAllText(Path.Combine(repoRoot, "ac-rule-viewer.tree.json"));

        StringAssert.Contains(tree, "\"AdditionalRuleCount\": 1365", "Shipped sidecar should be reconciled so available rules are not hidden.");
        StringAssert.Contains(tree, "\"RuleNodeCount\": 5924", "Shipped sidecar rule count should match the flat AC rule inventory count.");
        StringAssert.Contains(tree, "Additional Rules", "Unplaced rules should be surfaced under Additional Rules.");
        StringAssert.Contains(tree, "Reader status: partial", "Partial sections should use Reader Status wording, not parser/debug wording.");
        Assert.IsFalse(tree.IndexOf("diagnostic evidence", StringComparison.OrdinalIgnoreCase) >= 0, "Reader messages should not expose forensic/debug wording in the shipped sidecar.");
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
