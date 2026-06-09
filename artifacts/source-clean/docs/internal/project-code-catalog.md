# Project Code Catalog

This catalog records the current `AcRuleWorkbench` codebase behind the FW Companion product. It separates maintainable source from generated viewer data and packages so future Editor-parity work starts from an accurate map of what exists.

Date of inventory: 2026-06-04.

## Product Shape

FW Companion is a local, read-only companion for FormWorks Editor. It opens a configured `fwd.cfd`, reads FWD/STC and AC rule configuration through FormWorks/DCM APIs, normalizes that data into reports and API snapshots, and renders it in a desktop browser companion.

The product is not an AC runtime and not an FWD authoring tool. FW Editor remains the write surface for rule creation, rule movement, UDF editing, table editing, process configuration, and AC Rules Tester execution.

## Source Boundary

| Area | Treat as | Notes |
|---|---|---|
| `AcRuleWorkbench.sln` | Solution entrypoint | .NET Framework solution for app, core, and tests. |
| `AcRuleWorkbench/` | App and API source | CLI, local API host, API v1 service, debug harness, options, envelopes. |
| `AcRuleWorkbench.Core/` | Extraction and model source | Native interop client, DTOs, AC parsing, relationships, viewer export, resource export. |
| `AcRuleWorkbench.Tests/` | Automated tests | API contract, semantic model, packaging, viewer sync, export, cache, probe tests. |
| `ac-rule-viewer.html/css/js` | Root viewer assets | Local/generated viewer shell used during development and static hosting. |
| `AcRuleWorkbench.Core/Viewer/*` | Packaged viewer assets | Mirrored viewer templates/content copied to app output. Keep in sync with root viewer files. |
| `scripts/` | Repo-level automation | Build, run, packaging, API validation, IIS install, diagnostics, cleanup. |
| `AcRuleWorkbench/scripts/` | Packaged app scripts | Runtime/package copies of key scripts. |
| `docs/` | Product, operator, developer, API, runbook docs | Should stay aligned with Editor vocabulary and current API behavior. |
| `docs/reference/` | Reference/decompiled artifacts | Useful evidence, not primary product source. |
| `lib/`, `rri_bin/` | Native/managed FormWorks/DCM dependencies | Required for real extraction; do not refactor as product source. |
| `*.json` sidecars next to viewer | Generated evidence snapshots | Useful for verification and scale analysis; regenerate from FWD when needed. |
| `bin/`, `obj/`, package output | Generated artifacts | Exclude from source reasoning except for runtime/package verification. |

## Build And Runtime Model

The app project targets `.NET Framework 4.8` and is intentionally x86:

- `AcRuleWorkbench/AcRuleWorkbench.csproj`
  - `TargetFramework`: `net48`
  - `OutputType`: `Exe`
  - `RuntimeIdentifier`: `win-x86`
  - `PlatformTarget`: `x86`
  - `Prefer32Bit`: `true`
  - package dependencies: `Microsoft.Extensions.Logging`, `Microsoft.Extensions.Logging.Console`, `Newtonsoft.Json`

- `AcRuleWorkbench.Core/AcRuleWorkbench.Core.csproj`
  - `TargetFramework`: `net48`
  - `RuntimeIdentifiers`: `win-x86;win-x64`
  - references FormWorks/DCM managed wrappers from `lib/`
  - content-copies viewer templates/assets

- `AcRuleWorkbench.Tests/AcRuleWorkbench.Tests.csproj`
  - `TargetFramework`: `net48`
  - MSTest-based test project
  - references app and core projects

The x86 constraint is a product constraint, not a build preference. FormWorks/DCM native DLLs and licensing checks must load in the expected bitness. Any Editor-parity extraction work must keep this path stable.

## Solution Projects

### `AcRuleWorkbench`

The app project owns process entrypoints, local serving, and product API contracts.

