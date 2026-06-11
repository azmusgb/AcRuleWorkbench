# Phase 7 — Lazy Detail Hydration Delta

This package adds the next deliberate phase after the verified boot-sidecar stability work.

## Goal

Keep the fast `boot-sidecar` startup path, but hydrate heavy FWD detail only when the user opens a workspace that needs it.

This avoids the old broken pattern:

```text
initial fast render -> background full sidecar load -> whole model rebuild -> whole body repaint
```

The new pattern is:

```text
initial fast render -> user opens detail workspace -> load ac-rule-viewer.fwd.json once -> rebuild model -> render selected workspace
```

## Files added

```text
src/viewer/js/12-lazy-detail-hydration.js
src/viewer/styles/99-lazy-hydration.css
scripts/apply-phase7-lazy-detail-hydration.js
scripts/test-phase7-lazy-detail-hydration.js
docs/PHASE7_LAZY_DETAIL_HYDRATION.md
```

## Files changed by the apply script

```text
src/viewer/js/70-actions-commands.js
src/viewer/js/90-render-bootstrap.js
src/viewer/ac-rule-viewer.js
src/viewer/ac-rule-viewer.css
AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js
AcRuleWorkbench.Core/Viewer/ac-rule-viewer.css
AcRuleWorkbench.Core/Viewer/ac-viewer-template.css
ac-rule-viewer.js
ac-rule-viewer.css
```

The root `ac-rule-viewer.js` / `ac-rule-viewer.css` copies are updated only when those paths exist.

## Apply

From the repository root:

```powershell
cd C:\dev\AcRuleWorkbench
Expand-Archive .\AcRuleWorkbench-phase7-lazy-detail-hydration-delta.zip -DestinationPath . -Force
node .\scripts\apply-phase7-lazy-detail-hydration.js

dotnet build .\AcRuleWorkbench.sln -c Debug -p:Platform=x86 -p:PlatformTarget=x86
```

Then restart the viewer using the current known-good launcher command.

## Verify

```powershell
node .\scripts\test-viewer-nav-stability.js "http://127.0.0.1:8787/viewer?nocache=phase7-nav"
node .\scripts\test-phase7-lazy-detail-hydration.js "http://127.0.0.1:8787/viewer?nocache=phase7-lazy"
```

Expected:

```text
[SUMMARY] failures: 0
```

## Notes

This phase intentionally does not re-enable background full-sidecar hydration. It loads `ac-rule-viewer.fwd.json` on demand when opening these workspaces:

```text
Rule Lists
User Defined Functions
Tables
SelectionLists
Resources
Drivers
```

If `ac-rule-viewer.fwd.json` is missing or not served by the API/static server, the lazy hydration test will fail with `lazy-not-loaded` or an HTTP/fetch error.
