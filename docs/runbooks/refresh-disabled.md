# Runbook: Refresh disabled

For current FormWorks/AC interpretation, use [../formworks-editor-ac-reference-guide.md](../formworks-editor-ac-reference-guide.md). Refresh rebuilds static snapshot evidence; it does not run AC rules.

Refresh is disabled unless the server starts with `--allow-refresh`. Use the wrapper:

```powershell
.\scripts\start-workbench.ps1 -FwdPath C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd
```

Refresh must use POST:

```http
POST /api/v1/snapshot/refresh
```
