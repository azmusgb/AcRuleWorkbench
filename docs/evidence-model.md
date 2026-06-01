# Evidence Model

## Evidence classes

| Class | Meaning |
|---|---|
| Structural | Parsed rule tree evidence. Use for hierarchy, order, action routing, and disabled inheritance. |
| FlatInventory | Broad extracted rule inventory. Use for search and completeness, not order. |
| Relationship | Static references to fields, attributes, tables, sources, rejects, or messages. Read confidence explicitly. |
| Diagnostic | Trust and extraction caveats. Diagnostics are product evidence, not debug noise. |
| Raw | Last-resort inspection payloads. Do not use as primary UI truth. |

## Prohibited interpretations

- A search match is not a dependency.
- A flat-only row is not runtime-order proof.
- Experimental flow data is not native runtime execution.
- Raw STC shape is not a product contract.
