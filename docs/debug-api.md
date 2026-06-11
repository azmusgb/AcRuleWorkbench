# Debug API Guide

Debug routes are engineering-only support routes. They are disabled by default and are not product contracts.

Use the public `/api/v1` routes for FW Companion behavior and integration tests.

## Enable debug routes

```powershell
.\scripts\start-fw-editor-viewer.ps1 `
  -FwdPath .\fwd.cfd `
  -Port 8787 `
  -KillExisting `
  -EnableDebugApi `
  -AllowPathQuery `
  -OpenHarness
```

## Canonical debug routes

```http
GET /api/debug/health
GET /api/debug/routes
GET /api/debug/probe
GET /api/debug/inspect
GET /api/debug/stc/processes
GET /api/debug/ac/rules
GET /api/debug/ac/tree
GET /api/debug/ac/relationships
GET /api/debug/ac/flow-debug
```

Debug output can help diagnose reader behavior. It should not be used as user-facing FW Companion copy, product terminology, or a stable schema.
