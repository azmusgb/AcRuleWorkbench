using System;
using System.IO;
using System.Linq;

namespace PullACRulesApp;

/// <summary>
/// CLI interaction, option mapping, and comparison helpers for PullACRules.
/// </summary>
public partial class PullACRules
{
    private void ApplyOptions(PullACRulesOptions options)
    {
        if (options == null)
            return;

        probeMode = options.ProbeMode;
        attrModeExplicitlySet = options.AttrModeExplicitlySet;
        includeGlobalResourceExports = options.IncludeGlobalResourceExports;
        maskSensitiveValues = !options.RevealSensitiveValues;
        captureAttrListPayload = options.CaptureAttrListPayload;
        captureAttrListPath = options.CaptureAttrListPath;
        OutputFile.FullValueMode = options.FullValues;

        if (options.ResourceTypes != null && options.ResourceTypes.Length > 0)
            configuredGlobalResourceTypes = options.ResourceTypes;

        if (!string.IsNullOrWhiteSpace(options.BinDir))
            OutputFile.BinDir = options.BinDir;

        OutputFile.SetModeFromArg(options.AttrModeArg);
        OutputFile.SetWhitelistFromArg(options.WhitelistArg);
        OutputFile.SetKeyModeFromArg(options.KeyModeArg);
        OutputFile.SetFormatFromArg(options.FormatArg);
        OutputFile.SetDiagramFormatFromArg(options.DiagramArg);
        OutputFile.SetAstDiagramFormatFromArg(options.AstDiagramArg);
        OutputFile.SetDiagramLayoutFromArg(options.DiagramLayoutArg);

        if (probeMode && !attrModeExplicitlySet)
            OutputFile.AttributeMode = OutputFile.AttrFilterMode.All;
    }

    private void PrintUsage()
    {
        Log("Usage: PullACRules [configPath] [options]");
        Log("Options:");
        Log("  --help | -h | /?                Show this help text");
        Log("  --wizard | --interactive        Step-through prompts in console mode");
        Log("  --ui | --gui                    Launch desktop runner UI");
        Log("  --explore [configPath]          Open desktop UI with the specified config pre-loaded");
        Log("  --attr-mode=all|whitelist|blacklist");
        Log("  --whitelist=small|full");
        Log("  --key-mode=stored|flattened");
        Log("  --format=json|txt|html|csv");
        Log("  --probe[=true|false]");
        Log("  --bin-dir=<path>");
        Log("  --global-resources=true|false");
        Log("  --no-global-resources");
        Log("  --resource-types=Type1,Type2,...");
        Log("  --capture-attrlist[=<path>]");
        Log("  --full-values[=true|false]      Disable preview truncation for higher-fidelity exports");
        Log("  --reveal-sensitive-values[=true|false]  Include unmasked sensitive values in exports");
        Log("  --compare=<path>               Compare primary config against a secondary FWD file");
        Log("  --no-extract                    Skip extraction; only run comparison (requires --compare)");
        Log("  --diagram[=mmd|svg]            Export rule hierarchy as Mermaid flowchart (.mmd)");
        Log("  --ast-diagram[=mmd|svg]        Export abstract syntax tree as Mermaid flowchart (.mmd)");
        Log("  --diagram-layout=tb|lr         Diagram direction (top-bottom or left-right)");
        Log("                                 Use svg to also render via mmdc (npm install -g @mermaid-js/mermaid-cli)");
        Log("                                 Note: static README diagrams can be rendered with: mmdc -i PullACRules.README.md");
    }

    private void RunComparison(string leftPath, string rightPath)
    {
        Log("[Compare] Starting FWD comparison...");
        LastComparisonReportPath = string.Empty;

        try
        {
            var comparer = new FwdComparer(output);
            FwdComparisonResult result = comparer.Compare(leftPath, rightPath);
            string reportPath = comparer.ExportResult(result, OutputFile.BinDir);
            LastComparisonReportPath = reportPath;

            if (OutputFile.Format == OutputFile.ExportFormat.Html)
            {
                string htmlPath = comparer.ExportHtmlResult(result, OutputFile.BinDir);
                Log("[Compare] HTML report available at: {0}", htmlPath);
            }

            comparer.PrintSummary(result);

            EmitRunEvent(PullACRulesRunPhase.Comparison, PullACRulesRunEventKind.Info, "Comparison completed");
        }
        catch (FileNotFoundException ex)
        {
            Log("[Compare] {0}", ex.Message);
            EmitRunEvent(
                PullACRulesRunPhase.Comparison,
                PullACRulesRunEventKind.Error,
                ex.Message,
                PullACRulesRunIssueCategory.ComparisonFailure);
            throw;
        }
        catch (Exception ex)
        {
            Log("[Compare] Error during comparison: {0}", ex.Message);
            EmitRunEvent(
                PullACRulesRunPhase.Comparison,
                PullACRulesRunEventKind.Error,
                ex.Message,
                PullACRulesRunIssueCategory.ComparisonFailure);
            throw;
        }
    }

