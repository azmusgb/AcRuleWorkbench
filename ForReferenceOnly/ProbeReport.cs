using System.Collections.Generic;

namespace DllInteropHarness.Core;

public sealed class ProbeReport
{
    public bool Is64BitProcess { get; set; }

    public string BaseDirectory { get; set; } = string.Empty;

    public string CurrentDirectory { get; set; } = string.Empty;

    public string? PathEnvironmentVariable { get; set; }

    public List<AssemblyProbeResult> Assemblies { get; } = new();

    public List<NativeVersionCheckResult> NativeVersionChecks { get; } = new();

    public List<NativeDependencyProbeResult> NativeDependencies { get; } = new();

    public List<string> RequiredNativeDllNames { get; } = new();

    public List<string> Notes { get; } = new();

    public bool NativeChecksPassed
    {
        get
        {
            if (NativeVersionChecks.Count == 0)
                return false;

            foreach (var check in NativeVersionChecks)
            {
                if (!check.Passed)
                    return false;
            }

            return true;
        }
    }
}

public sealed class AssemblyProbeResult
{
    public string Name { get; set; } = string.Empty;

    public string? Version { get; set; }

    public string? Location { get; set; }

    public bool Loaded { get; set; }

    public string? Error { get; set; }
}

public sealed class NativeVersionCheckResult
{
    public string ManagedAssemblyName { get; set; } = string.Empty;

    public string CheckerTypeName { get; set; } = string.Empty;

    public string NativeDllName { get; set; } = string.Empty;

    public bool CheckerInstantiated { get; set; }

    public bool Passed { get; set; }

    public List<string> Messages { get; } = new();
}

public sealed class NativeDependencyProbeResult
{
    public string Name { get; set; } = string.Empty;

    public bool FoundNextToExe { get; set; }

    public bool FoundInCurrentDirectory { get; set; }

    public string? ExeDirectoryCandidate { get; set; }

    public string? CurrentDirectoryCandidate { get; set; }
}
