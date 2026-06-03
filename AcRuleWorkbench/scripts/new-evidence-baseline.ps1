<#
.SYNOPSIS
  Generates a timestamped evidence baseline from the x86/net48 AcRuleWorkbench executable.

.EXAMPLE
  .\scripts\new-evidence-baseline.ps1 -FwdPath C:\dev\AcRuleWorkbench\fwd.cfd
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$FwdPath,

    [ValidateSet('Debug', 'Release')]
    [string]$Configuration = 'Debug',

    [ValidateSet('x86')]
    [string]$Platform = 'x86',

    [string]$Process = 'AC',
    [string]$OutDir = '',
    [switch]$RequireNativeOk,
    [switch]$SkipBuild,
    [switch]$SkipFlow,
    [switch]$Zip
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $OutDir = Join-Path $root "evidence\R1-fwd-$stamp"
}

$exe = Join-Path $root "AcRuleWorkbench\bin\x86\$Configuration\net48\AcRuleWorkbench.exe"
$runtimePath = Join-Path $PSScriptRoot 'runtime-path.generated.ps1'
if (Test-Path -LiteralPath $runtimePath -PathType Leaf) { . $runtimePath }
foreach ($runtimeDir in @((Join-Path $root 'rri_bin'), (Join-Path $root 'lib'))) {
    if (Test-Path -LiteralPath $runtimeDir) { $env:PATH = "$runtimeDir;$env:PATH" }
}
$env:ACRULEWORKBENCH_PLATFORM = 'x86'

function Resolve-FullPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
}

function Invoke-HarnessJson {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$OutputFile
    )

    $fullOut = Resolve-FullPath $OutputFile
    $outParent = Split-Path -Parent $fullOut
    if (-not (Test-Path -LiteralPath $outParent)) { New-Item -ItemType Directory -Force -Path $outParent | Out-Null }
    if (Test-Path -LiteralPath $fullOut) { Remove-Item -LiteralPath $fullOut -Force }

    $finalArgs = @()
    $finalArgs += $Arguments
    $finalArgs += @('--json', '--out-json', $fullOut)
    if ($RequireNativeOk) { $finalArgs += '--require-native-ok' }

    Write-Host "[evidence] $Name -> $fullOut" -ForegroundColor Cyan
    Push-Location (Split-Path -Parent $exe)
    try {
        & $exe @finalArgs
        if ($LASTEXITCODE -ne 0) { throw "Command failed for $Name with exit code $LASTEXITCODE." }
    }
    finally { Pop-Location }

    if (-not (Test-Path -LiteralPath $fullOut -PathType Leaf)) { throw "Command completed but did not create output: $fullOut" }
    $raw = Get-Content -LiteralPath $fullOut -Raw -Encoding UTF8
    $null = $raw | ConvertFrom-Json
}

$resolvedFwdPath = Resolve-FullPath $FwdPath
if (-not (Test-Path -LiteralPath $resolvedFwdPath -PathType Leaf)) { throw "FWD file not found: $resolvedFwdPath" }

if (-not $SkipBuild) {
    $buildScript = Join-Path $PSScriptRoot 'build-and-doctor.ps1'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $buildScript -Configuration $Configuration -Platform x86 -FwdPath $resolvedFwdPath
    if ($LASTEXITCODE -ne 0) { throw "build-and-doctor.ps1 failed with exit code $LASTEXITCODE" }
}

if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw "x86 executable not found: $exe" }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$viewerHtml = Join-Path $OutDir 'ac-rule-viewer.html'
$rulesJson = Join-Path $OutDir 'ac-rule-viewer.rules.json'
$treeJson = Join-Path $OutDir 'ac-rule-viewer.tree.json'
$relJson = Join-Path $OutDir 'ac-rule-viewer.rel.json'
$flowJson = Join-Path $OutDir 'ac-rule-viewer.flow.json'

Push-Location (Split-Path -Parent $exe)
try {
    & $exe 'ac-viewer' '--path' $resolvedFwdPath '--process' $Process '--out' $viewerHtml
    if ($LASTEXITCODE -ne 0) { throw "ac-viewer failed with exit code $LASTEXITCODE" }
}
finally { Pop-Location }

Invoke-HarnessJson -Name 'rules' -Arguments @('rules', '--path', $resolvedFwdPath, '--process', $Process) -OutputFile $rulesJson
Invoke-HarnessJson -Name 'tree' -Arguments @('tree', '--path', $resolvedFwdPath, '--process', $Process) -OutputFile $treeJson
Invoke-HarnessJson -Name 'relationships' -Arguments @('relationships', '--path', $resolvedFwdPath, '--process', $Process) -OutputFile $relJson
if (-not $SkipFlow) { Invoke-HarnessJson -Name 'flow' -Arguments @('flow', '--path', $resolvedFwdPath, '--process', $Process) -OutputFile $flowJson }

$manifest = [pscustomobject]@{
    generatedAt = (Get-Date).ToString('o')
    platform = 'x86'
    configuration = $Configuration
    fwdPath = $resolvedFwdPath
    process = $Process
    outputDirectory = (Resolve-FullPath $OutDir)
    executable = $exe
}
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutDir 'evidence-manifest.json') -Encoding UTF8

if ($Zip) {
    $zipPath = "$OutDir.zip"
    if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
    Compress-Archive -Path (Join-Path $OutDir '*') -DestinationPath $zipPath -Force
    Write-Host "Created evidence zip: $zipPath" -ForegroundColor Green
}

Write-Host "Evidence baseline created: $OutDir" -ForegroundColor Green
