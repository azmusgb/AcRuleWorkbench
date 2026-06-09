# FW Companion Operator Guide

FW Companion is a read-only inspection surface for FormWorks/FWD configuration. Use it to understand how documents, pages, fields, Rule Lists, UDFs, tables, SelectionLists, functions, and resources are configured.

Use FW Editor for authoring and saving. Use AC Rules Tester, work record analysis, KE/WebKey behavior, or runtime logs when the question is about actual execution.

## Start the companion

Preferred local startup from the repository root:

```cmd
.\start-fw-editor-viewer.cmd
```

Explicit FWD path:

```cmd
.\start-fw-editor-viewer.cmd -FwdPath C:\dev\AcRuleWorkbench\fwd.cfd -Port 8787
```

Open:

```text
http://127.0.0.1:8787/viewer?nocache=v71-product-reset
```

PowerShell equivalent:

```powershell
.\scripts\start-workbench.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

## Primary inspection workflow

1. Select a document, page, processing scope, UDF, table, SelectionList, function, or resource from the left rail.
2. Use the center pane to inspect Rule Lists and nested Action Lists.
3. Select a rule.
4. Read the inspector in this order:
   1. Summary
   2. Function
   3. Fields / Parameters
   4. Attributes
   5. Status Results / Actions
   6. Parent Rule / Sub-list Path
   7. References
   8. Reader Status
   9. Raw, only when formatted views need confirmation
5. Copy the selected configuration summary when documenting a review.

## Reading a rule list

A Rule List is an ordered list of configured rules. Each rule is a function instance with field/source bindings, attributes, possible status results, and actions.

A Parent Rule can route to child Action Lists based on its Status Results:

```text
Parent Rule
  Status Result: OK       -> Action List / Sub-list
  Status Result: Failed   -> Action List / Sub-list
  Status Result: Empty    -> Do Nothing / Reject / Action List
```

Important distinctions:

- The parent function owns the Status Result label.
- An Action List is a configured sub-list, not a rule.
- Child rules do not own the incoming OK/Failed/Yes/No label.
- A selected path explains static configuration; it does not prove that the branch executed for a claim.

## Reading a selected rule

For each selected rule, answer these questions in order:

1. What scope am I in: page, document, batch, UDF, Store, or another process context?
2. Is this a root Rule List item or a child under a Parent Rule / Action List?
3. What function is configured?
4. What function category applies: intrinsic, UDF, testing, formatting, rectifying, table/SelectionList, Store, custom/Tcl, or deprecated?
5. What fields, sources, filerefs, parameters, and attributes are bound?
6. What Status Results / Actions are configured?
7. Does the rule reject fields/documents/pages, mutate fields, read/write attributes, use a table, or call a UDF?
8. Do References show direct configuration usage or broader search/relationship context?
9. Are Reader Status messages present that limit interpretation?
10. Does Raw confirm what the formatted inspector says?

## UDFs

Treat UDFs as reusable Rule Lists, not as ordinary single-step functions.

Review a UDF in this order:

1. Interface name and function identity.
2. Named field-list parameters.
3. Status Results returned by the UDF.
4. Internal Rule List.
5. Caller bindings that map concrete page/document fields into UDF parameters.
6. Reader Status messages.

Iteration functions such as `_IIterateAllUDF`, `_IIterateOnlyFieldsUDF`, and `_IIterateOnlyInstancesUDF` may call a UDF across multiple fields, lines, or instances.

## Tables and SelectionLists

Table and SelectionList configuration can affect operator lookup behavior. Inspect configuration before usage.

Look for:

- table or SelectionList identity
- match fields used to find candidate rows
- plug fields populated from the selected row
- column options and plug behavior
- persistence or rerun triggers such as changed-field logic
- likely operator impact, such as lookup prompts, close-match choices, No Good Match, suspend, or override paths

Do not treat usage-derived field references as parsed table schema unless the UI explicitly labels schema as parsed.

## Reader Status

Reader Status is a secondary status area. It explains load/read conditions that may affect interpretation.

Recommended interpretation:

| Status | Meaning |
|---|---|
| Loaded | The section loaded normally. |
| Partial | The companion loaded useful configuration, but some placement or detail could not be fully confirmed. |
| Message | Review the message before using the configuration summary for RCA, audit, or vendor escalation. |
| Additional Rules | Rules are readable/searchable, but exact Rule List placement is not confirmed. |

Do not treat Reader Status as a normal workflow destination. It is there to keep the read-only view honest.

## Safe and unsafe wording

Safe wording:

- "This rule is configured to reject fields."
- "This rule writes a document attribute."
- "This SelectionList is referenced by lookup rules."
- "This UDF caller binds these concrete fields to named UDF parameters."
- "This rule is visible under Additional Rules, so exact placement is not confirmed."

Unsafe wording without runtime/test confirmation:

- "This claim will reject."
- "This operator will always see this lookup popup."
- "This field definitely changes at runtime."
- "This branch executed."

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `/` or `Ctrl/Command + K` | Focus command search |
| `Alt + I` | Toggle inspector |
| `Alt + C` | Copy selected configuration |
| `Alt + S` | Focus selected subtree |
| `Alt + R` | Reset pane widths |
| `Alt + A` | Expand all visible rules |
| `Alt + D` | Expand selected rule one level |
| `Alt + P` | Collapse selected rule peers |
| `Alt + F` | Clear focus/subtree mode |

## Review checklist

Before using a copied summary in an email, RCA, audit note, or vendor question:

- Confirm the selected scope.
- Confirm whether the rule is in a normal Rule List or Additional Rules.
- Confirm the parent Status Result and Action List, if applicable.
- Confirm function, fields/parameters, attributes, and status actions.
- Check Reader Status.
- Use Raw only when the formatted view seems incomplete or inconsistent.

