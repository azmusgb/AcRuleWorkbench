# Runbook: Collect diagnostics bundle

1. Start diagnostic mode with `-EnableDebugApi -AllowPathQuery`.
2. Capture `/api/v1/status`.
3. Capture `/api/v1/diagnostics`.
4. Capture `/api/debug/probe`.
5. Capture relevant scope/rule evidence with `/api/v1/export`.
6. Include server console output and recent logs if available.
