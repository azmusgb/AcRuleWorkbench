[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$moduleDir = Join-Path $Root 'src\viewer\js'
$output = Join-Path $Root 'src\viewer\ac-rule-viewer.js'

if (-not (Test-Path -LiteralPath $moduleDir -PathType Container)) {
    throw "Missing viewer JS module directory: $moduleDir"
}

$modules = Get-ChildItem -LiteralPath $moduleDir -Filter '*.js' -File | Sort-Object Name
if ($modules.Count -eq 0) {
    throw "No viewer JS modules found in $moduleDir"
}

$bundle = New-Object System.Text.StringBuilder
foreach ($module in $modules) {
    [void]$bundle.Append((Get-Content -LiteralPath $module.FullName -Raw))
}

Set-Content -LiteralPath $output -Value $bundle.ToString() -Encoding UTF8 -NoNewline
Write-Host "Built viewer JS bundle from $($modules.Count) module(s): $output" -ForegroundColor Green
