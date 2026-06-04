# API v1 Guide

Base path: `/api/v1`

The API exposes read-only static FWD configuration evidence. It does not execute AC rules, run AC Rules Tester, or prove runtime operator outcomes. See [FormWorks Editor And AC Function Reference](formworks-editor-ac-reference-guide.md) for the rule-list, function, UDF, SelectionList/table, and runtime-UX model.

## Stable endpoints

```http
GET  /health/live
GET  /health/ready
GET  /status
GET  /snapshot
POST /snapshot/refresh
GET  /editor-model
GET  /scopes
GET  /scopes/{scopeId}
GET  /rules/{nodeId}
GET  /rules/{nodeId}/editor-model
GET  /rule-lists
GET  /rule-lists/{scopeId}
GET  /fwd
GET  /fwd/object-graph
GET  /fwd/documents
GET  /fwd/pages
GET  /fwd/page-variants
GET  /fwd/fields
GET  /fwd/batches
GET  /fwd/processes
GET  /fwd/processes/{process}
GET  /fwd/resources
GET  /fwd/functions
GET  /fwd/functions/{name}
GET  /fwd/tables
GET  /fwd/selection-lists
GET  /fwd/tables/inferred
GET  /fwd/udfs
GET  /fwd/udfs/canonical
GET  /fwd/udfs/{name}
GET  /fwd/runtime-impact
GET  /search
GET  /diagnostics
GET  /openapi.json
```

`/fwd/functions` is the AC function catalog endpoint. It merges seeded function metadata with observed rule usage, configured ActionNames/status results, observed parameter names, relationship samples, and static runtime-impact notes. Unknown/custom functions remain visible as observed usage instead of being silently dropped.

## Include expansion

Use `include=` to reduce endpoint sprawl:

```http
GET /api/v1/scopes/{scopeId}?include=structure,inventory,references,diagnostics
GET /api/v1/rules/{nodeId}?include=subtree,references,diagnostics
```

Rule detail responses preserve the compatibility payload and include an `editorModel`
section. `GET /api/v1/rules/{nodeId}/editor-model` returns that canonical selected-rule
packet directly as `AcWorkbench.SelectedRulePacket`. The packet uses FormWorks Editor
vocabulary: Rule List, Rule, parent Rule, incoming Status Result, Function, Parameters,
Attributes, Field Bindings, Action Lists, References, Diagnostics, Evidence, and
static-inspection caveats.

`GET /api/v1/editor-model` returns the snapshot-level FormWorks Editor parity model.
Use `include=objectGraph,ruleLists,udfs,selectionLists,runtimeImpacts` to request
specific sections. The section aliases also have direct routes:

```http
GET /api/v1/rule-lists
GET /api/v1/fwd/object-graph
GET /api/v1/fwd/udfs/canonical
GET /api/v1/fwd/selection-lists
GET /api/v1/fwd/page-designs
GET /api/v1/fwd/runtime-impact
```

These routes are canonical read-only projections, not authoring surfaces. Snapshot
builds now request resource configuration and bounded private resource trees, so UDF
definitions can expose field-list parameters, status results, promoted internal Rule
List projections, caller-slot bindings, and resource evidence when the native payload
contains those signals. SelectionList/table definitions can expose parsed match fields, plug
fields, persistence, rerun/keyer/popup/enter/no-good-match options, and plug/reject
outcome roles from resource evidence. Page-design packets expose page variants/FormID
when inferable, field containers, parsed geometry, role flags, related AC rules, and
links to FIP inspection for dropout/OMR evidence. When the native payload only yields
resource names or rule usage, the same packets keep explicit parse-state diagnostics
rather than implying unavailable native bytes were decoded.

The desktop viewer hydrates these canonical packets directly when hosted by the API:
the Resources workspace consumes the object graph, the selected-rule inspector shows
the RuleConfiguration packet, the UDF workspace consumes canonical UDF definitions,
the Tables workspace consumes SelectionList definitions, the Fields workspace consumes
page-design packets, and the Functions workspace shows runtime-impact records. These panels remain static evidence views; they do not
execute AC rules or modify FWD configuration.

## Rule identifier behavior

`/rules/{nodeId}` accepts either of these identifiers:

```http
GET /api/v1/rules/node-000414
GET /api/v1/rules/db5bf065-618b-44ca-8484-0d12384e7d1a
```

Use `node-xxxxxx` when available. `RuleGuid` is also accepted for direct lookup and subtree routes.

## Live validation flow

Run the server in debug mode when validating through the UI harness:

```powershell

.\scripts\start-workbench.ps1 `
	-FwdPath C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd `
	-Port 8788 `
	-EnableDebugApi `
	-AllowPathQuery `
	-OpenHarness
```

Then run endpoint sweep validation:

```powershell
.\scripts\validate-api-live.ps1 -BaseUrl http://127.0.0.1:8788
```

`POST /api/v1/snapshot/refresh` may take noticeably longer than other endpoints during full cache rebuild.

To avoid reusing snapshot cache state during demos or diagnostics, start with live rebuild mode:

```powershell
.\scripts\start-workbench.ps1 -FwdPath C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd -NoSnapshotCache
```

In this mode, snapshot-backed routes rebuild on each request and readiness checks validate source path availability instead of requiring a prebuilt cached snapshot.

## Static inspection caveat

The API does not simulate native AC runtime execution. Structural data is configuration evidence. References are static and confidence-coded.
