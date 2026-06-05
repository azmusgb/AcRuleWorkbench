using System.Collections.Generic;
using AcRuleWorkbench.Core;
using Newtonsoft.Json;

namespace AcRuleWorkbench.Api.V1;

internal sealed class SelectedRulePacket
{
    [JsonProperty("objectKind")]
    public string ObjectKind { get; set; } = "SelectedRulePacket";

    [JsonProperty("modelVersion")]
    public string ModelVersion { get; set; } = "1.0";

    [JsonProperty("authority")]
    public string Authority { get; set; } = "StructuralRuleTree";

    [JsonProperty("ruleList")]
    public SelectedRuleListProjection RuleList { get; set; } = new();

    [JsonProperty("rule")]
    public SelectedRuleProjection Rule { get; set; } = new();

    [JsonProperty("parentRule")]
    public SelectedRulePointer? ParentRule { get; set; }

    [JsonProperty("incomingStatusResult")]
    public SelectedStatusResultProjection? IncomingStatusResult { get; set; }

    [JsonProperty("function")]
    public SelectedFunctionProjection Function { get; set; } = new();

    [JsonProperty("parameters")]
    public List<SelectedParameterProjection> Parameters { get; } = new();

    [JsonProperty("attributes")]
    public Dictionary<string, string> Attributes { get; } = new();

    [JsonProperty("fieldBindings")]
    public List<SelectedFieldBindingProjection> FieldBindings { get; } = new();

    [JsonProperty("actionLists")]
    public List<SelectedActionListProjection> ActionLists { get; } = new();

    [JsonProperty("references")]
    public List<SelectedReferenceProjection> References { get; } = new();

    [JsonProperty("diagnostics")]
    public List<SelectedDiagnosticProjection> Diagnostics { get; } = new();

    [JsonProperty("evidence")]
    public List<SelectedEvidenceProjection> Evidence { get; } = new();

    [JsonProperty("notProven")]
    public List<string> NotProven { get; } = new();
}

internal sealed class SelectedRuleListProjection
{
    [JsonProperty("scopeId")]
    public string ScopeId { get; set; } = string.Empty;

    [JsonProperty("name")]
    public string Name { get; set; } = string.Empty;

    [JsonProperty("kind")]
    public string Kind { get; set; } = string.Empty;

    [JsonProperty("ruleListPath")]
    public string RuleListPath { get; set; } = "Root";

    [JsonProperty("structuralPath")]
    public string StructuralPath { get; set; } = "Root";

    [JsonProperty("displayPath")]
    public string DisplayPath { get; set; } = "Root";

    [JsonProperty("structuralRuleCount")]
    public int StructuralRuleCount { get; set; }

    [JsonProperty("flatInventoryCount")]
    public int FlatInventoryCount { get; set; }

    [JsonProperty("source")]
    public string Source { get; set; } = "AcTreeReport.Scope";
}

internal sealed class SelectedRuleProjection
{
    [JsonProperty("nodeId")]
    public string NodeId { get; set; } = string.Empty;

    [JsonProperty("rawNodeId")]
    public int RawNodeId { get; set; }

    [JsonProperty("ruleGuid")]
    public string? RuleGuid { get; set; }

    [JsonProperty("ruleId")]
    public string? RuleId { get; set; }

    [JsonProperty("name")]
    public string? Name { get; set; }

    [JsonProperty("functionName")]
    public string? FunctionName { get; set; }

    [JsonProperty("functionVersion")]
    public string? FunctionVersion { get; set; }

    [JsonProperty("description")]
    public string? Description { get; set; }

    [JsonProperty("ordinal")]
    public int Ordinal { get; set; }

    [JsonProperty("depth")]
    public int Depth { get; set; }

    [JsonProperty("disabled")]
    public object? Disabled { get; set; }

    [JsonProperty("source")]
    public string Source { get; set; } = "StructuralRuleNode";
}

internal sealed class SelectedRulePointer
{
    [JsonProperty("nodeId")]
    public string NodeId { get; set; } = string.Empty;

    [JsonProperty("rawNodeId")]
    public int RawNodeId { get; set; }

    [JsonProperty("ruleGuid")]
    public string? RuleGuid { get; set; }

    [JsonProperty("name")]
    public string? Name { get; set; }

    [JsonProperty("functionName")]
    public string? FunctionName { get; set; }
}

internal sealed class SelectedStatusResultProjection
{
    [JsonProperty("ownerRuleNodeId")]
    public string OwnerRuleNodeId { get; set; } = string.Empty;

    [JsonProperty("actionListIndex")]
    public int ActionListIndex { get; set; }

    [JsonProperty("name")]
    public string Name { get; set; } = string.Empty;

    [JsonProperty("nameResolved")]
    public bool NameResolved { get; set; }

    [JsonProperty("routeState")]
    public string RouteState { get; set; } = string.Empty;

    [JsonProperty("relationship")]
    public string Relationship { get; set; } = "StatusResultOwnsActionList";

    [JsonProperty("confidence")]
    public string Confidence { get; set; } = "Medium";

