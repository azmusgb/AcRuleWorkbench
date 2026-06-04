# AC Rule Workbench Resource Hydration Fix

Apply by extracting this zip directly into the repository root:

```powershell
cd C:\dev\AcRuleWorkbench
Expand-Archive .\AcRuleWorkbench-resource-hydration-viewer-fix.zip -DestinationPath C:\dev\AcRuleWorkbench -Force
.\scripts\start-workbench.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

Then hard refresh the browser with Ctrl+F5.

## Changed files

- `ac-rule-viewer.html`
- `ac-rule-viewer.js`
- `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.html`
- `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js`

## Fixes

- Increases API hydration timeout from 8 seconds to 45 seconds for large FWD resource payloads.
- Loads SelectionLists with `includeInferred=true`.
- Uses the focused `/fwd/udfs` endpoint for the main UDF browser instead of promoting rule-usage-only records from the huge canonical/editor-model payload.
- Merges canonical Tables with SelectionLists instead of letting SelectionLists hide the canonical table inventory.
- Treats `canonical=true` as a defined table/resource signal.
- Updates the HTML cache buster to `readonly-editor-v62-12`.

## Validation

- `node --check ac-rule-viewer.js`
- `node --check AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js`
- No C# files are included in this package.
