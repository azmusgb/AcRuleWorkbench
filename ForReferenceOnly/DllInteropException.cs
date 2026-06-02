using System;
using System.IO;

namespace DllInteropHarness.Core;

public sealed class DllInteropException : Exception
{
    public DllInteropException(string message)
        : base(message)
    {
    }

    public DllInteropException(string message, Exception innerException)
        : base(message, innerException)
    {
    }

    public static DllInteropException From(string message, Exception ex)
    {
        string detail = ex switch
        {
            DllNotFoundException => message + " Native DLL was not found. Place the required native DLL next to the executable or on PATH.",
            BadImageFormatException => message + " Bitness mismatch detected. Check x86/x64 alignment between process and native DLLs.",
            FileNotFoundException => message + " Managed or native dependency was not found.",
            FileLoadException => message + " Dependency was found but could not be loaded.",
            _ => message
        };

        return new DllInteropException(detail, ex);
    }
}
