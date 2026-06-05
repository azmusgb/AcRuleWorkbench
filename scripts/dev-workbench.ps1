<#
.SYNOPSIS
  Root-friendly one-command launcher for AC Rule Workbench.

.DESCRIPTION
  This script restores the original base-folder workflow:
    .\run-workbench.cmd

  It performs the normal local-dev startup path:
    - resolves fwd.cfd from the repo root unless -FwdPath is supplied;
    - unblocks downloaded files unless -SkipUnblock is supplied;
    - runs dependency setup only when lib/rri_bin/runtime helper appear incomplete;
    - delegates build/viewer/API/browser startup to scripts\start-workbench.ps1;
    - opens the viewer by default.

  Root wrappers:
    .\run-workbench.cmd
    .\start-workbench.cmd

.EXAMPLE
  .\run-workbench.cmd

.EXAMPLE
  .\run-workbench.cmd -SkipBuild

.EXAMPLE
  .\run-workbench.cmd -SkipBuild -Detached

.EXAMPLE
  .\run-workbench.cmd -FwdPath C:\dev\AcRuleWorkbench\fwd.cfd -Port 8787
#>
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

    [switch]$Clean,
    [switch]$ForceSetup,
    [switch]$SkipSetup,
    [switch]$SkipBuild,
    [switch]$SkipUnblock,
    [switch]$SkipViewerRefresh,
    [switch]$ForceViewerRefresh,
    [switch]$CopyNativeToOutput,
    [switch]$PreferNewestDcm,
    [switch]$NoBrowser,
    [switch]$NoKillExisting,
    [switch]$NoAutoPort,
    [switch]$Detached,
    [switch]$WaitForReadyBeforeOpen,
    [switch]$CheckWorkingTree,
    [switch]$EnableDebugApi,
    [switch]$AllowPathQuery,
    [switch]$EnableCors,
    [switch]$DisableSnapshotCache,
    [switch]$AllowRefresh,

    [ValidateRange(1, 200)]
    [int]$PortSearchLimit = 25,

    [ValidateRange(5, 600)]
    [int]$ReadyTimeoutSeconds = 90
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

function Write-Section {
    param([Parameter(Mandatory = $true)][string]$Text)
    Write-Host ""
    Write-Host "== $Text ==" -ForegroundColor Cyan
}

function Write-Ok {
    param([Parameter(Mandatory = $true)][string]$Text)
    Write-Host "[OK] $Text" -ForegroundColor Green
}

function Write-Info {
    param([Parameter(Mandatory = $true)][string]$Text)
    Write-Host "[INFO] $Text" -ForegroundColor DarkCyan
}

function Resolve-RepoRoot {
    if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
        $scriptDir = $PSScriptRoot
    }
    else {
        $scriptPath = $PSCommandPath
        if ([string]::IsNullOrWhiteSpace($scriptPath)) {
            $scriptPath = $MyInvocation.MyCommand.Path
        }
        $scriptDir = Split-Path -Parent $scriptPath
    }

    return (Resolve-Path -LiteralPath (Join-Path $scriptDir "..")).Path
}

function Resolve-FwdFile {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [string]$Path
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        $Path = Join-Path $Root "fwd.cfd"
    }

    $resolved = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
    if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
        throw "FWD file was not found: $resolved. Pass -FwdPath C:\path\to\fwd.cfd or place fwd.cfd in the repo root."
    }

    $item = Get-Item -LiteralPath $resolved -ErrorAction Stop
    if ($item.Extension -ne ".cfd") {
        throw "FwdPath must point to a .cfd file: $resolved"
    }

    return $item.FullName
}

function Test-RequiredDlls {
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [Parameter(Mandatory = $true)][string[]]$Names
    )

    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) {
        return $false
    }

    $actual = @(Get-ChildItem -LiteralPath $Directory -File -Filter "*.dll" -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
    foreach ($name in $Names) {
        if ($actual -notcontains $name) {
            return $false
        }
    }

    return $true
}

function Invoke-LocalPowerShellScript {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptPath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if (-not (Test-Path -LiteralPath $ScriptPath -PathType Leaf)) {
        throw "$Label was not found: $ScriptPath"
    }

    $powershellArgs = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $ScriptPath
    ) + $Arguments

    Write-Host ""
    Write-Host "> powershell.exe $($powershellArgs -join ' ')" -ForegroundColor DarkGray
    & powershell.exe @powershellArgs
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "$Label failed with exit code $exitCode"
    }
}

$repoRoot = Resolve-RepoRoot
$scriptDir = Join-Path $repoRoot "scripts"
$resolvedFwdPath = Resolve-FwdFile -Root $repoRoot -Path $FwdPath

