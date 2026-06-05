using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using Newtonsoft.Json;

namespace AcRuleWorkbench.Api;

internal sealed class ApiResponseWriter
{
    private static readonly JsonSerializerSettings JsonSettings = new JsonSerializerSettings
    {
        StringEscapeHandling = StringEscapeHandling.EscapeHtml,
        NullValueHandling = NullValueHandling.Include
    };

    public void WriteNoContent(HttpListenerResponse response, bool enableCors)
    {
        if (response == null)
            throw new ArgumentNullException(nameof(response));

        TryWriteResponse(response, () =>
        {
            Prepare(response, enableCors);
            response.StatusCode = 204;
            SafeClose(response);
        });
    }

    public void WriteApiResult(HttpListenerResponse response, ApiHttpResult result, bool enableCors)
    {
        if (response == null)
            throw new ArgumentNullException(nameof(response));
        if (result == null)
            throw new ArgumentNullException(nameof(result));

        TryWriteResponse(response, () =>
        {
            Prepare(response, enableCors);

            foreach (KeyValuePair<string, string> header in result.Headers)
            {
                if (!string.IsNullOrWhiteSpace(header.Key) && header.Value != null)
                    response.Headers[header.Key] = header.Value;
            }

            WriteUtf8(
                response,
                JsonConvert.SerializeObject(result.Body, Formatting.Indented, JsonSettings),
                string.IsNullOrWhiteSpace(result.ContentType) ? "application/json; charset=utf-8" : result.ContentType,
                result.StatusCode);
        });
    }

    public void WriteJson(HttpListenerResponse response, object value, int statusCode, bool enableCors)
    {
        if (response == null)
            throw new ArgumentNullException(nameof(response));

        TryWriteResponse(response, () =>
        {
            Prepare(response, enableCors);
            WriteUtf8(response, JsonConvert.SerializeObject(value, Formatting.Indented, JsonSettings), "application/json; charset=utf-8", statusCode);
        });
    }

    public void WriteHtml(HttpListenerResponse response, string html, bool enableCors, int statusCode = 200)
    {
        if (response == null)
            throw new ArgumentNullException(nameof(response));

        TryWriteResponse(response, () =>
        {
            Prepare(response, enableCors);
            WriteUtf8(response, html ?? string.Empty, "text/html; charset=utf-8", statusCode);
        });
    }

    public void WriteText(HttpListenerResponse response, string text, string contentType, bool enableCors, int statusCode = 200)
    {
        if (response == null)
            throw new ArgumentNullException(nameof(response));

        TryWriteResponse(response, () =>
        {
            Prepare(response, enableCors);
            WriteUtf8(
                response,
                text ?? string.Empty,
                string.IsNullOrWhiteSpace(contentType) ? "text/plain; charset=utf-8" : contentType,
                statusCode);
        });
    }

    private static void Prepare(HttpListenerResponse response, bool enableCors)
    {
        AddSecurityHeaders(response);
        if (enableCors)
            AddCors(response);
    }

    private static void WriteUtf8(HttpListenerResponse response, string value, string contentType, int statusCode)
    {
        byte[] bytes = Encoding.UTF8.GetBytes(value ?? string.Empty);
        response.StatusCode = statusCode;
        response.ContentType = contentType;
        response.ContentEncoding = Encoding.UTF8;
        response.ContentLength64 = bytes.Length;

        try
        {
            response.OutputStream.Write(bytes, 0, bytes.Length);
        }
        finally
        {
            SafeClose(response);
        }
    }

    private static void TryWriteResponse(HttpListenerResponse response, Action write)
    {
        try
        {
            write();
        }
        catch (Exception ex) when (IsClientDisconnectedException(ex))
        {
            SafeClose(response);
        }
    }

    internal static bool IsClientDisconnectedException(Exception ex)
    {
        if (ex == null)
            return false;

        if (ex is HttpListenerException || ex is ObjectDisposedException || ex is IOException)
            return true;

        if (ex is InvalidOperationException)
        {
            string message = ex.Message ?? string.Empty;
            if (message.IndexOf("closed", StringComparison.OrdinalIgnoreCase) >= 0 ||
                message.IndexOf("disposed", StringComparison.OrdinalIgnoreCase) >= 0 ||
                message.IndexOf("not open", StringComparison.OrdinalIgnoreCase) >= 0)
                return true;
        }

        return ex.InnerException != null && IsClientDisconnectedException(ex.InnerException);
    }

    private static void SafeClose(HttpListenerResponse response)
    {
        try
        {
            response.Close();
        }
        catch (ObjectDisposedException)
        {
            // The client disconnected or another error path already closed the response.
        }
        catch (HttpListenerException)
        {
            // The socket can disappear during local browser refreshes. Nothing useful remains to send.
        }
        catch (InvalidOperationException)
        {
            // HttpListenerResponse may throw after abort/close races during shutdown.
        }
    }

    private static void AddSecurityHeaders(HttpListenerResponse response)
    {
        response.Headers["X-Content-Type-Options"] = "nosniff";
        response.Headers["X-Frame-Options"] = "SAMEORIGIN";
        response.Headers["Referrer-Policy"] = "no-referrer";
        response.Headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
    }

    private static void AddCors(HttpListenerResponse response)
    {
        response.Headers["Access-Control-Allow-Origin"] = "*";
        response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
        response.Headers["Access-Control-Allow-Headers"] = "Content-Type, X-Request-Id";
        response.Headers["Cache-Control"] = "no-store";
    }
}
