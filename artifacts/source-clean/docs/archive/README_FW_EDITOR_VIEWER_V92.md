# FW Editor Viewer v92

Stabilization patch for the v91 local test failures.

## Fixes

- Updates the single viewer build marker to `v99-fw-editor-viewer`.
- Updates stale CSS/JS cache-busting query strings to `fw-editor-viewer-v99`.
- Fixes the shipped `ViewerEditorModeContractTests` assertion that incorrectly treated `FW Editor Viewer` as old workbench branding.
- Excludes stale `FWCompanion*.cs` test files from the test project so old files left in a working tree do not keep breaking the current FW Editor Viewer test suite.
- Adds `scripts/remove-stale-fwcompanion-tests.ps1` to move stale local FWCompanion tests into `AcRuleWorkbench.Tests/archive/stale-fwcompanion-tests`.
- Fixes keyed snapshot cache behavior so an older overlapping build cannot replace or cache itself after a newer build has become current.
- Expands static tests to catch stale viewer query-string markers and the stale FWCompanion test-file issue.

## Local cleanup after extracting over an older checkout

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\scripts\remove-stale-fwcompanion-tests.ps1
```

Then run:

```powershell
dotnet build .\AcRuleWorkbench.sln -c Debug -p:Platform=x86 -p:PlatformTarget=x86 -v:minimal
dotnet test .\AcRuleWorkbench.Tests\AcRuleWorkbench.Tests.csproj -c Debug -p:Platform=x86 -p:PlatformTarget=x86
```
