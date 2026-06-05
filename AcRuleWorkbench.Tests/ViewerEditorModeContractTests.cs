using System;
using System.IO;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace AcRuleWorkbench.Tests;

[TestClass]
public sealed class ViewerEditorModeContractTests
{
    [TestMethod]
    public void Viewer_Uses_Structural_Editor_Mode_For_Global_Definition_Views()
    {
        string repoRoot = FindRepositoryRoot();
        string jsPath = Path.Combine(repoRoot, "ac-rule-viewer.js");
        string cssPath = Path.Combine(repoRoot, "ac-rule-viewer.css");

        Assert.IsTrue(File.Exists(jsPath), "Missing shipped viewer script: " + jsPath);
        Assert.IsTrue(File.Exists(cssPath), "Missing shipped viewer stylesheet: " + cssPath);

        string js = File.ReadAllText(jsPath);
        string css = File.ReadAllText(cssPath);

        StringAssert.Contains(js, "function isEditorMode", "Global/configuration views must use an explicit Editor Mode predicate.");
        StringAssert.Contains(js, "setEditorModeClasses", "Editor Mode must be applied by JS, not inferred only by CSS.");
        StringAssert.Contains(js, "if(isEditorMode()||!model){el.innerHTML='';return;}", "Outer navigation must not render inside Editor Mode.");
        StringAssert.Contains(js, "if(isEditorMode()){host.innerHTML='';host.hidden=true;return;}", "Outer diagnostics dock must not render inside Editor Mode.");
        StringAssert.Contains(js, "data-editor-kind", "Global object selection must use the consolidated editor selection contract.");
        StringAssert.Contains(js, "data-editor-key", "Global object selection must use the consolidated editor selection contract.");
        StringAssert.Contains(js, "data-udf-tab", "UDF configuration page tabs must be real wired tabs, not static buttons.");
        StringAssert.Contains(js, "toggle-editor-message", "Editor Message Window must support compact/expanded behavior.");
        StringAssert.Contains(js, "endpointStages", "FWD API hydration should be staged rather than one broad blocking request set.");

        StringAssert.Contains(css, "v15 authoritative Editor Mode layer", "Viewer CSS must include the authoritative Editor Mode layer.");
        StringAssert.Contains(css, "body.editor-mode .topbar", "Editor Mode must hide the outer workbench topbar.");
        StringAssert.Contains(css, "grid-template-columns:0 0 minmax(0,1fr) 0 0", "Editor Mode must collapse duplicate outer panes and leave only the editor surface.");
        StringAssert.Contains(css, "body.editor-mode .fweditor-tree-tools .udf-filter-strip-polished", "UDF filters must remain visible in the Editor-style FWD Tree.");
        StringAssert.Contains(css, "body.editor-mode .fweditor-message-table tr:nth-child(n+4)", "Message Window must be compact by default.");
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
