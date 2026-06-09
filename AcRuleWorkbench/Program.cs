using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Linq;
using AcRuleWorkbench.Core;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

namespace AcRuleWorkbench;

internal static class Program
{
    private static string? _jsonOutputPath;

    private static readonly IReadOnlyList<IProgramCommandHandler> _handlers = new IProgramCommandHandler[]
    {
        new ProbeCommandHandler(),
        new InspectionCommandHandler(),
        new AcCommandHandler(),
        new ApiServerCommandHandler(),
        new FixtureCommandHandler()
    };

    private static int Main(string[] args)
    {
        bool json = Has(args, "--json");
        bool apiMode = Has(args, "api") || Has(args, "serve-api") || Has(args, "web-test");
        bool verbose = Has(args, "--verbose") || Has(args, "-v");
        _jsonOutputPath = GetValue(args, "--out-json") ?? GetValue(args, "--json-out");
        if (!string.IsNullOrWhiteSpace(_jsonOutputPath))
            json = true;

        using ILoggerFactory loggerFactory = LoggerFactory.Create(builder =>
        {
            builder.AddSimpleConsole(options =>
            {
                options.SingleLine = true;
                options.TimestampFormat = "HH:mm:ss ";
            });

            // Keep JSON output clean. Keep foreground API startup readable by default;
            // pass --verbose when native extraction trace logs are needed.
            builder.SetMinimumLevel(json ? LogLevel.Warning : (apiMode && !verbose ? LogLevel.Warning : LogLevel.Information));
        });

        ILogger<FormWorksExtractionClient> logger = loggerFactory.CreateLogger<FormWorksExtractionClient>();
        IFormWorksExtractionClient client = new FormWorksExtractionClient(logger);

        try
        {
            if (args.Length == 0 || Has(args, "--help") || Has(args, "-h"))
            {
                PrintHelp();
                return 0;
            }

            var context = new CommandContext(args, json, client, loggerFactory);
            foreach (IProgramCommandHandler handler in _handlers)
            {
                if (!handler.CanHandle(args))
                    continue;

                return handler.Execute(context);
            }

            Console.Error.WriteLine("Unknown command.");
            PrintHelp();
            return 2;
        }
        catch (FormWorksInteropException ex)
        {
            WriteError(json, ex.Message, ex.InnerException);
            return 1;
        }
        catch (Exception ex)
        {
            WriteError(json, ex.Message, ex);
            return 1;
        }
    }

    private interface IProgramCommandHandler
    {
        bool CanHandle(string[] args);
        int Execute(CommandContext context);
    }

    private sealed class CommandContext
    {
        public CommandContext(string[] args, bool json, IFormWorksExtractionClient client, ILoggerFactory loggerFactory)
        {
            Args = args ?? throw new ArgumentNullException(nameof(args));
            Client = client ?? throw new ArgumentNullException(nameof(client));
            LoggerFactory = loggerFactory ?? throw new ArgumentNullException(nameof(loggerFactory));
            Json = json;
        }

        public string[] Args { get; }
        public bool Json { get; }
        public IFormWorksExtractionClient Client { get; }
        public ILoggerFactory LoggerFactory { get; }
    }

    private sealed class ProbeCommandHandler : IProgramCommandHandler
    {
        public bool CanHandle(string[] args) => Has(args, "--probe") || Has(args, "probe") || Has(args, "doctor");

        public int Execute(CommandContext context)
        {
            ProbeReport report = context.Client.Probe();
            Output(report, context.Json, PrintProbe);
            return Has(context.Args, "--require-native-ok") && !report.NativeChecksPassed ? 1 : 0;
        }
    }

    private sealed class InspectionCommandHandler : IProgramCommandHandler
    {
        public bool CanHandle(string[] args) => Has(args, "inspect") || Has(args, "stc-process");

        public int Execute(CommandContext context)
        {
            if (Has(context.Args, "inspect"))
            {
                var options = new FwdInspectionOptions
                {
                    Path = GetValue(context.Args, "--path"),
                    IncludeFields = Has(context.Args, "--fields"),
                    RequireNativeOk = Has(context.Args, "--require-native-ok")
                };

                string? resourceTypes = GetValue(context.Args, "--resource-types");
                if (!string.IsNullOrWhiteSpace(resourceTypes))
                {
                    options.ResourceTypes = resourceTypes!
                        .Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries)
                        .Select(s => s.Trim())
                        .Where(s => s.Length > 0)
                        .ToArray();
                }

                FwdInspectionReport report = context.Client.Inspect(options);
                Output(report, context.Json, PrintInspection);
                return 0;
            }

            var stcOptions = new StcTraversalOptions
            {
                Path = GetValue(context.Args, "--path"),
                ProcessName = GetValue(context.Args, "--process"),
                MaxDepth = GetInt(context.Args, "--max-depth", 5),
                MaxNodes = GetInt(context.Args, "--max-nodes", 1500),
                MaxPreviewBytes = GetInt(context.Args, "--max-preview-bytes", 256),
                IncludeDataPreview = !Has(context.Args, "--no-data-preview"),
                IncludeDotNodes = Has(context.Args, "--include-dot-nodes"),
                RequireNativeOk = Has(context.Args, "--require-native-ok")
            };

