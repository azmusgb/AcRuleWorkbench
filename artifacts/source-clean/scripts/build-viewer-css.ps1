[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$layerDir = Join-Path $Root 'src\viewer\styles'
$output = Join-Path $Root 'src\viewer\ac-rule-viewer.css'

if (-not (Test-Path -LiteralPath $layerDir -PathType Container)) {
    throw "Missing viewer CSS layer directory: $layerDir"
}

$layers = Get-ChildItem -LiteralPath $layerDir -Filter '*.css' -File | Sort-Object Name
if ($layers.Count -eq 0) {
    throw "No viewer CSS layers found in $layerDir"
}

$bundle = New-Object System.Text.StringBuilder
foreach ($layer in $layers) {
    [void]$bundle.Append((Get-Content -LiteralPath $layer.FullName -Raw))
}

Set-Content -LiteralPath $output -Value $bundle.ToString() -Encoding UTF8 -NoNewline
Write-Host "Built viewer CSS bundle from $($layers.Count) layer(s): $output" -ForegroundColor Green
