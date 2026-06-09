
# TODO — Minimal AC Rule-List Hydration and Read-Only UI Rendering

## Phase intent

Hydrate and render the first useful read-only AC rule-list view for page-level and document-level AC nodes.

This phase is intentionally **minimal**. It should prove the end-to-end path:

```text
FWD Tree AC node
→ rule-list key
→ backend rule-list hydration
→ ordered rule DTOs
→ frontend RuleListView
→ selectable rule
→ RuleInspector summary
→ diagnostics for unknown/partial parse
```

Do **not** implement full status-result/action/sub-list branching in this phase. That belongs to Phase 7.

---

## Step 0 — Scope guard

* [ ] Confirm Phase 6 is limited to:

  * [ ] Root page/document AC rule-list hydration
  * [ ] Ordered rule names
  * [ ] Basic rule identity
  * [ ] Function name if available
  * [ ] Source/raw availability marker
  * [ ] Parse confidence
  * [ ] Partial/unknown diagnostics
  * [ ] Rule selection + summary inspector
* [ ] Confirm Phase 6 does **not** include:

  * [ ] Full status-result/action branching
  * [ ] Full sub-list recursion
  * [ ] UDF internal rule trees
  * [ ] Full parameter mapping
  * [ ] Full function registry
  * [ ] Full reference graph
  * [ ] Full Source/Raw viewer
  * [ ] Any edit/save/move/delete behavior

---

## Step 1 — Backend route contract

* [x] Inspect current API routing and existing rule-list/rule endpoints.
* [ ] Add route descriptor:

  * [ ] `GET /api/v1/rule-lists/{key}`
* [ ] Add route descriptor:

  * [ ] `GET /api/v1/rules/{key}`
* [ ] Add route descriptors to `ApiV1Routes`.
* [ ] Implement dispatch wiring in `WorkbenchApiService`.
* [ ] Ensure both endpoints return the standard API response envelope.
* [ ] Ensure not-found/invalid-key responses are structured errors, not unhandled exceptions.
* [ ] Ensure endpoints are read-only and do not expose mutation behavior.

Expected route behavior:

```text
GET /api/v1/rule-lists/{key}
→ returns RuleListDto with ordered rule keys and embedded lightweight rule summaries if useful

GET /api/v1/rules/{key}
→ returns RuleDto for selected rule
```

---

## Step 2 — Rule-list key format

* [ ] Define canonical key format for page AC root rule lists:

```text
ruleList:page:<encodedPageName>:AC
```

* [ ] Define canonical key format for document AC root rule lists:

```text
ruleList:document:<encodedDocumentName>:AC
```

* [ ] Add safe key encode/decode helpers.
* [ ] Reject malformed keys with a clear diagnostic/error response.
* [ ] Preserve original display names separately from encoded keys.
* [ ] Add tests for:

  * [ ] page rule-list key round trip
  * [ ] document rule-list key round trip
  * [ ] invalid key
  * [ ] special characters in page/document names

---

## Step 3 — AC owner resolution

* [ ] Given a rule-list key, resolve:

  * [ ] owner type: `page` or `document`
  * [ ] owner name
  * [ ] owner object key
  * [ ] process: `AC`
  * [ ] scope: `page` or `document`
* [ ] For page owners:

  * [ ] Resolve `page:<pageName>`
  * [ ] Use existing page AC process discovery from Phase 5.
* [ ] For document owners:

  * [ ] Resolve `document:<documentName>`
  * [ ] Use existing document AC process discovery from Phase 5.
* [ ] Return a clear diagnostic if the AC process node is unavailable.

Diagnostics to support:

```text
ac_process_missing
ac_process_ambiguous
ac_process_unsupported
rule_list_owner_not_found
rule_list_key_invalid
```

---

## Step 4 — Minimal rule-list hydration

* [ ] Load the root AC rule-list for the resolved page/document AC process.
* [ ] Preserve original rule order.
* [ ] Produce a `RuleListDto` with:

  * [ ] `key`
  * [ ] `type`
  * [ ] `name`
  * [ ] `path`
  * [ ] `scope`
  * [ ] `ownerKey`
  * [ ] `ruleKeysInOrder`
  * [ ] `sourceRefs`
  * [ ] `diagnostics`
  * [ ] `hydrationState`
* [ ] Include lightweight rule summaries if current API style supports it.
* [ ] Never drop unknown/partial rule entries.
* [ ] Unknown entries must become visible partial rule DTOs or diagnostics.

---