| File/Area | Responsibility |
|---|---|
| `Program.cs` | CLI command dispatcher and human/JSON console output for probes, FWD inspection, AC reports, API server, and fixture commands. |
| `WorkbenchApiServer.cs` | `HttpListener` local host for `/viewer`, viewer assets, API v1, legacy/debug routes, refresh, static asset lookup, CORS, and request concurrency. |
| `WorkbenchApiServerOptions.cs` | Runtime options: host, port, viewer path, default FWD path, CORS, refresh permission, debug API, path-query permission, cache behavior. |
| `ApiRouteNotFoundException.cs` | Local route failure type used by server error handling. |
| `Api/ApiHttpResult.cs` | API response container used by API services. |
| `Api/ApiResponseWriter.cs` | JSON/HTML/text response writer with headers and CORS support. |
| `Api/LegacyRouteDispatcher.cs` | Compatibility route dispatch for legacy and debug endpoints. |
| `Api/V1/*` | Stable product API v1 route catalog, envelopes, OpenAPI document, snapshot model, cache, route/service logic. |
| `ApiHarness/*` | Browser diagnostic harness for development/debug use. |

#### CLI Commands

`Program.cs` groups commands behind handler classes:

| Handler | Commands | Purpose |
|---|---|---|
| `ProbeCommandHandler` | `doctor`, `probe`, `--probe` | Managed/native dependency diagnostics. |
| `InspectionCommandHandler` | `inspect`, `stc-process` | FWD inventory and private STC process traversal. |
| `AcCommandHandler` | `ac-rules`, `ac-trace`, `ac-field`, `ac-attr`, `ac-rejects`, `ac-index`, `ac-diagnostics`, `ac-tree`, `ac-disabled`, `ac-viewer` | AC rule extraction, relationships, indexes, diagnostics, structural tree, disabled-state analysis, viewer export. |
| `ApiServerCommandHandler` | `api`, `serve-api`, `api-server`, `web-test` | Local product API and static viewer host. |
| `FixtureCommandHandler` | `fip`, `ocr`, `smoke` | FIP, OCR, and fixture validation commands. |

These commands are still important even though the product is viewer/API-centered: they are the fastest way to isolate native extraction, tree parsing, relationship derivation, and packaging failures.

#### Local Server

`WorkbenchApiServer.cs` is a large integration class. It currently owns:

- local `HttpListener` lifecycle
- concurrent request handling and request cleanup
- `/viewer` static HTML serving
- viewer CSS/JS/JSON sidecar serving
- API v1 dispatch
- legacy route compatibility headers
- debug API gating behind `--enable-debug-api`
- snapshot warmup at server start
- refresh behavior when explicitly allowed
- harness serving and fallback harness rendering
- viewer asset discovery from configured viewer path, app output, current directory, and `AcRuleWorkbench.Core/Viewer`

This class is a concentration point. Future Editor-parity work should avoid adding more semantic query logic here; add it to API v1 query services or snapshot builders instead.

### `AcRuleWorkbench.Api.V1`

API v1 is the stable product contract. It wraps extraction output in consistent API envelopes and exposes snapshot-backed routes.

| File | Responsibility |
|---|---|
| `ApiV1Routes.cs` | Machine-readable route catalog and API/schema version constants. |
| `ApiEnvelope.cs` | Success/error envelope contracts. |
| `FormWorksEditorModel.cs` | Snapshot-level FormWorks Editor parity models and builder: object graph, rule lists, UDF definitions, SelectionList definitions, runtime impacts. |
| `OpenApiDocument.cs` | Generated OpenAPI 3.0 contract. |
| `RuleCorrelation.cs` | Shared identity, scope, node, key, and matching helpers. |
| `WorkbenchApiService.cs` | API v1 route dispatch and payload builders. |
| `WorkbenchSnapshot.cs` | Snapshot DTOs, snapshot builder, scope/rule model indexing, field resolution, coverage diagnostics, and Editor parity model attachment. |
| `WorkbenchSnapshotCache.cs` | Cached snapshot lifecycle, warmup, refresh, key matching, native-strict cache dimension. |

#### API v1 Route Groups

