# FW Editor Viewer / AC Rule Workbench

Read-only FW Editor-style viewer for FormWorks / Document Capture Manager FWD configuration.

This repository extracts, normalizes, and displays Auto Capture (AC) rule configuration from a FormWorks/Document Capture Manager FWD/CFD file. The goal is not to replace FW Editor. The goal is to provide a safer, faster, read-only analysis surface for understanding pages, documents, rule lists, rules, functions, UDFs, tables, SelectionLists, relationships, and diagnostics without editing production configuration.

---

## What this tool is

**FW Editor Viewer** is a local Windows developer/operator tool that:

- Opens a FormWorks/Document Capture Manager FWD/CFD file read-only.
- Extracts AC rule structure and supporting configuration.
- Serves a local browser-based viewer at `http://127.0.0.1:8787/viewer`.
- Presents rule lists, rules, status results, action lists/sub-lists, attributes, parameters, UDFs, tables, and raw confirmation views.
- Keeps editing, saving, deleting, moving, or mutating FWD configuration out of scope.

The project is intentionally **read-only**. Treat it as an inspection and analysis workbench, not as an editor.

---

## Current status

| Area | Status |
|---|---|
| Local viewer launch | Supported through `start-fw-editor-viewer` scripts |
| Default mode | `LocalFast` |
| Runtime platform | Windows, x86 process, .NET Framework 4.8 target |
| Browser UI | Static shell plus local API-backed hydration |
| Rule-list hydration | Phase 6 key model with partial/failed entries preserved |
| API contract | `/api/v1/*` with explicit by-key/by-node/by-scope route descriptors |
| Source packaging | `.gitignore`-based clean packaging supported |
| Browser smoke coverage | Playwright blank-screen smoke test included |
| Old Workbench launchers | Removed from the intended product surface |
| Editing support | Not supported by design |

---

## Quick start

From the repository root:

```powershell
cd C:\dev\AcRuleWorkbench

.\scripts\start-fw-editor-viewer.ps1 `
  -FwdPath .\fwd.cfd `
  -Port 8787 `
  -KillExisting
```

Then open:

```text
http://127.0.0.1:8787/viewer?nocache=1
```

For the fastest daily start after a successful build:

```powershell
.\scripts\start-fw-editor-viewer.ps1 `
  -FwdPath .\fwd.cfd `
  -Port 8787 `
  -KillExisting `
  -NoBuild `
  -SkipViewerRefresh
```

Or use the command wrapper:

```powershell
.\scripts\start-fw-editor-viewer.cmd -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

---

## Prerequisites

### Required

- Windows development machine.
- Git.
- PowerShell 5.1 or newer.
- .NET SDK / MSBuild capable of building .NET Framework 4.8 projects.
- FormWorks / Document Capture Manager managed and native runtime dependencies.
- A local FWD/CFD file, usually `fwd.cfd`.

### For viewer tests

- Node.js 20 or newer.
- npm.
- Playwright browser install for browser smoke tests.

```powershell
npm install
npx playwright install chromium
```

---

## Runtime dependency layout

Expected local folders:

```text
AcRuleWorkbench/
  lib/       # managed FormWorks/DCM DLLs
  rri_bin/   # native FormWorks/DCM DLLs
  fwd.cfd    # local FWD/CFD input file, if used
```

The startup scripts validate the runtime layout and generate a local PATH helper when needed:

```text
scripts/runtime-path.generated.ps1
```

That generated helper is intentionally ignored by Git.

---

## Recommended commands

### Build and validate runtime layout

```powershell
.\scripts\build-and-doctor.ps1 -FwdPath .\fwd.cfd
```

### Start viewer normally

```powershell
.\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

### Start fast after prior successful build/export

```powershell
.\scripts\start-fw-editor-viewer.ps1 `
  -FwdPath .\fwd.cfd `
  -Port 8787 `
  -KillExisting `
  -NoBuild `
  -SkipViewerRefresh
```

### Force viewer sidecar regeneration

Use this when the FWD changed, viewer shell changed, or generated sidecars are stale:

```powershell
.\scripts\start-fw-editor-viewer.ps1 `
  -FwdPath .\fwd.cfd `
  -Port 8787 `
  -KillExisting `
  -ForceViewerRefresh
```

### Verify local API/viewer health

```powershell
.\scripts\verify-fw-editor-viewer-live.ps1 -Port 8787
```

### Run static viewer contract tests

```powershell
npm run test:viewer
```

### Run viewer lint

```powershell
npm run lint:viewer
```

### Run default CI-style JS checks

```powershell
npm run test:ci
```

### Run browser smoke tests

```powershell
npx playwright install chromium
npm run test:browser
```

### Build .NET solution

```powershell
dotnet build .\AcRuleWorkbench.sln -c Debug -p:Platform=x86 -p:PlatformTarget=x86
```

### Run .NET tests

```powershell
dotnet test .\AcRuleWorkbench.Tests\AcRuleWorkbench.Tests.csproj `
  -c Debug `
  -p:Platform=x86 `
  -p:PlatformTarget=x86
```

