[CmdletBinding()]
param(
    [string]$Configuration = "Debug",
    [string]$Platform = "x86",
    [switch]$RequireNativeOk,
    [switch]$Json
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$runtimePath = Join-Path $PSScriptRoot "runtime-path.generated.ps1"
if (Test-Path $runtimePath) { . $runtimePath }

foreach ($runtimeDir in @((Join-Path $root "rri_bin"), (Join-Path $root "lib"))) {
    if (Test-Path -LiteralPath $runtimeDir) {
        $env:PATH = "$runtimeDir;$env:PATH"
    }
}

$exeCandidates = @(
    (Join-Path $root "AcRuleWorkbench\bin\$Platform\$Configuration\net48\AcRuleWorkbench.exe"),
    (Join-Path $root "AcRuleWorkbench\bin\$Configuration\net48\AcRuleWorkbench.exe")
)
$exe = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) {
    throw "Harness EXE not found. Checked: $($exeCandidates -join '; '). Run .\scripts\build-and-doctor.ps1 first."
}

$args = @("doctor")
if ($RequireNativeOk) { $args += "--require-native-ok" }
if ($Json) { $args += "--json" }

& $exe @args
exit $LASTEXITCODE
