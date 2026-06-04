# Developer Guide

The core product model is documented in [FormWorks Editor And AC Function Reference](formworks-editor-ac-reference-guide.md). The current code inventory is tracked in [Project Code Catalog](project-code-catalog.md), and the implementation bridge to Editor parity is tracked in [Editor Gap Closure Plan](editor-gap-closure-plan.md). Implementations should preserve that model: FormWorks Editor is the authoring IDE over the FWD/STC configuration; AC Rule Workbench is a read-only companion; AC rules are ordered rule-list trees; status results own action lists/sub-lists; UDFs are reusable rule-list functions; and SelectionLists/tables connect static configuration to runtime keying behavior.

## Model-first implementation rules

- Use FormWorks Editor vocabulary in APIs, UI copy, exports, and docs unless compatibility requires an older name.
- Keep `Rule List`, `Rule`, `Status Result`, `Action List`, `Sub-list`, `Parent Rule`, `Fields / Parameters`, and `Attributes` distinct.
- Treat route/path language as secondary. It can explain traversal, but it must not replace action-list/status-result semantics.
- Treat UDFs as function-shaped rule lists with named field-list parameters, status results, internal rules, and caller bindings.
- Treat tables and SelectionLists as configuration objects first; usage-derived fields are not parsed schema.
- Treat runtime keying behavior as downstream impact. The API and viewer expose static configuration and do not execute AC.
- When adding evidence, classify it as Structural, FlatInventory, Relationship, Diagnostic, or Raw.
- When a structural node exists, structural hierarchy and disabled state remain authoritative.
- Do not let flat inventory, sequence fallback, search results, or low-confidence relationships override structural evidence.

## Documentation sync requirements

When changing viewer behavior, API payloads, extraction semantics, or inspector sections, update the relevant docs in the same change:

- `README.md` for product boundary and documentation entry points.
- `docs/formworks-editor-ac-reference-guide.md` for durable mental model changes.
- `docs/operator-guide.md` for user-facing inspection workflow.
- `docs/developer-guide.md` for implementation and API semantics.
- `docs/evidence-model.md` and `docs/rule-logic-authority-model.md` for evidence/authority changes.

When editing viewer help or viewer assets, keep root files and template copies synchronized:

- `ac-rule-viewer.html`
- `ac-rule-viewer.css`
- `ac-rule-viewer.js`
- `AcRuleWorkbench.Core/Viewer/ac-viewer-template.html`
- `AcRuleWorkbench.Core/Viewer/ac-viewer-template.css`
- `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js`

## Product API workflow

1. Check server health.
2. Load status.
3. Build or read snapshot.
4. List scopes.
5. Inspect one scope.
6. Inspect one rule.
7. Search evidence.
8. Export a product-safe evidence slice.

```powershell
$base = 'http://127.0.0.1:8787'
Invoke-RestMethod "$base/api/v1/status"
Invoke-RestMethod "$base/api/v1/snapshot"
$scopes = Invoke-RestMethod "$base/api/v1/scopes"
```

## Expanded scope detail

```http
GET /api/v1/scopes/{scopeId}?include=structure,inventory,references,diagnostics
```

## Expanded rule detail

```http
GET /api/v1/rules/{nodeId}?include=subtree,references,diagnostics
```

`{nodeId}` can be either `node-xxxxxx` or a `RuleGuid` value.

```http
GET /api/v1/rules/node-000414
GET /api/v1/rules/db5bf065-618b-44ca-8484-0d12384e7d1a
```

Rule detail should remain a configuration packet. It may include traversal/path information, but it must expose the selected rule as a function instance with fields/parameters, attributes, status-result actions, parent rule/sub-list context, references, diagnostics, and raw backing evidence where available.

## Function and relationship semantics

`AcFunctionCatalog` is the explicit semantic catalog. It now provides seeded function definitions with categories, status-result seeds, parameter roles, behavior flags, runtime-impact notes, and catalog-first relationship classification. Continue expanding it from AC Functions documentation and current FWD evidence.

Preferred classification order:

1. Exact function-schema/catalog match.
2. Known intrinsic/UDF/table/attribute behavior.
3. Parameter role based on known function category.
4. Conservative heuristics.
5. Raw/unknown evidence with clear confidence.

Use `/api/v1/fwd/functions` and `/api/v1/fwd/functions/{name}` when validating function metadata in the product API. Unknown/custom functions should remain visible as observed usage with explicit diagnostics instead of being dropped.

High-value function families to keep distinct:

- Reject functions such as `_IRejectFields`, `_IRejectDoc`, and `IRejectPage`.
- Attribute functions such as `_IGetDocAttr`, `_ISetDocAttr`, `_ITestDocAttr`, page equivalents, and record equivalents.
- Field mutation functions such as `Copy`, `Formatf`, `FormatDate`, `DeleteLines`, `DeleteSpaces`, and related formatting functions.
- Testing functions such as `IsEmpty`, `HasRegExpr`, date/math/table checks, and comparison functions.
- Table and SelectionList functions such as `IsInTable`, `SelectTable`, `SelectSelectedListTableApproxMatch`, `CheckSLState4`, `ClearSL`, and `LogSL`.
- UDF iteration intrinsics such as `_IIterateAllUDF`, `_IIterateOnlyFieldsUDF`, `_IIterateOnlyInstancesUDF`, and dynamic-table variants.

Every relationship should expose target type, relationship kind, parameter name, parameter role, confidence, and evidence. Search hits and token mentions are not dependency proof.

## UDF development target

UDF support should move toward a canonical object model:

- Definition identity and source.
- Named field-list parameters.
- Status results.
- Internal rule tree.
- Caller rules.
- Caller parameter bindings.
- Iteration wrapper usage.
- Diagnostics for unparsed or inferred definitions.

Do not treat a UDF as just another function string when building UI, exports, or API packets.

## Table and SelectionList development target

Table support should separate:

- Canonical table/SelectionList identity.
- Parsed schema, when truly parsed.
- Usage-derived field references.
- Match fields.
- Plug fields.
- Column/plug options.
- Persistent lookup behavior.
- Rerun triggers.
- Runtime keyer impact.

Do not label rule-usage field names as table columns unless schema evidence supports it.

## Live harness validation

Use the debug harness for endpoint-by-endpoint verification:

```powershell
.\scripts\start-workbench.ps1 `
	-FwdPath C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd `
	-Port 8788 `
	-EnableDebugApi `
	-AllowPathQuery `
	-OpenHarness
```

Run automated live validation against the same server:

```powershell
.\scripts\validate-api-live.ps1 -BaseUrl http://127.0.0.1:8788
```

During UI demos, `POST /api/v1/snapshot/refresh` is expected to be the slowest endpoint because it rebuilds cached snapshot state.

If you want to avoid cached snapshot reuse entirely, start in no-cache mode:

```powershell
.\scripts\start-workbench.ps1 -FwdPath C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd -NoSnapshotCache
```

No-cache mode makes snapshot-backed routes rebuild each request and reports readiness from source path validity rather than prior snapshot cache warm-up.

## Error behavior

Product API errors use a consistent envelope with `ok=false`, `error.code`, `error.message`, and `requestId`. Use `requestId` to locate related logs.

## Do not build clients against debug routes

Debug routes are intentionally unstable and hidden by default. Use `/api/v1/openapi.json` as the public contract.
