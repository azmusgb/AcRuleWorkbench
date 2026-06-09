Set-StrictMode -Version 2.0

$script:WbProgressCurrent = 0
$script:WbProgressTotal = 0

function Initialize-WbProgress {
    param([ValidateRange(0, 99)][int]$TotalSteps = 0)

    $script:WbProgressCurrent = 0
    $script:WbProgressTotal = $TotalSteps
}

function Write-WbSection {
    param([Parameter(Mandatory = $true)][string]$Text)

    Write-Host ""
    if ($script:WbProgressTotal -gt 0) {
        $script:WbProgressCurrent++
        $prefix = "[{0}/{1}]" -f $script:WbProgressCurrent, $script:WbProgressTotal
        Write-Host "$prefix $Text" -ForegroundColor Cyan
    }
    else {
        Write-Host "== $Text ==" -ForegroundColor Cyan
    }
}

function Write-WbOk {
    param([Parameter(Mandatory = $true)][string]$Text)

    Write-Host "[OK] $Text" -ForegroundColor Green
}

function Write-WbSuccess {
    param([Parameter(Mandatory = $true)][string]$Text)

    Write-Host "[DONE] $Text" -ForegroundColor Green
}

function Write-WbReady {
    param([Parameter(Mandatory = $true)][string]$Text)

    Write-Host "[READY] $Text" -ForegroundColor Green
}

function Write-WbComplete {
    param([Parameter(Mandatory = $true)][string]$Text)

    Write-Host ""
    Write-Host "[COMPLETE] $Text" -ForegroundColor Green
}

function Write-WbInfo {
    param([Parameter(Mandatory = $true)][string]$Text)

    Write-Host "[INFO] $Text" -ForegroundColor Gray
}

function Write-WbProgress {
    param([Parameter(Mandatory = $true)][string]$Text)

    Write-Host "[...] $Text" -ForegroundColor DarkCyan
}

function Write-WbWarn {
    param([Parameter(Mandatory = $true)][string]$Text)

    Write-Warning $Text
}

function Write-WbCommand {
    param([Parameter(Mandatory = $true)][string]$Text)

    Write-Host ""
    Write-Host "> $Text" -ForegroundColor DarkGray
}

function Write-WbKeyValue {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $false)][AllowNull()][object]$Value
    )

    $displayValue = if ($null -eq $Value) { "" } else { [string]$Value }
    Write-Host ("  " + $Name.PadRight(14) + ": " + $displayValue)
}