---

## Viewer modes

The startup script supports three viewer modes:

| Mode | Purpose | Use when |
|---|---|---|
| `LocalFast` | Default fast local workflow using static sidecars and cached API surfaces | Normal daily work |
| `LiveLazy` | Prefer API-driven lazy hydration | Working on route/API hydration behavior |
| `SnapshotWarmup` | Allow heavier snapshot-oriented startup | Testing snapshot cache behavior |

Examples:

```powershell
.\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -ViewerMode LocalFast -KillExisting
```

```powershell
.\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -ViewerMode LiveLazy -KillExisting
```

```powershell
.\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -ViewerMode SnapshotWarmup -KillExisting
```

Default to `LocalFast` unless actively testing API or snapshot behavior.

---

## Evidence/export profiles

The startup profile controls how much private/deep evidence is exposed.

| Profile | Purpose | Default? |
|---|---|---|
| `viewer-safe` | Normal read-only viewer profile with masked/safe evidence | Yes |
| `diagnostic` | More diagnostic detail for local troubleshooting | No |
| `full-evidence` | Deep/private evidence for local expert analysis only | No |

Normal usage:

```powershell
.\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -Profile viewer-safe
```

Avoid `full-evidence` unless performing controlled local analysis. Do not publish or commit full-evidence exports.

---

## Expected repository layout

```text
AcRuleWorkbench/
  AcRuleWorkbench/                     # console host, HTTP server, API surface
  AcRuleWorkbench.Core/                # FWD extraction, structural parsing, viewer export
  AcRuleWorkbench.Tests/               # .NET tests
  src/viewer/                          # source viewer HTML/CSS/JS
  src/viewer/styles/                   # layered CSS source
  src/viewer/js/                       # viewer JS source modules/helpers
  tests/static/                        # Node static contract tests
  tests/browser/                       # Playwright behavior/smoke tests
  scripts/                             # build/start/package/validate tooling
  lib/                                 # local managed DCM/FormWorks dependencies
  rri_bin/                             # local native DCM/FormWorks dependencies
  docs/                                # documentation/reference material
  package.json                         # viewer test/lint commands
  AcRuleWorkbench.sln                  # solution
  .gitignore                           # excludes generated/build/local artifacts
```

---

## Source of truth for viewer assets

The intended source files are:

```text
src/viewer/ac-rule-viewer.html
src/viewer/ac-rule-viewer.js
src/viewer/ac-rule-viewer.css
src/viewer/styles/*.css
src/viewer/js/*.js
```

The embedded runtime copies are:

```text
AcRuleWorkbench.Core/Viewer/ac-rule-viewer.html
AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js
AcRuleWorkbench.Core/Viewer/ac-rule-viewer.css
AcRuleWorkbench.Core/Viewer/ac-viewer-template.html
AcRuleWorkbench.Core/Viewer/ac-viewer-template.css
```

When editing viewer source, sync embedded runtime assets:

```powershell
.\scripts\sync-viewer-assets.ps1
```

Then run:

```powershell
npm run test:ci
```

Generated root files such as these are **not source** and should not be committed:

```text
ac-rule-viewer-live.html
ac-rule-viewer.rules.json
ac-rule-viewer.rel.json
ac-rule-viewer.tree.json
ac-rule-viewer.fwd.json
ac-rule-viewer.advanced.*.json
```

---

## API overview

The local API is served under:

```text
/api/v1
```

Common endpoints:

| Endpoint | Purpose |
|---|---|
| `/api/v1/live` | Basic process liveness |
| `/api/v1/ready` | Readiness/snapshot health |
| `/api/v1/viewer/bootstrap` | Initial viewer bootstrap/catalog payload |
| `/api/v1/scopes/{scopeId}` | Scope details |
| `/api/v1/rule-lists/by-scope/{scopeId}` | Rule list from a page/document/field scope |
| `/api/v1/rule-lists/by-key/{key}` | Rule list by canonical key |
| `/api/v1/rules/by-node/{nodeId}` | Rule details by structural node |
| `/api/v1/rules/by-key/{key}` | Rule details by canonical key |
| `/api/v1/functions` | Function catalog |
| `/api/v1/tables` | Table and SelectionList catalog |
| `/api/v1/udfs` | UDF catalog |
| `/api/v1/search` | Viewer search |
```

The documented route model avoids ambiguous duplicate descriptors. Prefer explicit `by-key`, `by-node`, and `by-scope` routes in new code.

---

## FW Editor mental model

The viewer should keep the FW Editor configuration model visible and reduce implementation noise.

Primary model:

```text
FWD Tree
  Page / Document / Field / UDF
    AC
      Rule List
        Rule
          Function
          Fields / Parameters
          Attributes
          Status Results
          Action List / Sub-list
          Raw confirmation
