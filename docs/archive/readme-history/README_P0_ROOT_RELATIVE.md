# FW Editor Viewer P0 Root-Relative Replacement Files

This package is intentionally **repository-root-relative**. Extract it directly into:

```powershell
C:\dev\AcRuleWorkbench
```

Do **not** extract it into `C:\dev` and do not copy an outer `AcRuleWorkbench` folder. This zip has no outer repository folder by design.

## What this corrects

- Prevents accidental nested paths such as:
  - `AcRuleWorkbench\AcRuleWorkbench.Core\AcStructuralTreeParser.cs`
  - `AcRuleWorkbench\AcRuleWorkbench\Api\V1\WorkbenchApiService.cs`
- Includes cleanup for the earlier accidental one-level-too-deep extraction.
- Keeps the P0 code fixes from the prior package:
  - light-mode default
  - action/status-result label normalization
  - flat inventory fallback nodes for zero visible structural coverage gap
  - corrected `TableColumnVm` conditional branch
  - no `ResourcePrivateNode.DataPreviewText` dependency

## Apply from `C:\dev\AcRuleWorkbench`

```powershell
# 1. Clean the accidental nested files from the prior package, if present.
.\scripts\repair-p0-misextract.ps1

# 2. Extract this zip directly into the repo root.
Expand-Archive .\AcRuleWorkbench-P0-root-relative-buildfix.zip -DestinationPath C:\dev\AcRuleWorkbench -Force

# 3. Validate layout before building.
.\scripts\validate-p0-layout.ps1

# 4. Build.
.\scripts\build-and-doctor.ps1 -FwdPath .\fwd.cfd
```

If the cleanup script is not present yet because this zip has not been extracted, use the manual cleanup commands below first.

## Manual cleanup, if needed

```powershell
Remove-Item .\AcRuleWorkbench\AcRuleWorkbench.Core -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item .\AcRuleWorkbench\AcRuleWorkbench -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item .\AcRuleWorkbench\ac-rule-viewer.html -Force -ErrorAction SilentlyContinue
Remove-Item .\AcRuleWorkbench\ac-rule-viewer-test.html -Force -ErrorAction SilentlyContinue
Remove-Item .\AcRuleWorkbench\ac-rule-viewer.js -Force -ErrorAction SilentlyContinue
Remove-Item .\AcRuleWorkbench\ac-rule-viewer.tree.json -Force -ErrorAction SilentlyContinue
```

## Replacement files included

- `AcRuleWorkbench.Core\AcStructuralTreeParser.cs`
- `AcRuleWorkbench\Api\V1\WorkbenchSnapshot.cs`
- `AcRuleWorkbench\Api\V1\WorkbenchApiService.cs`
- `ac-rule-viewer.html`
- `ac-rule-viewer-test.html`
- `ac-rule-viewer.js`
- `ac-rule-viewer.tree.json`
- `AcRuleWorkbench.Core\Viewer\ac-rule-viewer.html`
- `AcRuleWorkbench.Core\Viewer\ac-viewer-template.html`
- `AcRuleWorkbench.Core\Viewer\ac-rule-viewer.js`
- `scripts\repair-p0-misextract.ps1`
- `scripts\validate-p0-layout.ps1`

