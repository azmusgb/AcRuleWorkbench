# Operator Guide

## Primary workflow

1. Start the workbench with `scripts/start-workbench.ps1`.
2. Open `/viewer`.
3. Select a scope from the left pane.
4. Inspect the structural rule tree in the center pane.
5. Select a rule or action branch.
6. Review Summary, Route, Branches, Parameters, References, Diagnostics, Evidence, and Raw sections in the inspector.
7. Export evidence when the selected scope/rule is ready for review.

## Reading the viewer

- A rule expands into action branches.
- Action branches expand into child rules.
- Action branches are not rules; they are route groupings from parent status/action labels.
- Enabled rules are not badged because enabled is the normal state.
- Disabled and inherited-disabled states are shown because they alter interpretation.

## Trust rules

- Use Structure for hierarchy, order, routing, and disabled inheritance.
- Use Inventory for broad search and completeness.
- Do not treat flat-only rows as execution-order evidence.
- Do not treat search results as dependency proof.
- Read Diagnostics before using exports for RCA, audit, or vendor escalation.
