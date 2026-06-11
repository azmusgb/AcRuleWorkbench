# Phase 8 — Granular Sidecar Split and Zippy Index Mode

## Purpose

Phase 8 moves the viewer from coarse lazy loading to granular, navigation-aligned sidecars.

The previous fast path was:

```text
/viewer
  -> ac-rule-viewer.boot.json
  -> build full boot model

First FWD-backed workspace click
  -> ac-rule-viewer.fwd.json
```

That was stable, but it still made startup parse the full boot rule model. Phase 8 adds:

```text
/viewer
  -> ac-rule-viewer.manifest.json
  -> ac-rule-viewer.index.json
  -> first-paint preview model

Scope open
  -> rules.scope.<safeKey>.tree.json

FWD workspace open
  -> fwd.<workspace>.index.json
```

The existing boot/fwd sidecars remain fallback paths.

## Added files

```text
scripts/build-viewer-granular-sidecars.js
scripts/apply-phase8-granular-sidecars.js
scripts/test-phase8-granular-sidecars.js
src/viewer/js/13-granular-sidecar-hydration.js
src/viewer/styles/zz-phase8-granular-sidecars.css
docs/PHASE8_GRANULAR_SIDECARS.md
README_PHASE8_GRANULAR_SIDECARS.md
PATCH_MANIFEST.txt
```

## Generated runtime sidecars

```text
ac-rule-viewer.manifest.json
ac-rule-viewer.index.json
rules.pages.index.json
rules.documents.index.json
rules.udfs.index.json
rules.other.index.json
rules.scope.<safeKey>.tree.json
fwd.rule-lists.index.json
fwd.udfs.index.json
fwd.functions.index.json
fwd.tables.index.json
fwd.selection-lists.index.json
fwd.resources.index.json
fwd.drivers.index.json
```

Generated sidecars are build artifacts and are not included in the delta package.

## Safety model

Phase 8 is fallback-safe:

- If granular manifest/index files are missing, the viewer falls back to the existing boot-sidecar path.
- If a granular FWD workspace index is missing, the viewer falls back to the Phase 7 full `ac-rule-viewer.fwd.json` lazy sidecar.
- If a scope sidecar fails to load, the viewer keeps the preview model and records diagnostics.
- No native extraction is added to browser load.

## Apply

```powershell
cd C:\dev\AcRuleWorkbench
Expand-Archive .\AcRuleWorkbench-phase8-granular-sidecars-delta.zip -DestinationPath . -Force
node .\scripts\apply-phase8-granular-sidecars.js

dotnet build .\AcRuleWorkbench.sln -c Debug -p:Platform=x86 -p:PlatformTarget=x86
```

Then restart the viewer with the known-good launcher command.

## Verify

```powershell
node .\scripts\test-viewer-nav-stability.js "http://127.0.0.1:8787/viewer?nocache=phase8-nav"
node .\scripts\test-phase7-lazy-detail-hydration.js "http://127.0.0.1:8787/viewer?nocache=phase8-phase7-regression"
node .\scripts\test-phase8-granular-sidecars.js "http://127.0.0.1:8787/viewer?nocache=phase8-granular"
```

Expected:

```text
[SUMMARY] failures: 0
```
