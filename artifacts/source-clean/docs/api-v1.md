# FW Companion API v1 Guide

Base path: `/api/v1`

The API exposes read-only static FWD configuration. It does not execute AC rules, run AC Rules Tester, or prove runtime operator outcomes.

## Stable endpoints

```http
GET  /api/v1/health/live
GET  /api/v1/health/ready
GET  /api/v1/status
GET  /api/v1/snapshot
POST /api/v1/snapshot/refresh
GET  /api/v1/editor-model
GET  /api/v1/scopes
GET  /api/v1/scopes/{scopeId}
GET  /api/v1/rules/{nodeId}
GET  /api/v1/rules/{nodeId}/editor-model
GET  /api/v1/rule-lists
GET  /api/v1/rule-lists/{scopeId}
GET  /api/v1/fwd
GET  /api/v1/fwd/object-graph
GET  /api/v1/fwd/documents
GET  /api/v1/fwd/pages
GET  /api/v1/fwd/page-variants
GET  /api/v1/fwd/fields
GET  /api/v1/fwd/batches
GET  /api/v1/fwd/processes
GET  /api/v1/fwd/processes/{process}
GET  /api/v1/fwd/resources
GET  /api/v1/fwd/functions
GET  /api/v1/fwd/functions/{name}
GET  /api/v1/fwd/tables
GET  /api/v1/fwd/selection-lists
GET  /api/v1/fwd/tables/inferred
GET  /api/v1/fwd/udfs
GET  /api/v1/fwd/udfs/canonical
GET  /api/v1/fwd/udfs/{name}
GET  /api/v1/fwd/runtime-impact
GET  /api/v1/search
GET  /api/v1/diagnostics
GET  /api/v1/openapi.json
```

Some internal route names retain `workbench` for compatibility. New UI text and docs should use FW Companion.

## Include expansion

Use `include=` to reduce endpoint sprawl:

```http
GET /api/v1/scopes/{scopeId}?include=structure,inventory,references,diagnostics
GET /api/v1/rules/{nodeId}?include=subtree,references,diagnostics
```

## Selected-rule packet

Rule detail responses preserve the compatibility payload and include an `editorModel` section. `GET /api/v1/rules/{nodeId}/editor-model` returns the canonical selected-rule packet directly.

The packet uses FW Editor vocabulary:

- Rule List
- Rule
- Parent Rule
- incoming Status Result
- Function
- Fields / Parameters
- Attributes
- Action Lists
- References
- Reader Status
- Raw

The packet is a read-only configuration view, not a runtime execution trace.

## Snapshot model

`GET /api/v1/editor-model` returns the snapshot-level FW Editor parity model. Use `include=` to request specific sections:

```http
GET /api/v1/editor-model?include=objectGraph,ruleLists,udfs,selectionLists,runtimeImpacts
```

Section aliases also have direct routes:

```http
GET /api/v1/rule-lists
GET /api/v1/fwd/object-graph
GET /api/v1/fwd/udfs/canonical
GET /api/v1/fwd/selection-lists
GET /api/v1/fwd/page-designs
GET /api/v1/fwd/runtime-impact
```

These routes are canonical read-only projections, not authoring surfaces.

## Function catalog

`GET /api/v1/fwd/functions` returns the AC function catalog. It merges seeded function metadata with observed rule usage, configured ActionNames/status results, parameter schema entries, capability flags, observed parameter names, relationship samples, and static runtime-impact notes.

Unknown/custom functions remain visible as observed usage instead of being silently dropped or falsely treated as curated.

## Refresh

Refresh is a POST:

```http
POST /api/v1/snapshot/refresh
```

Refresh rebuilds the static snapshot. It does not run AC rules.

## Validation

```powershell
.\scripts\validate-api-live.ps1 -BaseUrl http://127.0.0.1:8787
```

## Interpretation rules

- Structural data is static configuration.
- References are static relationships and should expose confidence or source context when available.
- Reader Status messages explain load/read limitations.
- Additional Rules are readable/searchable but do not prove exact Rule List placement.
- Runtime outcomes require runtime/test evidence outside the API.
