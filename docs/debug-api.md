# Debug API Guide

For current FormWorks Editor, AC function, UDF, SelectionList/table, project-code, and Editor-gap interpretation, use [FormWorks Editor And AC Function Reference](formworks-editor-ac-reference-guide.md), [Project Code Catalog](project-code-catalog.md), and [Editor Gap Closure Plan](editor-gap-closure-plan.md). Debug routes are evidence support only and are not product contracts.

Debug routes are disabled by default. Enable explicitly:

```powershell
AcRuleWorkbench.exe api --path C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd --port 8787 --enable-debug-api --allow-path-query
```

Canonical debug routes:

```http
GET /api/debug/health
GET /api/debug/routes
GET /api/debug/probe
GET /api/debug/inspect
GET /api/debug/stc/processes
GET /api/debug/ac/rules
GET /api/debug/ac/tree
GET /api/debug/ac/relationships
GET /api/debug/ac/flow-debug
```

Debug output is diagnostic evidence only. It is not the public product contract and may change.
