param(
    [string]$FwdPath = "C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd",
    [int]$Port = 8787,
    [string]$Viewer = ".\ac-rule-viewer.html",
    [switch]$KillExisting,
    [switch]$SkipGenerate,
    [switch]$OpenHarness,
    [switch]$EnableDebugApi,
    [switch]$AllowPathQuery,
    [switch]$EnableCors,
    [switch]$NoSnapshotCache
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

$exe = Join-Path $projectRoot "AcRuleWorkbench\bin\x86\Debug\net48\AcRuleWorkbench.exe"
if (-not (Test-Path $exe)) {
    throw "AcRuleWorkbench.exe was not found at $exe. Run .\scripts\build-and-doctor.ps1 first."
}

if (-not (Test-Path $FwdPath)) {
    throw "FWD path does not exist: $FwdPath"
}

$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($conn) {
    $ownerProcessId = [int]$conn.OwningProcess
    $proc = Get-Process -Id $ownerProcessId -ErrorAction SilentlyContinue
    if (-not $KillExisting) {
        $name = if ($proc) { $proc.ProcessName } else { "unknown" }
        throw "Port ${Port} is already in use by PID ${ownerProcessId} ($name). Use another port or rerun with -KillExisting."
    }

    if ($proc) {
        Write-Host "Stopping existing process using port ${Port}: $($proc.ProcessName) (PID ${ownerProcessId})"
        Stop-Process -Id $ownerProcessId -Force
        Start-Sleep -Milliseconds 500
    }
}

if (-not $SkipGenerate) {
    Write-Host "Generating AC Rule Workbench snapshot..."
    & $exe ac-viewer --path $FwdPath --out $Viewer
    if ($LASTEXITCODE -ne 0) {
        throw "ac-viewer generation failed with exit code $LASTEXITCODE."
    }
}

$viewerPath = Resolve-Path $Viewer
$viewerUrl = "http://127.0.0.1:${Port}/viewer"
$harnessUrl = "http://127.0.0.1:${Port}/harness"
$helpUrl = "http://127.0.0.1:${Port}/api/v1/help"

$DebugApiEnabled = [bool]$EnableDebugApi

Write-Host ""
Write-Host "Starting unified local workbench server"
Write-Host "========================================"
Write-Host "FWD     : $FwdPath"
Write-Host "Viewer  : $viewerPath"
Write-Host "AC UI   : $viewerUrl"
if ($DebugApiEnabled) { Write-Host "Debug UI: $harnessUrl" } else { Write-Host "Debug UI: disabled by default (use -EnableDebugApi)" }
Write-Host "API help: $helpUrl"
Write-Host "API     : http://127.0.0.1:${Port}/api/v1/status"
Write-Host "Stop    : Ctrl+C"
Write-Host ""

if ($OpenHarness) {
    if (-not $DebugApiEnabled) { Write-Warning "-OpenHarness requires -EnableDebugApi. Opening API help instead."; Start-Process $helpUrl } else { Start-Process $harnessUrl }
} else {
    Start-Process $viewerUrl
}

$apiArgs = @("api", "--path", $FwdPath, "--port", $Port, "--viewer", $viewerPath, "--allow-refresh")
if ($EnableDebugApi) { $apiArgs += "--enable-debug-api" }
if ($AllowPathQuery) { $apiArgs += "--allow-path-query" }
if ($EnableCors) { $apiArgs += "--enable-cors" }
if ($NoSnapshotCache) { $apiArgs += "--no-snapshot-cache" }
& $exe @apiArgs
