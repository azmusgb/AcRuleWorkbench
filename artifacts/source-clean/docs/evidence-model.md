# Evidence Model

This model supports the broader FormWorks Editor / AC mental model in [FormWorks Editor And AC Function Reference](formworks-editor-ac-reference-guide.md). AC Rule Workbench inspects static FWD configuration. It does not execute AC, run AC Rules Tester, or prove runtime operator outcomes.

## Evidence classes

| Class | Meaning |
|---|---|
| Structural | Parsed rule tree evidence. Use for hierarchy, order, action routing, and disabled inheritance. |
| FlatInventory | Broad extracted rule inventory. Use for search and completeness, not order. |
| Relationship | Static references to fields, attributes, tables, sources, rejects, or messages. Read confidence explicitly. |
| Diagnostic | Trust and extraction caveats. Diagnostics are product evidence, not debug noise. |
| Raw | Last-resort inspection payloads. Do not use as primary UI truth. |

## Editor object evidence

| Object class | Evidence source | Use for |
|---|---|---|
| FWD object model | Documents, pages, variants, batches, processes, resources, private nodes | Navigation and scope/context framing |
| Rule list structure | Structural AC tree | Ordered rule/sub-list hierarchy |
| Function configuration | Structural nodes, flat inventory, raw attributes, semantic catalog | Function name/category, fields/parameters, attributes/options |
| UDF configuration | Function resources, inferred UDF rows, caller relationships | UDF interface, internal rules, status results, caller bindings |
| Table / SelectionList configuration | Resource payloads, table endpoints, relationship usage | Lookup identity, match/plug evidence, runtime-impact review |
| Runtime UX | Manuals, AC Rules Tester evidence, KE/WebKey evidence, WR/OCR diffs | Operator behavior; not inferred from static config alone |

## Confidence expectations

- Structural evidence should be preferred for hierarchy, rule order, action-list routing, and disabled inheritance.
- Relationship evidence must expose confidence, parameter role, and evidence text where available.
- Function catalog matches are stronger than generic parameter heuristics.
- Raw STC/config payloads are evidence support, not a stable public schema.
- Runtime UX conclusions require runtime/test/manual evidence; static rule configuration is not enough.

## Prohibited interpretations

- A search match is not a dependency.
- A flat-only row is not runtime-order proof.
- Experimental flow data is not native runtime execution.
- Raw STC shape is not a product contract.
- Usage-derived table fields are not parsed table schema.
- An action-list path is not proof that the branch executed.
- A configured reject/table/plug rule is not proof of an actual claim outcome.
