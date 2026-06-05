# FormWorks Editor And AC Function Reference

## Purpose

This guide records the working mental model for AC Rule Workbench. The goal is not only to know AC rules. The goal is to understand FormWorks Editor as the authoring surface for the entire FWD configuration model, then understand how AC functions, resources, rule lists, UDFs, tables, fields, documents, pages, variants, and runtime keying behavior connect.

AC Rule Workbench is a read-only companion for that model. FormWorks Editor remains the system of record for authoring, editing, testing, and saving FWD configuration.

## Source Authority

Use this guide as the project baseline, but verify exact names, option values, parameter labels, status results, and runtime behavior against current sources before changing code or making audit claims.

Primary local sources:

- `docs/project-code-catalog.md`
- `docs/editor-gap-closure-plan.md`
- `docs/Administration 2021 Q4 - Editor - CONFIDENTIAL.extracted.txt`
- `docs/rule-logic-authority-model.md`
- `docs/evidence-model.md`
- `docs/operator-guide.md`
- `docs/api-v1.md`
- `AcRuleWorkbench.Core/*`
- `AcRuleWorkbench/Api/V1/*`
- `ac-rule-viewer.rules.json`
- `ac-rule-viewer.tree.json`
- `ac-rule-viewer.rel.json`
- `ac-rule-viewer.js`

Current representative sidecar snapshot in this repo:

| Evidence | Current count |
|---|---:|
| AC scopes | 13 |
| Flat rule rows | 5,924 |
| Structural rule nodes | 4,559 |
| Structural edges | 4,559 |
| Direct-disabled structural rules | 133 |
| Inherited-disabled structural rules | 1,727 |
| Classified relationships | 28,708 |

These counts are snapshot evidence, not product constants.

## Core Mental Model

FormWorks Editor / DCM Editor is a configuration authoring IDE over the FWD/STC model.

| Layer | What it controls | Why it matters |
|---|---|---|
| FWD system model | Documents, pages, page variants, fields, batches, processes, resources | Durable configuration database |
| Page/document design | Page names, variants, field definitions, field containers, page images, FormID, geometry | Defines what data exists and where it lives |
| Processing configuration | AC/DV/Store/process nodes and private process configuration | Defines worker behavior at runtime |
| AC rule model | Rule lists, rules, sub-lists, action lists, status results, rejection messages | Defines rule evaluation flow |
| Function resources | Intrinsic, UDF, Tcl, testing, formatting, rectifying, table, store functions | Defines available operations |
| Runtime UX | KE/WebKey/WebRepair behavior, lookup prompts, rejects, overrides, grid behavior | Shows how configuration becomes operator workflow |

The workbench must not flatten these into generic rows. The workbench should preserve FormWorks Editor vocabulary and expose the configuration model as a read-only inspection surface.

## FWD And STC Object Model

The FWD is the durable configuration database. The STC-backed wrapper and parser surfaces confirm that an accurate model must think in terms of hierarchical configuration objects plus private STC trees, not only exported rule rows.

| Object | Meaning for the workbench |
|---|---|
| Documents | Document definitions, document-level fields, document process configuration, document AC rules |
| Pages | Page definitions, page-level fields, page process configuration, page AC rules |
| Page variants | Graphical variants of a page, FormID, blank/template image, variant-specific FIP/OCR/OMR configuration |
| Fields | Named data locations on pages/documents; used by AC, OCR, FIP, Store, KE/WebKey, and table lookup behavior |
| Batches | Work record groupings and batch-level process configuration |
| Processes | AC, DV, Store, FIP, OCR, Collator, Inventory, KE, KFI, and other worker configuration nodes |
| Resources | Shared definitions such as Fileref, Function, Table, DateFormat, OutputDriver, RuleDLL, StoreDLL |
| Private nodes | STC-backed process/resource configuration not always exposed as simple exported fields |

The workbench should keep this hierarchy visible in wording and navigation:

```text
FWD
  Resources
    Function resources / UDFs
    Tables / SelectionLists
    Filerefs
    Rule DLLs
  Processes
    AC / DV / Store / FIP / OCR / ...
  Pages
    Page
      Variant
      Fields
      Page processing
  Documents
    Document fields
    Document processing
  Batches
    Batch processing
```

## Editor GUI And Navigation Surfaces

