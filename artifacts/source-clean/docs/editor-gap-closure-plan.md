# Editor Gap Closure Plan

This plan defines how to close the gap between FormWorks Editor as the native authoring application and AC Rule Workbench as a read-only companion for FWD/AC configuration review.

The target is not to clone FW Editor write behavior. The target is to make the workbench understand and inspect the same configuration model with the same vocabulary, evidence discipline, and runtime-UX consequences.

## Target State

AC Rule Workbench should let an expert inspect the FWD configuration as if reading FW Editor in a purpose-built evidence workbench:

```text
FWD/STC object graph
  Documents
  Pages
  Page variants
  Fields
  Batches
  Processes
  Resources
  Private process/resource nodes

AC rule model
  Rule List
    Rule
      Function
      Fields / Parameters
      Attributes
      Status Results
        Result -> Do Nothing / Reject Fields / Action List / Sub-list

Function model
  Intrinsic / Custom-Tcl / User Defined / Testing / Formatting / Rectifying / Table / Store / Deprecated
  Parameter schemas
  Attribute/option schemas
  Status results
  Behavior capabilities

UDF model
  Named field-list parameters
  Status results
  Internal rule list
  Caller bindings
  Iteration wrapper use

SelectionList/table model
  Table source
  Match fields
  Plug fields
  Column/plug options
  Persistence
  Rerun triggers
  Runtime keyer impact
```

## Non-Goals

- No FWD writeback.
- No rule add/delete/move/rename operations.
- No enable/disable writeback.
- No parameter, attribute, UDF, table, or process editing.
- No claim that static configuration is runtime AC execution.
- No AC Rules Tester execution unless a future explicit runtime/test harness is added.
- No mobile/tablet product target for the production viewer.

## Current Strengths

The project already has these foundation pieces:

- x86 .NET Framework app that can load native FormWorks/DCM dependencies.
- FWD inspection for documents, pages, batches, processes, resources, variants, fields, and private/resource details.
- flat AC rule extraction into `AcRuleReport`.
- structural AC rule-list parsing into `AcTreeReport`.
- structural disabled inheritance and coverage diagnostics.
- relationship derivation into `AcRelationshipReport`.
- explicit seeded `AcFunctionCatalog` with priority function categories, status-result seeds, parameter roles, behavior flags, runtime-impact notes, and catalog-first relationship classification.
- snapshot builder/cache that joins FWD, rules, tree, relationships, diagnostics, and field catalog evidence.
- product API v1 with health, status, snapshot, scopes, rules, FWD objects, resources, functions, tables, UDFs, FIP, diagnostics, and search.
- local static viewer with structure, fields, resources, functions, tables, drivers, UDFs, inspector, search, help, and copy workflows.
- tests for API contracts, snapshot cache, viewer export/sync, packaging, and semantic expectations.

The foundation is strong enough to close the gap by adding canonical semantic layers instead of restarting.

## Gap Matrix

