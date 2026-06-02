[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$FwdPath,

    [int]$Port = 8787,

    [string]$HostName = "127.0.0.1",

    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug",

    [string]$Platform = "x86",

    [switch]$KillExisting,
    [switch]$NoBuild,
    [switch]$CopyNativeToOutput,
    [switch]$SkipViewerRefresh,

    [ValidateSet("Pascal", "Kebab", "None")]
    [string]$ArgumentStyle = "Pascal",

    [string[]]$ExtraArgs = @()
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

function Write-Section {
    param([Parameter(Mandatory = $true)][string]$Text)
    Write-Host ""
    Write-Host "== $Text ==" -ForegroundColor Cyan
}

function Write-Ok {
    param([Parameter(Mandatory = $true)][string]$Text)
    Write-Host "[OK] $Text" -ForegroundColor Green
}

function Resolve-RepoRoot {
    $scriptPath = $PSCommandPath
    if ([string]::IsNullOrWhiteSpace($scriptPath)) {
        $scriptPath = $MyInvocation.MyCommand.Path
    }

    $scriptDir = Split-Path -Parent $scriptPath
    return (Resolve-Path -LiteralPath (Join-Path $scriptDir "..")).Path
}

function Stop-ListenersOnPort {
    param([Parameter(Mandatory = $true)][int]$Port)

    $pids = @()

    $getNetTcpConnection = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
    if ($null -ne $getNetTcpConnection) {
        $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
        $pids += $connections | Select-Object -ExpandProperty OwningProcess -Unique
    }
    else {
        $lines = @(netstat -ano -p tcp | Select-String -Pattern "LISTENING" | Where-Object { $_.Line -match ":$Port\s" })
        foreach ($line in $lines) {
            $parts = @($line.Line -split "\s+" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
            if ($parts.Count -ge 5) {
                $pids += [int]$parts[$parts.Count - 1]
            }
        }
    }

    $pids = @($pids | Where-Object { $_ -gt 0 } | Sort-Object -Unique)

    if ($pids.Count -eq 0) {
        Write-Ok "No existing listener on port $Port"
        return
    }

    foreach ($pidValue in $pids) {
        try {
            $process = Get-Process -Id $pidValue -ErrorAction Stop
            Write-Warning "Stopping listener on port ${Port}: $($process.ProcessName) PID $pidValue"
            Stop-Process -Id $pidValue -Force -ErrorAction Stop
        }
        catch {
            Write-Warning "Could not stop PID $pidValue on port ${Port}: $($_.Exception.Message)"
        }
    }
}

function Find-WorkbenchExe {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Configuration,
        [Parameter(Mandatory = $true)][string]$Platform
    )

    $preferred = @(
        (Join-Path $Root "AcRuleWorkbench\bin\$Platform\$Configuration\net48\AcRuleWorkbench.exe"),
        (Join-Path $Root "AcRuleWorkbench\bin\$Configuration\net48\AcRuleWorkbench.exe"),
        (Join-Path $Root "bin\$Platform\$Configuration\net48\AcRuleWorkbench.exe")
    )

    foreach ($candidate in $preferred) {
        if (Test-Path -LiteralPath $candidate) {
            return (Get-Item -LiteralPath $candidate)
        }
    }

    $excludedPathPattern = "\\(\.git|\.vs|lib|rri_bin|packages|node_modules)(\\|$)"

    $all = @(Get-ChildItem -LiteralPath $Root -File -Filter "*.exe" -Recurse -Force -ErrorAction SilentlyContinue |
        Where-Object {
            $_.FullName -notmatch $excludedPathPattern -and
            $_.FullName -match "\\bin\\" -and
            $_.FullName -match "\\$([regex]::Escape($Configuration))(\\|$)"
        })

    $preferredName = $all |
        Where-Object { $_.Name -eq "AcRuleWorkbench.exe" } |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1

    if ($null -ne $preferredName) {
        return $preferredName
    }

    return ($all | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1)
}

function Test-RuntimeFolder {
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [Parameter(Mandatory = $true)][string[]]$RequiredDlls,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if (-not (Test-Path -LiteralPath $Directory)) {
        throw "$Label directory not found: $Directory"
    }

    $actualNames = @(Get-ChildItem -LiteralPath $Directory -File -Filter "*.dll" -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
    $missing = @($RequiredDlls | Where-Object { $actualNames -notcontains $_ })

    if ($missing.Count -gt 0) {
        throw "$Label missing required DLLs in $Directory`: $($missing -join ', ')"
    }

    Write-Ok "$Label validated: $Directory"
}

$repoRoot = Resolve-RepoRoot
$scriptDir = Join-Path $repoRoot "scripts"
$managedLibDir = Join-Path $repoRoot "lib"
$nativeLibDir = Join-Path $repoRoot "rri_bin"
$runtimeHelperPath = Join-Path $scriptDir "runtime-path.generated.ps1"

$expectedManagedDlls = @(
    "rribase_net.dll",
    "rrifwd_net.dll",
    "rridc_net.dll",
    "rriwf2_net.dll",
    "FormWorks.Core.dll",
    "FormWorks.Versioning.dll"
)

$expectedNativeDlls = @(
    "rribase.dll",
    "rrifwd.dll",
    "rridc.dll",
    "rriwf2.dll"
)

Write-Section "Start AC Rule Workbench"
Write-Host "Repo root : $repoRoot"
Write-Host "FWD path  : $FwdPath"
Write-Host "Port      : $Port"
Write-Host "Config    : $Configuration"
Write-Host "Platform  : $Platform"

if ($FwdPath -match "^:\\") {
    throw "Invalid FwdPath '$FwdPath'. You probably meant C:\dev\AcRuleWorkbench\fwd.cfd"
}

$resolvedFwdPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($FwdPath)
if (-not (Test-Path -LiteralPath $resolvedFwdPath)) {
    throw "FWD file not found: $resolvedFwdPath"
}

Test-RuntimeFolder -Directory $managedLibDir -RequiredDlls $expectedManagedDlls -Label "Managed DLL folder"
Test-RuntimeFolder -Directory $nativeLibDir -RequiredDlls $expectedNativeDlls -Label "Native DLL folder"

if ($KillExisting) {
    Write-Section "Kill existing listener"
    Stop-ListenersOnPort -Port $Port
}

if (-not $NoBuild) {
    Write-Section "Build and doctor"

    $buildScript = Join-Path $scriptDir "build-and-doctor.ps1"
    if (-not (Test-Path -LiteralPath $buildScript)) {
        throw "Build script not found: $buildScript"
    }

    $buildArgs = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $buildScript,
        "-Configuration", $Configuration,
        "-Platform", $Platform,
        "-FwdPath", $resolvedFwdPath
    )

    if ($CopyNativeToOutput) {
        $buildArgs += "-CopyNativeToOutput"
    }

    & powershell.exe @buildArgs
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        throw "build-and-doctor.ps1 failed with exit code $exitCode"
    }
}
else {
    Write-Section "Build skipped"
}

