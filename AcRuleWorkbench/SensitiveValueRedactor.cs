using System;
using System.IO;

namespace AcRuleWorkbench;

internal static class SensitiveValueRedactor
{
    public const string Redacted = "[redacted]";

    public static string? Path(string? path, bool expose)
    {
        if (string.IsNullOrWhiteSpace(path))
            return path;
        if (expose)
            return path;

        string fileName;
        try { fileName = System.IO.Path.GetFileName(path!.Trim()); }
        catch { fileName = string.Empty; }

        return string.IsNullOrWhiteSpace(fileName) ? Redacted : Redacted + System.IO.Path.DirectorySeparatorChar + fileName;
    }

    public static string? MachineName(bool expose)
    {
        return expose ? Environment.MachineName : Redacted;
    }

    public static object? ExceptionSummary(Exception? exception, bool expose)
    {
        if (exception == null)
            return null;

        return expose
            ? new { type = exception.GetType().Name, message = exception.Message }
            : new { type = Redacted, message = "Operational details are redacted. Restart with --enable-debug-api only for local diagnostic use." };
    }

    public static string? ExceptionMessage(Exception? exception, bool expose)
    {
        if (exception == null)
            return null;

        return expose
            ? exception.Message
            : "Operational details are redacted. Restart with --enable-debug-api only for local diagnostic use.";
    }

    public static string? ExceptionType(Exception? exception, bool expose)
    {
        if (exception == null)
            return null;

        return expose ? exception.GetType().Name : Redacted;
    }
}
