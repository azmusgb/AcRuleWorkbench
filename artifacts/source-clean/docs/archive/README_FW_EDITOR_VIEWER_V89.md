# FW Editor Viewer v89

v89 is a stabilization release focused on eliminating version drift, launcher drift, and the CSS/JS guardrail gaps that caused blank resource panes and helper-reference errors.

## Recommended launch

```powershell
.\start-fw-editor-viewer.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting -ForceViewerRefresh
```

After a successful forced refresh:

```powershell
.\start-fw-editor-viewer.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting -NoBuild
```

## Build marker

The single viewer build constant is stored in:

```text
viewer-build.txt
```

Current value:

```text
v99-fw-editor-viewer
```

## Stabilization items

- version-neutral static test: `tests/static/fw-editor-viewer.static.test.js`
- full canonical startup engine: `scripts/start-fw-editor-viewer.ps1`
- deprecated compatibility wrapper: `scripts/start-workbench.ps1`
- `fweditor-global-mode` now applies only to global resource workspaces
- forbidden CSS checks prevent hiding `.main-head` and `#content` in resource views
- UDF filtering uses precomputed `searchBlob` rather than render-time `JSON.stringify`
- resource workspace browser test checks UDFs, Functions, Tables, and Rule Lists are not blank
- snapshot cache now keeps a small keyed LRU cache instead of one current snapshot only
- canonical viewer source boundary introduced under `src/viewer`

## Validation

```powershell
node --check .\ac-rule-viewer.js
node --check .\AcRuleWorkbench.Core\Viewer\ac-rule-viewer.js
node .\tests\static\fw-editor-viewer.static.test.js
```
