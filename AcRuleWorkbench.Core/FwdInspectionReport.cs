using System;
using System.Collections.Generic;

namespace AcRuleWorkbench.Core;

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

    public Dictionary<string, List<string>> DocsInBatch { get; } = new(StringComparer.OrdinalIgnoreCase);

    public Dictionary<string, List<string>> PagesInDoc { get; } = new(StringComparer.OrdinalIgnoreCase);

    public List<ResourceBucket> Resources { get; } = new();

    public List<PageVariantBucket> PageVariants { get; } = new();

    public List<FieldBucket> Fields { get; } = new();

    public List<ResourceTypeDetail> ResourceTypeDetails { get; } = new();

    public List<ResourceDependencyEdge> ResourceDependencies { get; } = new();

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

public sealed class ResourceTypeDetail
{
    public string Type { get; set; } = string.Empty;

    public List<ResourceAttrEntry> TypeAttributes { get; } = new();

    public List<ResourceDetail> Resources { get; } = new();
}

public sealed class ResourceDetail
{
    public string Type { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Category { get; set; } = "Unknown";

    public List<ResourceAttrEntry> FullAttributes { get; } = new();

    public List<ResourceAttrEntry> PublicAttributes { get; } = new();

    public ResourcePrivateNode? PrivateTree { get; set; }

    public List<string> Warnings { get; } = new();
}

public sealed class ResourceAttrEntry
{
    public string Key { get; set; } = string.Empty;

    public string Value { get; set; } = string.Empty;

    public string ValueType { get; set; } = string.Empty;
}

public sealed class ResourcePrivateNode
{
    public string Name { get; set; } = string.Empty;

    public string Path { get; set; } = string.Empty;

    public int Depth { get; set; }

    public bool? IsCollection { get; set; }

    public int? Size { get; set; }

    public string? ValuePreview { get; set; }

    public string? DataSha256 { get; set; }

    public int DataLength { get; set; }

    [Newtonsoft.Json.JsonIgnore]
    public byte[]? RawDataBytes { get; set; }

    public bool IsBinaryPayload { get; set; }

    public List<ResourcePrivateNode> Children { get; } = new();

    public List<string> Warnings { get; } = new();
}

public sealed class ResourceDependencyEdge
{
    public string ResourceType { get; set; } = string.Empty;

    public string ResourceName { get; set; } = string.Empty;

    public string ScopePath { get; set; } = string.Empty;

    public int RuleIndex { get; set; }

    public string? RuleGuid { get; set; }

    public string? RuleName { get; set; }

    public string? FunctionName { get; set; }

    public string Kind { get; set; } = string.Empty;
}
