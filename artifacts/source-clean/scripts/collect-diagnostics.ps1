<#
.SYNOPSIS
  Collects a product-safe AC Rule Workbench diagnostic bundle from a running server.
#>
[CmdletBinding()]
param(
    [string]$BaseUrl = "http://127.0.0.1:8787",
    [string]$OutDir = (Join-Path (Get-Location) ("acwb-diagnostics-" + (Get-Date -Format "yyyyMMdd-HHmmss")))
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Save-Endpoint {
    param(
        [string]$Name,
        [string]$Path,
        [switch]$Optional
    )

    $uri = $BaseUrl.TrimEnd('/') + $Path
    $target = Join-Path $OutDir ($Name + ".json")
    try {
        Write-Host "GET $uri" -ForegroundColor Cyan
        $response = Invoke-WebRequest -Method GET -Uri $uri -Headers @{ 'X-Request-Id' = "diag-$Name" } -UseBasicParsing
        $response.Content | Set-Content -LiteralPath $target -Encoding UTF8
    }
    catch {
        if ($Optional) {
            @{ ok = $false; endpoint = $Path; error = $_.Exception.Message } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $target -Encoding UTF8
            return
        }
        throw
    }
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Save-Endpoint -Name "status" -Path "/api/v1/status"
Save-Endpoint -Name "readiness" -Path "/api/v1/health/ready"
Save-Endpoint -Name "diagnostics" -Path "/api/v1/diagnostics"
Save-Endpoint -Name "routes" -Path "/api/v1/routes"
Save-Endpoint -Name "debug-probe" -Path "/api/debug/probe" -Optional

$manifest = [ordered]@{
    schema = "AcRuleWorkbench.DiagnosticsBundle"
    schemaVersion = "1.0.0"
    collectedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    baseUrl = $BaseUrl
    files = Get-ChildItem -LiteralPath $OutDir -File | Select-Object -ExpandProperty Name
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $OutDir "manifest.json") -Encoding UTF8

$zip = $OutDir.TrimEnd('\','/') + ".zip"
if (Test-Path $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -Path (Join-Path $OutDir "*") -DestinationPath $zip -Force
Write-Host "Diagnostic bundle written: $zip" -ForegroundColor Green
