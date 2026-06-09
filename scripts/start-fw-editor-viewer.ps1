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
    [switch]$OpenBrowser,
    [switch]$NoOpenWhenReady,
    [switch]$WaitForReadyBeforeOpen,
    [switch]$OpenWhenLive,
    [switch]$SnapshotWarmup,
    [switch]$NoLiveLazy,
    [switch]$CopyNativeToOutput,
    [switch]$NoCopyNativeToOutput,
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
    [switch]$Advanced,
    [switch]$DryRun,

    [ValidateRange(1, 200)]
    [int]$PortSearchLimit = 25,

    [ValidateRange(5, 600)]
    [int]$ReadyTimeoutSeconds = 600,

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

    Start-Sleep -Milliseconds 1000
}

# In strict FW Editor Viewer mode, do not open a half-ready viewer.
# The foreground server console keeps printing readiness progress and the ready-health URL.
if ($WaitForReady) {
    exit 2
}

# Legacy fast-open mode may still open when live health responds.
if ($liveSeen) {
    Start-Process $ViewerUrl
    exit 0
}

exit 1
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
            Write-WbOk "Viewer open helper started. It will open only after ready health responds. The viewer will not open against a half-built snapshot."
        }
        else {
            Write-WbWarn "Fast-open mode enabled. The viewer will open as soon as live health responds, before snapshot readiness."
        }
    }
    catch {
        Write-WbWarn "Could not start viewer open helper: $($_.Exception.Message)"
        Write-WbWarn "Open manually after the server starts: $ViewerUrl"
    }
}

function Sync-WbViewerSourceAssets {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$ViewerOutputPath
    )

    $sourceDirectory = Join-Path $RepoRoot "AcRuleWorkbench.Core\Viewer"
    $destinationDirectory = Split-Path -Parent $ViewerOutputPath
    if ([string]::IsNullOrWhiteSpace($destinationDirectory)) {
        $destinationDirectory = $RepoRoot
    }

    foreach ($assetName in @("ac-rule-viewer.css", "ac-rule-viewer.js")) {
        $sourcePath = Join-Path $sourceDirectory $assetName
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            throw "Authoritative viewer asset is missing: $sourcePath"
        }

        $destinationPath = Join-Path $destinationDirectory $assetName
        $sourceFullPath = [System.IO.Path]::GetFullPath($sourcePath)
        $destinationFullPath = [System.IO.Path]::GetFullPath($destinationPath)
        if (-not [string]::Equals($sourceFullPath, $destinationFullPath, [System.StringComparison]::OrdinalIgnoreCase)) {
            Copy-Item -LiteralPath $sourceFullPath -Destination $destinationFullPath -Force
        }
    }

    Write-WbOk "Viewer JS/CSS synchronized from the authoritative source tree."
}


