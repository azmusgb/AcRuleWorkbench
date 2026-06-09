# FW Editor Viewer

FW Editor Viewer is a local, evidence-first inspection tool for FormWorks / Document Capture Manager Auto Capture rules. It reads a live `fwd.cfd`, extracts structural AC rule evidence, renders a focused Workbench UI, exposes a local `/api/v1` product API, and generates review-ready evidence packages for RCA, audit, regression review, and vendor escalation.

This is the only README in the package. All prior help, FAQ, release notes, setup notes, UI notes, evidence notes, and developer notes have been rolled into this file. Reference data remains only where it is not README material, such as the OpenAPI JSON file and source-code references.

---

## Table of contents

1. Product purpose
2. Requirements
3. First-time setup
4. Build and native validation
5. Start the Workbench
6. UI model
7. Scope model
8. Rule and action-branch model
9. Density, RCA Focus, and high-volume review
10. Inspector model
11. Search model
12. Export and reviewer reports
13. Evidence trust model
14. Evidence package generation
15. Evidence package validation
16. API v1
17. API harness and debug API
18. Script reference
19. Development map
20. Quality checks
21. Troubleshooting
22. FAQ
23. Release acceptance checklist
24. Final interpretation rules

---

## 1. Product purpose

Use FW Editor Viewer to answer a narrow set of reviewer questions:

```text
Where am I?
What scope am I inspecting?
What structural rule is selected?
What parent action branch leads to it?
What action branches does it own?
What fields, sources, attributes, parameters, references, or diagnostics are linked?
What is proven structurally?
What is flat inventory only?
What is experimental or not proven?
Can I copy/export that evidence?
```

The core rule is: **show evidence before interpretation**.

The Workbench must not imply runtime execution, live claim behavior, or business intent unless extracted evidence supports that statement. It is an inspection and evidence tool, not a runtime simulator.

---

## 2. Requirements

Required environment:

```text
Windows
Windows PowerShell 5.1 or later
Visual Studio or Build Tools with MSBuild support for .NET Framework 4.8
x86 build target
Readable FormWorks/DCM fwd.cfd file
Local FormWorks/DCM managed wrapper DLLs
Local FormWorks/DCM native runtime DLLs
```

Expected managed assemblies:

```text
rribase_net.dll
rrifwd_net.dll
rridc_net.dll
rriwf2_net.dll
FormWorks.Core.dll
FormWorks.Versioning.dll
```

Expected native DLLs:

```text
rribase.dll
rrifwd.dll
rridc.dll
rriwf2.dll
```

The solution is intentionally x86 because the FormWorks/DCM runtime in this environment is x86.

---

## 3. First-time setup

From the repository root:

```powershell
cd C:\dev\AcRuleWorkbench

.\scripts\setup-dcm-deps.ps1
```

The setup script locates/copies managed wrapper assemblies into `lib/` and writes a generated runtime-path helper script.

Do not commit proprietary DLLs.

The `lib/` folder is for local dependency staging only. `lib/DLL_DEPENDENCIES.txt` documents the expected DLL set.

---

## 4. Build and native validation

Run:

```powershell
.\scripts\build-and-doctor.ps1
```

Expected result:

```text
Build succeeded.
0 Warning(s)
0 Error(s)
Native checks passed: True
```

The doctor step verifies process bitness, managed wrapper loading, native checker classes, and expected native imports.

For stricter local validation:

```powershell
.\scripts\test-code-quality.ps1
.\scripts\build-and-doctor.ps1 -RunQualityChecks
```

---

## 5. Start the Workbench

Start the local Workbench server:

```powershell
.\scripts\start-workbench.ps1 `
  -FwdPath "C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd" `
  -Port 8787 `
  -KillExisting
```

Open:

```text
http://127.0.0.1:8787/viewer
```

API harness:

```text
http://127.0.0.1:8787/harness
```

Debug API is enabled by default in the current local engineering line. Disable it for a product-only/server-style run:

```powershell
.\scripts\start-workbench.ps1 `
  -FwdPath "C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd" `
  -Port 8787 `
  -KillExisting `
  -DisableDebugApi
