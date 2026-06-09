<#
.SYNOPSIS
  Builds AcRuleWorkbench as a 32-bit/x86 .NET Framework 4.8 application.

.DESCRIPTION
  FormWorks/DCM native interop DLLs are 32-bit in this environment. This script intentionally
  defaults to x86 and refuses x64/Any CPU unless -AllowNonX86 is explicitly supplied.

.EXAMPLE
  .\scripts\build.ps1

.EXAMPLE
  .\scripts\build.ps1 -Configuration Release
#>
[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Debug',

    [ValidateSet('x86', 'Any CPU', 'AnyCPU', 'x64')]
    [string]$Platform = 'x86',

    [switch]$AllowNonX86,
    [switch]$NoRestore,
    [switch]$Clean
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Resolve-RepoRoot {
    $scriptPath = $PSCommandPath
    if ([string]::IsNullOrWhiteSpace($scriptPath)) { $scriptPath = $MyInvocation.MyCommand.Path }
    $scriptDir = Split-Path -Parent $scriptPath
    return (Resolve-Path -LiteralPath (Join-Path $scriptDir '..')).Path
}

function Find-MSBuild {
    $cmd = Get-Command msbuild.exe -ErrorAction SilentlyContinue
    if ($null -ne $cmd) { return $cmd.Source }

    $vsWhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (Test-Path -LiteralPath $vsWhere) {
        $found = & $vsWhere -latest -requires Microsoft.Component.MSBuild -find 'MSBuild\**\Bin\MSBuild.exe' 2>$null | Select-Object -First 1
        if (-not [string]::IsNullOrWhiteSpace($found)) { return $found }
    }

    $candidates = @(
        'C:\Program Files\Microsoft Visual Studio\2022\Enterprise\MSBuild\Current\Bin\MSBuild.exe',
        'C:\Program Files\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe',
        'C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe',
        'C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\MSBuild\Current\Bin\MSBuild.exe',
        'C:\Program Files (x86)\Microsoft Visual Studio\2019\Enterprise\MSBuild\Current\Bin\MSBuild.exe',
        'C:\Program Files (x86)\Microsoft Visual Studio\2019\Professional\MSBuild\Current\Bin\MSBuild.exe',
        'C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\MSBuild\Current\Bin\MSBuild.exe'
    )

    return ($candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1)
}

function Get-SolutionPath {
    param([Parameter(Mandatory = $true)][string]$Root)
    $preferred = Join-Path $Root 'AcRuleWorkbench.sln'
    if (Test-Path -LiteralPath $preferred) { return $preferred }

    $slnx = Get-ChildItem -LiteralPath $Root -File -Filter '*.slnx' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $slnx) { return $slnx.FullName }

    $sln = Get-ChildItem -LiteralPath $Root -File -Filter '*.sln' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $sln) { return $sln.FullName }

    throw "No solution file found in $Root."
}

function Assert-X86 {
    param([string]$PlatformValue, [switch]$AllowNonX86)
    $normalized = ($PlatformValue -replace '\s+', '').ToLowerInvariant()
    if ($normalized -ne 'x86' -and -not $AllowNonX86) {
        throw "This workbench must run against 32-bit FormWorks/DCM native DLLs. Use -Platform x86, or pass -AllowNonX86 only for non-FormWorks compile checks."
    }
}

$repoRoot = Resolve-RepoRoot
$solutionPath = Get-SolutionPath -Root $repoRoot
$msbuild = Find-MSBuild
if ([string]::IsNullOrWhiteSpace($msbuild)) {
    throw 'MSBuild.exe was not found. Open a Visual Studio Developer PowerShell or install Visual Studio Build Tools.'
}

Assert-X86 -PlatformValue $Platform -AllowNonX86:$AllowNonX86

$managedLibDir = Join-Path $repoRoot 'lib'
$nativeLibDir = Join-Path $repoRoot 'rri_bin'
foreach ($runtimeDir in @($nativeLibDir, $managedLibDir)) {
    if (Test-Path -LiteralPath $runtimeDir) {
        $env:PATH = "$runtimeDir;$env:PATH"
    }
}

$args = @()
$args += $solutionPath
$args += '/m'
if (-not $NoRestore) { $args += '/restore' }
if ($Clean) { $args += '/t:Clean;Build' }
$args += "/p:Configuration=$Configuration"
$args += "/p:Platform=$Platform"
$args += '/p:PlatformTarget=x86'
$args += '/p:Prefer32Bit=true'
$args += '/p:TargetFramework=net48'
$args += '/v:minimal'

Write-Host "MSBuild : $msbuild" -ForegroundColor Cyan
Write-Host "Solution: $solutionPath" -ForegroundColor Cyan
Write-Host "Config  : $Configuration" -ForegroundColor Cyan
Write-Host "Platform: $Platform" -ForegroundColor Cyan
Write-Host "Expected output: AcRuleWorkbench\bin\x86\$Configuration\net48" -ForegroundColor Cyan
Write-Host ''

Push-Location $repoRoot
try {
    & $msbuild @args
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) { exit $exitCode }

    $expectedExe = Join-Path $repoRoot "AcRuleWorkbench\bin\x86\$Configuration\net48\AcRuleWorkbench.exe"
    if ($Platform -eq 'x86' -and -not (Test-Path -LiteralPath $expectedExe -PathType Leaf)) {
        throw "Build completed but the x86 executable was not found: $expectedExe"
    }

    Write-Host ''
    Write-Host "Build complete: $expectedExe" -ForegroundColor Green
    exit 0
}
finally {
    Pop-Location
}
