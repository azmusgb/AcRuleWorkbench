# FW Editor Viewer v86

v85 changes live mode behavior and also keeps the v84 UDF responsiveness fixes. v84 addressed a UI responsiveness issue seen when opening large resource views such as User Defined Functions.

## Fixes

- Caches UDF definition rows after the first build.
- Caches global function definition rows after the first build.
- Resets those caches only when the underlying FWD/API payload is rebuilt or rehydrated.
- Keeps the default viewer on snapshot-backed API calls for stable interaction.

## Live mode guidance

The viewer supports `?snapshotMode=live`, but it is not the recommended normal mode for this application.
Live mode tells each API request to rebuild from the FWD instead of using the warmed snapshot cache. For large FWDs this can be much slower and can make navigation feel frozen, especially on UDFs, tables, functions, and editor-model routes.

Use the default snapshot-backed mode for daily browsing:

```powershell
.\start-fw-editor-viewer.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

Use live mode only for targeted developer verification of extraction changes.
