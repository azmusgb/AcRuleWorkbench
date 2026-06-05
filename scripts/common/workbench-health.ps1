Set-StrictMode -Version 2.0

function Test-WbHttpEndpoint {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $false)][int]$TimeoutSeconds = 4
    )

    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSeconds -ErrorAction Stop
        return [pscustomobject]@{
            Ok = $true
            StatusCode = [int]$response.StatusCode
            Error = $null
        }
    }
    catch {
        $statusCode = $null
        if ($null -ne $_.Exception.Response) {
            try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { $statusCode = $null }
        }

        return [pscustomobject]@{
            Ok = $false
            StatusCode = $statusCode
            Error = $_.Exception.Message
        }
    }
}

function Wait-WbHttpEndpoint {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $false)][int]$TimeoutSeconds = 90,
        [Parameter(Mandatory = $false)][int]$PollMilliseconds = 1000,
        [Parameter(Mandatory = $false)][string]$Label = "HTTP endpoint"
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $last = $null

    while ((Get-Date) -lt $deadline) {
        $last = Test-WbHttpEndpoint -Url $Url -TimeoutSeconds 4
        if ($last.Ok) {
            Write-WbOk "$Label is responding: $Url"
            return $true
        }

        Start-Sleep -Milliseconds $PollMilliseconds
    }

    $lastError = if ($null -ne $last -and -not [string]::IsNullOrWhiteSpace($last.Error)) { $last.Error } else { "timeout" }
    throw "$Label did not respond within $TimeoutSeconds seconds. URL: $Url. Last error: $lastError"
}
