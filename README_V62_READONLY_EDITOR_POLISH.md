# v62 Read-only FW Editor Polish

This package refreshes the AC Rule Workbench viewer around the final product boundary:

> AC Rule Workbench is a read-only FW Editor companion for AC-related FWD configuration, with enhanced search, navigation, and inspection.

## Focus

- Preserve read-only behavior.
- Preserve existing viewer/API data contracts.
- Keep FW Editor vocabulary: rule configuration, fields / parameters, attributes, status results, action lists, parent rule, sub-list, references, raw.
- Remove the remaining user-facing diagnostic/evidence framing from the browser viewer.
- Improve layout balance and visual hierarchy using the compact industrial direction from the supplied prototype.

## Updated files

- `ac-rule-viewer.html`
- `ac-rule-viewer.css`
- `ac-rule-viewer.js`
- `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.html`
- `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.css`
- `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js`
- `AcRuleWorkbench.Core/Viewer/ac-viewer-template.html`
- `AcRuleWorkbench.Core/Viewer/ac-viewer-template.css`
- `README.md`

## Cache key

```text
readonly-editor-v62
```

Open with:

```powershell
Start-Process msedge "http://127.0.0.1:8787/viewer?ui=readonly-editor-v62&nocache=$([guid]::NewGuid())"
```
