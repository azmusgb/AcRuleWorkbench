param(
    [string]$FwdPath = "C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd",
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

$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root "AcRuleWorkbench\bin\x86\Debug\net48\AcRuleWorkbench.exe"

if (-not (Test-Path $exe)) {
    throw "Harness executable was not found: $exe. Build first with .\scripts\build-and-doctor.ps1"
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
    "--path", $FwdPath,
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
