[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,

    [Alias('OutDir')]
    [string]$OutputDir = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'packages')
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Resolve-FullPathCompat {
    param([Parameter(Mandatory = $true)][string]$Path)
    return [System.IO.Path]::GetFullPath($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path))
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

    return $relativePath.Replace('/', [string][System.IO.Path]::DirectorySeparatorChar)
}

function Test-SourceExcludedPath {
    param([Parameter(Mandatory = $true)][string]$RelativePath)

    $normalized = $RelativePath -replace '\\', '/'

    if ($normalized -match '(^|/)\.git(/|$)') { return $true }
    if ($normalized -match '(^|/)\.vs(/|$)') { return $true }
    if ($normalized -match '(^|/)bin(/|$)') { return $true }
    if ($normalized -match '(^|/)obj(/|$)') { return $true }
    if ($normalized -match '(^|/)TestResults(/|$)') { return $true }
    if ($normalized -match '\.log$') { return $true }
    if ($normalized -match '(^|/)fwd\.cfd$') { return $true }
    if ($normalized -match '(^|/)ac-rule-viewer-live\.(html|css|js)$') { return $true }
    if ($normalized -match '(^|/)ac-rule-viewer\..*\.json$') { return $true }
    if ($normalized -match '(^|/)runtime-path\.generated\.ps1$') { return $true }
    if ($normalized -match '(^|/)lib(/|$)') { return $true }
    if ($normalized -match '(^|/)rri_bin(/|$)') { return $true }
    if ($normalized -match '(^|/)CopilotSnapshots(/|$)') { return $true }
    if ($normalized -match '(^|/)artifacts(/|$)') { return $true }
    if ($normalized -match '(^|/)attached_assets(/|$)') { return $true }
    if ($normalized -match '(^|/)docs/.*\.(pdf|extracted\.txt)$') { return $true }
    if ($normalized -match '(^|/)packages(/|$)') { return $true }
    if ($normalized -match '(^|/)\.update-backups(/|$)') { return $true }
    if ($normalized -match '\.(zip|7z|rar)$') { return $true }
    if ($normalized -match '(^|/)(TestDiag|VSTestDllDiag).*\.txt$') { return $true }
    if ($normalized -match '\.(user|suo)$') { return $true }

    return $false
}

function Copy-MatchingFiles {
    param(
        [Parameter(Mandatory = $true)][string]$RootPath,
        [Parameter(Mandatory = $true)][string]$StagePath,
        [Parameter(Mandatory = $true)][scriptblock]$IncludeFile
    )

    Get-ChildItem -LiteralPath $RootPath -Recurse -Force -File | ForEach-Object {
        $relative = Get-RelativePathCompat -BasePath $RootPath -TargetPath $_.FullName
        if (-not (& $IncludeFile $relative)) { return }

        $dest = Join-Path $StagePath $relative
        $destDir = Split-Path -Parent $dest
        if (-not (Test-Path -LiteralPath $destDir -PathType Container)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }

        Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
    }
}

function New-ZipFromStage {
    param(
        [Parameter(Mandatory = $true)][string]$PackageName,
        [Parameter(Mandatory = $true)][string]$StageRoot,
        [Parameter(Mandatory = $true)][string]$OutputRoot
    )

    $zipPath = Join-Path $OutputRoot ($PackageName + '.zip')
    if (Test-Path -LiteralPath $zipPath -PathType Leaf) {
        Remove-Item -LiteralPath $zipPath -Force
    }

    $items = @(Get-ChildItem -LiteralPath $StageRoot -Force -ErrorAction SilentlyContinue)
    if ($items.Count -eq 0) {
        Write-Host "Skipping empty package: $PackageName" -ForegroundColor Yellow
        return $null
    }

    Compress-Archive -Path (Join-Path $StageRoot '*') -DestinationPath $zipPath -Force
    return $zipPath
}

