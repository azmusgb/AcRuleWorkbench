# FW Companion Developer Guide

FW Companion is the user-facing product. Some code, project, and script names still use `AcRuleWorkbench` or `workbench` for compatibility. Do not let those internal names leak into new user-facing UI or documentation unless they refer to an actual executable, namespace, route, or script.

The durable model is documented in [FormWorks Editor And AC Function Reference](formworks-editor-ac-reference-guide.md). Code inventory is tracked in [Project Code Catalog](internal/project-code-catalog.md). Remaining parity work is tracked in [Editor Gap Closure Plan](internal/editor-gap-closure-plan.md).

## Product rules

- Use FW Editor vocabulary in APIs, UI copy, exports, and docs unless compatibility requires an older name.
- Keep `Rule List`, `Rule`, `Status Result`, `Action List`, `Sub-list`, `Parent Rule`, `Fields / Parameters`, and `Attributes` distinct.
- Treat route/path language as secondary. It can explain traversal, but it must not replace action-list/status-result semantics.
- Treat UDFs as function-shaped Rule Lists with named field-list parameters, status results, caller bindings, and internal rules when the reader can decode them. When unavailable, say so plainly.
- Treat tables and SelectionLists as configuration objects first; usage-derived fields are not parsed schema.
- Treat runtime keying behavior as downstream impact. The API and viewer expose static configuration and do not execute AC.
- Use `Reader Status` for load/read messages.
- Use `Additional Rules` for readable/searchable rules whose exact Rule List placement is not confirmed.
- Do not present parser, fallback, unread-byte, or extraction mechanics as primary product concepts. Keep Object Graph and Runtime Impact behind the explicit `?advanced=1` developer surface.

## Documentation sync requirements

When changing viewer behavior, API payloads, extraction semantics, startup scripts, or inspector sections, update the relevant docs in the same change:

| Change | Update |
|---|---|
| Product boundary, quick start, doc map | `README.md`, `docs/README.md` |
| Viewer inspection workflow | `docs/operator-guide.md`, viewer help modal |
| Startup/deployment/security | `docs/admin-guide.md`, `docs/configuration.md`, `scripts/README.md` |
| API routes or response shape | `docs/api-v1.md`, `docs/openapi/ac-workbench-api-v1.openapi.json` |
| Extraction/reader semantics | `docs/developer-guide.md`, `docs/internal/reader-authority-model.md` |
| FormWorks/FW Editor concepts | `docs/formworks-editor-ac-reference-guide.md` |
| Known failures | `docs/troubleshooting.md`, relevant `docs/runbooks/*` |

When editing viewer assets, keep generated/root and template/source copies synchronized:

- `ac-rule-viewer.html`
- `ac-rule-viewer.css`
- `ac-rule-viewer.js`
- `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.html`
- `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.css`
- `AcRuleWorkbench.Core/Viewer/ac-rule-viewer.js`
- `AcRuleWorkbench.Core/Viewer/ac-viewer-template.html`
- `AcRuleWorkbench.Core/Viewer/ac-viewer-template.css`

## API workflow for development

1. Check health.
2. Load status.
3. Build or read snapshot.
4. List scopes.
5. Inspect one scope.
6. Inspect one rule.
7. Search.
8. Export/copy a product-safe configuration summary.

```powershell
$base = 'http://127.0.0.1:8787'
Invoke-RestMethod "$base/api/v1/status"
Invoke-RestMethod "$base/api/v1/snapshot"
$scopes = Invoke-RestMethod "$base/api/v1/scopes"
```

Expanded scope detail:

```http
GET /api/v1/scopes/{scopeId}?include=structure,inventory,references,diagnostics
```

Expanded rule detail:

```http
GET /api/v1/rules/{nodeId}?include=subtree,references,diagnostics
```

`{nodeId}` can be either `node-xxxxxx` or a `RuleGuid` value.

## Selected-rule packet rules

Rule detail should remain a configuration packet. It may include traversal/path information, but the selected rule must be exposed as:

- scope
- rule identity
- function and function category
- fields/parameters
- attributes
- incoming parent rule and Status Result, when applicable
- outgoing Status Results / Actions
- references
- Reader Status messages
- Raw source data when available

Do not describe the packet as a runtime execution trace.

## Function and relationship semantics

`AcFunctionCatalog` is the explicit semantic catalog. It should provide seeded function definitions with categories, status-result seeds, parameter roles, behavior flags, and static runtime-impact notes.

Preferred classification order:

1. explicit function catalog definition
2. parsed structural rule configuration
3. parsed resource configuration
4. flat rule inventory
5. relationship indexing
6. raw/unknown details with clear confidence

A search hit is not a dependency proof. A table-usage field is not a parsed table schema column. A configured reject rule is not proof of an actual rejected claim.

## Reader Status and Additional Rules in code

Use these terms in product-facing UI:

| Internal concern | Product wording |
|---|---|
| parser diagnostics | Reader Status |
| flat inventory fallback | Additional Rules |
| unplaced rule | Rule without confirmed Rule List placement |
| raw packed payload | Raw |
| extraction confidence | Reader Status detail / relationship confidence, when explicitly shown |

## Test expectations

Run what is available in your local Windows/.NET environment:

```powershell
.\scripts\build-and-doctor.ps1 -FwdPath .\fwd.cfd -Configuration Debug -Platform x86
```

Static viewer checks:

```powershell
node --check .\ac-rule-viewer.js
node --check .\AcRuleWorkbench.Core\Viewer\ac-rule-viewer.js
```

Important MSTest areas:

- viewer asset sync
- product contract language
- API contract shape
- flat inventory reconciliation / Additional Rules
- generated sidecar coverage
- packaging script behavior

## Packaging

Recommended split deliverables:

```powershell
.\scripts\package-split-deliverables.ps1 -Root . -OutDir .\packages
```

Strict source-package validation remains separate:

```powershell
.\scripts\package-source-clean.ps1 -Root . -OutDir .\artifacts
.\scripts\validate-package-boundaries.ps1 -Root .\artifacts\source-clean -Mode SourcePackage
```

## Current semantic validation order

Use this order after changing reader semantics or generated sidecars:

1. Rebuild on Windows/x86 with the native FormWorks runtime.
2. Measure Additional Rules before and after the rebuild:

   ```powershell
   .\scripts\measure-additional-rules.ps1 -TreeJson .\ac-rule-viewer.tree.json
   ```

3. Confirm normal payloads do not ship advanced fields:

   ```powershell
   Select-String -Path .\ac-rule-viewer.fwd.json -Pattern 'objectGraph','runtimeImpact','runtimeImpacts'
   ```

   The command should return no matches for normal deployments.

4. Run viewer behavior tests:

   ```powershell
   npm install
   npm run test:viewer
   ```

5. Run the .NET/MSTest suite on Windows:

   ```powershell
   msbuild .\AcRuleWorkbench.sln /t:Restore,Build /p:Configuration=Debug /p:Platform=x86
   vstest.console.exe .\AcRuleWorkbench.Tests\bin\x86\Debug\AcRuleWorkbench.Tests.dll
   ```

## Standard vs advanced packaging

Normal operator/admin packages should exclude Object Graph and Runtime Impact payloads. Build split packages with:

```powershell
.\scripts\package-fw-companion-deliverables.ps1 -OutputDir .\packages
```

Expected packages:

- `FWCompanion_STANDARD.zip` — normal read-only companion package.
- `FWCompanion_ADVANCED_DIAGNOSTIC_ADDON.zip` — optional engineering add-on for `?advanced=1`.

Do not place the advanced diagnostic add-on in routine operator/admin deployment folders unless engineering review explicitly requires it.
