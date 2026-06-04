# AC Rule Workbench

AC Rule Workbench is a local, read-only FW Editor companion for FormWorks / Document Capture Manager Auto Capture configuration. It opens a configured `fwd.cfd` and presents AC-related FWD configuration in a cleaner browser workspace with enhanced search, navigation, and inspection.

FW Editor remains the system of record for authoring, editing, testing, and saving FWD changes. AC Rule Workbench does not write to the FWD and does not simulate AC runtime execution.

The current product model is documented in depth in [FormWorks Editor And AC Function Reference](docs/formworks-editor-ac-reference-guide.md). Treat that guide as the baseline for future UI, extraction, API, and documentation decisions: FormWorks Editor is the authoring IDE over the FWD/STC model; AC rules are ordered rule-list trees; status results own action lists/sub-lists; UDFs are reusable rule-list functions with named field-list parameters; and table/SelectionList configuration connects static AC rules to KE/WebKey operator workflows.

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

## FormWorks / AC mental model

The workbench should use FormWorks Editor vocabulary before workbench-specific shorthand.

| Native concept | Workbench meaning |
|---|---|
| FWD/STC model | Durable system configuration: documents, pages, variants, fields, batches, processes, resources, and private configuration nodes |
| Rule List | Ordered list of rules in a page, document, UDF, Store, or related configuration scope |
| Rule | Function instance plus field/source bindings, attributes, status-result actions, and optional rejection messages |
| Status Result | Function return token such as OK, Failed, Empty, Plugged, or Multiple entries |
| Action List / Sub-list | Nested rule list selected by a parent rule status result |
| UDF | Function-shaped reusable rule list with named field-list parameters, status results, internal rules, and caller bindings |
| SelectionList / Table | Lookup configuration that can plug field values and drive operator lookup UX |

When reading the viewer, prefer this structure:

```text
Rule List
  Rule
    Function
    Fields / Parameters
    Attributes
    Status Results
      Result -> Do Nothing / Reject Fields / Action List / Sub-list
```

Route/path language is secondary. It helps explain how a selected rule was reached, but the native authoring model is parent rule, status result, action list, and sub-list.

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
GET  /api/v1/fwd/functions
GET  /api/v1/fwd/functions/{name}
GET  /api/v1/fwd/tables
GET  /api/v1/fwd/udfs
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

- [FormWorks Editor And AC Function Reference](docs/formworks-editor-ac-reference-guide.md)
- [Project Code Catalog](docs/project-code-catalog.md)
- [Editor Gap Closure Plan](docs/editor-gap-closure-plan.md)
- [Operator Guide](docs/operator-guide.md)
- [Admin Guide](docs/admin-guide.md)
- [Developer Guide](docs/developer-guide.md)
- [API v1 Guide](docs/api-v1.md)
- [Debug API Guide](docs/debug-api.md)
- [Configuration](docs/configuration.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Runbooks](docs/runbooks)
