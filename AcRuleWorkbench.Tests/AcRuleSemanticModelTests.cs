using System.Linq;
using AcRuleWorkbench.Core;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace AcRuleWorkbench.Tests;

[TestClass]
public sealed class AcRuleSemanticModelTests
{
    [TestMethod]
    public void DisabledReport_RebuildCounts_TreatsSequenceFallbackAsPossibleOnly()
    {
        var report = new AcDisabledReport();
        report.Rules.Add(new AcRuleSummary { DisabledState = AcDisabledStates.DisabledDirect, ScopePath = "Pages/DentalADA.Standard", ScopeType = "Page", ScopeName = "DentalADA.Standard" });
        report.Rules.Add(new AcRuleSummary { DisabledState = AcDisabledStates.DisabledInherited, ScopePath = "Pages/DentalADA.Standard", ScopeType = "Page", ScopeName = "DentalADA.Standard" });
        report.Rules.Add(new AcRuleSummary { DisabledState = AcDisabledStates.PossibleDisabledSequenceOnly, ScopePath = "Pages/DentalADA.Standard", ScopeType = "Page", ScopeName = "DentalADA.Standard" });
        report.Rules.Add(new AcRuleSummary { DisabledState = AcDisabledStates.Enabled, ScopePath = "Pages/DentalADA.Standard", ScopeType = "Page", ScopeName = "DentalADA.Standard" });

        report.RebuildCounts();

        Assert.AreEqual(1, report.DirectDisabledCount);
        Assert.AreEqual(1, report.InheritedDisabledCount);
        Assert.AreEqual(2, report.PossiblyInheritedDisabledCount);
        Assert.AreEqual(1, report.EnabledCount);
        Assert.AreEqual(AcDisabledStates.PossibleDisabledSequenceOnly, report.RulesByDisabledState.Single(r => r.Name == AcDisabledStates.PossibleDisabledSequenceOnly).Name);
    }

    [TestMethod]
    public void FunctionCatalog_ClassifiesHighValueFunctionParametersBeforeGenericHeuristics()
    {
        AcFunctionCatalog.Classification? copyInput = AcFunctionCatalog.TryClassify("Copy", "_ParamList0");
        AcFunctionCatalog.Classification? copyOutput = AcFunctionCatalog.TryClassify("Copy", "_ParamList1");
        AcFunctionCatalog.Classification? docAttr = AcFunctionCatalog.TryClassify("_ISetDocAttrConst", "AttrName");
        AcFunctionCatalog.Classification? regex = AcFunctionCatalog.TryClassify("HasRegExpr", "RegularExpression");

        Assert.IsNotNull(copyInput);
        Assert.AreEqual("Field", copyInput!.TargetType);
        Assert.AreEqual("UsesField", copyInput.RelationshipKind);
        Assert.AreEqual("InputField", copyInput.ParameterRole);

        Assert.IsNotNull(copyOutput);
        Assert.AreEqual("WritesField", copyOutput!.RelationshipKind);
        Assert.AreEqual("OutputField", copyOutput.ParameterRole);

        Assert.IsNotNull(docAttr);
        Assert.AreEqual("Attribute", docAttr!.TargetType);
        Assert.AreEqual("WritesAttribute", docAttr.RelationshipKind);

        Assert.IsNotNull(regex);
        Assert.AreEqual("Option", regex!.TargetType);
        Assert.AreEqual("Regex", regex.ParameterRole);
    }

    [TestMethod]
    public void FunctionCatalog_DefinesObservedEditorParitySeedFunctions()
    {
        string[] expected =
        {
            "_IIterateDynamicTableUDF",
            "_IIterateOnlyLinesUDF",
            "_IKFI",
            "_IMatchDocAttrConst",
            "CheckAmount",
            "CheckCharSet",
            "CheckLineCount",
            "CheckPageNum",
            "CheckRejects",
            "CompareAmountFields",
            "DeleteRegExpr",
            "DoMathAndFormat",
            "FilterChars",
            "GetFieldAttr",
            "GetToken"
        };

        var names = AcFunctionCatalog.GetDefinitions().Select(d => d.Name).ToList();
        foreach (string name in expected)
            Assert.IsTrue(names.Contains(name), "Missing catalog definition for " + name);

        Assert.IsTrue(AcFunctionCatalog.TryGetDefinition("CheckRejects", out AcFunctionCatalog.FunctionDefinition rejects));
        Assert.IsTrue(rejects.BehaviorFlags.Contains("ReadsRejectState"));
        Assert.IsTrue(rejects.RuntimeImpacts.Any(i => i.IndexOf("repair", System.StringComparison.OrdinalIgnoreCase) >= 0));

        Assert.IsTrue(AcFunctionCatalog.TryGetDefinition("_IIterateDynamicTableUDF", out AcFunctionCatalog.FunctionDefinition dynamicTableUdf));
        Assert.IsTrue(dynamicTableUdf.BehaviorFlags.Contains("CallsUdf"));
        Assert.IsTrue(dynamicTableUdf.BehaviorFlags.Contains("IteratesTableRows"));
    }
}