$managedDlls = @(
    "rribase_net.dll",
    "rrifwd_net.dll",
    "rridc_net.dll",
    "rriwf2_net.dll",
    "FormWorks.Core.dll",
    "FormWorks.Versioning.dll"
)

$nativeDlls = @(
    "rribase.dll",
    "rrifwd.dll",
    "rridc.dll",
    "rriwf2.dll"
)

$managedLibDir = Join-Path $repoRoot "lib"
$nativeLibDir = Join-Path $repoRoot "rri_bin"
$runtimeHelperPath = Join-Path $scriptDir "runtime-path.generated.ps1"

Write-Section "AC Rule Workbench local launcher"
Write-Host "Repo root : $repoRoot"
Write-Host "FWD path  : $resolvedFwdPath"
Write-Host "Port      : $Port"
Write-Host "Profile   : $Profile"
Write-Host "Build     : $(-not [bool]$SkipBuild)"
Write-Host "Detached  : $([bool]$Detached)"
Write-Host "Viewer    : http://$HostName`:$Port/viewer?nocache=1"

if (-not $SkipUnblock) {
    Write-Section "Unblock local files"
    $files = @(Get-ChildItem -LiteralPath $repoRoot -Recurse -File -Force -ErrorAction SilentlyContinue |
        Where-Object {
            $_.FullName -notmatch "\\\.git\\" -and
            $_.FullName -notmatch "\\bin\\" -and
            $_.FullName -notmatch "\\obj\\"
        })

    foreach ($file in $files) {
        Unblock-File -LiteralPath $file.FullName -ErrorAction SilentlyContinue
    }

    Write-Ok "Unblocked $($files.Count) file(s)."
}
else {
    Write-Section "Unblock skipped"
}

$hasManaged = Test-RequiredDlls -Directory $managedLibDir -Names $managedDlls
$hasNative = Test-RequiredDlls -Directory $nativeLibDir -Names $nativeDlls
$hasRuntimeHelper = Test-Path -LiteralPath $runtimeHelperPath -PathType Leaf
$needsSetup = $ForceSetup -or (-not $hasManaged) -or (-not $hasNative) -or (-not $hasRuntimeHelper)

if ($SkipSetup) {
    Write-Section "Dependency setup skipped"
}
elseif ($needsSetup) {
    Write-Section "Dependency setup"
    $setupScript = Join-Path $scriptDir "setup-dcm-deps.ps1"
    $setupArgs = @()
    if ($PreferNewestDcm) {
        $setupArgs += "-PreferNewest"
    }

    Invoke-LocalPowerShellScript -ScriptPath $setupScript -Arguments $setupArgs -Label "setup-dcm-deps.ps1"
}
else {
    Write-Section "Dependency setup"
    Write-Ok "Managed/native runtime layout already looks valid."
}

Write-Section "Build, refresh if stale, start API, open viewer"
$startScript = Join-Path $scriptDir "start-workbench.ps1"
$startArgs = @(
    "-FwdPath", $resolvedFwdPath,
    "-Port", $Port.ToString(),
    "-HostName", $HostName,
    "-Configuration", $Configuration,
    "-Platform", $Platform,
    "-Profile", $Profile,
    "-PortSearchLimit", $PortSearchLimit.ToString(),
    "-ReadyTimeoutSeconds", $ReadyTimeoutSeconds.ToString()
)

if (-not $NoKillExisting) { $startArgs += "-KillExisting" }
if ($SkipBuild) { $startArgs += "-NoBuild" }
if ($Clean) { $startArgs += "-Clean" }
if ($CopyNativeToOutput) { $startArgs += "-CopyNativeToOutput" }
if ($SkipViewerRefresh) { $startArgs += "-SkipViewerRefresh" }
if ($ForceViewerRefresh) { $startArgs += "-ForceViewerRefresh" }
if ($NoBrowser) { $startArgs += "-NoBrowser" }
if ($NoAutoPort) { $startArgs += "-NoAutoPort" }
if ($Detached) { $startArgs += "-Detached" }
if ($WaitForReadyBeforeOpen) { $startArgs += "-WaitForReadyBeforeOpen" }
if ($CheckWorkingTree) { $startArgs += "-CheckWorkingTree" }
if ($EnableDebugApi) { $startArgs += "-EnableDebugApi" }
if ($AllowPathQuery) { $startArgs += "-AllowPathQuery" }
if ($EnableCors) { $startArgs += "-EnableCors" }
if ($DisableSnapshotCache) { $startArgs += "-DisableSnapshotCache" }
if ($AllowRefresh) { $startArgs += "-AllowRefresh" }

Invoke-LocalPowerShellScript -ScriptPath $startScript -Arguments $startArgs -Label "start-workbench.ps1"
