[CmdletBinding()]
param(
    [string]$Viewer = "ac-rule-viewer.html",
    [int]$Port = 8765,
    [switch]$NoBrowser,
    [switch]$KillExisting
)

$ErrorActionPreference = "Stop"

$viewerPath = (Resolve-Path $Viewer).Path
$root = Split-Path -Parent $viewerPath
$file = Split-Path -Leaf $viewerPath

function Find-PythonCommand {
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) {
        return @{
            FileName = $py.Source
            Arguments = @("-3", "-m", "http.server", "$Port", "--bind", "127.0.0.1")
        }
    }

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) {
        return @{
            FileName = $python.Source
            Arguments = @("-m", "http.server", "$Port", "--bind", "127.0.0.1")
        }
    }

    $python3 = Get-Command python3 -ErrorAction SilentlyContinue
    if ($python3) {
        return @{
            FileName = $python3.Source
            Arguments = @("-m", "http.server", "$Port", "--bind", "127.0.0.1")
        }
    }

    return $null
}

function Get-PortOwners {
    param([int]$PortToTest)

    $owners = @()

    $netTcp = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
    if ($netTcp) {
        try {
            $owners = Get-NetTCPConnection -LocalPort $PortToTest -ErrorAction SilentlyContinue |
                Where-Object { $_.OwningProcess -and $_.OwningProcess -gt 0 } |
                Select-Object -ExpandProperty OwningProcess -Unique
        }
        catch {
            $owners = @()
        }
    }

    if (-not $owners -or $owners.Count -eq 0) {
        try {
            $lines = netstat -ano -p tcp | Select-String ":$PortToTest\s"
            foreach ($line in $lines) {
                $parts = ($line.ToString() -split "\s+") | Where-Object { $_ }
                if ($parts.Count -ge 5) {
                    $pidText = $parts[-1]
                    $pid = 0
                    if ([int]::TryParse($pidText, [ref]$pid) -and $pid -gt 0) {
                        $owners += $pid
                    }
                }
            }
            $owners = $owners | Select-Object -Unique
        }
        catch {
            $owners = @()
        }
    }

    return @($owners)
}

function Stop-PortOwners {
    param([int]$PortToStop)

    $owners = @(Get-PortOwners -PortToTest $PortToStop)
    if ($owners.Count -eq 0) {
        return
    }

    foreach ($ownerPid in $owners) {
        try {
            $process = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
            if (-not $process) {
                continue
            }

            Write-Host "Port $PortToStop is already in use by PID $ownerPid ($($process.ProcessName)). Stopping it..."
            Stop-Process -Id $ownerPid -Force -ErrorAction Stop
        }
        catch {
            throw "Port $PortToStop is in use by PID $ownerPid, but it could not be stopped: $($_.Exception.Message)"
        }
    }

    Start-Sleep -Milliseconds 500

    $remaining = @(Get-PortOwners -PortToTest $PortToStop)
    if ($remaining.Count -gt 0) {
        throw "Port $PortToStop is still in use after attempting to stop PID(s): $($remaining -join ', '). Try another port, for example: .\scripts\open-viewer-http.ps1 -Viewer .\ac-rule-viewer.html -Port 8766"
    }
}

$existingOwners = @(Get-PortOwners -PortToTest $Port)
if ($existingOwners.Count -gt 0) {
    if (-not $KillExisting) {
        $details = foreach ($ownerPid in $existingOwners) {
            $p = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
            if ($p) { "$ownerPid ($($p.ProcessName))" } else { "$ownerPid" }
        }
        throw "Port $Port is already in use by: $($details -join ', '). Choose another port or rerun with -KillExisting."
    }

    Stop-PortOwners -PortToStop $Port
}

$python = Find-PythonCommand
if (-not $python) {
    Write-Warning "Python was not found. Opening directly as file://. Browser security warnings may appear."
    Start-Process $viewerPath
    exit 0
}

$url = "http://127.0.0.1:$Port/$file"
$logDir = Join-Path $env:TEMP "AcRuleWorkbenchViewer"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$outLog = Join-Path $logDir "viewer-http-$Port.out.log"
$errLog = Join-Path $logDir "viewer-http-$Port.err.log"

Write-Host "Serving viewer from: $root"
Write-Host "Opening: $url"
Write-Host "Server logs:"
Write-Host "  $outLog"
Write-Host "  $errLog"
Write-Host ""
Write-Host "Press Enter or Ctrl+C in this window to stop the local viewer server."

# Use Start-Process instead of invoking python directly.
# Python's http.server writes access logs to stderr. In PowerShell those stderr
# lines can be surfaced as NativeCommandError records and can terminate wrapper
# scripts depending on ErrorActionPreference/host behavior. Starting it as a
# child process with redirected logs avoids false build/runtime errors.
$argList = $python.Arguments
$proc = Start-Process `
    -FilePath $python.FileName `
    -ArgumentList $argList `
    -WorkingDirectory $root `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -PassThru `
    -WindowStyle Hidden

try {
    Start-Sleep -Milliseconds 750

    if ($proc.HasExited) {
        $stdout = if (Test-Path $outLog) { Get-Content $outLog -Raw -ErrorAction SilentlyContinue } else { "" }
        $stderr = if (Test-Path $errLog) { Get-Content $errLog -Raw -ErrorAction SilentlyContinue } else { "" }
        throw "Viewer HTTP server exited immediately with code $($proc.ExitCode).`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
    }

    if (-not $NoBrowser) {
        Start-Process $url
    }

    [void][Console]::ReadLine()
}
finally {
    if ($proc -and -not $proc.HasExited) {
        try {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            Write-Host "Stopped viewer server on port $Port."
        }
        catch {
            Write-Warning "Could not stop viewer server process $($proc.Id): $($_.Exception.Message)"
        }
    }
}
