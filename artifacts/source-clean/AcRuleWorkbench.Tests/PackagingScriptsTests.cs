using System;
using System.IO;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace AcRuleWorkbench.Tests;

[TestClass]
public sealed class PackagingScriptsTests
{
    [TestMethod]
    public void SplitDeliverablesScript_Exists_And_Contains_RequiredPackages_And_Exclusions()
    {
        string repoRoot = FindRepositoryRoot();
        string scriptPath = Path.Combine(repoRoot, "scripts", "package-split-deliverables.ps1");

        Assert.IsTrue(File.Exists(scriptPath), "Missing split deliverables script: " + scriptPath);

        string script = File.ReadAllText(scriptPath);

        StringAssert.Contains(script, "source-clean", "Script should produce a clean source package.");
        StringAssert.Contains(script, "runtime-local", "Script should produce a local runtime package.");
        StringAssert.Contains(script, "evidence-sample", "Script should produce an evidence sample package.");
        StringAssert.Contains(script, "diagnostics-bundle", "Script should produce a diagnostics bundle package.");

        StringAssert.Contains(script, "(^|/)\\.git(/|$)", "Source package exclusions should include .git.");
        StringAssert.Contains(script, "(^|/)\\.vs(/|$)", "Source package exclusions should include .vs.");
        StringAssert.Contains(script, "(^|/)bin(/|$)", "Source package exclusions should include bin.");
        StringAssert.Contains(script, "(^|/)obj(/|$)", "Source package exclusions should include obj.");
        StringAssert.Contains(script, "(^|/)TestResults(/|$)", "Source package exclusions should include TestResults.");
        StringAssert.Contains(script, "(^|/)fwd\\.cfd$", "Source package exclusions should include fwd.cfd.");
        StringAssert.Contains(script, "ac-rule-viewer\\..*\\.json", "Source package exclusions should include generated viewer sidecars.");
        StringAssert.Contains(script, "runtime-path\\.generated\\.ps1", "Source package exclusions should include runtime-path.generated.ps1.");
        StringAssert.Contains(script, "(^|/)lib(/|$)", "Source package exclusions should include native lib payloads.");
        StringAssert.Contains(script, "(^|/)rri_bin(/|$)", "Source package exclusions should include installed runtime DLL payloads.");
        StringAssert.Contains(script, "(^|/)attached_assets(/|$)", "Source package exclusions should include prompt/import scratch assets.");
        StringAssert.Contains(script, "docs/.*\\.(pdf|extracted\\.txt)", "Source package exclusions should include confidential extracted reference files. ");
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