```

Terminology to preserve in UI and docs:

- Rule List
- Rule
- Function
- Fields / Parameters
- Attributes
- Status Results
- Action List
- Sub-list
- Parent Rule
- UDF
- Table
- SelectionList
- Raw

Avoid default user-facing language that sounds like internal plumbing:

- routes
- packets
- snapshots
- graph nodes
- relationship refs
- evidence payloads
- diagnostics model

Those concepts can exist in code and advanced diagnostics, but they should not dominate the normal viewer UX.

---

## CSS architecture

The viewer is transitioning away from one large override-heavy stylesheet toward layered CSS.

Current intended layers:

```text
src/viewer/styles/
  00-reset-tokens.css
  10-app-shell.css
  20-left-nav.css
  30-rule-list.css
  40-inspector.css
  90-legacy-runtime-bundle.css
```

The file below is a temporary compatibility quarantine:

```text
90-legacy-runtime-bundle.css
```

New CSS should go into the earlier semantic layers. Avoid adding new rules to the legacy bundle unless preserving existing behavior during a controlled migration.

CSS rules:

- Light mode must remain the default.
- Dark mode must not rely on inverted or patched colors.
- Avoid new `!important` unless replacing legacy behavior during migration.
- Prefer layout tokens and component classes over one-off selectors.
- Do not hide core layout panes with broad `display: none` or `overflow: hidden` rules.
- Keep focus states visible.
- Respect reduced motion.

---

## Clean workspace

To remove local build/generated/dependency junk:

```powershell
.\scripts\clean-workspace.ps1
```

Manual cleanup pattern:

```powershell
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue .vs, node_modules, playwright-report, test-results
Get-ChildItem -Recurse -Directory -Force -Include bin,obj | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Force -ErrorAction SilentlyContinue ac-rule-viewer-live.html, ac-rule-viewer.*.json, AcRuleWorkbench.zip
```

Do not delete:

```text
lib/
rri_bin/
fwd.cfd
src/viewer/
AcRuleWorkbench.Core/Viewer/
```

unless you are intentionally replacing those inputs/assets.

---

## Packaging

### Create a clean source/dev handoff ZIP

```powershell
.\scripts\package-clean-source.ps1
```

Preview first:

```powershell
.\scripts\package-clean-source.ps1 -DryRun
```

Tracked files only:

```powershell
.\scripts\package-clean-source.ps1 -TrackedOnly
```

The clean package should exclude:

```text
.git/
.vs/
bin/
obj/
node_modules/
*.zip
ac-rule-viewer-live.html
ac-rule-viewer.rules.json
ac-rule-viewer.tree.json
ac-rule-viewer.rel.json
ac-rule-viewer.advanced.*.json
scripts/runtime-path.generated.ps1
logs/
tmp/
```

### Validate package boundaries

```powershell
.\scripts\validate-package-boundaries.ps1
```

---

## Git hygiene

The repository should track source, tests, scripts, docs, and required project files.

It should not track:

- Build outputs.
- Generated viewer sidecars.
- Root static exports.
- Local runtime PATH helpers.
- Log files.
- Temporary diagnostics.
- ZIP packages created from the repo.
- `node_modules`.
- `.vs`.

After changing `.gitignore`, remember that already-tracked files must be removed from the Git index explicitly:

```powershell
git rm --cached ac-rule-viewer-live.html
git rm --cached ac-rule-viewer.rules.json
git rm --cached ac-rule-viewer.rel.json
git rm --cached ac-rule-viewer.tree.json
git rm --cached ac-rule-viewer.fwd.json
git rm --cached scripts/runtime-path.generated.ps1
```

Then commit the cleanup:

```powershell
git add .gitignore
git commit -m "Ignore generated viewer artifacts and local build outputs"
```

---

## Development workflow

Recommended daily loop:

```powershell
cd C:\dev\AcRuleWorkbench

git status --short
npm run test:ci
.\scripts\build-and-doctor.ps1 -FwdPath .\fwd.cfd
.\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting -NoBuild
```

When editing viewer HTML/CSS/JS:

```powershell
.\scripts\sync-viewer-assets.ps1
npm run test:ci
npm run test:browser
```

When editing backend/API code:

```powershell
dotnet build .\AcRuleWorkbench.sln -c Debug -p:Platform=x86 -p:PlatformTarget=x86
dotnet test .\AcRuleWorkbench.Tests\AcRuleWorkbench.Tests.csproj -c Debug -p:Platform=x86 -p:PlatformTarget=x86
```

When packaging for handoff:

```powershell
.\scripts\package-clean-source.ps1 -DryRun
.\scripts\package-clean-source.ps1
```

---

## Troubleshooting

### Viewer opens but looks blank

Run browser smoke tests first:

```powershell
npm run test:browser
```

Then verify the local API:

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/v1/live
Invoke-RestMethod http://127.0.0.1:8787/api/v1/ready
Invoke-RestMethod http://127.0.0.1:8787/api/v1/viewer/bootstrap
```

