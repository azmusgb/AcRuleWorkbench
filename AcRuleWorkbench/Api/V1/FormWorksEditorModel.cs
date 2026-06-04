using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using AcRuleWorkbench.Core;
using Newtonsoft.Json;

namespace AcRuleWorkbench.Api.V1;

internal sealed class FormWorksEditorModel
{
    [JsonProperty("modelVersion")]
    public string ModelVersion { get; set; } = "1.0";

    [JsonProperty("source")]
    public string Source { get; set; } = "Static FWD inspection";

    [JsonProperty("objectGraph")]
    public FwdObjectGraphModel ObjectGraph { get; set; } = new();

    [JsonProperty("ruleLists")]
    public List<EditorRuleListModel> RuleLists { get; } = new();

    [JsonProperty("udfDefinitions")]
    public List<EditorUdfDefinitionModel> UdfDefinitions { get; } = new();

    [JsonProperty("selectionListDefinitions")]
    public List<EditorSelectionListDefinitionModel> SelectionListDefinitions { get; } = new();

    [JsonProperty("runtimeImpacts")]
    public List<EditorRuntimeImpactModel> RuntimeImpacts { get; } = new();

    [JsonProperty("diagnostics")]
    public List<string> Diagnostics { get; } = new();

    [JsonProperty("notProven")]
    public List<string> NotProven { get; } = new();
}

internal sealed class FwdObjectGraphModel
{
    [JsonProperty("nodes")]
    public List<FwdObjectNodeModel> Nodes { get; } = new();

    [JsonProperty("edges")]
    public List<FwdObjectEdgeModel> Edges { get; } = new();

    [JsonProperty("diagnostics")]
    public List<string> Diagnostics { get; } = new();
}

internal sealed class FwdObjectNodeModel
{
    [JsonProperty("id")]
    public string Id { get; set; } = string.Empty;

    [JsonProperty("kind")]
    public string Kind { get; set; } = string.Empty;

    [JsonProperty("name")]
    public string Name { get; set; } = string.Empty;

    [JsonProperty("source")]
    public string Source { get; set; } = string.Empty;

    [JsonProperty("confidence")]
    public string Confidence { get; set; } = "High";

    [JsonProperty("metadata")]
    public Dictionary<string, object?> Metadata { get; } = new(StringComparer.OrdinalIgnoreCase);
}

internal sealed class FwdObjectEdgeModel
{
    [JsonProperty("fromId")]
    public string FromId { get; set; } = string.Empty;

    [JsonProperty("toId")]
    public string ToId { get; set; } = string.Empty;

    [JsonProperty("kind")]
    public string Kind { get; set; } = string.Empty;

    [JsonProperty("source")]
    public string Source { get; set; } = string.Empty;

    [JsonProperty("confidence")]
    public string Confidence { get; set; } = "High";
}

internal sealed class EditorRuleListModel
{
    [JsonProperty("ruleListId")]
    public string RuleListId { get; set; } = string.Empty;

    [JsonProperty("name")]
    public string Name { get; set; } = string.Empty;

    [JsonProperty("kind")]
    public string Kind { get; set; } = string.Empty;

    [JsonProperty("source")]
    public string Source { get; set; } = "AcTreeReport.Scope";

    [JsonProperty("structuralRuleCount")]
    public int StructuralRuleCount { get; set; }

    [JsonProperty("flatInventoryCount")]
    public int FlatInventoryCount { get; set; }

    [JsonProperty("ruleConfigurations")]
    public List<EditorRuleConfigurationModel> RuleConfigurations { get; } = new();

    [JsonProperty("diagnostics")]
    public List<string> Diagnostics { get; } = new();
}

internal sealed class EditorRuleConfigurationModel
{
    [JsonProperty("nodeId")]
    public string NodeId { get; set; } = string.Empty;

    [JsonProperty("ruleGuid")]
    public string? RuleGuid { get; set; }

    [JsonProperty("ruleId")]
    public string? RuleId { get; set; }

    [JsonProperty("name")]
    public string? Name { get; set; }

    [JsonProperty("functionName")]
    public string? FunctionName { get; set; }

    [JsonProperty("ordinal")]
    public int Ordinal { get; set; }

    [JsonProperty("depth")]
    public int Depth { get; set; }

    [JsonProperty("parentRuleNodeId")]
    public string? ParentRuleNodeId { get; set; }

    [JsonProperty("incomingStatusResult")]
    public EditorStatusResultModel? IncomingStatusResult { get; set; }

    [JsonProperty("parameters")]
    public Dictionary<string, List<string>> Parameters { get; } = new(StringComparer.OrdinalIgnoreCase);

    [JsonProperty("attributes")]
    public Dictionary<string, string> Attributes { get; } = new(StringComparer.OrdinalIgnoreCase);

    [JsonProperty("functionSchema")]
    public EditorFunctionSchemaModel FunctionSchema { get; set; } = new();

    [JsonProperty("disabledState")]
    public string DisabledState { get; set; } = AcDisabledStates.Enabled;

    [JsonProperty("disabledAuthority")]
    public string DisabledAuthority { get; set; } = "Structural";

    [JsonProperty("actionLists")]
    public List<EditorActionListModel> ActionLists { get; } = new();

    [JsonProperty("rejects")]
    public List<EditorRejectModel> Rejects { get; } = new();

    [JsonProperty("references")]
    public List<EditorReferenceModel> References { get; } = new();

    [JsonProperty("sourceHandles")]
    public List<EditorSourceHandleModel> SourceHandles { get; } = new();

    [JsonProperty("diagnostics")]
    public List<string> Diagnostics { get; } = new();
}

internal sealed class EditorFunctionSchemaModel
{
    [JsonProperty("name")]
    public string? Name { get; set; }

    [JsonProperty("defined")]
    public bool Defined { get; set; }

    [JsonProperty("category")]
    public string Category { get; set; } = "Unknown";

    [JsonProperty("statusResults")]
    public List<string> StatusResults { get; } = new();

    [JsonProperty("configuredStatusResults")]
    public List<string> ConfiguredStatusResults { get; } = new();

    [JsonProperty("parameterRoles")]
    public List<string> ParameterRoles { get; } = new();

    [JsonProperty("behaviorFlags")]
    public List<string> BehaviorFlags { get; } = new();

    [JsonProperty("runtimeImpacts")]
    public List<string> RuntimeImpacts { get; } = new();

    [JsonProperty("evidence")]
    public string Evidence { get; set; } = string.Empty;
}

internal sealed class EditorRejectModel
{
    [JsonProperty("kind")]
    public string Kind { get; set; } = string.Empty;

    [JsonProperty("target")]
    public string Target { get; set; } = string.Empty;

    [JsonProperty("message")]
    public string? Message { get; set; }

    [JsonProperty("code")]
    public string? Code { get; set; }

    [JsonProperty("parameterName")]
    public string? ParameterName { get; set; }

    [JsonProperty("confidence")]
    public string Confidence { get; set; } = "Medium";

    [JsonProperty("evidence")]
    public string? Evidence { get; set; }
}

internal sealed class EditorSourceHandleModel
{
    [JsonProperty("source")]
    public string Source { get; set; } = string.Empty;

    [JsonProperty("path")]
    public string Path { get; set; } = string.Empty;

    [JsonProperty("authority")]
    public string Authority { get; set; } = string.Empty;

    [JsonProperty("confidence")]
    public string Confidence { get; set; } = "High";
}

internal sealed class EditorStatusResultModel
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
    public string RouteState { get; set; } = "Unresolved";

    [JsonProperty("relationship")]
    public string Relationship { get; set; } = "StatusResultOwnsActionList";

    [JsonProperty("confidence")]
    public string Confidence { get; set; } = "Medium";
}

internal sealed class EditorActionListModel
{
    [JsonProperty("statusResult")]
    public EditorStatusResultModel StatusResult { get; set; } = new();

    [JsonProperty("childRuleNodeIds")]
    public List<string> ChildRuleNodeIds { get; } = new();

    [JsonProperty("source")]
    public string Source { get; set; } = "StructuralRuleEdge";
}

internal sealed class EditorReferenceModel
{
    [JsonProperty("kind")]
    public string Kind { get; set; } = string.Empty;

    [JsonProperty("targetType")]
    public string TargetType { get; set; } = string.Empty;

    [JsonProperty("target")]
    public string Target { get; set; } = string.Empty;

    [JsonProperty("parameterRole")]
    public string ParameterRole { get; set; } = "Unknown";

    [JsonProperty("confidence")]
    public string Confidence { get; set; } = "Medium";
}

internal sealed class EditorUdfDefinitionModel
{
    [JsonProperty("name")]
    public string Name { get; set; } = string.Empty;

    [JsonProperty("resourceType")]
    public string ResourceType { get; set; } = "Function";

