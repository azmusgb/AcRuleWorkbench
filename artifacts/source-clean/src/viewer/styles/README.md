# FW Editor Viewer CSS layers

These source layers are concatenated in lexical order by `scripts/build-viewer-css.ps1`.
The generated runtime stylesheet is `src/viewer/ac-rule-viewer.css`, then `scripts/sync-viewer-assets.ps1` copies it to the root preview and Core viewer locations.

The current layer split preserves runtime behavior while allowing future cleanup to delete legacy compatibility selectors in `80-legacy-compat-overrides.css`.
