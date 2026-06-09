# Phase 6 backlog (work log)

## Step 0: Backend contract alignment
- [x] Implement Phase-6 route contract parsing:
  - [ ] `GET /api/v1/rule-lists/{key}` where `{key}` is `ruleList:page:<encodedPageName>:AC` or `ruleList:document:<encodedDocumentName>:AC`
  - [ ] `GET /api/v1/rules/{key}` where `{key}` is the Phase-6 rule key (TBD once key format is derived from current editor model)
  - [ ] Validate keys and return structured API errors (no unhandled exceptions)
  - [ ] Return standard API envelope



## Step 1: RuleList/Rule DTO minimal payloads
- [ ] Add/align minimal RuleListDto + RuleDto fields required by TODO_PHASE6.md
- [ ] Include deterministic diagnostics codes list

## Step 2: Minimal hydration + ordering
- [ ] Hydrate root AC rule list entries in stable order
- [ ] Preserve unknown/partial entries and represent via partial DTO + diagnostics

## Step 3: Frontend hydration + RuleListView
- [ ] Add ruleList key building from selected page/document AC nodes
- [ ] Implement RuleListView + selection → inspector summary
- [ ] Add placeholder tabs content

## Step 4: Tests + validation
- [ ] Add backend unit tests (key round-trip, route existence, ordering, diagnostics)
- [ ] Run `dotnet test`
- [ ] Manual viewer smoke-test