    [JsonProperty("classification")]
    public string Classification { get; set; } = "FunctionResource";

    [JsonProperty("confidence")]
    public string Confidence { get; set; } = "Low";

    [JsonProperty("source")]
    public string Source { get; set; } = "FwdResource";

    [JsonProperty("definitionParsed")]
    public bool DefinitionParsed { get; set; }

    [JsonProperty("bodyParsed")]
    public bool BodyParsed { get; set; }

    [JsonProperty("fieldListParameters")]
    public List<string> FieldListParameters { get; } = new();

    [JsonProperty("fieldListParameterBindings")]
    public List<EditorUdfParameterBindingModel> FieldListParameterBindings { get; } = new();

    [JsonProperty("statusResults")]
    public List<string> StatusResults { get; } = new();

    [JsonProperty("internalRuleTree")]
    public EditorUdfInternalTreeModel InternalRuleTree { get; set; } = new();

    [JsonProperty("callerBindings")]
    public List<EditorUdfCallerBindingModel> CallerBindings { get; } = new();

    [JsonProperty("resourceEvidence")]
    public EditorResourceEvidenceModel ResourceEvidence { get; set; } = new();

    [JsonProperty("diagnostics")]
    public List<string> Diagnostics { get; } = new();
}

internal sealed class EditorUdfParameterBindingModel
{
    [JsonProperty("parameterName")]
    public string ParameterName { get; set; } = string.Empty;

    [JsonProperty("callerSlot")]
    public string CallerSlot { get; set; } = string.Empty;

    [JsonProperty("callerValue")]
    public string CallerValue { get; set; } = string.Empty;

    [JsonProperty("confidence")]
    public string Confidence { get; set; } = "Low";

    [JsonProperty("source")]
    public string Source { get; set; } = "CallerParameter";
}

internal sealed class EditorUdfInternalTreeModel
{
    [JsonProperty("parsed")]
    public bool Parsed { get; set; }

    [JsonProperty("candidateRuleNodes")]
    public List<EditorPrivateTreeHitModel> CandidateRuleNodes { get; } = new();

    [JsonProperty("diagnostics")]
    public List<string> Diagnostics { get; } = new();
}

internal sealed class EditorResourceEvidenceModel
{
    [JsonProperty("hasConfig")]
    public bool HasConfig { get; set; }

    [JsonProperty("hasPrivateTree")]
    public bool HasPrivateTree { get; set; }

    [JsonProperty("attributeHits")]
    public List<EditorResourceAttributeHitModel> AttributeHits { get; } = new();

    [JsonProperty("privateTreeHits")]
    public List<EditorPrivateTreeHitModel> PrivateTreeHits { get; } = new();
}

internal sealed class EditorResourceAttributeHitModel
{
    [JsonProperty("key")]
    public string Key { get; set; } = string.Empty;

    [JsonProperty("value")]
    public string Value { get; set; } = string.Empty;

    [JsonProperty("role")]
    public string Role { get; set; } = "Unknown";

    [JsonProperty("source")]
    public string Source { get; set; } = "ResourceAttribute";
}

internal sealed class EditorPrivateTreeHitModel
{
    [JsonProperty("path")]
    public string Path { get; set; } = string.Empty;

    [JsonProperty("name")]
    public string Name { get; set; } = string.Empty;

    [JsonProperty("valuePreview")]
    public string? ValuePreview { get; set; }

    [JsonProperty("role")]
    public string Role { get; set; } = "Unknown";

    [JsonProperty("confidence")]
    public string Confidence { get; set; } = "Medium";
}

internal sealed class EditorUdfCallerBindingModel
{
    [JsonProperty("scopeId")]
    public string ScopeId { get; set; } = string.Empty;

    [JsonProperty("ruleNodeId")]
    public string? RuleNodeId { get; set; }

    [JsonProperty("ruleGuid")]
    public string? RuleGuid { get; set; }

    [JsonProperty("ruleName")]
    public string? RuleName { get; set; }

    [JsonProperty("functionName")]
    public string? FunctionName { get; set; }

    [JsonProperty("bindingKind")]
    public string BindingKind { get; set; } = "DirectFunctionCall";

    [JsonProperty("parameters")]
    public Dictionary<string, List<string>> Parameters { get; } = new(StringComparer.OrdinalIgnoreCase);
}

internal sealed class EditorSelectionListDefinitionModel
{
    [JsonProperty("name")]
    public string Name { get; set; } = string.Empty;

    [JsonProperty("resourceType")]
    public string ResourceType { get; set; } = "Table";

    [JsonProperty("canonical")]
    public bool Canonical { get; set; }

    [JsonProperty("source")]
    public string Source { get; set; } = "FwdResource";

    [JsonProperty("confidence")]
    public string Confidence { get; set; } = "Low";

    [JsonProperty("schemaParsed")]
    public bool SchemaParsed { get; set; }

    [JsonProperty("optionsParsed")]
    public bool OptionsParsed { get; set; }

    [JsonProperty("matchFields")]
    public List<EditorSelectionListFieldModel> MatchFields { get; } = new();

    [JsonProperty("plugFields")]
    public List<EditorSelectionListFieldModel> PlugFields { get; } = new();

    [JsonProperty("options")]
    public List<EditorSelectionListOptionModel> Options { get; } = new();

    [JsonProperty("usageLinks")]
    public List<EditorSelectionListUsageModel> UsageLinks { get; } = new();

    [JsonProperty("resourceEvidence")]
    public EditorResourceEvidenceModel ResourceEvidence { get; set; } = new();

    [JsonProperty("runtimeImpacts")]
    public List<string> RuntimeImpacts { get; } = new();

    [JsonProperty("diagnostics")]
    public List<string> Diagnostics { get; } = new();
}

internal sealed class EditorSelectionListFieldModel
{
    [JsonProperty("name")]
    public string Name { get; set; } = string.Empty;

    [JsonProperty("role")]
    public string Role { get; set; } = "UsageDerivedField";

    [JsonProperty("hits")]
    public int Hits { get; set; }

    [JsonProperty("confidence")]
    public string Confidence { get; set; } = "Medium";
}

internal sealed class EditorSelectionListOptionModel
{
    [JsonProperty("name")]
    public string Name { get; set; } = string.Empty;

    [JsonProperty("value")]
    public string Value { get; set; } = string.Empty;

    [JsonProperty("role")]
    public string Role { get; set; } = "Unknown";

    [JsonProperty("confidence")]
    public string Confidence { get; set; } = "Medium";

    [JsonProperty("source")]
    public string Source { get; set; } = "ResourceConfig";
}

internal sealed class EditorSelectionListUsageModel
{
    [JsonProperty("scopeId")]
    public string ScopeId { get; set; } = string.Empty;

    [JsonProperty("ruleNodeId")]
    public string? RuleNodeId { get; set; }

    [JsonProperty("ruleGuid")]
    public string? RuleGuid { get; set; }

    [JsonProperty("ruleName")]
    public string? RuleName { get; set; }

    [JsonProperty("functionName")]
    public string? FunctionName { get; set; }

    [JsonProperty("relationshipKind")]
    public string RelationshipKind { get; set; } = string.Empty;
}

internal sealed class EditorRuntimeImpactModel
{
    [JsonProperty("impactId")]
    public string ImpactId { get; set; } = string.Empty;

    [JsonProperty("impactType")]
    public string ImpactType { get; set; } = string.Empty;

    [JsonProperty("scopeId")]
    public string ScopeId { get; set; } = string.Empty;

    [JsonProperty("ruleNodeId")]
    public string? RuleNodeId { get; set; }

    [JsonProperty("ruleName")]
    public string? RuleName { get; set; }

    [JsonProperty("functionName")]
    public string? FunctionName { get; set; }

    [JsonProperty("summary")]
    public string Summary { get; set; } = string.Empty;

    [JsonProperty("evidence")]
    public string Evidence { get; set; } = string.Empty;

    [JsonProperty("confidence")]
    public string Confidence { get; set; } = "Medium";

    [JsonProperty("behaviorFlags")]
    public List<string> BehaviorFlags { get; } = new();

    [JsonProperty("configuredStatusResults")]
    public List<string> ConfiguredStatusResults { get; } = new();

    [JsonProperty("parameters")]
    public Dictionary<string, List<string>> Parameters { get; } = new(StringComparer.OrdinalIgnoreCase);

    [JsonProperty("relationshipTargets")]
    public List<EditorReferenceModel> RelationshipTargets { get; } = new();

    [JsonProperty("selectionListOptions")]
    public List<EditorSelectionListOptionModel> SelectionListOptions { get; } = new();

    [JsonProperty("notProven")]
    public string NotProven { get; set; } = "Static configuration evidence only; native runtime execution was not simulated.";
}

