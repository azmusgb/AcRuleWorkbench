[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$FwdPath,

    [string]$Configuration = "Debug",
    [string]$Platform = "x86",
    [string]$Process = "AC",
    [string]$OutDir = "",
    [switch]$RequireNativeOk,
    [switch]$SkipBuild,
    [switch]$SkipFlow,
    [switch]$Zip
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$root = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $OutDir = Join-Path $root "evidence\R1-fwd-$stamp"
}

$exe = Join-Path $root "AcRuleWorkbench\bin\$Platform\$Configuration\net48\AcRuleWorkbench.exe"
$commandLog = New-Object System.Collections.Generic.List[object]
$validation = New-Object System.Collections.Generic.List[object]

function Resolve-FullPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "Path cannot be empty."
    }

    # Accept both relative paths and fully-qualified Windows paths.
    # The previous implementation always joined the input to Get-Location,
    # which turned absolute paths such as C:\dev\out into invalid paths like
    # C:\dev\AcRuleWorkbench\C:\dev\out.
    try {
        return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
    }
    catch {
        $base = [System.IO.Directory]::GetCurrentDirectory()
        if ([System.IO.Path]::IsPathRooted($Path)) {
            return [System.IO.Path]::GetFullPath($Path)
        }
        return [System.IO.Path]::GetFullPath((Join-Path $base $Path))
    }
}

function Add-CommandLog {
    param(
        [string]$Name,
        [string]$OutputFile,
        [int]$ExitCode,
        [double]$DurationSeconds,
        [string[]]$Arguments
    )

    $script:commandLog.Add([pscustomobject]@{
        name = $Name
        outputFile = $OutputFile
        exitCode = $ExitCode
        durationSeconds = [Math]::Round($DurationSeconds, 3)
        arguments = $Arguments
        generatedAt = (Get-Date).ToString("o")
    }) | Out-Null
}

function Validate-JsonFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name
    )

    $ok = $false
    $message = "OK"
    try {
        $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
        if ([string]::IsNullOrWhiteSpace($raw)) {
            throw "File is empty."
        }
        $null = $raw | ConvertFrom-Json
        $ok = $true
    }
    catch {
        $message = $_.Exception.Message
    }

    $script:validation.Add([pscustomobject]@{
        name = $Name
        path = $Path
        ok = $ok
        message = $message
    }) | Out-Null

    if (-not $ok) {
        throw "Invalid JSON generated for $Name at $Path. $message"
    }
}

function Invoke-HarnessJson {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$OutputFile
    )

    $fullOut = Resolve-FullPath $OutputFile
    $outParent = Split-Path -Parent $fullOut
    if (!(Test-Path $outParent)) {
        New-Item -ItemType Directory -Force -Path $outParent | Out-Null
    }

    if (Test-Path $fullOut) {
        Remove-Item -Force $fullOut
    }

    $finalArgs = @()
    $finalArgs += $Arguments
    $finalArgs += "--json"
    $finalArgs += "--out-json"
    $finalArgs += $fullOut
    if ($RequireNativeOk) {
        $finalArgs += "--require-native-ok"
    }

    Write-Host "[evidence] $Name -> $fullOut"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    & $exe @finalArgs
    $exit = $LASTEXITCODE
    $sw.Stop()

    Add-CommandLog -Name $Name -OutputFile $fullOut -ExitCode $exit -DurationSeconds $sw.Elapsed.TotalSeconds -Arguments $finalArgs

    if ($exit -ne 0) {
        throw "Command failed for $Name with exit code $exit."
    }
    if (!(Test-Path $fullOut)) {
        throw "Command completed but did not create expected output file for $Name`: $fullOut"
    }

    Validate-JsonFile -Path $fullOut -Name $Name
}

function Copy-IfPresent {
    param([string]$Source, [string]$Destination)
    if (Test-Path $Source) {
        Copy-Item -Force -Path $Source -Destination $Destination
    }
}