The FormWorks Editor GUI has three major areas:

| Area | Role |
|---|---|
| FWD Tree | Navigation and object selection for resources, processes, pages, variants, documents, and batches |
| Configuration Window | Object-specific editor surface; multiple configuration windows can be open at once |
| Message Window | Errors, warnings, and informational messages from open, check configuration, build, or rebuild |

Important editor behavior:

- Many configuration windows save when closed with the window close icon. The lack of an OK/Save button does not imply changes are temporary.
- The FWD Tree can be expanded by component type and object instance.
- Some resources open from the resource folder, while others require expanding the folder and opening a specific resource item.
- The Window menu and `Ctrl+Tab` switch among open configuration windows.
- Configuration messages are part of the authoring experience. Errors can prevent release CFD generation; warnings may still allow a CFD to compile.

The workbench is read-only, but its UX should still feel like an editor companion:

- Left rail: FWD object and scope navigation.
- Center: selected scope or global-definition workspace.
- Right inspector: selected rule, action list, UDF, table, field, reference, or diagnostic details.
- Help and copy/export actions: reviewer support, not editing affordances.

## Editor Authoring Surfaces To Inventory

| Editor surface | What to understand |
|---|---|
| FWD tree | Documents, pages, variants, batches, processes, resources, functions, tables, date formats, field containers |
| Page template view | Page image, field regions, field selection, right-click process entry points |
| Processes panel | AC/DV/FIP/OCR/Store process access from page/document context |
| Rule window | Rule List, Action List, Status Results, Fields/Parameters, Attributes, description panel |
| Resource screens | Function resources, UDF resources, table resources, date formats, rule DLL resources, filerefs |
| Rule editing commands | Add rule, add sub-list, delete, disable, move, drag/drop, replace fields/tables/sources |
| Test tools | AC Rules Tester entry points, input grid, results grid, baseline behavior, WR/OCR diff |

AC rules can be opened from a page by double-clicking AC in the page Processes panel, or by right-clicking the page name in the FWD tree and choosing `Processing -> AC`. Field-level AC references can be reached from the page image by right-clicking a field and choosing `Page Field Processing -> AC`.

## Process Configuration Model

Processes are worker configuration nodes. A process has system-level settings and may also have page, variant, document, batch, or resource-level configuration.

For AC/DV-like processes, the system-level process configuration commonly includes:

- Description.
- Rule DLL selection from `Resources -> RuleDLL`.
- Default source fileref, commonly OCR data such as `OCR_AEG`.
- Whether to evaluate pages of rejected documents.
- ODBC disconnect/reconnect settings when a process uses database connections.

Important AC process guidance:

- Do not treat `acengine.dll` as a normal selectable rule DLL for process-level rule configuration.
- Rule DLLs define the function menu available to AC/Store rule windows.
- Default sources affect where functions read field data unless a rule supplies a more specific source.
- Rejected-document evaluation changes whether AC rules still run on rejected documents and can materially affect downstream workflow.

## Resource Model

Resources are shared configuration objects. They are not merely labels.

| Resource | Why it matters |
|---|---|
| Fileref | Names OCR/image file references such as `OCR_AEG`, `OriginalImage`, `RemovedImage`, `DeskewedImage` |
| Function | Defines UDFs and reusable rule-list logic with named field-list parameters and status results |
| Table / SelectionList | Supplies lookup candidates, match fields, plug fields, and table-driven runtime UX |
| DateFormat | Defines parse/format behavior used by date rules |
| RuleDLL | Makes function packages available to AC/Store rule windows |
| OutputDriver / StoreDLL | Defines Store output behavior and output preparation surfaces |
| Inventory | Defines batch creation, server/client behavior, options, DCN groups, and user attributes |

The workbench should show resource identity first, then rule usage. For tables and UDFs, the resource definition is often more important than the count of references.

## AC Rule Authoring Model

AC evaluates raw machine-generated data in context. Rules can accept, reject, clean, plug, reformat, compare, or route field data. Each rule is a function instance with authored configuration.

Core vocabulary:

| Concept | Meaning |
|---|---|
| Function | Operation called by a rule. Returns one of a fixed set of status results |
| Rule | Function plus field bindings, source bindings, config attributes, and optional rejection messages |
| Rule List | Ordered collection of rules |
| Status Result | Return token from the function, such as OK, Failed, Empty, Plugged, Multiple entries |
| Action List | Per-status-result mapping to Do Nothing, Reject Fields, or a sub-list |
| Sub-list | Nested rule list invoked by a status result |
| Parent Rule | Rule that owns one or more action sub-lists |