| Route group | Current coverage |
|---|---|
| `/api/v1`, `/help`, `/routes`, `/openapi.json`, `/capabilities` | Discoverability and contract metadata. |
| `/health/live`, `/health/ready`, `/status` | Process/source/snapshot health. |
| `/snapshot`, `/snapshot/warmup`, `/snapshot/refresh` | Snapshot access and lifecycle. |
| `/editor-model` | Snapshot-level FormWorks Editor parity projection. |
| `/scopes`, `/scopes/{scopeId}` | Scope list and expanded scope detail. |
| `/scopes/{scopeId}/structure` | Structural rule tree alias. |
| `/scopes/{scopeId}/inventory` | Flat rule inventory alias. |
| `/scopes/{scopeId}/references` | Relationship/reference alias. |
| `/scopes/{scopeId}/diagnostics` | Scope diagnostics alias. |
| `/rules/{nodeId}` | Deep selected-rule packet. |
| `/rules/{nodeId}/editor-model` | Canonical selected-rule packet using Rule List / Rule / Status Result / Action List / Function vocabulary. |
| `/rules/{nodeId}/subtree` | Selected rule and descendants. |
| `/rule-lists`, `/rule-lists/{scopeId}` | Snapshot-wide canonical Rule List and Rule Configuration projections. |
| `/fwd`, `/fwd/overview` | FWD object overview. |
| `/fwd/object-graph` | Linked canonical FWD object graph projection, including bounded resource-private nodes when resource details are available. |
| `/fwd/documents`, `/pages`, `/page-variants`, `/fields`, `/batches` | Core FWD object lists. |
| `/fwd/processes`, `/fwd/processes/{process}`, `/fwd/processes/{process}/private` | Process inventory and private STC summaries. |
| `/fwd/processes/drivers` | Heuristic process-private driver findings. |
| `/fwd/resources` | Resource buckets/details/private config. |
| `/fwd/functions`, `/fwd/functions/{name}` | AC function catalog with curated semantics, configured status results, observed parameters, relationships, and rule usage. |
| `/fwd/tables`, `/fwd/tables/inferred` | Table/SelectionList resources and relationship-derived table candidates. |
| `/fwd/selection-lists` | Canonical SelectionList/table definitions with resource-evidence match fields, plug fields, parsed option roles, usage links, and usage-derived fallback fields. |
| `/fwd/udfs`, `/fwd/udfs/canonical`, `/fwd/udfs/{name}`, `/fwd/udfs/inferred` | UDF/function resource candidates, canonical UDF definitions, promoted internal Rule List projections, resource evidence, and caller-side field-list bindings. |
| `/fwd/page-designs` | Canonical page/variant/field design packets with FormID inference, parsed geometry, field role flags, rule references, and FIP inspection links. |
| `/fwd/runtime-impact` | Static runtime/operator-impact projection with behavior flags, configured statuses, parameters, relationship targets, and SelectionList options where applicable. |
| `/fwd/fip` | FIP page variant inspection. |
| `/diagnostics` | Global snapshot diagnostics. |
| `/search` | FWD-aware global search. |

The routes now expose the canonical Editor-model layer for Rule Lists, selected Rules, UDFs, SelectionLists, page designs, object graph, structured function schemas, and runtime impact. Remaining semantic gaps are primarily native-guide-only function metadata, deeper typed process/resource projections, and raw evidence drill-through where native payload shapes still need proof.

### `AcRuleWorkbench.Core`

Core owns extraction, report DTOs, rule parsing, relationship derivation, viewer export, resource export, and native diagnostics.

#### Extraction Interface

`IFormWorksExtractionClient` defines the main source boundary:

| Method | Output | Role |
|---|---|---|
| `Probe()` | `ProbeReport` | Managed/native dependency and version checks. |
| `Inspect()` | `FwdInspectionReport` | FWD documents, pages, batches, processes, resources, variants, fields. |
| `InspectOcr()` | `OcrInspectionReport` | OCR2 field inspection. |
| `Smoke()` | `SmokeReport` | Combined FWD/OCR fixture validation. |
| `InspectProcessTree()` | `StcTreeReport` | Private process STC traversal. |
| `InspectFip()` | `FipInspectionReport` | FIP page variant, dropout region, OMR inspection. |
| `InspectAcRules()` | `AcRuleReport` | Flat AC rule inventory from packed config payloads. |
| `TraceAcRelationships()` | `AcRelationshipReport` | Relationship derivation from rules and parameters. |
| `BuildAcIndex()` | `AcIndexReport` | Summaries/indexes over AC rules. |
| `AnalyzeDisabledRules()` | `AcDisabledReport` | Disabled-state blocks and filtered disabled report. |
| `BuildAcDiagnostics()` | `AcDiagnosticsReport` | Parser/coverage/disabled diagnostics. |
| `BuildAcTree()` | `AcTreeReport` | Structural AC rule tree and action-list edges. |
| `ExportAcViewer()` | `AcViewerReport` | Static viewer HTML/sidecar export. |

