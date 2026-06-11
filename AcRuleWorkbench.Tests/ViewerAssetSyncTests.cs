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
        string inlineTemplateCssPath = Path.Combine(repoRoot, "AcRuleWorkbench.Core", "Viewer", "ac-viewer-template.css");
        string startScriptPath = Path.Combine(repoRoot, "scripts", "start-fw-editor-viewer.ps1");
        string canonicalHtmlPath = Path.Combine(repoRoot, "src", "viewer", "ac-rule-viewer.html");
        string canonicalScriptPath = Path.Combine(repoRoot, "src", "viewer", "ac-rule-viewer.js");
        string canonicalCssPath = Path.Combine(repoRoot, "src", "viewer", "ac-rule-viewer.css");

        Assert.IsTrue(File.Exists(shippedPath), "Missing shipped viewer: " + shippedPath);
        Assert.IsTrue(File.Exists(templatePath), "Missing template viewer: " + templatePath);
        Assert.IsTrue(File.Exists(shippedScriptPath), "Missing shipped viewer script: " + shippedScriptPath);
        Assert.IsTrue(File.Exists(templateScriptPath), "Missing template viewer script: " + templateScriptPath);
        Assert.IsTrue(File.Exists(shippedCssPath), "Missing shipped viewer CSS: " + shippedCssPath);
        Assert.IsTrue(File.Exists(templateCssPath), "Missing template viewer CSS: " + templateCssPath);
        Assert.IsTrue(File.Exists(inlineTemplateCssPath), "Missing inline template viewer CSS: " + inlineTemplateCssPath);
        Assert.IsTrue(File.Exists(startScriptPath), "Missing startup script: " + startScriptPath);
        Assert.IsTrue(File.Exists(canonicalHtmlPath), "Missing canonical viewer HTML: " + canonicalHtmlPath);
        Assert.IsTrue(File.Exists(canonicalScriptPath), "Missing canonical viewer script: " + canonicalScriptPath);
        Assert.IsTrue(File.Exists(canonicalCssPath), "Missing canonical viewer CSS: " + canonicalCssPath);

        string viewerBuildPath = Path.Combine(repoRoot, "viewer-build.txt");
        Assert.IsTrue(File.Exists(viewerBuildPath), "Missing viewer build marker: " + viewerBuildPath);
        string viewerBuild = File.ReadAllText(viewerBuildPath).Trim();
        string versionNumber = viewerBuild;
        if (versionNumber.StartsWith("v", StringComparison.Ordinal))
            versionNumber = versionNumber.Substring(1);
        if (versionNumber.EndsWith("-fw-editor-viewer", StringComparison.Ordinal))
            versionNumber = versionNumber.Substring(0, versionNumber.Length - "-fw-editor-viewer".Length);
        string viewerCacheKey = "fw-editor-viewer-v" + versionNumber;

        string shipped = File.ReadAllText(shippedPath);
        string template = File.ReadAllText(templatePath);
        string shippedScript = File.ReadAllText(shippedScriptPath);
        string templateScript = File.ReadAllText(templateScriptPath);
        string shippedCss = File.ReadAllText(shippedCssPath);
        string templateCss = File.ReadAllText(templateCssPath);
        string inlineTemplateCss = File.ReadAllText(inlineTemplateCssPath);
        string startScript = File.ReadAllText(startScriptPath);
        string canonicalHtml = File.ReadAllText(canonicalHtmlPath);
        string canonicalScript = File.ReadAllText(canonicalScriptPath);
        string canonicalCss = File.ReadAllText(canonicalCssPath);

        Assert.AreEqual(NormalizeEol(canonicalHtml), NormalizeEol(shipped),
            "The shipped viewer diverged from src/viewer/ac-rule-viewer.html.");
        Assert.AreEqual(NormalizeEol(template), NormalizeEol(shipped),
            "The shipped viewer and template diverged. Keep both files synchronized.");
        Assert.AreEqual(NormalizeEol(canonicalScript), NormalizeEol(shippedScript),
            "The shipped viewer script diverged from src/viewer/ac-rule-viewer.js.");
        Assert.AreEqual(NormalizeEol(templateScript), NormalizeEol(shippedScript),
            "The shipped viewer script and template script diverged. Keep both files synchronized.");
        Assert.AreEqual(NormalizeEol(canonicalCss), NormalizeEol(shippedCss),
            "The shipped viewer CSS diverged from src/viewer/ac-rule-viewer.css.");
        Assert.AreEqual(NormalizeEol(templateCss), NormalizeEol(shippedCss),
            "The shipped viewer CSS and template CSS diverged. Keep both files synchronized.");
        Assert.AreEqual(NormalizeEol(inlineTemplateCss), NormalizeEol(shippedCss),
            "The inline template CSS and shipped viewer CSS diverged. Keep all viewer styles synchronized.");

        AssertContains(shipped, "data-ui-build=\"" + viewerBuild + "\"", "Viewer HTML must advertise the current FormWorks Editor Viewer build.");
        AssertContains(shipped, viewerCacheKey, "Viewer HTML asset cache key must track viewer-build.txt.");
        AssertContains(shipped, "FormWorks Editor Viewer", "Viewer shell must present the canonical product name.");
        AssertContains(shippedScript, "const viewerStateBuild='" + viewerBuild + "'", "Persisted viewer state key must track the current viewer build.");
        AssertContains(startScript, "Get-WbViewerBuildMarker", "Startup stale-viewer detection must read the build marker from viewer-build.txt.");
        AssertContains(startScript, "data-ui-build=", "Startup stale-viewer detection must inspect the viewer build marker.");
        Assert.IsFalse(System.Text.RegularExpressions.Regex.IsMatch(startScript, "data-ui-build=\\\"v\\d+-fw-editor-viewer\\\""), "Startup script should not hardcode release-specific build markers.");
        AssertContains(shippedScript, "function fweditorRulePropertiesHtml", "Selected Rule property sheet is missing.");
        AssertContains(shippedScript, "function buildFwdEditorIndex", "Configured FWD hierarchy index is missing.");
        AssertContains(shippedScript, "function renderEditorObject", "FWD object detail rendering is missing.");
        AssertContains(shippedScript, "data-rule-property-tab", "Rule property tab wiring is missing.");
        AssertContains(shippedCss, ".fweditor-rulelist-layout", "Rule List/property layout CSS is missing.");
        AssertContains(shippedCss, "html:not([data-theme])", "Viewer CSS must default to light mode without requiring persisted theme state.");

        string runtimeViewer = shipped + "\n" + shippedScript;
        AssertContains(runtimeViewer, "function closeSearchPopover()", "Search popover close handler is missing.");
        AssertContains(runtimeViewer, "function handleSearchPopoverKeydown", "Keyboard navigation handler is missing.");
        AssertContains(runtimeViewer, "typing&&handleSearchPopoverKeydown(e)", "Keyboard navigation handler is not wired.");
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

    private static string NormalizeEol(string value) => value.Replace("\r\n", "\n");

    private static void AssertContains(string value, string expectedSubstring, string message)
    {
        Assert.IsTrue(value.Contains(expectedSubstring), message + " Missing substring: " + expectedSubstring);
    }
}
