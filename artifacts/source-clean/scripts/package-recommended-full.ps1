[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
    [string]$OutputZip = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..')).Path 'AcRuleWorkbench_recommended_full.zip'),
    [switch]$IncludeGeneratedEvidence = $true,
    [switch]$IncludeRuntimeDlls = $true,
    [switch]$IncludeSampleFwd = $true
)

$ErrorActionPreference = 'Stop'

function Should-ExcludePath {
    param([string]$RelativePath)

    $normalized = $RelativePath -replace '\\', '/'

    if ($normalized -match '(^|/)\.git(/|$)') { return $true }
    if ($normalized -match '(^|/)\.vs(/|$)') { return $true }
    if ($normalized -match '(^|/)bin(/|$)') { return $true }
    if ($normalized -match '(^|/)obj(/|$)') { return $true }
    if ($normalized -match '\.(log|tmp|bak)$') { return $true }
    if ($normalized -match 'workbench\.(err|out)\.log$') { return $true }

    if (-not $IncludeRuntimeDlls -and ($normalized -match '(^|/)lib(/|$)' -or $normalized -match '(^|/)rri_bin(/|$)')) { return $true }
    if (-not $IncludeSampleFwd -and $normalized -match '(^|/)fwd\.cfd$') { return $true }
    if (-not $IncludeGeneratedEvidence -and $normalized -match 'ac-rule-viewer\.(rules|tree|rel)\.json$') { return $true }

    return $false
}

$rootPath = Resolve-Path $Root
$outputPath = [System.IO.Path]::GetFullPath($OutputZip)
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('AcRuleWorkbenchPackage_' + [Guid]::NewGuid().ToString('N'))
$stage = Join-Path $tempRoot 'AcRuleWorkbench'

try {
    New-Item -ItemType Directory -Path $stage -Force | Out-Null

    Get-ChildItem -Path $rootPath -Recurse -Force | ForEach-Object {
        if ($_.PSIsContainer) { return }
        $relative = [System.IO.Path]::GetRelativePath($rootPath, $_.FullName)
        if (Should-ExcludePath -RelativePath $relative) { return }

        $dest = Join-Path $stage $relative
        $destDir = Split-Path -Parent $dest
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
        Copy-Item -LiteralPath $_.FullName -Destination $dest -Force
    }

    if (Test-Path $outputPath) { Remove-Item $outputPath -Force }
    Compress-Archive -Path (Join-Path $tempRoot 'AcRuleWorkbench') -DestinationPath $outputPath -Force
    Write-Host "Created package: $outputPath"
}
finally {
    if (Test-Path $tempRoot) { Remove-Item $tempRoot -Recurse -Force }
}
