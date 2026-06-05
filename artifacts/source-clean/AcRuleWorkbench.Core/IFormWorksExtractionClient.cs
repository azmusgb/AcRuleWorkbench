namespace AcRuleWorkbench.Core;

public interface IFormWorksExtractionClient
{
    ProbeReport Probe();

    FwdInspectionReport Inspect(FwdInspectionOptions options);

    OcrInspectionReport InspectOcr(OcrInspectionOptions options);

    SmokeReport Smoke(SmokeOptions options);

    StcTreeReport InspectProcessTree(StcTraversalOptions options);

    FipInspectionReport InspectFip(FipInspectionOptions options);

    AcRuleReport InspectAcRules(AcRuleOptions options);

    AcRelationshipReport TraceAcRelationships(AcTraceOptions options);

    AcIndexReport BuildAcIndex(AcRuleOptions options);

    AcDisabledReport AnalyzeDisabledRules(AcDisabledOptions options);
AcDiagnosticsReport BuildAcDiagnostics(AcRuleOptions options);

    AcTreeReport BuildAcTree(AcTreeOptions options);

    AcViewerReport ExportAcViewer(AcViewerOptions options);
}
