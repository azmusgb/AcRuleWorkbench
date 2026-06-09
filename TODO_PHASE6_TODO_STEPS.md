# Phase 6 - Work Remaining Tracker

## Backend
- [ ] Implement `GET /api/v1/rules/{key}` Phase-6 key parsing + read-only RuleDto hydration (minimal fields + diagnostics).
- [ ] Align `GET /api/v1/rule-lists/{key}` Phase-6 RuleListDto payload with `TODO_PHASE6.md` required fields.
- [ ] Ensure structured errors for invalid/missing keys and partial hydration.

## Frontend
- [ ] Locate viewer JS entry points for Phase-6 rule-list rendering.
- [ ] Implement rule-list key building from selected page/document AC nodes.
- [ ] Implement `RuleListView` (ordered rows + selection state).
- [ ] Implement selection → inspector summary via `GET /api/v1/rules/{key}`.
- [ ] Add explicit placeholder tabs content for Phase 7.

## Tests / Validation
- [ ] Add backend unit tests (key parsing, DTO shape, ordering stability, diagnostics).
- [ ] Add/extend contract tests for API envelopes.
- [ ] Run `dotnet test`.
- [ ] Manual viewer smoke-test.