## Step 5 — Minimal rule parser

Create a minimal parser that extracts only the Phase 6 fields.

For each rule entry, extract:

* [ ] `key`
* [ ] `type: rule`
* [ ] `name`
* [ ] `path`
* [ ] `ordinal`
* [ ] `guid` if available
* [ ] `disabled` if available
* [ ] `scope`
* [ ] `ownerKey`
* [ ] `parentRuleListKey`
* [ ] `functionName` if available
* [ ] `functionKey` only if already resolvable cheaply
* [ ] `functionType` only if already known cheaply
* [ ] `sourceRefs`
* [ ] `rawAvailable`
* [ ] `rawSummary`
* [ ] `parseConfidence`
* [ ] `diagnostics`

Do not parse yet:

* [ ] full status result branches
* [ ] full action mappings
* [ ] full child sub-lists
* [ ] full field parameter groups
* [ ] full attribute behavior
* [ ] full function metadata
* [ ] UDF internal rules

Those are later phases.

---

## Step 6 — Minimal diagnostics

Add deterministic diagnostic codes for Phase 6.

Required codes:

* [ ] `rule_list_load_failed`
* [ ] `rule_list_empty`
* [ ] `rule_list_partial_parse`
* [ ] `rule_entry_parse_failed`
* [ ] `rule_entry_partial_parse`
* [ ] `rule_name_missing`
* [ ] `rule_function_missing`
* [ ] `rule_raw_format_unsupported`
* [ ] `rule_source_unavailable`
* [ ] `rule_ordinal_missing`
* [ ] `rule_key_duplicate`
* [ ] `rule_key_invalid`

Each diagnostic must include:

* [ ] severity
* [ ] category
* [ ] message
* [ ] technical detail
* [ ] affected object key
* [ ] affected object path
* [ ] source refs where available
* [ ] suggested inspection step

Diagnostics should be visible but secondary.

---

## Step 7 — Backend DTO mapping

* [ ] Map parsed data into existing normalized DTOs from Phase 2.
* [ ] Ensure `RuleListDto.ruleKeysInOrder` is stable.
* [ ] Ensure each `RuleDto.parentRuleListKey` points back to the root rule list.
* [ ] Ensure each `RuleDto.scope` is correct:

  * [ ] `page`
  * [ ] `document`
* [ ] Ensure source refs are attached if available.
* [ ] Ensure partial parse objects still serialize safely.
* [ ] Ensure empty rule lists return valid empty DTOs with diagnostics, not failures.

---

## Step 8 — Frontend rule-list hydration flow

* [ ] When a page AC node is selected:

  * [ ] Build page AC root rule-list key.
  * [ ] Call `GET /api/v1/rule-lists/{key}`.
  * [ ] Render `RuleListView`.
* [ ] When a document AC node is selected:

  * [ ] Build document AC root rule-list key.
  * [ ] Call `GET /api/v1/rule-lists/{key}`.
  * [ ] Render `RuleListView`.
* [ ] Show loading state while hydrating.
* [ ] Show empty state for valid empty rule list.
* [ ] Show error state for failed hydration.
* [ ] Cache hydrated rule list by key.
* [ ] Do not re-fetch rule list on every inspector tab change.

---

## Step 9 — RuleListView

Add `RuleListView` for ordered root rules.

Required UI:

* [ ] Rule-list header:

  * [ ] name
  * [ ] scope
  * [ ] owner path
  * [ ] rule count
  * [ ] diagnostics count
* [ ] Ordered rule rows:

  * [ ] ordinal
  * [ ] rule name
  * [ ] function name if available
  * [ ] disabled marker if available
  * [ ] parse confidence marker if low/partial
  * [ ] diagnostics marker
* [ ] Selected rule state.
* [ ] Keyboard-focusable rows.
* [ ] Empty state.
* [ ] Loading state.
* [ ] Error state.
* [ ] No edit/move/delete controls.

Do not show the rule tree as a full branch tree yet unless only root-level display is required. Full status/action/sub-list tree belongs to Phase 7.

---

## Step 10 — Rule selection and inspector summary

* [ ] Selecting a rule updates central selected object state.
* [ ] Selecting a rule calls or reads `GET /api/v1/rules/{key}` as needed.
* [ ] Right inspector updates to Rule summary.
* [ ] Rule summary must show:

  * [ ] rule name
  * [ ] key
  * [ ] GUID if available
  * [ ] ordinal
  * [ ] scope
  * [ ] owner path
  * [ ] parent rule-list key/path
  * [ ] function name if available
  * [ ] disabled state if available
  * [ ] parse confidence
  * [ ] raw/source availability
  * [ ] diagnostics
