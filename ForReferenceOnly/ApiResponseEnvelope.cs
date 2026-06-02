using System;
using System.Collections.Generic;
using Newtonsoft.Json;

namespace DllInteropHarness.Api;

internal sealed class ApiEnvelope
{
    [JsonProperty("ok")]
    public bool Ok { get; set; }

    [JsonProperty("schema")]
    public string Schema { get; set; } = string.Empty;

    [JsonProperty("schemaVersion")]
    public string SchemaVersion { get; set; } = string.Empty;

    [JsonProperty("apiVersion")]
    public string ApiVersion { get; set; } = string.Empty;

    [JsonProperty("requestId")]
    public string RequestId { get; set; } = string.Empty;

    [JsonProperty("snapshotId")]
    public string? SnapshotId { get; set; }

    [JsonProperty("generatedAtUtc")]
    public DateTime? GeneratedAtUtc { get; set; }

    [JsonProperty("data")]
    public object? Data { get; set; }

    [JsonProperty("meta")]
    public ApiMeta? Meta { get; set; }
}

internal sealed class ApiErrorEnvelope
{
    [JsonProperty("ok")]
    public bool Ok { get; set; }

    [JsonProperty("apiVersion")]
    public string ApiVersion { get; set; } = string.Empty;

    [JsonProperty("requestId")]
    public string RequestId { get; set; } = string.Empty;

    [JsonProperty("error")]
    public ApiErrorBody Error { get; set; } = new ApiErrorBody();
}

internal sealed class ApiErrorBody
{
    [JsonProperty("code")]
    public string Code { get; set; } = string.Empty;

    [JsonProperty("message")]
    public string Message { get; set; } = string.Empty;

    [JsonProperty("detail")]
    public string? Detail { get; set; }

    [JsonProperty("target")]
    public string? Target { get; set; }

    [JsonProperty("resolution")]
    public string? Resolution { get; set; }

    [JsonProperty("correlationId")]
    public string? CorrelationId { get; set; }
}

internal sealed class ApiMeta
{
    [JsonProperty("contract")]
    public string? Contract { get; set; }

    [JsonProperty("caveat")]
    public string? Caveat { get; set; }

    [JsonProperty("links")]
    public Dictionary<string, string> Links { get; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
}
