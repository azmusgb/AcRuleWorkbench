[CmdletBinding()]
param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug",

    [string]$Platform = "x86",

    [switch]$Clean,
    [switch]$SkipBuild,
    [switch]$CopyNativeToOutput,

    [string]$FwdPath
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

function Write-Section {
    param([Parameter(Mandatory = $true)][string]$Text)
    Write-Host ""
    Write-Host "== $Text ==" -ForegroundColor Cyan
}

function Write-Ok {
    param([Parameter(Mandatory = $true)][string]$Text)
    Write-Host "[OK] $Text" -ForegroundColor Green
}

function Write-Fail {
    param([Parameter(Mandatory = $true)][string]$Text)
    Write-Host "[FAIL] $Text" -ForegroundColor Red
}

function Resolve-RepoRoot {
    $scriptPath = $PSCommandPath
    if ([string]::IsNullOrWhiteSpace($scriptPath)) {
        $scriptPath = $MyInvocation.MyCommand.Path
    }

    $scriptDir = Split-Path -Parent $scriptPath
    return (Resolve-Path -LiteralPath (Join-Path $scriptDir "..")).Path
}

function Get-PreferredSolution {
    param([Parameter(Mandatory = $true)][string]$Root)

    $candidates = @()
    $candidates += Get-ChildItem -LiteralPath $Root -File -Filter "*.slnx" -ErrorAction SilentlyContinue
    $candidates += Get-ChildItem -LiteralPath $Root -File -Filter "*.sln" -ErrorAction SilentlyContinue

    if ($candidates.Count -eq 0) {
        throw "No .slnx or .sln file found in $Root"
    }

    $preferred = $candidates | Where-Object { $_.BaseName -eq "AcRuleWorkbench" } | Select-Object -First 1
    if ($null -ne $preferred) {
        return $preferred
    }

    return ($candidates | Sort-Object Name | Select-Object -First 1)
}

function Test-ExpectedFiles {
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [Parameter(Mandatory = $true)][string[]]$ExpectedNames,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if (-not (Test-Path -LiteralPath $Directory)) {
        Write-Fail "$Label directory missing: $Directory"
        return $false
    }

    $actualNames = @(Get-ChildItem -LiteralPath $Directory -File -Filter "*.dll" -ErrorAction SilentlyContinue | ForEach-Object { $_.Name })
    $missing = @($ExpectedNames | Where-Object { $actualNames -notcontains $_ })

    if ($missing.Count -gt 0) {
        Write-Fail "$Label missing: $($missing -join ', ')"
        return $false
    }

    Write-Ok "$Label present in $Directory"
    return $true
}

function Find-MSBuild {
    $command = Get-Command msbuild.exe -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        return $command.Source
    }

    $vsWhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path -LiteralPath $vsWhere) {
        $result = & $vsWhere -latest -requires Microsoft.Component.MSBuild -find "MSBuild\**\Bin\MSBuild.exe" 2>$null |
            Select-Object -First 1

        if (-not [string]::IsNullOrWhiteSpace($result)) {
            return $result
        }
    }

    return $null
}

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [string]$WorkingDirectory
    )

    Write-Host ""
    Write-Host "> $FilePath $($Arguments -join ' ')" -ForegroundColor DarkGray

    if (-not [string]::IsNullOrWhiteSpace($WorkingDirectory)) {
        Push-Location $WorkingDirectory
    }

    try {
        & $FilePath @Arguments
        $exitCode = $LASTEXITCODE

        if ($exitCode -ne 0) {
            throw "Command failed with exit code $exitCode"
        }
    }
    finally {
        if (-not [string]::IsNullOrWhiteSpace($WorkingDirectory)) {
            Pop-Location
        }
    }
}

function Get-OutputDirectories {
    param(
        [Parameter(Mandatory = $true)][string]$Root,
        [Parameter(Mandatory = $true)][string]$Configuration
    )

    $excludedPathPattern = "\\(\.git|\.vs|lib|rri_bin|packages|node_modules)(\\|$)"

    $dirs = Get-ChildItem -LiteralPath $Root -Directory -Recurse -Force -ErrorAction SilentlyContinue |
        Where-Object {
            $_.FullName -notmatch $excludedPathPattern -and
            $_.FullName -match "\\bin\\" -and
            $_.FullName -match "\\$([regex]::Escape($Configuration))(\\|$)" -and
            @(Get-ChildItem -LiteralPath $_.FullName -File -Filter "*.exe" -ErrorAction SilentlyContinue).Count -gt 0
        }

    return @($dirs | Sort-Object FullName -Unique)
}

