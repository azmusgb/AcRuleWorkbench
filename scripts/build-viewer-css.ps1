[CmdletBinding()]
param(
    [string]$Root = ""
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Root)) {
    $scriptRoot = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
        $PSScriptRoot
    }
    elseif ($MyInvocation.MyCommand.Path) {
        Split-Path -Parent $MyInvocation.MyCommand.Path
    }
    else {
        (Get-Location).Path
    }

    $Root = (Resolve-Path -LiteralPath (Join-Path $scriptRoot "..")).ProviderPath
}
else {
    $Root = (Resolve-Path -LiteralPath $Root).ProviderPath
}

$layerDir = Join-Path $Root "src\viewer\styles"
$output = Join-Path $Root "src\viewer\ac-rule-viewer.css"

if (-not (Test-Path -LiteralPath $layerDir -PathType Container)) {
    throw "Missing viewer CSS layer directory: $layerDir"
}

$layers = @(Get-ChildItem -LiteralPath $layerDir -Filter "*.css" -File | Sort-Object Name)
if ($layers.Count -eq 0) {
    throw "No viewer CSS layers found in $layerDir"
}

$bundle = New-Object System.Text.StringBuilder
foreach ($layer in $layers) {
    [void]$bundle.Append([System.IO.File]::ReadAllText($layer.FullName))
}

$encoding = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($output, $bundle.ToString(), $encoding)

Write-Host "Built viewer CSS bundle from $($layers.Count) layer(s): $output" -ForegroundColor Green