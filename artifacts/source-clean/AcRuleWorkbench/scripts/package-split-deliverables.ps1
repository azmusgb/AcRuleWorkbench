<#
.SYNOPSIS
  Creates source/runtime/evidence deliverable zips with x86 runtime filtering.
#>
[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$OutputDir = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'packages'),
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

function Test-SourceExcludedPath {
    param([string]$RelativePath)
    $n = $RelativePath -replace '\\', '/'
    if ($n -match '(^|/)\.git(/|$)') { return $true }
    if ($n -match '(^|/)\.vs(/|$)') { return $true }
    if ($n -match '(^|/)bin(/|$)') { return $true }
    if ($n -match '(^|/)obj(/|$)') { return $true }
    if ($n -match '(^|/)TestResults(/|$)') { return $true }
    if ($n -match '(^|/)packages(/|$)') { return $true }
    if ($n -match '(^|/)artifacts(/|$)') { return $true }
    if ($n -match '(^|/)attached_assets(/|$)') { return $true }
    if ($n -match '(^|/)docs/.*\.(pdf|extracted\.txt)$') { return $true }
    if ($n -match '\.(log|tmp|bak|zip)$') { return $true }
    if ($n -match '(^|/)fwd\.cfd$') { return $true }
    if ($n -match '(^|/)ac-rule-viewer\.(flow|fwd|rules|tree|rel)\.json$') { return $true }
    if ($n -match '(^|/)runtime-path\.generated\.ps1$') { return $true }
    return $false
}

function Copy-MatchingFiles {
    param([string]$RootPath, [string]$StagePath, [scriptblock]$IncludeFile)
    Get-ChildItem -Path $RootPath -Recurse -Force | ForEach-Object {
        if ($_.PSIsContainer) { return }
        $relative = [System.IO.Path]::GetRelativePath($RootPath, $_.FullName)
        if (-not (& $IncludeFile $relative)) { return }
        $dest = Join-Path $StagePath $relative
        $destDir = Split-Path -Parent $dest
        if (-not (Test-Path -LiteralPath $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
    }
}

function New-ZipFromStage {
    param([string]$PackageName, [string]$StageRoot, [string]$OutputRoot)
    $zipPath = Join-Path $OutputRoot ($PackageName + '.zip')
    if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
    Compress-Archive -Path (Join-Path $StageRoot '*') -DestinationPath $zipPath -Force
    return $zipPath
}

$rootPath = (Resolve-Path -LiteralPath $Root).Path
$outputRoot = [System.IO.Path]::GetFullPath($OutputDir)
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('AcRuleWorkbenchSplit_' + [Guid]::NewGuid().ToString('N'))
$sourceStage = Join-Path $tempRoot 'source-package'
$runtimeStage = Join-Path $tempRoot 'runtime-package'
$evidenceStage = Join-Path $tempRoot 'evidence-package'

try {
    New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $sourceStage, $runtimeStage, $evidenceStage -Force | Out-Null

    Copy-MatchingFiles -RootPath $rootPath -StagePath $sourceStage -IncludeFile { param($relative) return -not (Test-SourceExcludedPath -RelativePath $relative) }

    Copy-MatchingFiles -RootPath $rootPath -StagePath $runtimeStage -IncludeFile {
        param($relative)
        $n = $relative -replace '\\', '/'
        if ($n -match "(^|/)AcRuleWorkbench/bin/x86/$Configuration/net48/.*\.(exe|dll|config|json|pdb)$") { return $true }
        if ($n -match '(^|/)lib/.*\.dll$') { return $true }
        if ($n -match '(^|/)rri_bin/.*\.dll$') { return $true }
        if ($n -match '(^|/)scripts/(start-workbench|start-api|run-doctor|run-harness|runtime-path\.generated)\.(ps1|cmd)$') { return $true }
        if ($n -match '(^|/)ac-rule-viewer\.(html|css|js)$') { return $true }
        if ($n -match '(^|/)appsettings\.sample\.json$') { return $true }
        return $false
    }

    Copy-MatchingFiles -RootPath $rootPath -StagePath $evidenceStage -IncludeFile {
        param($relative)
        $n = $relative -replace '\\', '/'
        if ($n -match '(^|/)ac-rule-viewer\.(html|css|js)$') { return $true }
        if ($n -match '(^|/)ac-rule-viewer\.(flow|fwd|rules|tree|rel)\.json$') { return $true }
        if ($n -match '(^|/)SOURCE_MANIFEST\.csv$') { return $true }
        return $false
    }

    $sourceZip = New-ZipFromStage -PackageName 'AcRuleWorkbench.Source' -StageRoot $sourceStage -OutputRoot $outputRoot
    $runtimeZip = New-ZipFromStage -PackageName "AcRuleWorkbench.Runtime.x86.$Configuration" -StageRoot $runtimeStage -OutputRoot $outputRoot
    $evidenceZip = New-ZipFromStage -PackageName 'AcRuleWorkbench.Evidence' -StageRoot $evidenceStage -OutputRoot $outputRoot

    Write-Host 'Created split deliverables:' -ForegroundColor Green
    Write-Host "  $sourceZip"
    Write-Host "  $runtimeZip"
    Write-Host "  $evidenceZip"
}
finally {
    if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}
