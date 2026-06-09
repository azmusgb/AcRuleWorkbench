# TODO - Phase 3: Configured FWD hierarchy extraction (read-only)

## Step 1 — DTOs and report model
- [ ] Create `FwdConfiguredHierarchyReport` + node/edge DTOs in `AcRuleWorkbench.Core`.
- [ ] Add diagnostics model (codes, severity, message, node context).

## Step 2 — Phase-3 extractor (configured hierarchy)
- [ ] Implement `InspectFwdConfiguredHierarchy` in `FormWorksExtractionClient` (or dedicated extractor class).
- [ ] Extract using required APIs: `BatchNames`, `GetDocsInBatch`, `DocumentNames`, `GetPagesInDoc`, `PageNames`, `VariantNames`, `Page`, `PageVariant`.
- [ ] Implement batch filtering to exclude runtime/inventory batches from configured batch types.
- [ ] Extract fields where available from page config/field container.
- [ ] Extract STC source refs where safely available via `SafeStcReader`.
- [ ] Populate diagnostics for all required failure modes.

## Step 3 — Relationship builder
- [ ] Build forward + reverse relationships:
  - [ ] BatchType -> DocumentType via DocsInBatch
  - [ ] DocumentType -> PageType via PagesInDoc
  - [ ] PageType -> PageVariant via VariantNames
  - [ ] PageType -> Field via page config/field container
  - [ ] Reverse: DocumentType.parentBatchKeys, PageType.parentDocumentKeys

## Step 4 — Snapshot wiring
- [ ] Extend `WorkbenchSnapshot` with `FwdPhase3` configured hierarchy report.
- [ ] Update `WorkbenchSnapshotBuilder.Build(...)` to call Phase-3 extractor after/with existing `Inspect`.

## Step 5 — API endpoints
- [ ] Add route descriptors to `ApiV1Routes.cs`:
  - [ ] GET /api/v1/fwd/summary
  - [ ] GET /api/v1/fwd/tree
  - [ ] GET /api/v1/fwd/batches
  - [ ] GET /api/v1/fwd/batches/{batchKey}
  - [ ] GET /api/v1/fwd/documents
  - [ ] GET /api/v1/fwd/documents/{documentKey}
  - [ ] GET /api/v1/fwd/pages
  - [ ] GET /api/v1/fwd/pages/{pageKey}
  - [ ] GET /api/v1/fwd/pages/{pageKey}/variants
- [ ] Implement endpoint dispatch + response builders in `WorkbenchApiService`.

## Step 6 — Diagnostics integration
- [ ] Ensure endpoint responses include diagnostics.
- [ ] Add per-node hydration failure diagnostics.

## Step 7 — Tests
- [ ] Add stub client(s) that implement Phase-3 methods (configured hierarchy) for deterministic tests.
- [ ] Add tests for relationship resolution and reverse parent keys.
- [ ] Add tests for diagnostics when pieces are missing.
- [ ] Add API contract tests for required endpoints.

## Step 8 — Build/test
- [ ] Run `dotnet build` for solution.
- [ ] Run `dotnet test` for `AcRuleWorkbench.Tests`.

## Step 9 — Validation instructions
- [ ] Add quick validation steps to confirm configured batches/documents/pages/variants and fields appear.
- [ ] Ensure all data is read-only and AC parsing is not invoked by these endpoints.

