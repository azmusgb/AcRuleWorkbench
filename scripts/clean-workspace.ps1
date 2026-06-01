[CmdletBinding()]
param(
    [switch]$Strict,
    [switch]$IncludeGeneratedViewer
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    $paths = @(
        ".vs",
        "AcRuleWorkbench\bin",
        "AcRuleWorkbench\obj",
        "AcRuleWorkbench.Core\bin",
        "AcRuleWorkbench.Core\obj",
        "AcRuleWorkbench.Tests\bin",
        "AcRuleWorkbench.Tests\obj",
        "scripts\runtime-path.generated.ps1"
    )

    foreach ($path in $paths) {
        if (Test-Path $path) {
            Remove-Item -Recurse -Force $path
            Write-Host "Removed $path"
        }
    }

    Remove-Item -Force ".\lib\*.dll" -ErrorAction SilentlyContinue

    if ($IncludeGeneratedViewer) {
        Remove-Item -Force ".\ac-rule-viewer.html" -ErrorAction SilentlyContinue
        Remove-Item -Force ".\ac-rules.json" -ErrorAction SilentlyContinue
        Remove-Item -Force ".\ac-tree.json" -ErrorAction SilentlyContinue
        Remove-Item -Force ".\inspect.json" -ErrorAction SilentlyContinue
    }

    if ($Strict) {
        & ".\scripts\validate-repo.ps1" -Strict
    }
}
finally {
    Pop-Location
}
