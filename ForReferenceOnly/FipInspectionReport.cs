using System.Collections.Generic;

namespace DllInteropHarness.Core;

public sealed class FipInspectionReport
{
    public string FwdPath { get; set; } = string.Empty;

    public string ProcessName { get; set; } = "FIP";

    public int VariantCountInspected { get; set; }

    public bool Truncated { get; set; }

    public List<FipVariantReport> Variants { get; } = new();

    public List<string> Warnings { get; } = new();
}

public sealed class FipVariantReport
{
    public string Page { get; set; } = string.Empty;

    public string Variant { get; set; } = string.Empty;

    public int DropoutRegionCount { get; set; }

    public int OmrFieldCount { get; set; }

    public List<FipDropoutRegionSummary> DropoutRegions { get; } = new();

    public List<FipOmrFieldSummary> OmrFields { get; } = new();

    public List<string> Warnings { get; } = new();
}

public sealed class FipDropoutRegionSummary
{
    public string Geometry { get; set; } = string.Empty;

    public string Flags { get; set; } = string.Empty;
}

public sealed class FipOmrFieldSummary
{
    public string Name { get; set; } = string.Empty;

    public string Geometry { get; set; } = string.Empty;

    public uint FieldType { get; set; }

    public uint CheckType { get; set; }

    public uint AvgCount { get; set; }

    public uint Flags { get; set; }

    public bool UseAura { get; set; }

    public bool CheckThick { get; set; }

    public bool LetterOval { get; set; }

    public int SubfieldCount { get; set; }

    public List<FipOmrSubfieldSummary> Subfields { get; } = new();
}

public sealed class FipOmrSubfieldSummary
{
    public string Name { get; set; } = string.Empty;

    public string Geometry { get; set; } = string.Empty;

    public uint CheckLevel { get; set; }

    public uint WidthHorz { get; set; }

    public uint WidthVert { get; set; }

    public uint AuraHorz { get; set; }

    public uint AuraVert { get; set; }

    public uint Baseline { get; set; }
}
