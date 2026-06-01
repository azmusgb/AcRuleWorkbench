#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$InnoSetupCompiler = '',
    [string]$ScriptPath = (Join-Path $PSScriptRoot 'ACRuleWorkbenchInstaller.iss')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-ISCC {
    param([string]$Explicit)
    if (-not [string]::IsNullOrWhiteSpace($Explicit)) {
        if (Test-Path -LiteralPath $Explicit -PathType Leaf) { return $Explicit }
        throw "ISCC.exe was not found: $Explicit"
    }

    $cmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $candidates = @(
        'C:\Program Files (x86)\Inno Setup 6\ISCC.exe',
        'C:\Program Files\Inno Setup 6\ISCC.exe'
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }

    throw 'Inno Setup compiler was not found. Install Inno Setup 6 or pass -InnoSetupCompiler.'
}

$iscc = Resolve-ISCC -Explicit $InnoSetupCompiler
Write-Host "Using Inno Setup compiler: $iscc"
& $iscc $ScriptPath
if ($LASTEXITCODE -ne 0) { throw "Inno Setup compiler failed with exit code $LASTEXITCODE." }
Write-Host 'Installer build complete.'
