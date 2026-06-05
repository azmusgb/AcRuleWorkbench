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
    [switch]$NoOpenWhenReady,
    [switch]$WaitForReadyBeforeOpen,
    [switch]$CopyNativeToOutput,
    [switch]$SkipViewerRefresh,
    [switch]$ForceViewerRefresh,
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


function Start-WbViewerOpenHelper {
    param(
        [Parameter(Mandatory = $true)][string]$LiveHealthUrl,
        [Parameter(Mandatory = $true)][string]$ReadyHealthUrl,
        [Parameter(Mandatory = $true)][string]$ViewerUrl,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds,
        [Parameter(Mandatory = $false)][bool]$WaitForReady = $false
    )

    $helperPath = Join-Path $env:TEMP ("acrw-open-viewer-" + [guid]::NewGuid().ToString("N") + ".ps1")

    $helper = @'
param(
    [Parameter(Mandatory = $true)][string]$LiveHealthUrl,
    [Parameter(Mandatory = $true)][string]$ReadyHealthUrl,
    [Parameter(Mandatory = $true)][string]$ViewerUrl,
    [Parameter(Mandatory = $true)][int]$TimeoutSeconds,
    [Parameter(Mandatory = $false)][switch]$WaitForReady
)

function Test-EndpointOk {
    param([Parameter(Mandatory = $true)][string]$Url)

    try {
        Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 4 -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$liveSeen = $false

while ((Get-Date) -lt $deadline) {
    if (-not $liveSeen) {
        $liveSeen = Test-EndpointOk -Url $LiveHealthUrl
    }

    if ($liveSeen -and -not $WaitForReady) {
        Start-Process $ViewerUrl
        exit 0
    }

    if ($liveSeen -and $WaitForReady -and (Test-EndpointOk -Url $ReadyHealthUrl)) {
        Start-Process $ViewerUrl
        exit 0
    }

    Start-Sleep -Milliseconds 500
}

# If the API became live but readiness is still building, open the viewer anyway so the
# browser can show its loading/error state rather than leaving the user with no UI.
if ($liveSeen) {
    Start-Process $ViewerUrl
    exit 0
}

# Last-resort behavior: open the viewer URL even when health did not respond. The main
# console still shows the health URLs for manual diagnosis.
Start-Process $ViewerUrl
exit 0
'@

    Set-Content -LiteralPath $helperPath -Value $helper -Encoding UTF8

    $args = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $helperPath,
        "-LiveHealthUrl", $LiveHealthUrl,
        "-ReadyHealthUrl", $ReadyHealthUrl,
        "-ViewerUrl", $ViewerUrl,
        "-TimeoutSeconds", "$TimeoutSeconds"
    )

    if ($WaitForReady) {
        $args += "-WaitForReady"
    }

    try {
        Start-Process -FilePath "powershell.exe" -ArgumentList $args -WindowStyle Hidden | Out-Null
        if ($WaitForReady) {
            Write-WbOk "Viewer open helper started. It will open after ready health responds, or after timeout if the API is live."
        }
        else {
            Write-WbOk "Viewer open helper started. It will open as soon as live health responds; snapshot readiness can continue in the background."
        }
    }
    catch {
        Write-WbWarn "Could not start viewer open helper: $($_.Exception.Message)"
        Write-WbWarn "Open manually after the server starts: $ViewerUrl"
    }
}


function Get-WbViewerArtifactStatus {
    param(
        [Parameter(Mandatory = $true)][string]$ViewerOutputPath,
        [Parameter(Mandatory = $true)][string]$FwdPath
    )

    $viewerDir = Split-Path -Parent $ViewerOutputPath
    if ([string]::IsNullOrWhiteSpace($viewerDir)) {
        $viewerDir = (Get-Location).Path
    }

    $requiredFiles = @(
        $ViewerOutputPath,
        (Join-Path $viewerDir "ac-rule-viewer.rules.json"),
        (Join-Path $viewerDir "ac-rule-viewer.rel.json"),
        (Join-Path $viewerDir "ac-rule-viewer.tree.json")
    )

    $missing = New-Object System.Collections.Generic.List[string]
    $stale = New-Object System.Collections.Generic.List[string]
    $fwdItem = Get-Item -LiteralPath $FwdPath -ErrorAction Stop

    foreach ($filePath in $requiredFiles) {
        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
            $missing.Add($filePath)
            continue
        }

        $item = Get-Item -LiteralPath $filePath -ErrorAction Stop
        if ($item.LastWriteTimeUtc -lt $fwdItem.LastWriteTimeUtc) {
            $stale.Add($filePath)
        }
    }

    return [pscustomobject]@{
        IsComplete = ($missing.Count -eq 0)
        IsCurrent = ($missing.Count -eq 0 -and $stale.Count -eq 0)
        Missing = @($missing)
        Stale = @($stale)
        RequiredFiles = @($requiredFiles)
    }
}

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
Write-WbKeyValue "Open wait mode" $(if ($WaitForReadyBeforeOpen) { "ready" } else { "live" })
Write-WbKeyValue "Viewer refresh" $(if ($ForceViewerRefresh) { "force" } elseif ($SkipViewerRefresh) { "skip" } else { "auto" })

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
$viewerStatus = Get-WbViewerArtifactStatus -ViewerOutputPath $viewerOutputPath -FwdPath $resolvedFwdPath

