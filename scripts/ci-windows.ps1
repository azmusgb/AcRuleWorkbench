<#!
.SYNOPSIS
  Runs the local Windows verification gates for AcRuleWorkbench.

.DESCRIPTION
  This script is Windows-oriented because the product targets .NET Framework 4.8,
  x86 native DLLs, and HttpListener behavior. It is safe to run from any current
  directory and it validates the generated source-clean package, not the dirty
  working tree, before release.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$Root,

    [Parameter(Mandatory = $false)]
    [switch]$SkipBrowserTests,

    [Parameter(Mandatory = $false)]
    [switch]$SkipDotNetTests,

    [Parameter(Mandatory = $false)]
    [switch]$SkipLint,

    [Parameter(Mandatory = $false)]
    [switch]$SkipPackage,

    [Parameter(Mandatory = $false)]
    [switch]$SkipWorkingTreeValidation,

    [Parameter(Mandatory = $false)]
    [string]$OutDir
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$scriptPath = $PSCommandPath
if ([string]::IsNullOrWhiteSpace($scriptPath)) {
    $scriptPath = $MyInvocation.MyCommand.Path
}

if ([string]::IsNullOrWhiteSpace($scriptPath)) {
    throw "Unable to determine ci-windows.ps1 script path."
}

$scriptDir = Split-Path -Parent $scriptPath

if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = (Resolve-Path -LiteralPath (Join-Path $scriptDir '..')).Path
}

$rootPath = [System.IO.Path]::GetFullPath($Root)

if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = Join-Path $rootPath 'artifacts'
}
else {
    $OutDir = [System.IO.Path]::GetFullPath($OutDir)
}

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )

    Write-Host ""
    Write-Host "==> $Name" -ForegroundColor Cyan
    & $Command
}

function Test-CommandAvailable {
    param([Parameter(Mandatory = $true)][string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

Push-Location $rootPath
try {
    Invoke-Step "Node syntax check for static server" {
        node --check .\server.js
    }

    Invoke-Step "Run viewer static contract tests" {
        npm test
    }

    if (-not $SkipLint) {
        if (Test-CommandAvailable -Name "npx") {
            Invoke-Step "Run viewer lint" {
                npm run lint:viewer
            }
        }
        else {
            Write-Warning "npx/npm lint tooling was not found; rerun without -SkipLint after installing Node dependencies."
        }
    }

    if (-not $SkipBrowserTests) {
        Invoke-Step "Run Playwright browser behavior tests" {
            npm run test:browser
        }
    }

    if (-not $SkipDotNetTests) {
        Invoke-Step ".NET Framework x86 tests" {
            dotnet test .\AcRuleWorkbench.sln -p:Platform=x86
        }
    }

    if (-not $SkipWorkingTreeValidation) {
        Invoke-Step "Validate working tree package exclusions" {
            powershell.exe -NoProfile -ExecutionPolicy Bypass `
                -File .\scripts\validate-package-boundaries.ps1 `
                -Root $rootPath `
                -Mode WorkingTree
        }
    }

    if (-not $SkipPackage) {
        Invoke-Step "Build source-clean package" {
            powershell.exe -NoProfile -ExecutionPolicy Bypass `
                -File .\scripts\package-source-clean.ps1 `
                -Root $rootPath `
                -OutDir $OutDir
        }

        $sourceClean = Join-Path $OutDir 'source-clean'
        if (-not (Test-Path -LiteralPath $sourceClean -PathType Container)) {
            throw "Source-clean staging folder was not produced: $sourceClean"
        }

        Invoke-Step "Validate generated source-clean package boundaries" {
            powershell.exe -NoProfile -ExecutionPolicy Bypass `
                -File .\scripts\validate-package-boundaries.ps1 `
                -Root $sourceClean `
                -Mode SourcePackage
        }
    }

    Write-Host ""
    Write-Host "CI checks completed." -ForegroundColor Green
}
finally {
    Pop-Location
}
