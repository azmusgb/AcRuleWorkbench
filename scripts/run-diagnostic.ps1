<#
.SYNOPSIS
  Starts AC Rule Workbench in explicit diagnostic/developer mode.

.DESCRIPTION
  Diagnostic mode enables /harness and /api/debug/* and permits request-level
  path overrides. Do not use this mode for normal production inspection.
#>
[CmdletBinding()]
param(
    [string]$FwdPath = "C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd",
    [int]$Port = 8787,
    [string]$Viewer = ".\ac-rule-viewer.html",
    [switch]$KillExisting,
    [switch]$SkipGenerate
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

& (Join-Path $PSScriptRoot "start-workbench.ps1") `
    -FwdPath $FwdPath `
    -Port $Port `
    -Viewer $Viewer `
    -KillExisting:$KillExisting `
    -SkipGenerate:$SkipGenerate `
    -EnableDebugApi `
    -AllowPathQuery `
    -OpenHarness
