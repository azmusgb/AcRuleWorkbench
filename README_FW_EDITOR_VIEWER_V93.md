# FW Editor Viewer v93

Stabilization release focused on install cleanliness, browser test fixtures, script contracts, CSS guardrails, and source/package boundary cleanup.

## Launch

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\start-fw-editor-viewer.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting -ForceViewerRefresh
```

After one clean refresh:

```powershell
.\start-fw-editor-viewer.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting -NoBuild
```

## Test

```powershell
dotnet build .\AcRuleWorkbench.sln -c Debug -p:Platform=x86 -p:PlatformTarget=x86 -v:minimal
dotnet test .\AcRuleWorkbench.Tests\AcRuleWorkbench.Tests.csproj -c Debug -p:Platform=x86 -p:PlatformTarget=x86
npm run test:viewer
```

## Notes

- Playwright browser tests use checked-in fixture sidecars and no longer skip in source-clean packages.
- Stale FWCompanion tests are moved outside the compiled test project.
- Legacy workbench launchers are compatibility wrappers only.
