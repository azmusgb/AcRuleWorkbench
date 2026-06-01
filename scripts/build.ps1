[CmdletBinding()]
param(
    [string]$Configuration = "Debug",
    [string]$Platform = "x86"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $root
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
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
