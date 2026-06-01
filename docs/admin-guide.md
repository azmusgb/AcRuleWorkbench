# Admin Guide

## Default secure local mode

Start with a fixed FWD path and no debug API:

```powershell
.\scripts\start-workbench.ps1 -FwdPath C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd -Port 8787
```

Default posture:

- Loopback URL by default.
- Debug API disabled.
- CORS disabled.
- Path query overrides disabled when `--path` is configured.
- Refresh is available only when the server is started with `--allow-refresh` by the wrapper script.

## Diagnostic mode

Use diagnostic mode only for engineering analysis:

```powershell
.\scripts\start-workbench.ps1 -FwdPath C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd -EnableDebugApi -AllowPathQuery -OpenHarness
```

<!--  -->
## API live validation quickstart

Use this when you need to verify all product API endpoints through the harness and scripted checks.

```powershell
.\scripts\start-workbench.ps1 `
	-FwdPath C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd `
	-Port 8788 `
	-EnableDebugApi `
	-AllowPathQuery `
	-OpenHarness
```

In the harness:

- Use `GET Rule detail /api/v1/rules/{nodeId}` with either `node-000414` or `db5bf065-618b-44ca-8484-0d12384e7d1a`.
- Expect `POST /api/v1/snapshot/refresh` to take longer than most endpoints.

Run endpoint sweep validation:

```powershell
.\scripts\validate-api-live.ps1 -BaseUrl http://127.0.0.1:8788
```

Expected result is a pass table with `Ok=True` for each API v1 endpoint.

## Health checks

```http
GET /api/v1/health/live
GET /api/v1/health/ready
GET /api/v1/status
```

Liveness is a cheap process check. Readiness verifies configured source and snapshot readiness.

For rebuild-per-request operation (no snapshot cache reuse), start with `-NoSnapshotCache`. In this mode readiness verifies source path availability and does not require cache warm-up via `/api/v1/snapshot`.

## Legacy routes

Legacy `/api/fwd/*` and `/api/workbench/*` routes remain for compatibility and carry deprecation headers. New integrations must use `/api/v1`.