function Copy-DllsToOutputs {
    param(
        [Parameter(Mandatory = $true)][string]$SourceDir,
        [Parameter(Mandatory = $true)][System.IO.DirectoryInfo[]]$OutputDirs,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if (-not (Test-Path -LiteralPath $SourceDir)) {
        throw "$Label source directory missing: $SourceDir"
    }

    $dlls = @(Get-ChildItem -LiteralPath $SourceDir -File -Filter "*.dll" -ErrorAction Stop)
    if ($dlls.Count -eq 0) {
        throw "$Label source directory contains no DLLs: $SourceDir"
    }

    foreach ($outputDir in $OutputDirs) {
        foreach ($dll in $dlls) {
            $destination = Join-Path $outputDir.FullName $dll.Name

            if (Test-Path -LiteralPath $destination) {
                $sourceHash = (Get-FileHash -LiteralPath $dll.FullName -Algorithm SHA256).Hash
                $destinationHash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash

                if ($sourceHash -eq $destinationHash) {
                    continue
                }
            }

            Copy-Item -LiteralPath $dll.FullName -Destination $outputDir.FullName -Force -ErrorAction Stop
        }

        Write-Ok "Copied $Label DLLs to $($outputDir.FullName)"
    }
}

function Write-RuntimePathHelper {
    param(
        [Parameter(Mandatory = $true)][string]$NativeDir,
        [Parameter(Mandatory = $true)][string]$OutputPath
    )

    $escapedNativeDir = $NativeDir.Replace("'", "''")

    $content = @"
# Auto-generated by scripts\build-and-doctor.ps1.
# Adds the local FormWorks native runtime folder to the current PowerShell process PATH.

`$NativeLibDir = '$escapedNativeDir'

if (-not (Test-Path -LiteralPath `$NativeLibDir)) {
    throw "Native FormWorks runtime folder not found: `$NativeLibDir"
}

`$currentPath = [Environment]::GetEnvironmentVariable('PATH', 'Process')
`$pathParts = @(`$currentPath -split ';' | Where-Object { -not [string]::IsNullOrWhiteSpace(`$_) })

