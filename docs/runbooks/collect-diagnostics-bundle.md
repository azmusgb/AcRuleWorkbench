# Runbook: Collect Diagnostic Details

Use this only for local engineering analysis. Diagnostic details support reader troubleshooting; they do not prove runtime AC execution.

1. Start diagnostic mode:

   ```powershell
   .\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting -EnableDebugApi -AllowPathQuery
   ```

2. Capture current status:

   ```http
   GET /api/v1/status
   GET /api/v1/diagnostics
   ```

3. Capture debug probe output if debug routes are enabled:

   ```http
   GET /api/debug/probe
   ```

4. Capture the relevant scope or rule through `/api/v1` first.
5. Include server console output and recent logs if available.
6. In any user-facing summary, translate reader/debug details into Reader Status language.

Do not describe diagnostic/debug output as the product contract.
