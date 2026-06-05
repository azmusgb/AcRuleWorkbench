# Runbook: Collect diagnostics bundle

For interpretation of collected FormWorks/AC evidence, use [../formworks-editor-ac-reference-guide.md](../formworks-editor-ac-reference-guide.md). Diagnostics support static FWD inspection; they do not prove runtime AC execution.

1. Start diagnostic mode with `-EnableDebugApi -AllowPathQuery`.
2. Capture `/api/v1/status`.
3. Capture `/api/v1/diagnostics`.
4. Capture `/api/debug/probe`.
5. Capture relevant scope/rule evidence with `/api/v1/export`.
6. Include server console output and recent logs if available.
