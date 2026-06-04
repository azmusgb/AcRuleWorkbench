<#
.SYNOPSIS
  Validates that P0 replacement files are in the expected repository layout before building.
#>
[CmdletBinding()]
param(
    [string]$RepoRoot = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
$expected = @(
    'AcRuleWorkbench.sln',
    'AcRuleWorkbench\AcRuleWorkbench.csproj',
    'AcRuleWorkbench.Core\AcRuleWorkbench.Core.csproj',
    'AcRuleWorkbench\Api\V1\WorkbenchApiService.cs',
    'AcRuleWorkbench\Api\V1\WorkbenchSnapshot.cs',
    'AcRuleWorkbench.Core\AcStructuralTreeParser.cs',
    'ac-rule-viewer.html',
    'ac-rule-viewer.js',
    'ac-rule-viewer.tree.json'
)

$bad = @(
    'AcRuleWorkbench\AcRuleWorkbench.Core\AcStructuralTreeParser.cs',
    'AcRuleWorkbench\AcRuleWorkbench\Api\V1\WorkbenchApiService.cs',
    'AcRuleWorkbench\AcRuleWorkbench\Api\V1\WorkbenchSnapshot.cs'
)

foreach ($rel in $expected) {
    $path = Join-Path $RepoRoot $rel
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Missing expected file: $rel"
    }
}

$foundBad = @()
foreach ($rel in $bad) {
    $path = Join-Path $RepoRoot $rel
    if (Test-Path -LiteralPath $path) {
        $foundBad += $rel
    }
}

if ($foundBad.Count -gt 0) {
    throw "Invalid nested/mis-extracted files found:`n$($foundBad -join [Environment]::NewLine)`nRun .\scripts\repair-p0-misextract.ps1 from the repo root."
}

# Basic source guards for the exact failures reported.
$apiService = Get-Content -LiteralPath (Join-Path $RepoRoot 'AcRuleWorkbench\Api\V1\WorkbenchApiService.cs') -Raw
if ($apiService -match 'node\.DataPreviewText') {
    throw 'WorkbenchApiService.cs still references ResourcePrivateNode.DataPreviewText.'
}
if ($apiService -notmatch 't\.Columns\.Values\.ToList\(\)') {
    throw 'WorkbenchApiService.cs does not contain the corrected TableColumnVm list conversion.'
}

Write-Host '[ok] P0 replacement layout validation passed.'
