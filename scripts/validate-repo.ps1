<#
.SYNOPSIS
  Validates the AcRuleWorkbench repository layout.

.DESCRIPTION
  Default mode validates the working tree shape after normal local development. It allows
  build outputs, runtime-path.generated.ps1, and locally copied FormWorks/DCM DLLs because
  those are expected after running build/setup scripts.

  Use -Strict before packaging or committing. Strict mode fails on build outputs,
  generated runtime artifacts, and vendor DLLs in lib/.

.EXAMPLE
  .\scripts\validate-repo.ps1

.EXAMPLE
  .\scripts\validate-repo.ps1 -Strict
#>
[CmdletBinding()]
param(
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [switch]$Strict,
    [switch]$FailOnWarnings
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$problems = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Add-Problem([string]$Message) {
    $problems.Add($Message) | Out-Null
}

function Add-Warning([string]$Message) {
    $warnings.Add($Message) | Out-Null
}

function Test-RelativePath([string]$RelativePath) {
    return Test-Path (Join-Path $Root $RelativePath)
}

# These are always wrong: they are duplicate source/project trees that can be compiled
# recursively by SDK-style projects and cause duplicate type definitions.
$forbiddenDuplicateDirectories = @(
    "AcRuleWorkbench\AcRuleWorkbench",
    "AcRuleWorkbench.Core\AcRuleWorkbench.Core",
    "AcRuleWorkbench.Tests\AcRuleWorkbench.Tests",
    "docs\docs",
    "scripts\scripts",
    "installer\installer",
    "iis\iis"
)

foreach ($dir in $forbiddenDuplicateDirectories) {
    if (Test-RelativePath $dir) {
        Add-Problem "Forbidden duplicate source/project directory exists: $dir"
    }
}

$forbiddenRootFiles = @(
    "Program.cs",
    "AcRuleWorkbench.csproj"
)

foreach ($file in $forbiddenRootFiles) {
    if (Test-RelativePath $file) {
        Add-Problem "Forbidden root duplicate source/project file exists: $file"
    }
}

# These are normal after a build, but should not be packaged or committed.
$generatedOrBuildDirectories = @(
    ".vs",
    "AcRuleWorkbench\bin",
    "AcRuleWorkbench\obj",
    "AcRuleWorkbench.Core\bin",
    "AcRuleWorkbench.Core\obj",
    "AcRuleWorkbench.Tests\bin",
    "AcRuleWorkbench.Tests\obj"
)

foreach ($dir in $generatedOrBuildDirectories) {
    if (Test-RelativePath $dir) {
        $message = "Build/cache directory is present: $dir"
        if ($Strict) { Add-Problem $message } else { Add-Warning $message }
    }
}

$generatedFiles = @(
    "ac-rule-viewer.html",
    "ac-rules.json",
    "scripts\runtime-path.generated.ps1"
)

foreach ($file in $generatedFiles) {
    if (Test-RelativePath $file) {
        $message = "Generated artifact is present: $file"
        if ($Strict) { Add-Problem $message } else { Add-Warning $message }
    }
}

$libPath = Join-Path $Root "lib"
$dlls = Get-ChildItem -Path $libPath -Filter "*.dll" -File -ErrorAction SilentlyContinue
foreach ($dll in $dlls) {
    $message = "Vendor/installed DLL is present in lib and should not be committed: $($dll.FullName)"
    if ($Strict) { Add-Problem $message } else { Add-Warning $message }
}

$requiredFiles = @(
    "AcRuleWorkbench.sln",
    "AcRuleWorkbench\AcRuleWorkbench.csproj",
    "AcRuleWorkbench\Program.cs",
    "AcRuleWorkbench\WorkbenchApiServer.cs",
    "AcRuleWorkbench.Core\AcRuleWorkbench.Core.csproj",
    "AcRuleWorkbench.Core\FormWorksExtractionClient.cs",
    "AcRuleWorkbench.Core\Interop\FwdSession.cs",
    "AcRuleWorkbench.Core\Interop\SafeFwdHandle.cs",
    "AcRuleWorkbench.Core\Viewer\ac-viewer-template.html",
    "AcRuleWorkbench.Tests\AcRuleWorkbench.Tests.csproj",
    "scripts\setup-dcm-deps.ps1",
    "scripts\build-and-doctor.ps1",
    "lib\DLL_DEPENDENCIES.txt"
)

foreach ($file in $requiredFiles) {
    if (-not (Test-RelativePath $file)) {
        Add-Problem "Required file is missing: $file"
    }
}

if ($warnings.Count -gt 0) {
    Write-Host "Repository validation warnings:" -ForegroundColor Yellow
    foreach ($warning in $warnings) {
        Write-Host " - $warning" -ForegroundColor Yellow
    }
}

if ($FailOnWarnings -and $warnings.Count -gt 0) {
    Add-Problem "Warnings were treated as errors because -FailOnWarnings was specified."
}

if ($problems.Count -gt 0) {
    Write-Host "Repository validation failed." -ForegroundColor Red
    foreach ($problem in $problems) {
        Write-Host " - $problem" -ForegroundColor Red
    }
    exit 1
}

if ($Strict) {
    Write-Host "Repository validation passed in strict packaging/commit mode." -ForegroundColor Green
} else {
    Write-Host "Repository validation passed for local working tree." -ForegroundColor Green
    if ($warnings.Count -gt 0) {
        Write-Host "Run .\scripts\validate-repo.ps1 -Strict before committing or packaging." -ForegroundColor Yellow
    }
}