```

---

## 6. UI model

The Workbench UI is intentionally narrow:

```text
Top bar
Scope navigator
Structure tree
Inspector
Export builder
Reviewer report generator
Help
Theme
Density
RCA Focus
```

The center workspace is always the structural tree. Inventory, references, diagnostics, raw/source evidence, reports, and audit details are surfaced through search, inspector sections, exports, and evidence packages instead of broad center tabs.

This keeps the product focused on the real workflow:

```text
Scope -> Structure -> Rule -> Action branch -> Evidence inspector -> Copy/export/report
```

---

## 7. Scope model

A scope is the inspection boundary.

Examples:

```text
AC/Pages/DentalADA
AC/Pages/General
AC/Documents/Dental_Doc
AC/System
```

Selecting a scope changes:

```text
active structure tree
scope summary
search context
inspector scope summary
exports/reports
selected rule/action state
```

The scope navigator groups scopes by kind:

```text
Pages
Documents
Batches
System / Other
```

Scope rows should emphasize meaningful evidence counts and exception states. Zero-value noise should remain quiet.

Good scope row information:

```text
DentalADA
AC/Pages/DentalADA
4,196 structural rules
4,863 inventory rows
24,546 references
186 flat-only rows
```

Avoid repeating normal states like:

```text
0 warnings
healthy
enabled
```

---

## 8. Rule and action-branch model

The structural model is:

```text
Rule
  Action branch
    Child rule
    Child rule
```

A rule can own multiple outgoing action branches. A child rule usually has one incoming route because it sits under one parent action.

Correct interpretation:

```text
Parent rule
  Action: Yes
    Child reached via Yes
  Action: No
    Child reached via No
```

Incorrect interpretation:

```text
Child has Yes and No
```

The parent owns the Yes/No/Match/Reject/etc. branches.

### Expansion behavior

Expanding a rule shows its action branches only:

```text
[-] Parent rule
    [+] Action: Yes
    [+] Action: No
```

Expanding an action branch shows only the child rules under that branch:

```text
[-] Parent rule
    [+] Action: Yes
    [-] Action: No
        Child rule
        Child rule
```

Action branch rows are structural grouping rows. They are selectable and inspectable, but they are not rules. They are not runtime decisions. They represent parent action-list routing evidence.

---

## 9. Density, RCA Focus, and high-volume review

The viewer supports two density modes.

### Standard density

Use Standard density for:

```text
walkthroughs
demos
onboarding
slower visual review
lower visual strain when explaining the model
```

### High density

Use High density for:

```text
long RCA sessions
large scopes
rapid scanning
high-volume structural review
```

Density changes visual spacing only. It does not change extraction, evidence, routing, disabled-state authority, export behavior, or API behavior.

### RCA Focus

RCA Focus is a visual triage mode. It emphasizes:

```text
selected path
complex branches
hotspots
disabled rules
diagnostics
route-related issues
```

It de-emphasizes lower-priority rows.

RCA Focus is not a runtime simulator. It does not prove that a branch was taken on a live claim.

---

## 10. Inspector model

The inspector is the primary evidence surface.

For a selected rule, it can show:

```text
Summary
Structural route
Outgoing branches
Parameters
References
Diagnostics
Evidence
Raw/source JSON
```

For a selected action branch, it can show:

```text
Parent rule
Branch label
Action index
Route state
Child rules
Branch references
Branch diagnostics
Copy branch path
Copy branch evidence
Export branch subtree
```

For a selected scope, it can show:

```text
Scope counts
Routing health
Reconciliation summary
Disabled-state summary
Diagnostic summary
Reviewer guidance
```

### Trust strip

The inspector trust strip should quickly answer:

```text
Is this structural?
Is the route label resolved?
What is the disabled-state authority?
Is flat inventory correlated?
Are references linked?
Are diagnostics linked?
Was runtime simulated? No.
```

Use evidence wording, not marketing wording.

Good:

```text
Route label resolved
No disable evidence
Structural authority
Flat correlated
Runtime not simulated
```

Avoid:

```text
Perfect
Safe
Executed
Actual path
```

---

## 11. Search model

Global search supports plain text and operators.

Examples:

```text
action:"Run Rules"
route:"No - Run normal rules"
function:_IGetDocAttr
fn:CheckPageNum
field:ProviderNPI
target:EDIIndicator
has:disabled
has:diagnostic
children>20
scope:DentalADA
guid:6df7
flatonly:true
```

Search should match:

```text
scope name
scope ID
rule name
function name
rule GUID
field target
table/source target
attribute target
incoming action label
outgoing action label
diagnostic message/category
disabled state
```

Search result clicks should:

```text
activate the result scope
open required ancestor rules
open required ancestor action branches
scroll the target row into view
select the target
populate the inspector
```

A search hit is not automatically a dependency. Relationship confidence and evidence class matter.

---

## 12. Export and reviewer reports

The Export builder supports product-safe JSON exports with provenance.

Common targets:

```text
Selected rule evidence
Selected route path
Selected action branch
Selected branch subtree
Selected rule subtree
Current scope diagnostics
Full scope packet
```

Exports should include:

```text
export timestamp
snapshot ID
FWD path
API version
scope ID
node ID or branch ID when relevant
evidence class
not-proven caveats
payload
```

The Report generator creates Markdown summaries for a selected scope, rule, or action branch. Reports retain caveats such as:

```text
Runtime execution was not simulated.
Flow/projection is experimental / low-confidence.
Flat inventory does not override structural disabled authority.
```

### Copy actions

Use the copy actions differently:

```text
Copy route path      readable route for tickets/RCA notes
Copy evidence        structured JSON evidence packet
Copy branch path     branch-specific route
Copy branch evidence branch-specific evidence packet
```

---

## 13. Evidence trust model

### Structural tree

Authority for:

```text
rule hierarchy
parent/child relationships
branch order
action routing
disabled inheritance
```

### Flat inventory

Supports:

```text
broad search
completeness review
duplicate/flat-only reconciliation
function/parameter inventory
```

Does not prove:

```text
runtime order
structural route
branch execution
disabled-state authority when structural evidence exists
```

### References

Relationship evidence for:

```text
fields
sources
tables
attributes
parameters
options
reject codes
messages
```

Confidence and runtimeDependency flags matter.

### Diagnostics

Reviewer cautions and extraction/reconciliation warnings. Diagnostics should be checked before drawing strong conclusions.

### Flow / projection

Experimental and low-confidence. Use for triage only. It is not native runtime execution proof.

---

## 14. Evidence package generation

Generate a complete evidence package:

```powershell
.\scripts\new-evidence-baseline.ps1 `
  -FwdPath "C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd" `
  -RequireNativeOk `
  -Zip
```

