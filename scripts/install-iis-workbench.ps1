#Requires -Version 5.1
<#!
.SYNOPSIS
Creates an IIS site that reverse-proxies to the AcRuleWorkbench local API backend.

.DESCRIPTION
The AC Rule Workbench backend remains the existing x86 AcRuleWorkbench API host.
IIS is used as the stable front door for users, TLS, Windows auth, and network access.
This requires IIS URL Rewrite and Application Request Routing (ARR) to be installed.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [ValidateNotNullOrEmpty()]
    [string]$SiteName = 'AC Rule Workbench',

    [ValidateNotNullOrEmpty()]
    [string]$AppPoolName = 'ACRuleWorkbenchPool',

    [ValidateNotNullOrEmpty()]
    [string]$SitePath = 'C:\inetpub\ac-rule-workbench',

    [ValidateRange(1, 65535)]
    [int]$SitePort = 80,

    [string]$HostHeader = '',

    [ValidateNotNullOrEmpty()]
    [string]$BackendHost = '127.0.0.1',

    [ValidateRange(1, 65535)]
    [int]$BackendPort = 8787,

    [ValidateNotNullOrEmpty()]
    [string]$TemplateWebConfig = $(Join-Path (Split-Path -Parent $PSScriptRoot) 'iis\web.config'),

    [switch]$OpenFirewall,

    [switch]$SkipWindowsFeatureInstall,

    [switch]$SkipArrProxyEnable
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

function Get-IisAppCmdPath {
    $candidate = Join-Path $env:windir 'System32\inetsrv\appcmd.exe'
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        throw "appcmd.exe was not found at $candidate. IIS may not be installed."
    }
    return $candidate
}

Assert-Admin

if (-not (Test-Path -LiteralPath $TemplateWebConfig -PathType Leaf)) {
    throw "Template web.config was not found: $TemplateWebConfig"
}

if (-not $SkipWindowsFeatureInstall) {
    Write-Host 'Installing required IIS Windows features...'
    Install-WindowsFeature `
        -Name Web-Server,Web-Mgmt-Tools,Web-Static-Content,Web-Default-Doc,Web-Http-Errors,Web-Filtering,Web-Http-Logging `
        -IncludeManagementTools | Out-Null
}

Import-Module WebAdministration

New-Item -ItemType Directory -Path $SitePath -Force | Out-Null

$template = Get-Content -LiteralPath $TemplateWebConfig -Raw
$config = $template.Replace('__BACKEND_HOST__', $BackendHost).Replace('__BACKEND_PORT__', $BackendPort.ToString())
Set-Content -LiteralPath (Join-Path $SitePath 'web.config') -Value $config -Encoding UTF8

if (-not (Test-Path "IIS:\AppPools\$AppPoolName")) {
    Write-Host "Creating app pool: $AppPoolName"
    New-WebAppPool -Name $AppPoolName | Out-Null
}

Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name managedRuntimeVersion -Value ''
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name processModel.identityType -Value 'ApplicationPoolIdentity'

$existingSite = Get-Website -Name $SiteName -ErrorAction SilentlyContinue
if ($null -eq $existingSite) {
    Write-Host "Creating IIS site: $SiteName"
    if ([string]::IsNullOrWhiteSpace($HostHeader)) {
        New-Website -Name $SiteName -PhysicalPath $SitePath -Port $SitePort -ApplicationPool $AppPoolName | Out-Null
    }
    else {
        New-Website -Name $SiteName -PhysicalPath $SitePath -Port $SitePort -HostHeader $HostHeader -ApplicationPool $AppPoolName | Out-Null
    }
}
else {
    Write-Host "Updating existing IIS site: $SiteName"
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name physicalPath -Value $SitePath
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name applicationPool -Value $AppPoolName
}

if (-not $SkipArrProxyEnable) {
    $appcmd = Get-IisAppCmdPath
    Write-Host 'Enabling ARR proxy at IIS server level...'
    & $appcmd set config -section:system.webServer/proxy /enabled:"True" /preserveHostHeader:"True" /commit:apphost | Write-Host
}

$globalModules = Get-WebGlobalModule | Select-Object -ExpandProperty Name
$hasRewrite = $globalModules -contains 'RewriteModule'
$hasArr = ($globalModules -contains 'ApplicationRequestRouting') -or ($globalModules -contains 'ApplicationRequestRoutingModule')

if (-not $hasRewrite) {
    Write-Warning 'IIS URL Rewrite module was not detected. Install URL Rewrite before using this site.'
}
if (-not $hasArr) {
    Write-Warning 'IIS Application Request Routing module was not detected. Install ARR before using this site.'
}

if ($OpenFirewall) {
    $ruleName = "AC Rule Workbench IIS $SitePort"
    if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $SitePort | Out-Null
    }
}

Start-Website -Name $SiteName

if ([string]::IsNullOrWhiteSpace($HostHeader)) {
    $publicUrl = "http://localhost:$SitePort/"
}
else {
    $publicUrl = "http://$HostHeader/"
}

Write-Host "IIS site ready: $SiteName"
Write-Host "Public URL: $publicUrl"
Write-Host "Backend URL: http://$BackendHost`:$BackendPort/"
Write-Host "Site path: $SitePath"
