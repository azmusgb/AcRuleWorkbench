# Operator Guide

AC Rule Workbench is a read-only FormWorks Editor companion. Read it as a configuration inspection surface, not as a runtime simulator and not as a dashboard. The detailed product model is in [FormWorks Editor And AC Function Reference](formworks-editor-ac-reference-guide.md).

## Primary workflow

1. Start the workbench with `scripts/start-workbench.ps1`.
2. Open `/viewer`.
3. Select a scope from the left pane.
4. Inspect the structural rule tree in the center pane.
5. Select a rule or action list.
6. Review Summary, Function Metadata, Fields / Parameters, Attributes, Status Results / Actions, Parent Rule / Sub-list Path, References, Messages, and Raw sections in the inspector.
7. Export evidence when the selected scope/rule is ready for review.

## Reading the viewer

- A rule list is an ordered list of configured rules.
- A rule is a function instance plus field/source bindings, attributes, status-result actions, and optional rejection messages.
- A rule expands into action lists.
- Action lists expand into child rules.
- Action lists are not rules; they are sub-lists selected by a parent rule status result.
- Status results belong to the parent function. The child rule does not own the incoming Yes/No/Failed/Plugged label.
- Enabled rules are not badged because enabled is the normal state.
- Disabled and inherited-disabled states are shown because they alter interpretation.

Native FormWorks Editor vocabulary should dominate:

| Editor term | Meaning in the viewer |
|---|---|
| Rule List | Ordered rule sequence for the selected scope or UDF |
| Rule | Function plus configuration |
| Status Result | Function return token |
| Action List | Rule sub-list mapped to a status result |
| Sub-list | Nested rule list under a parent rule |
| Parent Rule | Rule that owns the action list |
| Fields / Parameters | Function field lists and configuration parameters |
| Attributes | Function-specific scalar options |

Use route/path wording only as a convenience for explaining how the selected rule was reached.

## Reading a selected rule

For each selected rule, answer these questions in order:

1. What scope am I in: page, document, batch, system, UDF, Store, or other process context?
2. What parent rule and status result lead to this rule?
3. What function is configured?
4. Is the function intrinsic, UDF, testing, formatting, rectifying, table/SelectionList, Store, custom/Tcl, or deprecated?
5. What fields, sources, filerefs, parameters, and attributes are bound?
6. What status results/actions are configured?
7. Does the rule reject fields/documents/pages, mutate fields, read/write attributes, use a table, or call a UDF?
8. Are references high-confidence catalog matches or heuristic evidence?
9. Are diagnostics/messages present that limit interpretation?
10. Does Raw confirm what the formatted inspector says?

## UDFs

Treat UDFs as reusable rule-list functions, not as ordinary single-step functions.

- UDFs have named field-list parameters.
- UDFs expose status results back to caller rules.
- UDFs can contain internal rules that should be reviewed like page/document rules.
- Caller rules bind concrete page/document fields to the UDF's named parameters.
- Iteration functions such as `_IIterateAllUDF`, `_IIterateOnlyFieldsUDF`, and `_IIterateOnlyInstancesUDF` can call a UDF across multiple fields or instances.

When reviewing a UDF, inspect the interface first, then internal rules, then caller bindings.

## Tables And SelectionLists

Table lookup configuration directly affects operator workflow.

When reviewing table or SelectionList usage, look for:

- SelectionList or table identity.
- Match fields used to find candidate rows.
- Plug fields populated from the selected row.
- Column options and plug behavior.
- Persistence or rerun triggers such as changed-field logic.
- Runtime impact: auto-plugging, lookup prompts, close-match choices, No Good Match, and suspend/override behavior.

Do not treat usage-derived field evidence as parsed table schema unless the UI explicitly labels schema as parsed.

## Runtime impact

The viewer shows static FWD configuration. It can explain likely operator-facing consequences, but it does not execute AC.

Safe wording:

- "This rule is configured to reject fields."
- "This rule writes a document attribute."
- "This SelectionList is referenced by lookup rules."
- "This UDF caller binds these concrete fields to named UDF parameters."

Unsafe wording without runtime/test evidence:

- "This claim will reject."
- "This operator will always see this lookup popup."
- "This field definitely changes at runtime."
- "This branch executed."

Use AC Rules Tester, KE/WebKey behavior, WR/OCR diffs, or production runtime evidence when the question is about actual execution.

## Trust rules

- Use Structure for hierarchy, order, routing, and disabled inheritance.
- Use Inventory for broad search and completeness.
- Do not treat flat-only rows as execution-order evidence.
- Do not treat search results as dependency proof.
- Read Diagnostics before using exports for RCA, audit, or vendor escalation.
- Use Raw only as final confirmation when formatted views are incomplete or suspect.
