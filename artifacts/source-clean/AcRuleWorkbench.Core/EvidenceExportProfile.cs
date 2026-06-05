using System;

namespace AcRuleWorkbench.Core;

public enum EvidenceExportProfile
{
    ViewerSafe,
    Diagnostic,
    FullEvidence
}

public sealed class EvidenceExportProfileSettings
{
    public EvidenceExportProfileSettings(
        EvidenceExportProfile profile,
        bool includeResourceConfigs,
        bool includeResourcePrivateTrees,
        int maxPrivateTreeDepth,
        int maxPrivateTreeNodes,
        bool writeFwdSidecar,
        string description)
    {
        Profile = profile;
        IncludeResourceConfigs = includeResourceConfigs;
        IncludeResourcePrivateTrees = includeResourcePrivateTrees;
        MaxPrivateTreeDepth = Math.Max(0, maxPrivateTreeDepth);
        MaxPrivateTreeNodes = Math.Max(0, maxPrivateTreeNodes);
        WriteFwdSidecar = writeFwdSidecar;
        Description = description ?? string.Empty;
    }

    public EvidenceExportProfile Profile { get; }

    public bool IncludeResourceConfigs { get; }

    public bool IncludeResourcePrivateTrees { get; }

    public int MaxPrivateTreeDepth { get; }

    public int MaxPrivateTreeNodes { get; }

    public bool WriteFwdSidecar { get; }

    public string Description { get; }

    public string CommandName => ToCommandName(Profile);

    public static EvidenceExportProfileSettings Resolve(EvidenceExportProfile profile)
    {
        switch (profile)
        {
            case EvidenceExportProfile.ViewerSafe:
                return new EvidenceExportProfileSettings(
                    profile,
                    includeResourceConfigs: false,
                    includeResourcePrivateTrees: false,
                    maxPrivateTreeDepth: 0,
                    maxPrivateTreeNodes: 0,
                    writeFwdSidecar: true,
                    description: "Viewer-safe export: resource names, structural rules, relationships, and masked field evidence; no private resource tree traversal.");

            case EvidenceExportProfile.Diagnostic:
                return new EvidenceExportProfileSettings(
                    profile,
                    includeResourceConfigs: true,
                    includeResourcePrivateTrees: false,
                    maxPrivateTreeDepth: 0,
                    maxPrivateTreeNodes: 0,
                    writeFwdSidecar: true,
                    description: "Diagnostic export: includes resource configuration attributes but does not traverse private resource trees.");

            case EvidenceExportProfile.FullEvidence:
                return new EvidenceExportProfileSettings(
                    profile,
                    includeResourceConfigs: true,
                    includeResourcePrivateTrees: true,
                    maxPrivateTreeDepth: 8,
                    maxPrivateTreeNodes: 5000,
                    writeFwdSidecar: true,
                    description: "Full evidence export: includes resource configuration attributes and bounded private resource tree traversal. Use only for local deep analysis.");

            default:
                throw new ArgumentOutOfRangeException(nameof(profile), profile, "Unsupported evidence export profile.");
        }
    }

    public static EvidenceExportProfile Parse(string? value)
    {
        string normalized = NormalizeProfileName(value);
        switch (normalized)
        {
            case "":
            case "viewer-safe":
            case "viewersafe":
            case "safe":
                return EvidenceExportProfile.ViewerSafe;

            case "diagnostic":
            case "diagnostics":
            case "diag":
                return EvidenceExportProfile.Diagnostic;

            case "full-evidence":
            case "fullevidence":
            case "full":
            case "deep":
                return EvidenceExportProfile.FullEvidence;

            default:
                throw new ArgumentException(
                    "Unsupported evidence export profile '" + value + "'. Use viewer-safe, diagnostic, or full-evidence.",
                    nameof(value));
        }
    }

    public static string ToCommandName(EvidenceExportProfile profile)
    {
        switch (profile)
        {
            case EvidenceExportProfile.ViewerSafe:
                return "viewer-safe";
            case EvidenceExportProfile.Diagnostic:
                return "diagnostic";
            case EvidenceExportProfile.FullEvidence:
                return "full-evidence";
            default:
                return profile.ToString();
        }
    }

    private static string NormalizeProfileName(string? value)
    {
        return (value ?? string.Empty).Trim().Replace("_", "-").ToLowerInvariant();
    }
}
