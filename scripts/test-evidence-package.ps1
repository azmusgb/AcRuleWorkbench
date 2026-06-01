[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

if (!(Test-Path $Path)) {
    throw "Evidence package folder was not found: $Path"
}

$required = @(
    "doctor.json",
    "probe.json",
    "inspect.json",
    "ac-rules-flat-inventory.json",
    "ac-tree-structural.json",
    "ac-relationships.json",
    "ac-index.json",
    "ac-diagnostics.json",
    "ac-disabled.json",
    "ac-rule-viewer.html",
        "manifest.json",
    "hashes.sha256.json",
    "validation.json",
    "RECONCILIATION_SUMMARY.json",
        "EVIDENCE_PACKAGE_GUIDE.txt",
    "REVIEWER_CHECKLIST.txt"
)

$failures = New-Object System.Collections.Generic.List[string]

foreach ($name in $required) {
    $file = Join-Path $Path $name
    if (!(Test-Path $file)) {
        $failures.Add("Missing required file: $name") | Out-Null
    }
}

Get-ChildItem -LiteralPath $Path -Filter "*.json" -File | ForEach-Object {
    try {
        $raw = Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8
        if ([string]::IsNullOrWhiteSpace($raw)) {
            throw "File is empty."
        }
        $null = $raw | ConvertFrom-Json
        Write-Host "OK JSON: $($_.Name)"
    }
    catch {
        $failures.Add("Invalid JSON: $($_.Name) - $($_.Exception.Message)") | Out-Null
    }
}

$tree = Join-Path $Path "ac-tree-structural.json"
if (Test-Path $tree) {
    $treeObj = Get-Content -LiteralPath $tree -Raw -Encoding UTF8 | ConvertFrom-Json
    $edges = @($treeObj.Edges)
    $decoded = @($edges | Where-Object { $_.ActionNameResolved -eq $true -or -not [string]::IsNullOrWhiteSpace([string]$_.ActionName) })
    Write-Host "Tree edges: $($edges.Count)"
    Write-Host "Edges with decoded action names: $($decoded.Count)"
}

$reconciliation = Join-Path $Path "RECONCILIATION_SUMMARY.json"
if (Test-Path $reconciliation) {
    $summary = Get-Content -LiteralPath $reconciliation -Raw -Encoding UTF8 | ConvertFrom-Json
    Write-Host "Reconciliation summary: scopes=$($summary.counts.scopeCount), structural=$($summary.counts.structuralRuleNodes), flat=$($summary.counts.flatInventoryRows), unmatchedFlat=$($summary.reconciliation.flatRowsNotMatchedToStructure)"
    if ($null -eq $summary.counts.scopeCount) {
        $failures.Add("RECONCILIATION_SUMMARY.json counts.scopeCount is required; counts.scopes is deprecated.") | Out-Null
    }
    if ($summary.disabledTruthModel.authoritativeSource -ne 'ac-tree-structural.json') {
        $failures.Add("RECONCILIATION_SUMMARY.json must mark ac-tree-structural.json as disabled-state authority.") | Out-Null
    }
    if ($summary.flow.experimental -ne $true) {
        $failures.Add("RECONCILIATION_SUMMARY.json must mark ac-flow.json as experimental.") | Out-Null
    }
}

if ($failures.Count -gt 0) {
    Write-Host "Evidence package validation failed:" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
    exit 1
}

Write-Host "Evidence package validation passed." -ForegroundColor Green
