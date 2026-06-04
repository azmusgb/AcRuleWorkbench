using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Newtonsoft.Json.Linq;

namespace AcRuleWorkbench.Tests;

[TestClass]
public sealed class ViewerExportTests
{
    [TestMethod]
    public void ExportAcViewer_Writes_SidecarJsonFiles()
    {
        string repoRoot = FindRepositoryRoot();
        string exe = Path.Combine(repoRoot, "AcRuleWorkbench", "bin", "Debug", "net48", "win-x86", "AcRuleWorkbench.exe");
        Assert.IsTrue(File.Exists(exe), "AcRuleWorkbench executable not found: " + exe);

        string outDir = Path.Combine(Path.GetTempPath(), "AcRuleWorkbenchViewerExportTests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(outDir);
        string outHtml = Path.Combine(outDir, "ac-rule-viewer-test.html");

        var psi = new ProcessStartInfo(exe, $"ac-viewer --path fwd.cfd --out {QuoteArg(outHtml)}")
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            WorkingDirectory = repoRoot
        };
        string runtimePath = Path.Combine(repoRoot, "rri_bin");
        if (Directory.Exists(runtimePath))
            psi.EnvironmentVariables["PATH"] = runtimePath + Path.PathSeparator + psi.EnvironmentVariables["PATH"];

        using var p = Process.Start(psi)!;
        Assert.IsNotNull(p, "Could not start AcRuleWorkbench process");
        string stdout = p.StandardOutput.ReadToEnd();
        string stderr = p.StandardError.ReadToEnd();
        Assert.IsTrue(p.WaitForExit(90000), "AcRuleWorkbench export timed out. StdErr: " + stderr + " StdOut: " + stdout);
        Assert.AreEqual(0, p.ExitCode, "AcRuleWorkbench exited with error. StdErr: " + stderr + " StdOut: " + stdout);

        string rules = Path.Combine(outDir, "ac-rule-viewer.rules.json");
        string rel = Path.Combine(outDir, "ac-rule-viewer.rel.json");
        string tree = Path.Combine(outDir, "ac-rule-viewer.tree.json");

        Assert.IsTrue(File.Exists(outHtml), "Output HTML was not created.");
        Assert.IsTrue(File.Exists(rules), "Missing rules sidecar: " + rules);
        Assert.IsTrue(File.Exists(rel), "Missing rel sidecar: " + rel);
        Assert.IsTrue(File.Exists(tree), "Missing tree sidecar: " + tree);

        // Basic sanity: files should not be empty and should start with JSON punctuation.
        Assert.IsTrue(new FileInfo(rules).Length > 10, "rules JSON appears empty");
        Assert.IsTrue(new FileInfo(rel).Length > 10, "rel JSON appears empty");
        Assert.IsTrue(new FileInfo(tree).Length > 10, "tree JSON appears empty");

        string html = File.ReadAllText(outHtml);
        StringAssert.Contains(html, "window.AC_RULE_VIEWER_PAYLOADS", "Generated viewer HTML should embed payloads for file-open scenarios.");
        Assert.IsFalse(html.Contains("__RULES_JSON__"), "Generated viewer HTML still contains rules placeholder text.");

        JObject treePayload = JObject.Parse(File.ReadAllText(tree));
        Assert.IsFalse(string.IsNullOrWhiteSpace(treePayload.Value<string>("SnapshotId")), "tree sidecar is missing SnapshotId.");
        Assert.IsNotNull(treePayload["GeneratedAtUtc"], "tree sidecar is missing GeneratedAtUtc.");

        bool hasExtractedAttributes = (treePayload["Nodes"] as JArray)?
            .OfType<JObject>()
            .Any(n => (n["Attributes"] as JObject)?.Properties().Any() == true) == true;
        Assert.IsTrue(hasExtractedAttributes, "tree sidecar should include masked structural attributes for inspector evidence.");
    }

    private static string QuoteArg(string s)
    {
        if (s.Contains(" ")) return '"' + s + '"';
        return s;
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
