# Workbench startup scripts

The repository-root `scripts/` folder is authoritative. The nested `AcRuleWorkbench/scripts/` files are compatibility wrappers only.

## Normal local startup

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-workbench.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

Default behavior:

- builds with `build-and-doctor.ps1`
- validates local runtime folders
- uses export profile `viewer-safe`
- reuses current viewer artifacts when they are complete and newer than `fwd.cfd`
- regenerates `ac-rule-viewer-live.html` only when artifacts are missing/stale or `-ForceViewerRefresh` is used
- starts the API in the foreground
- starts a hidden helper that opens `/viewer?...nocache=...` as soon as `/api/v1/health/live` responds
- lets `/api/v1/health/ready` and snapshot warm-up continue in the background

## Faster startup after a successful build

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-workbench.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting -NoBuild
```

## Reuse an existing viewer export

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-workbench.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting -NoBuild -SkipViewerRefresh
```

`-SkipViewerRefresh` now fails early if `ac-rule-viewer-live.html` does not exist.

## Detached startup with health polling

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-workbench.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting -NoBuild -Detached
```

Detached mode starts `AcRuleWorkbench.exe`, waits for `/api/v1/health/live`, and then opens the viewer URL. Add `-WaitForReadyBeforeOpen` if you want detached mode to also wait for `/api/v1/health/ready`.

## Verify the running app

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-workbench-live.ps1 -BaseUrl http://127.0.0.1:8787
```

This checks:

- `/api/v1/health/live`
- `/api/v1/health/ready`
- `/api/v1/status`
- `/viewer`
- `/ac-rule-viewer.css`
- `/ac-rule-viewer.js`
- `/api/v1/fwd/udfs`
- `/api/v1/fwd/tables`
- `/api/v1/fwd/resources?includeDetails=true`

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

## Split deliverables

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-split-deliverables.ps1 -Root . -OutDir .\packages
```

The split-deliverables script is Windows PowerShell 5.1-compatible and avoids `[System.IO.Path]::GetRelativePath`.