internal static class FormWorksEditorModelBuilder
{
    private static readonly string[] UdfResourceTypes = { "Function", "UDF", "UserDefinedFunction", "User Defined" };

    public static FormWorksEditorModel Build(WorkbenchSnapshot snapshot)
    {
        var model = new FormWorksEditorModel();
        model.ObjectGraph = BuildObjectGraph(snapshot);
        model.RuleLists.AddRange(BuildRuleLists(snapshot));
        model.UdfDefinitions.AddRange(BuildUdfDefinitions(snapshot));
        model.SelectionListDefinitions.AddRange(BuildSelectionListDefinitions(snapshot));
        model.RuntimeImpacts.AddRange(BuildRuntimeImpacts(snapshot, model.SelectionListDefinitions));
        model.Diagnostics.AddRange(BuildDiagnostics(model));
        model.NotProven.Add("The workbench does not write to FWD configuration.");
        model.NotProven.Add("Native AC runtime execution and AC Rules Tester outcomes are not simulated.");
        model.NotProven.Add("UDF bodies and SelectionList schemas are exposed as canonical candidates until private resource payloads are fully parsed.");
        return model;
    }

    private static FwdObjectGraphModel BuildObjectGraph(WorkbenchSnapshot snapshot)
    {
        var graph = new FwdObjectGraphModel();
        AddNode(graph, "fwd:" + SafeId(snapshot.FwdPath), "FwdRoot", snapshot.FwdPath, "FwdInspectionReport", "High");

        foreach (string document in Distinct(snapshot.Fwd.Documents))
            AddObject(graph, "Document", document, "Fwd.Documents", "containsDocument");

        foreach (string page in Distinct(snapshot.Fwd.Pages))
            AddObject(graph, "Page", page, "Fwd.Pages", "containsPage");

        foreach (string batch in Distinct(snapshot.Fwd.Batches))
            AddObject(graph, "Batch", batch, "Fwd.Batches", "containsBatch");

        foreach (string process in Distinct(snapshot.Fwd.Processes))
            AddObject(graph, "Process", process, "Fwd.Processes", "containsProcess");

        foreach (PageVariantBucket bucket in snapshot.Fwd.PageVariants)
        {
            string pageId = ObjectId("Page", bucket.Page);
            EnsureObject(graph, "Page", bucket.Page, "Fwd.PageVariants", "Medium");
            foreach (string variant in Distinct(bucket.Variants))
            {
                string id = ObjectId("PageVariant", bucket.Page + "/" + variant);
                AddNode(graph, id, "PageVariant", variant, "Fwd.PageVariants", "High");
                AddEdge(graph, pageId, id, "hasVariant", "Fwd.PageVariants", "High");
            }
        }

        foreach (FieldBucket bucket in snapshot.Fwd.Fields)
        {
            string ownerKind = string.IsNullOrWhiteSpace(bucket.ScopeType) ? "Scope" : bucket.ScopeType;
            string ownerId = ObjectId(ownerKind, bucket.ScopeName);
            EnsureObject(graph, ownerKind, bucket.ScopeName, "Fwd.Fields", "Medium");
            foreach (FieldSummary field in bucket.Fields)
            {
                string id = ObjectId("Field", bucket.ScopeType + "/" + bucket.ScopeName + "/" + field.Name);
                AddNode(graph, id, "Field", field.Name, "Fwd.Fields", "High", n =>
                {
                    n.Metadata["scopeType"] = bucket.ScopeType;
                    n.Metadata["scopeName"] = bucket.ScopeName;
                    n.Metadata["fieldType"] = field.Type;
                    n.Metadata["geometry"] = field.Geometry;
                    n.Metadata["subfieldCount"] = field.SubfieldCount;
                });
                AddEdge(graph, ownerId, id, "hasField", "Fwd.Fields", "High");
            }
        }

        foreach (ResourceBucket bucket in snapshot.Fwd.Resources)
        {
            foreach (string name in Distinct(bucket.Names))
            {
                string id = ObjectId("Resource:" + bucket.Type, name);
                ResourceDetail? detail = FindResourceDetail(snapshot.Fwd, bucket.Type, name);
                AddNode(graph, id, "Resource", name, "Fwd.Resources", "High", n =>
                {
                    n.Metadata["resourceType"] = bucket.Type;
                    n.Metadata["hasConfig"] = detail != null && (detail.FullAttributes.Count > 0 || detail.PublicAttributes.Count > 0);
                    n.Metadata["hasPrivateTree"] = detail?.PrivateTree != null;
                    n.Metadata["category"] = detail?.Category;
                });
                AddEdge(graph, "fwd:" + SafeId(snapshot.FwdPath), id, "hasResource", "Fwd.Resources", "High");
                if (detail?.PrivateTree != null)
                    AddPrivateTreeNodes(graph, id, detail.PrivateTree, bucket.Type, name);
            }
        }

        foreach (ScopeModel scope in snapshot.ScopesById.Values)
        {
            string id = ObjectId("RuleList", scope.ScopeId);
            AddNode(graph, id, "RuleList", scope.Name, "AcTreeReport.Scope", "High", n =>
            {
                n.Metadata["scopeId"] = scope.ScopeId;
                n.Metadata["kind"] = scope.Kind;
                n.Metadata["structuralRuleCount"] = scope.StructuralRuleCount;
                n.Metadata["flatInventoryCount"] = scope.FlatInventoryCount;
            });
            AddEdge(graph, "fwd:" + SafeId(snapshot.FwdPath), id, "hasRuleList", "AcTreeReport.Scope", "High");
        }

        graph.Diagnostics.Add("Object graph is a read-only projection over extracted FWD lists, resources, fields, and AC rule scopes.");
        return graph;
    }

    private static IEnumerable<EditorRuleListModel> BuildRuleLists(WorkbenchSnapshot snapshot)
    {
        foreach (ScopeModel scope in snapshot.ScopesById.Values.OrderBy(s => s.ScopeId, StringComparer.OrdinalIgnoreCase))
        {
            var ruleList = new EditorRuleListModel
            {
                RuleListId = scope.ScopeId,
                Name = scope.Name,
                Kind = scope.Kind,
                StructuralRuleCount = scope.StructuralRuleCount,
                FlatInventoryCount = scope.FlatInventoryCount
            };

            if (scope.StructuralCoverageFailure)
                ruleList.Diagnostics.Add("StructuralCoverageFailure");
            if (scope.FlatOnlyCount > 0)
                ruleList.Diagnostics.Add("FlatInventoryRowsWithoutStructuralMatch");

            foreach (AcTreeNode node in scope.StructuralNodes.Where(n => n.IsRuleNode).OrderBy(n => n.RuleIndexWithinScope))
                ruleList.RuleConfigurations.Add(BuildRuleConfiguration(snapshot, scope, node));

            yield return ruleList;
        }
    }

    private static EditorRuleConfigurationModel BuildRuleConfiguration(WorkbenchSnapshot snapshot, ScopeModel scope, AcTreeNode node)
    {
        string nodeId = RuleCorrelation.NodeId(node);
        snapshot.RulesByNodeId.TryGetValue(nodeId, out RuleModel? rule);
        AcTreeEdge? incoming = scope.StructuralEdges.FirstOrDefault(e => e.ToNodeId == node.NodeId);
        var config = new EditorRuleConfigurationModel
        {
            NodeId = nodeId,
            RuleGuid = node.RuleGuid,
            RuleId = node.RuleId,
            Name = node.RuleName,
            FunctionName = node.FunctionName,
            Ordinal = node.RuleIndexWithinScope,
            Depth = node.HierarchyLevel,
            ParentRuleNodeId = node.ParentNodeId > 0 ? "node-" + node.ParentNodeId.ToString("000000") : null,
            IncomingStatusResult = incoming == null ? null : BuildStatusResult(incoming, "ParentRuleStatusResultOwnsSubList"),
            DisabledState = string.IsNullOrWhiteSpace(node.DisabledState) ? AcDisabledStates.Enabled : node.DisabledState,
            DisabledAuthority = rule?.DisabledAuthority ?? "Structural",
            FunctionSchema = BuildFunctionSchema(node, rule)
        };

        CopyDictionary(node.Parameters, config.Parameters);
        foreach (KeyValuePair<string, string> attribute in node.Attributes)
            config.Attributes[attribute.Key] = attribute.Value;

        string structuralKey = RuleCorrelation.StructuralKey(node);
        int flatInventoryMatchCount = snapshot.Rules.Rules.Count(r => RuleCorrelation.Eq(RuleCorrelation.FlatKey(r), structuralKey));
        if (flatInventoryMatchCount == 0)
            config.Diagnostics.Add("FlatInventoryMatchUnavailable");
        else if (flatInventoryMatchCount > 1)
            config.Diagnostics.Add("AmbiguousFlatInventoryMatches:" + flatInventoryMatchCount.ToString());

        AddSourceHandles(config, scope, node, rule);
        if (rule?.FlatRule == null && flatInventoryMatchCount > 1)
        {
            config.SourceHandles.Add(new EditorSourceHandleModel
            {
                Source = "AcRuleReport.Rules",
                Path = structuralKey,
                Authority = "Multiple flat inventory rows matched this structural Rule; flat ActionNames and raw parameter tokens were not promoted as authoritative.",
                Confidence = "Low"
            });
        }
        else if (rule?.FlatRule == null)
        {
            config.SourceHandles.Add(new EditorSourceHandleModel
            {
                Source = "AcRuleReport.Rules",
                Path = structuralKey,
                Authority = "No unique flat inventory row matched this structural Rule.",
                Confidence = "Low"
            });
        }

        foreach (IGrouping<int, AcTreeEdge> group in scope.StructuralEdges.Where(e => e.FromNodeId == node.NodeId).GroupBy(e => e.ActionListIndex).OrderBy(g => g.Key))
        {
            var actionList = new EditorActionListModel { StatusResult = BuildStatusResult(group.First(), "StatusResultOwnsActionList") };
            foreach (AcTreeEdge edge in group.OrderBy(e => e.ToNodeId))
                actionList.ChildRuleNodeIds.Add("node-" + edge.ToNodeId.ToString("000000"));
            config.ActionLists.Add(actionList);
        }

        if (rule != null)
        {
            AddRejects(config, rule);
            config.References.AddRange(rule.Relationships.Select(r => new EditorReferenceModel
            {
                Kind = r.Kind,
                TargetType = r.TargetType,
                Target = r.Target,
                ParameterRole = r.ParameterRole,
                Confidence = r.Confidence
            }));
        }

        return config;
    }

