#Requires -Version 5.1
<#!
.SYNOPSIS
Runs AcRuleWorkbench API mode as a resilient local backend process for IIS/ARR.

.DESCRIPTION
This script is intended to be launched by Task Scheduler on Windows Server.
It keeps the x86 AcRuleWorkbench API process alive, writes rolling logs, and
binds the API only to localhost by default so IIS can act as the public front door.
#>
[CmdletBinding()]
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
    [string]$LogDir = 'C:\ProgramData\AcRuleWorkbench\logs',

    [ValidateRange(1, 3600)]
    [int]$RestartDelaySeconds = 5,

    [switch]$AllowRefresh
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-RunnerLog {
    param([string]$Message)
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'
    $line = "[$stamp] $Message"
    Write-Host $line
    Add-Content -LiteralPath $script:SupervisorLog -Value $line -Encoding UTF8
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

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$script:SupervisorLog = Join-Path $LogDir 'workbench-api-supervisor.log'

Test-RequiredPath -Path $ExePath -Label 'AcRuleWorkbench executable' -Leaf
Test-RequiredPath -Path $FwdPath -Label 'FWD configuration' -Leaf
Test-RequiredPath -Path $ViewerPath -Label 'AC rule viewer HTML' -Leaf

$exeDirectory = Split-Path -Parent $ExePath
$args = @(
    'api',
    '--path', $FwdPath,
    '--host', $HostName,
    '--port', $Port.ToString(),
    '--viewer', $ViewerPath
)

if ($AllowRefresh) {
    $args += '--allow-refresh'
}

Write-RunnerLog "Starting AcRuleWorkbench API supervisor."
Write-RunnerLog "ExePath: $ExePath"
Write-RunnerLog "FwdPath: $FwdPath"
Write-RunnerLog "ViewerPath: $ViewerPath"
Write-RunnerLog "Backend: http://$HostName`:$Port/"
Write-RunnerLog "Refresh endpoint enabled: $AllowRefresh"

while ($true) {
    $runStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $stdoutLog = Join-Path $LogDir "workbench-api-$runStamp.out.log"
    $stderrLog = Join-Path $LogDir "workbench-api-$runStamp.err.log"

    Write-RunnerLog "Launching backend process. stdout=$stdoutLog stderr=$stderrLog"

    $process = Start-Process `
        -FilePath $ExePath `
        -ArgumentList $args `
        -WorkingDirectory $exeDirectory `
        -NoNewWindow `
        -PassThru `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog

    $process.WaitForExit()
    $exitCode = $process.ExitCode

    Write-RunnerLog "Backend process exited with code $exitCode. Restarting in $RestartDelaySeconds second(s)."
    Start-Sleep -Seconds $RestartDelaySeconds
}
