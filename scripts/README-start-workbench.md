# FW Editor Viewer startup scripts

Use the hosted API viewer for normal work. This is the source-clean workflow and does **not** require generated `ac-rule-viewer.*.json` sidecars.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\start-fw-editor-viewer.ps1 `
  -FwdPath "C:\path\to\fwd.cfd" `
  -Port 8787 `
  -KillExisting
```

Then open:

```text
http://127.0.0.1:8787/viewer
```

Default behavior:

- builds the `x86` .NET Framework output when needed
- validates `lib\` and `rri_bin\`
- copies native DLLs into the built output by default when `rri_bin\` exists
- prepends `rri_bin\` and `lib\` to the process `PATH`
- starts `AcRuleWorkbench.exe api ...` with a fixed `--path`
- opens the hosted `/viewer` route after health checks
- skips static sidecar generation in live-lazy mode

Useful local options:

```powershell
# Start but do not open a browser.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-fw-editor-viewer.ps1 -FwdPath "C:\path\to\fwd.cfd" -NoBrowser

# Use the next free port if 8787 is busy; this is the default unless -NoAutoPort is supplied.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-fw-editor-viewer.ps1 -FwdPath "C:\path\to\fwd.cfd" -Port 8787

# Generate standalone HTML and sidecar JSON for offline/static viewing.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-fw-editor-viewer.ps1 -FwdPath "C:\path\to\fwd.cfd" -ForceViewerRefresh

# Validate the hosted API/viewer after startup.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-fw-editor-viewer-live.ps1 -BaseUrl http://127.0.0.1:8787
```

Avoid opening `http://127.0.0.1:5000/ac-rule-viewer.html` for live FWD work. The Node `server.js` file is only a hardened static-file server; it does not start the FWD API. Use `server.js --allow-generated-sidecars` only for local standalone exports that already generated `ac-rule-viewer.*.json`.

Compatibility launchers still delegate to the canonical script:

```powershell
.\start-fw-editor-viewer.cmd -FwdPath "C:\path\to\fwd.cfd"
.\start-workbench.cmd -FwdPath "C:\path\to\fwd.cfd"
```
