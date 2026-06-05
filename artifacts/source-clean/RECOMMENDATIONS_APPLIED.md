# AC Rule Workbench — Recommendations Applied

## Current documentation authority

For current FormWorks Editor, AC function, UDF, SelectionList/table, project-code, and Editor-gap interpretation, use `README.md`, `docs/formworks-editor-ac-reference-guide.md`, `docs/project-code-catalog.md`, and `docs/editor-gap-closure-plan.md`. This file records prior recommendations and remains useful historical context.

This package applies the highest-priority review recommendations across rule logic, rule-tree authority, UDF handling, API cache correctness, viewer UX, and packaging hygiene.

## Applied source changes

### Rule-tree / rule-logic authority

- Added explicit structural route metadata to `AcTreeNode`:
  - `StructuralPath`
  - `DisplayPath`
  - `Route`
- Replaced weak `Parent:{id}/Action:{index}` path-only representation with a durable route segment model.
- Preserved structural rule tree as the authoritative hierarchy source when a structural node exists.
- Added `RuleModel.Authority` and `RuleModel.DisabledAuthority` in API snapshot indexing.
- When a flat rule row correlates to a structural node, the structural disabled state is promoted into that rule model for API detail usage.

### Disabled-state semantics

- Added `AcDisabledStates.PossibleDisabledSequenceOnly`.
- Changed flat same-scope sequence fallback from pseudo-inheritance into audit-only sequence evidence.
- Updated diagnostics and relationship kinds so sequence-only evidence is not mixed with proven structural inherited disabled state.
- Disabled count summaries now count sequence-only evidence as possible, but it remains distinguishable by state name and relationship kind.

### Function / parameter semantics

- Added `AcFunctionCatalog` as an explicit catalog for high-value AC functions and parameter roles.
- `ClassifyParameter` now checks the catalog before generic field/attribute/option heuristics.
- Added catalog coverage for common functions such as:
  - `_IRejectFields`
  - `Copy`
  - `Formatf`
  - `FormatDate`
  - `DeleteLines`
  - `IsEmpty`
  - `HasRegExpr`
  - `_ISetDocAttrConst`
  - `_IGetDocAttr`
  - table/selection-list functions

### Safer structural payload parsing

- Replaced generic comma/semicolon/pipe splitting for all parameter values with list-aware parsing.
- Only list-like parameters are split.
- Scalar parameters such as regexes, reject strings, attribute values, and formatting expressions are preserved as scalar values.
- The list parser respects braces, quotes, and escapes to reduce corruption of FormWorks/Tcl-style values.

### API snapshot cache correctness

- Added `RequireNativeOk` to `WorkbenchSnapshot`.
- Updated `WorkbenchSnapshotCache` matching so strict/native-required snapshots are not reused from non-strict snapshots.
- Added a regression test for strict versus non-strict cache reuse.

### UDF viewer logic

- Fixed UDF filter mismatch:
  - `with-callers` now uses `callerRules` instead of nonexistent `structuralCallers`.
  - `unparsed` now checks `definitionParsed === false` instead of treating undefined as unparsed for every row.
- Added normalized `definitionParsed` and `diagnostics` fields for UDF rows.

### Inspector UX correctness

- Removed the unreachable selected-rule inspector sections caused by an early `return`.
- The selected-rule inspector now renders:
  - Summary
  - Route
  - Branches
  - Parameters
  - Field Resolution
  - References
  - Diagnostics
  - Evidence
  - Raw JSON
- Added display of the structural/display route path in the inspector.

### Tests

Added `AcRuleSemanticModelTests.cs` covering:

- Sequence-only disabled fallback as possible/audit-only state.
- Function-catalog classification for high-value function parameters.

Updated `WorkbenchSnapshotCacheTests.cs` with:

- strict/non-strict `RequireNativeOk` cache key regression coverage.

## Known remaining work

These are intentionally not fully completed in this patch because they require a larger model refactor or live FormWorks runtime validation:

1. Full one-pass native extraction pipeline to avoid repeated FWD open/parse calls.
2. Complete AC function catalog from the full AC Functions guide.
3. Full canonical UDF body parsing and caller/callee graph extraction.
4. Table schema parsing beyond canonical names and usage-derived field evidence.
5. Virtualized tree rendering for very large rule scopes.
6. Route-aware generated sidecar refresh from a live FWD runtime.

## Regenerate generated artifacts

The included generated `ac-rule-viewer.*.json` sidecars are retained from the uploaded package. After building on a Windows/.NET Framework 4.8 machine with the FormWorks runtime available, regenerate them with your normal workbench export/start script so the new structural route and disabled-state semantics are reflected in the sidecar evidence files.

Suggested flow:

```powershell
.\scripts\clean-workspace.ps1
.\scripts\build-and-doctor.ps1
.\scripts\start-workbench.ps1 -FwdPath C:\path\to\fwd.cfd -Port 8787 -KillExisting
```
