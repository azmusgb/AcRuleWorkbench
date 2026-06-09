<!--  -->
# CSS Accounting Audit

For current FormWorks Editor, AC function, UDF, SelectionList/table, project-code, and Editor-gap interpretation, use [FormWorks Editor And AC Function Reference](../formworks-editor-ac-reference-guide.md), [Project Code Catalog](project-code-catalog.md), and [Editor Gap Closure Plan](editor-gap-closure-plan.md). This file only accounts for CSS/viewer asset coverage.

## Scope
- ac-rule-viewer.html -> ac-rule-viewer.css
- AcRuleWorkbench.Core/Viewer/ac-viewer-template.html -> AcRuleWorkbench.Core/Viewer/ac-viewer-template.css
- ac-rule-viewer-live.html -> ac-rule-viewer-live.css
- AcRuleWorkbench/ApiHarness/api-harness.html -> AcRuleWorkbench/ApiHarness/api-harness.css

## Inline Style Inventory
- ac-rule-viewer.html: 3 inline style attributes
- AcRuleWorkbench.Core/Viewer/ac-viewer-template.html: 3 inline style attributes
- ac-rule-viewer-live.html: 0 inline style attributes
- AcRuleWorkbench/ApiHarness/api-harness.html: 0 inline style attributes

## Remaining Inline Styles (Justified Dynamic Values)
- Dynamic bar width via CSS custom property:
  - `<i style="--bar-w:${Math.max(3,r.count/max*100)}%"></i>`
- Dynamic tree indentation depth via CSS custom property:
  - `style="--depth:${level}"`
  - `style="--depth:${r.level}"`

## Utility Classes Added For Inline-Style Removal
- Shared viewer/template utilities:
  - `.caption-shell-muted`, `.caption-block`
  - `.bar-span-all`, `.bar-span-all > i` (uses `width: var(--bar-w, 0)`)
  - `.inline-actions`, `.full-width`
  - `.mt-8`, `.mt-10`, `.mt-12`, `.mb-10`, `.mb-0`, `.my-7`, `.my-8`, `.p-10`
- Template-specific tree structure alignment utilities:
  - `.tree-left`, `.tree-main`, `.tree-name`
- API harness utilities:
  - `.is-hidden`, `.actions-row`, `.history-item`

## Class Accounting Caveat
- Static class check reports two unresolved tokens in template-string contexts: `k`, `v`.
- These are not CSS classes; they are false positives from dynamic template/string parsing.

## Notes
- This audit focuses on source HTML pages and their linked source CSS files.
- Dynamic runtime classes generated in JavaScript logic may not be visible to static class usage scans.
