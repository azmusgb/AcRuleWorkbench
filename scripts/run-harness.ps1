<#
.SYNOPSIS
  Runs AcRuleWorkbench.exe after applying the generated DCM native PATH.

.EXAMPLE
  .\scripts\run-harness.ps1 doctor

.EXAMPLE
  .\scripts\run-harness.ps1 ac-rules --path C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd --json
#>
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $HarnessArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$HarnessRoot = Split-Path -Parent $ScriptRoot

$runtimePath = Join-Path $ScriptRoot "runtime-path.generated.ps1"
if (Test-Path $runtimePath) {
    . $runtimePath
} else {
    Write-Warning "runtime-path.generated.ps1 not found. Run .\scripts\setup-dcm-deps.ps1 first, or ensure native DLLs are already on PATH."
}

$exeCandidates = @(
    (Join-Path $HarnessRoot "AcRuleWorkbench\bin\x86\Debug\net48\AcRuleWorkbench.exe"),
    (Join-Path $HarnessRoot "AcRuleWorkbench\bin\x86\Release\net48\AcRuleWorkbench.exe"),
    (Join-Path $HarnessRoot "AcRuleWorkbench\bin\Debug\net48\AcRuleWorkbench.exe"),
    (Join-Path $HarnessRoot "AcRuleWorkbench\bin\Release\net48\AcRuleWorkbench.exe")
)

$exe = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) {
    throw "Harness EXE not found. Checked: $($exeCandidates -join '; '). Run .\scripts\build-and-doctor.ps1 first."
}

if (-not $HarnessArgs -or $HarnessArgs.Count -eq 0) {
    $HarnessArgs = @("doctor")
}

& $exe @HarnessArgs
exit $LASTEXITCODE