function Normalize-EvidenceScopeId {
    param([object]$Value)
    $s = [string]$Value
    if ([string]::IsNullOrWhiteSpace($s)) { return "Unscoped" }
    $s = $s.Trim()
    if ($s -match '^AC/') { return $s }
    if ($s -match '^Pages?/') { return "AC/$s" }
    if ($s -match '^Documents?/') { return "AC/$s" }
    if ($s -match '^Batches?/') { return "AC/$s" }
    return $s
}

function Get-EvidenceScopeId {
    param([object]$Item)
    if ($null -eq $Item) { return "Unscoped" }
    $candidates = @()
    foreach ($name in @('ScopePath','scopeId','ScopeId','ScopeName','name')) {
        if ($Item.PSObject.Properties.Name -contains $name) {
            $candidates += $Item.$name
        }
    }
    foreach ($candidate in $candidates) {
        if (-not [string]::IsNullOrWhiteSpace([string]$candidate)) {
            return Normalize-EvidenceScopeId $candidate
        }
    }
    return "Unscoped"
}

function Get-EvidenceGuid {
    param([object]$Item)
    foreach ($name in @('RuleGuid','ruleGuid')) {
        if ($Item.PSObject.Properties.Name -contains $name) {
            $value = [string]$Item.$name
            if (-not [string]::IsNullOrWhiteSpace($value)) { return $value.Trim().ToLowerInvariant() }
        }
    }
    return ""
}

function Get-EvidenceRuleNameFunctionKey {
    param([object]$Item)
    $name = ""
    $fn = ""
    foreach ($n in @('RuleName','Name','Title')) {
        if ($Item.PSObject.Properties.Name -contains $n -and -not [string]::IsNullOrWhiteSpace([string]$Item.$n)) { $name = ([string]$Item.$n).Trim().ToLowerInvariant(); break }
    }
    foreach ($n in @('FunctionName','Function')) {
        if ($Item.PSObject.Properties.Name -contains $n -and -not [string]::IsNullOrWhiteSpace([string]$Item.$n)) { $fn = ([string]$Item.$n).Trim().ToLowerInvariant(); break }
    }
    if ([string]::IsNullOrWhiteSpace($name) -or [string]::IsNullOrWhiteSpace($fn)) { return "" }
    return "$(Get-EvidenceScopeId $Item)|$name|$fn"
}

function Add-Count {
    param([hashtable]$Map, [string]$Key)
    if ([string]::IsNullOrWhiteSpace($Key)) { $Key = "(blank)" }
    if (-not $Map.ContainsKey($Key)) { $Map[$Key] = 0 }
    $Map[$Key] = [int]$Map[$Key] + 1
}

function Convert-CountMap {
    param([hashtable]$Map)
    return @($Map.GetEnumerator() | Sort-Object -Property @{Expression={$_.Value};Descending=$true}, @{Expression={$_.Key};Descending=$false} | ForEach-Object {
        [pscustomobject]@{ name = [string]$_.Key; count = [int]$_.Value }
    })
}

