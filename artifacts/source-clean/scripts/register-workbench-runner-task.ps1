#Requires -Version 5.1
<#!
.SYNOPSIS
Registers the AcRuleWorkbench API backend as a resilient scheduled task.

.DESCRIPTION
The AcRuleWorkbench API is a console/HttpListener host, not a native IIS app.
For IIS production hosting, run the API on localhost and let IIS ARR reverse proxy
public requests to it. This script creates the local backend runner task.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExePath,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$FwdPath,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ViewerPath,

    [ValidateRange(1, 65535)]
    [int]$Port = 8787,

    [ValidateNotNullOrEmpty()]
    [string]$HostName = '127.0.0.1',

    [ValidateNotNullOrEmpty()]
    [string]$TaskName = 'AcRuleWorkbench API Runner',

    [ValidateNotNullOrEmpty()]
    [string]$RunnerScript = $(Join-Path $PSScriptRoot 'run-workbench-api-loop.ps1'),

    [ValidateNotNullOrEmpty()]
    [string]$TaskUser = 'SYSTEM',

    [System.Security.SecureString]$TaskPassword,

    [ValidateNotNullOrEmpty()]
    [string]$LogDir = 'C:\ProgramData\AcRuleWorkbench\logs',

    [switch]$SkipUrlAcl,

    [switch]$AllowRefresh,

    [switch]$StartNow
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
    param(
        [string]$Path,
        [string]$Label,
        [switch]$Leaf
    )

    if ([string]::IsNullOrWhiteSpace($Path)) {
        throw "$Label path is blank."
    }

    if ($Leaf) {
        if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
            throw "$Label was not found: $Path"
        }
    }
    else {
        if (-not (Test-Path -LiteralPath $Path)) {
            throw "$Label was not found: $Path"
        }
    }
}

function ConvertTo-PlainText {
    param([System.Security.SecureString]$SecureString)
    if ($null -eq $SecureString) { return $null }
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }
    finally {
        if ($bstr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    }
}

Assert-Admin
Test-RequiredPath -Path $ExePath -Label 'AcRuleWorkbench executable' -Leaf
Test-RequiredPath -Path $FwdPath -Label 'FWD configuration' -Leaf
Test-RequiredPath -Path $ViewerPath -Label 'AC rule viewer HTML' -Leaf
Test-RequiredPath -Path $RunnerScript -Label 'Runner script' -Leaf
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

$url = "http://$HostName`:$Port/"
if (-not $SkipUrlAcl) {
    $urlAclUser = if ($TaskUser -ieq 'SYSTEM') { 'NT AUTHORITY\SYSTEM' } else { $TaskUser }
    $existingUrlAcls = & netsh http show urlacl 2>$null | Out-String
    if ($existingUrlAcls -notmatch [regex]::Escape($url)) {
        Write-Host "Adding HttpListener URL ACL for $urlAclUser at $url"
        & netsh http add urlacl url=$url user=$urlAclUser | Write-Host
    }
    else {
        Write-Host "URL ACL already exists for $url"
    }
}

$escapedRunner = $RunnerScript
$taskArgs = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', "`"$escapedRunner`"",
    '-ExePath', "`"$ExePath`"",
    '-FwdPath', "`"$FwdPath`"",
    '-ViewerPath', "`"$ViewerPath`"",
    '-HostName', "`"$HostName`"",
    '-Port', $Port.ToString(),
    '-LogDir', "`"$LogDir`""
)

if ($AllowRefresh) {
    $taskArgs += '-AllowRefresh'
}

$taskArgs = $taskArgs -join ' '

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $taskArgs
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable

if ($TaskUser -ieq 'SYSTEM') {
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
    if ($PSCmdlet.ShouldProcess($TaskName, 'Register SYSTEM scheduled task')) {
        Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
    }
}
else {
    if ($null -eq $TaskPassword) {
        $TaskPassword = Read-Host -Prompt "Password for $TaskUser" -AsSecureString
    }
    $plainPassword = ConvertTo-PlainText -SecureString $TaskPassword
    try {
        if ($PSCmdlet.ShouldProcess($TaskName, "Register scheduled task as $TaskUser")) {
            Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -User $TaskUser -Password $plainPassword -RunLevel Highest -Force | Out-Null
        }
    }
    finally {
        $plainPassword = $null
    }
}

if ($StartNow) {
    Start-ScheduledTask -TaskName $TaskName
}

Write-Host "Registered scheduled task: $TaskName"
Write-Host "Backend URL: $url"
Write-Host "Refresh endpoint enabled: $AllowRefresh"
Write-Host "Logs: $LogDir"
