namespace AcRuleWorkbench.Core;

public sealed class FwdInspectionOptions
{
    public string? Path { get; set; }

    public bool IncludeFields { get; set; }

    public bool RequireNativeOk { get; set; }

    public bool IncludeResourceConfigs { get; set; } = false;

    public bool IncludeResourcePrivateTrees { get; set; } = false;

    public int MaxPrivateTreeDepth { get; set; } = 6;

    public int MaxPrivateTreeNodes { get; set; } = 2000;

    public string[] ResourceTypes { get; set; } =
    {
        "Table",
        "Tables",
        "SelectionList",
        "SelectionLists",
        "Function",
        "Functions",
        "DateFormat",
        "DateFormats",
        "UDF",
        "UDFs",
        "UserDefinedFunction",
        "UserDefinedFunctions",
        "Rule",
        "Rules",
        "GlobalResource",
        "GlobalResources",
        "Charset",
        "Charsets",
        "CharSet",
        "CharSets",
        "RegExpr",
        "RegExprs",
        "Regex",
        "Regexes",
        "RegularExpression",
        "RegularExpressions",
        "Expression",
        "Expressions",
        "Template",
        "Templates",
        "Store",
        "Stores",
        "Format",
        "Formats",
        "Lookup",
        "Lookups",
        "LookupTable",
        "LookupTables"
    };
}