Write-Section "Runtime PATH"

if (Test-Path -LiteralPath $runtimeHelperPath) {
    . $runtimeHelperPath
    Write-Ok "Loaded runtime PATH helper: $runtimeHelperPath"
}
else {
    $currentPath = [Environment]::GetEnvironmentVariable("PATH", "Process")
    $pathParts = @($currentPath -split ";" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

    if ($pathParts -notcontains $nativeLibDir) {
        [Environment]::SetEnvironmentVariable("PATH", "$nativeLibDir;$currentPath", "Process")
        $env:PATH = [Environment]::GetEnvironmentVariable("PATH", "Process")
    }

    $env:FORMWORKS_NATIVE_BIN = $nativeLibDir
    Write-Ok "Prepended native runtime folder to PATH: $nativeLibDir"
}

$workbenchExe = Find-WorkbenchExe -Root $repoRoot -Configuration $Configuration -Platform $Platform
if ($null -eq $workbenchExe) {
    throw "Could not find AcRuleWorkbench executable under bin for configuration '$Configuration'."
}

$viewerOutputPath = Join-Path $repoRoot "ac-rule-viewer.html"
$exeDir = Split-Path -Parent $workbenchExe.FullName

Test-RuntimeFolder -Directory $exeDir -RequiredDlls $expectedManagedDlls -Label "Executable managed DLL folder"

$env:ACRULEWORKBENCH_FWD_PATH = $resolvedFwdPath
$env:ACRULEWORKBENCH_PORT = "$Port"
$env:FW_WORKBENCH_FWD_PATH = $resolvedFwdPath
$env:FW_WORKBENCH_PORT = "$Port"
$env:ASPNETCORE_URLS = "http://$HostName`:$Port"

Write-Section "Viewer refresh"
if ($SkipViewerRefresh) {
    Write-Host "Skipping viewer refresh. Existing file will be used: $viewerOutputPath" -ForegroundColor Yellow
}
else {
    # Regenerate the root viewer artifact from the current FWD so the served HTML does not go stale.
    $viewerArgs = @(
        "ac-viewer",
        "--path", $resolvedFwdPath,
        "--process", "AC",
        "--out", $viewerOutputPath
    )

    Push-Location $exeDir
    try {
        & $workbenchExe.FullName @viewerArgs
        $viewerExitCode = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }

    if ($viewerExitCode -ne 0) {
        throw "Viewer refresh failed with exit code $viewerExitCode"
    }

    if (-not (Test-Path -LiteralPath $viewerOutputPath)) {
        throw "Viewer refresh completed but output file is missing: $viewerOutputPath"
    }

    Write-Ok "Viewer refreshed: $viewerOutputPath"
}

$appArgs = @("api")

switch ($ArgumentStyle) {
    "Pascal" {
        $appArgs += @("--Path", $resolvedFwdPath, "--Port", "$Port", "--Host", $HostName, "--Viewer", $viewerOutputPath)
    }
    "Kebab" {
        $appArgs += @("--path", $resolvedFwdPath, "--port", "$Port", "--host", $HostName, "--viewer", $viewerOutputPath)
    }
    "None" {
        $appArgs += @("--path", $resolvedFwdPath, "--port", "$Port", "--host", $HostName, "--viewer", $viewerOutputPath)
    }
}

if ($ExtraArgs.Count -gt 0) {
    $appArgs += $ExtraArgs
}

Write-Section "Launch"
Write-Host "Executable : $($workbenchExe.FullName)"
Write-Host "Working dir: $exeDir"
Write-Host "Health     : http://$HostName`:$Port/api/v1/health/live"
Write-Host "Default FWD: $resolvedFwdPath"
Write-Host "Viewer file: $viewerOutputPath"
Write-Host ""
Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host ""

Push-Location $exeDir

try {
    & $workbenchExe.FullName @appArgs
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
