[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$TargetRoot
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetRootFull = [System.IO.Path]::GetFullPath($TargetRoot)

if (-not (Test-Path -LiteralPath $targetRootFull -PathType Container)) {
    throw "Target root does not exist: $targetRootFull"
}

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupRoot = Join-Path $targetRootFull ("_backup_package_source_clean_$timestamp")
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

$files = @(
    'scripts\package-source-clean.ps1'
)

foreach ($relative in $files) {
    $source = Join-Path $sourceRoot $relative
    $target = Join-Path $targetRootFull $relative

    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Update file missing from package: $relative"
    }

    $sourceFull = [System.IO.Path]::GetFullPath($source)
    $targetFull = [System.IO.Path]::GetFullPath($target)

    if ($sourceFull.Equals($targetFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        Write-Host "Skipping self-copy: $relative" -ForegroundColor Yellow
        continue
    }

    if (Test-Path -LiteralPath $target -PathType Leaf) {
        $backup = Join-Path $backupRoot $relative
        $backupDir = Split-Path -Parent $backup
        if (-not (Test-Path -LiteralPath $backupDir)) {
            New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        }
        Copy-Item -LiteralPath $target -Destination $backup -Force
    }

    $targetDir = Split-Path -Parent $target
    if (-not (Test-Path -LiteralPath $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }

    Copy-Item -LiteralPath $source -Destination $target -Force
    Write-Host "Updated: $relative"
}

Write-Host ''
Write-Host "Update complete. Backup folder: $backupRoot" -ForegroundColor Green
