# Cleanup / Refactor Pass - 2026-06-10

This package applies the requested P0/P1 cleanup pass:

1. Test and lint paths are source-clean aware.
   - Static tests now validate `src/viewer/*` and embedded Core viewer assets instead of ignored root generated viewer files.
   - `scripts/lint-viewer.js` lints the canonical source viewer bundle plus tests/scripts.

2. Old Workbench launcher surfaces were removed.
   - Removed root and script-level `start-workbench*`, `run-workbench.cmd`, `verify-workbench-live.ps1`, `generate-workbench-dev-spec.js`, and `run-workbench-api-loop.ps1` surfaces.
   - Removed stale archived nested `start-workbench` scripts from the normal package.

3. Stale command references were replaced.
   - Active docs/scripts/manifests now use `start-fw-editor-viewer` / `verify-fw-editor-viewer-live` vocabulary.

4. API route descriptor collisions were removed.
   - Route catalog now exposes explicit namespaces:
     - `/api/v1/rule-lists/by-scope/{scopeId}`
     - `/api/v1/rule-lists/by-key/{key}`
     - `/api/v1/rules/by-node/{nodeId}`
     - `/api/v1/rules/by-key/{key}`
   - Legacy un-namespaced dispatch remains as a compatibility fallback but is no longer advertised in the route catalog.

5. Phase 6 partial rule dropping was fixed.
   - Failed canonical key generation now preserves a visible partial rule row in ordinal sequence.
   - The emitted row uses `parseConfidence = "Failed"`, keeps source refs/raw summary, and carries a `rule_entry_parse_failed` diagnostic.

6. A Playwright blank-screen smoke test was added.
   - `tests/browser/fw-editor-viewer-blank-screen.spec.js` asserts that the viewer boots, has no page/console errors, and does not leave `#content` blank.
   - Minimal sidecar fixtures were added under `tests/fixtures/viewer-minimal`.

7. CSS module reset was started.
   - Broken sliced CSS layers were replaced by valid standalone layers.
   - Existing runtime CSS is quarantined in `90-legacy-runtime-bundle.css` to preserve behavior while new CSS migrates into semantic layers.
   - `src/viewer/styles/README.md` now defines the layer contract.

8. API/service responsibilities were split further.
   - `WorkbenchApiService.Dispatch.cs` now owns API dispatch routing.
   - `WorkbenchApiService.RuleLists.cs` now owns Rule List and Phase 6 rule/rule-list DTO logic.

Validated in this environment:

```text
npm run test:ci
```

Result: passed.

Not validated in this environment:

```text
dotnet build / dotnet test
```

Reason: the sandbox does not have the .NET SDK installed.

Browser test note: Playwright tests are present. In this sandbox, Chromium blocked localhost navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`, so the browser tests could not be completed here. On the Windows dev machine, run:

```powershell
npm install
npx playwright install chromium
npm run test:browser
```