| Editor capability | Current project surface | Gap | Closure requirement | Priority |
|---|---|---|---|---|
| FWD tree/object graph | `FwdInspectionReport`, `/api/v1/fwd/*`, `/api/v1/fwd/object-graph`, viewer Resources object-graph panel | Linked object graph now includes documents, pages, variants, fields, batches, processes, resources, rule lists, and bounded resource-private nodes when native details are available. Private process nodes, typed source handles, and richer editor navigation semantics are still partial. | Expand `FwdObjectGraph` with process-private nodes, typed source handles, field/page variant identity, and editor-equivalent navigation links. | P0 |
| Document/page design context | `/api/v1/fwd/page-designs`, `/api/v1/fwd/fields`, viewer Fields workspace, FIP links | Closed for static Editor inspection: page-design packets unify page identity, variants/FormID when inferable, field containers, geometry rectangles, field role flags, related AC rules, and FIP inspection links. Native page rendering and runtime FIP execution remain explicitly linked evidence, not simulated. | Continue only with typed native field-attribute enrichment as new payload shapes are proven. | Closed |
| Process configuration | Process names and private STC traversal | Process-private nodes are summaries; AC/DV/Store roles and private config are not canonical. | Add process model with role classification, private node summaries, links to rule scopes/resources, and explicit confidence. | P1 |
| Rule List model | Structural nodes/edges, flat action names, selected-rule `editorModel`, `/api/v1/rule-lists`, viewer RuleConfiguration packet panel | Snapshot-wide Rule List and Rule Configuration objects expose parent Status Result, outgoing Action Lists, structured function schema/profile data, reject message/code mapping, raw source handles, and duplicate/ambiguous flat-inventory diagnostics. Authoring-only native defaults/package/example metadata is still not proven for every AC function. | Add deeper raw evidence drill-through and native-guide fields only where source evidence exists. | P0 |
| Selected rule inspector | Viewer inspector sections, rule detail API, `/api/v1/rules/{nodeId}/editor-model`, viewer RuleConfiguration packet panel | Selected-rule packets now carry canonical function status evidence, `parameterSchema`, `schemaProfile`, `unknownObservedParameterNames`, source handles, reject mappings, ambiguity diagnostics, and field/page context through page-design packets. | Add deeper raw evidence drill-through for function configuration bytes and native guide metadata as proven. | P0 |
| Function catalog | `AcFunctionCatalog`, `/api/v1/fwd/functions`, viewer Functions workspace | Seed catalog now includes priority categories, descriptions, status-result seeds, parameter roles, structured parameter patterns, schema profiles, behavior flags, runtime-impact notes, configured ActionNames, observed parameters, unknown observed parameter names, and rule usage. It is not yet full AC guide coverage. | Continue expanding native-guide-only fields such as defaults, package/DLL, examples, replacement guidance, and all custom function signatures when evidence exists. | P0 |
| UDF definitions | `/api/v1/fwd/udfs*`, `/api/v1/fwd/udfs/canonical`, viewer UDF evidence panel | Closed for static Editor inspection: canonical UDF definitions expose resource identity, field-list parameters, status results, caller bindings, caller-slot-to-field-list bindings, and a promoted internal Rule List projection. `internalRuleTree.parseState` distinguishes decoded, promoted, opaque, and unavailable native body evidence. | Continue only with typed native private-body byte parsers when new payload evidence supports stronger reconstruction. | Closed |
| SelectionList/table definitions | `/api/v1/fwd/tables*`, `/api/v1/fwd/selection-lists`, viewer table workspace | Canonical SelectionList/table definitions now parse resource-evidence match fields, plug fields, persistence, rerun triggers, popup/keyer behavior, no-good-match behavior, enter behavior, and plug/reject outcomes when those signals exist. Usage-derived fields remain fallback evidence. | Replace broad text-role parsing with typed SelectionList resource schema parsers as native payload shapes are proven. | P1 |
| Runtime keying UX | `/api/v1/fwd/runtime-impact`, viewer Functions runtime-impact panel, relationship evidence | Static runtime/operator-impact projections now carry function-specific behavior flags, configured statuses, parameters, relationship targets, and SelectionList options. Override/suspend/keyer choices and AC runtime outcomes are still not proven. | Add optional external runtime/test evidence without claiming native execution. | P2 |
| AC Rules Tester | Documented only | No test case model, baseline model, WR/OCR diff model, or import/export support. | Add optional external test-evidence model for saved tester cases and WR/OCR diff artifacts. Do not execute AC unless a future runtime harness is intentionally built. | P3 |
| Field catalog | `FieldCatalogEntry`, `/api/v1/fwd/page-designs`, `/api/v1/fwd/fields`, viewer Fields workspace | Closed for static Editor inspection: field resolution now links to page-design fields with container, parsed geometry, type metadata, subfield/OMR-style role flags, variants, processing links, and evidence confidence. | Continue only with typed native field-attribute enrichment beyond currently exposed FWD field config. | Closed |
| Resource model | `ResourceTypeDetail`, `ResourceDetail`, private nodes | Resources are grouped and attributes are captured, but typed resource models are incomplete. | Add typed projections for functions/UDFs, tables, date formats, TCL/custom functions, stores, and private config. | P1 |
| API contract | API v1 route catalog and OpenAPI | API route and OpenAPI path drift is now checked by `scripts/test-code-quality.ps1`; canonical Editor concepts are exposed through selected-rule, Rule List, UDF, SelectionList, page-design, function, and runtime-impact packets. | Keep route descriptions/examples synchronized with Editor vocabulary and evidence classes as new canonical payloads are added. | P1 |
| Viewer UX | Desktop workbench with structure/global definitions/inspector | Viewer now hydrates canonical editor-model, object graph, RuleConfiguration, UDF, SelectionList, and runtime-impact packets. Resources, selected-rule inspector, UDFs, Tables, and Functions expose those packets directly. Field/page packet and process-private packet panels remain partial. | Add first-class field/page packet and process-private panels, then deepen raw evidence drill-through. | P1 |
| Tests | API, export, sync, cache tests | Function schema/profile contract tests and OpenAPI route drift checks are in place. Broader golden snapshot tests are still needed for full canonical object graphs. | Add fixture-backed snapshot tests for canonical object graphs, process-private packets, and raw-evidence drill-through. | P0 |
| Documentation | Multiple docs updated for mental model | Need durable catalog and implementation plan kept current with code. | Keep this plan, code catalog, reference guide, API docs, and operator/developer guides synchronized. | P0 |

