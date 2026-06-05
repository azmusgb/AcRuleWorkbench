using System;

namespace AcRuleWorkbench.Core;

public enum EvidenceConfidence
{
    Low = 0,
    Medium = 1,
    High = 2,
    Authoritative = 3
}

public static class EvidenceConfidenceModel
{
    public static string ToApiValue(EvidenceConfidence confidence)
    {
        switch (confidence)
        {
            case EvidenceConfidence.Low:
                return "Low";
            case EvidenceConfidence.Medium:
                return "Medium";
            case EvidenceConfidence.High:
                return "High";
            case EvidenceConfidence.Authoritative:
                return "Authoritative";
            default:
                return "Low";
        }
    }

    public static EvidenceConfidence ForUdfCallerBinding(bool hasNamedResourceInterface, bool callerSlotIsGeneric)
    {
        if (hasNamedResourceInterface)
            return EvidenceConfidence.Medium;

        return callerSlotIsGeneric ? EvidenceConfidence.Low : EvidenceConfidence.Medium;
    }

    public static EvidenceConfidence ForStaticResourceSchema(bool schemaParsed, bool hasPrivateTreeEvidence, bool usageDerivedOnly)
    {
        if (schemaParsed && !usageDerivedOnly)
            return EvidenceConfidence.High;

        if (schemaParsed)
            return EvidenceConfidence.Medium;

        return hasPrivateTreeEvidence ? EvidenceConfidence.Medium : EvidenceConfidence.Low;
    }

    public static string SourceForUdfCallerBinding(bool hasNamedResourceInterface)
    {
        return hasNamedResourceInterface ? "ResourceInterfaceOrdinal+CallerParameter" : "CallerParameter";
    }

    public static string SourceForExportProfile(EvidenceExportProfile profile)
    {
        return EvidenceExportProfileSettings.ToCommandName(profile);
    }
}