    private static EditorFunctionSchemaModel BuildFunctionSchema(AcTreeNode node, RuleModel? rule)
    {
        string functionName = node.FunctionName ?? rule?.FlatRule?.FunctionName ?? string.Empty;
        bool defined = AcFunctionCatalog.TryGetDefinition(functionName, out AcFunctionCatalog.FunctionDefinition? definition);
        var schema = new EditorFunctionSchemaModel
        {
            Name = string.IsNullOrWhiteSpace(functionName) ? null : functionName,
            Defined = defined,
            Category = defined ? definition.Category : AcFunctionCatalog.InferCategory(functionName),
            Evidence = defined ? definition.Evidence : "Observed static rule configuration"
        };

        foreach (string value in Distinct((definition?.StatusResults ?? Array.Empty<string>()).Concat(node.ActionNames).Concat(rule?.FlatRule?.ActionNames ?? Enumerable.Empty<string>())))
            schema.StatusResults.Add(value);
        foreach (string value in Distinct(node.ActionNames.Concat(rule?.FlatRule?.ActionNames ?? Enumerable.Empty<string>())))
            schema.ConfiguredStatusResults.Add(value);
        foreach (string value in Distinct(definition?.ParameterRoles ?? Array.Empty<string>()))
            schema.ParameterRoles.Add(value);
        foreach (string value in Distinct(defined ? definition.BehaviorFlags : InferBehaviorFlags(functionName, rule?.Relationships ?? Enumerable.Empty<AcRuleRelationship>())))
            schema.BehaviorFlags.Add(value);
        foreach (string value in Distinct(defined ? definition.RuntimeImpacts : InferRuntimeImpacts(functionName, schema.BehaviorFlags, rule?.Relationships ?? Enumerable.Empty<AcRuleRelationship>())))
            schema.RuntimeImpacts.Add(value);

        return schema;
    }

    private static void AddRejects(EditorRuleConfigurationModel config, RuleModel rule)
    {
        foreach (AcRuleRelationship relationship in rule.Relationships.Where(r =>
            RuleCorrelation.Eq(r.TargetType, "RejectMessage") ||
            RuleCorrelation.Eq(r.TargetType, "RejectCode") ||
            RuleCorrelation.Contains(r.Kind, "Reject")))
        {
            var reject = new EditorRejectModel
            {
                Kind = relationship.Kind,
                Target = relationship.Target,
                ParameterName = relationship.ParameterName,
                Confidence = relationship.Confidence,
                Evidence = relationship.Evidence ?? relationship.RelationshipReason
            };

            if (RuleCorrelation.Eq(relationship.TargetType, "RejectMessage"))
                reject.Message = relationship.Target;
            if (RuleCorrelation.Eq(relationship.TargetType, "RejectCode"))
                reject.Code = relationship.Target;

            config.Rejects.Add(reject);
        }
    }

    private static void AddSourceHandles(EditorRuleConfigurationModel config, ScopeModel scope, AcTreeNode node, RuleModel? rule)
    {
        config.SourceHandles.Add(new EditorSourceHandleModel
        {
            Source = "AcTreeReport.Nodes",
            Path = scope.ScopeId + "/TreeNode[" + node.NodeId.ToString() + "]",
            Authority = "Hierarchy, status-result branch ownership, disabled state, parameters, and attributes",
            Confidence = "High"
        });

        if (rule?.FlatRule != null)
        {
            config.SourceHandles.Add(new EditorSourceHandleModel
            {
                Source = "AcRuleReport.Rules",
                Path = RuleCorrelation.InventoryId(rule.FlatRule),
                Authority = "Flat inventory reconciliation, configured ActionNames, and raw parameter tokens",
                Confidence = "High"
            });
        }

        if (rule?.Relationships.Count > 0)
        {
            config.SourceHandles.Add(new EditorSourceHandleModel
            {
                Source = "AcRelationshipReport.Relationships",
                Path = scope.ScopeId + "/Rule[" + node.RuleIndexWithinScope.ToString() + "]",
                Authority = "Static field/table/attribute/reject/resource references",
                Confidence = "Medium"
            });
        }
    }

    private static IEnumerable<EditorUdfDefinitionModel> BuildUdfDefinitions(WorkbenchSnapshot snapshot)
    {
        var resources = snapshot.Fwd.Resources
            .Where(b => UdfResourceTypes.Any(t => RuleCorrelation.Eq(t, b.Type)))
            .SelectMany(b => b.Names.Select(n => new { type = b.Type, name = (n ?? string.Empty).Trim() }))
            .Where(x => !string.IsNullOrWhiteSpace(x.name))
            .GroupBy(x => x.name, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Select(x => x.type).FirstOrDefault() ?? "Function", StringComparer.OrdinalIgnoreCase);

        foreach (string observed in snapshot.Rules.Rules.Select(r => r.FunctionName).Where(n => LooksLikeUdfName(n)).Select(n => n!.Trim()))
            if (!resources.ContainsKey(observed))
                resources[observed] = "ObservedFunctionUsage";

        foreach (string referenced in snapshot.Rules.Rules
            .Where(r => LooksLikeUdfIterator(r.FunctionName))
            .SelectMany(r => r.Parameters.Values.SelectMany(v => v))
            .Where(v => !string.IsNullOrWhiteSpace(v) && LooksLikeIdentifier(v)))
        {
            if (!resources.ContainsKey(referenced.Trim()))
                resources[referenced.Trim()] = "IteratorParameter";
        }

        foreach (KeyValuePair<string, string> resource in resources.OrderBy(x => x.Key, StringComparer.OrdinalIgnoreCase))
        {
            ResourceDetail? detail = FindResourceDetail(snapshot.Fwd, resource.Value, resource.Key) ?? FindResourceDetailByName(snapshot.Fwd, resource.Key);
            var definition = new EditorUdfDefinitionModel
            {
                Name = resource.Key,
                ResourceType = resource.Value,
                Classification = detail != null ? "CandidateUdfDefinition" : RuleCorrelation.Eq(resource.Value, "ObservedFunctionUsage") || RuleCorrelation.Eq(resource.Value, "IteratorParameter") ? "RuleUsageOnly" : "FunctionResource",
                Confidence = detail?.PrivateTree != null ? "High" : detail != null ? "Medium" : RuleCorrelation.Eq(resource.Value, "Function") ? "Low" : "Medium",
                Source = detail != null ? "FwdResourceConfig" : RuleCorrelation.Eq(resource.Value, "ObservedFunctionUsage") || RuleCorrelation.Eq(resource.Value, "IteratorParameter") ? "RuleUsage" : "FwdResource"
            };

            definition.ResourceEvidence = BuildResourceEvidence(detail, "Udf");
            foreach (string parameter in ExtractFieldListNames(definition.ResourceEvidence))
                definition.FieldListParameters.Add(parameter);
            foreach (string status in ExtractStatusResultNames(definition.ResourceEvidence))
                definition.StatusResults.Add(status);
            foreach (EditorPrivateTreeHitModel hit in definition.ResourceEvidence.PrivateTreeHits.Where(h => h.Role == "RuleNode" || h.Role == "RuleBody"))
                definition.InternalRuleTree.CandidateRuleNodes.Add(hit);
            definition.InternalRuleTree.Parsed = definition.InternalRuleTree.CandidateRuleNodes.Count > 0;

            var callers = FindUdfCallers(snapshot, resource.Key).ToList();
            foreach (EditorUdfCallerBindingModel caller in callers)
                definition.CallerBindings.Add(caller);

            foreach (string parameter in Distinct(callers.SelectMany(c => c.Parameters.Keys)).Where(p => !IsGenericParamListName(p)))
                if (!definition.FieldListParameters.Contains(parameter, StringComparer.OrdinalIgnoreCase))
                    definition.FieldListParameters.Add(parameter);

            foreach (string status in Distinct(snapshot.Rules.Rules.Where(r => RuleCorrelation.Eq(r.FunctionName, resource.Key)).SelectMany(r => r.ActionNames)))
                if (!definition.StatusResults.Contains(status, StringComparer.OrdinalIgnoreCase))
                    definition.StatusResults.Add(status);

            AddUdfParameterBindings(definition);

            definition.DefinitionParsed = definition.ResourceEvidence.AttributeHits.Any(h => h.Role == "FieldListParameter" || h.Role == "StatusResult")
                || definition.ResourceEvidence.PrivateTreeHits.Any(h => h.Role == "FieldListParameter" || h.Role == "StatusResult");
            definition.BodyParsed = definition.InternalRuleTree.Parsed;
            if (!definition.DefinitionParsed)
                definition.Diagnostics.Add("UdfDefinitionNotParsed");
            if (!definition.BodyParsed)
                definition.Diagnostics.Add("UdfBodyNotParsed");
            if (definition.FieldListParameters.Count == 0)
                definition.Diagnostics.Add("NamedFieldListParametersUnavailable");
            if (detail == null)
                definition.Diagnostics.Add("ResourceDetailsUnavailable");

            yield return definition;
        }
    }

