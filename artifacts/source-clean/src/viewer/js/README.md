# FW Editor Viewer JavaScript modules

These source modules are concatenated in lexical order by `scripts/build-viewer-js.ps1`.
The generated browser bundle is `src/viewer/ac-rule-viewer.js`, then `scripts/sync-viewer-assets.ps1` copies it to the root preview and Core viewer locations.

This split is source-level and dependency-free: no npm bundler is required for normal Windows/local development.
