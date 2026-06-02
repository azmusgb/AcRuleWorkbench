using System.Collections.Generic;

namespace DllInteropHarness.Core;

public sealed class OcrInspectionReport
{
    public string Path { get; set; } = string.Empty;

    public string? FileType { get; set; }

    public List<string> FieldNames { get; } = new();

    public List<string> Warnings { get; } = new();
}