    private static EditorResourceEvidenceModel BuildResourceEvidence(ResourceDetail? detail, string resourceKind)
    {
        var evidence = new EditorResourceEvidenceModel
        {
            HasConfig = detail != null && (detail.FullAttributes.Count > 0 || detail.PublicAttributes.Count > 0),
            HasPrivateTree = detail?.PrivateTree != null
        };

        if (detail == null)
            return evidence;

        foreach (ResourceAttrEntry attr in detail.FullAttributes.Concat(detail.PublicAttributes))
        {
            string role = ClassifyResourceEvidenceRole(attr.Key, attr.Value, resourceKind);
            if (role == "Unknown")
                continue;

            evidence.AttributeHits.Add(new EditorResourceAttributeHitModel
            {
                Key = attr.Key,
                Value = attr.Value,
                Role = role,
                Source = "ResourceConfig"
            });
        }

        if (detail.PrivateTree != null)
        {
            foreach (EditorPrivateTreeHitModel hit in WalkPrivateTreeHits(detail.PrivateTree, resourceKind))
                evidence.PrivateTreeHits.Add(hit);
        }

        return evidence;
    }

    private static IEnumerable<EditorPrivateTreeHitModel> WalkPrivateTreeHits(ResourcePrivateNode node, string resourceKind)
    {
        string role = ClassifyResourceEvidenceRole(node.Name + " " + node.Path, node.ValuePreview ?? string.Empty, resourceKind);
        if (role != "Unknown")
        {
            yield return new EditorPrivateTreeHitModel
            {
                Path = node.Path,
                Name = node.Name,
                ValuePreview = node.ValuePreview,
                Role = role,
                Confidence = string.IsNullOrWhiteSpace(node.ValuePreview) ? "Medium" : "High"
            };
        }

        foreach (ResourcePrivateNode child in node.Children)
        {
            foreach (EditorPrivateTreeHitModel hit in WalkPrivateTreeHits(child, resourceKind))
                yield return hit;
        }
    }

    private static string ClassifyResourceEvidenceRole(string key, string value, string resourceKind)
    {
        string probe = ((key ?? string.Empty) + " " + (value ?? string.Empty)).ToLowerInvariant();
        if (probe.Contains("fieldlist") || probe.Contains("field list") || probe.Contains("paramlist") || probe.Contains("parameter"))
            return "FieldListParameter";
        if (probe.Contains("status result") || probe.Contains("statusresult") || probe.Contains("return code") || probe.Contains("actionname"))
            return "StatusResult";
        if (resourceKind == "Udf" && (probe.Contains("rule body") || probe.Contains("udf body") || probe.Contains("function body") || probe.Contains("private body")))
            return "RuleBody";
        if (probe.Contains("rule tree") || probe.Contains("rulelist") || probe.Contains("rule list") || (resourceKind == "Udf" && probe.Contains("rule")))
            return "RuleNode";
        if (probe.Contains("reject") && (probe.Contains("outcome") || probe.Contains("action") || probe.Contains("result") || probe.Contains("code")))
            return "RejectOutcome";
        if (probe.Contains("plug") && (probe.Contains("outcome") || probe.Contains("action") || probe.Contains("result")))
            return "PlugOutcome";
        if (probe.Contains("match") && (probe.Contains("field") || probe.Contains("column")))
            return "MatchField";
        if ((probe.Contains("plug") || probe.Contains("output") || probe.Contains("destination")) && (probe.Contains("field") || probe.Contains("column")))
            return "PlugField";
        if (probe.Contains("persist") || probe.Contains("keep") || probe.Contains("retain"))
            return "Persistence";
        if (probe.Contains("rerun") || probe.Contains("changed") || probe.Contains("trigger"))
            return "RerunTrigger";
        if (probe.Contains("popup") || probe.Contains("prompt") || probe.Contains("keyer") || probe.Contains("selection"))
            return "OperatorPrompt";
        if (probe.Contains("no good match") || probe.Contains("nogoodmatch") || probe.Contains("no match"))
            return "NoGoodMatch";
        if (probe.Contains("enter"))
            return "EnterBehavior";
        if (probe.Contains("table") || probe.Contains("selectionlist") || probe.Contains("selection list"))
            return "TableOption";
        return "Unknown";
    }

    private static IEnumerable<string> ExtractFieldListNames(EditorResourceEvidenceModel evidence)
    {
        return Distinct(evidence.AttributeHits.Where(h => h.Role == "FieldListParameter").SelectMany(h => ExtractNamesFromText(h.Key + " " + h.Value))
            .Concat(evidence.PrivateTreeHits.Where(h => h.Role == "FieldListParameter").SelectMany(h => ExtractNamesFromText(h.Name + " " + h.ValuePreview))));
    }

    private static IEnumerable<string> ExtractStatusResultNames(EditorResourceEvidenceModel evidence)
    {
        return Distinct(evidence.AttributeHits.Where(h => h.Role == "StatusResult").SelectMany(h => ExtractNamesFromText(h.Key + " " + h.Value))
            .Concat(evidence.PrivateTreeHits.Where(h => h.Role == "StatusResult").SelectMany(h => ExtractNamesFromText(h.Name + " " + h.ValuePreview))));
    }

    private static IEnumerable<string> ExtractNamesFromText(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
            yield break;

        foreach (Match match in Regex.Matches(text, @"[A-Za-z][A-Za-z0-9_]{1,80}"))
        {
            string value = match.Value.Trim();
            if (IsNoiseName(value))
                continue;
            yield return value;
        }
    }

    private static bool IsNoiseName(string value)
    {
        return Regex.IsMatch(value, "^(fieldlist|fieldlistparameters|field|fields|list|parameter|parameters|paramlist|status|statusresults|result|return|code|rule|rules|table|selectionlist|selection|match|matches|matchfields|plug|plugs|plugfields|option|options|true|false|null)$", RegexOptions.IgnoreCase);
    }

    private static void AddUdfParameterBindings(EditorUdfDefinitionModel definition)
    {
        List<string> namedParameters = definition.FieldListParameters
            .Where(p => !IsGenericParamListName(p))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(p => p, StringComparer.OrdinalIgnoreCase)
            .ToList();

        foreach (EditorUdfCallerBindingModel caller in definition.CallerBindings)
        {
            int ordinal = 0;
            foreach (KeyValuePair<string, List<string>> slot in caller.Parameters.OrderBy(p => p.Key, StringComparer.OrdinalIgnoreCase))
            {
                foreach (string value in slot.Value)
                {
                    string mapped = namedParameters.Count > ordinal
                        ? namedParameters[ordinal]
                        : IsGenericParamListName(slot.Key) ? "Parameter " + ordinal.ToString() : slot.Key;
                    definition.FieldListParameterBindings.Add(new EditorUdfParameterBindingModel
                    {
                        ParameterName = mapped,
                        CallerSlot = slot.Key,
                        CallerValue = value,
                        Confidence = namedParameters.Count > ordinal ? "Medium" : IsGenericParamListName(slot.Key) ? "Low" : "Medium",
                        Source = namedParameters.Count > ordinal ? "ResourceInterfaceOrdinal+CallerParameter" : "CallerParameter"
                    });
                }

                ordinal++;
            }
        }
    }

