[CmdletBinding()]
param(
    [string]$FwdPath = "",

    [int]$Port = 8787,

    [string]$HostName = "127.0.0.1",

    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug",

    [string]$Platform = "x86",

    [ValidateSet("viewer-safe", "diagnostic", "full-evidence")]
    [string]$Profile = "viewer-safe",

    [switch]$KillExisting,
    [switch]$NoBuild,
    [switch]$Clean,
    [switch]$NoBrowser,
    [switch]$CopyNativeToOutput,
    [switch]$SkipViewerRefresh,
    [switch]$NoAutoPort,
    [switch]$SkipRuntimeValidation,
    [switch]$CheckWorkingTree,
    [switch]$Detached,
    [switch]$NoWaitReady,
    [switch]$EnableDebugApi,
    [switch]$AllowPathQuery,
    [switch]$EnableCors,
    [switch]$DisableSnapshotCache,
    [switch]$AllowRefresh,

    [ValidateRange(1, 200)]
    [int]$PortSearchLimit = 25,

    [ValidateRange(5, 600)]
    [int]$ReadyTimeoutSeconds = 90,

    [ValidateSet("Pascal", "Kebab", "None")]
    [string]$ArgumentStyle = "Kebab",

    [string[]]$ExtraArgs = @()
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    $scriptRoot = $PSScriptRoot
}
else {
    $scriptRoot = Split-Path -Parent $PSCommandPath
}
$commonRoot = Join-Path $scriptRoot "common"

. (Join-Path $commonRoot "workbench-logging.ps1")
. (Join-Path $commonRoot "workbench-paths.ps1")
. (Join-Path $commonRoot "workbench-runtime.ps1")
. (Join-Path $commonRoot "workbench-health.ps1")

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

$repoRoot = Resolve-WbRepoRoot
$scriptDir = Get-WbScriptDirectory -Root $repoRoot
$managedLibDir = Get-WbManagedLibDirectory -Root $repoRoot
$nativeLibDir = Get-WbNativeLibDirectory -Root $repoRoot
$requestedPort = $Port

if ($Profile -eq "full-evidence") {
    Write-WbWarn "Profile 'full-evidence' enables private/full FWD resource traversal and may generate sensitive local evidence output. Use only for local diagnostics."
}

Write-WbSection "Start AC Rule Workbench"
Write-WbKeyValue "Repo root" $repoRoot
if ([string]::IsNullOrWhiteSpace($FwdPath)) {
    $displayFwdPath = Join-Path $repoRoot "fwd.cfd"
}
else {
    $displayFwdPath = $FwdPath
}
Write-WbKeyValue "FWD path" $displayFwdPath
Write-WbKeyValue "Port" $Port
Write-WbKeyValue "Auto port" $(-not [bool]$NoAutoPort)
Write-WbKeyValue "Config" $Configuration
Write-WbKeyValue "Platform" $Platform
Write-WbKeyValue "Profile" $Profile
Write-WbKeyValue "Detached" ([bool]$Detached)

$resolvedFwdPath = Resolve-WbFwdFilePath -Root $repoRoot -FwdPath $FwdPath

if ($CheckWorkingTree) {
    Write-WbSection "Working tree inventory"
    $validator = Join-Path $scriptDir "validate-package-boundaries.ps1"
    if (Test-Path -LiteralPath $validator -PathType Leaf) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $validator -Root $repoRoot -Mode WorkingTree
        if ($LASTEXITCODE -ne 0) {
            Write-WbWarn "WorkingTree validation returned exit code $LASTEXITCODE. Startup will continue."
        }
    }
    else {
        Write-WbWarn "Working tree validator not found: $validator"
    }
}

if (-not $SkipRuntimeValidation) {
    Write-WbSection "Runtime preflight"
    Test-WbRuntimeFolder -Directory $managedLibDir -RequiredDlls $expectedManagedDlls -Label "Managed DLL folder"
    Test-WbRuntimeFolder -Directory $nativeLibDir -RequiredDlls $expectedNativeDlls -Label "Native DLL folder"
}
else {
    Write-WbSection "Runtime preflight skipped"
}

$Port = Resolve-WbApiPort `
    -RequestedPort $requestedPort `
    -HostName $HostName `
    -KillExisting ([bool]$KillExisting) `
    -AutoPort (-not [bool]$NoAutoPort) `
    -SearchLimit $PortSearchLimit

if ($Port -ne $requestedPort) {
    Write-WbKeyValue "Requested URL" "http://$HostName`:$requestedPort/"
    Write-WbKeyValue "Selected URL" "http://$HostName`:$Port/"
}

