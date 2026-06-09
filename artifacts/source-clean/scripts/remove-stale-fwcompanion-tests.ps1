[CmdletBinding()]
param(
    [string] $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

# Also quarantine old active workbench dev launchers that can remain when extracting over older checkouts.
$legacyWorkbenchDir = Join-Path $RepoRoot 'scripts\legacy-workbench'
New-Item -ItemType Directory -Force -Path $legacyWorkbenchDir | Out-Null
foreach ($relative in @('scripts\dev-workbench.ps1', 'scripts\dev-workbench.cmd')) {
    $path = Join-Path $RepoRoot $relative
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        $target = Join-Path $legacyWorkbenchDir (Split-Path $relative -Leaf)
        Move-Item -LiteralPath $path -Destination $target -Force
        Write-Host "[MOVED] stale active launcher $relative -> $target"
    }
}


$testsDir = Join-Path $RepoRoot 'AcRuleWorkbench.Tests'
if (-not (Test-Path -LiteralPath $testsDir)) {
    throw "Missing test project folder: $testsDir"
}

$staleFiles = @(Get-ChildItem -LiteralPath $testsDir -Filter 'FWCompanion*.cs' -File -ErrorAction SilentlyContinue)
$compiledArchive = Join-Path $testsDir 'archive'
$externalArchive = Join-Path $RepoRoot '.archive\stale-fwcompanion-tests'
New-Item -ItemType Directory -Force -Path $externalArchive | Out-Null

if (Test-Path -LiteralPath $compiledArchive) {
    Get-ChildItem -LiteralPath $compiledArchive -Recurse -Filter '*.cs' -File -ErrorAction SilentlyContinue | ForEach-Object {
        $target = Join-Path $externalArchive $_.Name
        Move-Item -LiteralPath $_.FullName -Destination $target -Force
        Write-Host "[MOVED] archived compiled test $($_.Name) -> $target"
    }

    $remaining = @(Get-ChildItem -LiteralPath $compiledArchive -Force -Recurse -ErrorAction SilentlyContinue)
    if ($remaining.Count -eq 0) {
        Remove-Item -LiteralPath $compiledArchive -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if ($staleFiles.Count -eq 0) {
    Write-Host '[OK] No root-level stale FWCompanion test files found.'
    return
}

foreach ($file in $staleFiles) {
    $target = Join-Path $externalArchive $file.Name
    Move-Item -LiteralPath $file.FullName -Destination $target -Force
    Write-Host "[MOVED] $($file.Name) -> $target"
}

Write-Host '[DONE] Stale FWCompanion test files moved outside the compiled test project.'
