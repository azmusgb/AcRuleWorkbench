<#
.SYNOPSIS
  Removes files/folders created when a P0 replacement zip was accidentally extracted one level too deep.

.DESCRIPTION
  Run this from the repository root: C:\dev\AcRuleWorkbench.
  It removes misplaced nested replacement folders under .\AcRuleWorkbench\ so the SDK-style app project stops compiling duplicate classes and Core source files.
  It does not delete the real sibling projects .\AcRuleWorkbench.Core or .\AcRuleWorkbench.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$RepoRoot = (Get-Location).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-RepoRoot {
    param([string]$Path)

    $solution = Join-Path $Path 'AcRuleWorkbench.sln'
    $coreProject = Join-Path $Path 'AcRuleWorkbench.Core\AcRuleWorkbench.Core.csproj'
    $appProject = Join-Path $Path 'AcRuleWorkbench\AcRuleWorkbench.csproj'

    if (-not (Test-Path -LiteralPath $solution -PathType Leaf) -or
        -not (Test-Path -LiteralPath $coreProject -PathType Leaf) -or
        -not (Test-Path -LiteralPath $appProject -PathType Leaf)) {
        throw "RepoRoot does not look like the AcRuleWorkbench repository root: $Path"
    }
}

function Remove-PathSafe {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Reason
    )

    if (Test-Path -LiteralPath $Path) {
        if ($PSCmdlet.ShouldProcess($Path, "Remove misplaced P0 artifact: $Reason")) {
            Remove-Item -LiteralPath $Path -Recurse -Force
            Write-Host "[removed] $Path  ($Reason)"
        }
    }
    else {
        Write-Host "[ok] absent: $Path"
    }
}

$RepoRoot = [System.IO.Path]::GetFullPath($RepoRoot)
Assert-RepoRoot -Path $RepoRoot

$appRoot = Join-Path $RepoRoot 'AcRuleWorkbench'

# These folders are invalid inside the app project. Their presence causes duplicate types and missing FormWorks/rri references.
Remove-PathSafe -Path (Join-Path $appRoot 'AcRuleWorkbench.Core') -Reason 'Core project was nested under app project'
Remove-PathSafe -Path (Join-Path $appRoot 'AcRuleWorkbench')      -Reason 'App project was nested under app project'

# These root viewer sidecar files belong at repo root, not under the app project root.
$misplacedRootFiles = @(
    'ac-rule-viewer.html',
    'ac-rule-viewer-test.html',
    'ac-rule-viewer.js',
    'ac-rule-viewer.tree.json'
)

foreach ($fileName in $misplacedRootFiles) {
    Remove-PathSafe -Path (Join-Path $appRoot $fileName) -Reason 'repo-root viewer sidecar file was nested under app project'
}

# Guardrail: fail if known duplicate-causing paths still exist.
$remainingBadPaths = @(
    (Join-Path $appRoot 'AcRuleWorkbench.Core\AcStructuralTreeParser.cs'),
    (Join-Path $appRoot 'AcRuleWorkbench\Api\V1\WorkbenchApiService.cs'),
    (Join-Path $appRoot 'AcRuleWorkbench\Api\V1\WorkbenchSnapshot.cs')
) | Where-Object { Test-Path -LiteralPath $_ }

if ($remainingBadPaths.Count -gt 0) {
    throw "Mis-extracted P0 files still exist:`n$($remainingBadPaths -join [Environment]::NewLine)"
}

Write-Host '[ok] P0 mis-extract cleanup complete.'
