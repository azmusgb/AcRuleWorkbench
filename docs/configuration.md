# FW Companion Configuration

This file covers FW Companion server configuration. It does not define or edit FormWorks Editor FWD configuration. FormWorks Editor remains the authoring tool for documents, pages, variants, fields, batches, processes, resources, AC rule lists, UDFs, tables, SelectionLists, and process-private STC configuration.

## Recommended defaults

```json
{
  "server": {
    "urls": ["http://127.0.0.1:8787"],
    "enableDebugApi": false,
    "allowPathQuery": false,
    "enableCors": false
  },
  "formworks": {
    "defaultFwdPath": "C:\\rri\\ddce\\configs\\Server\\R1\\fwd\\fwd.cfd",
    "defaultProcessName": "AC",
    "requireNativeRuntime": true
  },
  "snapshot": {
    "cacheEnabled": true,
    "refreshOnStartup": true,
    "maskSensitiveValues": true
  }
}
```

The current CLI accepts these behaviors as flags. Keep startup scripts explicit rather than relying on request-level path overrides.

## Boundary between server settings and FWD settings

| Setting class | Owned by | Examples |
|---|---|---|
| Companion server settings | FW Companion startup/config | URL, debug API, CORS, path-query override, snapshot cache, sensitive-value masking |
| FormWorks process settings | FW Editor FWD | AC rule DLLs, default sources, rejected-document evaluation, ODBC reconnect settings |
| FormWorks resources | FW Editor FWD | Filerefs, Function resources/UDFs, Tables/SelectionLists, DateFormats, RuleDLL resources |
| Runtime/test behavior | FormWorks runtime, AC Rules Tester, KE/WebKey | Actual branch execution, WR/OCR mutation, operator prompts, table lookup outcomes |

Changing companion settings changes inspection behavior only. It does not change the FWD and does not change AC runtime behavior.

## Startup flags worth documenting

| Flag | Use |
|---|---|
| `-FwdPath` | Sets the FWD file to inspect. |
| `-Port` | Sets local HTTP port. |
| `-KillExisting` | Stops a normal process already using the selected port. |
| `-NoAutoPort` | Fails instead of selecting another port. |
| `-SkipBuild` / `-NoBuild` | Skips build after a known-good build. |
| `-SkipViewerRefresh` | Reuses generated viewer artifacts when valid. |
| `-NoBrowser` | Starts API without opening the viewer. |
| `-EnableDebugApi` | Enables engineering-only debug routes. |
| `-AllowPathQuery` | Allows request-level FWD path override; avoid outside diagnostics. |

## Cache notes

The viewer cache key for this package is:

```text
fw-companion-v71-2026-refresh
```

Use `nocache=` query strings while validating visual or sidecar changes:

```text
http://127.0.0.1:8787/viewer?nocache=<guid>
```