The editor model is effectively:

```text
Rule List
  Rule
    Function
    Fields / Parameters
    Attributes
    Status Results
      OK -> Do Nothing / Action List / Sub-list
      Failed -> Reject Fields / Action List / Sub-list
      Other -> Do Nothing / Action List / Sub-list
```

This is not an arbitrary graph. It is an ordered rule-list tree with status-result action mappings.

## Rule Window Anatomy

The AC rule window has distinct authoring surfaces:

| Pane / surface | Role |
|---|---|
| Rule Tree / Rule List | Ordered rules and nested sub-lists |
| Fields / Parameters | Field lists, source bindings, and function-specific parameters |
| Attributes | Function-specific options or scalar configuration values |
| Status Results | Possible return statuses exposed by the selected function |
| Action List | Action chosen for each status result |
| Description | Optional rule/function description when supplied by the function author |

Common rule operations:

- Add rule at the selected insertion point.
- Add sub-list beneath a parent rule.
- Delete rule or sub-list permanently.
- Disable rule without deleting it.
- Move rules or sub-lists up/down.
- Drag/drop rules or sub-lists, with copy/move semantics depending on source/target and modifier keys.
- Replace field, table, or source references across a selected rule, sub-list, or entire rule tree.
- View rule description when the creator supplied one.

Workbench implication: the inspector should not collapse these surfaces into one blob. Fields/Parameters, Attributes, Status Results/Actions, Parent Rule/Sub-list Path, References, and Raw should remain separate sections.

## Action Lists And Status Results

A parent rule owns status results. Each status result can map to an action.

Correct model:

```text
Parent rule
  Status Result: Yes
    Action List: Yes
      Child rule reached through Yes
  Status Result: No
    Action List: No
      Child rule reached through No
```

Incorrect model:

```text
Child rule has Yes and No
```

The child rule does not own the incoming Yes/No. The parent rule owns the status-result action mapping that reaches the child.

Workbench labels may say "route" as a convenience, but the primary vocabulary should be:

- Status Result
- Action List
- Sub-list
- Parent Rule
- Rule List

## Disabled Rules

Disabling a rule causes the AC engine to ignore that rule during evaluation. Deleting is permanent; disabling is reversible in the editor.

Workbench authority rules:

- Structural disabled evidence is authoritative when a structural node exists.
- Direct-disabled means the selected rule has direct disable evidence.
- Inherited-disabled means the selected rule is structurally downstream of a disabled parent.
- Same-scope sequence fallback is audit-only. It must not be presented as proven inherited disabled state.
- Enabled is normal and should not dominate the UI.

## AC Function Categories

The editor and AC guide organize functions into categories. The workbench should classify and present functions category-first where evidence exists.

| Category | Meaning | Workbench treatment |
|---|---|---|
| Intrinsic | Built into the AC engine; handles work record, page/document/record attributes, worker type, KFI, UDF iteration | Show as engine behavior and avoid treating as customer UDF |
| Custom / Tcl | Customer-specific Tcl-backed procedures | Show as custom logic and preserve raw attributes/source evidence |
| User Defined | Function resources implemented as reusable rule lists | Show UDF interface, internal rules, caller bindings, status results |
| Testing | Validates/checks field contents, often without changing data | Show input fields, expected status results, reject/action consequences |
| Formatting | Changes field representation: dates, casing, parsing, copying, deletion, substitutions, line shaping | Show mutation targets and before/after risk |
| Rectifying | Uses OCR confidence or geometry to decide whether characters are accepted/repaired | Show OCR/geometry/confidence implications when known |
| Table | SelectionList, lookup, fuzzy match, plug, and table state functions | Show table identity, match fields, plug fields, persistence, keyer impact |
| Store | Store-template population and output preparation | Show output/template/driver implications |
| Deprecated | Backward-compatible older functions | Flag as warning-worthy when identifiable |

