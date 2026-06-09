using System.Threading;

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

    /// <summary>
    /// Resource type tokens passed directly to FWD_ResourceListGet.
    ///
    /// Keep this list to native resource-type identifiers only. Human-facing labels
    /// such as User Defined Function or Selection List are not valid FWD
    /// resource type parameters and cause FWD_ResourceListGet to return -1996
    /// (unexpected parameter). Those labels belong in the UI/model layer, not in
    /// the native probe list.
    /// </summary>
    public string[] ResourceTypes { get; set; } =
    {
        "ACRuleList",
        "Function",
        "Table",
        "DateFormat",
        "RegExpr",
        "CharSet",
        "Charset",
        "Template",
        "TableSelector",
        "SelectionList",
        "UDF",
        "UserDefinedFunction",
        "UserDefined"
    };
    public CancellationToken CancellationToken { get; set; } = CancellationToken.None;

}
