# Rule Logic Authority Model

## Purpose

The workbench must clearly separate evidence tiers. This is the core trust model for FormWorks/DCM AC rule inspection.

## Evidence tiers

| Tier | Meaning | Use for |
|---|---|---|
| Structural rule tree | Parsed packed AC rule tree | Hierarchy, parent/child, action sub-lists, structural disabled inheritance |
| Flat rule inventory | Broad extracted rule list | Search, completeness, audit, correlation |
| Relationship report | Classified static references | Field/resource/table/UDF dependency review |
| Flow projection | Flat sequence/skip/action projection | Diagnostics only unless confidence is parsed/proven |
| Generated viewer sidecars | Static export snapshot | Offline review and business/dev distribution |

## Authority rules

1. If a structural node exists, it is authoritative for hierarchy.
2. If a structural node exists, its disabled state is authoritative.
3. Flat inventory rows are not hierarchy proof.
4. Same-scope sequence fallback is audit-only evidence.
5. Flow projections are not runtime execution traces.
6. Relationship matches must expose confidence.
7. Usage-derived table fields are not table schema.

## Disabled-state handling

| State | Meaning | UI treatment |
|---|---|---|
| `Enabled` | No disable evidence | No badge by default |
| `DisabledDirect` | Direct `_Disabled` marker | Red `Disabled` badge |
| `DisabledInherited` | Structural child of disabled rule | Amber `Disabled by parent` badge |
| `PossiblyDisabledInherited` | Parsed/inferred non-sequence disabled evidence | Low/medium confidence warning |
| `PossibleDisabledSequenceOnly` | Same-scope following-rule fallback only | Audit-only; do not present as inherited disabled |

## Recommended reviewer language

Use this wording in exports and reports:

> Structural hierarchy and disabled inheritance are based on parsed AC rule-tree data. Flat inventory and sequence fallback are audit evidence only. Runtime branch execution is not simulated.
