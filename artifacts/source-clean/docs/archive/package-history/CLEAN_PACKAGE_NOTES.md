# Clean Package Notes

This package is intended to replace the cluttered working ZIP. It keeps source, scripts, docs, installer material, and required local reference DLLs. It excludes generated build products and duplicate reference-only snapshots.

## Removed from delivery

- `bin/`
- `obj/`
- `TestResults/`
- `ForReferenceOnly/`
- temporary transcript/pasted files
- generated root evidence JSON dumps unless re-created by `ac-viewer`

## Important changes in this pass

- Removed generated-attribution comments from tracked source/viewer files.
- Hardened HTTP response writing with a single text/JSON/HTML writer path and safe close behavior.
- Serialized snapshot cache builds to avoid concurrent native-wrapper snapshot construction.
- Added last snapshot build failure visibility to readiness/status responses.
- Added an engineering hardening plan that defines evidence hierarchy, API scope, comment policy, and next split points.

## Build target

Use x86 unless you have verified that the local FormWorks/DCM native DLL stack is x64.
