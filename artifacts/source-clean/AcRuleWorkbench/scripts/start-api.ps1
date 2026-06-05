<#
.SYNOPSIS
  Starts the AcRuleWorkbench API host from the x86/net48 output folder.

.DESCRIPTION
  Lightweight API launcher. It does not build by default. Use build-and-doctor.ps1 first,
  or pass -Build to build/validate before launch.
#>
[CmdletBinding()]
param(
    [string]$FwdPath = '',
    [int]$Port = 8787,
    [string]$HostName = '127.0.0.1',

    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Debug',

    [ValidateSet('x86')]
    [string]$Platform = 'x86',

    [switch]$Build,
    [switch]$NoOpen,
    [switch]$KillExisting,
    [switch]$EnableDebugApi,
    [switch]$AllowPathQuery,
    [switch]$EnableCors,
    [switch]$SkipViewerRefresh
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Stop-ListenersOnPort {
    param([Parameter(Mandatory = $true)][int]$Port)
    $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($connections.Count -eq 0) { return }
    $owners = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
    foreach ($ownerPid in $owners) {
        try {
            $proc = Get-Process -Id $ownerPid -ErrorAction Stop
            Write-Host "Stopping existing process using port ${Port}: $($proc.ProcessName) PID $ownerPid" -ForegroundColor Yellow
            Stop-Process -Id $ownerPid -Force
        }
        catch {
            Write-Warning "Could not stop PID ${ownerPid}: $($_.Exception.Message)"
        }
    }
    Start-Sleep -Milliseconds 500
}

function Add-RuntimePath {
    param([string]$Directory)
    if (Test-Path -LiteralPath $Directory) {
        $env:PATH = "$Directory;$env:PATH"
    }
}

$scriptRoot = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) { $PSScriptRoot } else { Split-Path -Parent $PSCommandPath }
$root = (Resolve-Path -LiteralPath (Join-Path $scriptRoot '..')).Path
if ([string]::IsNullOrWhiteSpace($FwdPath)) { $FwdPath = Join-Path $root 'fwd.cfd' }

$runtimePath = Join-Path $scriptRoot 'runtime-path.generated.ps1'
if (Test-Path -LiteralPath $runtimePath -PathType Leaf) { . $runtimePath }
Add-RuntimePath -Directory (Join-Path $root 'rri_bin')
Add-RuntimePath -Directory (Join-Path $root 'lib')
$env:ACRULEWORKBENCH_PLATFORM = 'x86'

$exe = Join-Path $root "AcRuleWorkbench\bin\x86\$Configuration\net48\AcRuleWorkbench.exe"
if ($Build) {
    $buildScript = Join-Path $scriptRoot 'build-and-doctor.ps1'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $buildScript -Configuration $Configuration -Platform x86 -FwdPath $FwdPath
    if ($LASTEXITCODE -ne 0) { throw "build-and-doctor.ps1 failed with exit code $LASTEXITCODE" }
}

if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
    throw "x86 API executable was not found: $exe. Build first with .\scripts\build-and-doctor.ps1 -Configuration $Configuration."
}

$resolvedFwdPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($FwdPath)
if (-not (Test-Path -LiteralPath $resolvedFwdPath -PathType Leaf)) { throw "FWD file was not found: $resolvedFwdPath" }

$conn = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
if ($conn.Count -gt 0 -and $KillExisting) {
    Stop-ListenersOnPort -Port $Port
}
elseif ($conn.Count -gt 0) {
    $owners = $conn | Select-Object -ExpandProperty OwningProcess -Unique
    $details = foreach ($ownerPid in $owners) {
        $proc = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
        if ($proc) { "$ownerPid ($($proc.ProcessName))" } else { "$ownerPid" }
    }
    throw "Port $Port is already in use by: $($details -join ', '). Choose another port or rerun with -KillExisting."
}

$viewerOutputPath = Join-Path $root 'ac-rule-viewer-live.html'
if (-not $SkipViewerRefresh) {
    Push-Location (Split-Path -Parent $exe)
    try {
        & $exe 'ac-viewer' '--path' $resolvedFwdPath '--process' 'AC' '--out' $viewerOutputPath
        if ($LASTEXITCODE -ne 0) { throw "Viewer refresh failed with exit code $LASTEXITCODE" }
    }
    finally { Pop-Location }
}

$args = @('api', '--path', $resolvedFwdPath, '--host', $HostName, '--port', $Port.ToString(), '--viewer', $viewerOutputPath)
if (-not $NoOpen) { $args += '--open' }
if ($EnableDebugApi) { $args += '--enable-debug-api' }
if ($AllowPathQuery) { $args += '--allow-path-query' }
if ($EnableCors) { $args += '--enable-cors' }

Write-Host "Starting x86 API host: $exe" -ForegroundColor Cyan
Write-Host "FWD: $resolvedFwdPath" -ForegroundColor Cyan
Write-Host "URL: http://$HostName`:$Port/" -ForegroundColor Cyan

Push-Location (Split-Path -Parent $exe)
try {
    & $exe @args
    exit $LASTEXITCODE
}
finally { Pop-Location }
