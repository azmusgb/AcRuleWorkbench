using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;

namespace DllInteropHarness.Core;

public static class NativeDependencyScanner
{
    private static readonly string[] ManagedAssemblyNames =
    {
        "rribase_net",
        "rrifwd_net",
        "rridc_net",
        "rriwf2_net"
    };

    public static IReadOnlyList<string> GetNativeDllImports()
    {
        var names = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (Assembly assembly in LoadKnownAssemblies())
        {
            foreach (Type type in SafeGetTypes(assembly))
            {
                const BindingFlags flags =
                    BindingFlags.Public |
                    BindingFlags.NonPublic |
                    BindingFlags.Static |
                    BindingFlags.Instance |
                    BindingFlags.DeclaredOnly;

                foreach (MethodInfo method in type.GetMethods(flags))
                {
                    var attr = method
                        .GetCustomAttributes(typeof(DllImportAttribute), inherit: false)
                        .OfType<DllImportAttribute>()
                        .FirstOrDefault();

                    string? dllName = attr?.Value;
                    if (!string.IsNullOrWhiteSpace(dllName))
                        names.Add(NormalizeDllFileName(dllName));
                }
            }
        }

        return names.ToList();
    }

    public static IReadOnlyList<NativeDependencyProbeResult> ProbeNativeDependencies(string baseDirectory)
    {
        string cwd = Environment.CurrentDirectory;

        return GetNativeDllImports()
            .Select(name =>
            {
                string exeCandidate = Path.Combine(baseDirectory, name);
                string cwdCandidate = Path.Combine(cwd, name);

                return new NativeDependencyProbeResult
                {
                    Name = name,
                    ExeDirectoryCandidate = exeCandidate,
                    CurrentDirectoryCandidate = cwdCandidate,
                    FoundNextToExe = File.Exists(exeCandidate),
                    FoundInCurrentDirectory = File.Exists(cwdCandidate)
                };
            })
            .ToList();
    }

    private static IEnumerable<Assembly> LoadKnownAssemblies()
    {
        foreach (string name in ManagedAssemblyNames)
        {
            Assembly? loaded = AppDomain.CurrentDomain
                .GetAssemblies()
                .FirstOrDefault(a => string.Equals(a.GetName().Name, name, StringComparison.OrdinalIgnoreCase));

            if (loaded != null)
            {
                yield return loaded;
                continue;
            }

            yield return Assembly.Load(name);
        }
    }

    private static IEnumerable<Type> SafeGetTypes(Assembly assembly)
    {
        try
        {
            return assembly.GetTypes();
        }
        catch (ReflectionTypeLoadException ex)
        {
            return ex.Types.Where(t => t != null).Cast<Type>();
        }
    }

    private static string NormalizeDllFileName(string name)
    {
        string trimmed = name.Trim();

        return trimmed.EndsWith(".dll", StringComparison.OrdinalIgnoreCase)
            ? trimmed
            : trimmed + ".dll";
    }
}
