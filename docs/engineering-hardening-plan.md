# AC Rule Workbench Engineering Hardening Plan

This plan records the current production direction for the Workbench. It is intentionally practical: reduce ambiguity, keep the product read-only, and make evidence limitations visible at API and UI boundaries.

## Product intent

AC Rule Workbench is a static configuration inspection tool for FormWorks / Document Capture Manager FWD/CFD files. It does not execute native AC rules and must not claim runtime truth that it did not observe.

The core product questions are:

- Where is a rule located?
- What function does it call?
- What fields, attributes, tables, UDF/function resources, and filerefs does it reference?
- What status/action branches can it take?
- Which evidence is structural, inventory-derived, inferred, or diagnostic?
- What changed between extracted snapshots?

## Evidence hierarchy

Use this order whenever API/viewer labels are ambiguous:

1. **Structural rule tree** — hierarchy, order, parent/child relation, branch/action routing, disabled inheritance.
2. **Canonical FWD inventory** — documents, pages, variants, fields, batches, processes, and resources exposed through the managed wrapper.
3. **Private STC/config evidence** — process-private and resource-private nodes. Useful, but label as extracted configuration, not runtime execution.
4. **Relationship evidence** — parsed field/attribute/table/source/UDF references from rules.
5. **Heuristic/inferred evidence** — helpful discovery only; must be labeled as inferred.

## Current refactor decisions

### Keep

- Local-first HTTP API using `HttpListener`.
- Read-only posture.
- `/api/v1` as the product contract.
- Debug/harness surfaces guarded behind `--enable-debug-api`.
- Legacy routes as compatibility surfaces only.
- Viewer sidecar assets for offline/local serving.

### Remove from normal source delivery

- `bin/` and `obj/` build products.
- `TestResults/` output.
- `ForReferenceOnly/` duplicate source snapshots.
- Generated root evidence dumps unless intentionally shipping a sample dataset.
- Ad hoc pasted/transcript files.

### Defer, but track

- True UDF body parsing from Function resource private STC data.
- True table schema parsing from table/SelectionList resources.
- Process driver parsing beyond driver-like private node findings.
- Runtime AC execution simulation. This is out of scope unless a safe, isolated native runner is explicitly designed.

## API refactor target

The stable product API should remain small and composable:

```text
GET  /api/v1/status
GET  /api/v1/health/live
GET  /api/v1/health/ready
GET  /api/v1/snapshot
POST /api/v1/snapshot/refresh
GET  /api/v1/scopes
GET  /api/v1/scopes/{scopeId}?include=structure,inventory,references,diagnostics
GET  /api/v1/rules/{nodeId}?include=subtree,references,diagnostics
GET  /api/v1/fwd/overview
GET  /api/v1/fwd/resources
GET  /api/v1/fwd/tables
GET  /api/v1/fwd/udfs
GET  /api/v1/fwd/resource-dependencies
GET  /api/v1/diagnostics
GET  /api/v1/search?q=...
POST /api/v1/export
```

Compatibility aliases can stay, but new UI/client work should prefer `include=` expansion over route explosion.

## Error-handling policy

Native-wrapper calls are allowed to fail per section/scope. Section-level failures should become warnings where the product can still return partial evidence. Whole-request failures should use a structured API error envelope.

Rules:

- Validate path, process name, query limits, and include flags before calling native APIs.
- Catch native/interop failures at product boundaries and add actionable resolution text.
- Do not swallow exceptions silently; if a failure is intentionally non-fatal, record it as a warning or diagnostic.
- Keep `FormWorksInteropException` as the native boundary wrapper.
- Keep response writing resilient to client disconnects and shutdown races.

## Comment policy

Comments should explain evidence semantics and non-obvious defensive behavior. Remove attribution/generated comments, restated code comments, and vague TODOs.

Good comments explain:

- Why a broad native catch is partial-failure tolerant.
- Why an inferred field/table/UDF is not canonical truth.
- Why a route is debug-only or legacy.
- Why snapshot build is serialized.

Avoid comments that merely repeat the method name.

## Next split points

The safest next structural split is by responsibility, not arbitrary line count:

```text
AcRuleWorkbench.Core/
  Extraction/
    FwdInventoryExtractor.cs
    AcRuleInventoryExtractor.cs
    StcPrivateTreeExtractor.cs
    FipInspectionExtractor.cs
  Analysis/
    AcRelationshipAnalyzer.cs
    AcStructuralTreeAnalyzer.cs
    ResourceDependencyAnalyzer.cs
    EvidenceDiagnosticsAnalyzer.cs
  Export/
    ViewerExportService.cs
    EvidencePackageExporter.cs

AcRuleWorkbench/
  Api/V1/
    WorkbenchApiService.Status.cs
    WorkbenchApiService.Fwd.cs
    WorkbenchApiService.Rules.cs
    WorkbenchApiService.Search.cs
    WorkbenchApiService.Export.cs
  Hosting/
    WorkbenchApiServer.StaticAssets.cs
    WorkbenchApiServer.Diagnostics.cs
    WorkbenchApiServer.Legacy.cs
  Cli/
    CommandHandlers/*.cs
    ConsoleReportPrinter.cs
```

Do not split until tests cover the affected behavior. The first split should be `WorkbenchApiService` because the route/product boundary is easier to test than native extraction.

## Validation checklist

Run on a Windows machine with the FormWorks/DCM runtime installed:

```powershell
.\scripts\clean-workspace.ps1
.\scripts\build-and-doctor.ps1
.\scripts\start-workbench.ps1 -FwdPath C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd -Port 8787 -KillExisting
.\scripts\test-api-v1.ps1 -BaseUrl http://127.0.0.1:8787
.\scripts\test-code-quality.ps1
```

Manual smoke checks:

- `/viewer` loads with no console boot errors.
- `/api/v1/status` includes source and snapshot state.
- `/api/v1/health/ready` returns actionable resolution when no snapshot is loaded.
- `/api/v1/scopes` returns page/document scope inventory.
- `/api/v1/rules/{nodeId}` works for node id and RuleGuid lookup.
- Table/UDF views clearly distinguish canonical resources from inferred usage evidence.
