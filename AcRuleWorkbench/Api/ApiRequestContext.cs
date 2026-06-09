using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;

namespace AcRuleWorkbench.Api;

internal sealed class ApiRequestContext
{
    private readonly HttpListenerRequest _request;

    public ApiRequestContext(string basePath, string tail, HttpListenerRequest request)
    {
        BasePath = basePath ?? string.Empty;
        Tail = (tail ?? string.Empty).Trim('/');
        _request = request ?? throw new ArgumentNullException(nameof(request));
        Method = request.HttpMethod ?? "GET";
        RequestId = FirstNonBlank(request.Headers["X-Request-Id"], request.QueryString["requestId"], ApiHttpResult.NewCorrelationId());
    }

    public string BasePath { get; }
    public string Tail { get; }
    public string Method { get; }
    public string RequestId { get; }

    public string? Query(string name)
    {
        string? value = _request.QueryString[name];
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    public int IntQuery(string name, int defaultValue, int minValue, int maxValue)
    {
        string? value = Query(name);
        if (string.IsNullOrWhiteSpace(value)) return defaultValue;
        if (!int.TryParse(value, out int parsed))
            throw new ApiBadRequestException("InvalidIntegerQuery", "Query parameter '" + name + "' must be an integer.", value);
        if (parsed < minValue || parsed > maxValue)
            throw new ApiBadRequestException("QueryOutOfRange", "Query parameter '" + name + "' must be between " + minValue + " and " + maxValue + ".", value);
        return parsed;
    }

    public bool BoolQuery(string name, bool defaultValue)
    {
        string? value = Query(name);
        if (string.IsNullOrWhiteSpace(value)) return defaultValue;
        if (bool.TryParse(value, out bool parsed)) return parsed;
        if (value == "1" || value!.Equals("yes", StringComparison.OrdinalIgnoreCase) || value.Equals("on", StringComparison.OrdinalIgnoreCase)) return true;
        if (value == "0" || value.Equals("no", StringComparison.OrdinalIgnoreCase) || value.Equals("off", StringComparison.OrdinalIgnoreCase)) return false;
        throw new ApiBadRequestException("InvalidBooleanQuery", "Query parameter '" + name + "' must be true or false.", value);
    }

    public IReadOnlyList<string> CsvQuery(string name)
    {
        string? value = Query(name);
        if (string.IsNullOrWhiteSpace(value)) return Array.Empty<string>();
        return value!.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries).Select(x => x.Trim()).Where(x => x.Length > 0).ToList();
    }

    public void RequireMethod(params string[] allowed)
    {
        if (allowed.Any(x => string.Equals(x, Method, StringComparison.OrdinalIgnoreCase))) return;
        throw new ApiMethodNotAllowedException("This endpoint requires " + string.Join(" or ", allowed) + ".", "Received " + Method + ".");
    }

    private static string FirstNonBlank(params string?[] values)
    {
        foreach (string? value in values)
        {
            if (!string.IsNullOrWhiteSpace(value)) return value!;
        }
        return ApiHttpResult.NewCorrelationId();
    }
}

internal class ApiContractException : Exception
{
    public ApiContractException(string code, string message, int statusCode, string? detail = null, string? target = null, string? resolution = null)
        : base(message)
    {
        Code = code;
        StatusCode = statusCode;
        Detail = detail;
        Target = target;
        Resolution = resolution;
    }

    public string Code { get; }
    public int StatusCode { get; }
    public string? Detail { get; }
    public string? Target { get; }
    public string? Resolution { get; }
}

internal sealed class ApiBadRequestException : ApiContractException
{
    public ApiBadRequestException(string code, string message, string? detail = null, string? target = null)
        : base(code, message, 400, detail, target) { }
}

internal sealed class ApiMethodNotAllowedException : ApiContractException
{
    public ApiMethodNotAllowedException(string message, string? detail = null)
        : base("MethodNotAllowed", message, 405, detail) { }
}
