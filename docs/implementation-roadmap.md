# Implementation Roadmap

The detailed source inventory is in [Project Code Catalog](project-code-catalog.md). The comprehensive bridge from the current codebase to FormWorks Editor parity is in [Editor Gap Closure Plan](editor-gap-closure-plan.md).

This roadmap follows the product baseline in [FormWorks Editor And AC Function Reference](formworks-editor-ac-reference-guide.md): FW Companion should remain a read-only FormWorks Editor companion with native rule-list/status-result/action-list vocabulary, first-class UDF treatment, configuration-first table/SelectionList inspection, and explicit runtime-UX caveats.

## P0 - correctness

- Structural tree is authoritative for rule hierarchy and disabled inheritance.
- Flat sequence-only disabled state is audit-only.
- Snapshot cache keys include native-strict mode.
- UDF filters use normalized row fields.
- Inspector sections are reachable.
- Viewer and API copy use Editor vocabulary consistently: Rule List, Rule, Status Result, Action List, Sub-list, Parent Rule, Fields / Parameters, Attributes.
- Static configuration is never described as runtime AC execution.
- Canonical rule packets, status-result actions, complete function catalog coverage, and golden selected-rule tests are the next model gap items.

## P1 - semantic model

- Expand the seeded `AcFunctionCatalog` from the AC Functions guide until all observed functions have category, parameter/options schema, statuses, behavior, and runtime-impact evidence.
- Replace generic parameter classification with schema-driven roles.
- Add a canonical rule projection joining structural nodes, flat inventory, relationships, diagnostics, and field resolution.
- Add first-class UDF definition objects with caller/callee graph support.
- Split table resources into canonical table identity, parsed schema, and usage-derived field evidence.
- Keep function category metadata visible through `/api/v1/fwd/functions` and the viewer Functions workspace: Intrinsic, Custom/Tcl, User Defined, Testing, Formatting, Rectifying, Table, Store, Deprecated.
- Model function status results and action-list mappings explicitly.
- Model SelectionList lookup configuration: match fields, plug fields, persistence, rerun triggers, and runtime keyer impact evidence.
- Add a linked FWD object graph for documents, pages, variants, fields, batches, processes, resources, and private nodes.
- Preserve AC Rules Tester as external/runtime validation context rather than pretending the workbench can execute tests.

## P2 - UI/UX

- Left rail: scope/object selection only.
- Center: selected-scope views only.
- Right inspector: selected object details only.
- Hide `Enabled` badges; show exceptions only.
- Make global search and local filtering visually distinct.
- Add virtualized or selected-path-preserving tree rendering.
- Add or keep first-class inspectors for selected rules, action lists, UDFs, tables/SelectionLists, fields, references, diagnostics, and raw backing data.
- Show function metadata, fields/parameters, attributes, status results/actions, parent rule/sub-list path, references, messages, runtime impact, and raw data as separate sections.
- Show UDF internal rules and caller parameter bindings with real UDF parameter names.
- Show table/SelectionList configuration before usage counts.

## P3 - service architecture

- Split `WorkbenchApiService.cs` into query services.
- Build FWD snapshot once; derive rules/tree/relationships/diagnostics from shared extracted data.
- Add route table dispatch for API v1.
- Add live OpenAPI verification tests.
- Add query services around the FormWorks object model: documents, pages, variants, fields, batches, processes, resources, private nodes.
- Separate runtime/test evidence fields from static configuration fields in API contracts.
- Split extraction responsibilities out of `FormWorksExtractionClient.cs` after canonical models are stable.

## P4 - packaging

- Maintain separate package modes:
  - source package
  - runtime package
  - evidence package
- Exclude `.git`, `.vs`, `bin`, `obj`, logs, and local generated temp output from clean packages.
- Include the project code catalog, Editor gap closure plan, and FormWorks Editor reference guide in deliverables intended for maintainers.