Try a clean browser state:

```text
http://127.0.0.1:8787/viewer?nocache=1
```

If the app has a reset-layout control, use it. Stale localStorage layout state can make a valid viewer appear broken.

### Port is already in use

Use:

```powershell
.\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

or choose another port:

```powershell
.\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -Port 8788
```

### Native DLL load failure

Run:

```powershell
.\scripts\setup-dcm-deps.ps1
.\scripts\build-and-doctor.ps1 -FwdPath .\fwd.cfd
```

Confirm:

```text
lib/
rri_bin/
```

exist and contain the expected FormWorks/DCM runtime DLLs.

### x86 / bitness issues

Build and run as x86:

```powershell
dotnet build .\AcRuleWorkbench.sln -c Debug -p:Platform=x86 -p:PlatformTarget=x86
```

The FormWorks/DCM native runtime path is expected to run in a 32-bit process.

### Generated viewer sidecars are stale

Run:

```powershell
.\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -ForceViewerRefresh -KillExisting
```

### Tests fail because root generated files are missing

That is expected if a stale test still targets root generated files.

Tests should target source viewer files under:

```text
src/viewer/
```

Generated root files are intentionally ignored and should not be required by source-package validation.

---

## Architecture notes

### Main projects

| Project | Responsibility |
|---|---|
| `AcRuleWorkbench` | Console host, local HTTP server, API routes, viewer serving |
| `AcRuleWorkbench.Core` | FWD extraction, parsing, relationships, viewer export payloads |
| `AcRuleWorkbench.Tests` | .NET contract and model tests |
| `src/viewer` | Browser viewer source |
| `tests/static` | Node static contract checks |
| `tests/browser` | Playwright UI behavior/smoke checks |

### Current refactor direction

The codebase is moving toward smaller responsibility boundaries:

```text
API dispatch
Rule-list hydration
Rule details
Functions
Tables
UDFs
Viewer bootstrap
Snapshot/cache
Static viewer serving
Diagnostics/export tooling
```

New code should avoid expanding monolithic files. Prefer targeted services/controllers/partials with narrow responsibilities.

---

## Non-goals

This project should not:

- Edit FWD/CFD configuration.
- Save rule changes back to FormWorks/DCM.
- Replace FW Editor.
- Act as a general-purpose Document Capture Manager admin console.
- Expose full/private evidence in the default viewer flow.
- Require generated static root files to exist for source validation.
- Preserve old Workbench launcher compatibility indefinitely.

---

## Definition of done for future changes

A change is not complete until these pass on Windows:

```powershell
npm run test:ci
npm run test:browser
dotnet build .\AcRuleWorkbench.sln -c Debug -p:Platform=x86 -p:PlatformTarget=x86
dotnet test .\AcRuleWorkbench.Tests\AcRuleWorkbench.Tests.csproj -c Debug -p:Platform=x86 -p:PlatformTarget=x86
```

For viewer changes, also verify manually:

- Viewer loads at `/viewer?nocache=1`.
- Main content is not blank.
- Left navigation is visible.
- Page/document rule list selection works.
- UDF detail renders internal rule tree where available.
- Table/SelectionList detail is configuration-first.
- Theme toggle does not break layout.
- Browser console has no fatal errors.

---

## Recommended next technical improvements

1. Finish splitting `WorkbenchApiService` into narrower API controllers.
2. Finish splitting `WorkbenchApiServer` into lifecycle, static-file, viewer, and API handlers.
3. Continue removing `90-legacy-runtime-bundle.css` by migrating selectors into semantic layers.
4. Add browser tests for UDF rule tree rendering and SelectionList configuration views.
5. Keep generated viewer sidecars out of source control.
6. Keep old Workbench launchers and stale command references out of the product surface.
7. Make diagnostics/evidence tooling explicitly advanced-mode only.

---

## One-command sanity check

Use this after a pull, cleanup, or package extraction:

```powershell
cd C:\dev\AcRuleWorkbench
npm install
npm run test:ci
.\scripts\build-and-doctor.ps1 -FwdPath .\fwd.cfd
.\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting -NoBuild
```

Expected result:

- Static viewer tests pass.
- Viewer lint passes.
- Build/output doctor completes.
- Server starts on `127.0.0.1:8787`.
- Viewer opens or is available at `/viewer?nocache=1`.
- Main viewer content is visible and not stuck on loading.
