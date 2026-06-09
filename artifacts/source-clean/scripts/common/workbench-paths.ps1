Set-StrictMode -Version 2.0

function Resolve-WbCommonScriptRoot {
    if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
        return $PSScriptRoot
    }

    if (-not [string]::IsNullOrWhiteSpace($PSCommandPath)) {
        return (Split-Path -Parent $PSCommandPath)
    }

    if ($null -ne $MyInvocation -and $null -ne $MyInvocation.MyCommand -and -not [string]::IsNullOrWhiteSpace($MyInvocation.MyCommand.Path)) {
        return (Split-Path -Parent $MyInvocation.MyCommand.Path)
    }

    return (Get-Location).Path
}

function Resolve-WbRepoRoot {
    $commonRoot = Resolve-WbCommonScriptRoot
    $candidate = Join-Path $commonRoot "..\.."
    return (Resolve-Path -LiteralPath $candidate).Path
}

function Resolve-WbProviderPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
}

function Resolve-WbFwdFilePath {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $false)][AllowEmptyString()][string]$FwdPath
    )

    if ([string]::IsNullOrWhiteSpace($FwdPath)) {
        $FwdPath = Join-Path $Root "fwd.cfd"
    }

    if ($FwdPath -match "^:\\") {
        throw "Invalid FwdPath '$FwdPath'. You probably meant C:\dev\AcRuleWorkbench\fwd.cfd."
    }

    $resolved = Resolve-WbProviderPath -Path $FwdPath
    if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
        throw "FWD file not found: $resolved"
    }

    $item = Get-Item -LiteralPath $resolved -ErrorAction Stop
    if ($item.Extension -ne ".cfd") {
        throw "FwdPath must point to a .cfd file: $resolved"
    }

    return $item.FullName
}

function Find-WbExecutable {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Configuration,
        [Parameter(Mandatory = $true)][string]$Platform
    )

    $preferred = @(
        (Join-Path $Root "AcRuleWorkbench\bin\$Platform\$Configuration\net48\win-x86\AcRuleWorkbench.exe"),
        (Join-Path $Root "AcRuleWorkbench\bin\$Platform\$Configuration\net48\AcRuleWorkbench.exe"),
        (Join-Path $Root "AcRuleWorkbench\bin\$Configuration\net48\win-x86\AcRuleWorkbench.exe"),
        (Join-Path $Root "AcRuleWorkbench\bin\$Configuration\net48\AcRuleWorkbench.exe"),
        (Join-Path $Root "bin\$Platform\$Configuration\net48\AcRuleWorkbench.exe")
    )

    foreach ($candidate in $preferred) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            return (Get-Item -LiteralPath $candidate)
        }
    }

    $excludedPathPattern = "\\(\.git|\.vs|lib|rri_bin|packages|node_modules|artifacts)(\\|$)"
    $all = @(Get-ChildItem -LiteralPath $Root -File -Filter "AcRuleWorkbench.exe" -Recurse -Force -ErrorAction SilentlyContinue |
        Where-Object {
            $_.FullName -notmatch $excludedPathPattern -and
            $_.FullName -match "\\bin\\" -and
            $_.FullName -match "\\$([regex]::Escape($Configuration))(\\|$)"
        } |
        Sort-Object LastWriteTimeUtc -Descending)

    if ($all.Count -gt 0) {
        return $all[0]
    }

    return $null
}

function Get-WbManagedLibDirectory {
    param([Parameter(Mandatory = $true)][string]$Root)
    return (Join-Path $Root "lib")
}

function Get-WbNativeLibDirectory {
    param([Parameter(Mandatory = $true)][string]$Root)
    return (Join-Path $Root "rri_bin")
}

function Get-WbScriptDirectory {
    param([Parameter(Mandatory = $true)][string]$Root)
    return (Join-Path $Root "scripts")
}