    private static IEnumerable<EditorUdfCallerBindingModel> FindUdfCallers(WorkbenchSnapshot snapshot, string udfName)
    {
        foreach (AcRuleSummary rule in snapshot.Rules.Rules.Where(r => RuleCorrelation.Eq(r.FunctionName, udfName)))
            yield return BuildUdfCaller(snapshot, rule, "DirectFunctionCall");

        foreach (AcRuleSummary rule in snapshot.Rules.Rules.Where(r => LooksLikeUdfIterator(r.FunctionName) && r.Parameters.Any(p => p.Value.Any(v => RuleCorrelation.Eq(v, udfName)))))
            yield return BuildUdfCaller(snapshot, rule, "IteratorWrapperCall");
    }

    private static EditorUdfCallerBindingModel BuildUdfCaller(WorkbenchSnapshot snapshot, AcRuleSummary rule, string bindingKind)
    {
        string scopeId = RuleCorrelation.ScopeId(rule);
        snapshot.RulesByStructuralKey.TryGetValue(RuleCorrelation.FlatKey(rule), out RuleModel? model);
        var caller = new EditorUdfCallerBindingModel
        {
            ScopeId = scopeId,
            RuleNodeId = model?.NodeId,
            RuleGuid = rule.RuleGuid,
            RuleName = rule.RuleName,
            FunctionName = rule.FunctionName,
            BindingKind = bindingKind
        };
        CopyDictionary(rule.Parameters, caller.Parameters);
        return caller;
    }

    private static IEnumerable<EditorSelectionListDefinitionModel> BuildSelectionListDefinitions(WorkbenchSnapshot snapshot)
    {
        var names = new Dictionary<string, EditorSelectionListDefinitionModel>(StringComparer.OrdinalIgnoreCase);
        foreach (ResourceBucket bucket in snapshot.Fwd.Resources.Where(b => RuleCorrelation.Eq(b.Type, "Table") || RuleCorrelation.Contains(b.Type, "SelectionList")))
        {
            foreach (string tableName in Distinct(bucket.Names).Where(LooksLikeTableIdentifier))
            {
                ResourceDetail? detail = FindResourceDetail(snapshot.Fwd, bucket.Type, tableName);
                var definition = new EditorSelectionListDefinitionModel
                {
                    Name = tableName,
                    ResourceType = bucket.Type,
                    Canonical = true,
                    Source = "FwdResource",
                    Confidence = "High",
                    ResourceEvidence = BuildResourceEvidence(detail, "SelectionList")
                };
                ApplySelectionListResourceEvidence(definition);
                names[tableName] = definition;
            }
        }

        var relationshipIndex = snapshot.Relationships.Relationships
            .GroupBy(RelationshipRuleKey, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.ToList(), StringComparer.OrdinalIgnoreCase);

        foreach (AcRuleRelationship relationship in snapshot.Relationships.Relationships)
        {
            string tableName = (relationship.Target ?? string.Empty).Trim();
            if (!LooksLikeTableRelationship(relationship, tableName))
                continue;

            if (!names.TryGetValue(tableName, out EditorSelectionListDefinitionModel? definition))
            {
                definition = new EditorSelectionListDefinitionModel
                {
                    Name = tableName,
                    ResourceType = "Inferred",
                    Canonical = false,
                    Source = "InferredFromRuleRelationship",
                    Confidence = "Low"
                };
                names[tableName] = definition;
            }

            string ruleKey = RelationshipRuleKey(relationship);
            relationshipIndex.TryGetValue(ruleKey, out List<AcRuleRelationship>? peers);
            peers ??= new List<AcRuleRelationship>();
            AddSelectionListUsage(snapshot, definition, relationship);
            foreach (AcRuleRelationship peer in peers)
                AddSelectionListField(definition, peer, tableName);
        }

        foreach (EditorSelectionListDefinitionModel definition in names.Values)
        {
            definition.RuntimeImpacts.Add("May prompt operator selection, plug configured fields, or route to no-match/reject action lists depending on configured status results.");
            definition.SchemaParsed = definition.ResourceEvidence.AttributeHits.Any(h => h.Role == "MatchField" || h.Role == "PlugField")
                || definition.ResourceEvidence.PrivateTreeHits.Any(h => h.Role == "MatchField" || h.Role == "PlugField");
            definition.OptionsParsed = definition.Options.Count > 0;
            if (!definition.SchemaParsed)
                definition.Diagnostics.Add("SelectionListSchemaNotParsed");
            if (!definition.OptionsParsed)
                definition.Diagnostics.Add("SelectionListOptionsNotParsed");
            if (definition.MatchFields.Count == 0)
                definition.Diagnostics.Add("MatchFieldsUsageDerivedOrUnavailable");
            if (definition.PlugFields.Count == 0)
                definition.Diagnostics.Add("PlugFieldsUsageDerivedOrUnavailable");
        }

        return names.Values.OrderByDescending(t => t.UsageLinks.Count).ThenBy(t => t.Name, StringComparer.OrdinalIgnoreCase);
    }

    private static IEnumerable<EditorRuntimeImpactModel> BuildRuntimeImpacts(WorkbenchSnapshot snapshot, IEnumerable<EditorSelectionListDefinitionModel> selectionLists)
    {
        int ordinal = 0;
        foreach (RuleModel rule in snapshot.RulesByNodeId.Values.OrderBy(r => r.ScopeId, StringComparer.OrdinalIgnoreCase).ThenBy(r => r.Node.RuleIndexWithinScope))
        {
            string functionName = rule.Node.FunctionName ?? rule.FlatRule?.FunctionName ?? string.Empty;
            if (string.IsNullOrWhiteSpace(functionName))
                continue;

            AcFunctionCatalog.TryGetDefinition(functionName, out AcFunctionCatalog.FunctionDefinition? definition);
            List<string> flags = definition == null ? InferBehaviorFlags(functionName, rule.Relationships) : definition.BehaviorFlags.ToList();
            List<string> impacts = definition == null ? InferRuntimeImpacts(functionName, flags, rule.Relationships) : definition.RuntimeImpacts.ToList();
            foreach (string impact in impacts.DefaultIfEmpty("Static rule usage was observed; inspect parameters and status results before inferring runtime impact."))
            {
                string impactType = InferImpactType(functionName, flags, impact, rule.Relationships);
                var model = new EditorRuntimeImpactModel
                {
                    ImpactId = "impact-" + (++ordinal).ToString("000000"),
                    ImpactType = impactType,
                    ScopeId = rule.ScopeId,
                    RuleNodeId = rule.NodeId,
                    RuleName = rule.Node.RuleName,
                    FunctionName = functionName,
                    Summary = impact,
                    Evidence = definition == null ? "Observed rule/function/relationship evidence" : definition.Evidence,
                    Confidence = definition == null ? "Medium" : "High"
                };
                foreach (string flag in flags)
                    model.BehaviorFlags.Add(flag);
                foreach (string status in Distinct(rule.Node.ActionNames.Concat(rule.FlatRule?.ActionNames ?? Enumerable.Empty<string>())))
                    model.ConfiguredStatusResults.Add(status);
                CopyDictionary(rule.Node.Parameters.Count > 0 ? rule.Node.Parameters : rule.FlatRule?.Parameters ?? new Dictionary<string, List<string>>(), model.Parameters);
                foreach (AcRuleRelationship relationship in rule.Relationships)
                {
                    model.RelationshipTargets.Add(new EditorReferenceModel
                    {
                        Kind = relationship.Kind,
                        TargetType = relationship.TargetType,
                        Target = relationship.Target,
                        ParameterRole = relationship.ParameterRole,
                        Confidence = relationship.Confidence
                    });
                }

                yield return model;
            }
        }

        foreach (EditorSelectionListDefinitionModel table in selectionLists.Where(t => t.UsageLinks.Count > 0))
        {
            var model = new EditorRuntimeImpactModel
            {
                ImpactId = "impact-" + (++ordinal).ToString("000000"),
                ImpactType = "SelectionListLookup",
                ScopeId = table.UsageLinks.First().ScopeId,
                RuleNodeId = table.UsageLinks.First().RuleNodeId,
                RuleName = table.UsageLinks.First().RuleName,
                FunctionName = table.UsageLinks.First().FunctionName,
                Summary = "SelectionList/table usage can prompt operator selection, no-good-match behavior, or field plugging depending on configuration.",
                Evidence = table.Source,
                Confidence = table.Canonical ? "High" : "Low"
            };
            foreach (string flag in new[] { "UsesTable", "MayPromptOperator", "MayPlugFields", "MayRouteNoGoodMatch" })
                model.BehaviorFlags.Add(flag);
            foreach (EditorSelectionListOptionModel option in table.Options)
                model.SelectionListOptions.Add(option);
            yield return model;
        }
    }