    [JsonProperty("evidence")]
    public string Evidence { get; set; } = string.Empty;
}

internal sealed class SelectedFunctionProjection
{
    [JsonProperty("name")]
    public string? Name { get; set; }

    [JsonProperty("category")]
    public string Category { get; set; } = "Unknown";

    [JsonProperty("defined")]
    public bool Defined { get; set; }

    [JsonProperty("observed")]
    public bool Observed { get; set; }

    [JsonProperty("deprecated")]
    public bool Deprecated { get; set; }

    [JsonProperty("description")]
    public string Description { get; set; } = string.Empty;

    [JsonProperty("statusResults")]
    public List<string> StatusResults { get; set; } = new();

    [JsonProperty("configuredStatusResults")]
    public List<string> ConfiguredStatusResults { get; set; } = new();

    [JsonProperty("parameterRoles")]
    public List<string> ParameterRoles { get; set; } = new();

    [JsonProperty("parameterSchema")]
    public List<AcFunctionCatalog.FunctionParameterSchema> ParameterSchema { get; set; } = new();

    [JsonProperty("observedParameterNames")]
    public List<string> ObservedParameterNames { get; set; } = new();

    [JsonProperty("unknownObservedParameterNames")]
    public List<string> UnknownObservedParameterNames { get; set; } = new();

    [JsonProperty("schemaProfile")]
    public AcFunctionCatalog.FunctionSchemaProfile? SchemaProfile { get; set; }

    [JsonProperty("behaviorFlags")]
    public List<string> BehaviorFlags { get; set; } = new();

    [JsonProperty("runtimeImpacts")]
    public List<string> RuntimeImpacts { get; set; } = new();

    [JsonProperty("evidence")]
    public string Evidence { get; set; } = string.Empty;

    [JsonProperty("statusResultCaveat")]
    public string StatusResultCaveat { get; set; } = string.Empty;
}

internal sealed class SelectedParameterProjection
{
    [JsonProperty("name")]
    public string Name { get; set; } = string.Empty;

    [JsonProperty("values")]
    public List<string> Values { get; set; } = new();

    [JsonProperty("kind")]
    public string Kind { get; set; } = "Parameter";

    [JsonProperty("source")]
    public string Source { get; set; } = "RuleParameter";

    [JsonProperty("confidence")]
    public string Confidence { get; set; } = "High";
}

internal sealed class SelectedFieldBindingProjection
{
    [JsonProperty("parameterName")]
    public string ParameterName { get; set; } = string.Empty;

    [JsonProperty("parameterValue")]
    public string ParameterValue { get; set; } = string.Empty;

    [JsonProperty("referencedField")]
    public string ReferencedField { get; set; } = string.Empty;

    [JsonProperty("fieldExists")]
    public bool FieldExists { get; set; }

    [JsonProperty("confidence")]
    public string Confidence { get; set; } = "Low";

    [JsonProperty("source")]
    public string Source { get; set; } = "RuleParameter";
}

internal sealed class SelectedActionListProjection
{
    [JsonProperty("ownerRuleNodeId")]
    public string OwnerRuleNodeId { get; set; } = string.Empty;

    [JsonProperty("statusResult")]
    public SelectedStatusResultProjection StatusResult { get; set; } = new();

    [JsonProperty("childCount")]
    public int ChildCount { get; set; }

    [JsonProperty("children")]
    public List<SelectedRulePointer> Children { get; } = new();

    [JsonProperty("source")]
    public string Source { get; set; } = "StructuralRuleEdge";
}

internal sealed class SelectedReferenceProjection
{
    [JsonProperty("kind")]
    public string Kind { get; set; } = string.Empty;

    [JsonProperty("targetType")]
    public string TargetType { get; set; } = string.Empty;

    [JsonProperty("target")]
    public string Target { get; set; } = string.Empty;

    [JsonProperty("parameterName")]
    public string? ParameterName { get; set; }

    [JsonProperty("parameterRole")]
    public string ParameterRole { get; set; } = "Unknown";

    [JsonProperty("runtimeDependency")]
    public bool RuntimeDependency { get; set; }

    [JsonProperty("confidence")]
    public string Confidence { get; set; } = "Medium";

    [JsonProperty("evidence")]
    public string? Evidence { get; set; }
}

internal sealed class SelectedDiagnosticProjection
{
    [JsonProperty("severity")]
    public string Severity { get; set; } = "Info";

    [JsonProperty("category")]
    public string Category { get; set; } = string.Empty;

    [JsonProperty("message")]
    public string Message { get; set; } = string.Empty;

    [JsonProperty("source")]
    public string Source { get; set; } = "AcTreeDiagnostic";
}

internal sealed class SelectedEvidenceProjection
{
    [JsonProperty("source")]
    public string Source { get; set; } = string.Empty;

    [JsonProperty("authority")]
    public string Authority { get; set; } = string.Empty;

    [JsonProperty("confidence")]
    public string Confidence { get; set; } = "Medium";

    [JsonProperty("caveat")]
    public string Caveat { get; set; } = string.Empty;
}