`FormWorksExtractionClient.cs` implements all of this and is the largest file in the repo. Its responsibilities should eventually be split by extraction domain, but it currently provides the most complete view of the native surface.

#### FWD Inspection Model

`FwdInspectionReport.cs` models:

- FWD path and release metadata
- document names
- page names
- batch names
- process names
- resources grouped by type
- page variants grouped by page
- fields grouped by page/document scope
- resource type details
- resource private nodes
- resource dependency edges
- warnings

Current field metadata includes name, type, geometry string, and subfield count. The API now promotes this into canonical page-design packets with page containers, variant/FormID identity when inferable, parsed rectangles, field role flags, related AC rule links, and FIP inspection links for dropout/OMR evidence.

#### AC Flat Rule Model

`AcRuleReport.cs` models the flat inventory:

- scopes
- flat rule rows
- counts by scope type, function, source, action name, and disabled state
- warnings

`AcRuleSummary` includes:

- scope path/type/name
- rule index
- rule GUID and rule ID when available
- rule name
- function name/version
- description
- sources
- action names
- parameter dictionary
- flow-related fields such as `ActionMapRaw`, `SkipId`, `BackupSkipId`, `RuleCounter`
- `RuleListPath`
- disabled state/evidence
- raw tokens

This is useful for inventory and correlation, but it is not sufficient as the source of hierarchy. Structural tree evidence is authoritative when available.

#### Structural Rule Tree Model

`AcTreeReport.cs` models the parsed rule-list tree:

- scopes
- nodes
- edges
- diagnostics
- direct/inherited disabled counts
- hierarchy depth

`AcTreeNode` represents a structural rule or non-rule tree node. It includes:

- node ID
- parent node ID
- action-list index
- hierarchy level
- rule index within scope
- scope path/type/name
- rule identity
- function identity
- rule list/structural/display path
- route segments
- action names
- sources
- parameters
- attributes
- disabled state/evidence

`AcTreeEdge` represents parent-to-child structural containment:

- from node
- to node
- edge kind
- action-list index
- action name when resolved
- confidence and evidence

`AcStructuralTreeParser.cs` is the lower-level parser for packed rule-list bytes. Its own comment captures the correct model: an AC rule tree contains a root rule list, every rule contains zero or more action sub-lists, and `ParentNodeId + ActionListIndex` are the structural keys for parent/status-result context.

#### Relationship Model

`AcRelationshipReport.cs` models derived references:

- relationship kind
- target type
- target value
- parameter name
- parameter role
- option flag
- confidence
- reason/evidence

Current relationship kinds include field usage, field mutation, field writes, field rejection, field-attribute reads/writes/clears, attribute reads/writes/clears, option usage, reject-code usage, reject messages, source tags, and disabled relationships.

Relationship derivation currently uses this order:

1. `AcFunctionCatalog` exact function/parameter entries.
2. Known attribute/option/field parameter patterns.
3. Field-name shape heuristics.
4. Generic parameter evidence.

The catalog is now a seeded semantics catalog, not only a parameter classifier. Expanding it to full AC guide coverage remains one of the highest-value Editor-parity work items.

#### Function Catalog

`AcFunctionCatalog.cs` is the explicit function semantics catalog. It currently covers high-value functions such as:

- `_IRejectFields`, `IRejectPage`
- `Copy`
- `MergeFields`
- `Formatf`, `FormatDate`
- `DeleteLines`, `DeleteSpaces`, `DeleteStrings`
- `LimitLineCount`, `LimitLineLength`
- `IsEmpty`, `HasRegExpr`, `CompareFields`, `CheckDate`, `CheckMath`, `CheckColumnSum`
- field-attribute functions
- document/page/record attribute functions
- selected table/SelectionList functions

It returns target type, relationship kind, parameter role, option flag, and confidence for relationship classification. It also exposes function definitions with category, description, status-result seeds, parameter roles, behavior flags, runtime-impact notes, deprecation flag, and evidence/caveat text. It is still not a complete AC Functions guide: geometry, multiline, multiple-instance, OMR, defaults/options, package/DLL, examples, replacement guidance, and all observed custom functions still need broader coverage.

