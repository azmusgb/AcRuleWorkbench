# FW Editor Viewer v95

Script cleanup hotfix for v94 active-workbench launcher drift.

## Changes

- Keeps the v94 Newtonsoft import fix.
- Updates viewer build marker/cache key to `v95-fw-editor-viewer` / `fw-editor-viewer-v95`.
- Expands stale cleanup so old active `scripts/dev-workbench.ps1` and `scripts/dev-workbench.cmd` files are moved to `scripts/legacy-workbench`.
- Adds `scripts/remove-stale-workbench-surfaces.ps1` as an explicit cleanup entry point for checkouts that were updated over older packages.
- Static tests remain strict: active `scripts/dev-workbench.*` files are considered defects.

## Required after extracting over an existing checkout

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\scripts\remove-stale-fwcompanion-tests.ps1
.\scripts\remove-stale-workbench-surfaces.ps1
```

Then run build/tests.