* [ ] Add placeholder tabs:

  * [ ] Function
  * [ ] Fields / Parameters
  * [ ] Attributes
  * [ ] Status Results / Actions
  * [ ] Children / Sub-lists
  * [ ] References
  * [ ] Source / Raw
  * [ ] Diagnostics
* [ ] For tabs not implemented yet, show explicit future-phase placeholder text, not blank content.

Example placeholder:

```text
Status Results / Actions will be hydrated in Phase 7. This Phase 6 view shows rule identity, order, function name, source availability, and parse diagnostics only.
```

---

## Step 11 — Inline diagnostics display

* [ ] Show rule-level diagnostics inline in `RuleListView`.
* [ ] Show selected rule diagnostics in the inspector.
* [ ] Show rule-list diagnostics near the rule-list header.
* [ ] Diagnostics must not dominate the layout.
* [ ] Diagnostic click may select affected object if already supported.
* [ ] Full diagnostics panel integration can remain Phase 11.

---

## Step 12 — Source / Raw placeholder

* [ ] Add `Source / Raw` inspector tab placeholder.
* [ ] Show whether source/raw is available.
* [ ] Do not load full source/raw content in Phase 6 unless already implemented.
* [ ] If source refs exist, list source ref names/paths.
* [ ] If unavailable, show useful unavailable state.

Example:

```text
Raw/source content is available for this rule but will be loaded by the Source / Raw evidence phase. Source reference: page:<pageName>/AC/rule:<ordinal>.
```

---

## Step 13 — Tests

Backend tests:

* [ ] Rule-list key encoding/decoding:

  * [ ] page key
  * [ ] document key
  * [ ] invalid key
* [ ] Route exists:

  * [ ] `GET /api/v1/rule-lists/{key}`
  * [ ] `GET /api/v1/rules/{key}`
* [ ] Rule-list DTO has required shape.
* [ ] Rule DTO has required shape.
* [ ] Rule ordering is preserved.
* [ ] Empty rule list returns valid DTO.
* [ ] Partial parse produces diagnostics.
* [ ] Missing function name produces `rule_function_missing`.
* [ ] Unsupported raw format produces `rule_raw_format_unsupported`.

Frontend tests:

* [ ] Selecting page AC node hydrates rule list.
* [ ] Selecting document AC node hydrates rule list.
* [ ] Rule rows render in order.
* [ ] Selecting rule updates inspector summary.
* [ ] Rule diagnostics render inline.
* [ ] Source / Raw placeholder renders.
* [ ] Empty/loading/error states render.

Contract tests:

* [ ] `RuleListDto` schema does not regress.
* [ ] `RuleDto` schema does not regress.
* [ ] API error envelope is handled by UI.

---

## Step 14 — Build and validation

Run:

```powershell
dotnet test
```

If the solution has a required explicit platform:

```powershell
dotnet test -p:Platform=x86 -p:PlatformTarget=x86
```

Manual validation:

* [ ] Start viewer.
* [ ] Confirm read-only badge is visible.
* [ ] Open FWD tree.
* [ ] Select a page.
* [ ] Select Page Processing -> AC.
* [ ] Rule list hydrates.
* [ ] Ordered rules appear.
* [ ] Select a rule.
* [ ] Inspector summary updates.
* [ ] Diagnostics appear if partial parse exists.
* [ ] Select a document.
* [ ] Select Document Processing -> AC.
* [ ] Rule list hydrates.
* [ ] Ordered document rules appear.
* [ ] No edit/add/delete/move controls are active.
* [ ] No blank panels appear.

---

## Phase 6 done criteria

Phase 6 is complete only when:

* [ ] `GET /api/v1/rule-lists/{key}` exists and returns valid data.
* [ ] `GET /api/v1/rules/{key}` exists and returns valid data.
* [ ] Page AC root rule lists hydrate from page AC selection.
* [ ] Document AC root rule lists hydrate from document AC selection.
* [ ] Rules render in stable order.
* [ ] Selecting a rule updates the inspector summary.
* [ ] Unknown/partial rules are preserved, not dropped.
* [ ] Parse diagnostics are visible.
* [ ] Source/raw availability is represented.
* [ ] Full status/action/sub-list branching is intentionally deferred to Phase 7.
* [ ] Build/tests pass or failures are explicitly documented.