## Workstream A - Canonical Domain Model

Add an Editor-aligned model layer above raw reports. It should be built once per snapshot and consumed by API/viewer/export.

### Deliverables

| Model | Required fields |
|---|---|
| `FwdObjectGraph` | stable object ID, object kind, display name, parent ID, children, source path, evidence class, warnings |
| `DocumentModel` | document name, page links, document-level AC scopes, fields, processes/resources used |
| `PageModel` | page name, variants, fields, page-level AC scopes, FormID/variant data when available |
| `PageVariantModel` | page, variant, FormID, blank/dropout/OMR evidence, warnings |
| `FieldModel` | canonical field ID, scope/page/document, field name, type, geometry, subfields, OMR, multiline/multiple-instance evidence |
| `ProcessModel` | process name, role, private STC summary, linked scopes/resources, driver-like findings |
| `ResourceModel` | resource type/name/category, attributes, private tree, typed projection availability |
| `RuleScopeModel` | scope ID, scope type/name, owner object, root rule list, counts, coverage, diagnostics |
| `RuleListModel` | list ID, owner scope/rule, list kind, parent status result, ordered child rules |
| `RuleConfiguration` | rule identity, enabled/disabled state, function call, parameters, attributes, sources, status actions, diagnostics, raw evidence |
| `StatusResultAction` | status token, description, action type, target sub-list/list ID, reject message/code where available, evidence |
| `FunctionDefinition` | category, package/source, schemas, status results, behavior flags, deprecated flag, examples, evidence source |
| `UdfDefinition` | named field-list params, status results, internal rule tree, caller bindings, iteration wrapper usage |
| `SelectionListDefinition` | table/source, match fields, plug fields, column options, persistence, rerun triggers, keyer impact |
| `RuntimeImpact` | reject/table/plug/override/navigation consequences derived from config |
| `EvidenceProvenance` | structural/flat/relationship/raw/manual/source path, confidence, timestamp/snapshot ID |

### Acceptance Criteria

- API/viewer can render the selected rule without guessing which evidence class is authoritative.
- Structural hierarchy remains authoritative for order, parentage, action-list containment, and disabled inheritance.
- Flat inventory remains supplemental for action labels, raw tokens, and compatibility evidence.
- Relationships remain supplemental unless produced from exact function-schema definitions.
- Every canonical object can expose raw backing evidence for audit.

## Workstream B - Extraction Normalization

Centralize and normalize extraction so all downstream surfaces use the same snapshot.

### Tasks

- Move canonical snapshot construction into focused builders instead of adding more logic to `WorkbenchApiService`.
- Split `FormWorksExtractionClient` responsibilities after canonical models are stable:
  - native/probe
  - FWD object inspection
  - process/private STC traversal
  - AC flat rule extraction
  - AC structural tree extraction
  - relationship classification
  - viewer/static export
- Add typed resource extractors for function resources, UDF resources, table resources, date formats, TCL/custom functions, and Store resources.
- Preserve raw private-node capture with masking/truncation.
- Add extraction confidence and warnings to each typed projection.

### Acceptance Criteria

- Snapshot build has one clear path from native evidence to canonical Editor model.
- No viewer-only parsing becomes product truth.
- Debug/legacy routes can still expose raw reports, but product API uses canonical objects.

