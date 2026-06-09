# FW Editor Viewer

Read-only FW Editor-style viewer for FormWorks / Document Capture Manager FWD configuration.

See `README_FW_EDITOR_VIEWER_V101.md` for the current release notes and recommended startup commands.

Recommended daily start:

```powershell
.\start-fw-editor-viewer.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting -NoBuild -SkipViewerRefresh
```

Use `-ForceViewerRefresh` only when static export/sidecar generation must be rebuilt.
