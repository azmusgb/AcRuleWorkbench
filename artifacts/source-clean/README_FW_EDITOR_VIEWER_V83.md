# FW Editor Viewer v86

This phase fixes startup timing for large FWD/CFD files.

## Primary fix

The preferred launcher now waits for API **ready health** before opening the browser by default. This prevents the viewer from opening against a half-built snapshot and showing a misleading blank or partially hydrated configuration screen.

## Startup behavior

Default:

```powershell
.\start-fw-editor-viewer.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

- Opens the browser only after `/api/v1/health/ready` responds.
- Uses a 600-second default readiness timeout.
- Shows `Open wait mode: ready` in the startup plan.
- Uses seven startup steps instead of the incorrect `[7/6]` display.

Developer fast-open mode:

```powershell
.\start-fw-editor-viewer.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting -OpenWhenLive
```

Use this only when intentionally testing the loading state. It opens when live health responds before snapshot readiness.

## Other updates

- Build marker: `v86-fw-editor-viewer`.
- Added `scripts\verify-fw-editor-viewer-live.ps1` as the preferred live verifier.
- Updated build-and-doctor next-step guidance to recommend `start-fw-editor-viewer` instead of old workbench commands.
- Added static regression checks for ready-wait startup behavior.
