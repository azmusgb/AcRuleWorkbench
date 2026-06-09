# FW Editor AC reference model

The viewer should present AC configuration using FW Editor vocabulary.

## Core terms

| Term | Viewer meaning |
|---|---|
| FWD Tree | Read-only tree of documents, pages, processes, and resources. |
| Rule List | Ordered list of configured rules for a scope. |
| Rule | Function plus configured fields/parameters, attributes, and Status Result actions. |
| Parent Rule | Rule that owns one or more Action Lists/Sub-lists. |
| Status Result | A possible return token from the function. |
| Action List / Sub-list | Child Rule List selected by a parent rule Status Result. |
| Fields / Parameters | Field-list arguments configured for a rule or UDF call. |
| Attributes | Rule configuration attribute list. |
| UDF | User Defined Function resource with field-list parameters, Status Results, and an internal Rule List when available. |
| SelectionList | Table-backed lookup/plug configuration shown separately from ordinary table references. |

## Default layout

```text
FWD Tree | AC Rule List | Rule Properties
```

Rule Properties pages:

```text
General | Fields / Parameters | Attributes | Status Results | Description
```

## Advanced mode

Use `?advanced=1` only for diagnostics/raw packets. The default operator/admin view should not require those surfaces.
