# FW Editor Viewer v86

v85 makes `snapshotMode=live` usable for interactive browsing.

## Main change

`?snapshotMode=live` no longer forces a full synchronous FWD rebuild on every API request. Live mode now uses a live-coherent in-memory FWD model:

- first request builds or waits for the shared model when no model exists;
- subsequent clicks return the current warm model immediately;
- a throttled background refresh starts only when the model is older than `liveMinRefreshSeconds`;
- explicit full rebuild is still available with `?snapshotMode=rebuild`.

This prevents heavy resource clicks such as UDFs, functions, and tables from freezing the browser just because live mode is enabled.

## Recommended launch

```powershell
.\start-fw-editor-viewer.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

Default mode remains the best normal browsing mode because it waits for a ready model before opening the viewer.

## Live view

Use live mode when you want interactive requests to stay refresh-capable without per-click full rebuilds:

```text
http://127.0.0.1:8787/viewer?snapshotMode=live&liveMinRefreshSeconds=30
```

Use forced rebuild only for developer verification:

```text
http://127.0.0.1:8787/api/v1/snapshot?snapshotMode=rebuild
```

## Validation

```powershell
node --check ac-rule-viewer.js
node --check AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js
node --check tests/browser/fw-editor-viewer.behavior.spec.js
node tests/static/fw-editor-viewer-v86.static.test.js
```