#### Native And Interop Support

| File/Area | Responsibility |
|---|---|
| `Interop/FwdSession.cs` | Managed wrapper session boundary around FWD handles. |
| `Interop/SafeFwdHandle.cs` | Safe handle wrapper. |
| `FormWorksInteropException.cs` | Domain exception for native/FormWorks failures. |
| `NativeDependencyScanner.cs` | Native dependency discovery/checking. |
| `NativeVersionChecker.cs` | Version checks for native dependencies. |
| `ProbeReport.cs` | Probe result DTOs and dependency status. |

These files enforce the native boundary. Any new extraction surface should fail with clear native/license/path diagnostics, not vague API failures.

#### Resource Export

`GlobalResourceExportCoordinator.cs` writes export packages for resource details:

- manifest
- resources
- tables
- UDF resources
- dependencies
- diagnostics
- private tree summaries

This is a useful staging point for canonical table/UDF work, but current table/UDF outputs are still mostly resource- and usage-derived.

### Viewer Assets

The viewer exists in two mirrored locations:

- root development assets:
  - `ac-rule-viewer.html`
  - `ac-rule-viewer.css`
  - `ac-rule-viewer.js`

- packaged/core assets:
  - `AcRuleWorkbench.Core/Viewer/ac-viewer-template.html`
  - `AcRuleWorkbench.Core/Viewer/ac-viewer-template.css`
  - `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.html`
  - `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.css`
  - `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js`

`ViewerAssetSyncTests` enforces important sync expectations. Keep root and core viewer/template copies aligned when changing UI, help text, CSS, boot behavior, or embedded placeholders.

#### Viewer Data Loading

`ac-rule-viewer.js` can load:

- embedded JSON placeholders in generated HTML
- sidecars:
  - `ac-rule-viewer.rules.json`
  - `ac-rule-viewer.rel.json`
  - `ac-rule-viewer.tree.json`
- API hydration from API v1 endpoints when available

It tracks hydration state and gracefully handles missing API endpoints. Sidecars remain static evidence; API hydration can add FWD resources, functions, tables, UDFs, drivers, and other definitions.

#### Viewer Model

The client-side model builds indexes over:

- scopes
- structural nodes
- structural edges
- flat inventory rows
- relationships
- diagnostics
- fields/field resolution
- global resources
- tables
- drivers/process-private findings
- UDFs

Structural nodes drive hierarchy. Flat inventory rows and relationships provide supplemental evidence and matching.

#### Viewer Workspaces

Current viewer workspaces include:

| Workspace | Purpose |
|---|---|
| Structure | Rule hierarchy, rule lists, action lists, and selected-path inspection. |
| Field Resolution | Static matching between rule parameters and extracted field catalog entries. |
| Resources | Global FWD resource definitions. |
| Functions | AC function catalog, configured status results, observed parameters, behavior flags, runtime impact, and rule usage. |
| Tables | Shared table/SelectionList definitions and usage-derived references. |
| Drivers | Process-private driver-like findings. |
| UDFs | UDF/function candidates, caller mappings, internal rules/status evidence where available. |

#### Viewer Inspector

The inspector is divided into sections:

- Summary
- Parameters
- Attributes
- Actions
- References
- Messages
- Raw

This matches the Editor-parity direction, but the backing data still needs richer function schemas, explicit per-status-result action models, stronger UDF definition parsing, and table configuration semantics.

#### Viewer Interaction Model

The viewer provides:

- desktop-first shell layout
- global scope/object navigation
- local workspace filtering
- global search
- keyboard navigation in the structural tree
- expand/collapse controls
- selected-path copy
- rule configuration copy
- selected branch/action-list copy
- global definition modal/detail views
- contextual help
- diagnostic/status panels

This is already close to a read-only Editor companion UX. The next gap is not more dashboard chrome; it is deeper Editor semantics in the data model and inspector.

## Snapshot Data Flow

Current API snapshot construction follows this sequence:

```text
FWD path + process
  -> FormWorksExtractionClient.Inspect()
  -> FormWorksExtractionClient.InspectAcRules()
  -> FormWorksExtractionClient.BuildAcTree()
  -> FormWorksExtractionClient.TraceAcRelationships()
  -> FormWorksExtractionClient.BuildAcDiagnostics()
  -> WorkbenchSnapshotBuilder.IndexSnapshot()
  -> WorkbenchSnapshotCache
  -> API v1 payloads and viewer hydration
```

