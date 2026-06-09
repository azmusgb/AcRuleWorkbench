# FW Editor Viewer canonical viewer source

`src/viewer` is the canonical source location for the browser viewer assets.

The root `ac-rule-viewer.*` files and `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.*` files are generated/shipped copies kept for the current static exporter and local HTTP server compatibility. Use `scripts/sync-viewer-assets.ps1` after editing canonical assets.

Current build marker is stored in `viewer-build.txt`.

Planned split structure:

- `modules/state.js`
- `modules/model-indexes.js`
- `modules/rule-list.js`
- `modules/rule-properties.js`
- `modules/resources.js`
- `modules/udfs.js`
- `modules/search.js`
- `modules/actions.js`
- `styles/00-tokens.css`
- `styles/10-base.css`
- `styles/20-shell.css`
- `styles/30-rule-list.css`
- `styles/40-resources.css`
- `styles/90-advanced.css`

v89 introduces this canonical source boundary and static guardrails. The runtime bundle remains `ac-rule-viewer.js` / `ac-rule-viewer.css` for compatibility with the existing exporter.
