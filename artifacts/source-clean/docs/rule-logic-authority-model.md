# Rule Logic Authority Model

## Purpose

FW Companion must clearly separate reader authority tiers. This is the core trust model for FormWorks/DCM AC rule inspection.

This authority model is grounded in the FormWorks Editor authoring model:

```text
Rule List
  Rule
    Function
    Fields / Parameters
    Attributes
    Status Results
      Status -> Do Nothing / Reject Fields / Action List / Sub-list
```

Use native Editor terms in user-facing analysis whenever possible: `Rule List`, `Rule`, `Status Result`, `Action List`, `Sub-list`, `Parent Rule`, `Fields / Parameters`, and `Attributes`. Route/path language is secondary and should only explain traversal through parent status-result action mappings.

## Evidence tiers

| Tier | Meaning | Use for |
|---|---|---|
| Structural rule tree | Parsed packed AC rule tree | Hierarchy, parent/child, action sub-lists, structural disabled inheritance |
| Flat rule inventory | Broad extracted rule list | Search, completeness, audit, correlation |
| Relationship report | Classified static references | Field/resource/table/UDF dependency review |
| Flow projection | Flat sequence/skip/action projection | Diagnostics only unless confidence is parsed/proven |
| Generated viewer sidecars | Static export snapshot | Offline review and business/dev distribution |
| Runtime/test evidence | AC Rules Tester, WR/OCR diff, KE/WebKey behavior, production evidence | Actual execution or operator workflow claims |

## Authority rules

1. If a structural node exists, it is authoritative for hierarchy.
2. If a structural node exists, its disabled state is authoritative.
3. Flat inventory rows are not hierarchy proof.
4. Same-scope sequence fallback is audit-only evidence.
5. Flow projections are not runtime execution traces.
6. Relationship matches must expose confidence.
7. Usage-derived table fields are not table schema.
8. UDFs are function-shaped rule lists and need definition/caller context.
9. SelectionList/table functions must preserve lookup configuration separately from rule usage.
10. Static configuration can explain possible runtime impact, but cannot prove branch execution or claim outcome.

## Rule-list handling

| Editor concept | Authority rule |
|---|---|
| Rule List | Structural order is authoritative when parsed from the packed tree. |
| Rule | Treat as a function instance with fields/parameters, attributes, source bindings, status-result actions, and optional reject messages. |
| Status Result | Belongs to the selected rule/function, not to the child rule reached by an action list. |
| Action List / Sub-list | Structural grouping selected by a parent status result; selectable and inspectable, but not a rule. |
| Parent Rule | Owns the incoming status/action label for child rules. |
| UDF | Requires function-resource interface and internal rule tree context where available. |

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
