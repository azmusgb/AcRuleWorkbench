<#
.SYNOPSIS
  Builds and starts the AcRuleWorkbench API using the x86/net48 executable.

.DESCRIPTION
  FormWorks/DCM interop must run 32-bit. This script intentionally resolves only:

      AcRuleWorkbench\bin\x86\<Configuration>\net48\AcRuleWorkbench.exe

  It also loads native DLLs from .\rri_bin and validates managed wrapper DLLs in .\lib.

.EXAMPLE
  .\scripts\start-workbench.ps1 -FwdPath C:\dev\AcRuleWorkbench\fwd.cfd -Port 8787 -KillExisting

.EXAMPLE
  .\scripts\start-workbench.ps1 -FwdPath .\fwd.cfd -NoBuild -SkipViewerRefresh
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$FwdPath,

    [int]$Port = 8787,
    [string]$HostName = '127.0.0.1',

    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Debug',

    [ValidateSet('x86')]
    [string]$Platform = 'x86',

    [switch]$KillExisting,
    [switch]$NoBuild,
    [switch]$CopyNativeToOutput,
    [switch]$SkipViewerRefresh,
    [switch]$OpenBrowser,

    [ValidateSet('Pascal', 'Kebab')]
    [string]$ArgumentStyle = 'Kebab',

    [string[]]$ExtraArgs = @()
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Write-Section { param([string]$Text) Write-Host ''; Write-Host "== $Text ==" -ForegroundColor Cyan }
function Write-Ok { param([string]$Text) Write-Host "[OK] $Text" -ForegroundColor Green }

function Resolve-RepoRoot {
    $scriptPath = $PSCommandPath
    if ([string]::IsNullOrWhiteSpace($scriptPath)) { $scriptPath = $MyInvocation.MyCommand.Path }
    $scriptDir = Split-Path -Parent $scriptPath
    return (Resolve-Path -LiteralPath (Join-Path $scriptDir '..')).Path
}

