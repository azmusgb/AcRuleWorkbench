using System;
using System.IO;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace AcRuleWorkbench.Tests;

[TestClass]
public sealed class ViewerEditorModeContractTests
{
    [TestMethod]
    public void Viewer_DefaultRoute_Uses_FwEditorShell()
    {
        string repoRoot = FindRepositoryRoot();
        string jsPath = Path.Combine(repoRoot, "ac-rule-viewer.js");
        string cssPath = Path.Combine(repoRoot, "ac-rule-viewer.css");
        string htmlPath = Path.Combine(repoRoot, "ac-rule-viewer.html");

        Assert.IsTrue(File.Exists(jsPath), "Missing shipped viewer script: " + jsPath);
        Assert.IsTrue(File.Exists(cssPath), "Missing shipped viewer stylesheet: " + cssPath);
        Assert.IsTrue(File.Exists(htmlPath), "Missing shipped viewer HTML: " + htmlPath);

        string js = File.ReadAllText(jsPath);
        string css = File.ReadAllText(cssPath);
        string html = File.ReadAllText(htmlPath);
        string all = string.Join("\n", html, css, js);
        string viewerBuild = ReadViewerBuild(repoRoot);

        AssertContains(html, "fw-editor-viewer-shell", "The viewer HTML must advertise the FW Editor Viewer shell class.");
        AssertContains(html, $"data-ui-build=\"{viewerBuild}\"", "The shipped viewer must advertise the current FW Editor Viewer build.");
        AssertContains(js, $"const viewerStateBuild='{viewerBuild}'", "Persisted viewer state must use the current FW Editor Viewer build key.");
        AssertContains(js, "function isEditorMode", "Default mode must route through the read-only FW Editor shell.");
        AssertContains(js, "return !appShellRequested()", "FW Editor mode must be default unless the developer app shell is explicitly requested.");
        AssertContains(js, "return isAdvancedMode()&&explicitDeveloperShell", "The older app shell must be gated behind advanced developer mode.");
        AssertContains(js, "function fweditorRulePropertiesHtml", "Rule Properties view must exist.");
        AssertContains(js, "Fields / Parameters", "FW Editor property tabs must include Fields / Parameters.");
        AssertContains(js, "Status Results", "FW Editor property tabs must include Status Results.");
        AssertContains(js, "Action List / Sub-list", "FW Editor terminology must use Action List / Sub-list.");
        AssertContains(css, ".fweditor-rulelist-layout", "The stylesheet must include FW Editor Rule List/property layout.");
        AssertContains(css, ".fweditor-property-tabs", "The stylesheet must include rule property tab styling.");
        AssertContains(css, "html:not([data-theme])", "The viewer must default to light mode without requiring persisted theme state.");

        Assert.IsFalse(all.IndexOf("FW Companion", StringComparison.OrdinalIgnoreCase) >= 0, "Default viewer assets must not expose FW Companion branding.");
        Assert.IsFalse(all.IndexOf("AC Rule Workbench", StringComparison.OrdinalIgnoreCase) >= 0, "Default viewer assets must not expose old workbench branding.");
        Assert.IsFalse(all.IndexOf("FWUtility Workbench", StringComparison.OrdinalIgnoreCase) >= 0, "Default viewer assets must not expose old workbench branding.");
        Assert.IsFalse(all.IndexOf("usage candidate", StringComparison.OrdinalIgnoreCase) >= 0, "Default viewer assets must avoid usage-candidate wording.");
    }

    private static string ReadViewerBuild(string repoRoot)
    {
        string buildPath = Path.Combine(repoRoot, "viewer-build.txt");
        Assert.IsTrue(File.Exists(buildPath), "Missing viewer build marker: " + buildPath);
        string viewerBuild = File.ReadAllText(buildPath).Trim();
        Assert.IsTrue(viewerBuild.EndsWith("-fw-editor-viewer", StringComparison.Ordinal), "Unexpected viewer build marker: " + viewerBuild);
        return viewerBuild;
    }

    private static void AssertContains(string actual, string expected, string message)
    {
        Assert.IsTrue(actual.IndexOf(expected, StringComparison.Ordinal) >= 0, message + " Expected to find: " + expected);
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
