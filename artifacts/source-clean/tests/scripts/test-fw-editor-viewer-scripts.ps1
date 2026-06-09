[CmdletBinding()]
param(
    [string] $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

$script = Join-Path $RepoRoot 'scripts\start-fw-editor-viewer.ps1'
if (-not (Test-Path -LiteralPath $script -PathType Leaf)) {
    throw "Missing canonical startup script: $script"
}

$syntax = powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-Command '$script' -Syntax" | Out-String
foreach ($required in @('-ForceViewerRefresh', '-NoBuild', '-KillExisting', '-OpenWhenLive', '-ReadyTimeoutSeconds', '-DryRun')) {
    if ($syntax -notlike "*$required*") {
        throw "Startup script syntax is missing required parameter: $required`n$syntax"
    }
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -FwdPath '.\fwd.cfd' -Port 8787 -DryRun -NoBuild -NoBrowser -SkipRuntimeValidation -SkipViewerRefresh | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw "Dry-run startup contract failed with exit code $LASTEXITCODE"
}

Write-Host '[OK] FW Editor Viewer script contract passed.' -ForegroundColor Green
