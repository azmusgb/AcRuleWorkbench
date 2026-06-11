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

node .\scripts\repair-viewer-state.js
if ($LASTEXITCODE -ne 0) {
    throw "repair-viewer-state.js failed with exit code $LASTEXITCODE"
}
