# FW Companion Troubleshooting

This guide covers common local startup, viewer, and API issues. It preserves the product boundary: FW Companion reads FWD configuration and does not execute AC runtime logic.

## Port already in use

Try another port:

```powershell
.\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -Port 8788
```

or stop a normal existing listener:

```powershell
.\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

If System PID 4 owns the port, use auto-port selection or specify another port. Do not try to kill System.

## PowerShell script blocked

Use the command wrapper from repository root:

```cmd
.\start-fw-editor-viewer.cmd
```

The wrapper calls PowerShell with `-ExecutionPolicy Bypass`. For direct script execution, unblock files extracted from downloaded ZIPs:

```powershell
Get-ChildItem -Recurse | Unblock-File
```

## Native runtime failure

Run:

```powershell
.\scripts\build-and-doctor.ps1 -FwdPath .\fwd.cfd -Configuration Debug -Platform x86
```

Verify:

- process/build is x86
- `lib` contains managed wrapper DLLs
- `rri_bin` contains native x86 DLLs
- `scripts/runtime-path.generated.ps1` exists
- FWD path is readable
- licensing/runtime prerequisites are present on the machine

## Viewer is blank

1. Check API health:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/v1/health/live
Invoke-RestMethod http://127.0.0.1:8787/api/v1/health/ready
```

2. Force a viewer refresh:

```powershell
.\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting -ForceViewerRefresh
```

3. Open with cache busting:

```text
http://127.0.0.1:8787/viewer?nocache=v71-product-reset
```

## Debug route returns disabled

Expected. Debug routes are disabled by default. Enable only for engineering diagnostics:

```powershell
.\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -EnableDebugApi -AllowPathQuery -OpenHarness
```

Use `/api/v1` routes for normal validation.

## Path override rejected

Expected when the server was started with a fixed FWD path and without path-query override. This protects sessions from accidental source changes.

## Reader Status says Partial

Partial does not mean the whole viewer failed. It means the companion loaded useful configuration but could not fully confirm some placement or detail.

Use:

- normal Rule List nodes for confirmed hierarchy/order
- Additional Rules for searchable/readable rules whose exact placement is not confirmed
- Raw only when formatted views need confirmation

## API validation fails

Run:

```powershell
.\scripts\verify-fw-editor-viewer-live.ps1 -BaseUrl http://127.0.0.1:8787
.\scripts\validate-api-live.ps1 -BaseUrl http://127.0.0.1:8787
```

Check the server console for the first failing endpoint rather than relying only on the browser.

## Static viewer asset mismatch

Validate JavaScript syntax:

```powershell
node --check .\ac-rule-viewer.js
node --check .\AcRuleWorkbench.Core\Viewer\ac-rule-viewer.js
```

If root viewer files and template viewer files drift, run the viewer asset sync tests locally under the Windows/.NET test environment.

## Additional Rules did not decrease after a parser change

Run the measurement script before and after a native Windows rebuild:

```powershell
.\scripts\measure-additional-rules.ps1 -TreeJson .\ac-rule-viewer.tree.json
```

If `AC/Pages/General` still has most rules under Additional Rules, that scope likely uses a packing/framing variant not handled by the structural reader yet. Keep those rules visible under Additional Rules and do not treat their parent/action placement as confirmed.

## Advanced content appears in normal mode

Normal mode should not render Object Graph, Runtime Impact, or Rule Impact Summary. Check both payload and browser behavior:

```powershell
Select-String -Path .\ac-rule-viewer.fwd.json -Pattern 'objectGraph','runtimeImpact','runtimeImpacts'
npm run test:viewer
```

Use `?advanced=1` only for engineering diagnostics.

