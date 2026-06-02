# AC Rule Workbench v38 Production-Ready Hardening

This package applies the production boundary, API, viewer, diagnostics, script, and documentation hardening pass requested for the v37 workbench package.

## Product posture

- `/api/v1/*` is the canonical product API.
- Debug/raw routes are disabled by default.
- Diagnostic mode is explicit through `--enable-debug-api` or `scripts/run-diagnostic.ps1`.
- Request-level `?path=` overrides are disabled by default when the server is started with `--path`.
- CORS is disabled by default and must be enabled explicitly.
- Legacy `/api/fwd/*`, `/api/ac/*`, and `/api/workbench/*` routes are compatibility/diagnostic surfaces, not product contracts.

## API changes

- Added/standardized product-focused startup output.
- Added security headers to HTML, JSON, and API responses.
- Added deprecation headers for compatibility aliases.
- Made refresh POST-only through `/api/v1/snapshot/refresh`.
- Added `include=` expansions for:
  - `/api/v1/scopes/{scopeId}?include=structure,inventory,references,diagnostics`
  - `/api/v1/rules/{nodeId}?include=subtree,references,diagnostics`
- Added path override enforcement in both legacy and v1 services.

## Viewer changes

- Removed the low-value density toggle from the production viewer.
- Removed duplicated JavaScript function declarations.
- Added handling for previously orphaned viewer actions.
- Preserved evidence-first rule tree/inspector behavior.
- Updated the server-injected viewer bridge to call `/api/v1/status` and `POST /api/v1/snapshot/refresh`.

## Script changes

- Updated `start-workbench.ps1` and `start-api.ps1` for production defaults.
- Added `run-diagnostic.ps1` for explicit debug/harness mode.
- Added `collect-diagnostics.ps1` to produce a diagnostics bundle.
- Expanded `test-api-v1.ps1` for include-expansion and debug-disabled checks.
- Expanded `test-code-quality.ps1` to catch duplicate viewer functions, orphaned data-actions, and density-toggle regression.

## Documentation changes

- Replaced the oversized root README with a product-focused README.
- Preserved the v37 README under `docs/reference/README.v37.original.md`.
- Added operator, admin, developer, API, debug API, evidence model, configuration, troubleshooting, and runbook docs.
- Added `appsettings.sample.json`.

## Validation performed in this environment

- Viewer JavaScript syntax validated with Node.js `--check`.
- Viewer duplicate-function scan passed.
- Viewer data-action handler coverage scan passed.
- JSON parsing passed for `appsettings.sample.json` and `docs/openapi/ac-workbench-api-v1.openapi.json`.
- C# brace/paren/bracket balance scan passed.

## Validation not performed here

This environment does not include a .NET Framework build toolchain, MSBuild, PowerShell, or the x86 FormWorks/DCM native runtime DLLs. Final compile/native validation should be run on the Windows/FormWorks workstation with:

```powershell
.\scripts\build-and-doctor.ps1
.\scripts\test-code-quality.ps1
.\scripts\test-api-v1.ps1 -BaseUrl http://127.0.0.1:8787
```

## Hardening pass - clean source package

- Removed duplicate/reference-only source snapshots and generated build output from the normal delivery package.
- Added `.gitignore` and `SOURCE_MANIFEST.csv` to make source/package boundaries explicit.
- Added `CLEAN_PACKAGE_NOTES.md` and `docs/engineering-hardening-plan.md`.
- Centralized text/HTML/JSON response writing through `ApiResponseWriter.WriteText`, with safe response close handling for disconnects and shutdown races.
- Serialized snapshot cache builds to reduce native-wrapper concurrency risk and expose the last snapshot build failure through readiness/status output.
- Removed generated-attribution comments from source, viewer, script, and documentation files.

## Recommendation application package - 2026-06-01

- Added structural route metadata (`StructuralPath`, `DisplayPath`, `Route`) to tree nodes.
- Added explicit sequence-only disabled state so flat order fallback is audit evidence, not structural inheritance.
- Added high-value AC function catalog and catalog-first parameter classification.
- Fixed snapshot cache key to include `RequireNativeOk`.
- Fixed UDF viewer filters and normalized UDF row metadata.
- Restored selected-rule inspector sections previously hidden behind an early return.
- Added semantic model tests for disabled states and function-catalog classification.
- Added clean package script and recommendation/authority-model documentation.
