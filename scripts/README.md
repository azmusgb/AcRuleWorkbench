# FW Editor Viewer scripts

Use the repository-root wrapper for normal local testing:

```cmd
.\start-fw-editor-viewer.cmd -FwdPath C:\path\to\fwd.cfd -Port 8787 -KillExisting
```

or, from the `scripts` folder:

```cmd
.\scripts\start-fw-editor-viewer.cmd -FwdPath C:\path\to\fwd.cfd -Port 8787 -KillExisting
```

The wrapper calls PowerShell with `-ExecutionPolicy Bypass`, so downloaded `.ps1` files do not require a machine-level execution policy change.

## Preferred local workflow

```cmd
.\start-fw-editor-viewer.cmd -FwdPath C:\dev\AcRuleWorkbench\fwd.cfd -Port 8787 -KillExisting
```

Defaults remain compatible with the existing local API scripts:

- Host: `127.0.0.1`
- Port: `8787`
- Configuration: `Debug`
- Platform: `x86`
- Export profile: `viewer-safe`

## Advanced diagnostics

Normal mode is the read-only FW Editor-style view. Use advanced mode only when you intentionally need diagnostics/raw payloads:

```cmd
.\start-fw-editor-viewer.cmd -FwdPath C:\dev\AcRuleWorkbench\fwd.cfd -Port 8787 -Advanced
```

## Lower-level scripts

| Script | Purpose |
|---|---|
| `start-fw-editor-viewer.ps1` | Preferred FW Editor Viewer launcher. |
| `start-viewer.ps1` | Existing compatibility launcher used internally by the preferred wrapper. |
| `build-and-doctor.ps1` | Validates DCM/FormWorks DLL layout, builds x86, and copies managed DLLs to output. |
| `setup-dcm-deps.ps1` | Locates/copies DCM/FormWorks dependencies into the local repo layout. |
| `start-api.ps1` | Starts the API from an already-built executable. |
| `open-viewer-http.ps1` | Serves a static generated viewer with Python for file-only inspection. |
| `test-api-v1.ps1` | Runs API v1 smoke checks. |
| `validate-api-live.ps1` | Runs live API validation against a running server. |
| `test-code-quality.ps1` | Runs static repository/viewer checks. |
| `package-split-deliverables.ps1` | Builds split source/patch deliverables. |

Prefer the FW Editor Viewer wrappers for day-to-day testing. Use compatibility script names only for existing automation that already depends on them.
