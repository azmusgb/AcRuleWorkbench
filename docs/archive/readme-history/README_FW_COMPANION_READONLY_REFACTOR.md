# FW Companion Read-only Refactor

This package reframes the viewer as a full read-only FW Companion rather than a parser/debug-centered tool.

## Product direction

The default experience is now intended to feel like a modern, searchable, read-only companion to FW Editor:

- FW/FWD vocabulary first: Rule List, Action List, Status Results, Fields/Parameters, Attributes, UDFs, Tables, SelectionLists, Resources.
- Parser/extraction mechanics are treated as reader implementation details.
- Reader status is compact and secondary.
- Raw/internal data remains available only as the final confirmation layer.
- No edit/save/add/delete/move behavior is introduced.

## Key implementation changes

### Additional Rules instead of parser fallback language

`AcTreeFlatInventoryReconciler` now places flat-inventory rules that cannot be matched to confirmed structural placement under a read-only `Additional Rules` branch.

User-facing effect:

- The rule is still searchable and inspectable.
- The tree remains honest about placement.
- The UI does not expose parser-fallback implementation names or parser mechanics as the product model.

### Viewer product vocabulary

The viewer JavaScript/HTML now uses FW Companion language:

- `FW Companion`
- `Reader Status`
- `Read-only FWD configuration`
- `Rule List`
- `Fields`
- `Additional Rule`

Object graph/runtime-impact views are no longer exposed through the default navigation/search mode. The existing internals remain in source for compatibility, but the default product surface is configuration-first.

### Styling and local-first behavior

- Removed Google Font dependencies.
- Default font stack is system/local-first: Segoe UI/system UI for text and Cascadia Mono/SFMono for code-like content.
- Existing light-mode/default shell styling is retained and reworded rather than replaced wholesale.

## Validation performed in this sandbox

The sandbox does not include the .NET Framework/MSBuild toolchain, so the C# test suite was not executed here.

Completed validations:

```powershell
node --check AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js
node --check ac-rule-viewer.js
```

Both viewer JavaScript files passed syntax validation.

Also checked the refactored viewer/source to confirm old debug-centered product terms are not present in the updated viewer/reconciler/test files.

## Recommended Windows validation

From the repo root:

```powershell
.\scripts\build-and-doctor.ps1 -FwdPath .\fwd.cfd
.\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

Then verify:

1. The browser title and header show FW Companion/read-only language.
2. Main navigation is configuration-first.
3. AC/DV trees show Additional Rules instead of fallback/parser terminology.
4. Selected rule inspector starts with configuration: function, fields/parameters, attributes, status results/actions.
5. Reader Status is secondary/collapsed compared with the rule tree and selected-rule inspector.