if (-not $NoBuild) {
    Write-WbSection "Build and doctor"

    $buildScript = Join-Path $scriptDir "build-and-doctor.ps1"
    if (-not (Test-Path -LiteralPath $buildScript -PathType Leaf)) {
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

    if ($Clean) {
        $buildArgs += "-Clean"
    }

    if ($CopyNativeToOutput) {
        $buildArgs += "-CopyNativeToOutput"
    }

    & powershell.exe @buildArgs
    $buildExitCode = $LASTEXITCODE

    if ($buildExitCode -ne 0) {
        throw "build-and-doctor.ps1 failed with exit code $buildExitCode"
    }
}
else {
    Write-WbSection "Build skipped"
}

Write-WbSection "Runtime PATH"
Initialize-WbRuntimePath -ScriptDirectory $scriptDir -ManagedLibDirectory $managedLibDir -NativeLibDirectory $nativeLibDir

$workbenchExe = Find-WbExecutable -Root $repoRoot -Configuration $Configuration -Platform $Platform
if ($null -eq $workbenchExe) {
    throw "Could not find AcRuleWorkbench.exe under bin for configuration '$Configuration'. Run dotnet build first, or rerun without -NoBuild."
}

$viewerOutputPath = Join-Path $repoRoot "ac-rule-viewer-live.html"
$exeDir = Split-Path -Parent $workbenchExe.FullName

if (-not $SkipRuntimeValidation) {
    Test-WbRuntimeFolder -Directory $exeDir -RequiredDlls $expectedManagedDlls -Label "Executable managed DLL folder"
}

$env:ACRULEWORKBENCH_FWD_PATH = $resolvedFwdPath
$env:ACRULEWORKBENCH_PORT = "$Port"
$env:ACRULEWORKBENCH_PROFILE = $Profile
$env:FW_WORKBENCH_FWD_PATH = $resolvedFwdPath
$env:FW_WORKBENCH_PORT = "$Port"
$env:ASPNETCORE_URLS = "http://$HostName`:$Port"

Write-WbSection "Viewer refresh"
if ($SkipViewerRefresh) {
    Write-WbInfo "Skipping viewer refresh. Existing file will be used if present: $viewerOutputPath"
}
else {
    $viewerArgs = @(
        "ac-viewer",
        "--path", $resolvedFwdPath,
        "--process", "AC",
        "--out", $viewerOutputPath,
        "--profile", $Profile
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

    if (-not (Test-Path -LiteralPath $viewerOutputPath -PathType Leaf)) {
        throw "Viewer refresh completed but output file is missing: $viewerOutputPath"
    }

    Write-WbOk "Viewer refreshed: $viewerOutputPath"
}

$appArgs = @(
    "api",
    "--path", $resolvedFwdPath,
    "--port", "$Port",
    "--host", $HostName,
    "--viewer", $viewerOutputPath,
    "--profile", $Profile
)

if ($EnableDebugApi) {
    $appArgs += "--enable-debug-api"
}

if ($AllowPathQuery) {
    $appArgs += "--allow-path-query"
}

if ($EnableCors) {
    $appArgs += "--enable-cors"
}

if ($DisableSnapshotCache) {
    $appArgs += "--disable-snapshot-cache"
}

if ($AllowRefresh) {
    $appArgs += "--allow-refresh"
}

$viewerUrl = "http://$HostName`:$Port/viewer?ui=readonly-editor-v62-10&nocache=$([guid]::NewGuid().ToString('N'))"
$liveHealthUrl = "http://$HostName`:$Port/api/v1/health/live"
$readyHealthUrl = "http://$HostName`:$Port/api/v1/health/ready"
$statusUrl = "http://$HostName`:$Port/api/v1/status"

if (-not $NoBrowser -and -not $Detached) {
    $appArgs += "--open"
}

if ($ExtraArgs.Count -gt 0) {
    $appArgs += $ExtraArgs
}

Write-WbSection "Launch"
Write-WbKeyValue "Executable" $workbenchExe.FullName
Write-WbKeyValue "Working dir" $exeDir
Write-WbKeyValue "Profile" $Profile
Write-WbKeyValue "Live health" $liveHealthUrl
Write-WbKeyValue "Ready health" $readyHealthUrl
Write-WbKeyValue "Status" $statusUrl
Write-WbKeyValue "Viewer" $viewerUrl
Write-WbKeyValue "Default FWD" $resolvedFwdPath
Write-WbKeyValue "Viewer file" $viewerOutputPath

if ($Detached) {
    $quotedArgs = @()
    foreach ($arg in $appArgs) {
        if ($arg -match "\s") {
            $quotedArgs += ('"' + ($arg -replace '"', '\"') + '"')
        }
        else {
            $quotedArgs += $arg
        }
    }

    $process = Start-Process -FilePath $workbenchExe.FullName -ArgumentList $quotedArgs -WorkingDirectory $exeDir -PassThru
    Write-WbOk "Started detached process: PID $($process.Id)"

    if (-not $NoWaitReady) {
        Wait-WbHttpEndpoint -Url $liveHealthUrl -TimeoutSeconds $ReadyTimeoutSeconds -Label "Live health"
        try {
            Wait-WbHttpEndpoint -Url $readyHealthUrl -TimeoutSeconds $ReadyTimeoutSeconds -Label "Ready health"
        }
        catch {
            Write-WbWarn $_.Exception.Message
            Write-WbWarn "Live health responded, but readiness may still be building the snapshot. Open /api/v1/health/ready to monitor."
        }
    }

    if (-not $NoBrowser) {
        Start-Process $viewerUrl
    }

    Write-WbSection "Running"
    Write-WbKeyValue "PID" $process.Id
    Write-WbKeyValue "Viewer" $viewerUrl
    Write-WbKeyValue "Stop command" "Stop-Process -Id $($process.Id)"
    exit 0
}

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
