[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$sourceDir = Join-Path $Root 'src\viewer'
$coreDir = Join-Path $Root 'AcRuleWorkbench.Core\Viewer'


$jsBuilder = Join-Path $Root 'scripts\build-viewer-js.ps1'
$cssBuilder = Join-Path $Root 'scripts\build-viewer-css.ps1'
if (Test-Path -LiteralPath $jsBuilder -PathType Leaf) {
    & $jsBuilder -Root $Root
}
if (Test-Path -LiteralPath $cssBuilder -PathType Leaf) {
    & $cssBuilder -Root $Root
}


function Get-FwEditorViewerBuild {
    param([Parameter(Mandatory = $true)][string]$RootPath)
    $buildFile = Join-Path $RootPath 'viewer-build.txt'
    if (-not (Test-Path -LiteralPath $buildFile -PathType Leaf)) {
        throw "Missing viewer build marker file: $buildFile"
    }
    return (Get-Content -LiteralPath $buildFile -Raw).Trim()
}

function Apply-FwEditorViewerBuildMarker {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$ViewerBuild
    )
    $major = if ($ViewerBuild -match '^v(\d+)-fw-editor-viewer$') { $Matches[1] } else { throw "Unexpected viewer build marker: $ViewerBuild" }
    $cacheKey = "fw-editor-viewer-v$major"
    $text = Get-Content -LiteralPath $Path -Raw
    $text = [regex]::Replace($text, 'v\d+-fw-editor-viewer', $ViewerBuild)
    $text = [regex]::Replace($text, 'fw-editor-viewer-v\d+', $cacheKey)
    Set-Content -LiteralPath $Path -Value $text -Encoding UTF8 -NoNewline
}

$viewerBuild = Get-FwEditorViewerBuild -RootPath $Root
foreach ($asset in @('ac-rule-viewer.html', 'ac-rule-viewer.js', 'ac-rule-viewer.css')) {
    Apply-FwEditorViewerBuildMarker -Path (Join-Path $sourceDir $asset) -ViewerBuild $viewerBuild
}

$assets = @('ac-rule-viewer.html', 'ac-rule-viewer.js', 'ac-rule-viewer.css')
foreach ($asset in $assets) {
    $source = Join-Path $sourceDir $asset
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Missing canonical viewer asset: $source"
    }

    Copy-Item -LiteralPath $source -Destination (Join-Path $Root $asset) -Force
    Copy-Item -LiteralPath $source -Destination (Join-Path $coreDir $asset) -Force
}

Copy-Item -LiteralPath (Join-Path $sourceDir 'ac-rule-viewer.html') -Destination (Join-Path $coreDir 'ac-viewer-template.html') -Force
Copy-Item -LiteralPath (Join-Path $sourceDir 'ac-rule-viewer.css') -Destination (Join-Path $coreDir 'ac-viewer-template.css') -Force

Write-Host "Viewer assets synchronized from src\viewer." -ForegroundColor Green
