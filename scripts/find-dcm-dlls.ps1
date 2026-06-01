<#
.SYNOPSIS
  Lists DCM managed and native DLL candidates under C:\rri.
#>
[CmdletBinding()]
param(
    [string]$RriRoot = "C:\rri"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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
    Get-ChildItem -Path $RriRoot -Recurse -Filter $dll -File -ErrorAction SilentlyContinue |
        Sort-Object FullName |
        Select-Object FullName, Length, LastWriteTime |
        Format-Table -AutoSize
}
