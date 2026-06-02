[CmdletBinding()]
param(
    [string]$BaseUrl = "http://127.0.0.1:8787"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

function Invoke-ApiCheck {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Url,
        [int[]]$ExpectedStatus = @(200),
        [string]$Body = ""
    )

    $status = 0
    $note = ""

    try {
        if ([string]::IsNullOrWhiteSpace($Body)) {
            $response = Invoke-WebRequest -Uri $Url -Method $Method -UseBasicParsing
        }
        else {
            $response = Invoke-WebRequest -Uri $Url -Method $Method -UseBasicParsing -ContentType "application/json" -Body $Body
        }

        $status = [int]$response.StatusCode
    }
    catch {
        try {
            if ($_.Exception.Response) {
                $status = [int]$_.Exception.Response.StatusCode.value__
            }
        }
        catch {
            $status = 0
        }

        $note = $_.Exception.Message
    }

    [pscustomobject]@{
        Name = $Name
        Method = $Method
        Status = $status
        Ok = ($ExpectedStatus -contains $status)
        Url = $Url
        Note = $note
    }
}

# Prime snapshot so readiness and dependent endpoints are meaningful.
try {
    Invoke-WebRequest -Uri "$BaseUrl/api/v1/snapshot" -Method GET -UseBasicParsing | Out-Null
}
catch {
}

$scopeId = [uri]::EscapeDataString("AC/Pages/DentalADA")
$ruleGuid = "db5bf065-618b-44ca-8484-0d12384e7d1a"

$checks = @(
    @{ Name = "Help"; Method = "GET"; Url = "$BaseUrl/api/v1/help"; Expected = @(200) },
    @{ Name = "OpenAPI"; Method = "GET"; Url = "$BaseUrl/api/v1/openapi.json"; Expected = @(200) },
    @{ Name = "Routes"; Method = "GET"; Url = "$BaseUrl/api/v1/routes"; Expected = @(200) },
    @{ Name = "Capabilities"; Method = "GET"; Url = "$BaseUrl/api/v1/capabilities"; Expected = @(200) },
    @{ Name = "Health Live"; Method = "GET"; Url = "$BaseUrl/api/v1/health/live"; Expected = @(200) },
    @{ Name = "Health Ready"; Method = "GET"; Url = "$BaseUrl/api/v1/health/ready"; Expected = @(200, 503) },
    @{ Name = "Status"; Method = "GET"; Url = "$BaseUrl/api/v1/status"; Expected = @(200) },
    @{ Name = "Snapshot"; Method = "GET"; Url = "$BaseUrl/api/v1/snapshot"; Expected = @(200) },
    @{ Name = "Snapshot Refresh"; Method = "POST"; Url = "$BaseUrl/api/v1/snapshot/refresh"; Expected = @(200) },
    @{ Name = "Scopes List"; Method = "GET"; Url = "$BaseUrl/api/v1/scopes"; Expected = @(200) },
    @{ Name = "Scope Detail"; Method = "GET"; Url = "$BaseUrl/api/v1/scopes/$scopeId"; Expected = @(200) },
    @{ Name = "Scope Structure"; Method = "GET"; Url = "$BaseUrl/api/v1/scopes/$scopeId/structure"; Expected = @(200) },
    @{ Name = "Scope Inventory"; Method = "GET"; Url = "$BaseUrl/api/v1/scopes/$scopeId/inventory"; Expected = @(200) },
    @{ Name = "Scope References"; Method = "GET"; Url = "$BaseUrl/api/v1/scopes/$scopeId/references"; Expected = @(200) },
    @{ Name = "Scope Diagnostics"; Method = "GET"; Url = "$BaseUrl/api/v1/scopes/$scopeId/diagnostics"; Expected = @(200) },
    @{ Name = "Rule Detail (GUID)"; Method = "GET"; Url = "$BaseUrl/api/v1/rules/$ruleGuid"; Expected = @(200) },
    @{ Name = "Rule Subtree (GUID)"; Method = "GET"; Url = "$BaseUrl/api/v1/rules/$ruleGuid/subtree"; Expected = @(200) },
    @{ Name = "Search"; Method = "GET"; Url = "$BaseUrl/api/v1/search?q=provider"; Expected = @(200) },
    @{ Name = "Diagnostics"; Method = "GET"; Url = "$BaseUrl/api/v1/diagnostics"; Expected = @(200) },
    @{ Name = "Export"; Method = "POST"; Url = "$BaseUrl/api/v1/export"; Expected = @(200); Body = '{"format":"json","view":"rule","nodeId":"node-000414","includeEvidence":true}' }
)

$results = foreach ($check in $checks) {
    $body = ""
    if ($check.ContainsKey("Body")) { $body = [string]$check.Body }
    Invoke-ApiCheck -Name $check.Name -Method $check.Method -Url $check.Url -ExpectedStatus $check.Expected -Body $body
}

Write-Host "API v1 live validation results" -ForegroundColor Cyan
$results | Format-Table -AutoSize Name, Method, Status, Ok

$failures = $results | Where-Object { -not $_.Ok }
Write-Host ""
if ($failures.Count -eq 0) {
    Write-Host "All endpoint validations passed." -ForegroundColor Green
}
else {
    Write-Host "Failures:" -ForegroundColor Red
    $failures | Format-Table -AutoSize Name, Method, Status, Url, Note
    exit 1
}
