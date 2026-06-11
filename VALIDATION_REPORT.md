# Phase 8 Validation Report

Validation performed in the sandbox before packaging:

## Static checks

```text
node --check scripts/build-viewer-granular-sidecars.js      PASS
node --check scripts/apply-phase8-granular-sidecars.js      PASS
node --check scripts/test-phase8-granular-sidecars.js       PASS
node --check src/viewer/ac-rule-viewer.js after apply       PASS
```

## Apply-script smoke

The delta was applied to the available `phase7_apply_test` source tree. Results:

```text
Patched loadViewerData to prefer granular index sidecars.
Added granular state to fwViewerDiagnostics().
Patched WorkbenchApiServer with safe generic viewer JSON sidecar route.
Patched start script to build granular sidecars before API launch.
Rebuilt and synced viewer JS/CSS bundles.
Node script syntax checks passed.
```

## Builder smoke

The granular sidecar builder was run against a synthetic viewer export containing:

```text
2 scopes
3 rules
3 nodes
1 edge
1 FWD item per major catalog
```

It generated:

```text
ac-rule-viewer.manifest.json
ac-rule-viewer.index.json
rules.pages.index.json
rules.documents.index.json
rules.udfs.index.json
rules.other.index.json
rules.scope.AC_Pages_DentalADA.tree.json
rules.scope.AC_Documents_Dental_Doc.tree.json
fwd.rule-lists.index.json
fwd.udfs.index.json
fwd.functions.index.json
fwd.tables.index.json
fwd.selection-lists.index.json
fwd.resources.index.json
fwd.drivers.index.json
```

## Not run in sandbox

`dotnet build` could not be run in the sandbox because the `dotnet` CLI is not installed in this environment. The package includes source-level C# patching only and must be compiled in the user's Windows repo with the existing x86 build command.