if (`$pathParts -notcontains `$NativeLibDir) {
    [Environment]::SetEnvironmentVariable('PATH', "`$NativeLibDir;`$currentPath", 'Process')
    `$env:PATH = [Environment]::GetEnvironmentVariable('PATH', 'Process')
}

`$env:FORMWORKS_NATIVE_BIN = `$NativeLibDir
"@

    Set-Content -LiteralPath $OutputPath -Value $content -Encoding UTF8 -Force
    Unblock-File -LiteralPath $OutputPath -ErrorAction SilentlyContinue
    Write-Ok "Generated PATH helper: $OutputPath"
}

function Resolve-FwdFilePath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $resolved = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
    if (-not (Test-Path -LiteralPath $resolved)) {
        throw "FWD file not found: $resolved"
    }

    $item = Get-Item -LiteralPath $resolved -ErrorAction Stop
    if ($item.PSIsContainer) {
        throw "FwdPath must be a .cfd file, not a directory: $resolved"
    }

    if ($item.Extension -ne ".cfd") {
        throw "FwdPath must point to a .cfd file: $resolved"
    }

    return $item.FullName
}

$repoRoot = Resolve-RepoRoot
$scriptDir = Join-Path $repoRoot "scripts"
$managedLibDir = Join-Path $repoRoot "lib"
$nativeLibDir = Join-Path $repoRoot "rri_bin"
$runtimeHelperPath = Join-Path $scriptDir "runtime-path.generated.ps1"

$expectedManagedDlls = @(
    "rribase_net.dll",
    "rrifwd_net.dll",
    "rridc_net.dll",
    "rriwf2_net.dll",
    "FormWorks.Core.dll",
    "FormWorks.Versioning.dll"
)

$expectedNativeDlls = @(
    "rribase.dll",
    "rrifwd.dll",
    "rridc.dll",
    "rriwf2.dll"
)

Write-Section "Runtime layout"
Write-Host "Repo root  : $repoRoot"
Write-Host "Managed lib: $managedLibDir"
Write-Host "Native bin : $nativeLibDir"
Write-Host "Config     : $Configuration"
Write-Host "Platform   : $Platform"

$managedOk = Test-ExpectedFiles -Directory $managedLibDir -ExpectedNames $expectedManagedDlls -Label "Managed DLLs"
$nativeOk = Test-ExpectedFiles -Directory $nativeLibDir -ExpectedNames $expectedNativeDlls -Label "Native DLLs"

if (-not $managedOk -or -not $nativeOk) {
    throw "Runtime DLL layout is incomplete. Expected managed DLLs in .\lib and native DLLs in .\rri_bin."
}

Write-RuntimePathHelper -NativeDir $nativeLibDir -OutputPath $runtimeHelperPath
. $runtimeHelperPath

if (-not [string]::IsNullOrWhiteSpace($FwdPath)) {
    $resolvedFwdPath = Resolve-FwdFilePath -Path $FwdPath

    Write-Ok "FWD file present: $resolvedFwdPath"
}

if ($Clean) {
    Write-Section "Clean before build"
    $cleanScript = Join-Path $scriptDir "clean-workspace.ps1"

    if (-not (Test-Path -LiteralPath $cleanScript)) {
        throw "Clean script not found: $cleanScript"
    }

    Invoke-NativeCommand -FilePath "powershell.exe" -WorkingDirectory $repoRoot -Arguments @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", $cleanScript
    )
}

$solution = Get-PreferredSolution -Root $repoRoot

if (-not $SkipBuild) {
    Write-Section "Build"

    $dotnet = Get-Command dotnet.exe -ErrorAction SilentlyContinue
    $buildSucceeded = $false

    if ($null -ne $dotnet) {
        try {
            Invoke-NativeCommand -FilePath $dotnet.Source -WorkingDirectory $repoRoot -Arguments @(
                "build",
                $solution.FullName,
                "-c", $Configuration,
                "-p:Platform=$Platform",
                "-p:PlatformTarget=$Platform",
                "-v:minimal"
            )

            $buildSucceeded = $true
        }
        catch {
            Write-Warning "dotnet build failed: $($_.Exception.Message)"
        }
    }

    if (-not $buildSucceeded) {
        $msbuild = Find-MSBuild
        if ([string]::IsNullOrWhiteSpace($msbuild)) {
            throw "Build failed and MSBuild.exe was not found."
        }

        Invoke-NativeCommand -FilePath $msbuild -WorkingDirectory $repoRoot -Arguments @(
            $solution.FullName,
            "/m",
            "/p:Configuration=$Configuration",
            "/p:Platform=$Platform",
            "/p:PlatformTarget=$Platform",
            "/v:minimal"
        )
    }
}
else {
    Write-Section "Build skipped"
}

Write-Section "Output doctor"

$outputDirs = @(Get-OutputDirectories -Root $repoRoot -Configuration $Configuration)

if ($outputDirs.Count -eq 0) {
    throw "No executable output directory found under bin for configuration '$Configuration'. Build may have failed or output path differs."
}

foreach ($dir in $outputDirs) {
    Write-Host "Output: $($dir.FullName)"
}

Copy-DllsToOutputs -SourceDir $managedLibDir -OutputDirs $outputDirs -Label "managed"

if ($CopyNativeToOutput) {
    Copy-DllsToOutputs -SourceDir $nativeLibDir -OutputDirs $outputDirs -Label "native"
}
else {
    Write-Host "Native DLLs are not copied to output. They will be loaded from PATH via rri_bin."
}

foreach ($dir in $outputDirs) {
    $managedOutputOk = Test-ExpectedFiles -Directory $dir.FullName -ExpectedNames $expectedManagedDlls -Label "Output managed DLLs"
    if (-not $managedOutputOk) {
        throw "Managed DLLs were not copied correctly to $($dir.FullName)"
    }
}

Write-Section "Doctor summary"
Write-Ok "Managed DLL source layout is valid."
Write-Ok "Native DLL source layout is valid."
Write-Ok "runtime-path.generated.ps1 is valid."
Write-Ok "Build/output doctor completed."

Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host ".\scripts\start-workbench.ps1 -FwdPath C:\dev\AcRuleWorkbench\fwd.cfd -Port 8787 -KillExisting"