Current high-frequency function evidence in this repo includes `Formatf`, `HasRegExpr`, `IsEmpty`, `_IRejectFields`, `DeleteLines`, `_ISetDocAttrConst`, `CheckSLState4`, `Copy`, `_IIterateAllUDF`, `_IGetDocAttr`, `_ISetDocAttr`, and `SelectSelectedListTableApproxMatch`.

## Function Inspector Target

Each function should eventually be represented with:

- Function name.
- Category.
- DLL/package when known.
- Description when known.
- Parameters and field lists.
- Attributes/options.
- Status results.
- Multiple-field behavior.
- Multiple-instance behavior.
- Multiline behavior.
- OMR support.
- Geometry changes or geometry preservation.
- OCR confidence effects.
- Examples from extracted rules.
- Deprecated state.
- Runtime operator impact.

Known semantic catalog examples already present in source include field mutation/test functions, document/page/record attribute functions, table/SelectionList functions, and reject-related functions. That catalog is intentionally incomplete and should be expanded from the AC Functions guide.

## UDF Model

UDFs are not ordinary scalar functions. They are function-shaped rule lists.

| UDF part | Meaning |
|---|---|
| Named field-list parameters | Real parameter names shown to callers |
| Status results | Return codes exposed back to parent caller rules |
| Internal rule list | Rule tree using parameter placeholders instead of concrete fields |
| Caller bindings | Concrete page/document fields passed into the UDF |
| Iteration wrappers | Intrinsics that call a UDF over field collections or instances |

Key implications:

- UDFs need their own rule tree viewer.
- UDF internal rules should be selectable like page/document rules.
- Caller views should show real UDF parameter names, not generic slots.
- Caller views should show status actions exposed by the UDF.
- UDF field lists are variable at call time; attributes or arbitrary options are not passed the same way.
- Iteration intrinsics such as `_IIterateAllUDF`, `_IIterateOnlyFieldsUDF`, `_IIterateOnlyInstancesUDF`, and dynamic-table variants need special treatment because they define how a UDF is repeatedly invoked.

Preferred UDF caller presentation:

```text
UDF: ValidateSubscriberIdentity
Parameter bindings:
  SubscriberIdFields -> DentalADA.Standard.SubID
  PatientNameFields  -> DentalADA.Standard.PatientFirstName, PatientLastName
  DateFields         -> DentalADA.Standard.PatientDOB
Status actions:
  OK        -> Do Nothing
  NotFound  -> Action List: Lookup failed
  Ambiguous -> Action List: Multiple matches
```

## Table And SelectionList Model

Table lookup UX is one of the strongest bridges between Editor configuration and runtime operator behavior.

SelectionList lookup can be understood as:

1. Decide whether lookup needs to run.
2. Run the lookup.
3. Show candidates to a keyer or plug values into fields.

Workbench table/SelectionList sections should show:

| Section | What to show |
|---|---|
| SelectionList identity | SelectionList name/resource |
| Table source | Table/resource/file identity |
| Match fields | Exact/fuzzy fields used to produce candidate rows |
| Plug fields | Fields populated from selected row |
| Column options | Plug when both have data, plug only if field empty, behavior when table empty |
| Persistence | Persistent lookup enabled/disabled where known |
| Rerun trigger | Changed fields, `HaveFieldsChanged`, `ClearSL`, equivalent evidence |
| Runtime operator impact | Auto-populate, lookup popup, Enter behavior, No Good Match, F6/suspend behavior |

Do not treat usage-derived field lists as parsed table schema. If schema is parsed, label it separately from field usage evidence.

## Runtime User Experience

AC rules create operator work. The workbench must connect static configuration to runtime consequences without pretending to execute AC.

Useful mapping:

```text
Editor config -> AC execution -> WR/OCR mutation -> reject/table/plug result -> KE/WebKey operator experience
```

Runtime areas:

| Runtime area | Editor/AC relationship |
|---|---|
| Rejects | `_IRejectFields`, `_IRejectDoc`, `IRejectPage`, status messages |
| Error-to-error navigation | Driven by rejected fields and rule output |
| Table lookup popups | Driven by SelectionList/table configuration |
| Grid behavior | Field grouping, multiline fields, rows, columns, instances |
| Suspend/override | Whether a rule can be overridden or forces reject |
| KFI/KE/WebKey behavior | Worker type, field rules, page rules, DV/AC interaction |
| Review/sampling | KEReview criteria, critical fields, override-based sampling |

