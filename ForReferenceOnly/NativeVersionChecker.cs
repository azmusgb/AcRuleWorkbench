using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;

namespace DllInteropHarness.Core;

public static class NativeVersionChecker
{
    private static readonly CheckerSpec[] Checkers =
    {
        new("rribase_net", "rribase.CheckRRIbase", "rribase.dll"),
        new("rrifwd_net", "rri.fwd.CheckRRIfwd", "rrifwd.dll"),
        new("rridc_net", "rri.dc.CheckRRIdc", "rridc.dll"),
        new("rriwf2_net", "FormWorks.Legacy.rriwf2.CheckWf2Version", "rriwf2.dll")
    };

    public static IReadOnlyList<NativeVersionCheckResult> RunOfficialChecks()
    {
        var results = new List<NativeVersionCheckResult>();

        foreach (CheckerSpec spec in Checkers)
        {
            var result = new NativeVersionCheckResult
            {
                ManagedAssemblyName = spec.ManagedAssemblyName,
                CheckerTypeName = spec.CheckerTypeName,
                NativeDllName = spec.NativeDllName
            };

            try
            {
                Assembly assembly = LoadAssembly(spec.ManagedAssemblyName);
                Type? checkerType = assembly.GetType(spec.CheckerTypeName, throwOnError: false, ignoreCase: false);

                if (checkerType == null)
                {
                    result.Messages.Add($"Checker type not found: {spec.CheckerTypeName}");
                    result.Passed = false;
                    results.Add(result);
                    continue;
                }

                object? checker = Activator.CreateInstance(checkerType);
                result.CheckerInstantiated = checker != null;

                if (checker == null)
                {
                    result.Messages.Add("Checker could not be instantiated.");
                    result.Passed = false;
                    results.Add(result);
                    continue;
                }

                PropertyInfo? dllNameProperty = checkerType.GetProperty("DllName");
                if (dllNameProperty?.GetValue(checker) is string dllName && !string.IsNullOrWhiteSpace(dllName))
                    result.NativeDllName = dllName;

                MethodInfo? method = checkerType.GetMethod("CheckExplicitDependencies", BindingFlags.Public | BindingFlags.Instance);
                if (method == null)
                {
                    result.Messages.Add("CheckExplicitDependencies() not found.");
                    result.Passed = false;
                    results.Add(result);
                    continue;
                }

                object? messagesObject = method.Invoke(checker, Array.Empty<object>());
                var messages = ConvertToStringList(messagesObject);

                foreach (string message in messages)
                    result.Messages.Add(message);

                result.Passed = result.Messages.Count == 0;
            }
            catch (TargetInvocationException ex)
            {
                Exception inner = ex.InnerException ?? ex;
                result.Messages.Add($"{inner.GetType().Name}: {inner.Message}");
                result.Passed = false;
            }
            catch (Exception ex)
            {
                result.Messages.Add($"{ex.GetType().Name}: {ex.Message}");
                result.Passed = false;
            }

            results.Add(result);
        }

        return results;
    }

    private static Assembly LoadAssembly(string simpleName)
    {
        Assembly? loaded = AppDomain.CurrentDomain
            .GetAssemblies()
            .FirstOrDefault(a => string.Equals(a.GetName().Name, simpleName, StringComparison.OrdinalIgnoreCase));

        return loaded ?? Assembly.Load(simpleName);
    }

    private static IEnumerable<string> ConvertToStringList(object? messagesObject)
    {
        if (messagesObject == null)
            yield break;

        if (messagesObject is IEnumerable enumerable)
        {
            foreach (object? item in enumerable)
            {
                if (item != null)
                    yield return item.ToString() ?? string.Empty;
            }
        }
    }

    private sealed class CheckerSpec
    {
        public CheckerSpec(string managedAssemblyName, string checkerTypeName, string nativeDllName)
        {
            ManagedAssemblyName = managedAssemblyName ?? throw new ArgumentNullException(nameof(managedAssemblyName));
            CheckerTypeName = checkerTypeName ?? throw new ArgumentNullException(nameof(checkerTypeName));
            NativeDllName = nativeDllName ?? throw new ArgumentNullException(nameof(nativeDllName));
        }

        public string ManagedAssemblyName { get; }

        public string CheckerTypeName { get; }

        public string NativeDllName { get; }
    }
}
