# FW Editor Viewer startup scripts

Preferred launcher:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

Compatibility launcher:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-viewer.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

Default behavior:

- builds with `build-and-doctor.ps1`
- validates local runtime folders
- uses export profile `viewer-safe`
- refreshes the viewer when artifacts are missing/stale or `-ForceViewerRefresh` is used
- starts the API in the foreground
- opens `/viewer?...nocache=...` when `/api/v1/health/live` responds

Advanced diagnostics are opt-in:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting -Advanced
```
