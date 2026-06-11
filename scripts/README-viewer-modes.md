# FW Editor Viewer startup modes

Default mode is now `LocalFast`. This is the old fast local path: generated static sidecar JSON is reused when current, and regenerated only when missing, stale, or when `-ForceViewerRefresh` is supplied.

## Default / old fast path

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

Equivalent explicit form:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-fw-editor-viewer.ps1 -ViewerMode LocalFast -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

## Force rebuild static sidecars

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-fw-editor-viewer.ps1 -ViewerMode LocalFast -FwdPath .\fwd.cfd -Port 8787 -KillExisting -ForceViewerRefresh
```

## Switch to hosted live-lazy mode

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-fw-editor-viewer.ps1 -ViewerMode LiveLazy -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

Short compatible switch:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-fw-editor-viewer.ps1 -LiveLazy -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

## Snapshot warm-up diagnostics

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-fw-editor-viewer.ps1 -ViewerMode SnapshotWarmup -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```
