# FW Editor Viewer v86

v86 is a responsiveness pass. It keeps the read-only FW Editor-style UI but removes the main sources of lag that made both snapshot and live browsing feel frozen.

## Main fixes

- Default boot no longer fans out across every FWD API endpoint when static generated sidecars are already available.
- API hydration is now opt-in with `?apiHydrate=1` unless static FWD data is missing.
- Live mode remains coherent through the shared warm model; click-time rendering does not force full FWD rebuilds.
- Rule, scope, diagnostic, relationship, edge, and Action List lookups now use scope/index maps instead of repeated full-array scans.
- UDF/function usage rows use a precomputed function-usage index instead of rescanning every rule for each resource.
- Rule List visible-row and tree-match calculations are cached per scope/query/filter/expansion state.
- Global navigation and product count calculations are cached.
- Search no longer JSON-stringifies full rule/resource objects for every row.

## Recommended launch

```powershell
.\start-fw-editor-viewer.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

## Live mode

Use live mode when you need the warm model to refresh from the FWD while browsing:

```text
http://127.0.0.1:8787/viewer?snapshotMode=live&liveMinRefreshSeconds=30
```

Use API hydration only when you specifically need to compare generated sidecar content with live API endpoint payloads:

```text
http://127.0.0.1:8787/viewer?apiHydrate=1
```

## Validation

```powershell
node --check ac-rule-viewer.js
node --check AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js
node --check tests/browser/fw-editor-viewer.behavior.spec.js
node tests/static/fw-editor-viewer-v86.static.test.js
```
