using System;
using System.IO;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace AcRuleWorkbench.Tests;

[TestClass]
public sealed class ViewerAssetSyncTests
{
    [TestMethod]
    public void ShippedViewer_Matches_Template_And_Contains_KeyUxHooks()
    {
        string repoRoot = FindRepositoryRoot();
        string shippedPath = Path.Combine(repoRoot, "ac-rule-viewer.html");
        string templatePath = Path.Combine(repoRoot, "AcRuleWorkbench.Core", "Viewer", "ac-viewer-template.html");
        string shippedScriptPath = Path.Combine(repoRoot, "ac-rule-viewer.js");
        string templateScriptPath = Path.Combine(repoRoot, "AcRuleWorkbench.Core", "Viewer", "ac-rule-viewer.js");

        Assert.IsTrue(File.Exists(shippedPath), "Missing shipped viewer: " + shippedPath);
        Assert.IsTrue(File.Exists(templatePath), "Missing template viewer: " + templatePath);
        Assert.IsTrue(File.Exists(shippedScriptPath), "Missing shipped viewer script: " + shippedScriptPath);
        Assert.IsTrue(File.Exists(templateScriptPath), "Missing template viewer script: " + templateScriptPath);

        string shipped = File.ReadAllText(shippedPath);
        string template = File.ReadAllText(templatePath);
        string shippedScript = File.ReadAllText(shippedScriptPath);
        string templateScript = File.ReadAllText(templateScriptPath);

        Assert.AreEqual(NormalizeEol(template), NormalizeEol(shipped),
            "The shipped viewer and template diverged. Keep both files synchronized.");
        Assert.AreEqual(NormalizeEol(templateScript), NormalizeEol(shippedScript),
            "The shipped viewer script and template script diverged. Keep both files synchronized.");

        string runtimeViewer = shipped + "\n" + shippedScript;

        // Guard user-visible UX interactions that previously regressed.
        StringAssert.Contains(runtimeViewer, "function closeSearchPopover()", "Search popover close handler is missing.");
        StringAssert.Contains(runtimeViewer, "function handleSearchPopoverKeydown", "Keyboard navigation handler is missing.");
        StringAssert.Contains(runtimeViewer, "typing&&handleSearchPopoverKeydown(e)", "Keyboard navigation handler is not wired.");
        StringAssert.Contains(runtimeViewer, "id=\"recentScopes\"", "Recent scope shortcuts container is missing.");
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

    private static string NormalizeEol(string value)
    {
        return value.Replace("\r\n", "\n");
    }
}