    private static IEnumerable<string> BuildDiagnostics(FormWorksEditorModel model)
    {
        if (model.UdfDefinitions.Any(u => !u.DefinitionParsed))
            yield return "UdfDefinitionBodiesNotParsed";
        if (model.SelectionListDefinitions.Any(t => !t.SchemaParsed))
            yield return "SelectionListSchemasNotParsed";
        yield return "RuntimeImpactsAreStaticConfigurationEvidence";
    }

    private static void AddObject(FwdObjectGraphModel graph, string kind, string name, string source, string edgeKind)
    {
        string id = ObjectId(kind, name);
        AddNode(graph, id, kind, name, source, "High");
        AddEdge(graph, graph.Nodes[0].Id, id, edgeKind, source, "High");
    }

    private static void EnsureObject(FwdObjectGraphModel graph, string kind, string name, string source, string confidence)
    {
        string id = ObjectId(kind, name);
        if (!graph.Nodes.Any(n => RuleCorrelation.Eq(n.Id, id)))
            AddNode(graph, id, kind, name, source, confidence);
    }

    private static void AddPrivateTreeNodes(FwdObjectGraphModel graph, string resourceId, ResourcePrivateNode root, string resourceType, string resourceName)
    {
        foreach (ResourcePrivateNode child in root.Children)
            AddPrivateTreeNode(graph, resourceId, child, resourceType, resourceName);
    }

    private static void AddPrivateTreeNode(FwdObjectGraphModel graph, string parentId, ResourcePrivateNode node, string resourceType, string resourceName)
    {
        string id = ObjectId("ResourcePrivateNode", resourceType + "/" + resourceName + "/" + node.Path);
        AddNode(graph, id, "ResourcePrivateNode", node.Name, "ResourcePrivateTree", "Medium", n =>
        {
            n.Metadata["resourceType"] = resourceType;
            n.Metadata["resourceName"] = resourceName;
            n.Metadata["path"] = node.Path;
            n.Metadata["depth"] = node.Depth;
            n.Metadata["isCollection"] = node.IsCollection;
            n.Metadata["size"] = node.Size;
            n.Metadata["valuePreview"] = node.ValuePreview;
            n.Metadata["dataSha256"] = node.DataSha256;
            n.Metadata["isBinaryPayload"] = node.IsBinaryPayload;
            n.Metadata["warnings"] = node.Warnings;
        });
        AddEdge(graph, parentId, id, "hasPrivateNode", "ResourcePrivateTree", "Medium");

        foreach (ResourcePrivateNode child in node.Children)
            AddPrivateTreeNode(graph, id, child, resourceType, resourceName);
    }

    private static void AddNode(FwdObjectGraphModel graph, string id, string kind, string name, string source, string confidence, Action<FwdObjectNodeModel>? configure = null)
    {
        if (graph.Nodes.Any(n => RuleCorrelation.Eq(n.Id, id)))
            return;

        var node = new FwdObjectNodeModel
        {
            Id = id,
            Kind = kind,
            Name = string.IsNullOrWhiteSpace(name) ? "(unnamed)" : name,
            Source = source,
            Confidence = confidence
        };
        configure?.Invoke(node);
        graph.Nodes.Add(node);
    }

    private static void AddEdge(FwdObjectGraphModel graph, string fromId, string toId, string kind, string source, string confidence)
    {
        if (graph.Edges.Any(e => RuleCorrelation.Eq(e.FromId, fromId) && RuleCorrelation.Eq(e.ToId, toId) && RuleCorrelation.Eq(e.Kind, kind)))
            return;

        graph.Edges.Add(new FwdObjectEdgeModel
        {
            FromId = fromId,
            ToId = toId,
            Kind = kind,
            Source = source,
            Confidence = confidence
        });
    }

    private static EditorStatusResultModel BuildStatusResult(AcTreeEdge edge, string relationship)
    {
        return new EditorStatusResultModel
        {
            OwnerRuleNodeId = "node-" + edge.FromNodeId.ToString("000000"),
            ActionListIndex = edge.ActionListIndex,
            Name = string.IsNullOrWhiteSpace(edge.ActionName) ? edge.ActionListIndex < 0 ? "Root list" : "Action " + edge.ActionListIndex.ToString() : edge.ActionName!,
            NameResolved = edge.ActionNameResolved || !string.IsNullOrWhiteSpace(edge.ActionName),
            RouteState = edge.EdgeKind == "RootListEntry" || edge.ActionListIndex < 0 ? "Root" : edge.ActionNameResolved || !string.IsNullOrWhiteSpace(edge.ActionName) ? "Resolved" : "IndexOnly",
            Relationship = relationship,
            Confidence = edge.Confidence
        };
    }

    private static void AddSelectionListUsage(WorkbenchSnapshot snapshot, EditorSelectionListDefinitionModel definition, AcRuleRelationship relationship)
    {
        string scopeId = RuleCorrelation.ScopeId(relationship.ScopePath, relationship.ScopeType, relationship.ScopeName);
        RuleModel? model = snapshot.RulesByNodeId.Values.FirstOrDefault(r =>
            RuleCorrelation.Eq(r.ScopeId, scopeId) &&
            r.Node.RuleIndexWithinScope == relationship.RuleIndex &&
            (RuleCorrelation.Eq(r.Node.RuleGuid, relationship.RuleGuid) || RuleCorrelation.Eq(r.Node.RuleName, relationship.RuleName)));

        if (definition.UsageLinks.Any(u => RuleCorrelation.Eq(u.ScopeId, scopeId) && RuleCorrelation.Eq(u.RuleGuid, relationship.RuleGuid) && u.RuleName == relationship.RuleName))
            return;

        definition.UsageLinks.Add(new EditorSelectionListUsageModel
        {
            ScopeId = scopeId,
            RuleNodeId = model?.NodeId,
            RuleGuid = relationship.RuleGuid,
            RuleName = relationship.RuleName,
            FunctionName = relationship.FunctionName,
            RelationshipKind = relationship.Kind
        });
    }

    private static void ApplySelectionListResourceEvidence(EditorSelectionListDefinitionModel definition)
    {
        foreach (EditorResourceAttributeHitModel hit in definition.ResourceEvidence.AttributeHits)
            ApplySelectionListEvidenceHit(definition, hit.Role, hit.Key, hit.Value, hit.Source, "High");

        foreach (EditorPrivateTreeHitModel hit in definition.ResourceEvidence.PrivateTreeHits)
            ApplySelectionListEvidenceHit(definition, hit.Role, hit.Name, hit.ValuePreview ?? string.Empty, "ResourcePrivateTree:" + hit.Path, hit.Confidence);
    }

    private static void ApplySelectionListEvidenceHit(EditorSelectionListDefinitionModel definition, string role, string name, string value, string source, string confidence)
    {
        if (role == "MatchField")
        {
            foreach (string field in ExtractNamesFromText(name + " " + value))
                AddSelectionListField(definition.MatchFields, field, "MatchField", confidence);
            return;
        }

        if (role == "PlugField")
        {
            foreach (string field in ExtractNamesFromText(name + " " + value))
                AddSelectionListField(definition.PlugFields, field, "PlugField", confidence);
            return;
        }

        if (role is "Persistence" or "RerunTrigger" or "OperatorPrompt" or "NoGoodMatch" or "EnterBehavior" or "PlugOutcome" or "RejectOutcome" or "TableOption")
        {
            definition.Options.Add(new EditorSelectionListOptionModel
            {
                Name = string.IsNullOrWhiteSpace(name) ? role : name,
                Value = value,
                Role = role,
                Confidence = confidence,
                Source = source
            });
        }
    }

    private static void AddSelectionListField(List<EditorSelectionListFieldModel> fields, string name, string role, string confidence)
    {
        if (string.IsNullOrWhiteSpace(name) || IsNoiseName(name))
            return;

        EditorSelectionListFieldModel? field = fields.FirstOrDefault(f => RuleCorrelation.Eq(f.Name, name));
        if (field == null)
        {
            field = new EditorSelectionListFieldModel
            {
                Name = name,
                Role = role,
                Confidence = confidence
            };
            fields.Add(field);
        }

        field.Hits++;
        if (RuleCorrelation.Eq(confidence, "High"))
            field.Confidence = "High";
    }