$rootPath = Resolve-FullPathCompat -Path $Root
$outputRoot = [System.IO.Path]::GetFullPath($OutputDir)
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('AcRuleWorkbenchSplit_' + [Guid]::NewGuid().ToString('N'))
$sourceStage = Join-Path $tempRoot 'source-clean'
$runtimeStage = Join-Path $tempRoot 'runtime-local'
$evidenceStage = Join-Path $tempRoot 'evidence-sample'
$diagnosticsStage = Join-Path $tempRoot 'diagnostics-bundle'

try {
    New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $sourceStage -Force | Out-Null
    New-Item -ItemType Directory -Path $runtimeStage -Force | Out-Null
    New-Item -ItemType Directory -Path $evidenceStage -Force | Out-Null
    New-Item -ItemType Directory -Path $diagnosticsStage -Force | Out-Null

    Copy-MatchingFiles -RootPath $rootPath -StagePath $sourceStage -IncludeFile {
        param($relative)
        return -not (Test-SourceExcludedPath -RelativePath $relative)
    }

    Copy-MatchingFiles -RootPath $rootPath -StagePath $runtimeStage -IncludeFile {
        param($relative)
        $n = $relative -replace '\\', '/'
        if ($n -match '(^|/)AcRuleWorkbench/bin/.*/AcRuleWorkbench\.exe$') { return $true }
        if ($n -match '(^|/)AcRuleWorkbench/bin/.*/.*\.(dll|config|json)$') { return $true }
        if ($n -match '(^|/)lib(/|$)') { return $true }
        if ($n -match '(^|/)rri_bin(/|$)') { return $true }
        if ($n -match '(^|/)scripts/common/.*\.ps1$') { return $true }
        if ($n -match '(^|/)scripts/start-.*\.ps1$') { return $true }
        if ($n -match '(^|/)scripts/verify-workbench-live\.ps1$') { return $true }
        if ($n -match '(^|/)appsettings\.sample\.json$') { return $true }
        return $false
    }

    Copy-MatchingFiles -RootPath $rootPath -StagePath $evidenceStage -IncludeFile {
        param($relative)
        $n = $relative -replace '\\', '/'
        if ($n -match '(^|/)ac-rule-viewer\.(html|css|js)$') { return $true }
        if ($n -match '(^|/)ac-rule-viewer-live\.html$') { return $true }
        if ($n -match '(^|/)ac-rule-viewer\.(rules|tree|rel|fwd)\.json$') { return $true }
        if ($n -match '(^|/)SOURCE_MANIFEST\.csv$') { return $true }
        return $false
    }

    Copy-MatchingFiles -RootPath $rootPath -StagePath $diagnosticsStage -IncludeFile {
        param($relative)
        $n = $relative -replace '\\', '/'
        if ($n -match '(^|/)scripts/collect-diagnostics\.ps1$') { return $true }
        if ($n -match '(^|/)scripts/run-diagnostic\.ps1$') { return $true }
        if ($n -match '(^|/)scripts/verify-workbench-live\.ps1$') { return $true }
        if ($n -match '(^|/)docs/runbooks/.*\.md$') { return $true }
        if ($n -match '(^|/)docs/troubleshooting\.md$') { return $true }
        if ($n -match '(^|/)docs/operator-guide\.md$') { return $true }
        return $false
    }

    $packages = @(
        (New-ZipFromStage -PackageName 'source-clean' -StageRoot $sourceStage -OutputRoot $outputRoot),
        (New-ZipFromStage -PackageName 'runtime-local' -StageRoot $runtimeStage -OutputRoot $outputRoot),
        (New-ZipFromStage -PackageName 'evidence-sample' -StageRoot $evidenceStage -OutputRoot $outputRoot),
        (New-ZipFromStage -PackageName 'diagnostics-bundle' -StageRoot $diagnosticsStage -OutputRoot $outputRoot)
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

    Write-Host 'Created split deliverables:' -ForegroundColor Green
    foreach ($package in $packages) {
        Write-Host ('  ' + $package)
    }
}
finally {
    if (Test-Path -LiteralPath $tempRoot -PathType Container) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