if ($SkipViewerRefresh) {
    if (-not $viewerStatus.IsComplete) {
        throw "-SkipViewerRefresh was specified, but required viewer artifacts are missing: $($viewerStatus.Missing -join ', '). Rerun without -SkipViewerRefresh to generate them."
    }

    Write-WbOk "Skipping viewer refresh. Existing viewer artifacts found."
}
elseif (-not $ForceViewerRefresh -and $viewerStatus.IsCurrent) {
    Write-WbOk "Existing viewer artifacts are current; skipping static viewer regeneration. Use -ForceViewerRefresh to rebuild."
}
else {
    if ($ForceViewerRefresh) {
        Write-WbInfo "Force refresh requested. Regenerating static viewer: $viewerOutputPath"
    }
    elseif (-not $viewerStatus.IsComplete) {
        Write-WbInfo "Viewer artifacts are incomplete. Missing: $($viewerStatus.Missing -join ', ')"
    }
    elseif (-not $viewerStatus.IsCurrent) {
        Write-WbInfo "Viewer artifacts are older than the FWD file. Stale: $($viewerStatus.Stale -join ', ')"
    }

    Write-WbInfo "Generating static viewer before API startup: $viewerOutputPath"
    Write-WbInfo "Large FWD/CFD files can make this step take a while. Future starts will auto-reuse current artifacts unless -ForceViewerRefresh is used."

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

    $viewerStatus = Get-WbViewerArtifactStatus -ViewerOutputPath $viewerOutputPath -FwdPath $resolvedFwdPath
    if (-not $viewerStatus.IsComplete) {
        throw "Viewer refresh completed but required artifacts are missing: $($viewerStatus.Missing -join ', ')"
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

# Do not rely on the EXE --open behavior in foreground mode.
# The EXE opens the base prefix, while this script knows the exact viewer URL.
# In foreground mode the server process blocks this script, so a small helper opens
# /viewer directly. Default behavior is fast: open when live health responds and let
# snapshot readiness continue in the background. Pass -WaitForReadyBeforeOpen when you
# explicitly want the older conservative behavior.

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
Write-WbKeyValue "Verify command" "powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-workbench-live.ps1 -BaseUrl http://$HostName`:$Port"

if (-not $NoBrowser -and -not $Detached -and -not $NoOpenWhenReady) {
    Start-WbViewerOpenHelper -LiveHealthUrl $liveHealthUrl -ReadyHealthUrl $readyHealthUrl -ViewerUrl $viewerUrl -TimeoutSeconds $ReadyTimeoutSeconds -WaitForReady ([bool]$WaitForReadyBeforeOpen)
}
elseif (-not $NoBrowser -and -not $Detached -and $NoOpenWhenReady) {
    Write-WbWarn "Automatic viewer open disabled. Open manually after startup: $viewerUrl"
}

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
        if ($WaitForReadyBeforeOpen) {
            try {
                Wait-WbHttpEndpoint -Url $readyHealthUrl -TimeoutSeconds $ReadyTimeoutSeconds -Label "Ready health"
            }
            catch {
                Write-WbWarn $_.Exception.Message
                Write-WbWarn "Live health responded, but readiness may still be building the snapshot. Open /api/v1/health/ready to monitor."
            }
        }
        else {
            Write-WbInfo "Not waiting for ready health. Snapshot warm-up can continue in the background. Use -WaitForReadyBeforeOpen for strict readiness waiting."
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
