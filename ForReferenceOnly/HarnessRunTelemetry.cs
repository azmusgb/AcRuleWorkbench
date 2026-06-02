using System;
using System.Collections.Generic;

namespace DllInteropHarness.Core;

public sealed class HarnessRunTelemetry
{
    public DateTime StartedUtc { get; set; } = DateTime.UtcNow;

    public DateTime? EndedUtc { get; set; }

    public string CommandName { get; set; } = string.Empty;

    public string FwdPath { get; set; } = string.Empty;

    public int ExitCode { get; set; }

    public List<HarnessRunEvent> Events { get; } = new();

    public List<HarnessRunArtifact> Artifacts { get; } = new();
}

public sealed class HarnessRunEvent
{
    public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;

    public string Phase { get; set; } = string.Empty;

    public string Kind { get; set; } = "Info";

    public string Category { get; set; } = string.Empty;

    public string Message { get; set; } = string.Empty;
}

public sealed class HarnessRunArtifact
{
    public DateTime TimestampUtc { get; set; } = DateTime.UtcNow;

    public string Name { get; set; } = string.Empty;

    public string Path { get; set; } = string.Empty;

    public int RowCount { get; set; }

    public int ColumnCount { get; set; }
}