## Workstream C - Function Catalog Completion

The function catalog is the highest leverage semantic gap because every rule inspector, relationship, runtime-impact warning, UDF binding, and table lookup view depends on function knowledge.

### Function Schema Target

Each function entry should include:

- function name and aliases
- category:
  - Intrinsic
  - Custom/Tcl
  - User Defined
  - Testing
  - Formatting
  - Rectifying
  - Table
  - Store
  - Deprecated
- package/DLL/source when known
- description
- field-list parameters with real names
- non-field parameters
- attributes/options with defaults and allowed values when known
- status results
- which statuses imply success/failure/reject/sub-list routing
- data mutation behavior:
  - reads field
  - writes field
  - mutates field
  - rejects field/page/document
  - reads/writes/clears attributes
  - uses table
  - plugs table row values
- behavior flags:
  - requires geometry
  - preserves geometry
  - supports multiline
  - supports multiple instances
  - supports OMR
  - changes confidence
  - worker-type/process-sensitive
- runtime impact
- examples
- deprecation flag and replacement guidance
- evidence source and confidence

### Initial Priority Functions

Start with the functions most visible in the current evidence snapshot:

- `Formatf`
- `HasRegExpr`
- `IsEmpty`
- `_IRejectFields`
- `DeleteLines`
- `_ISetDocAttrConst`
- `CheckSLState4`
- `Copy`
- `_IIterateAllUDF`
- `_IGetDocAttr`
- `_ISetDocAttr`
- `SelectSelectedListTableApproxMatch`
- `_ITestDocAttr`
- `_ISetPageAttrConst`
- `_IGetRecordAttr`
- `_IBatchType`
- `_IWorkerType`
- `LogSL`
- `_IClearDocAttr`
- `ClearSL`

Then expand by category until all observed functions have at least category, parameter schema, status results, and runtime impact.

### Acceptance Criteria

- Generic parameter heuristics are fallback only.
- Function catalog hits set relationship kind, target type, parameter role, confidence, structured schema profile, unknown observed parameter diagnostics, and runtime impact.
- The selected-rule inspector shows function metadata without inventing semantics.
- Deprecated functions are visibly flagged.

## Workstream D - Status Results And Action Lists

The viewer already shows structural branches. The gap is making the Editor action model explicit.

### Tasks

- Add `StatusResultAction` to canonical rule packets.
- Resolve action labels from structural payload first, matched flat inventory second, raw/indexed fallback last.
- Distinguish:
  - `Do Nothing`
  - `Reject Fields`
  - `Reject Page`
  - `Reject Document`
  - `Action List`
  - `Sub-list`
  - unresolved/indexed action list
- Preserve `ActionListIndex` as evidence, not user-facing vocabulary unless no status token is known.
- Surface parent rule and parent status result in child rule detail.
- Surface reject string/code alongside action status when configured.
- Add diagnostics for unresolved action-label mappings.

### Acceptance Criteria

- Every structural edge can be explained as root list entry or parent status result -> action list.
- The selected child rule shows which parent rule/status result caused its sub-list.
- The selected parent rule shows all status results and action mappings even when the sub-list is empty or unresolved.

## Workstream E - UDF Parity

Treat UDFs as function-shaped rule lists, not function-name strings.

### Tasks

- Parse UDF resources into canonical definitions.
- Extract named field-list parameters.
- Extract UDF status results.
- Link internal UDF rule tree to caller function definitions.
- Show caller parameter bindings using real UDF parameter names.
- Model iteration wrapper intrinsics:
  - `_IIterateAllUDF`
  - `_IIterateOnlyFieldsUDF`
  - `_IIterateOnlyInstancesUDF`
  - dynamic-table variants when observed
- Add caller/callee graph queries.
- Add diagnostics for inferred-only UDFs, missing definitions, unknown parameters, and unknown status results.

### Acceptance Criteria

- `/api/v1/fwd/udfs/{name}` can return a definition with parameters/status results/internal rules/caller bindings when evidence exists.
- Viewer UDF detail shows internal rule list and caller mappings.
- Rule inspector for a UDF call shows UDF parameter names, not generic argument slots.
- Inferred-only UDFs are explicitly marked as inferred.

## Workstream F - SelectionList/Table Parity