function Write-ReconciliationSummary {
    param(
        [Parameter(Mandatory = $true)][string]$OutDir,
        [Parameter(Mandatory = $true)][string]$FwdPath,
        [Parameter(Mandatory = $true)][string]$Process
    )

    $treePath = Join-Path $OutDir "ac-tree-structural.json"
    $rulesPath = Join-Path $OutDir "ac-rules-flat-inventory.json"
    $relationshipsPath = Join-Path $OutDir "ac-relationships.json"
    $diagnosticsPath = Join-Path $OutDir "ac-diagnostics.json"
    $flowPath = Join-Path $OutDir "ac-flow.json"

    $tree = Get-Content -LiteralPath $treePath -Raw -Encoding UTF8 | ConvertFrom-Json
    $rules = Get-Content -LiteralPath $rulesPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $relationships = Get-Content -LiteralPath $relationshipsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $diagnostics = Get-Content -LiteralPath $diagnosticsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $flow = $null
    if (Test-Path $flowPath) {
        $flow = Get-Content -LiteralPath $flowPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }

    $treeNodes = @($tree.Nodes)
    $treeEdges = @($tree.Edges)
    $flatRows = @($rules.Rules)
    $rels = @($relationships.Relationships)
    $diags = @($diagnostics.Diagnostics)
    $flowEdges = if ($null -ne $flow) { @($flow.Edges) } else { @() }

    $structuralRuleNodes = @($treeNodes | Where-Object { $_.IsRuleNode -eq $true })
    $structGuidKeys = New-Object 'System.Collections.Generic.HashSet[string]'
    $structNameFunctionKeys = @{}
    $structDisabled = @{}
    $scopeMap = @{}

    foreach ($node in $structuralRuleNodes) {
        $scope = Get-EvidenceScopeId $node
        if (-not $scopeMap.ContainsKey($scope)) {
            $scopeMap[$scope] = [ordered]@{
                scopeId = $scope
                structuralRules = 0
                flatInventoryRows = 0
                flatOnlyRows = 0
                structuralRulesWithoutFlatMatch = 0
                duplicateFlatGuidKeys = 0
                structuralDisabledDirect = 0
                structuralDisabledInherited = 0
                structuralEnabledDefault = 0
                references = 0
                diagnostics = 0
            }
        }
        $scopeMap[$scope].structuralRules++
        $guid = Get-EvidenceGuid $node
        if ($guid) { [void]$structGuidKeys.Add("$scope|$guid") }
        $nf = Get-EvidenceRuleNameFunctionKey $node
        if ($nf) {
            if (-not $structNameFunctionKeys.ContainsKey($nf)) { $structNameFunctionKeys[$nf] = 0 }
            $structNameFunctionKeys[$nf]++
        }
        $disabledState = [string]$node.DisabledState
        if ($disabledState -eq 'DisabledDirect') { $scopeMap[$scope].structuralDisabledDirect++ }
        elseif ($disabledState -eq 'DisabledInherited') { $scopeMap[$scope].structuralDisabledInherited++ }
        else { $scopeMap[$scope].structuralEnabledDefault++ }
    }

    $flatGuidCounts = @{}
    $flatDisabledCounts = @{}
    $flatMatched = 0
    $flatUnmatched = 0
    $matchedStructGuidKeys = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($row in $flatRows) {
        $scope = Get-EvidenceScopeId $row
        if (-not $scopeMap.ContainsKey($scope)) {
            $scopeMap[$scope] = [ordered]@{
                scopeId = $scope
                structuralRules = 0
                flatInventoryRows = 0
                flatOnlyRows = 0
                structuralRulesWithoutFlatMatch = 0
                duplicateFlatGuidKeys = 0
                structuralDisabledDirect = 0
                structuralDisabledInherited = 0
                structuralEnabledDefault = 0
                references = 0
                diagnostics = 0
            }
        }
        $scopeMap[$scope].flatInventoryRows++
        $guid = Get-EvidenceGuid $row
        $guidKey = if ($guid) { "$scope|$guid" } else { "" }
        if ($guidKey) { Add-Count -Map $flatGuidCounts -Key $guidKey }
        $state = if ($row.PSObject.Properties.Name -contains 'DisabledState') { [string]$row.DisabledState } else { '(missing)' }
        Add-Count -Map $flatDisabledCounts -Key $state
        $matched = $false
        if ($guidKey -and $structGuidKeys.Contains($guidKey)) { $matched = $true; [void]$matchedStructGuidKeys.Add($guidKey) }
        elseif ($structNameFunctionKeys.ContainsKey((Get-EvidenceRuleNameFunctionKey $row)) -and $structNameFunctionKeys[(Get-EvidenceRuleNameFunctionKey $row)] -eq 1) { $matched = $true }
        if ($matched) { $flatMatched++ } else { $flatUnmatched++; $scopeMap[$scope].flatOnlyRows++ }
    }

    $duplicateFlatGuidKeys = @($flatGuidCounts.GetEnumerator() | Where-Object { $_.Value -gt 1 })
    $extraDuplicateFlatRows = ($duplicateFlatGuidKeys | ForEach-Object { [int]$_.Value - 1 } | Measure-Object -Sum).Sum
    if ($null -eq $extraDuplicateFlatRows) { $extraDuplicateFlatRows = 0 }
    foreach ($dup in $duplicateFlatGuidKeys) {
        $scope = ([string]$dup.Key).Split('|')[0]
        if ($scopeMap.ContainsKey($scope)) { $scopeMap[$scope].duplicateFlatGuidKeys++ }
    }

    foreach ($key in $structGuidKeys) {
        if (-not $matchedStructGuidKeys.Contains($key)) {
            $scope = ([string]$key).Split('|')[0]
            if ($scopeMap.ContainsKey($scope)) { $scopeMap[$scope].structuralRulesWithoutFlatMatch++ }
        }
    }

    $edgeKinds = @{}
    $actionNamed = 0
    $rootEdges = 0
    $unresolvedActionEdges = 0
    foreach ($edge in $treeEdges) {
        Add-Count -Map $edgeKinds -Key ([string]$edge.EdgeKind)
        $isRoot = ([string]$edge.EdgeKind) -eq 'RootListEntry' -or [int]$edge.ActionListIndex -lt 0
        if ($isRoot) { $rootEdges++ }
        if ($edge.ActionNameResolved -eq $true -or -not [string]::IsNullOrWhiteSpace([string]$edge.ActionName)) { $actionNamed++ }
        elseif (-not $isRoot) { $unresolvedActionEdges++ }
    }

    foreach ($rel in $rels) {
        $scope = Get-EvidenceScopeId $rel
        if ($scopeMap.ContainsKey($scope)) { $scopeMap[$scope].references++ }
    }
    foreach ($diag in @($tree.Diagnostics)) {
        $scope = Get-EvidenceScopeId $diag
        if ($scopeMap.ContainsKey($scope)) { $scopeMap[$scope].diagnostics++ }
    }

    $summary = [ordered]@{
        schema = 'AcWorkbench.ReconciliationSummary'
        schemaVersion = '1.0.0'
        generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        source = [ordered]@{ fwdPath = $FwdPath; process = $Process }
        counts = [ordered]@{
            scopeCount = @($scopeMap.Keys).Count
            structuralNodes = @($treeNodes).Count
            structuralRuleNodes = @($structuralRuleNodes).Count
            structuralEdges = @($treeEdges).Count
            flatInventoryRows = @($flatRows).Count
            relationships = @($rels).Count
            diagnostics = @($diags).Count
            flowEdges = @($flowEdges).Count
        }
        reconciliation = [ordered]@{
            flatRowsMatchedToStructure = $flatMatched
            flatRowsNotMatchedToStructure = $flatUnmatched
            duplicateFlatGuidKeys = @($duplicateFlatGuidKeys).Count
            extraDuplicateFlatRows = [int]$extraDuplicateFlatRows
            structuralRulesWithoutGuidFlatMatch = $structGuidKeys.Count - $matchedStructGuidKeys.Count
            caveat = 'Correlation uses scope+RuleGuid first, then unique scope+rule-name+function fallback. Flat inventory is not execution-order proof.'
        }
        disabledTruthModel = [ordered]@{
            authoritativeSource = 'ac-tree-structural.json'
            authoritativeReason = 'Structural disabled state is derived from the parsed hierarchy and inherited-disabled propagation. Flat disabled state is retained as lower-confidence inventory evidence.'
            structural = [ordered]@{
                direct = @($structuralRuleNodes | Where-Object { $_.DisabledState -eq 'DisabledDirect' }).Count
                inherited = @($structuralRuleNodes | Where-Object { $_.DisabledState -eq 'DisabledInherited' }).Count
                enabledDefault = @($structuralRuleNodes | Where-Object { $_.DisabledState -ne 'DisabledDirect' -and $_.DisabledState -ne 'DisabledInherited' }).Count
            }
            flatInventory = Convert-CountMap $flatDisabledCounts
        }
        actionRouting = [ordered]@{
            structuralEdges = @($treeEdges).Count
            rootListEdges = $rootEdges
            edgesWithResolvedActionName = $actionNamed
            unresolvedNonRootActionEdges = $unresolvedActionEdges
            edgeKinds = Convert-CountMap $edgeKinds
            caveat = 'Root list edges normally have no action label. Non-root unresolved action edges should show action index with unresolved-route wording.'
        }
        flow = [ordered]@{
            present = ($null -ne $flow)
            experimental = $true
            confidence = 'Low'
            reason = 'ac-flow.json is an analytical branch projection. Use structural tree and relationship evidence for authoritative inspection; do not treat flow as native runtime execution.'
            edgeCount = @($flowEdges).Count
        }
        scopes = @($scopeMap.Values | Sort-Object -Property @{Expression='structuralRules';Descending=$true}, @{Expression='flatInventoryRows';Descending=$true}, @{Expression='scopeId';Descending=$false})
    }

    $outPath = Join-Path $OutDir 'RECONCILIATION_SUMMARY.json'
    $summary | ConvertTo-Json -Depth 12 | Out-File -Encoding UTF8 $outPath
    Validate-JsonFile -Path $outPath -Name 'RECONCILIATION_SUMMARY'
}

