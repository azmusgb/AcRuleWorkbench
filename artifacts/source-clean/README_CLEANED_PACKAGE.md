# AC Rule Workbench Clean Complete v61

## Current documentation authority

For current FormWorks Editor, AC function, UDF, SelectionList/table, project-code, and Editor-gap interpretation, use `README.md`, `docs/formworks-editor-ac-reference-guide.md`, `docs/project-code-catalog.md`, and `docs/editor-gap-closure-plan.md`. This file is a historical package note.

This package starts from the v60.7 cleaned build and applies the v61 calm layout refactor.

## UI changes

- One fixed topbar.
- One left navigation pane.
- One main workspace pane.
- No global hero/stat-card stack.
- Context-specific tab sets.
- One scroll region per major pane.
- Compact global definitions list/detail workflow.
- Source summary synchronizes with loaded counts.

## Run

```powershell
cd C:\dev\AcRuleWorkbench
.\scripts\setup-dcm-deps.ps1
.\scripts\build-and-doctor.ps1 -Configuration Debug -Platform x86 -FwdPath .\fwd.cfd
.\scripts\start-workbench.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

Open:

```powershell
Start-Process msedge "http://127.0.0.1:8787/viewer?ui=calm-layout-v61&nocache=$([guid]::NewGuid())"
```
