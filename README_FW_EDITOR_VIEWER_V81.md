# FW Editor Viewer v81

This pass fixes the local-generated viewer path so the C# exporter accepts the current FW Editor Viewer template instead of falling back to the obsolete embedded dark shell.

## Main fixes

- Static/live generated HTML now uses the current FW Editor Viewer shell.
- Server and launcher banners use FW Editor Viewer naming.
- Normal viewer export output no longer prints evidence/profile warnings.
- Stale-viewer detection no longer treats the valid FWD Tree label as stale.
- Build marker: `v81-fw-editor-viewer`.

## Preferred launch

```powershell
.\start-fw-editor-viewer.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

Use `-Advanced` only for developer load-status/object-graph/runtime-impact surfaces.
