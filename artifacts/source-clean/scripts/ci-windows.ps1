<#!
.SYNOPSIS
  Runs the source-clean validation and test gates expected before sharing AcRuleWorkbench.

.DESCRIPTION
  This script is intentionally Windows-oriented because the product targets .NET Framework 4.8,
  x86 native DLLs, and HttpListener behavior that should be verified on Windows.
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
    [switch]$SkipLint
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
    $Root = Resolve-Path (Join-Path $scriptDir '..')
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

$rootPath = [System.IO.Path]::GetFullPath($Root)

Push-Location $rootPath
try {
    Invoke-Step "Validate working tree package exclusions" {
        powershell.exe -NoProfile -ExecutionPolicy Bypass `
            -File .\scripts\validate-package-boundaries.ps1 `
            -Root $rootPath `
            -Mode WorkingTree
    }

    Invoke-Step "Run viewer static contract tests" {
        npm test
    }

    if (-not $SkipLint) {
        Invoke-Step "Run viewer lint" {
            npm run lint:viewer
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

    Invoke-Step "Build source-clean package" {
        powershell.exe -NoProfile -ExecutionPolicy Bypass `
            -File .\scripts\package-source-clean.ps1 `
            -Root $rootPath `
            -OutDir .\artifacts
    }

    $sourceClean = Join-Path $rootPath 'artifacts\source-clean'

    if (Test-Path -LiteralPath $sourceClean) {
        Invoke-Step "Validate generated source-clean package boundaries" {
            powershell.exe -NoProfile -ExecutionPolicy Bypass `
                -File .\scripts\validate-package-boundaries.ps1 `
                -Root $sourceClean `
                -Mode SourcePackage
        }
    }
    else {
        Write-Warning "artifacts\source-clean was not found after packaging; validate the extracted package before sharing."
    }

    Write-Host ""
    Write-Host "CI checks completed." -ForegroundColor Green
}
finally {
    Pop-Location
}