Treat tables and SelectionLists as configuration objects first, not just referenced strings.

### Tasks

- Parse table/SelectionList resources into canonical definitions.
- Separate resource identity, table source, parsed schema, and rule-usage evidence.
- Extract or infer with confidence:
  - match fields
  - plug fields
  - display columns
  - plug-if-empty behavior
  - plug-when-both-have-data behavior
  - behavior when table is empty
  - persistent lookup
  - rerun triggers
  - clear/list state patterns
- Link table functions to table definitions:
  - `IsInTable`
  - `IsInTable2`
  - `SelectTable`
  - `SelectSelectedListTableApproxMatch`
  - `PlugFuzzyMatch`
  - `CheckSLState4`
  - `ClearSL`
  - `LogSL`
- Add runtime impact summaries for KE/WebKey prompts and auto-plug behavior.

### Acceptance Criteria

- Viewer table detail opens with configuration, not usage counts.
- Parsed columns are never conflated with usage-derived field references.
- Rule inspector can explain table lookup flow: source -> match -> candidate list -> plug fields -> runtime operator impact.
- Persistent lookup and rerun evidence are surfaced when available.

## Workstream G - Runtime UX Mapping

The workbench should explain runtime consequences without simulating runtime.

### Tasks

- Add `RuntimeImpact` metadata to rule/function/table/UDF packets.
- Model reject outcomes:
  - rejected fields
  - rejected page
  - rejected document
  - reject message
  - reject code
- Model table outcomes:
  - candidate lookup
  - auto-pop/plug
  - operator selection
  - no-good-match path
  - suspend/override caveats where configured
- Model field/keying outcomes:
  - error-to-error navigation
  - multi-field related validation
  - multiline/grid implications
  - worker-type-specific rules
- Add evidence source to every runtime-impact statement.

### Acceptance Criteria

- Viewer copy can say "this rule rejects these fields with this message" only when evidence supports it.
- Viewer copy can say "this rule may open a SelectionList lookup" only when table function/config evidence supports it.
- Runtime impact is labeled as downstream impact, not observed execution.

## Workstream H - API Contract Expansion

Add canonical Editor-parity endpoints while preserving existing compatibility routes.

### Proposed Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/fwd/object-graph` | Full linked FWD object tree. |
| `GET /api/v1/fwd/objects/{objectId}` | One canonical FWD object packet. |
| `GET /api/v1/fwd/functions` | Function catalog list. |
| `GET /api/v1/fwd/functions/{name}` | Function metadata and observed usage. |
| `GET /api/v1/scopes/{scopeId}` | Canonical rule scope. |
| `GET /api/v1/rule-lists/{scopeId}` | One rule list/action sub-list. |
| `GET /api/v1/rules/{nodeId}` | Preserve and expand existing rule detail. |
| `GET /api/v1/fwd/udfs/canonical` | Canonical UDF definition and usage candidates. |
| `GET /api/v1/fwd/selection-lists` | Canonical SelectionList/table definition and usage candidates. |
| `GET /api/v1/fields/{fieldId}` | Canonical field packet with usage. |
| `GET /api/v1/fwd/runtime-impact?rule=...` | Derived runtime impact packet. |

### Contract Rules

- Every payload declares evidence class and confidence.
- Every canonical object links to raw source evidence.
- Compatibility aliases remain until callers are migrated.
- OpenAPI examples use FormWorks Editor vocabulary.
- Query routes should not rebuild snapshots unless requested by cache mode.

## Workstream I - Viewer Parity

Use the existing desktop workbench shell and deepen it.

### Viewer Additions

| Viewer area | Add/strengthen |
|---|---|
| Left navigation | Editor object tree: documents, pages, variants, fields, batches, processes, resources, functions, UDFs, tables. |
| Scope header | Owner object, process, structural coverage, action-list resolution, FWD links. |
| Rule tree | Explicit Rule List / Action List / Status Result labels. |
| Rule inspector | Canonical selected-rule packet with function, params, attrs, status actions, references, diagnostics, runtime impact, raw evidence. |
| Function panel | Function definition, observed usage, statuses, options, behavior flags, deprecation. |
| UDF panel | Definition, parameters, statuses, internal rule tree, caller bindings, iteration. |
| Table panel | SelectionList config, source, match/plug fields, options, persistence, rerun, runtime keyer impact. |
| Field panel | Field metadata, geometry, scope/page/variant links, usages, OMR/subfield info. |
| Diagnostics console | Separate extraction, structural, schema, runtime-impact, and raw evidence warnings. |
| Help | Keep Editor vocabulary and caveats close to the views where they apply. |

