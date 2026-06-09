# FW Editor Viewer v99

v99 changes live startup semantics. The API now defaults to **live-lazy** mode:

- startup opens a lightweight read-only FWD session and reads cheap catalog metadata only;
- full normalized snapshots are not prebuilt at startup;
- deep rule/resource endpoints still build/cache the full snapshot on demand when required;
- `-SnapshotWarmup` opts back into the old full startup snapshot warm-up behavior.

## Recommended daily start

```powershell
.\start-fw-editor-viewer.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting -NoBuild -SkipViewerRefresh
```

## Full static export / forced refresh

Use only after changing export/static sidecar generation:

```powershell
.\start-fw-editor-viewer.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting -ForceViewerRefresh
```

## Opt into startup full snapshot warm-up

```powershell
.\start-fw-editor-viewer.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting -SnapshotWarmup
```

## Validate

```powershell
node --check ac-rule-viewer.js
node --check AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js
node --check tests/browser/fw-editor-viewer.behavior.spec.js
node --check tests/browser/fw-editor-viewer-resource-workspaces.spec.js
node tests/static/fw-editor-viewer.static.test.js
node tests/static/fw-editor-viewer-scripts.static.test.js

dotnet build .\AcRuleWorkbench.sln -c Debug -p:Platform=x86 -p:PlatformTarget=x86 -v:minimal
dotnet test .\AcRuleWorkbench.Tests\AcRuleWorkbench.Tests.csproj -c Debug -p:Platform=x86 -p:PlatformTarget=x86
```
