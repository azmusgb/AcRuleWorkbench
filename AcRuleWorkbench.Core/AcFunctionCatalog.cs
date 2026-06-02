using System;
using System.Collections.Generic;
using System.Linq;

namespace AcRuleWorkbench.Core;

/// <summary>
/// Small, explicit AC function semantics catalog used before generic parameter heuristics.
/// This deliberately starts with high-value functions and can be expanded from the AC Functions guide.
/// Catalog hits are treated as stronger relationship evidence than name-shape heuristics.
/// </summary>
public static class AcFunctionCatalog
{
    private sealed class Entry
    {
        public string FunctionName { get; init; } = string.Empty;
        public string ParameterPattern { get; init; } = string.Empty;
        public string TargetType { get; init; } = "Parameter";
        public string RelationshipKind { get; init; } = "UsesParameter";
        public string ParameterRole { get; init; } = "FunctionSchemaParameter";
        public bool IsOptionParameter { get; init; }
        public bool Prefix { get; init; }
        public string Confidence { get; init; } = "High";
    }

    public sealed class Classification
    {
        public string TargetType { get; init; } = "Parameter";
        public string RelationshipKind { get; init; } = "UsesParameter";
        public string ParameterRole { get; init; } = "FunctionSchemaParameter";
        public bool IsOptionParameter { get; init; }
        public string Confidence { get; init; } = "High";
    }

    private static readonly Entry[] Entries =
    {
        Field("_IRejectFields", "_ParamList", "RejectsField", "RejectField", prefix: true),
        Field("IRejectPage", "_ParamList", "RejectsField", "RejectField", prefix: true),
        Field("Copy", "_ParamList0", "UsesField", "InputField"),
        Field("Copy", "_ParamList1", "WritesField", "OutputField"),
        Field("MergeFields", "_ParamList", "MutatesField", "MutatedField", prefix: true),
        Field("Formatf", "_ParamList", "MutatesField", "MutatedField", prefix: true),
        Field("FormatDate", "_ParamList", "MutatesField", "MutatedField", prefix: true),
        Field("DeleteLines", "_ParamList", "MutatesField", "MutatedField", prefix: true),
        Field("DeleteSpaces", "_ParamList", "MutatesField", "MutatedField", prefix: true),
        Field("DeleteStrings", "_ParamList", "MutatesField", "MutatedField", prefix: true),
        Field("LimitLineCount", "_ParamList", "MutatesField", "MutatedField", prefix: true),
        Field("LimitLineLength", "_ParamList", "MutatesField", "MutatedField", prefix: true),
        Field("IsEmpty", "_ParamList", "UsesField", "InputField", prefix: true),
        Field("HasRegExpr", "_ParamList", "UsesField", "InputField", prefix: true),
        Field("CompareFields", "_ParamList", "UsesField", "InputField", prefix: true),
        Field("CheckDate", "_ParamList", "UsesField", "InputField", prefix: true),
        Field("CheckMath", "_ParamList", "UsesField", "InputField", prefix: true),
        Field("CheckColumnSum", "_ParamList", "UsesField", "InputField", prefix: true),
        Field("SetFieldAttr", "_ParamList", "WritesFieldAttribute", "TargetField", prefix: true),
        Field("ClearFieldAttr", "_ParamList", "ClearsFieldAttribute", "TargetField", prefix: true),
        Field("TestFieldAttr", "_ParamList", "ReadsFieldAttribute", "TargetField", prefix: true),

        Attr("_ISetDocAttr", "AttrName", "WritesAttribute"),
        Attr("_ISetDocAttrConst", "AttrName", "WritesAttribute"),
        Attr("_IClearDocAttr", "AttrName", "ClearsAttribute"),
        Attr("_IGetDocAttr", "AttrName", "ReadsAttribute"),
        Attr("_ITestDocAttr", "AttrName", "ReadsAttribute"),
        Attr("_ISetPageAttr", "AttrName", "WritesAttribute"),
        Attr("_ISetPageAttrConst", "AttrName", "WritesAttribute"),
        Attr("_IClearPageAttr", "AttrName", "ClearsAttribute"),
        Attr("_IGetPageAttr", "AttrName", "ReadsAttribute"),
        Attr("_ITestPageAttr", "AttrName", "ReadsAttribute"),
        Attr("_ISetRecordAttr", "AttrName", "WritesAttribute"),
        Attr("_IClearRecordAttr", "AttrName", "ClearsAttribute"),
        Attr("_IGetRecordAttr", "AttrName", "ReadsAttribute"),
        Attr("_ITestRecordAttr", "AttrName", "ReadsAttribute"),

        Option("HasRegExpr", "RegularExpression", "UsesOption", "Regex"),
        Option("FormatRegExpr", "RegularExpression", "UsesOption", "Regex"),
        Option("FormatDate", "DateFormat", "UsesOption", "DateFormat"),
        Option("IsInTable", "SelectionList", "UsesTable", "TableName", targetType: "Table"),
        Option("IsInTable2", "SelectionList", "UsesTable", "TableName", targetType: "Table"),
        Option("SelectTable", "SelectionList", "UsesTable", "TableName", targetType: "Table"),
        Option("SelectSelectedListTableApproxMatch", "SelectionList", "UsesTable", "TableName", targetType: "Table"),
        Option("PlugFuzzyMatch", "SelectionList", "UsesTable", "TableName", targetType: "Table"),
    };

    public static Classification? TryClassify(string functionName, string parameterName)
    {
        if (string.IsNullOrWhiteSpace(functionName) || string.IsNullOrWhiteSpace(parameterName))
            return null;

        Entry? entry = Entries.FirstOrDefault(e =>
            functionName.Equals(e.FunctionName, StringComparison.OrdinalIgnoreCase) &&
            (e.Prefix
                ? parameterName.StartsWith(e.ParameterPattern, StringComparison.OrdinalIgnoreCase)
                : parameterName.Equals(e.ParameterPattern, StringComparison.OrdinalIgnoreCase)));

        if (entry == null)
            return null;

        return new Classification
        {
            TargetType = entry.TargetType,
            RelationshipKind = entry.RelationshipKind,
            ParameterRole = entry.ParameterRole,
            IsOptionParameter = entry.IsOptionParameter,
            Confidence = entry.Confidence
        };
    }

    private static Entry Field(string functionName, string parameterPattern, string kind, string role, bool prefix = false)
    {
        return new Entry
        {
            FunctionName = functionName,
            ParameterPattern = parameterPattern,
            TargetType = "Field",
            RelationshipKind = kind,
            ParameterRole = role,
            Prefix = prefix,
            Confidence = "High"
        };
    }

    private static Entry Attr(string functionName, string parameterPattern, string kind)
    {
        return new Entry
        {
            FunctionName = functionName,
            ParameterPattern = parameterPattern,
            TargetType = "Attribute",
            RelationshipKind = kind,
            ParameterRole = "AttributeName",
            Confidence = "High"
        };
    }

    private static Entry Option(string functionName, string parameterPattern, string kind, string role, string targetType = "Option")
    {
        return new Entry
        {
            FunctionName = functionName,
            ParameterPattern = parameterPattern,
            TargetType = targetType,
            RelationshipKind = kind,
            ParameterRole = role,
            IsOptionParameter = true,
            Confidence = "High"
        };
    }
}