if (!(Test-Path $FwdPath)) {
    throw "FWD/CFD path was not found: $FwdPath"
}

if (-not $SkipBuild) {
    $buildScript = Join-Path $PSScriptRoot "build-and-doctor.ps1"
    if (Test-Path $buildScript) {
        Write-Host "[evidence] Building harness before evidence export..."
        & $buildScript
        if ($LASTEXITCODE -ne 0) {
            throw "build-and-doctor.ps1 failed with exit code $LASTEXITCODE."
        }
    }
}

if (!(Test-Path $exe)) {
    throw "Harness executable was not found: $exe. Run .\scripts\build-and-doctor.ps1 first."
}

$OutDir = Resolve-FullPath $OutDir
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$viewerPath = Join-Path $OutDir "ac-rule-viewer.html"
$viewerReportPath = Join-Path $OutDir "ac-viewer-export.json"

Invoke-HarnessJson -Name "doctor" -Arguments @("doctor") -OutputFile (Join-Path $OutDir "doctor.json")
Invoke-HarnessJson -Name "probe" -Arguments @("probe") -OutputFile (Join-Path $OutDir "probe.json")
Invoke-HarnessJson -Name "inspect" -Arguments @("inspect", "--path", $FwdPath, "--fields") -OutputFile (Join-Path $OutDir "inspect.json")
Invoke-HarnessJson -Name "ac-rules-flat-inventory" -Arguments @("ac-rules", "--path", $FwdPath, "--process", $Process) -OutputFile (Join-Path $OutDir "ac-rules-flat-inventory.json")
Invoke-HarnessJson -Name "ac-tree-structural" -Arguments @("ac-tree", "--path", $FwdPath, "--process", $Process, "--include-attributes") -OutputFile (Join-Path $OutDir "ac-tree-structural.json")
Invoke-HarnessJson -Name "ac-relationships" -Arguments @("ac-trace", "--path", $FwdPath, "--process", $Process, "--include-rules") -OutputFile (Join-Path $OutDir "ac-relationships.json")
Invoke-HarnessJson -Name "ac-index" -Arguments @("ac-index", "--path", $FwdPath, "--process", $Process) -OutputFile (Join-Path $OutDir "ac-index.json")
Invoke-HarnessJson -Name "ac-diagnostics" -Arguments @("ac-diagnostics", "--path", $FwdPath, "--process", $Process) -OutputFile (Join-Path $OutDir "ac-diagnostics.json")
Invoke-HarnessJson -Name "ac-disabled" -Arguments @("ac-disabled", "--path", $FwdPath, "--process", $Process) -OutputFile (Join-Path $OutDir "ac-disabled.json")
if (-not $SkipFlow) {
    Invoke-HarnessJson -Name "ac-flow" -Arguments @("ac-flow", "--path", $FwdPath, "--process", $Process) -OutputFile (Join-Path $OutDir "ac-flow.json")
}
Invoke-HarnessJson -Name "ac-viewer" -Arguments @("ac-viewer", "--path", $FwdPath, "--process", $Process, "--out", $viewerPath) -OutputFile $viewerReportPath