### Acceptance Criteria

- A user can select any rule and answer:
  - What rule list is it in?
  - Which parent rule/status result leads here?
  - Which function is called?
  - Which fields/parameters are bound?
  - Which attributes/options are configured?
  - What status results can occur?
  - What action/sub-list/reject behavior is configured per status?
  - What UDF/table/function definition does it reference?
  - What runtime operator impact may follow?
  - What raw FWD evidence supports the display?

## Workstream J - Tests And Validation

### Test Additions

| Test type | Required coverage |
|---|---|
| Golden snapshot tests | Canonical FWD object graph, rule scope, rule detail, UDF, table, function packets. |
| Function catalog tests | Exact parameter role classification beats heuristics; structured `parameterSchema`/`schemaProfile` fields remain exposed through catalog and API packets. |
| Status-action tests | Parent status result maps to sub-list with correct edge/action evidence. |
| UDF tests | Named parameter bindings and caller/callee graph. |
| Table tests | Parsed schema vs usage-derived fields stay separate. |
| Runtime-impact tests | Reject/table/plug statements require evidence and correct caveat. |
| API contract tests | OpenAPI and example payloads include canonical Editor objects. |
| Viewer sync tests | Root and packaged viewer assets remain aligned. |
| Viewer DOM tests | New panels render expected canonical fields from fixture data. |
| Packaging tests | Source/runtime/evidence packages include docs and exclude generated noise. |

### Validation Commands

```powershell
git diff --check
dotnet test AcRuleWorkbench.sln --no-restore --verbosity minimal
.\scripts\validate-api-live.ps1 -BaseUrl http://127.0.0.1:8787
```

For docs-only changes, `git diff --check` is the minimum validation. For API/model/viewer changes, run the .NET tests and live API validation when the native environment is available.

## Implementation Phases

### Phase 0 - Documentation And Guardrails

Status: in progress.

Deliverables:

- code catalog
- Editor gap closure plan
- docs index updates
- clear source/generated boundary
- validation expectations

Exit criteria:

- maintainers can identify where each current responsibility lives
- future work has a single gap plan to follow

### Phase 1 - Canonical Rule Packets

Deliverables:

- `RuleConfiguration`
- `RuleListModel`
- `StatusResultAction`
- selected-rule API packet
- tests for parent/status/sub-list mapping
- viewer inspector updates

Exit criteria:

- selected-rule detail is Editor-aligned and no longer route-first
- status-result/action-list terminology is first-class in API and UI

### Phase 2 - Function Catalog Foundation

Status on 2026-06-04: partially implemented. `AcFunctionCatalog` now exposes seeded function definitions, `/api/v1/fwd/functions` and `/api/v1/fwd/functions/{name}` return catalog plus observed usage, the API harness exposes those routes, and the viewer has a global Functions workspace. Remaining work is full AC guide coverage and deeper selected-rule packet integration.

Deliverables:

- catalog schema
- top observed functions entered with parameters/options/statuses/runtime impact
- relationship classification converted to catalog-first semantics
- function API and viewer panel

Exit criteria:

- high-volume functions no longer depend on generic parameter heuristics
- function metadata appears in selected-rule packets

### Phase 3 - UDF And Table Canonical Objects

Deliverables:

- `UdfDefinition`
- `SelectionListDefinition`
- caller/callee graph
- table/schema/usage separation
- UDF/table API detail endpoints
- viewer detail panels

Exit criteria:

- UDF calls show real parameter names and statuses
- table views show lookup configuration and runtime keyer impact

### Phase 4 - FWD Object Graph And Page Context

Deliverables:

- `FwdObjectGraph`
- canonical document/page/variant/field/process/resource packets
- object tree navigation in viewer
- field geometry and variant context

Exit criteria:

- users can traverse from document/page/field to related rules/resources and back
- FWD object identity is stable across API/viewer/export

### Phase 5 - Runtime Impact And External Test Evidence

Deliverables:

