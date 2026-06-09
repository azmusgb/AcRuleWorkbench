# FW Editor Viewer v94

Stabilization hotfix for the v93 C# partial split.

- Adds the missing Newtonsoft.Json namespace import to `FormWorksExtractionClient.ViewerPrivateTree.cs`.
- Updates viewer build marker/cache key to v94.
- Keeps v93 hardening changes for stale FWCompanion tests, script dry-run support, fixture-backed Playwright tests, command registry foundation, and C# partial decomposition.

# FW Editor Viewer v94

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
