# v61.6 Industrial Read-Only Editor Layout

## Current documentation authority

For current FormWorks Editor, AC function, UDF, SelectionList/table, project-code, and Editor-gap interpretation, use `README.md`, `docs/formworks-editor-ac-reference-guide.md`, `docs/project-code-catalog.md`, and `docs/editor-gap-closure-plan.md`. This file is a historical layout note.

This package applies the supplied compact dark workbench prototype direction without changing the viewer's data contract or interaction wiring.

## Intent

FW Editor Viewer remains a read-only FW Editor companion for AC-related FWD configuration.

## Visual/layout changes

- Slimmer 50px topbar with amber editor-style accent strip.
- Dark industrial palette inspired by the supplied prototype.
- IBM Plex Sans / JetBrains Mono font stack with safe local fallbacks.
- Stronger pane separation between navigator, workspace, and inspector.
- More compact global definition rows, scope rows, tree rows, branch rows, and inspector sections.
- Less card-on-card weight; flatter surfaces and fewer heavy shadows.
- More readable inspector proportions and denser configuration display.
- Reduced exposed health/diagnostic styling in navigation rows.
- Default theme reset to dark for the new v61.6 state key.

## Functional scope

No backend routes, JSON payload names, selection behavior, rule/UDF navigation, copy actions, search, or inspector wiring were intentionally changed.

