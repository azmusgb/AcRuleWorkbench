<#
.SYNOPSIS
  Builds and validates the AcRuleWorkbench x86 runtime layout.

.DESCRIPTION
  This script is intentionally x86-first because FormWorks/DCM native DLLs are 32-bit.
  It validates .\lib for managed wrapper DLLs, .\rri_bin for native DLLs, builds with
  MSBuild using Platform=x86 and PlatformTarget=x86, then verifies the output under:

      AcRuleWorkbench\bin\x86\<Configuration>\net48

.EXAMPLE
  .\scripts\build-and-doctor.ps1

.EXAMPLE
  .\scripts\build-and-doctor.ps1 -Configuration Release -CopyNativeToOutput
#>
[CmdletBinding()]
param(
    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Debug',

    [ValidateSet('x86', 'Any CPU', 'AnyCPU', 'x64')]
    [string]$Platform = 'x86',

    [switch]$AllowNonX86,
    [switch]$Clean,
    [switch]$SkipBuild,
    [switch]$CopyNativeToOutput,

    [string]$FwdPath
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Write-Section { param([string]$Text) Write-Host ''; Write-Host "== $Text ==" -ForegroundColor Cyan }
function Write-Ok { param([string]$Text) Write-Host "[OK] $Text" -ForegroundColor Green }
function Write-Fail { param([string]$Text) Write-Host "[FAIL] $Text" -ForegroundColor Red }

function Resolve-RepoRoot {
    $scriptPath = $PSCommandPath
    if ([string]::IsNullOrWhiteSpace($scriptPath)) { $scriptPath = $MyInvocation.MyCommand.Path }
    $scriptDir = Split-Path -Parent $scriptPath
    return (Resolve-Path -LiteralPath (Join-Path $scriptDir '..')).Path
}

function Assert-X86 {
    param([string]$PlatformValue, [switch]$AllowNonX86)
    $normalized = ($PlatformValue -replace '\s+', '').ToLowerInvariant()
    if ($normalized -ne 'x86' -and -not $AllowNonX86) {
        throw "This workbench is tied to 32-bit FormWorks/DCM native interop. Use -Platform x86. Use -AllowNonX86 only for non-runtime compile experiments."
    }
}

function Find-MSBuild {
    $cmd = Get-Command msbuild.exe -ErrorAction SilentlyContinue
    if ($null -ne $cmd) { return $cmd.Source }

    $vsWhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (Test-Path -LiteralPath $vsWhere) {
        $result = & $vsWhere -latest -requires Microsoft.Component.MSBuild -find 'MSBuild\**\Bin\MSBuild.exe' 2>$null | Select-Object -First 1
        if (-not [string]::IsNullOrWhiteSpace($result)) { return $result }
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

    throw "No .sln or .slnx file found in $Root."
}

function Test-ExpectedFiles {
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [Parameter(Mandatory = $true)][string[]]$ExpectedNames,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if (-not (Test-Path -LiteralPath $Directory)) {
        Write-Fail "$Label directory missing: $Directory"
        return $false
    }

    $actualNames = @(Get-ChildItem -LiteralPath $Directory -File -Filter '*.dll' -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
    $missing = @($ExpectedNames | Where-Object { $actualNames -notcontains $_ })

    if ($missing.Count -gt 0) {
        Write-Fail "$Label missing in $Directory`: $($missing -join ', ')"
        return $false
    }

    Write-Ok "$Label present in $Directory"
    return $true
}

function Copy-DllsToOutput {
    param(
        [Parameter(Mandatory = $true)][string]$SourceDir,
        [Parameter(Mandatory = $true)][string]$OutputDir,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if (-not (Test-Path -LiteralPath $SourceDir)) { throw "$Label source directory missing: $SourceDir" }
    if (-not (Test-Path -LiteralPath $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null }

    $dlls = @(Get-ChildItem -LiteralPath $SourceDir -File -Filter '*.dll' -ErrorAction Stop)
    if ($dlls.Count -eq 0) { throw "$Label source directory contains no DLLs: $SourceDir" }

    foreach ($dll in $dlls) {
        Copy-Item -LiteralPath $dll.FullName -Destination $OutputDir -Force -ErrorAction Stop
    }

    Write-Ok "Copied $Label DLLs to $OutputDir"
}

function Write-RuntimePathHelper {
    param(
        [Parameter(Mandatory = $true)][string]$NativeDir,
        [Parameter(Mandatory = $true)][string]$OutputPath
    )

    $escapedNativeDir = $NativeDir.Replace("'", "''")
    $content = @"
# Auto-generated by scripts\build-and-doctor.ps1.
# This project must load the 32-bit FormWorks/DCM native runtime from rri_bin.

`$NativeLibDir = '$escapedNativeDir'

if (-not (Test-Path -LiteralPath `$NativeLibDir)) {
    throw "Native FormWorks runtime folder not found: `$NativeLibDir"
}

`$currentPath = [Environment]::GetEnvironmentVariable('PATH', 'Process')
`$pathParts = @(`$currentPath -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace(`$_) })

if (`$pathParts -notcontains `$NativeLibDir) {
    [Environment]::SetEnvironmentVariable('PATH', "`$NativeLibDir;`$currentPath", 'Process')
    `$env:PATH = [Environment]::GetEnvironmentVariable('PATH', 'Process')
}

`$env:FORMWORKS_NATIVE_BIN = `$NativeLibDir
`$env:ACRULEWORKBENCH_PLATFORM = 'x86'
"@

    Set-Content -LiteralPath $OutputPath -Value $content -Encoding UTF8 -Force
    Write-Ok "Generated PATH helper: $OutputPath"
}

$repoRoot = Resolve-RepoRoot
$scriptDir = Join-Path $repoRoot 'scripts'
$managedLibDir = Join-Path $repoRoot 'lib'
$nativeLibDir = Join-Path $repoRoot 'rri_bin'
$runtimeHelperPath = Join-Path $scriptDir 'runtime-path.generated.ps1'
$outputDir = Join-Path $repoRoot "AcRuleWorkbench\bin\x86\$Configuration\net48"
$outputExe = Join-Path $outputDir 'AcRuleWorkbench.exe'

$expectedManagedDlls = @(
    'rribase_net.dll',
    'rrifwd_net.dll',
    'rridc_net.dll',
    'rriwf2_net.dll',
    'FormWorks.Core.dll',
    'FormWorks.Versioning.dll'
)

$expectedNativeDlls = @(
    'rribase.dll',
    'rrifwd.dll',
    'rridc.dll',
    'rriwf2.dll'
)

Assert-X86 -PlatformValue $Platform -AllowNonX86:$AllowNonX86

Write-Section 'Runtime layout'
Write-Host "Repo root  : $repoRoot"
Write-Host "Managed lib: $managedLibDir"
Write-Host "Native bin : $nativeLibDir"
Write-Host "Config     : $Configuration"
Write-Host "Platform   : $Platform"
Write-Host "Output     : $outputDir"

$managedOk = Test-ExpectedFiles -Directory $managedLibDir -ExpectedNames $expectedManagedDlls -Label 'Managed DLLs'
$nativeOk = Test-ExpectedFiles -Directory $nativeLibDir -ExpectedNames $expectedNativeDlls -Label 'Native DLLs'
if (-not $managedOk -or -not $nativeOk) {
    throw 'Runtime DLL layout is incomplete. Expected managed DLLs in .\lib and native DLLs in .\rri_bin.'
}

Write-RuntimePathHelper -NativeDir $nativeLibDir -OutputPath $runtimeHelperPath
. $runtimeHelperPath

if (-not [string]::IsNullOrWhiteSpace($FwdPath)) {
    $resolvedFwdPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($FwdPath)
    if (-not (Test-Path -LiteralPath $resolvedFwdPath -PathType Leaf)) { throw "FWD file not found: $resolvedFwdPath" }
    Write-Ok "FWD file present: $resolvedFwdPath"
}

if ($Clean) {
    Write-Section 'Clean before build'
    $cleanScript = Join-Path $scriptDir 'clean-workspace.ps1'
    if (Test-Path -LiteralPath $cleanScript) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $cleanScript
        if ($LASTEXITCODE -ne 0) { throw "clean-workspace.ps1 failed with exit code $LASTEXITCODE" }
    }
    else {
        Write-Warning "Clean script not found: $cleanScript"
    }
}

if (-not $SkipBuild) {
    Write-Section 'Build x86 net48'
    $msbuild = Find-MSBuild
    if ([string]::IsNullOrWhiteSpace($msbuild)) { throw 'MSBuild.exe was not found. Install Visual Studio Build Tools.' }
    $solution = Get-SolutionPath -Root $repoRoot

    $buildArgs = @(
        $solution,
        '/m',
        '/restore',
        "/p:Configuration=$Configuration",
        "/p:Platform=$Platform",
        '/p:PlatformTarget=x86',
        '/p:Prefer32Bit=true',
        '/p:TargetFramework=net48',
        '/v:minimal'
    )

    Write-Host "> $msbuild $($buildArgs -join ' ')" -ForegroundColor DarkGray
    Push-Location $repoRoot
    try {
        & $msbuild @buildArgs
        if ($LASTEXITCODE -ne 0) { throw "MSBuild failed with exit code $LASTEXITCODE" }
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Section 'Build skipped'
}

Write-Section 'Output doctor'
if (-not (Test-Path -LiteralPath $outputExe -PathType Leaf)) {
    throw "Expected x86 executable was not found: $outputExe"
}
Write-Ok "x86 executable found: $outputExe"

Copy-DllsToOutput -SourceDir $managedLibDir -OutputDir $outputDir -Label 'managed'
if ($CopyNativeToOutput) {
    Copy-DllsToOutput -SourceDir $nativeLibDir -OutputDir $outputDir -Label 'native'
}
else {
    Write-Host 'Native DLLs are not copied to output. They will be loaded from PATH via .\rri_bin.' -ForegroundColor Yellow
}

$managedOutputOk = Test-ExpectedFiles -Directory $outputDir -ExpectedNames $expectedManagedDlls -Label 'Output managed DLLs'
if (-not $managedOutputOk) { throw "Managed DLLs were not copied correctly to $outputDir" }

if ($CopyNativeToOutput) {
    $nativeOutputOk = Test-ExpectedFiles -Directory $outputDir -ExpectedNames $expectedNativeDlls -Label 'Output native DLLs'
    if (-not $nativeOutputOk) { throw "Native DLLs were not copied correctly to $outputDir" }
}

Write-Section 'Doctor summary'
Write-Ok 'Managed DLL source layout is valid.'
Write-Ok 'Native DLL source layout is valid.'
Write-Ok 'x86 net48 output layout is valid.'
Write-Ok 'Build/output doctor completed.'
Write-Host ''
Write-Host 'Next:' -ForegroundColor Cyan
Write-Host '.\scripts\start-workbench.ps1 -FwdPath C:\dev\AcRuleWorkbench\fwd.cfd -Port 8787 -KillExisting'
