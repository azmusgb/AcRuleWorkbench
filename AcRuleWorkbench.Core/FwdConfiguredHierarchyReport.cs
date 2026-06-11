using System;
using System.Collections.Generic;

namespace AcRuleWorkbench.Core;

/// <summary>
/// Phase 3: configured (editor viewer) FWD hierarchy extraction.
/// Read-only snapshot-friendly representation.
/// </summary>
public sealed class FwdConfiguredHierarchyReport
{
    public string Path { get; set; } = string.Empty;

    // Forward configured lists
    public List<string> BatchNames { get; } = new();
    public List<string> DocumentNames { get; } = new();
    public List<string> PageNames { get; } = new();

    // Mappings
    public Dictionary<string, List<string>> DocsInBatch { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, List<string>> PagesInDoc { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, List<string>> VariantNamesByPage { get; } = new(StringComparer.OrdinalIgnoreCase);

    public Dictionary<string, object> BatchesByKey { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, object> DocumentsByKey { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, object> PagesByKey { get; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, object> PageVariantsByKey { get; } = new(StringComparer.OrdinalIgnoreCase);

    // Fields are extracted where safely available (best-effort)
    public Dictionary<string, List<FieldSummary>> FieldsByPage { get; } = new(StringComparer.OrdinalIgnoreCase);

    // Diagnostics
    public List<FwdConfiguredHierarchyDiagnostic> Diagnostics { get; } = new();
}

// Reuse the existing FieldSummary model from FwdInspectionReport.cs


public sealed class FwdConfiguredHierarchyDiagnostic
{
    public string Code { get; set; } = string.Empty;
    public string Severity { get; set; } = "Warning";
    public string Message { get; set; } = string.Empty;

    // Optional node context
    public string? BatchKey { get; set; }
    public string? DocumentKey { get; set; }
    public string? PageKey { get; set; }
    public string? VariantKey { get; set; }

    // Optional details
    public string? Detail { get; set; }
}