if (!(Test-Path $viewerPath)) {
    throw "Viewer export did not create expected HTML file: $viewerPath"
}

Write-ReconciliationSummary -OutDir $OutDir -FwdPath $FwdPath -Process $Process

# Source packages intentionally have exactly one README.md. Evidence packages copy only the machine-readable OpenAPI JSON; human guidance is generated below as TXT files to avoid README/MD sprawl.
Copy-IfPresent -Source (Join-Path $root "docs\openapi\ac-workbench-api-v1.openapi.json") -Destination (Join-Path $OutDir "openapi.json")

$evidenceGuide = @"
AC Rule Workbench Evidence Package
==================================

Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
FWD Path: $FwdPath
Process: $Process
Package root: $root
Harness executable: $exe

Purpose
-------
This folder is a review-ready evidence package generated from a FormWorks/DCM FWD configuration. It is intended for audit review, vendor escalation, and regression comparison.

Contents
--------
- doctor.json - runtime/native dependency diagnostics.
- probe.json - managed/native probe output.
- inspect.json - FWD document/page/batch/process inspection.
- ac-rules-flat-inventory.json - broad flat AC rule inventory.
- ac-tree-structural.json - structural hierarchy, parent/child routing, action names, branch path, and disabled inheritance evidence.
- ac-relationships.json - static field/table/source/attribute/reject/reference relationships.
- ac-index.json - semantic index of field, attribute, option, reject, and function usage.
- ac-diagnostics.json - parser/extraction/reconciliation diagnostics.
- ac-disabled.json - direct/inherited disabled analysis.
- ac-flow.json - experimental / low-confidence flow projection when not skipped. It is not native runtime execution proof.
- ac-rule-viewer.html - offline interactive rule viewer.
- ac-viewer-export.json - viewer generation report.
- COMMAND_LOG.json - commands used to create the package.
- validation.json - JSON validation status for generated data files.
- RECONCILIATION_SUMMARY.json - cross-file flat/structural reconciliation, duplicate flat GUIDs, action-routing coverage, and disabled-state truth model.
- EVIDENCE_PACKAGE_GUIDE.txt - this file.
- REVIEWER_CHECKLIST.txt - acceptance checklist for evidence, UI, API, and trust boundaries.
- manifest.json - generated package file manifest.
- hashes.sha256.json - SHA256 hashes for audit/reproducibility. This file and manifest.json are intentionally self-excluded because they are generated after the file inventory is collected.
- openapi.json - API v1 OpenAPI contract, when available.

