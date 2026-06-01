# Runbook: Refresh disabled

Refresh is disabled unless the server starts with `--allow-refresh`. Use the wrapper:

```powershell
.\scripts\start-workbench.ps1 -FwdPath C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd
```

Refresh must use POST:

```http
POST /api/v1/snapshot/refresh
```
