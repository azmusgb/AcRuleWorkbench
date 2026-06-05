Set-StrictMode -Version 2.0

function Write-WbSection {
    param([Parameter(Mandatory = $true)][string]$Text)

    Write-Host ""
    Write-Host "== $Text ==" -ForegroundColor Cyan
}

function Write-WbOk {
    param([Parameter(Mandatory = $true)][string]$Text)

    Write-Host "[OK] $Text" -ForegroundColor Green
}

function Write-WbInfo {
    param([Parameter(Mandatory = $true)][string]$Text)

    Write-Host "[INFO] $Text" -ForegroundColor Gray
}

function Write-WbWarn {
    param([Parameter(Mandatory = $true)][string]$Text)

    Write-Warning $Text
}

function Write-WbKeyValue {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $false)][AllowNull()][object]$Value
    )

    $displayValue = if ($null -eq $Value) { "" } else { [string]$Value }
    Write-Host ($Name.PadRight(14) + ": " + $displayValue)
}
