<#
.SYNOPSIS
  Runs AcRuleWorkbench doctor from the x86/net48 output folder.
#>
[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Debug',

    [ValidateSet('x86')]
    [string]$Platform = 'x86',

    [switch]$RequireNativeOk,
    [switch]$Json
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$runtimePath = Join-Path $PSScriptRoot 'runtime-path.generated.ps1'
if (Test-Path -LiteralPath $runtimePath -PathType Leaf) { . $runtimePath }

foreach ($runtimeDir in @((Join-Path $root 'rri_bin'), (Join-Path $root 'lib'))) {
    if (Test-Path -LiteralPath $runtimeDir) { $env:PATH = "$runtimeDir;$env:PATH" }
}
$env:ACRULEWORKBENCH_PLATFORM = 'x86'

$exe = Join-Path $root "AcRuleWorkbench\bin\x86\$Configuration\net48\AcRuleWorkbench.exe"
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
    throw "x86 AcRuleWorkbench.exe not found: $exe. Run .\scripts\build-and-doctor.ps1 first."
}

$args = @('doctor')
if ($RequireNativeOk) { $args += '--require-native-ok' }
if ($Json) { $args += '--json' }

Push-Location (Split-Path -Parent $exe)
try {
    & $exe @args
    exit $LASTEXITCODE
}
finally { Pop-Location }
