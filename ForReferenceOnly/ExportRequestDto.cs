using System.Collections.Generic;

namespace DllInteropHarness.Api.V1.Contracts;

internal sealed class ExportRequestDto
{
    public string Format { get; set; } = "json";
    public string View { get; set; } = "snapshot";
    public string? ScopeId { get; set; }
    public string? NodeId { get; set; }
    public bool IncludeEvidence { get; set; } = true;
    public Dictionary<string, string> Filters { get; set; } = new Dictionary<string, string>();
    public List<string> Columns { get; set; } = new List<string>();
}