function Get-WbViewerBuildMarker {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)
    $buildFile = Join-Path $RepoRoot 'viewer-build.txt'
    if (Test-Path -LiteralPath $buildFile -PathType Leaf) {
        return (Get-Content -LiteralPath $buildFile -Raw).Trim()
    }
    throw "Missing viewer build marker file: $buildFile"
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
        (Join-Path $viewerDir "ac-rule-viewer.tree.json"),
        (Join-Path $viewerDir "ac-rule-viewer.fwd.json")
    )

    # Treat the authoritative viewer shell/assets as build inputs, not just the FWD file.
    # This prevents a stale ac-rule-viewer-live.html from surviving after HTML/CSS/JS shell fixes.
    $repoRootForViewer = Resolve-WbRepoRoot
    $sourceDependencies = @(
        (Join-Path $repoRootForViewer "AcRuleWorkbench.Core\Viewer\ac-viewer-template.html"),
        (Join-Path $repoRootForViewer "AcRuleWorkbench.Core\Viewer\ac-rule-viewer.js"),
        (Join-Path $repoRootForViewer "AcRuleWorkbench.Core\Viewer\ac-rule-viewer.css")
    )

    $missing = New-Object System.Collections.Generic.List[string]
    $stale = New-Object System.Collections.Generic.List[string]
    $fwdItem = Get-Item -LiteralPath $FwdPath -ErrorAction Stop
    $latestDependencyTimeUtc = $fwdItem.LastWriteTimeUtc

    foreach ($sourcePath in $sourceDependencies) {
        if (Test-Path -LiteralPath $sourcePath -PathType Leaf) {
            $sourceItem = Get-Item -LiteralPath $sourcePath -ErrorAction Stop
            if ($sourceItem.LastWriteTimeUtc -gt $latestDependencyTimeUtc) {
                $latestDependencyTimeUtc = $sourceItem.LastWriteTimeUtc
            }
        }
    }

    foreach ($filePath in $requiredFiles) {
        if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
            $missing.Add($filePath)
            continue
        }

        $item = Get-Item -LiteralPath $filePath -ErrorAction Stop
        if ($item.LastWriteTimeUtc -lt $latestDependencyTimeUtc) {
            $stale.Add($filePath)
        }
    }

    if (Test-Path -LiteralPath $ViewerOutputPath -PathType Leaf) {
        $viewerHtml = Get-Content -LiteralPath $ViewerOutputPath -Raw -ErrorAction SilentlyContinue
        if ($viewerHtml -notmatch ('data-ui-build="' + [regex]::Escape((Get-WbViewerBuildMarker -RepoRoot $repoRootForViewer)) + '"') -or $viewerHtml -match 'scope-kicker">Configuration Window' -or $viewerHtml -match 'fw-companion-v64-2026' -or $viewerHtml -match 'FW Companion') {
            $stale.Add("$ViewerOutputPath (stale FW Editor Viewer shell marker)")
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
$effectiveCopyNativeToOutput = ([bool]$CopyNativeToOutput) -or ((-not [bool]$NoCopyNativeToOutput) -and (Test-Path -LiteralPath $nativeLibDir -PathType Container))
$requestedPort = $Port
$effectiveWaitForReadyBeforeOpen = (-not [bool]$OpenWhenLive) -or [bool]$WaitForReadyBeforeOpen
$liveLazyEnabled = (-not [bool]$SnapshotWarmup) -and (-not [bool]$NoLiveLazy)

Initialize-WbProgress -TotalSteps $(if ($CheckWorkingTree) { 8 } else { 7 })

if ($Profile -eq "full-evidence") {
    Write-WbWarn "Profile 'full-evidence' enables private/full FWD resource traversal and may generate sensitive local evidence output. Use only for local diagnostics."
}

if ($ForceViewerRefresh -and $liveLazyEnabled) {
    Write-WbWarn "-ForceViewerRefresh still performs a full static export before startup. Live-lazy only removes the API startup full-snapshot warm-up."
}

Write-WbSection "Resolve launch plan"
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
Write-WbKeyValue "Open wait mode" $(if ($effectiveWaitForReadyBeforeOpen) { "ready" } else { "live (fast-open)" })
Write-WbKeyValue "API model" $(if ($liveLazyEnabled) { "live-lazy (no startup full snapshot)" } elseif ($SnapshotWarmup) { "startup snapshot warm-up" } else { "cached snapshot on demand" })
Write-WbKeyValue "Viewer refresh" $(if ($ForceViewerRefresh) { "force static export" } elseif ($SkipViewerRefresh) { "skip" } elseif ($liveLazyEnabled) { "hosted live API shell" } else { "auto static export" })
Write-WbKeyValue "Native DLL copy" $effectiveCopyNativeToOutput
Write-WbKeyValue "Dry run" ([bool]$DryRun)

if ($DryRun) {
    Write-WbOk "Dry run completed. Startup plan resolved; no build, viewer refresh, or server start was performed."
    return
}

$resolvedFwdPath = Resolve-WbFwdFilePath -Root $repoRoot -FwdPath $FwdPath

if ($CheckWorkingTree) {
    Write-WbSection "Validate working tree"
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

    if ($effectiveCopyNativeToOutput) {
        $buildArgs += "-CopyNativeToOutput"
    }

    Write-WbProgress "Running build and output doctor. Build output follows."
    & powershell.exe @buildArgs
    $buildExitCode = $LASTEXITCODE

    if ($buildExitCode -ne 0) {
        throw "build-and-doctor.ps1 failed with exit code $buildExitCode"
    }

    Write-WbSuccess "Build and output doctor finished."
}
else {
    Write-WbSection "Build skipped"
}

Write-WbSection "Prepare runtime PATH"
Initialize-WbRuntimePath -ScriptDirectory $scriptDir -ManagedLibDirectory $managedLibDir -NativeLibDirectory $nativeLibDir

$workbenchExe = Find-WbExecutable -Root $repoRoot -Configuration $Configuration -Platform $Platform
if ($null -eq $workbenchExe) {
    throw "Could not find AcRuleWorkbench.exe under bin for configuration '$Configuration'. Run dotnet build first, or rerun without -NoBuild."
}

$viewerShellPath = Join-Path $repoRoot "ac-rule-viewer.html"
$generatedViewerOutputPath = Join-Path $repoRoot "ac-rule-viewer-live.html"
$useStaticExportViewer = ([bool]$ForceViewerRefresh) -or (-not [bool]$liveLazyEnabled)
$viewerOutputPath = if ($useStaticExportViewer) { $generatedViewerOutputPath } else { $viewerShellPath }
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
if ($useStaticExportViewer) {
    $viewerStatus = Get-WbViewerArtifactStatus -ViewerOutputPath $generatedViewerOutputPath -FwdPath $resolvedFwdPath

    if ($SkipViewerRefresh) {
        if (-not $viewerStatus.IsComplete) {
            throw "-SkipViewerRefresh was specified, but required static viewer artifacts are missing: $($viewerStatus.Missing -join ', '). Rerun without -SkipViewerRefresh to generate them."
        }

        Write-WbOk "Skipping static viewer refresh. Existing generated viewer artifacts found."
    }
    elseif (-not $ForceViewerRefresh -and $viewerStatus.IsCurrent) {
        Write-WbOk "Generated static viewer artifacts are current; regeneration skipped. Use -ForceViewerRefresh to rebuild."
    }
    else {
        if ($ForceViewerRefresh) {
            Write-WbInfo "Force refresh requested. Regenerating standalone static viewer: $generatedViewerOutputPath"
        }
        elseif (-not $viewerStatus.IsComplete) {
            Write-WbInfo "Generated static viewer artifacts are incomplete. Missing: $($viewerStatus.Missing -join ', ')"
        }
        elseif (-not $viewerStatus.IsCurrent) {
            Write-WbInfo "Generated static viewer artifacts are older than the FWD file. Stale: $($viewerStatus.Stale -join ', ')"
        }

        Write-WbProgress "Generating standalone static viewer before API startup: $generatedViewerOutputPath"
        Write-WbInfo "Large FWD/CFD files can take a while. Normal live-lazy starts skip this step; use -ForceViewerRefresh only when you need complete sidecar JSON/exported HTML."
        Write-WbInfo "Expected sidecars: ac-rule-viewer.rules.json, ac-rule-viewer.rel.json, ac-rule-viewer.tree.json, and ac-rule-viewer.fwd.json."

        $viewerArgs = @(
            "ac-viewer",
            "--path", $resolvedFwdPath,
            "--process", "AC",
            "--out", $generatedViewerOutputPath,
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
            throw "Static viewer refresh failed with exit code $viewerExitCode"
        }

        $viewerStatus = Get-WbViewerArtifactStatus -ViewerOutputPath $generatedViewerOutputPath -FwdPath $resolvedFwdPath
        if (-not $viewerStatus.IsComplete) {
            throw "Static viewer refresh completed but required artifacts are missing: $($viewerStatus.Missing -join ', ')"
        }

        Write-WbOk "Standalone static viewer refreshed with complete JSON sidecars: $generatedViewerOutputPath"
        Write-WbInfo "To serve the standalone export locally, run: node server.js --allow-generated-sidecars"
    }
}
else {
    if (-not (Test-Path -LiteralPath $viewerShellPath -PathType Leaf)) {
        throw "Hosted viewer shell is missing: $viewerShellPath"
    }

    Write-WbOk "Live-lazy hosted mode selected. Static sidecar generation is skipped."
    Write-WbInfo "Open the hosted route /viewer. Do not open ac-rule-viewer.html through node server unless you generated complete sidecar JSON with -ForceViewerRefresh and serve with node server.js --allow-generated-sidecars."
}

Sync-WbViewerSourceAssets -RepoRoot $repoRoot -ViewerOutputPath $viewerOutputPath

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

if ($liveLazyEnabled) {
    $appArgs += "--live-lazy"
}
elseif ($SnapshotWarmup) {
    $appArgs += "--snapshot-warmup"
}
else {
    $appArgs += "--no-live-lazy"
}

if ($AllowRefresh) {
    $appArgs += "--allow-refresh"
}

$advancedQuery = if ($Advanced) { "&advanced=1" } else { "" }
$viewerUrl = "http://$HostName`:$Port/viewer?nocache=$([guid]::NewGuid().ToString('N'))$advancedQuery"
$liveHealthUrl = "http://$HostName`:$Port/api/v1/health/live"
$readyHealthUrl = "http://$HostName`:$Port/api/v1/health/ready"
$statusUrl = "http://$HostName`:$Port/api/v1/status"

# Do not rely on the EXE --open behavior in foreground mode.
# The EXE opens the base prefix, while this script knows the exact viewer URL.
# In foreground mode the server process blocks this script, so a small helper opens
# /viewer directly. Default behavior is conservative for this large FWD viewer: open
# only when ready health responds. Pass -OpenWhenLive only for developer fast-open testing.

if ($ExtraArgs.Count -gt 0) {
    $appArgs += $ExtraArgs
}

Write-WbSection "Start local API and viewer"
Write-WbKeyValue "Executable" $workbenchExe.FullName
Write-WbKeyValue "Working dir" $exeDir
Write-WbKeyValue "Profile" $Profile
Write-WbKeyValue "API model" $(if ($liveLazyEnabled) { "live-lazy" } elseif ($SnapshotWarmup) { "startup snapshot warm-up" } else { "snapshot on demand" })
Write-WbKeyValue "Live health" $liveHealthUrl
Write-WbKeyValue "Ready health" $readyHealthUrl
Write-WbKeyValue "Status" $statusUrl
Write-WbKeyValue "Viewer" $viewerUrl
Write-WbKeyValue "Default FWD" $resolvedFwdPath
Write-WbKeyValue "Viewer file" $viewerOutputPath
Write-WbKeyValue "Verify command" "powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-fw-editor-viewer-live.ps1 -BaseUrl http://$HostName`:$Port"

if ($Detached) {
    Write-WbProgress "Starting detached API process and checking health."
}
else {
    Write-WbProgress "Starting foreground API process. The server will print [READY] and [COMPLETE] when the selected readiness target is available."
}

if (-not $NoBrowser -and -not $Detached -and -not $NoOpenWhenReady) {
    Start-WbViewerOpenHelper -LiveHealthUrl $liveHealthUrl -ReadyHealthUrl $readyHealthUrl -ViewerUrl $viewerUrl -TimeoutSeconds $ReadyTimeoutSeconds -WaitForReady ([bool]$effectiveWaitForReadyBeforeOpen)
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
        Write-WbReady "API live health is responding."
        if ($effectiveWaitForReadyBeforeOpen) {
            try {
                Wait-WbHttpEndpoint -Url $readyHealthUrl -TimeoutSeconds $ReadyTimeoutSeconds -Label "Ready health"
                Write-WbReady "Snapshot cache is ready."
            }
            catch {
                Write-WbWarn $_.Exception.Message
                Write-WbWarn "Live health responded, but readiness may still be building the snapshot. Open /api/v1/health/ready to monitor."
            }
        }
        else {
            Write-WbWarn "Fast-open mode enabled. Snapshot warm-up can continue in the background."
        }
    }

    if (-not $NoBrowser) {
        Start-Process $viewerUrl
    }

    Write-WbSection "Running"
    Write-WbKeyValue "PID" $process.Id
    Write-WbKeyValue "Viewer" $viewerUrl
    Write-WbKeyValue "Stop command" "Stop-Process -Id $($process.Id)"
    Write-WbComplete "FW Editor Viewer is running detached. Open the viewer URL above; use ready health to confirm snapshot completion."
    exit 0
}

Write-Host ""
Write-Host "Press Ctrl+C to stop after the server starts." -ForegroundColor Yellow
Write-Host ""

Push-Location $exeDir
try {
    & $workbenchExe.FullName @appArgs
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
