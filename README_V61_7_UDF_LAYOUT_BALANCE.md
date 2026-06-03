# AC Rule Workbench v61.7 - UDF / Global Definition Layout Balance

This patch keeps the read-only FW Editor companion model and improves the UDF/global-definition workspace.

## Changes

- Global definition views now use the center workbench as the active inspector.
- The right rule inspector closes automatically while browsing Resources, Tables, UDFs, or Drivers to prevent stale rule details from competing with the selected global definition.
- Selecting a caller rule from a UDF still switches into the correct page/document rule scope and opens the rule inspector.
- UDF detail view was rebuilt into a clearer structure:
  - Interface
  - Parameters
  - Status results when present
  - Caller rules
- UDF caller rows now show rule name, scope, function, parameter preview, and an `Open config` action.
- Definition lists and global detail panels use more balanced proportions when the right inspector is closed.
- Cache key updated to `readonly-editor-v61-7`.

## Apply

```powershell
.\copy-replacement-files.ps1 `
  -RepoRoot C:\dev\AcRuleWorkbench `
  -CleanBuildOutputs
```

Then rebuild/start from repo root:

```powershell
.\scripts\build-and-doctor.ps1 `
  -Configuration Debug `
  -Platform x86 `
  -FwdPath .\fwd.cfd

.\scripts\start-workbench.ps1 `
  -FwdPath .\fwd.cfd `
  -Port 8787 `
  -KillExisting
```
