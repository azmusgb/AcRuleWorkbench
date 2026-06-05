[CmdletBinding()]
param(
    [string]$FwdPath = "",
    [int]$Port = 8787,
    [string]$HostName = "127.0.0.1",
    [switch]$NoOpen,
    [switch]$KillExisting,
    [switch]$EnableDebugApi,
    [switch]$AllowPathQuery,
    [switch]$EnableCors
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptRoot = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) { $PSScriptRoot } else { Split-Path -Parent $PSCommandPath }
$root = Split-Path -Parent $scriptRoot
if ([string]::IsNullOrWhiteSpace($FwdPath)) {
    $FwdPath = Join-Path $root "fwd.cfd"
}
$runtimePath = Join-Path $PSScriptRoot "runtime-path.generated.ps1"
if (Test-Path -LiteralPath $runtimePath) { . $runtimePath }

foreach ($runtimeDir in @((Join-Path $root "rri_bin"), (Join-Path $root "lib"))) {
    if (Test-Path -LiteralPath $runtimeDir) {
        $env:PATH = "$runtimeDir;$env:PATH"
    }
}

$exeCandidates = @(
    (Join-Path $root "AcRuleWorkbench\bin\x86\Debug\net48\AcRuleWorkbench.exe"),
    (Join-Path $root "AcRuleWorkbench\bin\Debug\net48\AcRuleWorkbench.exe"),
    (Join-Path $root "AcRuleWorkbench\bin\x86\Release\net48\AcRuleWorkbench.exe"),
    (Join-Path $root "AcRuleWorkbench\bin\Release\net48\AcRuleWorkbench.exe")
)
$exe = $exeCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1

if (-not $exe) {
    throw "Harness executable was not found. Checked: $($exeCandidates -join '; '). Build first with .\scripts\build-and-doctor.ps1"
}

$resolvedFwdPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($FwdPath)
if (-not (Test-Path -LiteralPath $resolvedFwdPath -PathType Leaf)) {
    throw "FWD file was not found: $resolvedFwdPath"
}

$conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($conn -and $KillExisting) {
    $owners = $conn | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($ownerPid in $owners) {
        try {
            $proc = Get-Process -Id $ownerPid -ErrorAction Stop
            Write-Host "Stopping existing process using port ${Port}: $($proc.ProcessName) (PID $ownerPid)"
            Stop-Process -Id $ownerPid -Force
        } catch {
            Write-Warning "Could not stop PID ${ownerPid}: $($_.Exception.Message)"
        }
    }
    Start-Sleep -Milliseconds 500
}
elseif ($conn) {
    $owners = $conn | Select-Object -ExpandProperty OwningProcess -Unique
    $details = foreach ($ownerPid in $owners) {
        $proc = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
        if ($proc) { "$ownerPid ($($proc.ProcessName))" } else { "$ownerPid" }
    }
    throw "Port $Port is already in use by: $($details -join ', '). Choose a different port or rerun with -KillExisting."
}

$args = @(
    "api",
    "--path", $resolvedFwdPath,
    "--host", $HostName,
    "--port", $Port.ToString()
)

if (-not $NoOpen) {
    $args += "--open"
}

if ($EnableDebugApi) {
    $args += "--enable-debug-api"
}
if ($AllowPathQuery) {
    $args += "--allow-path-query"
}
if ($EnableCors) {
    $args += "--enable-cors"
}

& $exe @args
