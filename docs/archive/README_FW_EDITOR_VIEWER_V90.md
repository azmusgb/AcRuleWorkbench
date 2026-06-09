# FW Editor Viewer v90

v90 is a stabilization and maintainability phase after the v89 UI/build-marker cleanup.

## Main changes

- Viewer build marker updated to `v99-fw-editor-viewer` through `viewer-build.txt`.
- Browser JavaScript source is split under `src/viewer/js/*.js` and concatenated into the runtime bundle by `scripts/build-viewer-js.ps1`.
- Browser CSS source is split under `src/viewer/styles/*.css` and concatenated into the runtime stylesheet by `scripts/build-viewer-css.ps1`.
- `scripts/sync-viewer-assets.ps1` now builds JS/CSS from source modules/layers before syncing root and Core viewer assets.
- Static tests now assert root/Core viewer files are generated from `src/viewer`, and that the generated bundles equal the concatenated module/layer sources.
- CSS `!important` budget was tightened to prevent further cascade debt growth.

## Launch

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\start-fw-editor-viewer.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting -ForceViewerRefresh
```

After the first successful run:

```powershell
.\start-fw-editor-viewer.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting -NoBuild
```

## Developer workflow

After editing any file under `src/viewer/js` or `src/viewer/styles`, run:

```powershell
.\scripts\sync-viewer-assets.ps1
node --check .\ac-rule-viewer.js
node .\tests\static\fw-editor-viewer.static.test.js
```

## Remaining larger refactors

- Physical C# extraction split of `FormWorksExtractionClient.cs`.
- Physical API route split of `WorkbenchApiService.cs`.
- Replacing the dependency-free concatenation split with ES modules would require a bundling/runtime decision and is intentionally deferred.
