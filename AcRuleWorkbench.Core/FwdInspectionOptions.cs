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
        "Tables",
        "SelectionLists",
        "Functions",
        "UDFs",
        "Rules",
        "GlobalResources",
        "Table",
        "Function",
        "DateFormat",
        "UDF",
        "UserDefinedFunction",
        "Charset",
        "RegExpr",
        "Regex",
        "Expression",
        "Template",
        "Store",
        "SelectionList"
    };
}