- runtime-impact model
- reject/table/plug/keying impact panels
- optional AC Rules Tester evidence import format
- WR/OCR diff evidence model if external artifacts are supplied

Exit criteria:

- downstream operator workflow is visible and evidence-labeled
- no static configuration is mislabeled as observed execution

### Phase 6 - Architecture Split And Hardening

Deliverables:

- extraction services split from `FormWorksExtractionClient`
- query services split from `WorkbenchApiService`
- hosting/static/debug concerns split from `WorkbenchApiServer`
- expanded tests and package validation

Exit criteria:

- semantic models are easier to extend without touching server plumbing or viewer-only code

## Prioritized Backlog

| Priority | Item | Acceptance |
|---|---|---|
| P0 | Add canonical rule packet DTOs and builders. | Initial API packet is available through `editorModel` and `/rules/{nodeId}/editor-model`; continue expanding raw/reject/function detail coverage. |
| P0 | Add status-result action model. | Parent rule and child sub-list relationship is explicit and contract-tested for selected-rule packets; promote this to snapshot-wide rule-list models next. |
| P0 | Expand `AcFunctionCatalog` schema. | Catalog supports categories, parameter roles, statuses, behavior flags, and runtime impact fields. |
| P0 | Add top observed functions to catalog. | Initial observed-function seed set is covered by tests; continue until every observed function has non-heuristic metadata or an explicit unknown/custom marker. |
| P0 | Add golden tests for canonical selected-rule packets. | Representative scope/rule fixture asserts hierarchy, function, params, actions, diagnostics. |
| Closed | Add canonical UDF definitions. | API model now shows resource identity, caller bindings, field-list names, status results, parse state, and promoted internal Rule List bodies when evidence supports them. |
| P1 | Add canonical SelectionList/table definitions. | Initial API model separates schemaParsed=false, usage-derived match/plug fields, usage links, and runtime caveats. |
| P1 | Add FWD object graph. | Initial API model links documents/pages/variants/fields/processes/resources/rule lists with stable object IDs; private nodes and richer navigation remain open. |
| P1 | Add function detail endpoint and viewer panel. | Selecting a function shows schema and observed usage. |
| Closed | Add field detail endpoint and viewer panel. | Fields workspace now shows page-design context, field geometry, variants/FormID, role flags, and rule usage links. |
| P2 | Add runtime-impact model. | Reject/table/plug/keying impacts are evidence-labeled in rule packets. |
| P2 | Add process-private typed projections. | AC/DV/Store/private driver findings have typed packets and confidence. |
| Closed | Add page/variant design context. | Page-design packets expose variants/FormID when inferable, field geometry, role flags, related rules, and FIP inspection links. |
| P3 | Add optional AC Rules Tester evidence import. | Saved test cases/baselines/diffs can be displayed as external evidence. |
| P3 | Split large service classes. | Extraction/query/server responsibilities are separated after canonical model stabilizes. |

## Definition Of Done For Editor Gap Closure

The gap is closed for read-only inspection when all of these are true:

- The workbench can show the FWD object graph using Editor concepts.
- Every AC rule can be inspected as function + fields/parameters + attributes + status-result actions + raw evidence.
- Structural rule-list hierarchy and disabled inheritance are authoritative.
- UDFs are inspectable as reusable rule-list functions with named parameters, status results, internal rules, and caller bindings.
- Tables/SelectionLists are inspectable as lookup workflows with source, match fields, plug fields, options, persistence/rerun evidence, and runtime keyer impact.
- Function metadata is schema-driven for all observed functions, with unknowns explicitly marked.
- Runtime UX consequences are visible but never confused with observed execution.
- API v1 exposes canonical Editor-aligned objects with OpenAPI examples.
- Viewer panels render canonical packets instead of reverse-engineering semantics locally.
- Tests protect rule hierarchy, status-action routing, function catalog classification, UDFs, tables, fields, API contracts, viewer sync, and packaging.
- Documentation stays synchronized with model/API/viewer changes.

## Operating Rule

When adding any feature, ask this first:

```text
Which FormWorks Editor object or AC configuration concept does this represent?
```

If the answer is not clear, do not add a new dashboard metric or viewer-only abstraction. Add the missing canonical object, evidence source, and confidence first.
