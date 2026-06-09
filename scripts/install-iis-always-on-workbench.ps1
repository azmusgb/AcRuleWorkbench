#Requires -Version 5.1
<#!
.SYNOPSIS
One-step IIS + always-on backend installer for FW Editor Viewer.

.DESCRIPTION
Generates the FW Editor Viewer HTML, registers the AcRuleWorkbench API backend
as a resilient startup scheduled task, and creates/updates an IIS reverse-proxy
site that exposes the product viewer and /api/v1/* to users. Diagnostic /harness and legacy /api/fwd/* routes remain opt-in/compatibility surfaces only.

The backend runs continuously without an interactive command prompt. The web UI
can refresh/regenerate the static viewer from the current fwd.cfd through
POST /api/v1/snapshot/refresh when -AllowRefresh is used.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExePath,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$FwdPath,

    [ValidateNotNullOrEmpty()]
    [string]$ViewerPath = 'C:\apps\AcRuleWorkbench\ac-rule-viewer.html',

    [ValidateRange(1, 65535)]
    [int]$BackendPort = 8787,

    [ValidateNotNullOrEmpty()]
    [string]$BackendHost = '127.0.0.1',

    [ValidateNotNullOrEmpty()]
    [string]$SiteName = 'FW Editor Viewer',

    [ValidateNotNullOrEmpty()]
    [string]$SitePath = 'C:\inetpub\ac-rule-workbench',

    [ValidateRange(1, 65535)]
    [int]$SitePort = 80,

    [string]$HostHeader = '',

    [ValidateNotNullOrEmpty()]
    [string]$TaskName = 'AcRuleWorkbench API Runner',

    [ValidateNotNullOrEmpty()]
    [string]$TaskUser = 'SYSTEM',

    [System.Security.SecureString]$TaskPassword,

    [switch]$AllowRefresh = $true,

    [switch]$OpenFirewall,

    [switch]$SkipGenerateViewer,

    [switch]$SkipIisInstall,

    [switch]$SkipTaskRegister
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run this script from an elevated PowerShell session.'
    }
}

function Test-RequiredPath {
    param([string]$Path, [string]$Label, [switch]$Leaf)
    if ([string]::IsNullOrWhiteSpace($Path)) { throw "$Label path is blank." }
    if ($Leaf) {
        if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Label was not found: $Path" }
    }
    else {
        if (-not (Test-Path -LiteralPath $Path)) { throw "$Label was not found: $Path" }
    }
}

Assert-Admin
Test-RequiredPath -Path $ExePath -Label 'AcRuleWorkbench executable' -Leaf
Test-RequiredPath -Path $FwdPath -Label 'FWD configuration' -Leaf

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$viewerDir = Split-Path -Parent $ViewerPath
if (-not [string]::IsNullOrWhiteSpace($viewerDir)) {
    New-Item -ItemType Directory -Path $viewerDir -Force | Out-Null
}

if (-not $SkipGenerateViewer) {
    Write-Host 'Generating initial FW Editor Viewer HTML...'
    & $ExePath ac-viewer --path $FwdPath --out $ViewerPath
    if ($LASTEXITCODE -ne 0) {
        throw "Initial ac-viewer generation failed with exit code $LASTEXITCODE."
    }
}

Test-RequiredPath -Path $ViewerPath -Label 'FW Editor Viewer viewer HTML' -Leaf

if (-not $SkipTaskRegister) {
    $registerScript = Join-Path $PSScriptRoot 'register-workbench-runner-task.ps1'
    Test-RequiredPath -Path $registerScript -Label 'Task registration script' -Leaf

    $registerArgs = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', "`"$registerScript`"",
        '-ExePath', "`"$ExePath`"",
        '-FwdPath', "`"$FwdPath`"",
        '-ViewerPath', "`"$ViewerPath`"",
        '-Port', $BackendPort.ToString(),
        '-HostName', "`"$BackendHost`"",
        '-TaskName', "`"$TaskName`"",
        '-TaskUser', "`"$TaskUser`"",
        '-StartNow'
    )

    if ($AllowRefresh) { $registerArgs += '-AllowRefresh' }

    if ($PSBoundParameters.ContainsKey('TaskPassword') -and $null -ne $TaskPassword) {
        Write-Warning 'TaskPassword cannot be forwarded safely through this wrapper. Run register-workbench-runner-task.ps1 directly for custom service-account password registration.'
    }

    Write-Host 'Registering always-on backend scheduled task...'
    & powershell.exe @registerArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Task registration failed with exit code $LASTEXITCODE."
    }
}

if (-not $SkipIisInstall) {
    $iisScript = Join-Path $PSScriptRoot 'install-iis-workbench.ps1'
    Test-RequiredPath -Path $iisScript -Label 'IIS installer script' -Leaf

    $iisArgs = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', "`"$iisScript`"",
        '-SiteName', "`"$SiteName`"",
        '-SitePath', "`"$SitePath`"",
        '-SitePort', $SitePort.ToString(),
        '-BackendHost', "`"$BackendHost`"",
        '-BackendPort', $BackendPort.ToString()
    )

    if (-not [string]::IsNullOrWhiteSpace($HostHeader)) {
        $iisArgs += @('-HostHeader', "`"$HostHeader`"")
    }
    if ($OpenFirewall) { $iisArgs += '-OpenFirewall' }

    Write-Host 'Creating/updating IIS front-door site...'
    & powershell.exe @iisArgs
    if ($LASTEXITCODE -ne 0) {
        throw "IIS install failed with exit code $LASTEXITCODE."
    }
}

Write-Host ''
Write-Host 'FW Editor Viewer always-on deployment complete.'
Write-Host "Backend: http://$BackendHost`:$BackendPort/"
if ([string]::IsNullOrWhiteSpace($HostHeader)) {
    Write-Host "IIS URL: http://localhost:$SitePort/viewer"
}
else {
    Write-Host "IIS URL: http://$HostHeader/viewer"
}
Write-Host "API Harness: /harness"
Write-Host "Refresh endpoint: /api/v1/snapshot/refresh"
Write-Host "Status endpoint: /api/v1/status"
