# AC Rule Workbench v61.5 - Layout Balance Hotfix

## Current documentation authority

For current FormWorks Editor, AC function, UDF, SelectionList/table, project-code, and Editor-gap interpretation, use `README.md`, `docs/formworks-editor-ac-reference-guide.md`, `docs/project-code-catalog.md`, and `docs/editor-gap-closure-plan.md`. This file is a historical layout note.

This package keeps the product aligned as a read-only FW Editor companion while fixing the ultra-wide/zoomed-out layout imbalance.

## Fixes

- Scales the left navigator and right inspector instead of leaving them as tiny fixed-width rails on very wide viewports.
- Constrains the main reading surface so rule rows do not stretch across the entire browser width.
- Prevents stale persisted state from reopening the inspector after refresh with only a generic scope summary.
- Makes the inspector calmer by opening Summary/Parameters first and leaving Route, Branches, Field Resolution, References, and Raw collapsed unless selected.
- Updates cache key to `readonly-editor-v61-5`.

## Apply

```powershell
.\copy-replacement-files.ps1 `
  -RepoRoot C:\dev\AcRuleWorkbench `
  -CleanBuildOutputs
```

Then rebuild and start normally.