            StcTreeReport reportStc = context.Client.InspectProcessTree(stcOptions);
            Output(reportStc, context.Json, PrintStcTree);
            return 0;
        }
    }

    private sealed class AcCommandHandler : IProgramCommandHandler
    {
        public bool CanHandle(string[] args)
        {
            return Has(args, "ac-rules") || Has(args, "ac-trace") || Has(args, "ac-field") || Has(args, "ac-attr") || Has(args, "ac-rejects") || Has(args, "ac-index") || Has(args, "ac-diagnostics") || Has(args, "ac-tree") || Has(args, "ac-disabled") || Has(args, "ac-viewer");
        }

        public int Execute(CommandContext context)
        {
            if (Has(context.Args, "ac-rules"))
            {
                var options = new AcRuleOptions
                {
                    Path = GetValue(context.Args, "--path"),
                    ProcessName = GetValue(context.Args, "--process") ?? "AC",
                    Term = GetValue(context.Args, "--term"),
                    Scope = GetValue(context.Args, "--scope"),
                    Function = GetValue(context.Args, "--function"),
                    IncludeRawTokens = Has(context.Args, "--include-raw-tokens"),
                    MaxRawTokensPerScope = GetInt(context.Args, "--max-raw-tokens", 250),
                    MaxScopeCount = GetInt(context.Args, "--max-scopes", 0),
                    RequireNativeOk = Has(context.Args, "--require-native-ok")
                };

                AcRuleReport report = context.Client.InspectAcRules(options);
                Output(report, context.Json, PrintAcRules);
                return 0;
            }

            if (Has(context.Args, "ac-trace"))
            {
                var options = new AcTraceOptions
                {
                    Path = GetValue(context.Args, "--path"),
                    ProcessName = GetValue(context.Args, "--process") ?? "AC",
                    Term = GetValue(context.Args, "--term"),
                    Scope = GetValue(context.Args, "--scope"),
                    Function = GetValue(context.Args, "--function"),
                    Field = GetValue(context.Args, "--field"),
                    Attr = GetValue(context.Args, "--attr"),
                    RelationshipKind = GetValue(context.Args, "--kind"),
                    IncludeRules = Has(context.Args, "--include-rules"),
                    MaxRelationships = GetInt(context.Args, "--max-relationships", 0),
                    RequireNativeOk = Has(context.Args, "--require-native-ok")
                };

                AcRelationshipReport report = context.Client.TraceAcRelationships(options);
                Output(report, context.Json, PrintAcTrace);
                return 0;
            }

            if (Has(context.Args, "ac-field"))
            {
                var options = new AcTraceOptions
                {
                    Path = GetValue(context.Args, "--path"),
                    ProcessName = GetValue(context.Args, "--process") ?? "AC",
                    Field = GetValue(context.Args, "--field") ?? GetValue(context.Args, "--target") ?? GetValue(context.Args, "--term"),
                    IncludeRules = true,
                    MaxRelationships = GetInt(context.Args, "--max-relationships", 0),
                    RequireNativeOk = Has(context.Args, "--require-native-ok")
                };

                AcRelationshipReport report = context.Client.TraceAcRelationships(options);
                Output(report, context.Json, PrintAcTrace);
                return 0;
            }

            if (Has(context.Args, "ac-attr"))
            {
                var options = new AcTraceOptions
                {
                    Path = GetValue(context.Args, "--path"),
                    ProcessName = GetValue(context.Args, "--process") ?? "AC",
                    Attr = GetValue(context.Args, "--attr") ?? GetValue(context.Args, "--target") ?? GetValue(context.Args, "--term"),
                    IncludeRules = true,
                    MaxRelationships = GetInt(context.Args, "--max-relationships", 0),
                    RequireNativeOk = Has(context.Args, "--require-native-ok")
                };

                AcRelationshipReport report = context.Client.TraceAcRelationships(options);
                Output(report, context.Json, PrintAcTrace);
                return 0;
            }

            if (Has(context.Args, "ac-rejects"))
            {
                var options = new AcTraceOptions
                {
                    Path = GetValue(context.Args, "--path"),
                    ProcessName = GetValue(context.Args, "--process") ?? "AC",
                    Term = GetValue(context.Args, "--term"),
                    Scope = GetValue(context.Args, "--scope"),
                    RelationshipKind = "Reject",
                    IncludeRules = true,
                    MaxRelationships = GetInt(context.Args, "--max-relationships", 0),
                    RequireNativeOk = Has(context.Args, "--require-native-ok")
                };

                AcRelationshipReport report = context.Client.TraceAcRelationships(options);
                Output(report, context.Json, PrintAcTrace);
                return 0;
            }

            if (Has(context.Args, "ac-index"))
            {
                var options = new AcRuleOptions
                {
                    Path = GetValue(context.Args, "--path"),
                    ProcessName = GetValue(context.Args, "--process") ?? "AC",
                    Term = GetValue(context.Args, "--term"),
                    Scope = GetValue(context.Args, "--scope"),
                    Function = GetValue(context.Args, "--function"),
                    RequireNativeOk = Has(context.Args, "--require-native-ok")
                };

                AcIndexReport report = context.Client.BuildAcIndex(options);
                Output(report, context.Json, PrintAcIndex);
                return 0;
            }
if (Has(context.Args, "ac-diagnostics"))
            {
                var options = new AcRuleOptions
                {
                    Path = GetValue(context.Args, "--path"),
                    ProcessName = GetValue(context.Args, "--process") ?? "AC",
                    Term = GetValue(context.Args, "--term"),
                    Scope = GetValue(context.Args, "--scope"),
                    Function = GetValue(context.Args, "--function"),
                    RequireNativeOk = Has(context.Args, "--require-native-ok")
                };

                AcDiagnosticsReport report = context.Client.BuildAcDiagnostics(options);
                Output(report, context.Json, PrintAcDiagnostics);
                return 0;
            }

            if (Has(context.Args, "ac-tree"))
            {
                var options = new AcTreeOptions
                {
                    Path = GetValue(context.Args, "--path"),
                    ProcessName = GetValue(context.Args, "--process") ?? "AC",
                    Term = GetValue(context.Args, "--term"),
                    Scope = GetValue(context.Args, "--scope"),
                    IncludeAttributes = Has(context.Args, "--include-attributes"),
                    MaxAttributeValueLength = GetInt(context.Args, "--max-attribute-value-length", 500),
                    MaxHierarchyDepth = GetInt(context.Args, "--max-hierarchy-depth", 256),
                    MaxNodeEntryCount = (uint)Math.Max(1, GetInt(context.Args, "--max-node-entry-count", 100000)),
                    MaskSensitiveValues = !Has(context.Args, "--no-mask-sensitive"),
                    RequireNativeOk = Has(context.Args, "--require-native-ok")
                };

                AcTreeReport report = context.Client.BuildAcTree(options);
                Output(report, context.Json, PrintAcTree);
                return 0;
            }

            if (Has(context.Args, "ac-disabled"))
            {
                var options = new AcDisabledOptions
                {
                    Path = GetValue(context.Args, "--path"),
                    ProcessName = GetValue(context.Args, "--process") ?? "AC",
                    Term = GetValue(context.Args, "--term"),
                    Scope = GetValue(context.Args, "--scope"),
                    Function = GetValue(context.Args, "--function"),
                    State = GetValue(context.Args, "--state"),
                    IncludeRules = true,
                    InheritDisabled = !Has(context.Args, "--no-disabled-inherit"),
                    RequireNativeOk = Has(context.Args, "--require-native-ok")
                };

                AcDisabledReport report = context.Client.AnalyzeDisabledRules(options);
                Output(report, context.Json, PrintAcDisabled);
                return 0;
            }

            var viewerOptions = new AcViewerOptions
            {
                Path = GetValue(context.Args, "--path"),
                ProcessName = GetValue(context.Args, "--process") ?? "AC",
                OutputPath = GetValue(context.Args, "--out") ?? "ac-rule-viewer-live.html",
                Scope = GetValue(context.Args, "--scope"),
                Term = GetValue(context.Args, "--term"),
                Function = GetValue(context.Args, "--function"),
                OpenBrowser = Has(context.Args, "--open"),
                RequireNativeOk = Has(context.Args, "--require-native-ok"),
                ExportProfile = EvidenceExportProfileSettings.Parse(GetValue(context.Args, "--profile") ?? GetValue(context.Args, "--export-profile"))
            };

            AcViewerReport viewerReport = context.Client.ExportAcViewer(viewerOptions);
            Output(viewerReport, context.Json, PrintAcViewer);
            return 0;
        }
    }

    private sealed class ApiServerCommandHandler : IProgramCommandHandler
    {
        public bool CanHandle(string[] args) => Has(args, "api") || Has(args, "serve-api") || Has(args, "api-server") || Has(args, "web-test");

        public int Execute(CommandContext context)
        {
            int port = GetInt(context.Args, "--port", 8787);
            string host = GetValue(context.Args, "--host") ?? "127.0.0.1";
            string? prefix = GetValue(context.Args, "--prefix") ?? GetValue(context.Args, "--url");
            if (string.IsNullOrWhiteSpace(prefix))
                prefix = $"http://{host}:{port}/";

            bool enableDebugApi = Has(context.Args, "--enable-debug-api") && !Has(context.Args, "--disable-debug-api") && !Has(context.Args, "--no-debug-api");
            bool startupSnapshotWarmup = Has(context.Args, "--snapshot-warmup") || Has(context.Args, "--warm-snapshot") || Has(context.Args, "--prebuild-snapshot");
            bool liveLazyMode = !startupSnapshotWarmup && !Has(context.Args, "--no-live-lazy") && !Has(context.Args, "--disable-live-lazy");
            bool allowPathQuery = Has(context.Args, "--allow-path-query");
            var serverOptions = new WorkbenchApiServerOptions
            {
                Prefix = prefix!,
                DefaultFwdPath = GetValue(context.Args, "--path"),
                ViewerPath = GetValue(context.Args, "--viewer") ?? GetValue(context.Args, "--viewer-path"),
                OpenBrowser = Has(context.Args, "--open") || Has(context.Args, "web-test"),
                EnableCors = Has(context.Args, "--enable-cors") && !Has(context.Args, "--no-cors"),
                AllowMutatingCommands = Has(context.Args, "--allow-refresh") || Has(context.Args, "--allow-mutations"),
                EnableDebugApi = enableDebugApi,
                AllowPathQuery = allowPathQuery,
                AllowRemoteBindings = Has(context.Args, "--allow-remote-bind"),
                AllowUnsafeRemoteControls = Has(context.Args, "--allow-unsafe-remote-controls"),
                RedactOperationalDetails = !Has(context.Args, "--expose-operational-details"),
                DisableSnapshotCache = Has(context.Args, "--no-snapshot-cache") || Has(context.Args, "--disable-snapshot-cache"),
                LiveLazyMode = liveLazyMode,
                StartupSnapshotWarmup = startupSnapshotWarmup,
                MaxPendingSnapshotBuilds = Math.Max(1, GetInt(context.Args, "--max-pending-snapshot-builds", 4)),
                MaxPendingLiveSessionBuilds = Math.Max(1, GetInt(context.Args, "--max-pending-live-builds", 4)),
                MaxCachedLiveSessions = Math.Max(1, GetInt(context.Args, "--max-cached-live-sessions", 8)),
                EvidenceExportProfile = EvidenceExportProfileSettings.Parse(GetValue(context.Args, "--profile") ?? GetValue(context.Args, "--export-profile"))
            };

            foreach (string allowedRoot in GetValues(context.Args, "--allowed-path-root"))
            {
                if (!string.IsNullOrWhiteSpace(allowedRoot))
                    serverOptions.AllowedFwdPathRoots.Add(allowedRoot);
            }

            foreach (string allowedProcess in GetValues(context.Args, "--allowed-process"))
            {
                foreach (string item in allowedProcess.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries))
                {
                    if (!string.IsNullOrWhiteSpace(item))
                        serverOptions.AllowedProcessNames.Add(item.Trim());
                }
            }

            WorkbenchApiSafetyPolicy.AddDefaultAllowedPathRoot(serverOptions);
            IReadOnlyList<string> policyErrors = WorkbenchApiSafetyPolicy.Validate(serverOptions);
            if (policyErrors.Count > 0)
            {
                Console.Error.WriteLine("Refusing to start API listener because the requested binding/control policy is unsafe:");
                foreach (string error in policyErrors)
                    Console.Error.WriteLine("- " + error);
                return 2;
            }

            ILogger<WorkbenchApiServer> apiLogger = context.LoggerFactory.CreateLogger<WorkbenchApiServer>();
            var server = new WorkbenchApiServer(context.Client, apiLogger, serverOptions);
            return server.Run();
        }
    }

    private sealed class FixtureCommandHandler : IProgramCommandHandler
    {
        public bool CanHandle(string[] args) => Has(args, "fip") || Has(args, "ocr") || Has(args, "smoke");

        public int Execute(CommandContext context)
        {
            if (Has(context.Args, "fip"))
            {
                var options = new FipInspectionOptions
                {
                    Path = GetValue(context.Args, "--path"),
                    ProcessName = GetValue(context.Args, "--process") ?? "FIP",
                    Page = GetValue(context.Args, "--page"),
                    Variant = GetValue(context.Args, "--variant"),
                    MaxVariants = GetInt(context.Args, "--max-variants", 50),
                    RequireNativeOk = Has(context.Args, "--require-native-ok")
                };

                FipInspectionReport report = context.Client.InspectFip(options);
                Output(report, context.Json, PrintFipInspection);
                return 0;
            }

            if (Has(context.Args, "ocr"))
            {
                var options = new OcrInspectionOptions
                {
                    Path = GetValue(context.Args, "--path"),
                    RequireNativeOk = Has(context.Args, "--require-native-ok")
                };

                OcrInspectionReport report = context.Client.InspectOcr(options);
                Output(report, context.Json, PrintOcrInspection);
                return 0;
            }

            var smokeOptions = new SmokeOptions
            {
                FwdPath = GetValue(context.Args, "--fwd"),
                OcrPath = GetValue(context.Args, "--ocr"),
                RequireNativeOk = !Has(context.Args, "--no-require-native-ok")
            };

            SmokeReport smoke = context.Client.Smoke(smokeOptions);
            Output(smoke, context.Json, PrintSmoke);
            return smoke.Success ? 0 : 1;
        }
    }

    private static void Output<T>(T value, bool json, Action<T> textPrinter)
    {
        if (json)
        {
            if (!string.IsNullOrWhiteSpace(_jsonOutputPath))
            {
                WriteJsonFile(value, _jsonOutputPath!);
                return;
            }

            Console.WriteLine(JsonConvert.SerializeObject(value, Formatting.Indented));
            return;
        }

        textPrinter(value);
    }

    private static void WriteJsonFile<T>(T value, string outputPath)
    {
        string fullPath = Path.GetFullPath(outputPath);
        string? directory = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrWhiteSpace(directory))
            Directory.CreateDirectory(directory!);

        string tempPath = fullPath + ".tmp";
        var serializer = JsonSerializer.Create(new JsonSerializerSettings
        {
            Formatting = Formatting.Indented,
            StringEscapeHandling = StringEscapeHandling.EscapeHtml
        });

        using (var writer = new StreamWriter(tempPath, false, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false)))
        using (var jsonWriter = new JsonTextWriter(writer))
        {
            jsonWriter.Formatting = Formatting.Indented;
            serializer.Serialize(jsonWriter, value);
        }

        if (File.Exists(fullPath))
            File.Delete(fullPath);

        File.Move(tempPath, fullPath);
    }

    private static bool Has(string[] args, string value)
    {
        return args.Any(a => string.Equals(a, value, StringComparison.OrdinalIgnoreCase));
    }

    private static IReadOnlyList<string> GetValues(string[] args, string name)
    {
        var values = new List<string>();
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase))
                values.Add(args[i + 1]);
        }

        return values;
    }

    private static string? GetValue(string[] args, string name)
    {
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase))
                return args[i + 1];
        }

        return null;
    }

    private static int? GetNullableInt(string[] args, string name)
    {
        string? value = GetValue(args, name);
        return int.TryParse(value, out int parsed) ? parsed : null;
    }

    private static int GetInt(string[] args, string name, int defaultValue)
    {
        string? value = GetValue(args, name);
        return int.TryParse(value, out int parsed) ? parsed : defaultValue;
    }

    private static void WriteError(bool json, string message, Exception? ex)
    {
        if (json)
        {
            Console.Error.WriteLine(JsonConvert.SerializeObject(new
            {
                error = message,
                exceptionType = ex?.GetType().Name,
                exceptionMessage = ex?.Message
            }, Formatting.Indented));
            return;
        }

        Console.Error.WriteLine("ERROR: " + message);

        if (ex != null)
            Console.Error.WriteLine("CAUSE: " + ex.GetType().Name + ": " + ex.Message);
    }

    private static void PrintHelp()
    {
        Console.WriteLine("AcRuleWorkbench");
        Console.WriteLine();
        Console.WriteLine("Usage:");
        Console.WriteLine("  AcRuleWorkbench.exe doctor [--require-native-ok] [--json]");
        Console.WriteLine("  AcRuleWorkbench.exe inspect --path C:\\path\\to\\fwd.cfd [--fields] [--json]");
        Console.WriteLine("  AcRuleWorkbench.exe stc-process --path C:\\path\\to\\fwd.cfd --process AC [--max-depth 5] [--json]");
        Console.WriteLine("  AcRuleWorkbench.exe ac-rules --path C:\\path\\to\\fwd.cfd [--term COB] [--json]");
        Console.WriteLine("  AcRuleWorkbench.exe ac-trace --path C:\\path\\to\\fwd.cfd [--field DentalADA.COBIndicator] [--json]");
        Console.WriteLine("  AcRuleWorkbench.exe ac-tree --path C:\\path\\to\\fwd.cfd [--scope DentalADA] [--json]");
        Console.WriteLine("  AcRuleWorkbench.exe ac-index --path C:\\path\\to\\fwd.cfd [--json]");
        Console.WriteLine("  AcRuleWorkbench.exe ac-field --path C:\\path\\to\\fwd.cfd --field DentalADA.COBIndicator [--json]");
        Console.WriteLine("  AcRuleWorkbench.exe ac-attr --path C:\\path\\to\\fwd.cfd --attr RejectLetter [--json]");
        Console.WriteLine("  AcRuleWorkbench.exe ac-rejects --path C:\\path\\to\\fwd.cfd [--json]");
        Console.WriteLine("  AcRuleWorkbench.exe ac-disabled --path C:\\path\\to\\fwd.cfd [--state inherited] [--json]");
        Console.WriteLine("  AcRuleWorkbench.exe ac-viewer --path C:\\path\\to\\fwd.cfd --out ac-rule-viewer-live.html [--open]");
        Console.WriteLine("  AcRuleWorkbench.exe fip --path C:\\path\\to\\fwd.cfd [--page DentalADA --variant Standard] [--json]");
        Console.WriteLine("  AcRuleWorkbench.exe ocr --path C:\\path\\to\\result.ocr [--json]");
        Console.WriteLine("  AcRuleWorkbench.exe smoke --fwd C:\\path\\to\\fwd.cfd --ocr C:\\path\\to\\result.ocr [--json]");
        Console.WriteLine();
        Console.WriteLine("Commands:");
        Console.WriteLine("  doctor | probe | --probe       Print managed/native dependency diagnostics.");
        Console.WriteLine("  inspect                        Open FWD read-only and list inventory.");
        Console.WriteLine("  stc-process                    Traverse private STC tree for AC/FIP/Store/OCR/etc.");
        Console.WriteLine("  ac-rules                       Parse AC rule payloads into structured rule records.");
        Console.WriteLine("  ac-trace                       Classify rule relationships to fields, attrs, rejects, sources.");
        Console.WriteLine("  ac-tree                        Parse the structural AC rule tree from packed rule-list bytes.");
        Console.WriteLine("  ac-diagnostics                 Summarize parser trust, duplicates, and disabled states.");
        Console.WriteLine("  ac-index                       Build a compact semantic index of fields, attrs, options, rejects.");
        Console.WriteLine("  ac-field                       Trace all rules related to a field.");
        Console.WriteLine("  ac-attr                        Trace all rules related to an attribute.");
        Console.WriteLine("  ac-rejects                     Trace reject relationships and messages.");
        Console.WriteLine("  ac-disabled                    Analyze direct and inherited-disabled rule blocks.");
        Console.WriteLine("  ac-viewer                      Export a local interactive HTML hierarchy/rule viewer.");
        Console.WriteLine("  api | serve-api                Start the local product API and optional static viewer host.");
        Console.WriteLine("  web-test                       Start the local API and open the viewer automatically.");
        Console.WriteLine("    API options: --path <fwd.cfd> --port <n> --viewer <ac-rule-viewer.html> --open --allow-refresh [--enable-debug-api] [--allow-path-query --allowed-path-root <dir>] [--enable-cors] [--no-snapshot-cache]");
        Console.WriteLine("  fip                            Inspect FIP dropout regions and OMR field config.");
        Console.WriteLine("  ocr                            Open OCR2 result file and list fields.");
        Console.WriteLine("  smoke                          Validate actual FWD/OCR fixtures.");
        Console.WriteLine();
        Console.WriteLine("Useful examples:");
        Console.WriteLine("  AcRuleWorkbench.exe ac-index --path C:\\rri\\ddce\\configs\\Server\\R1\\fwd\\fwd.cfd --json > ac-index.json");
        Console.WriteLine("  AcRuleWorkbench.exe ac-field --path C:\\rri\\ddce\\configs\\Server\\R1\\fwd\\fwd.cfd --field DentalADA.COBIndicator --json > ac-cobindicator-field.json");
        Console.WriteLine("  AcRuleWorkbench.exe ac-attr --path C:\\rri\\ddce\\configs\\Server\\R1\\fwd\\fwd.cfd --attr RejectLetter --json > ac-rejectletter-attr.json");
        Console.WriteLine("  AcRuleWorkbench.exe ac-rejects --path C:\\rri\\ddce\\configs\\Server\\R1\\fwd\\fwd.cfd --json > ac-rejects.json");
        Console.WriteLine("  AcRuleWorkbench.exe ac-disabled --path C:\\rri\\ddce\\configs\\Server\\R1\\fwd\\fwd.cfd --json > ac-disabled.json");
        Console.WriteLine("  AcRuleWorkbench.exe ac-tree --path C:\\rri\\ddce\\configs\\Server\\R1\\fwd\\fwd.cfd --scope DentalADA --json > ac-tree-dentalada.json");
        Console.WriteLine("  AcRuleWorkbench.exe ac-viewer --path C:\\rri\\ddce\\configs\\Server\\R1\\fwd\\fwd.cfd --out ac-rule-viewer-live.html --open");
        Console.WriteLine();
        Console.WriteLine("Options:");
        Console.WriteLine("  --path <path>                  Path to fwd.cfd/fwd.sfd/fwd.fwd or OCR result file.");
        Console.WriteLine("  --process <name>               Process name for STC/FIP inspection, e.g. AC, FIP, Store.");
        Console.WriteLine("  --fields                       Also enumerate document/page fields for FWD.");
        Console.WriteLine("  --max-depth <n>                STC traversal depth. Default 5.");
        Console.WriteLine("  --max-nodes <n>                STC traversal node cap. Default 1500.");
        Console.WriteLine("  --max-preview-bytes <n>        STC binary/text preview byte cap. Default 256.");
        Console.WriteLine("  --term <text>                  AC rule/search term.");
        Console.WriteLine("  --scope <text>                 AC scope filter, e.g. DentalADA or Dental_Doc.");
        Console.WriteLine("  --function <text>              AC function filter, e.g. _IRejectFields.");
        Console.WriteLine("  --field <text>                 AC relationship field filter, e.g. DentalADA.COBIndicator.");
        Console.WriteLine("  --attr <text>                  AC relationship attribute filter, e.g. RejectLetter.");
        Console.WriteLine("  --kind <text>                  AC relationship kind filter, e.g. RejectsField or ReadsAttribute.");
        Console.WriteLine("  --state <text>                 Disabled state filter: direct, inherited, possible, enabled.");
        Console.WriteLine("  --target <text>                Alternate shorthand for --field/--attr in focused commands.");
        Console.WriteLine("  --out <path>                   Output path for ac-viewer HTML.");
        Console.WriteLine("  --profile <name>               Developer export depth: viewer-safe, diagnostic, or full-evidence. Default viewer-safe.");
        Console.WriteLine("  --open                         Open generated viewer/API test harness in the default browser.");
        Console.WriteLine("  --port <n>                     API server port. Default 8787.");
        Console.WriteLine("  --host <host>                  API server host. Default 127.0.0.1.");
        Console.WriteLine("  --prefix <url>                 API server HttpListener prefix, e.g. http://127.0.0.1:8787/.");
        Console.WriteLine("  --allow-remote-bind            Permit a non-loopback API prefix after explicit review.");
        Console.WriteLine("  --allow-unsafe-remote-controls Permit CORS/debug/refresh/path-query on a non-loopback API prefix.");
        Console.WriteLine("  --allowed-path-root <dir>      Required allowlist root when --allow-path-query is used without --path.");
        Console.WriteLine("  --allowed-process <names>      Optional comma-separated process allowlist for snapshot/live caches.");
        Console.WriteLine("  --no-cors                      Disable CORS headers on the local API server.");
        Console.WriteLine("  --include-raw-tokens           Include parser raw token samples per AC scope/rule.");
        Console.WriteLine("  --max-raw-tokens <n>           Raw token cap per AC scope. Default 250.");
        Console.WriteLine("  --max-scopes <n>               Optional AC scope cap. Default 0/no cap.");
        Console.WriteLine("  --include-attributes           AC tree: include masked raw AttrList values on nodes.");
        Console.WriteLine("  --no-mask-sensitive            AC tree/private dumps: do not mask sensitive key values.");
        Console.WriteLine("  --max-hierarchy-depth <n>      AC tree structural parser depth guard. Default 256.");
        Console.WriteLine("  --max-node-entry-count <n>     AC tree structural parser count guard. Default 100000.");
        Console.WriteLine("  --no-disabled-inherit          For ac-disabled, only mark direct disabled rules.");
        Console.WriteLine("  --no-data-preview              Do not read STC Data/Value previews.");
        Console.WriteLine("  --include-dot-nodes            Include hidden/internal STC children like .stcmeta.");
        Console.WriteLine("  --page <name>                  FIP page filter.");
        Console.WriteLine("  --variant <name>               FIP variant filter; use with --page.");
        Console.WriteLine("  --max-variants <n>             FIP variant cap. Default 50.");
        Console.WriteLine("  --require-native-ok            Fail command if official native version checks fail.");
        Console.WriteLine("  --json                         Emit clean JSON. Logs are suppressed in JSON mode.");
        Console.WriteLine("  --out-json <path>              Write JSON directly to a file atomically instead of stdout; prevents PowerShell truncation/encoding problems.");
        Console.WriteLine("  --verbose | -v                 Show detailed native extraction info logs during API startup.");
    }

    private static void PrintProbe(ProbeReport report)
    {
        Console.WriteLine("Dependency Probe");
        Console.WriteLine("================");
        Console.WriteLine("Process bitness : " + (report.Is64BitProcess ? "64-bit" : "32-bit"));
        Console.WriteLine("Base directory  : " + report.BaseDirectory);
        Console.WriteLine("Current dir     : " + report.CurrentDirectory);
        Console.WriteLine();

        Console.WriteLine("Managed assemblies");
        foreach (AssemblyProbeResult assembly in report.Assemblies)
        {
            Console.WriteLine($"- {assembly.Name}");
            Console.WriteLine($"  Loaded  : {assembly.Loaded}");
            Console.WriteLine($"  Version : {assembly.Version ?? "(unknown)"}");
            Console.WriteLine($"  Location: {assembly.Location ?? "(unknown)"}");
            if (!string.IsNullOrWhiteSpace(assembly.Error))
                Console.WriteLine($"  Error   : {assembly.Error}");
        }

        Console.WriteLine();
        Console.WriteLine("Official native version checks");
        foreach (NativeVersionCheckResult check in report.NativeVersionChecks)
        {
            Console.WriteLine($"- {check.NativeDllName}");
            Console.WriteLine($"  Managed checker : {check.CheckerTypeName}");
            Console.WriteLine($"  Instantiated    : {check.CheckerInstantiated}");
            Console.WriteLine($"  Passed          : {check.Passed}");
            if (check.Messages.Count == 0)
                Console.WriteLine("  Messages        : (none)");
            else
                foreach (string message in check.Messages)
                    Console.WriteLine("  Message         : " + message);
        }

        Console.WriteLine();
        Console.WriteLine("Native imports detected from DllImport");
        if (report.RequiredNativeDllNames.Count == 0)
            Console.WriteLine("- None detected or reflection failed.");
        else
            foreach (string native in report.RequiredNativeDllNames.Distinct(StringComparer.OrdinalIgnoreCase))
                Console.WriteLine("- " + native);

        Console.WriteLine();
        Console.WriteLine("Native dependency placement");
        foreach (NativeDependencyProbeResult native in report.NativeDependencies)
        {
            Console.WriteLine($"- {native.Name}");
            Console.WriteLine($"  Next to exe: {native.FoundNextToExe}  {native.ExeDirectoryCandidate}");
            Console.WriteLine($"  Current dir: {native.FoundInCurrentDirectory}  {native.CurrentDirectoryCandidate}");
        }

        Console.WriteLine();
        Console.WriteLine("Native checks passed: " + report.NativeChecksPassed);
        Console.WriteLine();
        Console.WriteLine("Notes");
        foreach (string note in report.Notes)
            Console.WriteLine("- " + note);
    }

    private static void PrintInspection(FwdInspectionReport report)
    {
        Console.WriteLine("FWD Inspection");
        Console.WriteLine("==============");
        Console.WriteLine("Path         : " + report.Path);
        Console.WriteLine("Release      : " + (report.ReleaseString ?? "(unknown)"));
        Console.WriteLine("Release date : " + (report.ReleaseDateString ?? "(unknown)"));
        Console.WriteLine("Release no.  : " + (report.ReleaseNumber?.ToString() ?? "(unknown)"));
        Console.WriteLine();

        PrintList("Documents", report.Documents);
        PrintList("Pages", report.Pages);
        PrintList("Batches", report.Batches);
        PrintList("Processes", report.Processes);

        Console.WriteLine("Page variants");
        foreach (PageVariantBucket bucket in report.PageVariants)
        {
            string variants = bucket.Variants.Count == 0 ? "(none)" : string.Join(", ", bucket.Variants.Take(50));
            Console.WriteLine($"- {bucket.Page}: {variants}" + (bucket.Variants.Count > 50 ? $" ... {bucket.Variants.Count - 50} more" : ""));
        }

        Console.WriteLine();
        Console.WriteLine("Resources");
        foreach (ResourceBucket bucket in report.Resources)
        {
            Console.WriteLine($"- {bucket.Type}: {bucket.Names.Count}");
            foreach (string name in bucket.Names.Take(25))
                Console.WriteLine("  - " + name);
            if (bucket.Names.Count > 25)
                Console.WriteLine($"  ... {bucket.Names.Count - 25} more");
        }

        if (report.Fields.Count > 0)
        {
            Console.WriteLine();
            Console.WriteLine("Fields");
            foreach (FieldBucket bucket in report.Fields)
            {
                Console.WriteLine($"- {bucket.ScopeType}: {bucket.ScopeName} ({bucket.Fields.Count})");
                foreach (FieldSummary field in bucket.Fields.Take(50))
                    Console.WriteLine($"  - {field.Name} | Type={field.Type ?? "?"} | Rect={field.Geometry ?? "?"} | Subfields={field.SubfieldCount}");

                if (bucket.Fields.Count > 50)
                    Console.WriteLine($"  ... {bucket.Fields.Count - 50} more");
            }
        }

        PrintWarnings(report.Warnings);
    }

    private static void PrintStcTree(StcTreeReport report)
    {
        Console.WriteLine("STC Process Tree");
        Console.WriteLine("================");
        Console.WriteLine("FWD      : " + report.FwdPath);
        Console.WriteLine("Process  : " + report.ProcessName);
        Console.WriteLine("Depth    : " + report.MaxDepth);
        Console.WriteLine("Nodes    : " + report.VisitedNodeCount);
        Console.WriteLine("Truncated: " + report.Truncated);
        Console.WriteLine();

        foreach (StcNodeSummary node in report.Nodes.Take(200))
        {
            string indent = new string(' ', node.Depth * 2);
            Console.WriteLine($"{indent}- {node.Name} [{(node.IsCollection == true ? "collection" : "node")}] children={node.ChildCount?.ToString() ?? "?"} data={node.DataLength?.ToString() ?? "?"}");
            if (!string.IsNullOrWhiteSpace(node.ValuePreview))
                Console.WriteLine($"{indent}  value: {node.ValuePreview}");
            if (!string.IsNullOrWhiteSpace(node.DataPreviewText))
                Console.WriteLine($"{indent}  data : {node.DataPreviewText}");
        }

        if (report.Nodes.Count > 200)
            Console.WriteLine($"... {report.Nodes.Count - 200} more nodes. Use --json for full output.");

        PrintWarnings(report.Warnings);
    }


    private static void PrintAcRules(AcRuleReport report)
    {
        Console.WriteLine("AC Rule Inventory");
        Console.WriteLine("=================");
        Console.WriteLine("FWD      : " + report.FwdPath);
        Console.WriteLine("Process  : " + report.ProcessName);
        Console.WriteLine("Scopes   : " + report.ScopeCount);
        Console.WriteLine("Rules    : " + report.RuleCount);
        Console.WriteLine();

        Console.WriteLine("Rules by function");
        foreach (AcRuleCount count in report.RulesByFunction.Take(25))
            Console.WriteLine($"- {count.Name}: {count.Count}");

        Console.WriteLine();
        Console.WriteLine("Rules");
        foreach (AcRuleSummary rule in report.Rules.Take(100))
        {
            Console.WriteLine($"- [{rule.ScopeType}:{rule.ScopeName}] #{rule.RuleIndex} {rule.RuleName ?? "(unnamed)"}");
            Console.WriteLine($"  Function: {rule.FunctionName ?? "(missing)"}");
            if (!string.IsNullOrWhiteSpace(rule.DisabledState) && rule.DisabledState != AcDisabledStates.Enabled)
                Console.WriteLine($"  Disabled: {rule.DisabledState} ({rule.DisabledConfidence}) {rule.DisabledReason}");
            if (!string.IsNullOrWhiteSpace(rule.RuleGuid))
                Console.WriteLine($"  GUID    : {rule.RuleGuid}");
            if (rule.Sources.Count > 0)
                Console.WriteLine($"  Sources : {string.Join(", ", rule.Sources)}");
            if (rule.ActionNames.Count > 0)
                Console.WriteLine($"  Actions : {string.Join(", ", rule.ActionNames)}");
            foreach (var param in rule.Parameters.Take(6))
                Console.WriteLine($"  {param.Key}: {string.Join(", ", param.Value.Take(5))}");
        }

        if (report.Rules.Count > 100)
            Console.WriteLine($"... {report.Rules.Count - 100} more rules. Use --json for full output.");

        PrintWarnings(report.Warnings);
    }

    private static void PrintAcTrace(AcRelationshipReport report)
    {
        Console.WriteLine("AC Relationship Trace");
        Console.WriteLine("=====================");
        Console.WriteLine("FWD           : " + report.FwdPath);
        Console.WriteLine("Process       : " + report.ProcessName);
        Console.WriteLine("Rules         : " + report.RuleCount);
        Console.WriteLine("Action refs   : " + report.RelationshipCount);
        Console.WriteLine("Truncated     : " + report.Truncated);
        Console.WriteLine();

        Console.WriteLine("Relationships by kind");
        foreach (AcRuleCount count in report.RelationshipsByKind.Take(25))
            Console.WriteLine($"- {count.Name}: {count.Count}");

        Console.WriteLine();
        Console.WriteLine("Relationships");
        foreach (AcRuleRelationship relationship in report.Relationships.Take(150))
        {
            Console.WriteLine($"- {relationship.Kind} {relationship.TargetType}: {relationship.Target}");
            Console.WriteLine($"  Rule : [{relationship.ScopeType}:{relationship.ScopeName}] #{relationship.RuleIndex} {relationship.RuleName ?? "(unnamed)"}");
            Console.WriteLine($"  Func : {relationship.FunctionName ?? "(missing)"}");
            if (!string.IsNullOrWhiteSpace(relationship.Evidence))
                Console.WriteLine($"  Evidence: {relationship.Evidence}");
        }

        if (report.Relationships.Count > 150)
            Console.WriteLine($"... {report.Relationships.Count - 150} more relationships. Use --json for full output.");

        PrintWarnings(report.Warnings);
    }


    private static void PrintAcIndex(AcIndexReport report)
    {
        Console.WriteLine("AC Semantic Index");
        Console.WriteLine("=================");
        Console.WriteLine("FWD           : " + report.FwdPath);
        Console.WriteLine("Process       : " + report.ProcessName);
        Console.WriteLine("Rules         : " + report.RuleCount);
        Console.WriteLine("Action refs   : " + report.RelationshipCount);
        Console.WriteLine();

        PrintCounts("Rules by scope", report.RulesByScope, 20);
        PrintCounts("Rules by function", report.RulesByFunction, 25);
        PrintCounts("Relationships by kind", report.RelationshipsByKind, 25);
        PrintCounts("Fields by relationship count", report.FieldsByRelationshipCount, 30);
        PrintCounts("Attributes by relationship count", report.AttributesByRelationshipCount, 30);
        PrintCounts("Options by relationship count", report.OptionsByRelationshipCount, 25);
        PrintCounts("Reject messages by count", report.RejectMessagesByCount, 20);
        PrintCounts("Disabled rules by state", report.DisabledRulesByState, 20);
        PrintCounts("Disabled rules by scope", report.DisabledRulesByScope, 20);

        PrintWarnings(report.Warnings);
    }

    private static void PrintCounts(string title, IReadOnlyCollection<AcRuleCount> counts, int limit)
    {
        Console.WriteLine(title);
        Console.WriteLine(new string('-', title.Length));

        if (counts.Count == 0)
        {
            Console.WriteLine("(none)");
            Console.WriteLine();
            return;
        }

        foreach (AcRuleCount count in counts.Take(limit))
            Console.WriteLine($"- {count.Name}: {count.Count}");

        if (counts.Count > limit)
            Console.WriteLine($"... {counts.Count - limit} more. Use --json for full output.");

        Console.WriteLine();
    }

    private static void PrintAcTree(AcTreeReport report)
    {
        Console.WriteLine("AC Structural Rule Tree");
        Console.WriteLine("=======================");
        Console.WriteLine("Path        : " + report.FwdPath);
        Console.WriteLine("Process     : " + report.ProcessName);
        Console.WriteLine("Scopes      : " + report.ScopeCount);
        Console.WriteLine("Nodes       : " + report.NodeCount);
        Console.WriteLine("Rule nodes  : " + report.RuleNodeCount);
        Console.WriteLine("Edges       : " + report.EdgeCount);
        Console.WriteLine("Max depth   : " + report.MaxHierarchyLevel);
        Console.WriteLine("Disabled    : direct=" + report.DirectDisabledCount + ", inherited=" + report.InheritedDisabledCount);
        Console.WriteLine("Diagnostics : " + report.DiagnosticCount + ", non-rule scopes=" + report.NonRuleTreeScopeCount);
        Console.WriteLine();

        Console.WriteLine("Scopes");
        Console.WriteLine("------");
        foreach (AcTreeScopeReport scope in report.Scopes)
            Console.WriteLine($"- {scope.ScopePath}: rules={scope.RuleNodeCount}, nodes={scope.NodeCount}, depth={scope.MaxHierarchyLevel}, disabled={scope.DirectDisabledCount}/{scope.InheritedDisabledCount}");

        if (report.Diagnostics.Count > 0)
        {
            Console.WriteLine();
            Console.WriteLine("Diagnostics");
            Console.WriteLine("-----------");
            foreach (AcTreeDiagnostic diagnostic in report.Diagnostics.Take(50))
                Console.WriteLine($"- [{diagnostic.Severity}] {diagnostic.ScopePath} {diagnostic.Category}: {diagnostic.Message}");
        }

        if (report.Warnings.Count > 0)
        {
            Console.WriteLine();
            Console.WriteLine("Warnings");
            Console.WriteLine("--------");
            foreach (string warning in report.Warnings.Take(50))
                Console.WriteLine("- " + warning);
        }
    }

    private static void PrintAcDiagnostics(AcDiagnosticsReport report)
    {
        Console.WriteLine("AC Diagnostics");
        Console.WriteLine("==============");
        Console.WriteLine("FWD                   : " + report.FwdPath);
        Console.WriteLine("Process               : " + report.ProcessName);
        Console.WriteLine("Scopes                : " + report.ScopeCount);
        Console.WriteLine("Rules                 : " + report.RuleCount);
        Console.WriteLine("Relationships         : " + report.RelationshipCount);
        Console.WriteLine("Missing RuleID        : " + report.MissingRuleIdCount);
        Console.WriteLine("Missing function      : " + report.MissingFunctionCount);
        Console.WriteLine("Rules with actions    : " + report.RulesWithActionNamesCount);
        Console.WriteLine("Rules with ActionMap  : " + report.RulesWithActionMapCount);
        Console.WriteLine("Unknown action target : " + report.UnknownActionTargetCount);
        Console.WriteLine("Disabled direct       : " + report.DisabledDirectCount);
        Console.WriteLine("Possibly inherited    : " + report.PossiblyDisabledInheritedCount);
        Console.WriteLine();

        PrintCounts("Flow edges by kind", report.FlowEdgesByKind, 20);
        PrintCounts("Flow edges by confidence", report.FlowEdgesByConfidence, 20);
        PrintCounts("Rules by scope", report.RulesByScope, 20);

        Console.WriteLine("Diagnostics");
        Console.WriteLine("-----------");
        foreach (AcParserDiagnostic diagnostic in report.Diagnostics.Take(30))
        {
            Console.WriteLine($"- [{diagnostic.Severity}] {diagnostic.Category}: {diagnostic.Message} ({diagnostic.Count})");
            foreach (string example in diagnostic.Examples.Take(5))
                Console.WriteLine("  - " + example);
        }

        if (report.DuplicateRuleGuids.Count > 0)
        {
            Console.WriteLine();
            Console.WriteLine("Duplicate Rule GUIDs");
            Console.WriteLine("--------------------");
            foreach (AcDuplicateRuleGuidDiagnostic duplicate in report.DuplicateRuleGuids.Take(25))
                Console.WriteLine($"- {duplicate.RuleGuid}: {duplicate.Count}");
        }

        PrintWarnings(report.Warnings);
    }

    private static void PrintAcDisabled(AcDisabledReport report)
    {
        Console.WriteLine("AC Disabled Analysis");
        Console.WriteLine("====================");
        Console.WriteLine("FWD                  : " + report.FwdPath);
        Console.WriteLine("Process              : " + report.ProcessName);
        Console.WriteLine("Rules                : " + report.RuleCount);
        Console.WriteLine("Direct disabled      : " + report.DirectDisabledCount);
        Console.WriteLine("Inherited disabled   : " + report.InheritedDisabledCount);
        Console.WriteLine("Possibly inherited   : " + report.PossiblyInheritedDisabledCount);
        Console.WriteLine("Enabled              : " + report.EnabledCount);
        Console.WriteLine();

        PrintCounts("Rules by disabled state", report.RulesByDisabledState, 20);
        PrintCounts("Rules by scope", report.RulesByScope, 25);

        Console.WriteLine("Disabled blocks");
        Console.WriteLine("---------------");
        foreach (AcDisabledBlock block in report.DisabledBlocks.Take(50))
        {
            Console.WriteLine($"- [{block.ScopeType}:{block.ScopeName}] #{block.AncestorRuleIndex} {block.AncestorRuleName ?? "(unnamed)"}");
            Console.WriteLine($"  Affected: {block.AffectedRuleCount}; Confidence: {block.Confidence}; Method: {block.BoundaryMethod}");
            if (block.AffectedRuleIndexes.Count > 0)
                Console.WriteLine($"  Rule indexes: {string.Join(", ", block.AffectedRuleIndexes.Take(20))}{(block.AffectedRuleIndexes.Count > 20 ? " ..." : string.Empty)}");
        }

        if (report.DisabledBlocks.Count > 50)
            Console.WriteLine($"... {report.DisabledBlocks.Count - 50} more blocks. Use --json for full output.");

        Console.WriteLine();
        Console.WriteLine("Rules");
        Console.WriteLine("-----");
        foreach (AcRuleSummary rule in report.Rules.Take(100))
        {
            Console.WriteLine($"- [{rule.ScopeType}:{rule.ScopeName}] #{rule.RuleIndex} {rule.RuleName ?? "(unnamed)"}");
            Console.WriteLine($"  State: {rule.DisabledState}; Confidence: {rule.DisabledConfidence}");
            if (rule.DisabledAncestorRuleIndex.HasValue)
                Console.WriteLine($"  Inherited from: #{rule.DisabledAncestorRuleIndex} {rule.DisabledAncestorRuleName}");
            if (!string.IsNullOrWhiteSpace(rule.DisabledReason))
                Console.WriteLine("  Reason: " + rule.DisabledReason);
        }

        if (report.Rules.Count > 100)
            Console.WriteLine($"... {report.Rules.Count - 100} more disabled-related rules. Use --json for full output.");

        PrintWarnings(report.Warnings);
    }

    private static void PrintAcViewer(AcViewerReport report)
    {
        Console.WriteLine("FW Editor Viewer Export");
        Console.WriteLine("=======================");
        Console.WriteLine("FWD           : " + report.FwdPath);
        Console.WriteLine("Output        : " + report.OutputPath);
        Console.WriteLine("Scopes        : " + report.ScopeCount);
        Console.WriteLine("Rules         : " + report.RuleCount);
        Console.WriteLine("Action refs   : " + report.RelationshipCount);
                Console.WriteLine("Opened browser: " + report.OpenedBrowser);
        PrintWarnings(report.Warnings);
    }

    private static void PrintFipInspection(FipInspectionReport report)
    {
        Console.WriteLine("FIP Inspection");
        Console.WriteLine("==============");
        Console.WriteLine("FWD      : " + report.FwdPath);
        Console.WriteLine("Process  : " + report.ProcessName);
        Console.WriteLine("Variants : " + report.VariantCountInspected);
        Console.WriteLine("Truncated: " + report.Truncated);
        Console.WriteLine();

        foreach (FipVariantReport variant in report.Variants.Take(100))
        {
            Console.WriteLine($"- {variant.Page}.{variant.Variant}: dropout={variant.DropoutRegionCount}, omr={variant.OmrFieldCount}");
            foreach (FipOmrFieldSummary omr in variant.OmrFields.Take(20))
                Console.WriteLine($"  - OMR {omr.Name}: rect={omr.Geometry}, subfields={omr.SubfieldCount}");
        }

        PrintWarnings(report.Warnings);
    }

    private static void PrintOcrInspection(OcrInspectionReport report)
    {
        Console.WriteLine("OCR2 Inspection");
        Console.WriteLine("===============");
        Console.WriteLine("Path     : " + report.Path);
        Console.WriteLine("FileType : " + (report.FileType ?? "(unknown)"));
        Console.WriteLine();
        PrintList("Fields", report.FieldNames);
        PrintWarnings(report.Warnings);
    }

    private static void PrintSmoke(SmokeReport report)
    {
        Console.WriteLine("Smoke Test");
        Console.WriteLine("==========");
        Console.WriteLine("Success: " + report.Success);
        Console.WriteLine();

        if (report.Fwd != null)
        {
            Console.WriteLine($"FWD OK: {report.Fwd.Path}");
            Console.WriteLine($"  Documents: {report.Fwd.Documents.Count}");
            Console.WriteLine($"  Pages    : {report.Fwd.Pages.Count}");
            Console.WriteLine($"  Processes: {report.Fwd.Processes.Count}");
        }

        if (report.Ocr != null)
        {
            Console.WriteLine($"OCR OK: {report.Ocr.Path}");
            Console.WriteLine($"  Fields: {report.Ocr.FieldNames.Count}");
        }

        PrintWarnings(report.Warnings);

        if (report.Failures.Count > 0)
        {
            Console.WriteLine();
            Console.WriteLine("Failures");
            foreach (string failure in report.Failures)
                Console.WriteLine("- " + failure);
        }
    }

    private static void PrintList(string label, System.Collections.Generic.IReadOnlyCollection<string> values)
    {
        Console.WriteLine(label);
        Console.WriteLine(new string('-', label.Length));

        if (values.Count == 0)
        {
            Console.WriteLine("(none)");
            Console.WriteLine();
            return;
        }

        foreach (string value in values.Take(50))
            Console.WriteLine("- " + value);

        if (values.Count > 50)
            Console.WriteLine($"... {values.Count - 50} more");

        Console.WriteLine();
    }

    private static void PrintWarnings(System.Collections.Generic.IReadOnlyCollection<string> warnings)
    {
        if (warnings.Count == 0)
            return;

        Console.WriteLine();
        Console.WriteLine("Warnings");
        foreach (string warning in warnings)
            Console.WriteLine("- " + warning);
    }
}