Recommended review order
------------------------
1. Read this guide.
2. Open RECONCILIATION_SUMMARY.json for structural-vs-flat reconciliation, duplicate flat GUID behavior, action routing coverage, and disabled-state authority.
3. Open ac-rule-viewer.html for interactive inspection.
4. Use ac-tree-structural.json as authority for hierarchy, parent/child route labels, branch order, and structural disabled inheritance.
5. Use ac-rules-flat-inventory.json only for broad search and completeness review.
6. Use ac-relationships.json for static references; confidence and runtimeDependency matter.
7. Treat ac-flow.json as experimental / low-confidence triage only.

Trust rules
-----------
1. Use ac-tree-structural.json for hierarchy, parent/child routing, route labels, branch order, and structural disabled inheritance.
2. Structural disabled state is authoritative. Flat disabled state is retained as lower-confidence inventory evidence and must not override structural direct/inherited disabled state.
3. Use RECONCILIATION_SUMMARY.json for cross-file counts, flat/structural matching, duplicate flat GUID behavior, action-routing coverage, and disabled-state truth rules.
4. Use ac-rules-flat-inventory.json for broad search and extraction coverage. Flat rows are not execution-order proof.
5. Use ac-relationships.json as static reference evidence. Confidence and evidence fields matter.
6. ac-flow.json is experimental / low-confidence. It is a projected analytical view, not native runtime execution proof.
7. Search hits are not dependencies.
8. Business intent is not asserted unless supported by rule name, function, parameters, action route, and relationship evidence.
9. Native runtime execution is not simulated by this package.

