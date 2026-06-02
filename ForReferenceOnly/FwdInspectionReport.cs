using System.Collections.Generic;

namespace DllInteropHarness.Core;

public sealed class FwdInspectionReport
{
    public string Path { get; set; } = string.Empty;

    public string? ReleaseString { get; set; }

    public string? ReleaseDateString { get; set; }

    public int? ReleaseNumber { get; set; }

    public List<string> Documents { get; } = new();

    public List<string> Pages { get; } = new();

    public List<string> Batches { get; } = new();

    public List<string> Processes { get; } = new();

    public List<ResourceBucket> Resources { get; } = new();

    public List<PageVariantBucket> PageVariants { get; } = new();

    public List<FieldBucket> Fields { get; } = new();

    public List<string> Warnings { get; } = new();
}

public sealed class ResourceBucket
{
    public string Type { get; set; } = string.Empty;

    public List<string> Names { get; } = new();
}

public sealed class PageVariantBucket
{
    public string Page { get; set; } = string.Empty;

    public List<string> Variants { get; } = new();
}

public sealed class FieldBucket
{
    public string ScopeType { get; set; } = string.Empty;

    public string ScopeName { get; set; } = string.Empty;

    public List<FieldSummary> Fields { get; } = new();
}

public sealed class FieldSummary
{
    public string Name { get; set; } = string.Empty;

    public string? Type { get; set; }

    public string? Geometry { get; set; }

    public int SubfieldCount { get; set; }
}
