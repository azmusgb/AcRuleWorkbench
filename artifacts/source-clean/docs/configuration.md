# Configuration

This file covers AC Rule Workbench server configuration. It does not define or edit FormWorks Editor FWD configuration. FormWorks Editor remains the authoring tool for documents, pages, variants, fields, batches, processes, resources, AC rule lists, UDFs, tables, SelectionLists, and process-private STC configuration. See [FormWorks Editor And AC Function Reference](formworks-editor-ac-reference-guide.md) for the FWD/AC mental model.

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

The current CLI accepts these behaviors as flags. Keep production startup scripts explicit rather than relying on request-level path overrides.

## Boundary between server settings and FWD settings

| Setting class | Owned by | Examples |
|---|---|---|
| Workbench server settings | AC Rule Workbench startup/config | URL, debug API, CORS, path-query override, snapshot cache, sensitive-value masking |
| FormWorks process settings | FormWorks Editor FWD | AC Rule DLLs, Default Sources, rejected-document evaluation, ODBC reconnect settings |
| FormWorks resources | FormWorks Editor FWD | Filerefs, Function resources/UDFs, Tables/SelectionLists, DateFormats, RuleDLL resources |
| Runtime/test behavior | FormWorks runtime, AC Rules Tester, KE/WebKey | Actual branch execution, WR/OCR mutation, operator prompts, table lookup outcomes |

Changing Workbench settings changes inspection behavior only. It does not change the FWD and does not change AC runtime behavior.