function Stop-ListenersOnPort {
    param([Parameter(Mandatory = $true)][int]$Port)

    $pids = @()
    $getNetTcpConnection = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
    if ($null -ne $getNetTcpConnection) {
        $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
        $pids += $connections | Select-Object -ExpandProperty OwningProcess -Unique
    }
    else {
        $lines = @(netstat -ano -p tcp | Select-String -Pattern 'LISTENING' | Where-Object { $_.Line -match ":$Port\s" })
        foreach ($line in $lines) {
            $parts = @($line.Line -split '\s+' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
            if ($parts.Count -ge 5) { $pids += [int]$parts[$parts.Count - 1] }
        }
    }

    $pids = @($pids | Where-Object { $_ -gt 0 } | Sort-Object -Unique)
    if ($pids.Count -eq 0) { Write-Ok "No existing listener on port $Port"; return }

    foreach ($pidValue in $pids) {
        try {
            $process = Get-Process -Id $pidValue -ErrorAction Stop
            Write-Warning "Stopping listener on port ${Port}: $($process.ProcessName) PID $pidValue"
            Stop-Process -Id $pidValue -Force -ErrorAction Stop
        }
        catch {
            Write-Warning "Could not stop PID $pidValue on port ${Port}: $($_.Exception.Message)"
        }
    }
}

function Test-RuntimeFolder {
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [Parameter(Mandatory = $true)][string[]]$RequiredDlls,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if (-not (Test-Path -LiteralPath $Directory)) { throw "$Label directory not found: $Directory" }
    $actualNames = @(Get-ChildItem -LiteralPath $Directory -File -Filter '*.dll' -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
    $missing = @($RequiredDlls | Where-Object { $actualNames -notcontains $_ })
    if ($missing.Count -gt 0) { throw "$Label missing required DLLs in $Directory`: $($missing -join ', ')" }
    Write-Ok "$Label validated: $Directory"
}

function Add-NativeRuntimePath {
    param([Parameter(Mandatory = $true)][string]$NativeDir)
    $currentPath = [Environment]::GetEnvironmentVariable('PATH', 'Process')
    $parts = @($currentPath -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($parts -notcontains $NativeDir) {
        [Environment]::SetEnvironmentVariable('PATH', "$NativeDir;$currentPath", 'Process')
        $env:PATH = [Environment]::GetEnvironmentVariable('PATH', 'Process')
    }
    $env:FORMWORKS_NATIVE_BIN = $NativeDir
    $env:ACRULEWORKBENCH_PLATFORM = 'x86'
}

$repoRoot = Resolve-RepoRoot
$scriptDir = Join-Path $repoRoot 'scripts'
$managedLibDir = Join-Path $repoRoot 'lib'
$nativeLibDir = Join-Path $repoRoot 'rri_bin'
$runtimeHelperPath = Join-Path $scriptDir 'runtime-path.generated.ps1'
$workbenchExePath = Join-Path $repoRoot "AcRuleWorkbench\bin\x86\$Configuration\net48\AcRuleWorkbench.exe"
$viewerOutputPath = Join-Path $repoRoot 'ac-rule-viewer-live.html'

$expectedManagedDlls = @(
    'rribase_net.dll',
    'rrifwd_net.dll',
    'rridc_net.dll',
    'rriwf2_net.dll',
    'FormWorks.Core.dll',
    'FormWorks.Versioning.dll'
)
$expectedNativeDlls = @('rribase.dll', 'rrifwd.dll', 'rridc.dll', 'rriwf2.dll')

Write-Section 'Start AC Rule Workbench x86'
Write-Host "Repo root : $repoRoot"
Write-Host "FWD path  : $FwdPath"
Write-Host "Port      : $Port"
Write-Host "Config    : $Configuration"
Write-Host "Platform  : x86"
Write-Host "Exe       : $workbenchExePath"

if ($FwdPath -match '^:\\') { throw "Invalid FwdPath '$FwdPath'. You probably meant C:\dev\AcRuleWorkbench\fwd.cfd" }
$resolvedFwdPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($FwdPath)
if (-not (Test-Path -LiteralPath $resolvedFwdPath -PathType Leaf)) { throw "FWD file not found: $resolvedFwdPath" }

Test-RuntimeFolder -Directory $managedLibDir -RequiredDlls $expectedManagedDlls -Label 'Managed DLL folder'
Test-RuntimeFolder -Directory $nativeLibDir -RequiredDlls $expectedNativeDlls -Label 'Native DLL folder'

if ($KillExisting) {
    Write-Section 'Kill existing listener'
    Stop-ListenersOnPort -Port $Port
}

if (-not $NoBuild) {
    Write-Section 'Build and doctor x86'
    $buildScript = Join-Path $scriptDir 'build-and-doctor.ps1'
    if (-not (Test-Path -LiteralPath $buildScript -PathType Leaf)) { throw "Build script not found: $buildScript" }

    $buildArgs = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', $buildScript,
        '-Configuration', $Configuration,
        '-Platform', 'x86',
        '-FwdPath', $resolvedFwdPath
    )
    if ($CopyNativeToOutput) { $buildArgs += '-CopyNativeToOutput' }

    & powershell.exe @buildArgs
    if ($LASTEXITCODE -ne 0) { throw "build-and-doctor.ps1 failed with exit code $LASTEXITCODE" }
}
else {
    Write-Section 'Build skipped'
}

Write-Section 'Runtime PATH'
if (Test-Path -LiteralPath $runtimeHelperPath -PathType Leaf) {
    . $runtimeHelperPath
    Write-Ok "Loaded runtime PATH helper: $runtimeHelperPath"
}
else {
    Add-NativeRuntimePath -NativeDir $nativeLibDir
    Write-Ok "Prepended native runtime folder to PATH: $nativeLibDir"
}

if (-not (Test-Path -LiteralPath $workbenchExePath -PathType Leaf)) {
    throw "x86 AcRuleWorkbench executable was not found: $workbenchExePath. Run .\scripts\build-and-doctor.ps1 first."
}

$exeDir = Split-Path -Parent $workbenchExePath
Test-RuntimeFolder -Directory $exeDir -RequiredDlls $expectedManagedDlls -Label 'Executable managed DLL folder'
if ($CopyNativeToOutput) { Test-RuntimeFolder -Directory $exeDir -RequiredDlls $expectedNativeDlls -Label 'Executable native DLL folder' }

$env:ACRULEWORKBENCH_FWD_PATH = $resolvedFwdPath
$env:ACRULEWORKBENCH_PORT = "$Port"
$env:FW_WORKBENCH_FWD_PATH = $resolvedFwdPath
$env:FW_WORKBENCH_PORT = "$Port"
$env:ASPNETCORE_URLS = "http://$HostName`:$Port"

Write-Section 'Viewer refresh'
if ($SkipViewerRefresh) {
    Write-Host "Skipping viewer refresh. Existing file will be used: $viewerOutputPath" -ForegroundColor Yellow
}
else {
    $viewerArgs = @('ac-viewer', '--path', $resolvedFwdPath, '--process', 'AC', '--out', $viewerOutputPath)
    Push-Location $exeDir
    try {
        & $workbenchExePath @viewerArgs
        $viewerExitCode = $LASTEXITCODE
    }
    finally { Pop-Location }
    if ($viewerExitCode -ne 0) { throw "Viewer refresh failed with exit code $viewerExitCode" }
    if (-not (Test-Path -LiteralPath $viewerOutputPath -PathType Leaf)) { throw "Viewer refresh completed but output file is missing: $viewerOutputPath" }
    Write-Ok "Viewer refreshed: $viewerOutputPath"
}

$appArgs = @('api')
switch ($ArgumentStyle) {
    'Pascal' { $appArgs += @('--Path', $resolvedFwdPath, '--Port', "$Port", '--Host', $HostName, '--Viewer', $viewerOutputPath) }
    'Kebab'  { $appArgs += @('--path', $resolvedFwdPath, '--port', "$Port", '--host', $HostName, '--viewer', $viewerOutputPath) }
}
if ($OpenBrowser) { $appArgs += '--open' }
if ($ExtraArgs.Count -gt 0) { $appArgs += $ExtraArgs }

Write-Section 'Launch x86 API host'
Write-Host "Executable : $workbenchExePath"
Write-Host "Working dir: $exeDir"
Write-Host "Health     : http://$HostName`:$Port/api/v1/health/live"
Write-Host "Viewer     : http://$HostName`:$Port/"
Write-Host "Default FWD: $resolvedFwdPath"
Write-Host "Viewer file: $viewerOutputPath"
Write-Host ''
Write-Host 'Press Ctrl+C to stop.' -ForegroundColor Yellow
Write-Host ''

Push-Location $exeDir
try {
    & $workbenchExePath @appArgs
    exit $LASTEXITCODE
}
finally { Pop-Location }