The workbench should speak carefully:

- "This rule is configured to reject fields" is acceptable when supported.
- "This claim will reject at runtime" is not acceptable without runtime execution evidence.
- "This SelectionList is referenced by lookup rules" is acceptable.
- "The operator will always see this popup" requires more specific runtime configuration evidence.

## AC Rules Tester

The AC Rules Tester matters because it exposes rule/function behavior outside normal production flow.

Entry points include:

- Function Resources screen.
- Individual Function screen.
- Page or document Rule List context menu.

Typical tester UI components:

| Component | Purpose |
|---|---|
| Input Grid | Enter values for UDF/function parameters |
| Results Grid | Compare input value, output value, baseline, and result |
| Save | Save test case |
| Run | Execute selected input set |
| Set Baseline | Mark expected values and pass/fail future runs |
| WR/OCR diff | Compare before/after work record and OCR files |

Workbench implication: AC Rule Workbench does not run the Rules Tester, but documentation and UI should acknowledge it as the native way to validate rule behavior. The workbench can inspect static configuration; it cannot replace runtime/test execution.

## Workbench UX Contract

The target product is a desktop-first evidence inspection workbench and read-only FormWorks Editor companion. It is not a generic dashboard.

First-class workbench sections:

- FWD/global definitions.
- Scope navigator.
- Structural rule list/tree.
- Rule inspector.
- UDF inspector.
- SelectionList/table inspector.
- Field resolution.
- Relationship/reference evidence.
- Diagnostics/messages.
- Raw data as final confirmation.
- Copy/export/report workflows.

Selected rule inspector should expose:

- Rule name.
- Enabled/disabled state.
- Function type/category/name.
- Function package/DLL when known.
- Scope: field, page, document, batch, Store, or other known context.
- Parent rule.
- Parent rule list.
- Ordinal.
- Function metadata.
- Fields/parameters with real names and bound fields.
- Source/fileref.
- PageID when document-level evidence exists.
- Field type and multiline/instance behavior when known.
- Attributes with values, meaning/defaults when known, and deprecated/unsupported warnings.
- Status results/actions with target sub-list and reject messages.
- References with confidence.
- Raw exported attributes and STC/config evidence.

## API And Extraction Model

The API and viewer expose static configuration evidence. They do not execute AC.

Stable interpretation:

- `/api/v1/scopes` lists inspection boundaries.
- Scope `structure` is hierarchy/order/action-list evidence.
- Scope `inventory` is broad flat extraction/search/completeness evidence.
- Scope `references` is static relationship evidence.
- Rule detail is a configuration packet for one selected structural node or correlated rule.
- Search finds candidates. Search hits are not dependency proof.

Developer rule: when a structural node exists, preserve its authority for hierarchy and disabled state. Do not let flat inventory, sequence fallback, or generic relationship matches override structural evidence.

## Evidence Classes

| Class | Meaning | Primary use |
|---|---|---|
| Structural | Parsed packed AC rule tree | Hierarchy, order, action-list routing, disabled inheritance |
| FlatInventory | Broad extracted rule inventory | Search, completeness, audit, reconciliation |
| Relationship | Static classified references | Field/resource/table/UDF/attribute impact review |
| Diagnostic | Extraction caveats and trust messages | Review safety and completeness warnings |
| Raw | Last-resort backing payload | Confirmation when formatted views are insufficient |

Prohibited interpretations:

- A search match is not a dependency.
- A flat-only row is not execution-order proof.
- Experimental flow data is not native runtime execution.
- Raw STC shape is not a product contract.
- Usage-derived table fields are not table schema.

## Documentation And Implementation Checklist

When adding a feature, API field, inspector section, or documentation page:

- Use FormWorks Editor vocabulary first.
- Identify the FWD object layer involved.
- Identify whether the evidence is structural, flat inventory, relationship, diagnostic, or raw.
- State whether the behavior is static configuration, tester behavior, or runtime operator behavior.
- Keep UDFs separate from ordinary functions.
- Keep SelectionLists/tables configuration-first.
- Preserve action-list/status-result/sub-list semantics.
- Surface confidence and caveats when relationship extraction is heuristic.
- Avoid implying runtime execution.
- Keep root viewer files and `AcRuleWorkbench.Core/Viewer/*` template copies synchronized when editing in-app help or viewer UI.
