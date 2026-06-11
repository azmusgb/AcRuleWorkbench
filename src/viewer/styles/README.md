# FW Editor Viewer CSS layers

The stylesheet is now source-first. `scripts/build-viewer-css.ps1` concatenates these valid standalone layers into `src/viewer/ac-rule-viewer.css`, and `scripts/sync-viewer-assets.ps1` copies the result into `AcRuleWorkbench.Core/Viewer`.

Layer contract:

1. `00-reset-tokens.css` — normalization, focus, reduced-motion defaults.
2. `10-app-shell.css` — high-level shell and blank-content guard.
3. `20-left-nav.css` — left navigation state and focus rules.
4. `30-rule-list.css` — Rule List / Action List structural rules.
5. `40-inspector.css` — right-side property inspector rules.
6. `90-legacy-runtime-bundle.css` — quarantined legacy bundle retained for behavioral stability while selectors are migrated upward.

New CSS should go into the numbered semantic layers, not the legacy runtime bundle.