Manifest and hash caveat
------------------------
manifest.json and hashes.sha256.json are intentionally self-excluded. The package first inventories and hashes the generated evidence files, then writes the manifest and hash files. This avoids recursive self-reference and keeps the audit records deterministic.

Action routing
--------------
Child-route labels are expected in ac-tree-structural.json on edge fields such as ActionName and ActionNameResolved. Root list entries normally have no action name.

If the Workbench UI shows only an action index, regenerate the viewer from the same package and hard-refresh the browser.
"@
$evidenceGuide | Out-File -Encoding UTF8 (Join-Path $OutDir "EVIDENCE_PACKAGE_GUIDE.txt")

$reviewerChecklist = @"
Reviewer Checklist
==================

Package integrity
-----------------
[ ] Required evidence files are present.
[ ] All JSON files parse.
[ ] COMMAND_LOG.json shows successful commands.
[ ] validation.json shows package validation passed.
[ ] hashes.sha256.json verifies generated evidence files.
[ ] manifest.json and hashes.sha256.json are intentionally self-excluded from their own inventories.

Evidence model
--------------
[ ] ac-tree-structural.json is used for hierarchy/order/routing proof.
[ ] ac-rules-flat-inventory.json is used for broad search/completeness only.
[ ] Structural disabled state is authoritative.
[ ] Flat disabled state is retained only as lower-confidence inventory evidence.
[ ] ac-flow.json is marked experimental / low-confidence wherever referenced.
[ ] Search hits are not treated as dependencies.

Routing and hierarchy
---------------------
[ ] Root list edges are understood as root entries, not action routes.
[ ] Non-root child edges show decoded action names when available.
[ ] Unresolved action labels show action index and unresolved-route wording.
[ ] Selected-rule route path can be copied separately from the full evidence packet.
[ ] Rule expansion shows action branches first.
[ ] Action branch expansion shows only that branch's child rules.

API contract
------------
[ ] openapi.json is present and valid when copied.
[ ] Disabled state, confidence, relationship kind, and route state enums are documented in the API contract.
[ ] Export payloads include provenance and caveats.

UI acceptance
-------------
[ ] ac-rule-viewer.html opens locally.
[ ] The selected-rule inspector focuses on summary, route path, child routing, parameters, and field resolution.
[ ] Action branches are selectable and inspectable.
[ ] Diagnostics and route coverage are reviewed from the Audit workspace only when needed.
"@
$reviewerChecklist | Out-File -Encoding UTF8 (Join-Path $OutDir "REVIEWER_CHECKLIST.txt")

$commandLog | ConvertTo-Json -Depth 12 | Out-File -Encoding UTF8 (Join-Path $OutDir "COMMAND_LOG.json")
$validation | ConvertTo-Json -Depth 12 | Out-File -Encoding UTF8 (Join-Path $OutDir "validation.json")

$files = Get-ChildItem -LiteralPath $OutDir -File | Sort-Object Name
$manifest = $files | Select-Object Name, Length, LastWriteTimeUtc, @{Name="RelativePath";Expression={$_.Name}}
$manifest | ConvertTo-Json -Depth 6 | Out-File -Encoding UTF8 (Join-Path $OutDir "manifest.json")

$hashes = $files | ForEach-Object {
    $hash = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
    [pscustomobject]@{
        file = $_.Name
        algorithm = $hash.Algorithm
        hash = $hash.Hash
        length = $_.Length
    }
}
$hashes | ConvertTo-Json -Depth 6 | Out-File -Encoding UTF8 (Join-Path $OutDir "hashes.sha256.json")

Write-Host "Evidence package written to:"
Write-Host "  $OutDir"

if ($Zip) {
    $zipPath = Resolve-FullPath "$OutDir.zip"
    if (Test-Path $zipPath) {
        Remove-Item -Force $zipPath
    }
    Compress-Archive -Force -Path (Join-Path $OutDir "*") -DestinationPath $zipPath
    Write-Host "Evidence package zip written to:"
    Write-Host "  $zipPath"
}
