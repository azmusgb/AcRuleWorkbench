# Runbook: Snapshot Refresh Disabled

Snapshot refresh rebuilds static reader data. It does not run AC rules and does not write to the FWD.

Refresh may be unavailable unless the server was started with a profile/flag that allows it. Use the normal wrapper for local development:

```powershell
.\scripts\start-workbench.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting
```

Refresh uses POST:

```http
POST /api/v1/snapshot/refresh
```

If refresh is still unavailable, restart the companion with a fresh viewer refresh:

```powershell
.\scripts\start-workbench.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting -ForceViewerRefresh
```
