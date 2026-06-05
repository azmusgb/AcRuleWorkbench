Set-StrictMode -Version 2.0

function Get-WbListeningProcessIdsOnPort {
    param([Parameter(Mandatory = $true)][int]$Port)

    $ids = @()

    $getNetTcpConnection = Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue
    if ($null -ne $getNetTcpConnection) {
        $connections = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
        $ids += $connections | Select-Object -ExpandProperty OwningProcess -Unique
    }
    else {
        $lines = @(netstat -ano -p tcp | Select-String -Pattern "LISTENING" | Where-Object { $_.Line -match ":$Port\s" })
        foreach ($line in $lines) {
            $parts = @($line.Line -split "\s+" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
            if ($parts.Count -ge 5) {
                $parsedPid = 0
                if ([int]::TryParse($parts[$parts.Count - 1], [ref]$parsedPid)) {
                    $ids += $parsedPid
                }
            }
        }
    }

    return @($ids | Where-Object { $_ -gt 0 } | Sort-Object -Unique)
}

function Get-WbProcessLabel {
    param([Parameter(Mandatory = $true)][int]$ProcessId)

    try {
        $process = Get-Process -Id $ProcessId -ErrorAction Stop
        return "$($process.ProcessName) PID $ProcessId"
    }
    catch {
        return "PID $ProcessId"
    }
}

function Get-WbPortUsageSummary {
    param([Parameter(Mandatory = $true)][int]$Port)

    $ids = @(Get-WbListeningProcessIdsOnPort -Port $Port)
    if ($ids.Count -eq 0) {
        return "no active TCP listener was detected"
    }

    $labels = @()
    foreach ($idValue in $ids) {
        $labels += (Get-WbProcessLabel -ProcessId $idValue)
    }

    return ($labels -join ", ")
}

function Test-WbLocalPortAvailable {
    param(
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$HostName
    )

    $ids = @(Get-WbListeningProcessIdsOnPort -Port $Port)
    if ($ids.Count -gt 0) {
        return $false
    }

    $ipAddress = [System.Net.IPAddress]::Loopback
    if (-not [string]::IsNullOrWhiteSpace($HostName) -and $HostName -ne "localhost") {
        $parsedAddress = [System.Net.IPAddress]::Loopback
        if ([System.Net.IPAddress]::TryParse($HostName, [ref]$parsedAddress)) {
            $ipAddress = $parsedAddress
        }
    }

    $listener = $null
    try {
        $listener = New-Object System.Net.Sockets.TcpListener($ipAddress, $Port)
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        if ($null -ne $listener) {
            $listener.Stop()
        }
    }
}

function Stop-WbListenersOnPort {
    param([Parameter(Mandatory = $true)][int]$Port)

    $ids = @(Get-WbListeningProcessIdsOnPort -Port $Port)

    if ($ids.Count -eq 0) {
        Write-WbOk "No existing listener on port $Port"
        return @()
    }

    foreach ($idValue in $ids) {
        if ($idValue -eq 4) {
            Write-WbWarn "Port $Port is owned by HTTP.sys/System PID 4. It cannot be stopped by this script."
            continue
        }

        if ($idValue -eq $PID) {
            Write-WbWarn "Port $Port appears to be owned by the current PowerShell process PID $PID. It will not be stopped."
            continue
        }

        try {
            $process = Get-Process -Id $idValue -ErrorAction Stop
            Write-WbWarn "Stopping listener on port ${Port}: $($process.ProcessName) PID $idValue"
            Stop-Process -Id $idValue -Force -ErrorAction Stop
        }
        catch {
            Write-WbWarn "Could not stop PID $idValue on port ${Port}: $($_.Exception.Message)"
        }
    }

    Start-Sleep -Milliseconds 300
    return @(Get-WbListeningProcessIdsOnPort -Port $Port)
}

function Resolve-WbApiPort {
    param(
        [Parameter(Mandatory = $true)][int]$RequestedPort,
        [Parameter(Mandatory = $true)][string]$HostName,
        [Parameter(Mandatory = $true)][bool]$KillExisting,
        [Parameter(Mandatory = $true)][bool]$AutoPort,
        [Parameter(Mandatory = $true)][int]$SearchLimit
    )

    if ($KillExisting) {
        Write-WbSection "Kill existing listener"
        [void](Stop-WbListenersOnPort -Port $RequestedPort)
    }
    else {
        Write-WbSection "Port check"
    }

    if (Test-WbLocalPortAvailable -Port $RequestedPort -HostName $HostName) {
        Write-WbOk "Port $RequestedPort is available."
        return $RequestedPort
    }

    $usage = Get-WbPortUsageSummary -Port $RequestedPort

    if (-not $AutoPort) {
        throw "Port $RequestedPort is not available ($usage). Use -Port with another value, rerun with -KillExisting, or omit -NoAutoPort."
    }

    Write-WbWarn "Port $RequestedPort is not available ($usage). Looking for the next open local port."

    $lastCandidate = $RequestedPort + $SearchLimit
    for ($candidate = $RequestedPort + 1; $candidate -le $lastCandidate; $candidate++) {
        if (Test-WbLocalPortAvailable -Port $candidate -HostName $HostName) {
            Write-WbWarn "Using port $candidate instead of $RequestedPort."
            return $candidate
        }
    }

    throw "Could not find an available port from $($RequestedPort + 1) through $lastCandidate."
}

function Test-WbRuntimeFolder {
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [Parameter(Mandatory = $true)][string[]]$RequiredDlls,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) {
        throw "$Label directory not found: $Directory"
    }

    $actualNames = @(Get-ChildItem -LiteralPath $Directory -File -Filter "*.dll" -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
    $missing = @($RequiredDlls | Where-Object { $actualNames -notcontains $_ })

    if ($missing.Count -gt 0) {
        throw "$Label missing required DLLs in $Directory`: $($missing -join ', ')"
    }

    Write-WbOk "$Label validated: $Directory"
}

function Add-WbPathEntry {
    param([Parameter(Mandatory = $true)][string]$Directory)

    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) {
        return
    }

    $currentPath = [Environment]::GetEnvironmentVariable("PATH", "Process")
    $parts = @($currentPath -split ";" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })

    $alreadyPresent = $false
    foreach ($part in $parts) {
        if ([string]::Equals($part.TrimEnd('\'), $Directory.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
            $alreadyPresent = $true
            break
        }
    }

    if (-not $alreadyPresent) {
        [Environment]::SetEnvironmentVariable("PATH", "$Directory;$currentPath", "Process")
        $env:PATH = [Environment]::GetEnvironmentVariable("PATH", "Process")
    }
}

function Initialize-WbRuntimePath {
    param(
        [Parameter(Mandatory = $true)][string]$ScriptDirectory,
        [Parameter(Mandatory = $true)][string]$ManagedLibDirectory,
        [Parameter(Mandatory = $true)][string]$NativeLibDirectory
    )

    $runtimeHelperPath = Join-Path $ScriptDirectory "runtime-path.generated.ps1"

    if (Test-Path -LiteralPath $runtimeHelperPath -PathType Leaf) {
        Unblock-File -LiteralPath $runtimeHelperPath -ErrorAction SilentlyContinue
        . $runtimeHelperPath
        Write-WbOk "Loaded runtime PATH helper: $runtimeHelperPath"
    }
    else {
        Add-WbPathEntry -Directory $NativeLibDirectory
        Add-WbPathEntry -Directory $ManagedLibDirectory
        Write-WbOk "Prepended runtime folders to PATH."
    }

    $env:FORMWORKS_NATIVE_BIN = $NativeLibDirectory
}
