# AC Rule Workbench

AC Rule Workbench is a local, read-only FW Editor companion for FormWorks / Document Capture Manager Auto Capture configuration. It opens a configured `fwd.cfd` and presents AC-related FWD configuration in a cleaner browser workspace with enhanced search, navigation, and inspection.

FW Editor remains the system of record for authoring, editing, testing, and saving FWD changes. AC Rule Workbench does not write to the FWD and does not simulate AC runtime execution.

## Product boundary

The viewer is intended to represent what is in the FWD:

- Global Definitions: Resources, Tables / SelectionLists, UDFs, Drivers
- Rule Scopes: page and document AC rule scopes
- Rule configuration: function, fields / parameters, attributes, status results, action lists, references, and raw FWD-derived data
- UDF configuration: named parameters, status results, internal rules, caller mappings, and raw data
- Table / SelectionList configuration: configuration, fields / columns, references, and raw data

The viewer intentionally excludes FW Editor write operations:

- no add / delete / move / rename rule operations
- no enable / disable writeback
- no parameter or attribute editing
- no UDF or table editing
- no save back to FWD
- no AC Rules Tester runtime execution

## Build

```powershell
cd C:\dev\AcRuleWorkbench

.\scripts\setup-dcm-deps.ps1

.\scripts\build-and-doctor.ps1 `
  -Configuration Debug `
  -Platform x86 `
  -FwdPath .\fwd.cfd
```

The FormWorks/DCM runtime is x86. Build and run as x86 to avoid AnyCPU/x64 native-load failures.

## Run the local viewer

```powershell
cd C:\dev\AcRuleWorkbench

.\scripts\start-workbench.ps1 `
  -FwdPath .\fwd.cfd `
  -Port 8787 `
  -KillExisting
```

Open:

```text
http://127.0.0.1:8787/viewer?ui=readonly-editor-v62
```

For a cache-busted browser launch:

```powershell
Start-Process msedge "http://127.0.0.1:8787/viewer?ui=readonly-editor-v62&nocache=$([guid]::NewGuid())"
```

## Useful API endpoints

```http
GET  /api/v1/health/live
GET  /api/v1/health/ready
GET  /api/v1/status
GET  /api/v1/snapshot
POST /api/v1/snapshot/refresh
GET  /api/v1/scopes
GET  /api/v1/scopes/{scopeId}?include=structure,inventory,references,diagnostics
GET  /api/v1/rules/{nodeId}?include=subtree,references,diagnostics
GET  /api/v1/search?q=provider
GET  /api/v1/openapi.json
```

Some legacy compatibility/debug routes remain in the codebase for existing callers, but the browser viewer is framed as a read-only FWD configuration viewer.

## Validation

```powershell
.\scripts\build-and-doctor.ps1 `
  -Configuration Debug `
  -Platform x86 `
  -FwdPath .\fwd.cfd
```

Then verify:

```powershell
Select-String -Path .\ac-rule-viewer.html -Pattern "readonly-editor-v62"
Select-String -Path .\ac-rule-viewer.js -Pattern "ac-rule-workbench-v62-fw-editor-readonly"
Invoke-WebRequest "http://127.0.0.1:8787/viewer?ui=readonly-editor-v62" -UseBasicParsing | Select-Object StatusCode, RawContentLength
```

## Documentation

- [Operator Guide](docs/operator-guide.md)
- [Admin Guide](docs/admin-guide.md)
- [Developer Guide](docs/developer-guide.md)
- [API v1 Guide](docs/api-v1.md)
- [Debug API Guide](docs/debug-api.md)
- [Configuration](docs/configuration.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Runbooks](docs/runbooks)
