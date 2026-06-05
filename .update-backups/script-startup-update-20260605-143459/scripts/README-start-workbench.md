# Workbench startup scripts

## Normal local startup

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-workbench.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

Default behavior:

- builds with `build-and-doctor.ps1`
- validates local runtime folders
- uses export profile `viewer-safe`
- refreshes `ac-rule-viewer-live.html`
- starts the API in the foreground
- opens the viewer from the app process

## Faster startup after a successful build

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-workbench.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting -NoBuild
```

## Detached startup with health polling

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-workbench.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting -NoBuild -Detached
```

Detached mode starts `AcRuleWorkbench.exe`, waits for `/api/v1/health/live`, attempts `/api/v1/health/ready`, and then opens the viewer URL.

## Diagnostic profile

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-workbench.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting -Profile diagnostic
```

## Full evidence profile

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-workbench.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting -Profile full-evidence
```

Use `full-evidence` only for local diagnostics. It enables private/full FWD resource traversal and may generate sensitive evidence output.

## Optional working-tree inventory

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-workbench.ps1 -FwdPath .\fwd.cfd -CheckWorkingTree
```

This calls `validate-package-boundaries.ps1 -Mode WorkingTree`. It is informational and does not replace strict source package validation.

## Strict source package validation stays separate

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-source-clean.ps1 -Root . -OutDir .\artifacts
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-package-boundaries.ps1 -Root .\artifacts\source-clean -Mode SourcePackage
```
