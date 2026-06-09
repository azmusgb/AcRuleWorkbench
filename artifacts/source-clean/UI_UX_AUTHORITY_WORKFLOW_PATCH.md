# FW Editor Viewer UI/UX Authority Workflow Patch

## Current documentation authority

For current FormWorks Editor, AC function, UDF, SelectionList/table, project-code, and Editor-gap interpretation, use `README.md`, `docs/formworks-editor-ac-reference-guide.md`, `docs/project-code-catalog.md`, and `docs/editor-gap-closure-plan.md`. This file is historical UI/UX patch context.

This patch converts the viewer from a broad analytics-style dashboard into a structure-first review workbench.

## Primary changes

- Main navigation is reduced to **Structure**, **Dependencies**, and **Audit**.
- Review modes were added: **Understand**, **Audit**, **Impact**, **Cleanup**, and **Explain**.
- Scope rows now show explicit structural health: Healthy, Warning, or Coverage failure.
- A hard structural coverage diagnostic is generated when flat inventory materially exceeds structural rules.
- Flow is renamed and treated as **Flow Projection** only. It is audit-only and never presented as runtime proof.
- The rule inspector now includes a **Path narrative** with copyable plain-language explanation.
- The Dependencies workspace groups fields, references, tables, resources, drivers, and UDF lenses.
- The Audit workspace now includes review queues so users can start from risk rather than inventing searches.
- Tree disclosure levels were added: names only, function, state, and full evidence.
- Tree clipping was removed; users should narrow with filters/disclosure rather than silently losing rows.
- Search result announcements were fixed for screen-reader users.
- Packaging scripts now exclude source-package noise such as vendor runtime folders, generated evidence, logs, package outputs, and local artifacts.

## Evidence authority rules preserved

- Structural tree is authority for hierarchy, branch order, and disabled inheritance.
- Flat inventory is search/completeness evidence only.
- Relationship data is static dependency evidence.
- Flow projection is triage-only and not runtime execution proof.
- Sequence-only disabled hints are audit-only and do not override structural disabled state.

## Replacement files

- `ac-rule-viewer.html`
- `ac-rule-viewer.css`
- `ac-rule-viewer.js`
- `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.html`
- `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.css`
- `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js`
- `scripts/package-source-clean.ps1`
- `scripts/package-split-deliverables.ps1`
- `UI_UX_AUTHORITY_WORKFLOW_PATCH.md`

## Validation

- `node --check ac-rule-viewer.js`
- `node --check AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js`
- root/Core viewer asset sync check

A full .NET compile still needs to be run on a Windows machine with .NET Framework/MSBuild and the x86 FormWorks runtime available.