`WorkbenchSnapshotBuilder` then:

- groups structural nodes by scope
- groups structural edges by scope
- groups flat rules by scope
- groups relationships by scope
- groups diagnostics by scope
- computes structural coverage diagnostics
- builds field catalog by field name
- correlates structural nodes to flat rule rows
- applies structural disabled state to matched flat rows
- resolves field references from structural node parameters
- resolves unnamed structural edge action names from matched flat inventory when possible

This is the current best insertion point for canonical Editor objects.

## Current Evidence Snapshot

The root sidecars currently show this scale:

| Metric | Count |
|---|---:|
| Rule scopes | 13 |
| Flat rule rows | 5,924 |
| Structural nodes | 4,571 |
| Structural rule nodes | 4,559 |
| Structural edges | 4,559 |
| Relationships | 28,708 |
| Tree diagnostics | 1 |
| Direct disabled structural nodes | 133 |
| Inherited disabled structural nodes | 1,727 |

Top current functions by flat inventory count:

| Function | Count |
|---|---:|
| `Formatf` | 921 |
| `HasRegExpr` | 786 |
| `IsEmpty` | 505 |
| `_IRejectFields` | 455 |
| `DeleteLines` | 283 |
| `_ISetDocAttrConst` | 237 |
| `CheckSLState4` | 236 |
| `Copy` | 198 |
| `_IIterateAllUDF` | 132 |
| `_IGetDocAttr` | 114 |
| `_ISetDocAttr` | 101 |
| `SelectSelectedListTableApproxMatch` | 96 |
| `_ITestDocAttr` | 93 |
| `_ISetPageAttrConst` | 87 |
| `_IGetRecordAttr` | 80 |
| `_IBatchType` | 77 |
| `_IWorkerType` | 74 |
| `LogSL` | 72 |
| `_IClearDocAttr` | 62 |
| `ClearSL` | 55 |

Relationship distribution:

| Relationship kind | Count |
|---|---:|
| `UsesSource` | 9,864 |
| `UsesField` | 8,302 |
| `PossibleDisabledSequenceOnlyFrom` | 5,335 |
| `MutatesField` | 1,607 |
| `RejectsField` | 792 |
| `UsesOption` | 521 |
| `WritesAttribute` | 499 |
| `EmitsRejectMessage` | 461 |
| `UsesParameter` | 356 |
| `ReadsAttribute` | 320 |
| `WritesField` | 198 |
| `UsesRejectCode` | 121 |
| `WritesFieldAttribute` | 109 |
| `ClearsAttribute` | 87 |
| `DisablesRuleBlock` | 48 |
| `UsesAttribute` | 46 |
| `ReadsFieldAttribute` | 24 |
| `ClearsFieldAttribute` | 10 |
| `DisabledBySource` | 8 |

Target-type distribution:

| Target type | Count |
|---|---:|
| `Field` | 11,042 |
| `Source` | 9,872 |
| `Rule` | 5,335 |
| `Attribute` | 952 |
| `Option` | 521 |
| `RejectMessage` | 461 |
| `Parameter` | 356 |
| `RejectCode` | 121 |
| `RuleBlock` | 48 |

These counts justify the immediate focus areas: function catalog expansion, field/attribute semantics, disabled-state authority, SelectionList/table parsing, UDF iteration modeling, and explicit status-result/action-list modeling.

## Tests

| Test file | Coverage |
|---|---|
| `AcRuleSemanticModelTests.cs` | Semantic expectations around AC rule model behavior. |
| `ApiContractTests.cs` | API v1 and related contract tests, using fake/stub extraction clients. |
| `PackagingScriptsTests.cs` | Packaging script expectations. |
| `ProbeTests.cs` | Probe/dependency diagnostics. |
| `ViewerAssetSyncTests.cs` | Root/core viewer asset and template synchronization. |
| `ViewerExportTests.cs` | Viewer export behavior. |
| `WorkbenchSnapshotCacheTests.cs` | Snapshot cache behavior and cache-key expectations. |

Testing already covers important API and packaging behavior. Editor-parity work needs additional golden snapshot tests around canonical function/UDF/table/status-result projections.

