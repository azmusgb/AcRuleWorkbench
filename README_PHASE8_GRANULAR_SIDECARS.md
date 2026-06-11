# AcRuleWorkbench Phase 8 Delta — Granular Sidecars

This package adds granular sidecar generation and runtime hydration for the FW Editor Viewer.

## Apply

```powershell
cd C:\dev\AcRuleWorkbench
Expand-Archive .\AcRuleWorkbench-phase8-granular-sidecars-delta.zip -DestinationPath . -Force
node .\scripts\apply-phase8-granular-sidecars.js

dotnet build .\AcRuleWorkbench.sln -c Debug -p:Platform=x86 -p:PlatformTarget=x86
```

## Restart

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-fw-editor-viewer.ps1 `
  -ViewerMode LocalFast `
  -FwdPath .\fwd.cfd `
  -Port 8787 `
  -KillExisting `
  -NoBuild `
  -OpenWhenLive
```

The start script is patched to generate granular sidecars before launching the API.

## Verify

```powershell
node .\scripts\test-viewer-nav-stability.js "http://127.0.0.1:8787/viewer?nocache=phase8-nav"
node .\scripts\test-phase7-lazy-detail-hydration.js "http://127.0.0.1:8787/viewer?nocache=phase8-phase7-regression"
node .\scripts\test-phase8-granular-sidecars.js "http://127.0.0.1:8787/viewer?nocache=phase8-granular"
```

## Browser diagnostics

```js
(() => ({
  diagnostics: window.fwViewerDiagnostics?.(),
  granular: window.fwViewerGranularState?.(),
  lazy: window.fwViewerLazyHydrationState?.()
}))();
```
