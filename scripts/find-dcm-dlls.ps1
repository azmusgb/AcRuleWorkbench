<#
.SYNOPSIS
  Lists FormWorks/DCM managed and native DLL candidates.
#>
[CmdletBinding()]
param(
    [string[]]$SearchRoot = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptRoot = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) { $PSScriptRoot } else { Split-Path -Parent $PSCommandPath }
if (-not $SearchRoot -or $SearchRoot.Count -eq 0) {
    $repoRoot = (Resolve-Path (Join-Path $scriptRoot "..")).Path
    $SearchRoot = @((Join-Path $repoRoot "rri_bin"), "C:\rri")
}

$dlls = @(
    "rribase_net.dll",
    "rrifwd_net.dll",
    "rridc_net.dll",
    "rriwf2_net.dll",
    "FormWorks.Core.dll",
    "FormWorks.Versioning.dll",
    "rribase.dll",
    "rrifwd.dll",
    "rridc.dll",
    "rriwf2.dll"
)

foreach ($dll in $dlls) {
    Write-Host ""
    Write-Host $dll -ForegroundColor Cyan
    $matches = foreach ($root in $SearchRoot) {
        if (Test-Path -LiteralPath $root) {
            Get-ChildItem -Path $root -Recurse -Filter $dll -File -ErrorAction SilentlyContinue
        }
    }
    $matches |
        Sort-Object FullName |
        Select-Object FullName, Length, LastWriteTime |
        Format-Table -AutoSize
}
