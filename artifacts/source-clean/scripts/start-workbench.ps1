[CmdletBinding()]
param(
    [string]$FwdPath = "",
    [int]$Port = 8787,
    [string]$HostName = "127.0.0.1",
    [ValidateSet("Debug", "Release")][string]$Configuration = "Debug",
    [string]$Platform = "x86",
    [ValidateSet("viewer-safe", "diagnostic", "full-evidence")][string]$Profile = "viewer-safe",
    [switch]$KillExisting,
    [switch]$NoBuild,
    [switch]$Clean,
    [switch]$NoBrowser,
    [switch]$NoOpenWhenReady,
    [switch]$WaitForReadyBeforeOpen,
    [switch]$OpenWhenLive,
    [switch]$CopyNativeToOutput,
    [switch]$SkipViewerRefresh,
    [switch]$ForceViewerRefresh,
    [switch]$NoAutoPort,
    [switch]$SkipRuntimeValidation,
    [switch]$CheckWorkingTree,
    [switch]$Detached,
    [switch]$NoWaitReady,
    [switch]$EnableDebugApi,
    [switch]$AllowPathQuery,
    [switch]$EnableCors,
    [switch]$DisableSnapshotCache,
    [switch]$AllowRefresh,
    [switch]$Advanced,
    [switch]$DryRun,
    [ValidateRange(1, 200)][int]$PortSearchLimit = 25,
    [ValidateRange(5, 600)][int]$ReadyTimeoutSeconds = 600,
    [ValidateSet("Pascal", "Kebab", "None")][string]$ArgumentStyle = "Kebab",
    [string[]]$ExtraArgs = @()
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
Write-Warning "scripts\start-workbench.ps1 is deprecated. Use scripts\start-fw-editor-viewer.ps1 instead."

$target = Join-Path $PSScriptRoot "start-fw-editor-viewer.ps1"
if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
    throw "Missing canonical FW Editor Viewer startup script: $target"
}

$params = @{
    FwdPath = $FwdPath
    Port = $Port
    HostName = $HostName
    Configuration = $Configuration
    Platform = $Platform
    Profile = $Profile
    PortSearchLimit = $PortSearchLimit
    ReadyTimeoutSeconds = $ReadyTimeoutSeconds
    ArgumentStyle = $ArgumentStyle
    ExtraArgs = $ExtraArgs
}
if ($KillExisting) { $params.KillExisting = $true }
if ($NoBuild) { $params.NoBuild = $true }
if ($Clean) { $params.Clean = $true }
if ($NoBrowser) { $params.NoBrowser = $true }
if ($NoOpenWhenReady) { $params.NoOpenWhenReady = $true }
if ($WaitForReadyBeforeOpen) { $params.WaitForReadyBeforeOpen = $true }
if ($OpenWhenLive) { $params.OpenWhenLive = $true }
if ($CopyNativeToOutput) { $params.CopyNativeToOutput = $true }
if ($SkipViewerRefresh) { $params.SkipViewerRefresh = $true }
if ($ForceViewerRefresh) { $params.ForceViewerRefresh = $true }
if ($NoAutoPort) { $params.NoAutoPort = $true }
if ($SkipRuntimeValidation) { $params.SkipRuntimeValidation = $true }
if ($CheckWorkingTree) { $params.CheckWorkingTree = $true }
if ($Detached) { $params.Detached = $true }
if ($NoWaitReady) { $params.NoWaitReady = $true }
if ($EnableDebugApi) { $params.EnableDebugApi = $true }
if ($AllowPathQuery) { $params.AllowPathQuery = $true }
if ($EnableCors) { $params.EnableCors = $true }
if ($DisableSnapshotCache) { $params.DisableSnapshotCache = $true }
if ($AllowRefresh) { $params.AllowRefresh = $true }
if ($Advanced) { $params.Advanced = $true }
if ($DryRun) { $params.DryRun = $true }

& $target @params
exit $LASTEXITCODE
