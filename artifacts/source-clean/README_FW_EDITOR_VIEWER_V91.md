# FW Editor Viewer v91

v91 is a stabilization/refactor phase focused on C# source decomposition and snapshot-cache robustness. It does not intentionally change the default viewer workflow.

## Changes

- Updated the shared viewer build constant to `v91-fw-editor-viewer`.
- Kept version-neutral static testing through `tests/static/fw-editor-viewer.static.test.js`.
- Split large API service code into partial route/detail files:
  - `WorkbenchApiService.Functions.cs`
  - `WorkbenchApiService.Tables.cs`
  - `WorkbenchApiService.Udfs.cs`
  - `WorkbenchApiService.RuleDetails.cs`
- Split large extraction code into partial responsibility files:
  - `FormWorksExtractionClient.Resources.cs`
  - `FormWorksExtractionClient.Relationships.cs`
  - `FormWorksExtractionClient.DisabledRules.cs`
  - `FormWorksExtractionClient.ViewerExport.cs`
- Added snapshot-cache cancellation handling for cleared/superseded builds.
- Kept keyed LRU snapshot caching from v89/v90.
- Extended static checks to enforce C# partial split boundaries and snapshot-cache guardrails.

## Normal launch

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\start-fw-editor-viewer.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting -ForceViewerRefresh
```

After one clean forced refresh:

```powershell
.\start-fw-editor-viewer.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting -NoBuild
```

## Validation used for package creation

```powershell
node --check ac-rule-viewer.js
node --check AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js
node --check tests/browser/fw-editor-viewer.behavior.spec.js
node --check tests/browser/fw-editor-viewer-resource-workspaces.spec.js
node tests/static/fw-editor-viewer.static.test.js
```

The .NET build should still be run locally on Windows because this sandbox does not include the .NET SDK.
