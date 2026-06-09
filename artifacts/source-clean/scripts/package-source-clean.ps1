<#
.SYNOPSIS
    Creates a source-clean AcRuleWorkbench package and staging folder.

.DESCRIPTION
    PowerShell 5.1-compatible packaging script. It excludes local/runtime/build/private
    artifacts from the exported source package and writes both:

      - <OutDir>\source-clean\              staged source-clean folder
      - <OutDir>\AcRuleWorkbench_FWEditorViewer_source_clean.zip

    This script is intended to run from a developer working tree that may contain
    lib, rri_bin, fwd.cfd, generated viewer JSON, bin, obj, and other local files.

.EXAMPLE
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-source-clean.ps1 -Root . -OutDir .\artifacts

.EXAMPLE
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-source-clean.ps1 -Root . -OutputZip .\artifacts\AcRuleWorkbench_FWEditorViewer_source_clean.zip
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$Root = (Join-Path $PSScriptRoot '..'),

    [Parameter(Mandatory = $false)]
    [string]$OutDir,

    [Parameter(Mandatory = $false)]
    [string]$OutputZip,

    [Parameter(Mandatory = $false)]
    [switch]$NoZip
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Get-FullPathSafe {
    param([Parameter(Mandatory = $true)][string]$Path)

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }

    return [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $Path))
}

function Get-RelativePathCompat {
    param(
        [Parameter(Mandatory = $true)][string]$BasePath,
        [Parameter(Mandatory = $true)][string]$TargetPath
    )

    $baseFull = [System.IO.Path]::GetFullPath($BasePath)
    $targetFull = [System.IO.Path]::GetFullPath($TargetPath)

    if (-not $baseFull.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
        $baseFull += [System.IO.Path]::DirectorySeparatorChar
    }

    $baseUri = New-Object System.Uri($baseFull)
    $targetUri = New-Object System.Uri($targetFull)
    $relativeUri = $baseUri.MakeRelativeUri($targetUri)
    $relativePath = [System.Uri]::UnescapeDataString($relativeUri.ToString())

    return $relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
}

function Test-ExcludedPath {
    param([Parameter(Mandatory = $true)][string]$RelativePath)

    $normalized = $RelativePath -replace '\\', '/'

    if ($normalized -match '(^|/)\.git(/|$)') { return $true }
    if ($normalized -match '(^|/)\.vs(/|$)') { return $true }
    if ($normalized -match '(^|/)bin(/|$)') { return $true }
    if ($normalized -match '(^|/)obj(/|$)') { return $true }
    if ($normalized -match '(^|/)TestResults(/|$)') { return $true }
    if ($normalized -match '(^|/)packages(/|$)') { return $true }
    if ($normalized -match '(^|/)artifacts(/|$)') { return $true }
    if ($normalized -match '(^|/)CopilotSnapshots(/|$)') { return $true }
    if ($normalized -match '(^|/)attached_assets(/|$)') { return $true }
    if ($normalized -match '(^|/)lib(/|$)') { return $true }
    if ($normalized -match '(^|/)rri_bin(/|$)') { return $true }
    if ($normalized -match '(^|/)docs/.*\.(pdf|extracted\.txt)$') { return $true }
    if ($normalized -match '^AcRuleWorkbench/scripts(/|$)') { return $true }
    if ($normalized -match '(^|/)\.archive(/|$)') { return $true }

    if ($normalized -match '(^|/)fwd\.cfd$') { return $true }
    if ($normalized -match '(^|/)ac-rule-viewer\..*\.json$') { return $true }
    if ($normalized -match '(^|/)ac-rule-viewer-live\.(html|css|js)$') { return $true }
    if ($normalized -match '(^|/)runtime-path\.generated\.ps1$') { return $true }
    if ($normalized -match '(^|/)(TestDiag|VSTestDllDiag).*\.txt$') { return $true }

    if ($normalized -match '\.(zip|7z|rar)$') { return $true }
    if ($normalized -match '\.(dll|exe|pdb|log|user|suo)$') { return $true }

    return $false
}

function Copy-SourceCleanTree {
    param(
        [Parameter(Mandatory = $true)][string]$RootPath,
        [Parameter(Mandatory = $true)][string]$StagePath
    )

    $copied = 0
    $excluded = 0

    Get-ChildItem -LiteralPath $RootPath -Recurse -Force -File | ForEach-Object {
        $relative = Get-RelativePathCompat -BasePath $RootPath -TargetPath $_.FullName

        if (Test-ExcludedPath -RelativePath $relative) {
            $script:excludedCount++
            return
        }

        $destination = Join-Path $StagePath $relative
        $destinationDirectory = Split-Path -Parent $destination

        if (-not (Test-Path -LiteralPath $destinationDirectory)) {
            New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
        }

        Copy-Item -LiteralPath $_.FullName -Destination $destination -Force
        $script:copiedCount++
    }
}

$rootPath = Get-FullPathSafe -Path $Root
if (-not (Test-Path -LiteralPath $rootPath -PathType Container)) {
    throw "Root path does not exist or is not a directory: $rootPath"
}

if ([string]::IsNullOrWhiteSpace($OutDir)) {
    if (-not [string]::IsNullOrWhiteSpace($OutputZip)) {
        $OutDir = Split-Path -Parent (Get-FullPathSafe -Path $OutputZip)
    }
    else {
        $OutDir = Join-Path $rootPath 'artifacts'
    }
}

$outDirPath = Get-FullPathSafe -Path $OutDir
$stagePath = Join-Path $outDirPath 'source-clean'

if ([string]::IsNullOrWhiteSpace($OutputZip)) {
    $outputZipPath = Join-Path $outDirPath 'AcRuleWorkbench_FWEditorViewer_source_clean.zip'
}
else {
    $outputZipPath = Get-FullPathSafe -Path $OutputZip
}

if ($stagePath.StartsWith($rootPath.TrimEnd('\') + '\', [System.StringComparison]::OrdinalIgnoreCase) -eq $false -and
    $stagePath.Equals($rootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'The stage path cannot be the same as the root path.'
}

New-Item -ItemType Directory -Path $outDirPath -Force | Out-Null

if (Test-Path -LiteralPath $stagePath) {
    Remove-Item -LiteralPath $stagePath -Recurse -Force
}

New-Item -ItemType Directory -Path $stagePath -Force | Out-Null

$script:copiedCount = 0
$script:excludedCount = 0

Copy-SourceCleanTree -RootPath $rootPath -StagePath $stagePath

if (-not $NoZip) {
    $zipDirectory = Split-Path -Parent $outputZipPath
    if (-not (Test-Path -LiteralPath $zipDirectory)) {
        New-Item -ItemType Directory -Path $zipDirectory -Force | Out-Null
    }

    if (Test-Path -LiteralPath $outputZipPath) {
        Remove-Item -LiteralPath $outputZipPath -Force
    }

    Compress-Archive -Path (Join-Path $stagePath '*') -DestinationPath $outputZipPath -Force
}

Write-Host ''
Write-Host 'Source-clean package staging complete.' -ForegroundColor Green
Write-Host "Root       : $rootPath"
Write-Host "Stage      : $stagePath"
if (-not $NoZip) {
    Write-Host "Zip        : $outputZipPath"
}
Write-Host "Copied     : $script:copiedCount files"
Write-Host "Excluded   : $script:excludedCount files"
Write-Host ''
Write-Host 'Next validation command:' -ForegroundColor Cyan
Write-Host "powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\validate-package-boundaries.ps1 -Root '$stagePath' -Mode SourcePackage"
