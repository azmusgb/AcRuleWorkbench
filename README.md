# AC Rule Workbench

AC Rule Workbench is a local, read-only operational inspection app for FormWorks / Document Capture Manager Auto Capture rules. It opens a configured `fwd.cfd`, builds a normalized evidence model, serves a focused viewer, exposes a stable `/api/v1` product API, and exports reviewer-ready evidence packages.

## Production posture

Default mode is intentionally conservative:

- Debug API is **disabled by default**.
- CORS is **disabled by default**.
- Request-level `?path=` overrides are **disabled** when the server was started with `--path`.
- Legacy `/api/fwd/*`, `/api/ac/*`, `/api/probe`, `/api/inspect`, and `/api/workbench/*` routes are compatibility or diagnostic surfaces, not product contracts.
- The viewer treats Structure as hierarchy/order evidence and flat Inventory as search/completeness evidence only.

## Build

```powershell
.\scripts\build-and-doctor.ps1
```

The FormWorks/DCM runtime is x86. The project defaults to x86 to avoid accidental AnyCPU/x64 native-load failures.

## Run local production viewer

On Windows hosts with restrictive execution policy, use the `.cmd` wrappers in `scripts` so startup works without local policy changes.

```powershell
.\scripts\start-workbench.cmd `
  -FwdPath C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd `
  -Port 8787 `
  -KillExisting
```

Open:

```text
http://127.0.0.1:8787/viewer
http://127.0.0.1:8787/api/v1/status
http://127.0.0.1:8787/api/v1/openapi.json
```

## Run diagnostic/developer mode

Use this only when inspecting raw extraction behavior or using the API harness:

```powershell
.\scripts\start-workbench.cmd `
  -FwdPath C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd `
  -Port 8787 `
  -EnableDebugApi `
  -AllowPathQuery `
  -OpenHarness
```

Diagnostic routes live under `/api/debug/*`. Top-level raw routes are legacy aliases and should not be used by new clients.

## Public product API

```http
GET  /api/v1/health/live
GET  /api/v1/health/ready
GET  /api/v1/status
GET  /api/v1/snapshot
POST /api/v1/snapshot/refresh
GET  /api/v1/scopes
GET  /api/v1/scopes/{scopeId}?include=structure,inventory,references,diagnostics
GET  /api/v1/rules/{nodeId}?include=subtree,references,diagnostics
GET  /api/v1/search?q=provider
GET  /api/v1/diagnostics
POST /api/v1/export
GET  /api/v1/openapi.json
```

Compatibility aliases for scope/rule subresources remain available, but the preferred production style is `include=`.

## Validate package quality

```powershell
.\scripts\test-code-quality.ps1
.\scripts\test-api-v1.ps1 -BaseUrl http://127.0.0.1:8787
```

`test-code-quality.ps1` checks PowerShell syntax, OpenAPI JSON, viewer JavaScript syntax when Node.js is available, duplicate viewer function declarations, unhandled viewer actions, and exposure of the removed density toggle.

## Documentation

- [Operator Guide](docs/operator-guide.md)
- [Admin Guide](docs/admin-guide.md)
- [Developer Guide](docs/developer-guide.md)
- [API v1 Guide](docs/api-v1.md)
- [Debug API Guide](docs/debug-api.md)
- [Evidence Model](docs/evidence-model.md)
- [Configuration](docs/configuration.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Runbooks](docs/runbooks)

## Evidence discipline

The app performs static configuration inspection. It does not simulate native AC runtime execution.

- Structural tree evidence proves hierarchy, branch order, action routing, and disabled inheritance.
- Flat inventory proves extraction coverage and broad searchability, not runtime order.
- References are static evidence-coded relationships; confidence must be read explicitly.
- Diagnostics are part of the product trust model, not debug noise.
