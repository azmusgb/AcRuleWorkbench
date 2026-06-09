[CmdletBinding()]
param(
    [string]$BaseUrl = "http://127.0.0.1:8787",

    [ValidateRange(5, 600)]
    [int]$ReadyTimeoutSeconds = 120,

    [ValidateRange(250, 10000)]
    [int]$PollMilliseconds = 1000,

    [switch]$SkipDataChecks
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

function Join-Url {
    param(
        [Parameter(Mandatory = $true)][string]$Base,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $baseTrimmed = $Base.TrimEnd([char[]]@('/'))
    $pathTrimmed = $Path.TrimStart([char[]]@('/'))
    return $baseTrimmed + '/' + $pathTrimmed
}

function Write-CheckResult {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][bool]$Ok,
        [Parameter(Mandatory = $false)][string]$Detail = ""
    )

    $suffix = ""
    if (-not [string]::IsNullOrWhiteSpace($Detail)) {
        $suffix = " - $Detail"
    }

    if ($Ok) {
        Write-Host ("[OK]   " + $Name + $suffix) -ForegroundColor Green
    }
    else {
        Write-Host ("[FAIL] " + $Name + $suffix) -ForegroundColor Red
    }
}

function Invoke-HttpCheck {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $false)][int]$TimeoutSeconds = 5,
        [Parameter(Mandatory = $false)][switch]$Json
    )

    try {
        if ($Json) {
            $result = Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSeconds -ErrorAction Stop
            Write-CheckResult -Name $Name -Ok $true -Detail $Url
            return [pscustomobject]@{ Ok = $true; Result = $result; Error = $null }
        }

        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSeconds -ErrorAction Stop
        Write-CheckResult -Name $Name -Ok $true -Detail ("HTTP " + [int]$response.StatusCode)
        return [pscustomobject]@{ Ok = $true; Result = $response; Error = $null }
    }
    catch {
        Write-CheckResult -Name $Name -Ok $false -Detail $_.Exception.Message
        return [pscustomobject]@{ Ok = $false; Result = $null; Error = $_.Exception.Message }
    }
}

function Wait-JsonEndpoint {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds,
        [Parameter(Mandatory = $true)][int]$PollMilliseconds
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $lastError = $null

    while ((Get-Date) -lt $deadline) {
        try {
            $result = Invoke-RestMethod -Uri $Url -TimeoutSec 5 -ErrorAction Stop
            Write-CheckResult -Name $Name -Ok $true -Detail $Url
            return [pscustomobject]@{ Ok = $true; Result = $result; Error = $null }
        }
        catch {
            $lastError = $_.Exception.Message
            Start-Sleep -Milliseconds $PollMilliseconds
        }
    }

    Write-CheckResult -Name $Name -Ok $false -Detail ("Timed out after $TimeoutSeconds seconds. Last error: $lastError")
    return [pscustomobject]@{ Ok = $false; Result = $null; Error = $lastError }
}

function Get-ApiItemCount {
    param([Parameter(Mandatory = $false)]$Response)

    if ($null -eq $Response) { return $null }

    try {
        if ($null -ne $Response.data -and $null -ne $Response.data.items) {
            return @($Response.data.items).Count
        }
        if ($null -ne $Response.items) {
            return @($Response.items).Count
        }
        if ($null -ne $Response.data -and $null -ne $Response.data.count) {
            return [int]$Response.data.count
        }
        if ($null -ne $Response.count) {
            return [int]$Response.count
        }
    }
    catch {
        return $null
    }

    return $null
}

$base = $BaseUrl.TrimEnd('/')
$failures = New-Object System.Collections.Generic.List[string]

Write-Host ""
Write-Host "FW Editor Viewer live verification" -ForegroundColor Cyan
Write-Host "Base URL: $base" -ForegroundColor Cyan
Write-Host ""

$checks = @()

$live = Invoke-HttpCheck -Name "API live" -Url (Join-Url $base "/api/v1/health/live") -Json
if (-not $live.Ok) { $failures.Add("API live") }

$ready = Wait-JsonEndpoint -Name "API ready" -Url (Join-Url $base "/api/v1/health/ready") -TimeoutSeconds $ReadyTimeoutSeconds -PollMilliseconds $PollMilliseconds
if (-not $ready.Ok) { $failures.Add("API ready") }

$status = Invoke-HttpCheck -Name "API status" -Url (Join-Url $base "/api/v1/status") -Json
if (-not $status.Ok) { $failures.Add("API status") }

$viewer = Invoke-HttpCheck -Name "Viewer HTML" -Url (Join-Url $base "/viewer?nocache=verify")
if (-not $viewer.Ok) { $failures.Add("Viewer HTML") }

$css = Invoke-HttpCheck -Name "Viewer CSS" -Url (Join-Url $base "/ac-rule-viewer.css")
if (-not $css.Ok) { $failures.Add("Viewer CSS") }

$js = Invoke-HttpCheck -Name "Viewer JS" -Url (Join-Url $base "/ac-rule-viewer.js")
if (-not $js.Ok) { $failures.Add("Viewer JS") }

if (-not $SkipDataChecks) {
    $udfs = Invoke-HttpCheck -Name "FWD UDF endpoint" -Url (Join-Url $base "/api/v1/fwd/udfs") -Json
    if (-not $udfs.Ok) {
        $failures.Add("FWD UDF endpoint")
    }
    else {
        $count = Get-ApiItemCount -Response $udfs.Result
        if ($null -ne $count) { Write-Host "       UDF items: $count" -ForegroundColor DarkGray }
    }

    $tables = Invoke-HttpCheck -Name "FWD tables endpoint" -Url (Join-Url $base "/api/v1/fwd/tables") -Json
    if (-not $tables.Ok) {
        $failures.Add("FWD tables endpoint")
    }
    else {
        $count = Get-ApiItemCount -Response $tables.Result
        if ($null -ne $count) { Write-Host "       Table items: $count" -ForegroundColor DarkGray }
    }

    $resources = Invoke-HttpCheck -Name "FWD resources endpoint" -Url (Join-Url $base "/api/v1/fwd/resources?includeDetails=true") -Json
    if (-not $resources.Ok) {
        $failures.Add("FWD resources endpoint")
    }
    else {
        $count = Get-ApiItemCount -Response $resources.Result
        if ($null -ne $count) { Write-Host "       Resource items: $count" -ForegroundColor DarkGray }
    }
}

Write-Host ""
if ($failures.Count -gt 0) {
    Write-Host "Live verification failed." -ForegroundColor Red
    Write-Host "Failed checks:" -ForegroundColor Red
    foreach ($failure in $failures) {
        Write-Host "  - $failure" -ForegroundColor Red
    }
    exit 1
}

Write-Host "Live verification passed." -ForegroundColor Green
exit 0
