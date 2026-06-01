<#
.SYNOPSIS
  One-command setup, build, and doctor run for AcRuleWorkbench.
#>
[CmdletBinding()]
param(
    [string]$HarnessRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$RriRoot = "C:\rri",
    [string]$DcmBinRoot = "C:\rri\ddce\bin",
    [string]$Configuration = "Debug",
    [string]$Platform = "x86",
    [switch]$RequireNativeOk,
    [switch]$CopyNative,
    [switch]$RunQualityChecks
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($RunQualityChecks) {
    & (Join-Path $PSScriptRoot "test-code-quality.ps1") -Root $HarnessRoot
}

& (Join-Path $PSScriptRoot "setup-dcm-deps.ps1") -HarnessRoot $HarnessRoot -RriRoot $RriRoot -DcmBinRoot $DcmBinRoot -CopyNative:$CopyNative

$runtimePath = Join-Path $PSScriptRoot "runtime-path.generated.ps1"
if (Test-Path $runtimePath) { . $runtimePath }

Push-Location $HarnessRoot
try {
    $msbuild = Get-Command msbuild.exe -ErrorAction SilentlyContinue
    $msbuildPath = if ($msbuild) { $msbuild.Source } else { $null }
    if (-not $msbuildPath) {
        $candidates = @(
            "C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin\MSBuild.exe",
            "C:\Program Files\Microsoft Visual Studio\18\Professional\MSBuild\Current\Bin\MSBuild.exe",
            "C:\Program Files\Microsoft Visual Studio\18\Enterprise\MSBuild\Current\Bin\MSBuild.exe",
            "C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe",
            "C:\Program Files\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe",
            "C:\Program Files\Microsoft Visual Studio\2022\Enterprise\MSBuild\Current\Bin\MSBuild.exe"
        )
        $msbuildPath = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    }
    if (-not $msbuildPath) {
        throw "msbuild.exe was not found. Open a Visual Studio Developer PowerShell or install Build Tools."
    }

    & $msbuildPath "AcRuleWorkbench.sln" /restore "/p:Configuration=$Configuration" "/p:Platform=$Platform"
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $exeCandidates = @(
        (Join-Path $HarnessRoot "AcRuleWorkbench\bin\$Platform\$Configuration\net48\AcRuleWorkbench.exe"),
        (Join-Path $HarnessRoot "AcRuleWorkbench\bin\$Configuration\net48\AcRuleWorkbench.exe")
    )
    $exe = $exeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $exe) {
        throw "Built EXE not found. Checked: $($exeCandidates -join '; ')"
    }

    $args = @("doctor")
    if ($RequireNativeOk) { $args += "--require-native-ok" }

    & $exe @args
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
