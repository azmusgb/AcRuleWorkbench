using System;
using System.Collections.Generic;

namespace AcRuleWorkbench.Api;

internal sealed class ApiHttpResult
{
    public int StatusCode { get; set; } = 200;

    public object Body { get; set; } = new { ok = true };

    public string ContentType { get; set; } = "application/json; charset=utf-8";

    public Dictionary<string, string> Headers { get; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    public static ApiHttpResult Json(object body, int statusCode = 200)
    {
        return new ApiHttpResult { Body = body ?? new { }, StatusCode = statusCode };
    }

    public static ApiHttpResult Error(string code, string message, int statusCode, string? detail = null, string? correlationId = null, string? target = null, string? resolution = null)
    {
        string requestId = correlationId ?? NewCorrelationId();
        var result = Json(new ApiErrorEnvelope
        {
            Ok = false,
            ApiVersion = "1.0.0",
            RequestId = requestId,
            Error = new ApiErrorBody
            {
                Code = code,
                Message = message,
                Detail = detail,
                Target = target,
                Resolution = resolution,
                CorrelationId = requestId
            }
        }, statusCode);
        result.Headers["X-Request-Id"] = requestId;
        result.Headers["X-Error-Code"] = code;
        return result;
    }

    public static string NewCorrelationId()
    {
        return "req-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-fff") + "-" + Guid.NewGuid().ToString("N").Substring(0, 8);
    }
}