## Scripts

Repo-level scripts provide:

- build and doctor workflows
- DCM dependency setup/discovery
- API/server startup
- viewer launch
- diagnostics collection
- live API validation
- code quality checks
- workspace cleanup
- packaging
- IIS install/always-on hosting
- scheduled runner registration

Key scripts:

| Script | Role |
|---|---|
| `scripts/setup-dcm-deps.ps1` | Prepare DCM/FormWorks dependencies. |
| `scripts/build-and-doctor.ps1` | Build plus native/runtime checks. |
| `scripts/start-workbench.ps1` | Generate/serve viewer and API. |
| `scripts/start-api.ps1` | Start API server. |
| `scripts/validate-api-live.ps1` | Live endpoint validation. |
| `scripts/test-api-v1.ps1` | API v1 checks. |
| `scripts/test-code-quality.ps1` | Code quality checks. |
| `scripts/validate-repo.ps1` | Repo validation. |
| `scripts/package-source-clean.ps1` | Clean source package. |
| `scripts/package-split-deliverables.ps1` | Split source/runtime/evidence deliverables. |
| `scripts/package-recommended-full.ps1` | Recommended full package. |
| `scripts/install-iis-workbench.ps1` | IIS deployment. |
| `scripts/install-iis-always-on-workbench.ps1` | Always-on IIS deployment. |

## Known Concentration Points

| Area | Risk | Direction |
|---|---|---|
| `FormWorksExtractionClient.cs` | Very large native/extraction/parser/export class. | Split by extraction domain after canonical models are defined. |
| `WorkbenchApiService.cs` | Large route dispatch and payload builder class. | Move heavy query construction into focused services. |
| `WorkbenchApiServer.cs` | Server, static assets, legacy routes, debug routes, refresh, and harness in one class. | Keep semantic work out of this file; eventually split hosting/static/debug concerns. |
| Viewer JS | Large single-file desktop app. | Keep root/core sync; split only if packaging can preserve generated viewer simplicity. |
| Function catalog | Seeded high-value catalog with observed-function additions, structured parameter schemas, schema profiles, unknown observed parameter diagnostics, and contract tests. | Continue expanding native-guide-only metadata such as defaults, package/DLL, examples, replacement guidance, and custom function signatures when source evidence exists. |
| UDF model | Canonical definitions now include named field-list parameters, status results, caller bindings, and an internal Rule List projection from decoded UDF nodes or promoted private-tree body evidence. | Replace remaining opaque-payload diagnostics only when new native payload shapes expose typed rule bytes. |
| Table model | Currently resource/usage-derived. | Add canonical SelectionList/table definitions, schema, match fields, plug fields, options, persistence, rerun behavior. |
| Status-result actions | Structural edges exist, labels may be resolved, but action semantics are not yet fully first-class. | Add explicit status result -> action model to rule packets/API/viewer. |
| Field resolution | Static token matching now links to canonical page-design field packets with container, geometry, role flags, variants, and related AC rule links. | Continue adding typed native field attributes as more FormWorks field config shapes are proven. |
| Runtime UX | Documented as downstream impact, not modeled deeply. | Add runtime impact metadata without pretending to execute AC. |

## Editor-Parity Implication

The current codebase already has the hard foundation: native FWD access, AC flat inventory, structural rule-list parsing, relationships, diagnostics, snapshot cache, API v1, and a desktop viewer. The gap is semantic completeness.

Closing the gap should not mean adding broad UI panels first. It should mean adding canonical Editor-aligned objects to the snapshot/API model, then letting the viewer inspect those objects:

```text
FWD Object Graph
  Documents / Pages / Variants / Fields / Batches / Processes / Resources
Rule Configuration
  Rule List / Rule / Function / Fields / Attributes / Status Results / Action Lists
Function Catalog
  Category / parameters / options / status results / behavior capabilities
UDF Definitions
  Named field-list parameters / status results / internal rules / caller bindings
SelectionList Definitions
  Table source / match fields / plug fields / options / persistence / runtime impact
Runtime Evidence
  Rejects / table prompts / keyer impact / tester cases / WR-OCR diffs when externally supplied
```

That is the work required for the project to remain a full read-only FormWorks Editor companion instead of drifting back into an AC rule extraction/debug viewer.
