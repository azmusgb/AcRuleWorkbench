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

        StringAssert.Contains(script, "source-package", "Script should produce a source package.");
        StringAssert.Contains(script, "runtime-package", "Script should produce a runtime package.");
        StringAssert.Contains(script, "evidence-package", "Script should produce an evidence package.");

        StringAssert.Contains(script, "(^|/)\\.git(/|$)", "Source package exclusions should include .git.");
        StringAssert.Contains(script, "(^|/)\\.vs(/|$)", "Source package exclusions should include .vs.");
        StringAssert.Contains(script, "(^|/)bin(/|$)", "Source package exclusions should include bin.");
        StringAssert.Contains(script, "(^|/)obj(/|$)", "Source package exclusions should include obj.");
        StringAssert.Contains(script, "(^|/)TestResults(/|$)", "Source package exclusions should include TestResults.");
        StringAssert.Contains(script, "(^|/)fwd\\.cfd$", "Source package exclusions should include fwd.cfd.");
        StringAssert.Contains(script, "ac-rule-viewer\\..*\\.json", "Source package exclusions should include generated viewer sidecars.");
        StringAssert.Contains(script, "runtime-path\\.generated\\.ps1", "Source package exclusions should include runtime-path.generated.ps1.");
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
