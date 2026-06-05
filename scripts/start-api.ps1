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
    [switch]$AllowRefresh,
    [switch]$Detached,
    [switch]$NoBuild,
    [switch]$SkipViewerRefresh,
    [switch]$ForceViewerRefresh,
    [switch]$WaitForReadyBeforeOpen,
    [switch]$NoWaitReady,
    [switch]$NoAutoPort,
    [switch]$SkipRuntimeValidation,
    [switch]$CheckWorkingTree,

    [ValidateRange(1, 200)]
    [int]$PortSearchLimit = 25,

    [ValidateRange(5, 600)]
    [int]$ReadyTimeoutSeconds = 90,

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
    "-Profile", $Profile,
    "-PortSearchLimit", "$PortSearchLimit",
    "-ReadyTimeoutSeconds", "$ReadyTimeoutSeconds"
)

if ($NoOpen) { $argsForStart += "-NoBrowser" }
if ($KillExisting) { $argsForStart += "-KillExisting" }
if ($EnableDebugApi) { $argsForStart += "-EnableDebugApi" }
if ($AllowPathQuery) { $argsForStart += "-AllowPathQuery" }
if ($EnableCors) { $argsForStart += "-EnableCors" }
if ($DisableSnapshotCache) { $argsForStart += "-DisableSnapshotCache" }
if ($AllowRefresh) { $argsForStart += "-AllowRefresh" }
if ($Detached) { $argsForStart += "-Detached" }
if ($NoBuild) { $argsForStart += "-NoBuild" }
if ($SkipViewerRefresh) { $argsForStart += "-SkipViewerRefresh" }
if ($ForceViewerRefresh) { $argsForStart += "-ForceViewerRefresh" }
if ($WaitForReadyBeforeOpen) { $argsForStart += "-WaitForReadyBeforeOpen" }
if ($NoWaitReady) { $argsForStart += "-NoWaitReady" }
if ($NoAutoPort) { $argsForStart += "-NoAutoPort" }
if ($SkipRuntimeValidation) { $argsForStart += "-SkipRuntimeValidation" }
if ($CheckWorkingTree) { $argsForStart += "-CheckWorkingTree" }
if ($ExtraArgs.Count -gt 0) { $argsForStart += @("-ExtraArgs") + $ExtraArgs }

Write-Host "start-api.ps1 delegates to start-workbench.ps1. Use start-workbench.ps1 directly for full launcher options." -ForegroundColor DarkGray
& $startWorkbench @argsForStart
exit $LASTEXITCODE
