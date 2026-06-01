# Developer Guide

## Product API workflow

1. Check server health.
2. Load status.
3. Build or read snapshot.
4. List scopes.
5. Inspect one scope.
6. Inspect one rule.
7. Search evidence.
8. Export a product-safe evidence slice.

```powershell
$base = 'http://127.0.0.1:8787'
Invoke-RestMethod "$base/api/v1/status"
Invoke-RestMethod "$base/api/v1/snapshot"
$scopes = Invoke-RestMethod "$base/api/v1/scopes"
```

## Expanded scope detail

```http
GET /api/v1/scopes/{scopeId}?include=structure,inventory,references,diagnostics
```

## Expanded rule detail

```http
GET /api/v1/rules/{nodeId}?include=subtree,references,diagnostics
```

`{nodeId}` can be either `node-xxxxxx` or a `RuleGuid` value.

```http
GET /api/v1/rules/node-000414
GET /api/v1/rules/db5bf065-618b-44ca-8484-0d12384e7d1a
```

## Live harness validation

Use the debug harness for endpoint-by-endpoint verification:

```powershell
.\scripts\start-workbench.ps1 `
	-FwdPath C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd `
	-Port 8788 `
	-EnableDebugApi `
	-AllowPathQuery `
	-OpenHarness
```

Run automated live validation against the same server:

```powershell
.\scripts\validate-api-live.ps1 -BaseUrl http://127.0.0.1:8788
```

During UI demos, `POST /api/v1/snapshot/refresh` is expected to be the slowest endpoint because it rebuilds cached snapshot state.

If you want to avoid cached snapshot reuse entirely, start in no-cache mode:

```powershell
.\scripts\start-workbench.ps1 -FwdPath C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd -NoSnapshotCache
```

No-cache mode makes snapshot-backed routes rebuild each request and reports readiness from source path validity rather than prior snapshot cache warm-up.

## Error behavior

Product API errors use a consistent envelope with `ok=false`, `error.code`, `error.message`, and `requestId`. Use `requestId` to locate related logs.

## Do not build clients against debug routes

Debug routes are intentionally unstable and hidden by default. Use `/api/v1/openapi.json` as the public contract.
