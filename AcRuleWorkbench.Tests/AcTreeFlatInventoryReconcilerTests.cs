using System.Linq;
using AcRuleWorkbench.Core;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace AcRuleWorkbench.Tests;

[TestClass]
public sealed class AcTreeFlatInventoryReconcilerTests
{
    [TestMethod]
    public void ReconcileFlatInventoryIntoTree_AddsMissingRowsUnderAdditionalRules()
    {
        var tree = new AcTreeReport { FwdPath = "C:\\dev\\fwd.cfd", ProcessName = "AC" };
        tree.Nodes.Add(new AcTreeNode
        {
            NodeId = 1,
            ParentNodeId = -1,
            ActionListIndex = -1,
            ScopePath = "AC/Pages/DentalADA",
            ScopeType = "Page",
            ScopeName = "DentalADA",
            RuleName = "Root rule list"
        });
        tree.Nodes.Add(new AcTreeNode
        {
            NodeId = 2,
            ParentNodeId = 1,
            ActionListIndex = -1,
            HierarchyLevel = 1,
            RuleIndexWithinScope = 1,
            ScopePath = "AC/Pages/DentalADA",
            ScopeType = "Page",
            ScopeName = "DentalADA",
            IsRuleNode = true,
            RuleGuid = "11111111-1111-1111-1111-111111111111",
            RuleName = "Known rule",
            FunctionName = "IsEmpty"
        });

        var rules = new AcRuleReport { FwdPath = tree.FwdPath, ProcessName = tree.ProcessName };
        rules.Rules.Add(new AcRuleSummary
        {
            ScopePath = "AC/Pages/DentalADA",
            ScopeType = "Page",
            ScopeName = "DentalADA",
            RuleIndex = 1,
            RuleGuid = "11111111-1111-1111-1111-111111111111",
            RuleName = "Known rule",
            FunctionName = "IsEmpty"
        });
        rules.Rules.Add(new AcRuleSummary
        {
            ScopePath = "AC/Pages/DentalADA",
            ScopeType = "Page",
            ScopeName = "DentalADA",
            RuleIndex = 4402,
            RuleGuid = "22222222-2222-2222-2222-222222222222",
            RuleName = "Trailing rule recovered from flat inventory",
            FunctionName = "HasRegExpr",
            DisabledState = AcDisabledStates.Enabled,
            DisabledConfidence = "High"
        });

        int added = AcTreeFlatInventoryReconciler.ReconcileFlatInventoryIntoTree(tree, rules);

        Assert.AreEqual(1, added);
        AcTreeNode additionalRoot = tree.Nodes.Single(n => n.RuleName == "Additional Rules" && !n.IsRuleNode);
        AcTreeNode additionalRule = tree.Nodes.Single(n => n.RuleGuid == "22222222-2222-2222-2222-222222222222");
        Assert.AreEqual(additionalRoot.NodeId, additionalRule.ParentNodeId);
        Assert.AreEqual("Additional Rules/004402", additionalRule.RuleListPath);
        Assert.AreEqual("true", additionalRule.Attributes["_AdditionalRule"]);
        Assert.IsTrue(tree.Edges.Any(e => e.ToNodeId == additionalRoot.NodeId && e.EdgeKind == "AdditionalRulesGroup"));
        Assert.IsTrue(tree.Edges.Any(e => e.ToNodeId == additionalRule.NodeId && e.EdgeKind == "AdditionalRule" && e.Confidence == "Inventory"));
        Assert.IsTrue(tree.Diagnostics.Any(d => d.Category == "AdditionalRules" && d.Severity == "Info"));
    }

    [TestMethod]
    public void ReconcileFlatInventoryIntoTree_DoesNotDuplicateMatchedStructuralRules()
    {
        var tree = new AcTreeReport();
        tree.Nodes.Add(new AcTreeNode
        {
            NodeId = 10,
            ParentNodeId = -1,
            ActionListIndex = -1,
            RuleIndexWithinScope = 7,
            ScopePath = "AC/Documents/Dental_Doc",
            ScopeType = "Document",
            ScopeName = "Dental_Doc",
            IsRuleNode = true,
            RuleGuid = "33333333-3333-3333-3333-333333333333",
            RuleName = "Matched rule",
            FunctionName = "Copy"
        });

        var rules = new AcRuleReport();
        rules.Rules.Add(new AcRuleSummary
        {
            ScopePath = "AC/Documents/Dental_Doc",
            ScopeType = "Document",
            ScopeName = "Dental_Doc",
            RuleIndex = 7,
            RuleGuid = "33333333-3333-3333-3333-333333333333",
            RuleName = "Matched rule",
            FunctionName = "Copy"
        });

        int added = AcTreeFlatInventoryReconciler.ReconcileFlatInventoryIntoTree(tree, rules);

        Assert.AreEqual(0, added);
        Assert.AreEqual(1, tree.Nodes.Count(n => n.IsRuleNode));
        Assert.IsFalse(tree.Diagnostics.Any(d => d.Category == "AdditionalRules"));
    }
}