    private static string PromptWithDefault(string label, string defaultValue)
    {
        Console.Write("{0} [{1}]: ", label, defaultValue ?? string.Empty);
        string value = Console.ReadLine();
        return string.IsNullOrWhiteSpace(value) ? (defaultValue ?? string.Empty) : value.Trim();
    }

    private static string PromptForConfigPath(string defaultValue)
    {
        if (string.IsNullOrWhiteSpace(defaultValue))
        {
            string[] candidates = FindConfigCandidates(Directory.GetCurrentDirectory());
            if (candidates.Length > 0)
            {
                Console.WriteLine("Config files found in current directory:");
                for (int i = 0; i < candidates.Length; i++)
                    Console.WriteLine("  [{0}] {1}", i + 1, candidates[i]);
            }
        }

        while (true)
        {
            string value = PromptWithDefault("Config path", defaultValue);
            if (!string.IsNullOrWhiteSpace(value))
            {
                int index;
                if (int.TryParse(value, out index))
                {
                    string[] candidates = FindConfigCandidates(Directory.GetCurrentDirectory());
                    if (index >= 1 && index <= candidates.Length)
                        return Path.Combine(Directory.GetCurrentDirectory(), candidates[index - 1]);
                }

                return value;
            }

            Console.WriteLine("A config path is required.");
        }
    }

    private static string[] FindConfigCandidates(string directory)
    {
        try
        {
            return Directory.GetFiles(directory, "*.cfd")
                .Select(Path.GetFileName)
                .OrderBy(fileName => fileName, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }
        catch (Exception)
        {
            return Array.Empty<string>();
        }
    }

    private void RunInteractiveWizard(PullACRulesOptions options, out string configPathArg, out string comparePathArg)
    {
        Console.WriteLine("Interactive wizard mode. Press Enter to accept defaults.");

        string defaultConfig = !string.IsNullOrWhiteSpace(options.ConfigPathArg)
            ? options.ConfigPathArg
            : GetStartupConfigPath();

        configPathArg = PromptForConfigPath(defaultConfig);

        string compareInput = PromptWithDefault(
            "Compare against secondary FWD (path or empty to skip)",
            options.CompareConfigPath ?? string.Empty);
        comparePathArg = string.IsNullOrWhiteSpace(compareInput) ? null : compareInput;

        string formatArg = PromptWithDefault(
            "Format (json/txt/html/csv)",
            options.FormatArg ?? OutputFile.Format.ToString().ToLowerInvariant());
        OutputFile.SetFormatFromArg(formatArg);

        string attrModeArg = PromptWithDefault(
            "Attribute mode (all/whitelist/blacklist)",
            options.AttrModeArg ?? OutputFile.AttributeMode.ToString().ToLowerInvariant());
        OutputFile.SetModeFromArg(attrModeArg);

        string whitelistArg = PromptWithDefault(
            "Whitelist profile (small/full)",
            options.WhitelistArg ?? OutputFile.WhitelistMode.ToString().ToLowerInvariant());
        OutputFile.SetWhitelistFromArg(whitelistArg);

        string keyModeArg = PromptWithDefault(
            "Key mode (stored/flattened)",
            options.KeyModeArg ?? OutputFile.KeyMode.ToString().ToLowerInvariant());
        OutputFile.SetKeyModeFromArg(keyModeArg);

        string fullValuesArg = PromptWithDefault(
            "Full values (true/false)",
            options.FullValues ? "true" : OutputFile.FullValueMode ? "true" : "false");
        OutputFile.FullValueMode = IsTruthy(fullValuesArg);

        string diagramArg = PromptWithDefault(
            "Diagram (none/mmd/svg)",
            options.DiagramArg ?? OutputFile.DiagramMode.ToString().ToLowerInvariant());
        OutputFile.SetDiagramFormatFromArg(diagramArg);

        string diagramLayoutArg = PromptWithDefault(
            "Diagram layout (tb/lr)",
            options.DiagramLayoutArg ?? OutputFile.LayoutMode.ToString().ToLowerInvariant());
        OutputFile.SetDiagramLayoutFromArg(diagramLayoutArg);

        string binDirArg = PromptWithDefault("Output directory", OutputFile.BinDir ?? string.Empty);
        if (!string.IsNullOrWhiteSpace(binDirArg))
            OutputFile.BinDir = binDirArg;
    }

    private static bool IsTruthy(string value)
    {
        return value == "1"
            || string.Equals(value, "true", StringComparison.OrdinalIgnoreCase)
            || string.Equals(value, "yes", StringComparison.OrdinalIgnoreCase);
    }
}
