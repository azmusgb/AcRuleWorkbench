using AcRuleWorkbench.Core;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace AcRuleWorkbench.Tests;

[TestClass]
public sealed class EvidenceExportProfileTests
{
    [TestMethod]
    public void ViewerSafe_Profile_Does_Not_Traverse_Private_Resource_Trees()
    {
        EvidenceExportProfileSettings settings = EvidenceExportProfileSettings.Resolve(EvidenceExportProfile.ViewerSafe);

        Assert.IsFalse(settings.IncludeResourceConfigs);
        Assert.IsFalse(settings.IncludeResourcePrivateTrees);
        Assert.AreEqual(0, settings.MaxPrivateTreeDepth);
        Assert.AreEqual(0, settings.MaxPrivateTreeNodes);
        Assert.AreEqual("viewer-safe", settings.CommandName);
    }

    [TestMethod]
    public void Diagnostic_Profile_Includes_Config_But_Not_Private_Trees()
    {
        EvidenceExportProfileSettings settings = EvidenceExportProfileSettings.Resolve(EvidenceExportProfile.Diagnostic);

        Assert.IsTrue(settings.IncludeResourceConfigs);
        Assert.IsFalse(settings.IncludeResourcePrivateTrees);
        Assert.AreEqual(0, settings.MaxPrivateTreeDepth);
        Assert.AreEqual(0, settings.MaxPrivateTreeNodes);
        Assert.AreEqual("diagnostic", settings.CommandName);
    }

    [TestMethod]
    public void FullEvidence_Profile_Requires_Explicit_Private_Tree_Traversal()
    {
        EvidenceExportProfile profile = EvidenceExportProfileSettings.Parse("full-evidence");
        EvidenceExportProfileSettings settings = EvidenceExportProfileSettings.Resolve(profile);

        Assert.IsTrue(settings.IncludeResourceConfigs);
        Assert.IsTrue(settings.IncludeResourcePrivateTrees);
        Assert.IsTrue(settings.MaxPrivateTreeDepth > 0);
        Assert.IsTrue(settings.MaxPrivateTreeNodes > 0);
        Assert.AreEqual("full-evidence", settings.CommandName);
    }

    [TestMethod]
    public void Parser_Rejects_Unknown_Profile()
    {
        Assert.ThrowsException<System.ArgumentException>(() => EvidenceExportProfileSettings.Parse("everything"));
    }
}
