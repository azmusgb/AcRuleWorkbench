using System;
using System.Diagnostics;
using System.Net;
using System.Text;

namespace AcRuleWorkbench;

internal sealed partial class WorkbenchApiServer
{
    private static string NormalizePrefix(string prefix)
    {
        if (string.IsNullOrWhiteSpace(prefix))
            return "http://127.0.0.1:8787/";
        return prefix.EndsWith("/", StringComparison.Ordinal) ? prefix : prefix + "/";
    }

    private static string CombineUrl(string prefix, string path)
    {
        return NormalizePrefix(prefix) + path.TrimStart('/');
    }

    private static void TryOpenBrowser(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = url,
                UseShellExecute = true
            });
        }
        catch
        {
            // Browser launch is a convenience only. The URL is printed to the console.
        }
    }


    private static void AddDeprecationHeaders(HttpListenerResponse response, string replacement)
    {
        if (response == null) return;
        response.Headers["Deprecation"] = "true";
        response.Headers["X-Deprecated-Route"] = "true";
        if (!string.IsNullOrWhiteSpace(replacement))
            response.Headers["X-Replacement-Route"] = replacement;
    }


    private string BuildViewerMissingHtml()
    {
        string path = HtmlEncode(_options.DefaultFwdPath ?? @"C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd");
        string oneCommand = "cd C:\\dev\\AcRuleWorkbench\n.\\scripts\\start-workbench.ps1 -FwdPath \"" + path + "\" -Port 8787 -KillExisting";
        string manualCommand = "cd C:\\dev\\AcRuleWorkbench\n.\\AcRuleWorkbench\\bin\\x86\\Debug\\net48\\AcRuleWorkbench.exe ac-viewer --path \"" + path + "\" --out .\\ac-rule-viewer-live.html\n.\\AcRuleWorkbench\\bin\\x86\\Debug\\net48\\AcRuleWorkbench.exe api --path \"" + path + "\" --port 8787 --viewer .\\ac-rule-viewer-live.html --allow-refresh";
        return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>FW Editor Viewer not generated</title>" +
               "<style>body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#eef3f8;color:#172033}main{max-width:1040px;margin:44px auto;padding:0 22px}.card{background:white;border:1px solid #d7e0eb;border-radius:22px;padding:26px;box-shadow:0 18px 50px rgba(15,23,42,.10)}h1{margin:0 0 10px;font-size:28px}h2{font-size:14px;text-transform:uppercase;letter-spacing:.08em;color:#475569;margin:24px 0 8px}p{color:#64748b;line-height:1.55}.facts{display:grid;grid-template-columns:160px 1fr;gap:8px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin:16px 0}.facts b{color:#334155}pre{background:#101827;color:#eaf2ff;border-radius:14px;padding:16px;overflow:auto;white-space:pre-wrap}a{color:#3157d5;font-weight:800}.note{border-left:4px solid #3157d5;background:#eef3ff;padding:12px 14px;border-radius:12px;color:#334155}</style></head>" +
               "<body><main><section class=\"card\"><h1>FW Editor Viewer file missing</h1><p>The API process is running, but no static <code>ac-rule-viewer.html</code> is attached or discoverable. This is a server setup issue, not an extraction failure.</p>" +
               "<div class=\"facts\"><b>FWD path</b><span><code>" + path + "</code></span><b>Expected viewer</b><span><code>ac-rule-viewer.html</code></span><b>Best fix</b><span>Use the unified start script below. It prepares the viewer and starts the API.</span></div>" +
               "<h2>Recommended command</h2><pre>" + oneCommand + "</pre>" +
               "<h2>Manual command</h2><pre>" + manualCommand + "</pre>" +
               "<p class=\"note\">After running the command, open <a href=\"/viewer\">/viewer</a> or <a href=\"/harness\">/harness</a>.</p></section></main></body></html>";
    }

    private static string InjectApiWorkbenchBridge(string html)
    {
        // Server-side bridge injection was removed to keep /viewer focused on inspection.
        return html;
    }


    private static string BuildFallbackHarnessHtml(string encodedDefaultPath)
    {
        var html = new StringBuilder();
        html.AppendLine("<!doctype html>");
        html.AppendLine("<html lang=\"en\">");
        html.AppendLine("<head>");
        html.AppendLine("<meta charset=\"utf-8\">");
        html.AppendLine("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">");
        html.AppendLine("<title>FW Editor Viewer Developer Harness</title>");
        html.AppendLine("<style>");
        html.AppendLine("body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:#eef3f8;color:#172033}");
        html.AppendLine("main{max-width:1100px;margin:40px auto;padding:0 20px}");
        html.AppendLine(".card{background:#fff;border:1px solid #d7e0eb;border-radius:18px;padding:20px;box-shadow:0 14px 36px rgba(15,23,42,.08)}");
        html.AppendLine("h1{margin:0 0 8px;font-size:26px}.muted{color:#64748b}code,pre{font-family:Cascadia Mono,Consolas,monospace}");
        html.AppendLine("input{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:12px;padding:10px;margin:8px 0 12px}");
        html.AppendLine("button{border:0;border-radius:12px;background:#3157d5;color:white;padding:10px 14px;font-weight:700;cursor:pointer}");
        html.AppendLine("pre{white-space:pre-wrap;background:#101827;color:#e5edf8;border-radius:14px;padding:14px;min-height:260px;overflow:auto}");
        html.AppendLine("</style>");
        html.AppendLine("</head>");
        html.AppendLine("<body><main><section class=\"card\">");
        html.AppendLine("<h1>FW Editor Viewer Developer Harness</h1>");
        html.AppendLine("<p class=\"muted\">Fallback diagnostic harness loaded. Product clients should use /api/v1 and /api/v1/openapi.json.</p>");
        html.AppendLine("<label>FWD path</label>");
        html.Append("<input id=\"path\" value=\"");
        html.Append(encodedDefaultPath);
        html.AppendLine("\">");
        html.AppendLine("<button id=\"info\">GET /api/v1/status</button> <button id=\"hier\">GET /api/v1/scopes</button> <button id=\"diag\">GET /api/v1/diagnostics</button>");
        html.AppendLine("<pre id=\"out\">Ready.</pre>");
        html.AppendLine("<script>");
        html.AppendLine("const $=id=>document.getElementById(id);");
        html.AppendLine("async function run(path){const u=new URL(path,location.origin);const p=$('path').value;if(p)u.searchParams.set('path',p);$('out').textContent='GET '+u+'\n\nLoading...';try{const r=await fetch(u);const t=await r.text();let body=t;try{body=JSON.stringify(JSON.parse(t),null,2)}catch{}if(!r.ok||(body&&body.ok===false)){throw new Error((body&&(body.error||body.exceptionMessage||body.fix))||t||('HTTP '+r.status));}$('#out').textContent='HTTP '+r.status+' '+r.statusText+'\nGET '+u+'\n\n'+body}catch(e){$('out').textContent='REQUEST FAILED\n'+(e.stack||e.message||e)}}");
        html.AppendLine("$('info').onclick=()=>run('/api/v1/status');$('hier').onclick=()=>run('/api/v1/scopes');$('diag').onclick=()=>run('/api/v1/diagnostics');");
        html.AppendLine("</script>");
        html.AppendLine("</section></main></body></html>");
        return html.ToString();
    }

    private static string HtmlEncode(string value)
    {
        return WebUtility.HtmlEncode(value ?? string.Empty);
    }
}
