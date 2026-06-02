[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch]$IncludeVs,
    [switch]$KillVisualStudio,
    [switch]$KillDotnet,
    [switch]$DryRun
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

function Write-Section {
    param([Parameter(Mandatory = $true)][string]$Text)
    Write-Host ""
    Write-Host "== $Text ==" -ForegroundColor Cyan
}

function Resolve-RepoRoot {
    $scriptPath = $PSCommandPath
    if ([string]::IsNullOrWhiteSpace($scriptPath)) {
        $scriptPath = $MyInvocation.MyCommand.Path
    }

    $scriptDir = Split-Path -Parent $scriptPath
    return (Resolve-Path -LiteralPath (Join-Path $scriptDir "..")).Path
}

function Stop-ProcessesByName {
    param(
        [Parameter(Mandatory = $true)][string[]]$Names
    )

    foreach ($name in $Names) {
        $processes = @(Get-Process -Name $name -ErrorAction SilentlyContinue)
        foreach ($process in $processes) {
            try {
                Write-Warning "Stopping $($process.ProcessName) PID $($process.Id)"
                Stop-Process -Id $process.Id -Force -ErrorAction Stop
            }
            catch {
                Write-Warning "Could not stop $($process.ProcessName) PID $($process.Id): $($_.Exception.Message)"
            }
        }
    }
}

function Remove-PathSafely {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [int]$Retries = 3
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    if ($DryRun) {
        Write-Host "[dry-run] Would remove: $Path"
        return
    }

    for ($attempt = 1; $attempt -le $Retries; $attempt++) {
        try {
            if ($PSCmdlet.ShouldProcess($Path, "Remove recursively")) {
                Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
            }

            Write-Host "Removed: $Path"
            return
        }
        catch {
            $message = $_.Exception.Message

            if ($attempt -lt $Retries) {
                Write-Warning "Remove failed, retry ${attempt}/${Retries}: $Path :: $message"
                Start-Sleep -Milliseconds (250 * $attempt)
                continue
            }

            Write-Warning "Skipped locked/unremovable path: $Path :: $message"
            return
        }
    }
}

$repoRoot = Resolve-RepoRoot

Write-Section "Clean workspace"
Write-Host "Repo root: $repoRoot"

if ($KillVisualStudio) {
    Write-Section "Stopping Visual Studio"
    Stop-ProcessesByName -Names @("devenv")
}

if ($KillDotnet) {
    Write-Section "Stopping dotnet/msbuild/vstest"
    Stop-ProcessesByName -Names @("dotnet", "MSBuild", "VBCSCompiler", "vstest.console")
}

Write-Section "Removing build folders"

$excludedPathPattern = "\\(\.git|lib|rri_bin|packages|node_modules)(\\|$)"

$buildFolders = @()
$buildFolders += Get-ChildItem -LiteralPath $repoRoot -Directory -Filter "bin" -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch $excludedPathPattern }

$buildFolders += Get-ChildItem -LiteralPath $repoRoot -Directory -Filter "obj" -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch $excludedPathPattern }

$buildFolders += Get-ChildItem -LiteralPath $repoRoot -Directory -Filter "TestResults" -Recurse -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch $excludedPathPattern }

$buildFolders |
    Sort-Object FullName -Descending -Unique |
    ForEach-Object {
        Remove-PathSafely -Path $_.FullName
    }

Write-Section "Removing generated helper files"

$generatedFiles = @(
    (Join-Path $repoRoot "scripts\runtime-path.generated.ps1")
)

foreach ($file in $generatedFiles) {
    if (Test-Path -LiteralPath $file) {
        Remove-PathSafely -Path $file
    }
}

if ($IncludeVs) {
    Write-Section "Removing .vs folder"

    $vsPath = Join-Path $repoRoot ".vs"
    Remove-PathSafely -Path $vsPath
}
else {
    Write-Section "Skipping .vs"
    Write-Host "Use -IncludeVs to delete .vs. If Visual Studio is open, .vs files may be locked."
}

Write-Section "Preserved runtime folders"
Write-Host "Managed DLLs: $(Join-Path $repoRoot 'lib')"
Write-Host "Native DLLs : $(Join-Path $repoRoot 'rri_bin')"

Write-Host ""
Write-Host "Clean complete." -ForegroundColor Green
