using System;
using System.Collections.Generic;
using System.Linq;
using AcRuleWorkbench;
using AcRuleWorkbench.Core;
using Newtonsoft.Json;

namespace AcRuleWorkbench.Api.V1.Contracts;

internal sealed class ApiHelpDto
{
    [JsonProperty("name")]
    public string Name { get; set; } = "FormWorks Editor Viewer API v1";

    [JsonProperty("purpose")]
    public string Purpose { get; set; } = "Stable product API for scope, rule, evidence, relationship, search, and diagnostics workflows.";

    [JsonProperty("basePath")]
    public string BasePath { get; set; } = "/api/v1";

    [JsonProperty("compatibility")]
    public string Compatibility { get; set; } = "Legacy /api/fwd/* routes remain available but should not be used by new clients.";

    [JsonProperty("debug")]
    public string Debug { get; set; } = "Raw/debug routes are outside this contract and should live under /api/debug/*.";

    [JsonProperty("endpoints")]
    public List<string> Endpoints { get; } = new List<string>();

    [JsonProperty("examples")]
    public Dictionary<string, string> Examples { get; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
}

internal sealed class RouteCatalogDto
{
    [JsonProperty("basePath")]
    public string BasePath { get; set; } = string.Empty;

    [JsonProperty("apiVersion")]
    public string ApiVersion { get; set; } = string.Empty;

    [JsonProperty("schemaVersion")]
    public string SchemaVersion { get; set; } = string.Empty;

    [JsonProperty("routes")]
    public List<RouteCatalogItemDto> Routes { get; } = new List<RouteCatalogItemDto>();

    [JsonProperty("contract")]
    public RouteContractDto Contract { get; set; } = new RouteContractDto();
}

internal sealed class RouteCatalogItemDto
{
    [JsonProperty("method")]
    public string Method { get; set; } = string.Empty;

    [JsonProperty("path")]
    public string Path { get; set; } = string.Empty;

    [JsonProperty("description")]
    public string Description { get; set; } = string.Empty;
}

internal sealed class RouteContractDto
{
    [JsonProperty("openApi")]
    public string OpenApi { get; set; } = "/api/v1/openapi.json";

    [JsonProperty("envelope")]
    public string Envelope { get; set; } = "All product responses use ok/schema/schemaVersion/apiVersion/requestId/data.";

    [JsonProperty("errors")]
    public string Errors { get; set; } = "All product errors use ok=false plus error.code/message/detail/correlationId.";
}

internal sealed class CapabilitiesDto
{
    [JsonProperty("apiVersion")]
    public string ApiVersion { get; set; } = string.Empty;

    [JsonProperty("schemaVersion")]
    public string SchemaVersion { get; set; } = string.Empty;

    [JsonProperty("mode")]
    public string Mode { get; set; } = "static-inspection";

    [JsonProperty("readOnly")]
    public bool ReadOnly { get; set; }

    [JsonProperty("refreshEnabled")]
    public bool RefreshEnabled { get; set; }

    [JsonProperty("debugApiEnabled")]
    public bool DebugApiEnabled { get; set; }

    [JsonProperty("supports")]
    public CapabilitySupportDto Supports { get; set; } = new CapabilitySupportDto();

    [JsonProperty("limits")]
    public CapabilityLimitsDto Limits { get; set; } = new CapabilityLimitsDto();

    [JsonProperty("links")]
    public Dictionary<string, string> Links { get; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    [JsonProperty("snapshotStrategy")]
    public string SnapshotStrategy { get; set; } = "cached";

    [JsonProperty("evidenceExport")]
    public EvidenceExportProfileDto EvidenceExport { get; set; } = new EvidenceExportProfileDto();
}

internal sealed class CapabilitySupportDto
{
    [JsonProperty("snapshotCache")]
    public bool SnapshotCache { get; set; }

    [JsonProperty("liveLazy")]
    public bool LiveLazy { get; set; }

    [JsonProperty("structuralTree")]
    public bool StructuralTree { get; set; }

    [JsonProperty("flatInventory")]
    public bool FlatInventory { get; set; }

    [JsonProperty("relationshipExtraction")]
    public bool RelationshipExtraction { get; set; }

    [JsonProperty("functionCatalog")]
    public bool FunctionCatalog { get; set; }

    [JsonProperty("diagnostics")]
    public bool Diagnostics { get; set; }

    [JsonProperty("evidencePackets")]
    public bool EvidencePackets { get; set; }

    [JsonProperty("globalSearch")]
    public bool GlobalSearch { get; set; }

    [JsonProperty("nativeRuntimeSimulation")]
    public bool NativeRuntimeSimulation { get; set; }

    [JsonProperty("configMutation")]
    public bool ConfigMutation { get; set; }
}

internal sealed class CapabilityLimitsDto
{
    [JsonProperty("defaultInventoryLimit")]
    public int DefaultInventoryLimit { get; set; }

    [JsonProperty("maxInventoryLimit")]
    public int MaxInventoryLimit { get; set; }

    [JsonProperty("defaultSearchLimit")]
    public int DefaultSearchLimit { get; set; }

    [JsonProperty("maxSearchLimit")]
    public int MaxSearchLimit { get; set; }

    [JsonProperty("maxReferencesReturned")]
    public int MaxReferencesReturned { get; set; }

    [JsonProperty("maxPendingSnapshotBuilds")]
    public int MaxPendingSnapshotBuilds { get; set; }

    [JsonProperty("maxPendingLiveSessionBuilds")]
    public int MaxPendingLiveSessionBuilds { get; set; }

