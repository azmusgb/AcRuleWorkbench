[CmdletBinding()]
param(
    [string] $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$legacyDir = Join-Path $RepoRoot 'scripts\legacy-workbench'
New-Item -ItemType Directory -Force -Path $legacyDir | Out-Null

$staleActiveScripts = @(
    'scripts\dev-workbench.ps1',
    'scripts\dev-workbench.cmd'
)

foreach ($relative in $staleActiveScripts) {
    $path = Join-Path $RepoRoot $relative
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        $target = Join-Path $legacyDir (Split-Path $relative -Leaf)
        Move-Item -LiteralPath $path -Destination $target -Force
        Write-Host "[MOVED] $relative -> $target"
    }
}

$nestedProjectScripts = Join-Path $RepoRoot 'AcRuleWorkbench\scripts'
if (Test-Path -LiteralPath $nestedProjectScripts -PathType Container) {
    $archiveRoot = Join-Path $RepoRoot 'docs\archive\nested-project-scripts'
    New-Item -ItemType Directory -Force -Path $archiveRoot | Out-Null

    Get-ChildItem -LiteralPath $nestedProjectScripts -File -ErrorAction SilentlyContinue | ForEach-Object {
        $target = Join-Path $archiveRoot $_.Name
        Move-Item -LiteralPath $_.FullName -Destination $target -Force
        Write-Host "[MOVED] AcRuleWorkbench\scripts\$($_.Name) -> $target"
    }

    $remaining = Get-ChildItem -LiteralPath $nestedProjectScripts -Force -ErrorAction SilentlyContinue
    if (-not $remaining) {
        Remove-Item -LiteralPath $nestedProjectScripts -Force -ErrorAction SilentlyContinue
        Write-Host "[REMOVED] empty AcRuleWorkbench\scripts folder"
    }
}

Write-Host '[DONE] Stale active workbench script surfaces are no longer active.'
