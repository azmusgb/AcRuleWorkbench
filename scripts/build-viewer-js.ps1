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

$moduleDir = Join-Path $Root "src\viewer\js"
$output = Join-Path $Root "src\viewer\ac-rule-viewer.js"

if (-not (Test-Path -LiteralPath $moduleDir -PathType Container)) {
    throw "Missing viewer JS module directory: $moduleDir"
}

$modules = @(Get-ChildItem -LiteralPath $moduleDir -Filter "*.js" -File | Sort-Object Name)
if ($modules.Count -eq 0) {
    throw "No viewer JS modules found in $moduleDir"
}

$bundle = New-Object System.Text.StringBuilder
foreach ($module in $modules) {
    [void]$bundle.Append([System.IO.File]::ReadAllText($module.FullName))
}

$encoding = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($output, $bundle.ToString(), $encoding)

Write-Host "Built viewer JS bundle from $($modules.Count) module(s): $output" -ForegroundColor Green