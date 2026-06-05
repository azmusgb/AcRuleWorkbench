using AcRuleWorkbench.Core;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace AcRuleWorkbench.Tests;

[TestClass]
public sealed class EvidenceConfidenceModelTests
{
    [TestMethod]
    public void Udf_Binding_From_Named_Interface_Is_Medium_Inference_Not_Authoritative()
    {
        EvidenceConfidence confidence = EvidenceConfidenceModel.ForUdfCallerBinding(
            hasNamedResourceInterface: true,
            callerSlotIsGeneric: true);

        Assert.AreEqual(EvidenceConfidence.Medium, confidence);
        Assert.AreEqual("Medium", EvidenceConfidenceModel.ToApiValue(confidence));
        Assert.AreEqual("ResourceInterfaceOrdinal+CallerParameter", EvidenceConfidenceModel.SourceForUdfCallerBinding(true));
    }

    [TestMethod]
    public void Udf_Binding_From_Generic_Caller_Only_Is_Low_Confidence()
    {
        EvidenceConfidence confidence = EvidenceConfidenceModel.ForUdfCallerBinding(
            hasNamedResourceInterface: false,
            callerSlotIsGeneric: true);

        Assert.AreEqual(EvidenceConfidence.Low, confidence);
        Assert.AreEqual("CallerParameter", EvidenceConfidenceModel.SourceForUdfCallerBinding(false));
    }

    [TestMethod]
    public void Static_Resource_Schema_Confidence_Separates_Parsed_And_Inferred_Evidence()
    {
        Assert.AreEqual(EvidenceConfidence.High, EvidenceConfidenceModel.ForStaticResourceSchema(schemaParsed: true, hasPrivateTreeEvidence: false, usageDerivedOnly: false));
        Assert.AreEqual(EvidenceConfidence.Medium, EvidenceConfidenceModel.ForStaticResourceSchema(schemaParsed: true, hasPrivateTreeEvidence: false, usageDerivedOnly: true));
        Assert.AreEqual(EvidenceConfidence.Medium, EvidenceConfidenceModel.ForStaticResourceSchema(schemaParsed: false, hasPrivateTreeEvidence: true, usageDerivedOnly: false));
        Assert.AreEqual(EvidenceConfidence.Low, EvidenceConfidenceModel.ForStaticResourceSchema(schemaParsed: false, hasPrivateTreeEvidence: false, usageDerivedOnly: false));
    }
}
