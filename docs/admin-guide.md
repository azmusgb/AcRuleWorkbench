# FW Companion Admin Guide

FW Companion runs a local read-only API and browser viewer over a configured FormWorks/FWD file. It does not edit the FWD, save configuration, run AC Rules Tester, or execute AC runtime logic.

## Default local posture

Recommended local startup:

```cmd
.\start-fw-editor-viewer.cmd -FwdPath C:\dev\AcRuleWorkbench\fwd.cfd -Port 8787
```

PowerShell equivalent:

```powershell
.\scripts\start-workbench.ps1 -FwdPath C:\dev\AcRuleWorkbench\fwd.cfd -Port 8787 -KillExisting
```

Default posture:

- Listens on loopback (`127.0.0.1`) unless explicitly changed.
- Debug API is disabled.
- CORS is disabled.
- Path-query overrides are disabled when a startup FWD path is configured.
- Snapshot refresh is controlled by startup flags and script profile.
- Viewer opens in read-only mode.

## Required runtime shape

FormWorks/DCM native dependencies are x86. Use x86 for build and startup.

```powershell
.\scripts\build-and-doctor.ps1 `
  -Configuration Debug `
  -Platform x86 `
  -FwdPath .\fwd.cfd
```

Expected local folders:

| Folder | Purpose |
|---|---|
| `lib` | Managed FormWorks/DCM wrapper DLLs used by the .NET project. |
| `rri_bin` | Native x86 FormWorks/DCM DLLs used at runtime. |
| `scripts/runtime-path.generated.ps1` | Generated PATH helper for native DLL load order. |

Run setup when dependencies are missing or stale:

```powershell
.\scripts\setup-dcm-deps.ps1
```

## Health checks

```http
GET /api/v1/health/live
GET /api/v1/health/ready
GET /api/v1/status
```

Liveness is a process check. Readiness verifies configured source and snapshot readiness.

Scripted verification:

```powershell
.\scripts\verify-fw-editor-viewer-live.ps1 -BaseUrl http://127.0.0.1:8787
```

## Port handling

When the requested port is held by a normal process, `-KillExisting` can stop it. When the port is held by HTTP.sys/System PID 4, the startup scripts do not kill System; they can select the next available local port unless `-NoAutoPort` is set.

```cmd
.\start-fw-editor-viewer.cmd -Port 8787 -NoAutoPort
```

## Snapshot and viewer refresh

Normal startup builds/doctors, refreshes the viewer when needed, then starts the API.

Useful options:

```cmd
.\start-fw-editor-viewer.cmd -SkipBuild
.\start-fw-editor-viewer.cmd -SkipViewerRefresh
.\start-fw-editor-viewer.cmd -NoBrowser
.\start-fw-editor-viewer.cmd -Clean -ForceSetup
```

Use `-SkipViewerRefresh` only when the existing generated viewer and sidecars are known to match the current FWD.

## Debug API

Debug routes are disabled by default and are not product contracts. Enable them only for local engineering analysis.

```powershell
.\scripts\start-workbench.ps1 `
  -FwdPath .\fwd.cfd `
  -Port 8787 `
  -KillExisting `
  -EnableDebugApi `
  -AllowPathQuery `
  -OpenHarness
```

For product validation, prefer `/api/v1` routes and the viewer.

## API validation quickstart

```powershell
.\scripts\validate-api-live.ps1 -BaseUrl http://127.0.0.1:8787
```

Expected result is a pass table with `Ok=True` for each API v1 endpoint.

## Legacy routes

Legacy `/api/fwd/*` and `/api/workbench/*` routes remain for compatibility and may carry deprecation headers. New integrations should use `/api/v1`.

## Deployment boundary

FW Companion is safest as a local or tightly controlled internal tool. Before exposing beyond loopback, explicitly review:

- source FWD path access
- debug API disabled
- CORS policy
- firewall rules
- sensitive-value masking
- generated viewer sidecar location
- logs and diagnostic retention

