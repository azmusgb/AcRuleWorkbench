[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$TargetRoot
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

function Resolve-FullPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    return [System.IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path))
}

if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    $sourceRootCandidate = $PSScriptRoot
}
else {
    $sourceRootCandidate = Split-Path -Parent $PSCommandPath
}

$sourceRoot = Resolve-FullPath -Path $sourceRootCandidate
$targetRootFull = Resolve-FullPath -Path $TargetRoot

if (-not (Test-Path -LiteralPath $targetRootFull -PathType Container)) {
    throw "Target root not found: $targetRootFull"
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupRoot = Join-Path $targetRootFull ".update-backups\startup-v4-update-$timestamp"
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

$files = @(
    "scripts\start-fw-editor-viewer.ps1",
    "scripts\start-api.ps1",
    "scripts\verify-fw-editor-viewer-live.ps1",
    "scripts\package-split-deliverables.ps1",
    "scripts\common\workbench-logging.ps1",
    "scripts\common\workbench-paths.ps1",
    "scripts\common\workbench-runtime.ps1",
    "scripts\common\workbench-health.ps1",
    "AcRuleWorkbench\scripts\start-fw-editor-viewer.ps1",
    "AcRuleWorkbench\scripts\start-api.ps1",
    "AcRuleWorkbench\WorkbenchApiServer.cs"
)

foreach ($relativePath in $files) {
    $source = Join-Path $sourceRoot $relativePath
    $target = Join-Path $targetRootFull $relativePath

    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Update file missing from package: $source"
    }

    $sourceFull = Resolve-FullPath -Path $source
    $targetFull = [System.IO.Path]::GetFullPath($target)

    if ([string]::Equals($sourceFull, $targetFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        Write-Host "Skipping self-copy: $relativePath" -ForegroundColor Yellow
        continue
    }

    $targetDir = Split-Path -Parent $targetFull
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

    if (Test-Path -LiteralPath $targetFull -PathType Leaf) {
        $backupPath = Join-Path $backupRoot $relativePath
        $backupDir = Split-Path -Parent $backupPath
        New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
        Copy-Item -LiteralPath $targetFull -Destination $backupPath -Force
    }

    Copy-Item -LiteralPath $sourceFull -Destination $targetFull -Force
    Unblock-File -LiteralPath $targetFull -ErrorAction SilentlyContinue
    Write-Host "Updated: $relativePath" -ForegroundColor Green
}

Write-Host ""
Write-Host "Startup v4 update installed." -ForegroundColor Green
Write-Host "Backup folder: $backupRoot"
Write-Host ""
Write-Host "Recommended validation:" -ForegroundColor Cyan
Write-Host "  cd $targetRootFull"
Write-Host "  dotnet build .\AcRuleWorkbench.sln -c Debug -p:Platform=x86"
Write-Host "  dotnet test .\AcRuleWorkbench.Tests\AcRuleWorkbench.Tests.csproj -c Debug -p:Platform=x86"
Write-Host "  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-fw-editor-viewer.ps1 -FwdPath .\fwd.cfd -Port 8787 -KillExisting -NoBuild -Detached"
Write-Host "  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-fw-editor-viewer-live.ps1 -BaseUrl http://127.0.0.1:8787"
