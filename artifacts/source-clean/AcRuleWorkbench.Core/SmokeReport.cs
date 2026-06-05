using System.Collections.Generic;

namespace AcRuleWorkbench.Core;

public sealed class SmokeReport
{
    public bool Success { get; set; }

    public ProbeReport? Probe { get; set; }

    public FwdInspectionReport? Fwd { get; set; }

    public OcrInspectionReport? Ocr { get; set; }

    public List<string> Failures { get; } = new();

    public List<string> Warnings { get; } = new();
}
