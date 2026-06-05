<#
.SYNOPSIS
  Starts AC Rule Workbench in explicit diagnostic/developer mode.

.DESCRIPTION
  Diagnostic mode enables /harness and /api/debug/* and permits request-level
  path overrides. Do not use this mode for normal production inspection.
#>
[CmdletBinding()]
param(
    [string]$FwdPath = "",
    [int]$Port = 8787,
    [switch]$KillExisting,
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$scriptRoot = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) { $PSScriptRoot } else { Split-Path -Parent $PSCommandPath }
if ([string]::IsNullOrWhiteSpace($FwdPath)) {
    $FwdPath = Join-Path (Split-Path -Parent $scriptRoot) "fwd.cfd"
}

& (Join-Path $PSScriptRoot "start-api.ps1") `
    -FwdPath $FwdPath `
    -Port $Port `
    -KillExisting:$KillExisting `
    -NoOpen:$NoOpen `
    -EnableDebugApi `
    -AllowPathQuery