    [JsonProperty("maxCachedLiveSessions")]
    public int MaxCachedLiveSessions { get; set; }
}

internal sealed class EvidenceExportProfileDto
{
    [JsonProperty("profile")]
    public string Profile { get; set; } = EvidenceExportProfileSettings.ToCommandName(EvidenceExportProfile.ViewerSafe);

    [JsonProperty("includeResourceConfigs")]
    public bool IncludeResourceConfigs { get; set; }

    [JsonProperty("includeResourcePrivateTrees")]
    public bool IncludeResourcePrivateTrees { get; set; }

    [JsonProperty("maxPrivateTreeDepth")]
    public int MaxPrivateTreeDepth { get; set; }

    [JsonProperty("maxPrivateTreeNodes")]
    public int MaxPrivateTreeNodes { get; set; }

    [JsonProperty("description")]
    public string Description { get; set; } = string.Empty;

    public static EvidenceExportProfileDto FromSettings(EvidenceExportProfileSettings settings)
    {
        return new EvidenceExportProfileDto
        {
            Profile = settings.CommandName,
            IncludeResourceConfigs = settings.IncludeResourceConfigs,
            IncludeResourcePrivateTrees = settings.IncludeResourcePrivateTrees,
            MaxPrivateTreeDepth = settings.MaxPrivateTreeDepth,
            MaxPrivateTreeNodes = settings.MaxPrivateTreeNodes,
            Description = settings.Description
        };
    }
}

internal sealed class LivenessDto
{
    [JsonProperty("live")]
    public bool Live { get; set; }

    [JsonProperty("service")]
    public string Service { get; set; } = "FormWorks Editor Viewer API";

    [JsonProperty("apiVersion")]
    public string ApiVersion { get; set; } = string.Empty;

    [JsonProperty("utc")]
    public DateTime Utc { get; set; }

    [JsonProperty("processBitness")]
    public string ProcessBitness { get; set; } = string.Empty;
}

internal static class WorkbenchApiMetadataBuilder
{
    public static ApiHelpDto BuildHelp()
    {
        var dto = new ApiHelpDto();
        dto.Endpoints.AddRange(ApiV1Routes.All.Select(r => r.Method + " " + r.Path));
        dto.Examples["scopes"] = "/api/v1/scopes";
        dto.Examples["scope"] = "/api/v1/scopes/AC%2fPages%2fDentalADA";
        dto.Examples["functions"] = "/api/v1/fwd/functions";
        dto.Examples["search"] = "/api/v1/search?q=provider&kind=StructuralRule";
        return dto;
    }

    public static RouteCatalogDto BuildRouteCatalog()
    {
        var dto = new RouteCatalogDto
        {
            BasePath = ApiV1Routes.BasePath,
            ApiVersion = ApiV1Routes.ApiVersion,
            SchemaVersion = ApiV1Routes.SchemaVersion
        };
        dto.Routes.AddRange(ApiV1Routes.All.Select(r => new RouteCatalogItemDto
        {
            Method = r.Method,
            Path = r.Path,
            Description = r.Description
        }));
        return dto;
    }

    public static CapabilitiesDto BuildCapabilities(WorkbenchApiServerOptions options)
    {
        if (options == null) throw new ArgumentNullException(nameof(options));

        EvidenceExportProfileSettings profile = EvidenceExportProfileSettings.Resolve(options.EvidenceExportProfile);
        var dto = new CapabilitiesDto
        {
            ApiVersion = ApiV1Routes.ApiVersion,
            SchemaVersion = ApiV1Routes.SchemaVersion,
            ReadOnly = true,
            RefreshEnabled = options.AllowMutatingCommands,
            DebugApiEnabled = options.EnableDebugApi,
            SnapshotStrategy = options.LiveLazyMode ? (options.StartupSnapshotWarmup ? "live-lazy+snapshot-warmup" : "live-lazy") : (options.DisableSnapshotCache ? "rebuild-per-request" : "cached"),
            EvidenceExport = EvidenceExportProfileDto.FromSettings(profile),
            Supports = new CapabilitySupportDto
            {
                SnapshotCache = !options.DisableSnapshotCache,
                LiveLazy = options.LiveLazyMode,
                StructuralTree = true,
                FlatInventory = true,
                RelationshipExtraction = true,
                FunctionCatalog = true,
                Diagnostics = true,
                EvidencePackets = true,
                GlobalSearch = true,
                NativeRuntimeSimulation = false,
                ConfigMutation = false
            },
            Limits = new CapabilityLimitsDto
            {
                DefaultInventoryLimit = 100,
                MaxInventoryLimit = 500,
                DefaultSearchLimit = 100,
                MaxSearchLimit = 500,
                MaxReferencesReturned = 1000,
                MaxPendingSnapshotBuilds = options.EffectiveMaxPendingSnapshotBuilds,
                MaxPendingLiveSessionBuilds = options.EffectiveMaxPendingLiveSessionBuilds,
                MaxCachedLiveSessions = options.EffectiveMaxCachedLiveSessions
            }
        };

        dto.Links["openApi"] = "/api/v1/openapi.json";
        dto.Links["routes"] = "/api/v1/routes";
        dto.Links["status"] = "/api/v1/status";
        dto.Links["readiness"] = "/api/v1/health/ready";
        return dto;
    }

    public static LivenessDto BuildLiveness()
    {
        return new LivenessDto
        {
            Live = true,
            ApiVersion = ApiV1Routes.ApiVersion,
            Utc = DateTime.UtcNow,
            ProcessBitness = Environment.Is64BitProcess ? "64-bit" : "32-bit"
        };
    }
}
