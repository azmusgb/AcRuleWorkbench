<#
.SYNOPSIS
  Static quality checks for AC Rule Workbench source and package assets.

.DESCRIPTION
  This script is intentionally Windows PowerShell 5.1 compatible. It validates
  PowerShell syntax, OpenAPI JSON syntax, generated-viewer JavaScript syntax
  when Node.js is available, and basic package hygiene. It does not replace
  MSBuild; run build-and-doctor.ps1 for compile/native validation.
#>
[CmdletBinding()]
param(
    [string]$Root = "",
    [switch]$SkipNode
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$failures = New-Object System.Collections.Generic.List[string]
$scriptRoot = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) { $PSScriptRoot } else { Split-Path -Parent $PSCommandPath }
if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = (Resolve-Path (Join-Path $scriptRoot "..")).Path
}

function Add-Failure {
    param([string]$Message)
    $failures.Add($Message) | Out-Null
}

function Test-PowerShellSyntax {
    param([string]$File)
    $tokens = $null
    $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($File, [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors -and $errors.Count -gt 0) {
        $joined = ($errors | ForEach-Object { "$($_.Extent.StartLineNumber):$($_.Extent.StartColumnNumber) $($_.Message)" }) -join "; "
        Add-Failure "PowerShell syntax error in $File - $joined"
    }
}


function Test-ViewerProductionHygiene {
    param([string]$File)

    $html = Get-Content -LiteralPath $File -Raw -Encoding UTF8
    $viewerDir = Split-Path -Parent $File
    $scriptFile = Join-Path $viewerDir "ac-rule-viewer.js"
    $script = if (Test-Path -LiteralPath $scriptFile) { Get-Content -LiteralPath $scriptFile -Raw -Encoding UTF8 } else { $html }

    $functionMatches = [regex]::Matches($script, 'function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(')
    $groups = @{}
    foreach ($match in $functionMatches) {
        $name = $match.Groups[1].Value
        if (-not $groups.ContainsKey($name)) { $groups[$name] = 0 }
        $groups[$name]++
    }
    $duplicates = $groups.GetEnumerator() | Where-Object { $_.Value -gt 1 } | Sort-Object Name
    if ($duplicates) {
        $names = ($duplicates | ForEach-Object { "$($_.Name)=$($_.Value)" }) -join ', '
        Add-Failure "Viewer template contains duplicate JavaScript function declarations: $names"
    }

    $actionMatches = [regex]::Matches($html, 'data-action="([^"]+)"')
    $handledMatches = [regex]::Matches($script, "a==='([^']+)'")
    $actions = New-Object 'System.Collections.Generic.HashSet[string]'
    $handled = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($match in $actionMatches) { [void]$actions.Add($match.Groups[1].Value) }
    foreach ($match in $handledMatches) { [void]$handled.Add($match.Groups[1].Value) }
    foreach ($action in $actions) {
        if (-not $handled.Contains($action)) {
            Add-Failure "Viewer data-action '$action' has no handler in handleAction()."
        }
    }

    if ($html -match 'data-action="toggle-density"') {
        Add-Failure "Density toggle is still exposed in the production viewer."
    }

    if ($html -match 'toggle-rca-focus|RCA Focus' -or $script -match 'toggle-rca-focus|rcaFocus|RCA Focus') {
        Add-Failure "RCA focus UI/state is still exposed in the production viewer."
    }
}

function Test-JsonFile {
    param([string]$File)
    try {
        $raw = Get-Content -LiteralPath $File -Raw -Encoding UTF8
        if ([string]::IsNullOrWhiteSpace($raw)) { throw "File is empty." }
        $null = $raw | ConvertFrom-Json
    }
    catch {
        Add-Failure "Invalid JSON in $File - $($_.Exception.Message)"
    }
}

Write-Host "AC Rule Workbench static quality checks"
Write-Host "Root: $Root"
Write-Host ""

Get-ChildItem -LiteralPath (Join-Path $Root "scripts") -Filter "*.ps1" -File | ForEach-Object {
    Test-PowerShellSyntax -File $_.FullName
}

$openApi = Join-Path $Root "docs\openapi\ac-workbench-api-v1.openapi.json"
if (Test-Path $openApi) { Test-JsonFile -File $openApi } else { Add-Failure "OpenAPI JSON was not found: $openApi" }

$viewer = Join-Path $Root "AcRuleWorkbench.Core\Viewer\ac-viewer-template.html"
if (!(Test-Path $viewer)) {
    Add-Failure "Viewer template was not found: $viewer"
}
else {
    Test-ViewerProductionHygiene -File $viewer
}

if (-not $SkipNode) {
    $viewerScript = Join-Path $Root "AcRuleWorkbench.Core\Viewer\ac-rule-viewer.js"
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node) {
        if (Test-Path -LiteralPath $viewerScript) {
            & $node.Source --check $viewerScript
            if ($LASTEXITCODE -ne 0) { Add-Failure "Viewer JavaScript syntax check failed with exit code $LASTEXITCODE." }
        }
        elseif (Test-Path $viewer) {
            $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("ac-rule-workbench-viewer-" + [guid]::NewGuid().ToString("N") + ".js")
            try {
                $html = Get-Content -LiteralPath $viewer -Raw -Encoding UTF8
                $html = $html.Replace("__RULES_JSON__", "{}")
                $html = $html.Replace("__RELATIONSHIPS_JSON__", "{}")
                $html = $html.Replace("__TREE_JSON__", "{}")
                $html = $html.Replace("__FLOW_JSON__", "{}")
                $matches = [regex]::Matches($html, "<script>(.*?)</script>", [System.Text.RegularExpressions.RegexOptions]::Singleline)
                $script = ($matches | ForEach-Object { $_.Groups[1].Value }) -join "`n"
                Set-Content -LiteralPath $temp -Value $script -Encoding UTF8
                & $node.Source --check $temp
                if ($LASTEXITCODE -ne 0) { Add-Failure "Viewer JavaScript syntax check failed with exit code $LASTEXITCODE." }
            }
            finally {
                Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
            }
        }
    }
    else {
        Write-Warning "Node.js was not found. Skipping viewer JavaScript syntax check."
    }
}

$readme = Join-Path $Root "README.md"
if (!(Test-Path $readme)) { Add-Failure "README.md was not found." }

if ($failures.Count -gt 0) {
    Write-Host ""
    Write-Host "Static quality checks failed:" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
    exit 1
}

Write-Host "Static quality checks passed." -ForegroundColor Green