    private static void AddSelectionListField(EditorSelectionListDefinitionModel definition, AcRuleRelationship relationship, string tableName)
    {
        string candidate = (relationship.Target ?? relationship.ParameterName ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(candidate) || RuleCorrelation.Eq(candidate, tableName))
            return;

        string roleProbe = (relationship.ParameterRole + " " + relationship.Kind + " " + relationship.TargetType).ToLowerInvariant();
        bool plug = roleProbe.Contains("plug") || roleProbe.Contains("write") || roleProbe.Contains("output") || roleProbe.Contains("destination");
        bool match = roleProbe.Contains("match") || roleProbe.Contains("lookup") || roleProbe.Contains("input") || roleProbe.Contains("source") || roleProbe.Contains("column") || roleProbe.Contains("field");
        if (!plug && !match)
            return;

        AddSelectionListField(plug ? definition.PlugFields : definition.MatchFields, candidate, plug ? "PlugField" : "MatchField", relationship.Confidence);
    }

    private static bool LooksLikeTableRelationship(AcRuleRelationship relationship, string tableName)
    {
        if (!LooksLikeTableIdentifier(tableName))
            return false;

        string signal = (relationship.TargetType + " " + relationship.Kind + " " + relationship.ParameterRole + " " + relationship.FunctionName).ToLowerInvariant();
        return signal.Contains("table") || signal.Contains("selection") || signal.Contains("lookup") || signal.Contains("fuzzy");
    }

    private static string RelationshipRuleKey(AcRuleRelationship relationship)
    {
        return string.Join("|",
            RuleCorrelation.ScopeId(relationship.ScopePath, relationship.ScopeType, relationship.ScopeName),
            relationship.RuleGuid ?? string.Empty,
            relationship.RuleIndex.ToString(),
            relationship.RuleName ?? string.Empty,
            relationship.FunctionName ?? string.Empty);
    }

    private static ResourceDetail? FindResourceDetail(FwdInspectionReport report, string resourceType, string resourceName)
    {
        if (string.IsNullOrWhiteSpace(resourceType) || string.IsNullOrWhiteSpace(resourceName))
            return null;

        return report.ResourceTypeDetails
            .Where(t => RuleCorrelation.Eq(t.Type, resourceType))
            .SelectMany(t => t.Resources)
            .FirstOrDefault(r => RuleCorrelation.Eq(r.Name, resourceName));
    }

    private static ResourceDetail? FindResourceDetailByName(FwdInspectionReport report, string resourceName)
    {
        if (string.IsNullOrWhiteSpace(resourceName))
            return null;

        return report.ResourceTypeDetails
            .SelectMany(t => t.Resources)
            .FirstOrDefault(r => RuleCorrelation.Eq(r.Name, resourceName));
    }

    private static bool LooksLikeUdfName(string? name)
    {
        return !string.IsNullOrWhiteSpace(name) && Regex.IsMatch(name!, "udf|user.?defined", RegexOptions.IgnoreCase);
    }

    private static bool LooksLikeUdfIterator(string? functionName)
    {
        return !string.IsNullOrWhiteSpace(functionName) && Regex.IsMatch(functionName!, "iterate.*udf|_iiterate.*udf", RegexOptions.IgnoreCase);
    }

    private static bool IsGenericParamListName(string value)
    {
        return Regex.IsMatch(value ?? string.Empty, @"^_?ParamList(OMRIndex)?\d*$", RegexOptions.IgnoreCase);
    }

    private static bool LooksLikeIdentifier(string value)
    {
        return !string.IsNullOrWhiteSpace(value) && Regex.IsMatch(value.Trim(), "^[A-Za-z][A-Za-z0-9_ .-]{1,120}$", RegexOptions.CultureInvariant);
    }

    private static bool LooksLikeTableIdentifier(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        string name = value.Trim();
        return name.Length >= 2
            && name.Length <= 80
            && name.IndexOfAny(new[] { '.', '!', '?', ':', ';', '\\', '/', '"' }) < 0
            && name.Count(char.IsWhiteSpace) <= 2
            && Regex.IsMatch(name, @"^[A-Za-z0-9_ -]+$");
    }

    private static List<string> InferBehaviorFlags(string functionName, IEnumerable<AcRuleRelationship> relationships)
    {
        string combined = functionName + " " + string.Join(" ", relationships.Select(r => r.Kind + " " + r.TargetType + " " + r.ParameterRole));
        var flags = new List<string>();
        if (Regex.IsMatch(combined, "reject|repair", RegexOptions.IgnoreCase)) flags.Add("CreatesOperatorWork");
        if (Regex.IsMatch(combined, "table|selection|lookup|fuzzy", RegexOptions.IgnoreCase)) flags.Add("UsesTable");
        if (Regex.IsMatch(combined, "udf", RegexOptions.IgnoreCase)) flags.Add("CallsUdf");
        if (Regex.IsMatch(combined, "format|copy|delete|plug|set", RegexOptions.IgnoreCase)) flags.Add("MayWriteField");
        if (Regex.IsMatch(combined, "check|test|is|has|compare", RegexOptions.IgnoreCase)) flags.Add("BranchesRuleFlow");
        if (Regex.IsMatch(combined, "attr", RegexOptions.IgnoreCase)) flags.Add("UsesAttribute");
        if (flags.Count == 0) flags.Add("UnknownStaticBehavior");
        return flags.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static List<string> InferRuntimeImpacts(string functionName, List<string> flags, IEnumerable<AcRuleRelationship> relationships)
    {
        var impacts = new List<string>();
        if (flags.Any(f => RuleCorrelation.Contains(f, "OperatorWork") || RuleCorrelation.Contains(f, "Reject")))
            impacts.Add("May create operator repair or reject work.");
        if (flags.Any(f => RuleCorrelation.Contains(f, "Table")))
            impacts.Add("May drive SelectionList/table lookup behavior.");
        if (flags.Any(f => RuleCorrelation.Contains(f, "Write") || RuleCorrelation.Contains(f, "Plug")))
            impacts.Add("May plug or mutate configured fields before operator review.");
        if (flags.Any(f => RuleCorrelation.Contains(f, "Udf")))
            impacts.Add("May call reusable UDF rule-list logic with caller-side field bindings.");
        if (flags.Any(f => RuleCorrelation.Contains(f, "Branch")))
            impacts.Add("May route Status Results into different Action Lists.");
        if (relationships.Any(r => IsRuntimeDependency(r)))
            impacts.Add("Uses static references that may become runtime dependencies.");
        return impacts;
    }

    private static string InferImpactType(string functionName, List<string> flags, string impact, IEnumerable<AcRuleRelationship> relationships)
    {
        string probe = functionName + " " + impact + " " + string.Join(" ", flags);
        if (Regex.IsMatch(probe, "reject|repair|operator", RegexOptions.IgnoreCase)) return "OperatorRepair";
        if (Regex.IsMatch(probe, "table|selection|lookup|fuzzy", RegexOptions.IgnoreCase)) return "SelectionListLookup";
        if (Regex.IsMatch(probe, "plug|write|mutate|format|copy|delete", RegexOptions.IgnoreCase)) return "FieldMutation";
        if (Regex.IsMatch(probe, "udf", RegexOptions.IgnoreCase)) return "UdfCall";
        if (Regex.IsMatch(probe, "branch|status|action", RegexOptions.IgnoreCase)) return "RuleFlow";
        if (relationships.Any(r => IsRuntimeDependency(r))) return "RuntimeDependency";
        return "StaticRuleImpact";
    }

    private static bool IsRuntimeDependency(AcRuleRelationship relationship)
    {
        if (relationship.IsOptionParameter) return false;
        if (RuleCorrelation.Eq(relationship.Confidence, "Low")) return false;
        if (RuleCorrelation.Contains(relationship.Kind, "Mention")) return false;
        if (RuleCorrelation.Contains(relationship.ParameterRole, "Option")) return false;
        return !string.IsNullOrWhiteSpace(relationship.Target);
    }

    private static IEnumerable<string> Distinct(IEnumerable<string?> values)
    {
        return values
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Select(v => v!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(v => v, StringComparer.OrdinalIgnoreCase);
    }

    private static void CopyDictionary(Dictionary<string, List<string>> source, Dictionary<string, List<string>> target)
    {
        foreach (KeyValuePair<string, List<string>> pair in source)
            target[pair.Key] = pair.Value.Where(v => !string.IsNullOrWhiteSpace(v)).Select(v => v.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static string ObjectId(string kind, string name) => kind.ToLowerInvariant() + ":" + SafeId(name);

    private static string SafeId(string? value) => RuleCorrelation.SafeId(value ?? "unknown").ToLowerInvariant();
}
