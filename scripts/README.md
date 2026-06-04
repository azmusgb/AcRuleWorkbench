# AC Rule Workbench scripts

Use the command wrappers for local testing:

```cmd
.\run-workbench.cmd
```

or, from this folder:

```cmd
.\dev-workbench.cmd
```

The wrappers call PowerShell with `-ExecutionPolicy Bypass`, so downloaded `.ps1` files do not require a machine-level execution policy change.

## Recommended test workflow

```cmd
.\run-workbench.cmd
```

Defaults:

- FWD: `fwd.cfd` in the repository root
- Host: `127.0.0.1`
- Port: `8787`
- Configuration: `Debug`
- Platform: `x86`
- Stops a normal existing listener on the selected port
- Unblocks files extracted from a downloaded ZIP
- Runs dependency setup only when `lib`, `rri_bin`, or the runtime helper are missing
- Builds/doctors the harness
- Refreshes the viewer before launching
- Automatically switches to the next open port when the requested port is held by HTTP.sys/System PID 4

Common options:

```cmd
.\run-workbench.cmd -FwdPath C:\dev\AcRuleWorkbench\fwd.cfd -Port 8787
.\run-workbench.cmd -Clean -ForceSetup
.\run-workbench.cmd -SkipBuild
.\run-workbench.cmd -SkipViewerRefresh
.\run-workbench.cmd -NoBrowser
.\run-workbench.cmd -NoAutoPort        # fail instead of auto-selecting another port
```

## Lower-level scripts

- `dev-workbench.ps1` is the one-command orchestrator used by the `.cmd` wrappers.
- `start-workbench.ps1` builds/doctors, refreshes the viewer, then starts the API.
- `build-and-doctor.ps1` validates the DCM/FormWorks DLL layout, builds x86, and copies managed DLLs to output.
- `setup-dcm-deps.ps1` locates/copies DCM/FormWorks dependencies into the local repo layout.
- `start-api.ps1` starts the API from an already-built executable.
- `open-viewer-http.ps1` serves a static generated viewer with Python for file-only inspection.
- `test-api-v1.ps1` and `validate-api-live.ps1` run live API smoke checks.
- `test-code-quality.ps1` runs static repository/viewer checks.

Prefer the `.cmd` wrappers for day-to-day testing. Run `.ps1` files directly only when you intentionally want to manage PowerShell execution policy yourself.


## Port conflicts

When the requested port is owned by a normal process, `-KillExisting` stops it. When the port is owned by HTTP.sys/System PID 4, the scripts do not try to kill it and automatically select the next open local port. The selected health and viewer URLs are printed during launch.

Use `-NoAutoPort` when a fixed port is required and the run should fail if that port is unavailable.
