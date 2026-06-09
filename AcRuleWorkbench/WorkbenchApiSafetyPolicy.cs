using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace AcRuleWorkbench;

internal static class WorkbenchApiSafetyPolicy
{
    public static IReadOnlyList<string> Validate(WorkbenchApiServerOptions options)
    {
        if (options == null) throw new ArgumentNullException(nameof(options));

        var errors = new List<string>();
        string prefix = string.IsNullOrWhiteSpace(options.Prefix) ? "http://127.0.0.1:8787/" : options.Prefix.Trim();

        if (!TryGetHost(prefix, out string? host, out string? parseError))
        {
            errors.Add(parseError ?? "API prefix is invalid.");
            return errors;
        }

        bool loopbackOnly = IsLoopbackHost(host!);
        if (!loopbackOnly && !options.AllowRemoteBindings)
        {
            errors.Add("Refusing to bind API listener outside loopback. Use --allow-remote-bind only behind trusted network controls.");
        }

        if (!loopbackOnly && options.AllowRemoteBindings && HasUnsafeRemoteControls(options) && !options.AllowUnsafeRemoteControls)
        {
            errors.Add("Non-loopback API binding cannot enable CORS, debug API, refresh, or request-level ?path= overrides unless --allow-unsafe-remote-controls is also set.");
        }

        if (options.AllowPathQuery && options.AllowedFwdPathRoots.Count == 0)
        {
            errors.Add("Request-level ?path= overrides require at least one --allowed-path-root. When --path is provided, the startup path directory is added automatically.");
        }

        return errors;
    }

    public static bool IsLoopbackPrefix(string prefix)
    {
        return TryGetHost(prefix, out string? host, out _) && IsLoopbackHost(host!);
    }

    public static bool IsLoopbackHost(string host)
    {
        if (string.IsNullOrWhiteSpace(host))
            return false;

        string value = host.Trim().Trim('[', ']').ToLowerInvariant();
        return value == "localhost" || value == "127.0.0.1" || value == "::1";
    }

    public static void AddDefaultAllowedPathRoot(WorkbenchApiServerOptions options)
    {
        if (options == null) throw new ArgumentNullException(nameof(options));
        if (!options.AllowPathQuery)
            return;
        if (options.AllowedFwdPathRoots.Count > 0)
            return;
        if (string.IsNullOrWhiteSpace(options.DefaultFwdPath))
            return;

        string fullPath;
        try { fullPath = Path.GetFullPath(options.DefaultFwdPath!.Trim()); }
        catch { return; }

        string? directory = File.Exists(fullPath)
            ? Path.GetDirectoryName(fullPath)
            : (Path.HasExtension(fullPath) ? Path.GetDirectoryName(fullPath) : fullPath);

        if (!string.IsNullOrWhiteSpace(directory))
            options.AllowedFwdPathRoots.Add(directory!);
    }

    private static bool HasUnsafeRemoteControls(WorkbenchApiServerOptions options)
    {
        return options.EnableCors ||
               options.EnableDebugApi ||
               options.AllowMutatingCommands ||
               options.AllowPathQuery;
    }

    private static bool TryGetHost(string prefix, out string? host, out string? error)
    {
        host = null;
        error = null;

        string candidate = prefix.Trim();
        if (candidate.Contains("+"))
        {
            host = "+";
            return true;
        }

        if (candidate.Contains("*"))
        {
            host = "*";
            return true;
        }

        if (!Uri.TryCreate(candidate, UriKind.Absolute, out Uri? uri) ||
            string.IsNullOrWhiteSpace(uri.Host) ||
            !(uri.Scheme.Equals(Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) ||
              uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)))
        {
            error = "API prefix must be an absolute http(s) URL, for example http://127.0.0.1:8787/.";
            return false;
        }

        host = uri.Host;
        return true;
    }
}