Expected evidence package contents:

```text
doctor.json
probe.json
inspect.json
ac-rules-flat-inventory.json
ac-tree-structural.json
ac-relationships.json
ac-index.json
ac-diagnostics.json
ac-disabled.json
ac-flow.json
RECONCILIATION_SUMMARY.json
ac-rule-viewer.html
ac-viewer-export.json
openapi.json
EVIDENCE_PACKAGE_GUIDE.txt
REVIEWER_CHECKLIST.txt
manifest.json
hashes.sha256.json
validation.json
COMMAND_LOG.json
```

`manifest.json` and `hashes.sha256.json` intentionally self-exclude to avoid recursive self-reference. The package first inventories and hashes generated evidence files, then writes the manifest and hash files.

---

## 15. Evidence package validation

Validate a generated evidence package:

```powershell
.\scripts\test-evidence-package.ps1 `
  -Path ".\evidence\R1-fwd-YYYYMMDD-HHMMSS"
```

Validation checks:

```text
required files exist
JSON files parse
RECONCILIATION_SUMMARY.json has current schema
structural disabled state is authoritative
ac-flow.json is marked experimental
action-routing fields are present
```

---

## 16. API v1

Primary product API routes:

```text
GET  /api/v1/status
GET  /api/v1/snapshot
GET  /api/v1/scopes
GET  /api/v1/scopes/{scopeId}
GET  /api/v1/scopes/{scopeId}/structure
GET  /api/v1/scopes/{scopeId}/inventory
GET  /api/v1/scopes/{scopeId}/references
GET  /api/v1/scopes/{scopeId}/diagnostics
GET  /api/v1/rules/{nodeId}
GET  /api/v1/rules/{nodeId}/subtree
GET  /api/v1/search
POST /api/v1/export
GET  /api/v1/openapi.json
GET  /api/v1/routes
GET  /api/v1/capabilities
GET  /api/v1/health/live
GET  /api/v1/health/ready
```

OpenAPI reference:

```text
docs/openapi/ac-workbench-api-v1.openapi.json
```

### Response envelope

Success responses use a stable envelope:

```json
{
  "ok": true,
  "schema": "AcWorkbench.ScopeStructure",
  "schemaVersion": "1.0.0",
  "snapshotId": "fwd-...",
  "data": {}
}
```

Error responses use a stable error envelope:

```json
{
  "ok": false,
  "error": {
    "code": "ScopeNotFound",
    "message": "Scope was not found.",
    "detail": "No scope exists with the supplied ID.",
    "correlationId": "req-..."
  }
}
```

Important error codes:

```text
InvalidRequest
MethodNotAllowed
SnapshotNotLoaded
RefreshDisabled
DebugApiDisabled
FwdPathRequired
FwdOpenFailed
NativeRuntimeUnavailable
ScopeNotFound
RuleNotFound
InvalidCursor
UnsupportedExportFormat
RouteNotFound
UnhandledServerError
```

---

## 17. API harness and debug API

The API harness is available by default in the current local engineering profile:

```text
http://127.0.0.1:8787/harness
```

Debug API is also enabled by default unless disabled explicitly.

Debug routes include:

```text
/api/probe
/api/doctor
/api/inspect
/api/ac/*
/api/stc-process
/api/fwd/raw/stc/{nodeId}
/api/debug/*
```

Debug routes are not product contracts. Do not use raw STC, parser-debug, flow-debug, or legacy `/api/fwd/*` routes as UI truth unless explicitly labeled as debug/evidence support.

Disable debug API:

```powershell
.\scripts\start-workbench.ps1 `
  -FwdPath "C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd" `
  -Port 8787 `
  -KillExisting `
  -DisableDebugApi
```

---

## 18. Script reference

Common local workflow:

```powershell
.\scripts\setup-dcm-deps.ps1
.\scripts\test-code-quality.ps1
.\scripts\build-and-doctor.ps1 -RunQualityChecks
.\scripts\start-workbench.ps1 -FwdPath "C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd" -Port 8787 -KillExisting
.\scripts\test-api-v1.ps1 -BaseUrl http://127.0.0.1:8787
```

Evidence workflow:

```powershell
.\scripts\new-evidence-baseline.ps1 -FwdPath "C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd" -RequireNativeOk -Zip
.\scripts\test-evidence-package.ps1 -Path ".\evidence\R1-fwd-YYYYMMDD-HHMMSS"
```

Direct CLI examples:

```powershell
.\AcRuleWorkbench\bin\x86\Debug\net48\AcRuleWorkbench.exe doctor --json
.\AcRuleWorkbench\bin\x86\Debug\net48\AcRuleWorkbench.exe probe --json
.\AcRuleWorkbench\bin\x86\Debug\net48\AcRuleWorkbench.exe inspect --path "C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd" --json
.\AcRuleWorkbench\bin\x86\Debug\net48\AcRuleWorkbench.exe ac-rules --path "C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd" --json
.\AcRuleWorkbench\bin\x86\Debug\net48\AcRuleWorkbench.exe ac-tree --path "C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd" --json
.\AcRuleWorkbench\bin\x86\Debug\net48\AcRuleWorkbench.exe ac-viewer --path "C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd" --out ".\ac-rule-viewer.html"
```

---

## 19. Development map

Primary UI file:

```text
AcRuleWorkbench.Core\Viewer\ac-viewer-template.html
```

API harness UI:

```text
AcRuleWorkbench\ApiHarness\api-harness.html
```

HTML generation/injection:

```text
AcRuleWorkbench.Core\FormWorksExtractionClient.cs
```

Viewer route/API server:

```text
AcRuleWorkbench\WorkbenchApiServer.cs
```

API v1 service:

```text
AcRuleWorkbench\Api\V1\WorkbenchApiService.cs
```

OpenAPI builder:

```text
AcRuleWorkbench\Api\V1\OpenApiDocument.cs
```

Structural parser:

```text
AcRuleWorkbench.Core\AcStructuralTreeParser.cs
```

Interoperability session wrappers:

```text
AcRuleWorkbench.Core\Interop\FwdSession.cs
AcRuleWorkbench.Core\Interop\SafeFwdHandle.cs
```

---

## 20. Quality checks

Run before packaging or sharing:

```powershell
.\scripts\test-code-quality.ps1
.\scripts\build-and-doctor.ps1 -RunQualityChecks
.\scripts\test-api-v1.ps1 -BaseUrl http://127.0.0.1:8787
```

Quality expectations:

```text
PowerShell scripts parse under Windows PowerShell 5.1
OpenAPI JSON parses
viewer JavaScript syntax checks when Node.js is available
README.md exists
build succeeds
native checks pass
```

---

## 21. Troubleshooting

### Build fails: OpenAPI CS0826

Symptom:

```text
OpenApiDocument.cs(...): error CS0826: No best type found for implicitly-typed array
```

Cause:

```text
Mixed anonymous object arrays in OpenAPI examples.
```

Fix:

```text
Use explicit object[] arrays in OpenApiDocument.cs examples.
```

### AcRuleWorkbench.exe not found

Symptom:

```text
AcRuleWorkbench.exe was not found. Run .\scripts\build-and-doctor.ps1 first.
```

Fix:

```powershell
.\scripts\build-and-doctor.ps1
```

Expected executable:

```text
AcRuleWorkbench\bin\x86\Debug\net48\AcRuleWorkbench.exe
```

### Viewer looks stale

Fix:

```text
Restart the Workbench.
Hard-refresh browser with Ctrl + F5.
Check the viewer marker in DevTools.
```

Current expected marker:

```text
data-ui-build="v35-single-readme"
```

### API harness missing

Check:

```text
http://127.0.0.1:8787/harness
```

If unavailable:

```text
confirm debug API was not disabled
confirm you are running the current renamed AcRuleWorkbench.exe
confirm start-workbench.ps1 points to AcRuleWorkbench.exe, not old DllInteropHarness.exe
```

### Evidence package JSON invalid

Use the script workflow. Avoid manual stdout redirection for large JSON artifacts.

```powershell
.\scripts\new-evidence-baseline.ps1 -FwdPath "C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd" -RequireNativeOk -Zip
```

The script writes JSON directly and validates generated outputs.

### PowerShell parser errors with strange characters

Use current scripts. They are kept ASCII-safe for Windows PowerShell 5.1.

If editing scripts manually, avoid typographic punctuation in executable script text.

### Native checks fail

Check:

```text
process bitness is x86
managed wrapper DLLs are present
native DCM bin path is on PATH
rribase.dll, rrifwd.dll, rridc.dll, and rriwf2.dll are available
```

---

## 22. FAQ

### Is the Workbench proving runtime execution?

No. It proves extracted structure, route labels, branch relationships, disabled inheritance, and static references. It does not simulate native runtime execution or prove that a branch was taken on a live claim.

### Why does a child rule only show one incoming route?

Because a child rule normally sits under one parent action branch. The parent rule owns the outgoing branches.

### Why are action branches selectable if they are not rules?

Because they are important structural routing objects. Selecting them lets you inspect the parent action label, route state, children, diagnostics, references, and branch export evidence.

### Why not show Enabled everywhere?

Enabled is the normal/default state. The tree badges exceptions only: Disabled, Disabled by parent, warnings, unresolved routes, and other reviewer-relevant conditions.

### Why is flat inventory not the hierarchy authority?

Flat inventory is broader extraction/search evidence. It helps with completeness and reconciliation, but the structural tree is the authority for hierarchy, branch order, action routing, and disabled inheritance.

### Why is flow marked experimental?

The flow/projection output is an analytical projection. It is useful for triage, but it is not native runtime execution proof.

### Is the API harness available by default?

Yes in the current local engineering line. It is available at `/harness` unless debug API is disabled.

### Which file defines the main HTML UI?

```text
AcRuleWorkbench.Core\Viewer\ac-viewer-template.html
```

### Which file serves the UI?

```text
AcRuleWorkbench\WorkbenchApiServer.cs
```

### Which file injects generated data into the viewer?

```text
AcRuleWorkbench.Core\FormWorksExtractionClient.cs
```

---

## 23. Release acceptance checklist

Before considering a package ready:

```text
[ ] Exactly one README.md exists in the source package.
[ ] Build succeeds with 0 errors.
[ ] Native doctor checks pass.
[ ] /viewer loads.
[ ] /harness loads when debug API is enabled.
[ ] /api/v1/status returns a valid envelope.
[ ] /api/v1/openapi.json parses.
[ ] DentalADA structure renders.
[ ] Rule expansion shows action branches only.
[ ] Action branch expansion shows only that branch's child rules.
[ ] Action branches are selectable and inspectable.
[ ] Search jump opens ancestor rules and branches.
[ ] Copy route path works.
[ ] Copy evidence works.
[ ] Export builder includes provenance.
[ ] Reviewer report includes caveats.
[ ] Evidence package generation completes.
[ ] Evidence package validation passes.
[ ] Structural disabled state remains authoritative.
[ ] ac-flow.json is marked experimental / low-confidence.
```

---

## 24. Final interpretation rules

Use these rules when reviewing output, writing RCA notes, or sending evidence to a vendor:

```text
Use structural tree evidence for hierarchy, route labels, branch order, and disabled inheritance.
Use flat inventory for search and completeness, not execution order.
Use references as confidence-coded impact evidence.
Use diagnostics as reviewer cautions.
Treat flow/projection as experimental triage only.
Do not show Enabled as a normal tree badge.
Do not let flat disabled evidence override structural disabled authority.
Do not claim runtime execution was simulated.
Do not treat search hits as dependencies.
Do not treat action branches as rules.
Do not treat route labels as observed runtime decisions.
```


