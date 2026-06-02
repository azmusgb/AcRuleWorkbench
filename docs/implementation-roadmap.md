# Implementation Roadmap

## P0 — correctness

- Structural tree is authoritative for rule hierarchy and disabled inheritance.
- Flat sequence-only disabled state is audit-only.
- Snapshot cache keys include native-strict mode.
- UDF filters use normalized row fields.
- Inspector sections are reachable.

## P1 — semantic model

- Expand `AcFunctionCatalog` from the AC Functions guide.
- Replace generic parameter classification with schema-driven roles.
- Add a canonical rule projection joining structural nodes, flat inventory, relationships, diagnostics, and field resolution.
- Add first-class UDF definition objects with caller/callee graph support.
- Split table resources into canonical table identity, parsed schema, and usage-derived field evidence.

## P2 — UI/UX

- Left rail: scope/object selection only.
- Center: selected-scope views only.
- Right inspector: selected object details only.
- Hide `Enabled` badges; show exceptions only.
- Make global search and local filtering visually distinct.
- Add virtualized or selected-path-preserving tree rendering.

## P3 — service architecture

- Split `WorkbenchApiService.cs` into query services.
- Build FWD snapshot once; derive rules/tree/relationships/diagnostics from shared extracted data.
- Add route table dispatch for API v1.
- Add live OpenAPI verification tests.

## P4 — packaging

- Maintain separate package modes:
  - source package
  - runtime package
  - evidence package
- Exclude `.git`, `.vs`, `bin`, `obj`, logs, and local generated temp output from clean packages.
