# TODO (UDF canonical parsing + caller/callee graph)

## Phase 1 — Shared private-tree decoder
- [ ] Extract / refactor `CandidatePackedRulePayloads` + packed-rule decode + `TryParseUdfInternalRuleRowsFromPrivateTree` out of `FormWorksExtractionClient.ViewerPrivateTree.cs` into a shared helper under `AcRuleWorkbench.Core`.
- [ ] Ensure helper returns decoded rule rows and a parse-state classification.
- [ ] Update viewer export to use the shared helper (optional but preferred to avoid divergence).

## Phase 2 — Canonical UDF body parsing using preferred order
- [ ] Update `AcRuleWorkbench/Api/V1/WorkbenchApiService.Udfs.cs`:
  - [ ] In `BuildFwdUdfsCanonical` and `BuildFwdUdfDetail`, compute `bodyParseState` and `ruleBody` in this order:
    1) editor model `InternalRuleTree` if `Parsed`
    2) decoded/internal nodes from `snapshot.Tree.Nodes` (`FindParsedUdfNodes`)
    3) decoded internal rule rows from `rawDetails.PrivateTree` via shared private-tree helper
- [ ] Ensure diagnostics only surface `UdfBodyOpaque/UdfBodyUnavailable` after private-tree fallback attempt.
- [ ] Ensure `internalRuleCount/internalRulePreview` are consistent with the chosen source.

## Phase 3 — Caller/callee graph normalization
- [ ] Update `BuildFwdUdfDetail` to add `callGraph: { nodes, edges }`.
- [ ] Nodes include caller-rule nodes plus a callee node for the UDF.
- [ ] Edges include: direct call, iterator wrapper call, relationship evidence call.
- [ ] Keep existing arrays (`directCallers`, `iteratorCallers`, `relationshipMatches`) for compatibility or map them into callGraph.

## Phase 4 — Tests & validation
- [ ] Add tests for call graph normalization (pure transformation where possible).
- [ ] Run `dotnet test` and fix compilation issues.

