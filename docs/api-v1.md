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
GET  /scopes
GET  /scopes/{scopeId}
GET  /rules/{nodeId}
GET  /fwd
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
GET  /fwd/tables/inferred
GET  /fwd/udfs
GET  /fwd/udfs/{name}
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
