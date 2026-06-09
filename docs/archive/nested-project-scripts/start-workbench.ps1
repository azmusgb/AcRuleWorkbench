# Compatibility wrapper. The repository-root scripts folder is authoritative.
Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$target = Join-Path $repoRoot "scripts\start-workbench.ps1"

if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
    throw "Root start-workbench.ps1 not found: $target"
}

& $target @args
exit $LASTEXITCODE
