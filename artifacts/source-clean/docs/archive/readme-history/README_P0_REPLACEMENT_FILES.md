# FW Editor Viewer P0 Replacement Files

Replace these files at the repository root using the included `AcRuleWorkbench/...` paths.

## P0 fixes included

1. **Light mode default restored**
   - `ac-rule-viewer.html`
   - `ac-rule-viewer-test.html`
   - `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.html`
   - `AcRuleWorkbench.Core/Viewer/ac-viewer-template.html`
   - `ac-rule-viewer.js`
   - `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js`

2. **Action-list labels normalized/resolved**
   - Fixes FormWorks escaped status-result lists such as `Yes\",\"No` being treated as one action name.
   - Static sidecar now has 0 unresolved non-root action edges.
   - Source parser fix is in `AcRuleWorkbench.Core/AcStructuralTreeParser.cs`.

3. **Flat inventory fallback closes visible structural coverage gaps**
   - Adds read-only fallback structural entries for flat AC rows that have no decoded structural node.
   - Fallback entries are explicitly marked with `_FlatInventoryFallback=true` and `Confidence=Fallback`.
   - This preserves search/display completeness without pretending parent/action placement is proven.
   - Source reconciliation is in `AcRuleWorkbench/Api/V1/WorkbenchSnapshot.cs`.
   - API evidence wording is corrected in `AcRuleWorkbench/Api/V1/WorkbenchApiService.cs`.

## Static sidecar validation after this patch

- Flat AC rows: `5,924`
- Structural rule nodes shown: `5,924`
- Structural coverage gap: `0`
- Non-root unresolved action edges: `0`
- Fallback entries added:
  - `AC/Documents/Dental_Doc`: `110`
  - `AC/Pages/DentalADA`: `745`
  - `AC/Pages/General`: `510`

## How to apply

Copy the contents of the included `AcRuleWorkbench` folder over your existing repository root.

PowerShell example from the folder containing this README:

```powershell
Copy-Item -Path .\AcRuleWorkbench\* -Destination C:\dev\AcRuleWorkbench -Recurse -Force
```

Then rebuild/start normally:

```powershell
.\scripts\build-and-doctor.ps1 -FwdPath .\fwd.cfd
.\scripts\start-api.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

## Expected behavior

- Viewer defaults to light mode unless the user explicitly toggles dark mode.
- Scope counts no longer show missing flat-rule coverage in the static viewer sidecar.
- Action-list branches display real status-result names instead of `Action 1` where the parent had escaped action names.
- Any fallback node clearly states that route placement is not proven.

