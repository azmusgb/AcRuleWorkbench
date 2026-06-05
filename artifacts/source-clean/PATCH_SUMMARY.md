# Patch Summary

## Current documentation authority

For current FormWorks Editor, AC function, UDF, SelectionList/table, project-code, and Editor-gap interpretation, use `README.md`, `docs/formworks-editor-ac-reference-guide.md`, `docs/project-code-catalog.md`, and `docs/editor-gap-closure-plan.md`. This file is historical patch context.

Updated package: AC Rule Workbench recommendation implementation.

## Primary changed files

- `AcRuleWorkbench.Core/AcDisabledReport.cs`
- `AcRuleWorkbench.Core/AcDiagnosticsReport.cs`
- `AcRuleWorkbench.Core/AcFunctionCatalog.cs` *(new)*
- `AcRuleWorkbench.Core/AcStructuralTreeParser.cs`
- `AcRuleWorkbench.Core/AcTreeReport.cs`
- `AcRuleWorkbench.Core/FormWorksExtractionClient.cs`
- `AcRuleWorkbench/Api/V1/WorkbenchSnapshot.cs`
- `AcRuleWorkbench/Api/V1/WorkbenchSnapshotCache.cs`
- `AcRuleWorkbench.Tests/AcRuleSemanticModelTests.cs` *(new)*
- `AcRuleWorkbench.Tests/WorkbenchSnapshotCacheTests.cs`
- `ac-rule-viewer.js`
- `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js`
- `ac-rule-viewer.css`
- `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.css`
- `RECOMMENDATIONS_APPLIED.md` *(new)*
- `docs/rule-logic-authority-model.md` *(new)*
- `docs/implementation-roadmap.md` *(new)*
- `scripts/package-recommended-full.ps1` *(new)*

## Validation performed in this environment

- Verified shipped viewer JavaScript syntax with `node --check`.
- Verified root viewer JS and template viewer JS are synchronized.
- Verified root viewer HTML and template viewer HTML are synchronized.
- Verified root viewer CSS and template viewer CSS are synchronized.
- Verified final zip integrity with `unzip -t`.

## Validation not performed here

- .NET Framework 4.8 build/test execution. This container does not have `dotnet`, `msbuild`, `xbuild`, or `csc`, and it does not have the local x86 FormWorks native runtime available.

Run on Windows:

```powershell
.\scripts\clean-workspace.ps1
.\scripts\build-and-doctor.ps1
```

Then run tests from Visual Studio Test Explorer or your existing test script.
