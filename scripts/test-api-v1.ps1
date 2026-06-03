[CmdletBinding()]
param(
    [string]$BaseUrl = "http://127.0.0.1:8787",
    [string]$ScopeId,
    [string]$NodeId
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

function Invoke-ApiCheck {
    param(
        [string]$Name,
        [string]$Method = 'GET',
        [string]$Path,
        [object]$Body = $null
    )

    $uri = $BaseUrl.TrimEnd('/') + $Path
    Write-Host "[$Name] $Method $uri" -ForegroundColor Cyan
    if ($null -eq $Body) {
        $result = Invoke-RestMethod -Method $Method -Uri $uri -Headers @{ 'X-Request-Id' = "smoke-$Name" }
    } else {
        $json = $Body | ConvertTo-Json -Depth 12
        $result = Invoke-RestMethod -Method $Method -Uri $uri -Body $json -ContentType 'application/json' -Headers @{ 'X-Request-Id' = "smoke-$Name" }
    }

    $okProperty = $result.PSObject.Properties['ok']
    if ($null -ne $okProperty -and $okProperty.Value -ne $true) {
        throw "$Name returned ok=false"
    }

    return $result
}

Invoke-ApiCheck -Name 'live' -Path '/api/v1/health/live' | Out-Null
Invoke-ApiCheck -Name 'routes' -Path '/api/v1/routes' | Out-Null
Invoke-ApiCheck -Name 'openapi' -Path '/api/v1/openapi.json' | Out-Null
Invoke-ApiCheck -Name 'capabilities' -Path '/api/v1/capabilities' | Out-Null
Invoke-ApiCheck -Name 'snapshot' -Path '/api/v1/snapshot' | Out-Null
$scopes = Invoke-ApiCheck -Name 'scopes' -Path '/api/v1/scopes'

if ([string]::IsNullOrWhiteSpace($ScopeId) -and $scopes.data.items.Count -gt 0) {
    $ScopeId = $scopes.data.items[0].scopeId
}

if (-not [string]::IsNullOrWhiteSpace($ScopeId)) {
    $encodedScope = [uri]::EscapeDataString($ScopeId)
    Invoke-ApiCheck -Name 'scope' -Path "/api/v1/scopes/$encodedScope" | Out-Null
    Invoke-ApiCheck -Name 'scope-include' -Path "/api/v1/scopes/${encodedScope}?include=structure,inventory,references,diagnostics&limit=10" | Out-Null
    Invoke-ApiCheck -Name 'structure-alias' -Path "/api/v1/scopes/$encodedScope/structure" | Out-Null
    Invoke-ApiCheck -Name 'inventory-alias' -Path "/api/v1/scopes/${encodedScope}/inventory?limit=10" | Out-Null
    Invoke-ApiCheck -Name 'references-alias' -Path "/api/v1/scopes/$encodedScope/references" | Out-Null
    Invoke-ApiCheck -Name 'scope-diagnostics-alias' -Path "/api/v1/scopes/$encodedScope/diagnostics" | Out-Null
}

Invoke-ApiCheck -Name 'search' -Path '/api/v1/search?q=provider&limit=10' | Out-Null
Invoke-ApiCheck -Name 'diagnostics' -Path '/api/v1/diagnostics' | Out-Null

$exportBody = @{ format = 'json'; view = 'snapshot'; includeEvidence = $true }
Invoke-ApiCheck -Name 'export' -Method 'POST' -Path '/api/v1/export' -Body $exportBody | Out-Null

if (-not [string]::IsNullOrWhiteSpace($NodeId)) {
    Invoke-ApiCheck -Name 'rule' -Path "/api/v1/rules/$NodeId" | Out-Null
    Invoke-ApiCheck -Name 'rule-include' -Path "/api/v1/rules/${NodeId}?include=subtree,references,diagnostics&maxDepth=2" | Out-Null
    Invoke-ApiCheck -Name 'subtree-alias' -Path "/api/v1/rules/${NodeId}/subtree?maxDepth=2" | Out-Null
}

Write-Host "API v1 smoke checks completed." -ForegroundColor Green

try {
    $debugUri = $BaseUrl.TrimEnd('/') + '/api/debug/probe'
    Write-Host "[debug-disabled] GET $debugUri" -ForegroundColor Cyan
    $debug = Invoke-RestMethod -Method GET -Uri $debugUri -Headers @{ 'X-Request-Id' = 'smoke-debug-disabled' }
    if ($debug.ok -ne $false) { throw 'Expected debug endpoint to return ok=false when debug API is disabled.' }
}
catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) { }
    else { throw }
}
