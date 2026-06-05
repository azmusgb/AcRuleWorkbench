# Troubleshooting

For current FormWorks Editor, AC function, UDF, SelectionList/table, project-code, and Editor-gap interpretation, use [FormWorks Editor And AC Function Reference](formworks-editor-ac-reference-guide.md), [Project Code Catalog](project-code-catalog.md), and [Editor Gap Closure Plan](editor-gap-closure-plan.md). Troubleshooting should preserve the product boundary: the workbench reads FWD configuration and does not execute AC runtime logic.

## Port already in use

```powershell
.\scripts\start-workbench.ps1 -Port 8788
```

or:

```powershell
.\scripts\start-workbench.ps1 -KillExisting
```

## Debug route returns disabled

This is expected in production mode. Restart with `-EnableDebugApi` only for diagnostic work.

## Path override rejected

The server was started with `--path` and without `--allow-path-query`. This protects production sessions from accidental source changes.

## Viewer is blank

Regenerate the viewer:

```powershell
AcRuleWorkbench.exe ac-viewer --path C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd --out ac-rule-viewer.html
```

## Native runtime failure

Run:

```powershell
.\scripts\build-and-doctor.ps1
AcRuleWorkbench.exe doctor
```

Verify x86 process bitness, wrapper DLLs, native DLL search path, licensing state, and read access to the FWD path.
