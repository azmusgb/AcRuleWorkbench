# AC Rule Workbench correctness patch

This zip contains the full updated files that need to replace the matching files in the project.

## Updated files

- `AcRuleWorkbench/Api/V1/RuleCorrelation.cs`
- `AcRuleWorkbench/Api/V1/WorkbenchSnapshot.cs`
- `AcRuleWorkbench/Api/V1/WorkbenchApiService.cs`
- `AcRuleWorkbench/Api/V1/OpenApiDocument.cs`
- `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js`
- `ac-rule-viewer.js`

## Main corrections

1. Structural AC tree remains the primary authority for hierarchy, branch routing, and disabled state.
2. Flat inventory correlation no longer silently selects the first duplicate GUID match.
3. Correlation now exposes accepted vs. unaccepted states:
   - `Exact`
   - `UniqueGuid`
   - `AmbiguousExact`
   - `AmbiguousGuid`
   - `UniqueNameFunction`
   - `AmbiguousNameFunction`
   - `None`
4. Name/function fallback is treated as weak audit evidence, not an accepted structural link.
5. Flat `PossiblyDisabledInherited` / sequence-only disabled states are audit-only and no longer override structural disabled state.
6. Relationship matching no longer uses GUID-only matching because duplicate GUIDs exist in real exports.
7. Field-reference resolution is narrowed to field/column parameters instead of treating attributes, sources, and destination parameters as fields.
8. The tree renderer no longer silently clips the structural tree at 1,400 rows.
9. Inventory UI now shows unaccepted correlation explicitly instead of pretending it is either flat-only or structurally matched.
10. OpenAPI examples now document the stricter correlation and disabled-authority model.

## How to apply

Copy these files over the matching paths in your existing project.

After replacement, from the project root run your normal build/test command, for example:

```powershell
msbuild AcRuleWorkbench.sln /p:Configuration=Debug /p:Platform=x86
```

Then regenerate or refresh the viewer output as you normally do.

## Validation performed here

- JavaScript syntax checked with `node --check`.
- Root viewer script and template viewer script were kept byte-for-byte synchronized.
- C# brace/parenthesis balance checked. Full .NET build was not available in this sandbox.
