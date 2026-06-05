[CmdletBinding()]
param(
    [string]$FwdPath = "",
    [int]$Port = 8787,
    [string]$HostName = "127.0.0.1",

    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug",

    [string]$Platform = "x86",

    [ValidateSet("viewer-safe", "diagnostic", "full-evidence")]
    [string]$Profile = "viewer-safe",

    [switch]$NoOpen,
    [switch]$KillExisting,
    [switch]$EnableDebugApi,
    [switch]$AllowPathQuery,
    [switch]$EnableCors,
    [switch]$DisableSnapshotCache,
    [switch]$Detached,
    [switch]$NoBuild,
    [switch]$SkipViewerRefresh,
    [string[]]$ExtraArgs = @()
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    $scriptRoot = $PSScriptRoot
}
else {
    $scriptRoot = Split-Path -Parent $PSCommandPath
}
$startWorkbench = Join-Path $scriptRoot "start-workbench.ps1"

if (-not (Test-Path -LiteralPath $startWorkbench -PathType Leaf)) {
    throw "start-workbench.ps1 not found: $startWorkbench"
}

$argsForStart = @(
    "-FwdPath", $FwdPath,
    "-Port", "$Port",
    "-HostName", $HostName,
    "-Configuration", $Configuration,
    "-Platform", $Platform,
    "-Profile", $Profile
)

if ($NoOpen) { $argsForStart += "-NoBrowser" }
if ($KillExisting) { $argsForStart += "-KillExisting" }
if ($EnableDebugApi) { $argsForStart += "-EnableDebugApi" }
if ($AllowPathQuery) { $argsForStart += "-AllowPathQuery" }
if ($EnableCors) { $argsForStart += "-EnableCors" }
if ($DisableSnapshotCache) { $argsForStart += "-DisableSnapshotCache" }
if ($Detached) { $argsForStart += "-Detached" }
if ($NoBuild) { $argsForStart += "-NoBuild" }
if ($SkipViewerRefresh) { $argsForStart += "-SkipViewerRefresh" }
if ($ExtraArgs.Count -gt 0) { $argsForStart += @("-ExtraArgs") + $ExtraArgs }

& $startWorkbench @argsForStart
exit $LASTEXITCODE
