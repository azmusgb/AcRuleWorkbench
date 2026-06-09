# FW Editor Viewer v80

This phase tightens the default viewer into a stricter read-only FW Editor-style surface. The default navigation now uses Load Status as the developer-only diagnostics page instead of a Messages workspace, and old deep links are normalized safely.

## Changes

- Added a real `load-status` workspace id for developer-only load details.
- Normalized old `?view=messages` deep links to `?view=load-status`.
- Removed `view-messages` from workspace navigation.
- Changed default scope tabs to expose only **Rule List** and **Fields / Parameters** unless advanced mode is enabled.
- Changed advanced navigation heading from **Advanced Diagnostics** to **Developer** and the page label to **Load Status**.
- Renamed remaining CSS custom properties from `--workbench-*` to `--fweditor-*`.
- Renamed the old `tables-workbench` CSS class to `tables-fweditor`.
- Updated viewer build/cache marker to `v80-fw-editor-viewer`.
- Added stricter static checks for load-status routing, default shell naming, duplicate functions, and workbench vocabulary leakage.

## Preferred run command

```powershell
.\start-fw-editor-viewer.cmd -FwdPath C:\path\to\fwd.cfd -Port 8787 -KillExisting
```

Advanced diagnostics remain explicitly opt-in:

```powershell
.\start-fw-editor-viewer.cmd -FwdPath C:\path\to\fwd.cfd -Port 8787 -Advanced
```

## Validation

```powershell
node --check ac-rule-viewer.js
node --check AcRuleWorkbench.Core\Viewer\ac-rule-viewer.js
node --check tests\browser\fw-editor-viewer.behavior.spec.js
node tests\static\fw-editor-viewer-v80.static.test.js
```

## v80 specifics

- Default UI: FWD Tree + AC Rule List + Rule Properties.
- Developer-only UI: Load Status, raw JSON, object graph, runtime impact, and old app shell.
- Static guard: no duplicate top-level viewer function declarations.
- Static guard: default workspace navigation does not use Messages/workbench naming.
