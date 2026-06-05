# Phase 1 Refactor Summary

This phase addresses the first safety/maintainability pass after the code-set critique.

## Included changes

- Clean package boundaries
  - Added stricter package-boundary validation script.
  - Tightened source package exclusions for build outputs, generated sidecars, local FWD fixtures, native DLLs, prompt/import scratch assets, and confidential extracted reference files.
  - Split package script now emits `source-clean`, `runtime-local`, `evidence-sample`, and `diagnostics-bundle` deliverables.

- CSS/theme architecture
  - Added a final authoritative theme layer to shipped and template viewer CSS.
  - Light mode is the default when no persisted `data-theme` value exists.
  - Reduced-motion handling is centralized at the final layer.

- Backend responsibility split
  - Converted `WorkbenchApiService` to a partial class and moved API metadata construction into typed metadata DTO/builder classes.

- API DTO conversion
  - Added typed DTOs for help, route catalog, capabilities, liveness, and evidence export metadata.
  - Capabilities/status/snapshot responses now surface the active evidence export profile.

- Private/full evidence gating
  - Added explicit profiles: `viewer-safe`, `diagnostic`, and `full-evidence`.
  - Default is `viewer-safe`.
  - Private FWD resource tree traversal now requires `--profile full-evidence`.

- Parser/confidence-model tests
  - Added explicit confidence model helpers for UDF caller binding and static schema inference.
  - Added tests for profile gating and confidence semantics.

## New commands

```powershell
AcRuleWorkbench.exe ac-viewer --path .\fwd.cfd --out .\ac-rule-viewer-live.html
AcRuleWorkbench.exe ac-viewer --path .\fwd.cfd --out .\ac-rule-viewer-live.html --profile diagnostic
AcRuleWorkbench.exe ac-viewer --path .\fwd.cfd --out .\ac-rule-viewer-live.html --profile full-evidence

AcRuleWorkbench.exe api --path .\fwd.cfd --profile viewer-safe
AcRuleWorkbench.exe api --path .\fwd.cfd --profile diagnostic
AcRuleWorkbench.exe api --path .\fwd.cfd --profile full-evidence
```

## Validation

Run on the Windows/.NET/FormWorks machine:

```powershell
dotnet restore .\AcRuleWorkbench.sln -r win-x86
dotnet build .\AcRuleWorkbench.sln -c Debug -p:Platform=x86
dotnet test .\AcRuleWorkbench.Tests\AcRuleWorkbench.Tests.csproj -c Debug -p:Platform=x86
.\scripts\validate-package-boundaries.ps1 -Root .
```

This environment did not have `dotnet`, so full .NET compilation was not executed here. JavaScript viewer syntax checks passed with `node --check`.
