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
        string shippedCssPath = Path.Combine(repoRoot, "ac-rule-viewer.css");
        string templateCssPath = Path.Combine(repoRoot, "AcRuleWorkbench.Core", "Viewer", "ac-rule-viewer.css");

        Assert.IsTrue(File.Exists(shippedPath), "Missing shipped viewer: " + shippedPath);
        Assert.IsTrue(File.Exists(templatePath), "Missing template viewer: " + templatePath);
        Assert.IsTrue(File.Exists(shippedScriptPath), "Missing shipped viewer script: " + shippedScriptPath);
        Assert.IsTrue(File.Exists(templateScriptPath), "Missing template viewer script: " + templateScriptPath);
        Assert.IsTrue(File.Exists(shippedCssPath), "Missing shipped viewer CSS: " + shippedCssPath);
        Assert.IsTrue(File.Exists(templateCssPath), "Missing template viewer CSS: " + templateCssPath);

        string shipped = File.ReadAllText(shippedPath);
        string template = File.ReadAllText(templatePath);
        string shippedScript = File.ReadAllText(shippedScriptPath);
        string templateScript = File.ReadAllText(templateScriptPath);
        string shippedCss = File.ReadAllText(shippedCssPath);
        string templateCss = File.ReadAllText(templateCssPath);

        Assert.AreEqual(NormalizeEol(template), NormalizeEol(shipped),
            "The shipped viewer and template diverged. Keep both files synchronized.");
        Assert.AreEqual(NormalizeEol(templateScript), NormalizeEol(shippedScript),
            "The shipped viewer script and template script diverged. Keep both files synchronized.");
        Assert.AreEqual(NormalizeEol(templateCss), NormalizeEol(shippedCss),
            "The shipped viewer CSS and template CSS diverged. Keep both files synchronized.");
        StringAssert.Contains(shippedCss, "Theme authority layer", "Viewer CSS must contain the final authoritative theme layer.");
        StringAssert.Contains(shippedCss, "html:not([data-theme])", "Viewer CSS must default to light mode without requiring persisted theme state.");

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
