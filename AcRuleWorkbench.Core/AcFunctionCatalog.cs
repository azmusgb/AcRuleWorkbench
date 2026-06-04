using System;
using System.Collections.Generic;
using System.Linq;

namespace AcRuleWorkbench.Core;

/// <summary>
/// Explicit AC function semantics catalog used before generic parameter heuristics.
/// Catalog hits are treated as stronger relationship evidence than name-shape heuristics,
/// and the public definitions provide the viewer/API with Editor-aligned function metadata.
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

    public sealed class FunctionDefinition
    {
        public string Name { get; init; } = string.Empty;
        public string Category { get; init; } = "Unknown";
        public string Description { get; init; } = string.Empty;
        public IReadOnlyList<string> StatusResults { get; init; } = Array.Empty<string>();
        public IReadOnlyList<string> ParameterRoles { get; init; } = Array.Empty<string>();
        public IReadOnlyList<string> BehaviorFlags { get; init; } = Array.Empty<string>();
        public IReadOnlyList<string> RuntimeImpacts { get; init; } = Array.Empty<string>();
        public bool Deprecated { get; init; }
        public string Evidence { get; init; } = "Curated AC function catalog seed";
        public string StatusResultCaveat { get; init; } = "Configured ActionNames on the rule are the authoritative status-result/action-list evidence for this FWD snapshot.";
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
        Field("CheckAmount", "_ParamList", "UsesField", "AmountField", prefix: true),
        Field("CheckCharPopulation", "_ParamList", "UsesField", "InputField", prefix: true),
        Field("CheckCharSet", "_ParamList", "UsesField", "InputField", prefix: true),
        Field("CheckCheckBox", "_ParamList", "UsesField", "CheckboxField", prefix: true),
        Field("CheckLineCount", "_ParamList", "UsesField", "MultilineField", prefix: true),
        Field("CheckLineLength", "_ParamList", "UsesField", "MultilineField", prefix: true),
        Field("CheckPageNum", "_ParamList", "UsesField", "PageNumberField", prefix: true),
        Field("CompareAmountFields", "_ParamList", "UsesField", "AmountField", prefix: true),
        Field("CopyFromFirstInstance", "_ParamList", "WritesField", "InstanceField", prefix: true),
        Field("CopyLines", "_ParamList", "WritesField", "MultilineField", prefix: true),
        Field("DeleteRegExpr", "_ParamList", "MutatesField", "MutatedField", prefix: true),
        Field("DeleteSparseRows2", "_ParamList", "MutatesField", "GridField", prefix: true),
        Field("DoMathAndFormat", "_ParamList", "MutatesField", "CalculatedField", prefix: true),
        Field("FilterChars", "_ParamList", "MutatesField", "MutatedField", prefix: true),
        Field("GetFieldAttr", "_ParamList", "ReadsFieldAttribute", "TargetField", prefix: true),
        Field("SetFieldAttr", "_ParamList", "WritesFieldAttribute", "TargetField", prefix: true),
        Field("ClearFieldAttr", "_ParamList", "ClearsFieldAttribute", "TargetField", prefix: true),
        Field("TestFieldAttr", "_ParamList", "ReadsFieldAttribute", "TargetField", prefix: true),

        Attr("_ISetDocAttr", "AttrName", "WritesAttribute"),
        Attr("_ISetDocAttrConst", "AttrName", "WritesAttribute"),
        Attr("_IClearDocAttr", "AttrName", "ClearsAttribute"),
        Attr("_IGetDocAttr", "AttrName", "ReadsAttribute"),
        Attr("_IMatchDocAttrConst", "AttrName", "ReadsAttribute"),
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
        Attr("GetFieldAttr", "AttrName", "ReadsFieldAttribute"),

        Option("HasRegExpr", "RegularExpression", "UsesOption", "Regex"),
        Option("FormatRegExpr", "RegularExpression", "UsesOption", "Regex"),
        Option("FormatDate", "DateFormat", "UsesOption", "DateFormat"),
        Option("IsInTable", "SelectionList", "UsesTable", "TableName", targetType: "Table"),
        Option("IsInTable2", "SelectionList", "UsesTable", "TableName", targetType: "Table"),
        Option("SelectTable", "SelectionList", "UsesTable", "TableName", targetType: "Table"),
        Option("SelectSelectedListTableApproxMatch", "SelectionList", "UsesTable", "TableName", targetType: "Table"),
        Option("PlugFuzzyMatch", "SelectionList", "UsesTable", "TableName", targetType: "Table"),
    };

    private static readonly FunctionDefinition[] FunctionDefinitions =
    {
        Def("_IRejectFields", "Intrinsic", "Rejects one or more fields so KE/WebKey/WebRepair must revisit them or show the configured rejection.", new[] { "OK" }, new[] { "Rejected fields", "Reject message/code" }, new[] { "RejectsField", "CreatesOperatorWork" }, new[] { "Creates error-to-error navigation work and can block clean acceptance until the rejected field is corrected or overridden." }),
        Def("IRejectPage", "Intrinsic", "Rejects the current page through page-level AC logic.", new[] { "OK" }, new[] { "Rejected page fields", "Reject message/code" }, new[] { "RejectsPage", "CreatesOperatorWork" }, new[] { "Turns static rule output into page-level operator repair/review work." }),
        Def("_IRejectDoc", "Intrinsic", "Rejects the current document through document-level AC logic.", new[] { "OK" }, new[] { "Document reject message/code" }, new[] { "RejectsDocument", "CreatesOperatorWork" }, new[] { "Can route the entire document to review or repair depending on process configuration." }),

        Def("_IBatchType", "Intrinsic", "Tests the active batch type so downstream rules can branch on batch context.", new[] { "Matched", "NotMatched", "Failed" }, new[] { "Batch type option" }, new[] { "ReadsRuntimeContext", "BranchesRuleFlow" }, new[] { "Controls which action list runs for a batch-specific rule path." }),
        Def("_IWorkerType", "Intrinsic", "Tests the active worker/process context, such as AC, DV, KE, KFI, or WebKey.", new[] { "Matched", "NotMatched", "Failed" }, new[] { "Worker type option" }, new[] { "ReadsRuntimeContext", "BranchesRuleFlow" }, new[] { "Separates machine processing behavior from keying/review behavior inside the same rule tree." }),
        Def("_IIterateAllUDF", "Intrinsic UDF", "Invokes a UDF repeatedly across a configured field collection.", new[] { "OK", "Failed" }, new[] { "UDF name", "Field-list collection" }, new[] { "CallsUdf", "IteratesFields", "BranchesRuleFlow" }, new[] { "Applies one reusable rule-list interface to multiple field bindings." }),
        Def("_IIterateOnlyFieldsUDF", "Intrinsic UDF", "Invokes a UDF only for field-level iterations.", new[] { "OK", "Failed" }, new[] { "UDF name", "Field-list collection" }, new[] { "CallsUdf", "IteratesFields" }, new[] { "Lets one UDF define repeatable field validation or formatting behavior." }),
        Def("_IIterateOnlyInstancesUDF", "Intrinsic UDF", "Invokes a UDF across multiple field instances.", new[] { "OK", "Failed" }, new[] { "UDF name", "Field instances" }, new[] { "CallsUdf", "IteratesInstances" }, new[] { "Used when repeated/multiple-instance fields must share the same validation path." }),
        Def("_IIterateDynamicTableUDF", "Intrinsic UDF", "Invokes a UDF across a dynamic table or row-oriented field collection.", new[] { "OK", "Failed" }, new[] { "UDF name", "Dynamic table or row collection", "Caller field bindings" }, new[] { "CallsUdf", "IteratesTableRows", "BranchesRuleFlow" }, new[] { "Applies reusable validation or formatting to table-like field groups; caller bindings must be inspected before inferring exact runtime rows." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),
        Def("_IIterateOnlyLinesUDF", "Intrinsic UDF", "Invokes a UDF for line-oriented or multiline field entries.", new[] { "OK", "Failed" }, new[] { "UDF name", "Line collection", "Caller field bindings" }, new[] { "CallsUdf", "IteratesLines", "SupportsMultiline" }, new[] { "Lets one UDF apply checks or formatting to repeated text lines." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),
        Def("_IKFI", "Intrinsic", "Tests or gates behavior for KFI/key-from-image processing context.", new[] { "Matched", "NotMatched", "Failed" }, new[] { "Worker/context option" }, new[] { "ReadsRuntimeContext", "BranchesRuleFlow" }, new[] { "Separates KFI/keying behavior from machine AC paths inside shared rule lists." }, evidence: "Observed high-frequency function seed; verify exact status names against the FormWorks AC Functions Guide."),
        Def("_IEvalPages", "Intrinsic", "Evaluates page-level conditions or page collections before downstream rule actions.", new[] { "OK", "Failed" }, new[] { "Page criteria", "Page collection" }, new[] { "ReadsRuntimeContext", "BranchesRuleFlow" }, new[] { "Can decide whether page-level sub-lists run; static config does not prove which pages matched at runtime." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),
        Def("_IForceFERepair", "Intrinsic", "Forces or flags full-entry repair review from AC configuration.", new[] { "OK", "Failed" }, new[] { "Repair reason or target" }, new[] { "CreatesOperatorWork", "RoutesToRepair" }, new[] { "Can create operator repair work even when field-level checks are otherwise clean." }, evidence: "Observed high-frequency function seed; verify exact runtime behavior against the FormWorks AC Functions Guide."),
        Def("ClearCaptureError", "Intrinsic", "Clears capture-error state from configured field, page, or document context.", new[] { "OK", "Failed" }, new[] { "Capture-error target" }, new[] { "ClearsRuntimeState", "MayChangeOperatorWork" }, new[] { "Can remove error state that would otherwise send work to repair or review." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),
        Def("GetToken", "Intrinsic", "Reads or derives a configured token value for downstream rule parameters.", new[] { "OK", "Failed", "Empty" }, new[] { "Token name", "Destination" }, new[] { "ReadsRuntimeContext", "ReadsOption" }, new[] { "Can let static or runtime token values drive branch decisions and field plugging." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),

        Def("Copy", "Formatting", "Copies data from one field list to another.", new[] { "OK", "Failed", "Empty" }, new[] { "InputField", "OutputField" }, new[] { "ReadsField", "WritesField", "MayChangeWR" }, new[] { "Can plug or normalize fields before an operator sees them." }),
        Def("MergeFields", "Formatting", "Merges multiple field values into a target field or field list.", new[] { "OK", "Failed", "Empty" }, new[] { "Input fields", "Mutated/output field" }, new[] { "ReadsField", "WritesField", "MayChangeWR" }, new[] { "Can change the keying workload by consolidating machine-captured text." }),
        Def("Formatf", "Formatting", "Formats field text according to configured formatting attributes.", new[] { "OK", "Failed", "Empty" }, new[] { "Mutated fields", "Format attributes" }, new[] { "WritesField", "MayChangeWR" }, new[] { "Changes stored field representation and can hide or expose downstream validation errors." }),
        Def("FormatDate", "Formatting", "Normalizes field text into a configured date format.", new[] { "OK", "Failed", "Empty" }, new[] { "Date fields", "DateFormat option" }, new[] { "WritesField", "UsesDateFormat", "MayChangeWR" }, new[] { "Affects date keying, comparison, and reject behavior." }),
        Def("FormatRegExpr", "Formatting", "Reformats or extracts field text using a configured regular expression.", new[] { "OK", "Failed", "NoMatch", "Empty" }, new[] { "Input/mutated fields", "RegularExpression option" }, new[] { "ReadsField", "WritesField", "UsesRegex" }, new[] { "Can clean OCR text before validation or table lookup." }),
        Def("DeleteLines", "Formatting", "Deletes configured lines from multiline field text.", new[] { "OK", "Failed", "Empty" }, new[] { "Mutated multiline fields", "Line options" }, new[] { "WritesField", "SupportsMultiline" }, new[] { "Can remove lines from keying grids or multiline repair views." }),
        Def("DeleteSpaces", "Formatting", "Deletes spaces from configured field text.", new[] { "OK", "Failed", "Empty" }, new[] { "Mutated fields" }, new[] { "WritesField", "MayChangeWR" }, new[] { "Common OCR cleanup before tests, date parsing, or lookup." }),
        Def("DeleteStrings", "Formatting", "Deletes configured string values from field text.", new[] { "OK", "Failed", "Empty" }, new[] { "Mutated fields", "String options" }, new[] { "WritesField", "MayChangeWR" }, new[] { "Removes boilerplate or OCR artifacts before downstream rules run." }),
        Def("LimitLineCount", "Formatting", "Limits a multiline field to a configured number of lines.", new[] { "OK", "Failed", "Empty" }, new[] { "Mutated multiline fields" }, new[] { "WritesField", "SupportsMultiline" }, new[] { "Can reduce operator grid rows and downstream validation surface." }),
        Def("LimitLineLength", "Formatting", "Limits line length for configured field text.", new[] { "OK", "Failed", "Empty" }, new[] { "Mutated fields" }, new[] { "WritesField", "MayChangeWR" }, new[] { "Can truncate or reshape text before review." }),
        Def("AlignInRows4", "Formatting", "Aligns related field text or row values into row-oriented groups.", new[] { "OK", "Failed", "Empty" }, new[] { "Row fields", "Alignment options" }, new[] { "WritesField", "SupportsMultiline", "MayChangeWR" }, new[] { "Can reshape row/grid data before validation or keying review." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),
        Def("CopyFromFirstInstance", "Formatting", "Copies data from the first field instance into later configured instances or targets.", new[] { "OK", "Failed", "Empty" }, new[] { "Source instance", "Destination instance fields" }, new[] { "ReadsField", "WritesField", "SupportsMultipleInstances" }, new[] { "Can auto-plug repeated-instance fields and reduce operator entry work." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),
        Def("CopyLines", "Formatting", "Copies line-oriented text between multiline fields or line collections.", new[] { "OK", "Failed", "Empty" }, new[] { "Source lines", "Destination lines" }, new[] { "ReadsField", "WritesField", "SupportsMultiline" }, new[] { "Can move OCR text between multiline repair surfaces." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),
        Def("DeleteRegExpr", "Formatting", "Deletes text matching a configured regular expression from target fields.", new[] { "OK", "Failed", "NoMatch", "Empty" }, new[] { "Mutated fields", "RegularExpression option" }, new[] { "WritesField", "UsesRegex", "MayChangeWR" }, new[] { "Can remove OCR artifacts before downstream tests, lookups, or keying review." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),
        Def("DeleteSparseRows2", "Formatting", "Deletes sparse or empty rows from row-oriented field data.", new[] { "OK", "Failed", "Empty" }, new[] { "Grid or multiline fields", "Sparse-row options" }, new[] { "WritesField", "SupportsMultiline", "MayChangeWR" }, new[] { "Can alter visible row counts before keying or table validation." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),
        Def("DoMathAndFormat", "Formatting", "Calculates configured field values and formats the result.", new[] { "OK", "Failed", "Empty" }, new[] { "Input fields", "Calculated/output fields", "Format options" }, new[] { "ReadsField", "WritesField", "BranchesRuleFlow" }, new[] { "Can create or normalize calculated values before downstream validation." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),
        Def("FilterChars", "Formatting", "Filters allowed or disallowed characters in configured field text.", new[] { "OK", "Failed", "Empty" }, new[] { "Mutated fields", "Character set options" }, new[] { "WritesField", "MayChangeWR" }, new[] { "Can clean OCR text before validation, lookup, or keying." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),

        Def("IsEmpty", "Testing", "Tests whether one or more fields are empty.", new[] { "Empty", "NotEmpty", "Failed" }, new[] { "InputField" }, new[] { "ReadsField", "BranchesRuleFlow" }, new[] { "Often drives required-field rejects or bypasses later validation when data is absent." }),
        Def("HasRegExpr", "Testing", "Tests field text against a configured regular expression.", new[] { "Matched", "NotMatched", "Empty", "Failed" }, new[] { "InputField", "RegularExpression option" }, new[] { "ReadsField", "UsesRegex", "BranchesRuleFlow" }, new[] { "Regex failures commonly route to reject fields or cleanup sub-lists." }),
        Def("CompareFields", "Testing", "Compares values across configured fields.", new[] { "Equal", "NotEqual", "Empty", "Failed" }, new[] { "Input fields" }, new[] { "ReadsField", "BranchesRuleFlow" }, new[] { "Creates multi-field validation workflows where related fields must be corrected together." }),
        Def("CheckDate", "Testing", "Validates date field content and configured date constraints.", new[] { "OK", "Failed", "Empty" }, new[] { "Date fields", "Date options" }, new[] { "ReadsField", "UsesDateFormat", "BranchesRuleFlow" }, new[] { "Invalid dates can trigger field rejects or date-formatting sub-lists." }),
        Def("CheckMath", "Testing", "Checks configured arithmetic relationships among fields.", new[] { "OK", "Failed", "Empty" }, new[] { "Input fields", "Math options" }, new[] { "ReadsField", "BranchesRuleFlow" }, new[] { "Math failures usually become multi-field operator repair work." }),
        Def("CheckColumnSum", "Testing", "Checks that a table/grid column sum matches configured totals.", new[] { "OK", "Failed", "Empty" }, new[] { "Grid fields", "Total fields" }, new[] { "ReadsField", "SupportsMultiline", "BranchesRuleFlow" }, new[] { "Can drive row/column keying review when grid math does not balance." }),
        Def("CheckAmount", "Testing", "Validates amount or currency-style field content.", new[] { "OK", "Failed", "Empty" }, new[] { "Amount fields", "Amount options" }, new[] { "ReadsField", "BranchesRuleFlow" }, new[] { "Amount failures commonly route to cleanup or field reject action lists." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),
        Def("CheckCharPopulation", "Testing", "Tests whether configured character populations are present in field text.", new[] { "OK", "Failed", "Empty" }, new[] { "Input fields", "Character population options" }, new[] { "ReadsField", "BranchesRuleFlow" }, new[] { "Can identify OCR/keying values that do not meet expected character distribution." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),
        Def("CheckCharSet", "Testing", "Tests field text against an allowed or disallowed character set.", new[] { "OK", "Failed", "Empty" }, new[] { "Input fields", "Character set options" }, new[] { "ReadsField", "BranchesRuleFlow" }, new[] { "Can route invalid-character values to cleanup or repair rules." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),
        Def("CheckCheckBox", "Testing", "Tests checkbox-style field state.", new[] { "OK", "Failed", "Empty" }, new[] { "Checkbox fields", "Expected state" }, new[] { "ReadsField", "BranchesRuleFlow", "SupportsOmr" }, new[] { "Can route OMR/checkbox state into document or page validation paths." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),
        Def("CheckLineCount", "Testing", "Checks the number of lines in multiline field text.", new[] { "OK", "Failed", "Empty" }, new[] { "Multiline fields", "Line-count options" }, new[] { "ReadsField", "SupportsMultiline", "BranchesRuleFlow" }, new[] { "Can reject or clean multiline values when row counts do not match configuration." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),
        Def("CheckLineLength", "Testing", "Checks configured line lengths in multiline field text.", new[] { "OK", "Failed", "Empty" }, new[] { "Multiline fields", "Line-length options" }, new[] { "ReadsField", "SupportsMultiline", "BranchesRuleFlow" }, new[] { "Can route long or short OCR/keyed lines to cleanup or repair." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),
        Def("CheckPageNum", "Testing", "Tests page number or page-position conditions.", new[] { "OK", "Failed", "Empty" }, new[] { "Page number field or page-position option" }, new[] { "ReadsRuntimeContext", "BranchesRuleFlow" }, new[] { "Can gate page-specific rule lists and downstream repair actions." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),
        Def("CheckRejects", "Testing", "Checks whether configured reject state is present before downstream action lists run.", new[] { "OK", "Failed", "HasRejects", "NoRejects" }, new[] { "Reject field or scope options" }, new[] { "ReadsRejectState", "BranchesRuleFlow" }, new[] { "Can prevent or trigger operator repair paths depending on existing reject state." }, evidence: "Observed high-frequency function seed; verify exact status names against the FormWorks AC Functions Guide."),
        Def("CompareAmountFields", "Testing", "Compares amount values across configured fields.", new[] { "Equal", "NotEqual", "Empty", "Failed" }, new[] { "Amount fields" }, new[] { "ReadsField", "BranchesRuleFlow" }, new[] { "Can create multi-field amount repair workflows when related totals do not match." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),

        Def("SetFieldAttr", "Intrinsic Attribute", "Sets a field attribute from rule configuration.", new[] { "OK", "Failed" }, new[] { "TargetField", "AttributeName", "AttributeValue" }, new[] { "WritesFieldAttribute" }, new[] { "Can alter downstream keying/review behavior when workers read field attributes." }),
        Def("ClearFieldAttr", "Intrinsic Attribute", "Clears a field attribute.", new[] { "OK", "Failed" }, new[] { "TargetField", "AttributeName" }, new[] { "ClearsFieldAttribute" }, new[] { "Removes field state that later rules or workers may depend on." }),
        Def("TestFieldAttr", "Intrinsic Attribute", "Tests a field attribute.", new[] { "Matched", "NotMatched", "Failed" }, new[] { "TargetField", "AttributeName", "AttributeValue" }, new[] { "ReadsFieldAttribute", "BranchesRuleFlow" }, new[] { "Branches rule flow on field state instead of only text value." }),
        Def("GetFieldAttr", "Intrinsic Attribute", "Reads a field attribute into rule flow or a configured destination.", new[] { "OK", "Failed", "Empty" }, new[] { "TargetField", "AttributeName", "Destination" }, new[] { "ReadsFieldAttribute" }, new[] { "Lets field state affect validation, lookup, or field plugging." }, evidence: "Observed high-frequency function seed; verify parameter schema against the FormWorks AC Functions Guide."),
        Def("_ISetDocAttr", "Intrinsic Attribute", "Sets a document attribute from a configured value or source.", new[] { "OK", "Failed" }, new[] { "AttrName", "AttrValue" }, new[] { "WritesDocumentAttribute" }, new[] { "Document attributes can key later document-level rules, store output, or routing." }),
        Def("_ISetDocAttrConst", "Intrinsic Attribute", "Sets a document attribute to a constant configured value.", new[] { "OK", "Failed" }, new[] { "AttrName", "ConstantValue" }, new[] { "WritesDocumentAttribute" }, new[] { "Plugs document state used by downstream rule trees or process configuration." }),
        Def("_IClearDocAttr", "Intrinsic Attribute", "Clears a document attribute.", new[] { "OK", "Failed" }, new[] { "AttrName" }, new[] { "ClearsDocumentAttribute" }, new[] { "Removes document state for later rules or output mapping." }),
        Def("_IGetDocAttr", "Intrinsic Attribute", "Reads a document attribute into rule flow or configured fields.", new[] { "OK", "Failed", "Empty" }, new[] { "AttrName", "Destination" }, new[] { "ReadsDocumentAttribute" }, new[] { "Lets static document state drive validation, lookup, or field plugging." }),
        Def("_IMatchDocAttrConst", "Intrinsic Attribute", "Compares a document attribute against a configured constant.", new[] { "Matched", "NotMatched", "Failed", "Empty" }, new[] { "AttrName", "ConstantValue" }, new[] { "ReadsDocumentAttribute", "BranchesRuleFlow" }, new[] { "Can branch document or page rule flow from static document attribute state." }, evidence: "Observed high-frequency function seed; verify exact status names against the FormWorks AC Functions Guide."),
        Def("_ITestDocAttr", "Intrinsic Attribute", "Tests a document attribute.", new[] { "Matched", "NotMatched", "Failed" }, new[] { "AttrName", "ExpectedValue" }, new[] { "ReadsDocumentAttribute", "BranchesRuleFlow" }, new[] { "Branches document/page rules on document-level state." }),
        Def("_ISetPageAttr", "Intrinsic Attribute", "Sets a page attribute from configured data.", new[] { "OK", "Failed" }, new[] { "AttrName", "AttrValue" }, new[] { "WritesPageAttribute" }, new[] { "Page attributes can affect page-level validation and runtime routing." }),
        Def("_ISetPageAttrConst", "Intrinsic Attribute", "Sets a page attribute to a constant configured value.", new[] { "OK", "Failed" }, new[] { "AttrName", "ConstantValue" }, new[] { "WritesPageAttribute" }, new[] { "Plugs page state used by later page rules or process configuration." }),
        Def("_IClearPageAttr", "Intrinsic Attribute", "Clears a page attribute.", new[] { "OK", "Failed" }, new[] { "AttrName" }, new[] { "ClearsPageAttribute" }, new[] { "Removes page state before downstream checks." }),
        Def("_IGetPageAttr", "Intrinsic Attribute", "Reads a page attribute.", new[] { "OK", "Failed", "Empty" }, new[] { "AttrName", "Destination" }, new[] { "ReadsPageAttribute" }, new[] { "Lets page state affect validation or field plugging." }),
        Def("_ITestPageAttr", "Intrinsic Attribute", "Tests a page attribute.", new[] { "Matched", "NotMatched", "Failed" }, new[] { "AttrName", "ExpectedValue" }, new[] { "ReadsPageAttribute", "BranchesRuleFlow" }, new[] { "Branches rule flow on page-level state." }),
        Def("_ISetRecordAttr", "Intrinsic Attribute", "Sets a record attribute.", new[] { "OK", "Failed" }, new[] { "AttrName", "AttrValue" }, new[] { "WritesRecordAttribute" }, new[] { "Record attributes can carry state across related page/document work." }),
        Def("_IClearRecordAttr", "Intrinsic Attribute", "Clears a record attribute.", new[] { "OK", "Failed" }, new[] { "AttrName" }, new[] { "ClearsRecordAttribute" }, new[] { "Removes record-level state used by downstream workers or rules." }),
        Def("_IGetRecordAttr", "Intrinsic Attribute", "Reads a record attribute.", new[] { "OK", "Failed", "Empty" }, new[] { "AttrName", "Destination" }, new[] { "ReadsRecordAttribute" }, new[] { "Uses record-level state in page/document rules." }),
        Def("_ITestRecordAttr", "Intrinsic Attribute", "Tests a record attribute.", new[] { "Matched", "NotMatched", "Failed" }, new[] { "AttrName", "ExpectedValue" }, new[] { "ReadsRecordAttribute", "BranchesRuleFlow" }, new[] { "Branches rule flow on record-level state." }),

        Def("IsInTable", "Table", "Tests whether configured field values exist in a SelectionList/table.", new[] { "Found", "NotFound", "Empty", "Failed" }, new[] { "SelectionList", "Match fields" }, new[] { "UsesTable", "ReadsField", "BranchesRuleFlow" }, new[] { "Can trigger keyer table-lookup prompts or reject paths when no match is found." }),
        Def("IsInTable2", "Table", "Variant table membership test with SelectionList/table configuration.", new[] { "Found", "NotFound", "Empty", "Failed" }, new[] { "SelectionList", "Match fields" }, new[] { "UsesTable", "ReadsField", "BranchesRuleFlow" }, new[] { "Connects AC lookup configuration to runtime operator table workflows." }),
        Def("SelectTable", "Table", "Selects a row from a configured table/SelectionList.", new[] { "Selected", "NoMatch", "MultipleEntries", "Failed" }, new[] { "SelectionList", "Match fields", "Plug fields" }, new[] { "UsesTable", "MayPlugFields", "MayPromptOperator" }, new[] { "Can open lookup selection UX or plug values automatically depending on configuration." }),
        Def("SelectSelectedListTableApproxMatch", "Table", "Runs an approximate/fuzzy match against a configured SelectionList table.", new[] { "Selected", "NoGoodMatch", "MultipleEntries", "Failed" }, new[] { "SelectionList", "Fuzzy match fields", "Plug fields" }, new[] { "UsesTable", "FuzzyMatch", "MayPromptOperator" }, new[] { "Produces close-match lookup lists where the keyer may choose a row or no good match." }),
        Def("PlugFuzzyMatch", "Table", "Plugs fields from a fuzzy table match.", new[] { "Plugged", "NoMatch", "MultipleEntries", "Failed" }, new[] { "SelectionList", "Plug fields" }, new[] { "UsesTable", "WritesField", "MayChangeWR" }, new[] { "Can auto-populate fields from selected or matched table rows." }),
        Def("CheckSLState4", "Table", "Checks SelectionList state before or after lookup.", new[] { "OK", "Failed", "Empty", "MultipleEntries" }, new[] { "SelectionList" }, new[] { "ReadsSelectionListState", "BranchesRuleFlow" }, new[] { "Controls rerun, persistence, and operator prompt behavior for table lookup flows." }),
        Def("ClearSL", "Table", "Clears SelectionList state.", new[] { "OK", "Failed" }, new[] { "SelectionList" }, new[] { "WritesSelectionListState" }, new[] { "Forces subsequent lookup rules to rebuild candidate state." }),
        Def("LogSL", "Table", "Logs SelectionList state for diagnostic or workflow purposes.", new[] { "OK", "Failed" }, new[] { "SelectionList" }, new[] { "ReadsSelectionListState" }, new[] { "Provides evidence around lookup behavior without proving runtime operator choices." })
    };

    private static readonly Dictionary<string, FunctionDefinition> DefinitionsByName =
        FunctionDefinitions.ToDictionary(d => d.Name, d => d, StringComparer.OrdinalIgnoreCase);

    public static IReadOnlyList<FunctionDefinition> GetDefinitions()
    {
        return FunctionDefinitions;
    }

    public static bool TryGetDefinition(string functionName, out FunctionDefinition definition)
    {
        if (!string.IsNullOrWhiteSpace(functionName) && DefinitionsByName.TryGetValue(functionName.Trim(), out FunctionDefinition? found))
        {
            definition = found;
            return true;
        }

        definition = null!;
        return false;
    }

    public static string InferCategory(string functionName)
    {
        if (TryGetDefinition(functionName, out FunctionDefinition? definition))
            return definition.Category;

        string value = functionName ?? string.Empty;
        if (value.IndexOf("udf", StringComparison.OrdinalIgnoreCase) >= 0 || value.IndexOf("UserDefined", StringComparison.OrdinalIgnoreCase) >= 0) return "User Defined";
        if (value.IndexOf("table", StringComparison.OrdinalIgnoreCase) >= 0 || value.IndexOf("SL", StringComparison.OrdinalIgnoreCase) >= 0 || value.IndexOf("fuzzy", StringComparison.OrdinalIgnoreCase) >= 0) return "Table";
        if (value.IndexOf("date", StringComparison.OrdinalIgnoreCase) >= 0 || value.IndexOf("format", StringComparison.OrdinalIgnoreCase) >= 0 || value.IndexOf("delete", StringComparison.OrdinalIgnoreCase) >= 0 || value.IndexOf("copy", StringComparison.OrdinalIgnoreCase) >= 0) return "Formatting";
        if (value.IndexOf("check", StringComparison.OrdinalIgnoreCase) >= 0 || value.IndexOf("test", StringComparison.OrdinalIgnoreCase) >= 0 || value.IndexOf("is", StringComparison.OrdinalIgnoreCase) == 0 || value.IndexOf("has", StringComparison.OrdinalIgnoreCase) == 0) return "Testing";
        if (value.IndexOf("attr", StringComparison.OrdinalIgnoreCase) >= 0) return "Intrinsic Attribute";
        if (value.StartsWith("_I", StringComparison.OrdinalIgnoreCase)) return "Intrinsic";
        return "Custom / Unknown";
    }

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

    private static FunctionDefinition Def(
        string name,
        string category,
        string description,
        IReadOnlyList<string> statusResults,
        IReadOnlyList<string> parameterRoles,
        IReadOnlyList<string> behaviorFlags,
        IReadOnlyList<string> runtimeImpacts,
        bool deprecated = false,
        string evidence = "Curated AC function catalog seed")
    {
        return new FunctionDefinition
        {
            Name = name,
            Category = category,
            Description = description,
            StatusResults = statusResults,
            ParameterRoles = parameterRoles,
            BehaviorFlags = behaviorFlags,
            RuntimeImpacts = runtimeImpacts,
            Deprecated = deprecated,
            Evidence = evidence
        };
    }
}
