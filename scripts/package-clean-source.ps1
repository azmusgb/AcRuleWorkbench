<#
.SYNOPSIS
  Creates a clean ZIP package of the repository, excluding files matched by .gitignore.

.DESCRIPTION
  Compatible with Windows PowerShell 5.1.

  Includes:
  - Git-tracked files
  - Untracked files that are not ignored by .gitignore

  Excludes:
  - Anything matched by .gitignore, even if currently tracked
  - .git
  - output ZIP itself
  - generated/build/runtime junk if listed in .gitignore

.EXAMPLE
  .\scripts\package-clean-source.ps1

.EXAMPLE
  .\scripts\package-clean-source.ps1 -DryRun

.EXAMPLE
  .\scripts\package-clean-source.ps1 -TrackedOnly
#>

[CmdletBinding()]
param(
    [string]$RepoRoot,
    [string]$OutputPath,
    [switch]$TrackedOnly,
    [switch]$IncludeGitIgnored,
    [switch]$DryRun
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[...] $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Resolve-FullPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
    return $resolved.ProviderPath
}

function Convert-ToRepoRelativePath {
    param(
        [Parameter(Mandatory = $true)][string]$FullPath,
        [Parameter(Mandatory = $true)][string]$RootPath
    )

    $root = [System.IO.Path]::GetFullPath($RootPath).TrimEnd('\', '/')
    $full = [System.IO.Path]::GetFullPath($FullPath)

    if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is not under repo root: $full"
    }

    $relative = $full.Substring($root.Length).TrimStart('\', '/')
    return ($relative -replace '\\', '/')
}

function Invoke-GitLines {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [string[]]$StandardInputLines = @(),
        [switch]$AllowCheckIgnoreNoMatch
    )

    Push-Location $WorkingDirectory
    try {
        if ($StandardInputLines.Count -gt 0) {
            $output = $StandardInputLines | & git @Arguments 2>&1
        }
        else {
            $output = & git @Arguments 2>&1
        }

        $exitCode = $LASTEXITCODE

        if ($exitCode -ne 0) {
            if (-not ($AllowCheckIgnoreNoMatch -and $exitCode -eq 1)) {
                $message = ($output | ForEach-Object { $_.ToString() }) -join "`n"
                throw "git $($Arguments -join ' ') failed with exit code $exitCode. $message"
            }
        }

        if ($null -eq $output) {
            return @()
        }

        return @(
            $output |
                ForEach-Object { $_.ToString() } |
                Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
        )
    }
    finally {
        Pop-Location
    }
}

function Get-CleanPackageFileList {
    param(
        [Parameter(Mandatory = $true)][string]$RootPath,
        [switch]$OnlyTracked,
        [switch]$AllowGitIgnored
    )

    if ($OnlyTracked) {
        Write-Step "Collecting tracked Git files"
        $candidatePaths = Invoke-GitLines -WorkingDirectory $RootPath -Arguments @(
            "ls-files",
            "--cached"
        )
    }
    else {
        Write-Step "Collecting tracked and untracked non-ignored Git-visible files"
        $candidatePaths = Invoke-GitLines -WorkingDirectory $RootPath -Arguments @(
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard"
        )
    }

    $candidatePaths = @(
        $candidatePaths |
            ForEach-Object { ($_ -replace '\\', '/').Trim() } |
            Where-Object { $_ -ne "" } |
            Where-Object { $_ -notmatch '(^|/)\.git(/|$)' } |
            Sort-Object -Unique
    )

    if ($candidatePaths.Count -eq 0) {
        throw "No candidate files found. Confirm this is a Git repository."
    }

    if ($AllowGitIgnored) {
        Write-Warn "IncludeGitIgnored enabled. Tracked files matched by .gitignore may be packaged."
        return $candidatePaths
    }

    Write-Step "Removing files matched by .gitignore, including tracked files"

    $ignored = Invoke-GitLines -WorkingDirectory $RootPath -Arguments @(
        "check-ignore",
        "--stdin",
        "--no-index"
    ) -StandardInputLines $candidatePaths -AllowCheckIgnoreNoMatch

    $ignoredSet = New-Object "System.Collections.Generic.HashSet[string]" ([System.StringComparer]::OrdinalIgnoreCase)

    foreach ($path in $ignored) {
        [void]$ignoredSet.Add(($path -replace '\\', '/').Trim())
    }

    $cleanPaths = @(
        $candidatePaths |
            Where-Object { -not $ignoredSet.Contains($_) } |
            Sort-Object -Unique
    )

    return $cleanPaths
}

function Add-TextEntryToZip {
    param(
        [Parameter(Mandatory = $true)][System.IO.Compression.ZipArchive]$Zip,
        [Parameter(Mandatory = $true)][string]$EntryName,
        [Parameter(Mandatory = $true)][string]$Content
    )

    $entry = $Zip.CreateEntry($EntryName, [System.IO.Compression.CompressionLevel]::Optimal)
    $stream = $entry.Open()

    try {
        $encoding = New-Object System.Text.UTF8Encoding($false)
        $writer = New-Object System.IO.StreamWriter($stream, $encoding)

        try {
            $writer.Write($Content)
        }
        finally {
            $writer.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

function New-CleanSourceZip {
    param(
        [Parameter(Mandatory = $true)][string]$RootPath,
        [Parameter(Mandatory = $true)][string]$ZipPath,
        [Parameter(Mandatory = $true)][string[]]$RelativePaths,
        [switch]$PreviewOnly
    )

    $fullZipPath = [System.IO.Path]::GetFullPath($ZipPath)
    $zipDirectory = [System.IO.Path]::GetDirectoryName($fullZipPath)

    if ([string]::IsNullOrWhiteSpace($zipDirectory)) {
        throw "Invalid output path: $ZipPath"
    }

    if (-not (Test-Path -LiteralPath $zipDirectory)) {
        [void][System.IO.Directory]::CreateDirectory($zipDirectory)
    }

    $rootFull = [System.IO.Path]::GetFullPath($RootPath).TrimEnd('\', '/')

    $zipRelative = $null
    if ($fullZipPath.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        $zipRelative = Convert-ToRepoRelativePath -FullPath $fullZipPath -RootPath $rootFull
    }

    $finalPaths = @(
        $RelativePaths |
            Where-Object { $_ -ne $zipRelative } |
            Sort-Object -Unique
    )

    $totalBytes = [int64]0
    $missing = New-Object "System.Collections.Generic.List[string]"

    foreach ($relativePath in $finalPaths) {
        $localPath = $relativePath -replace '/', [System.IO.Path]::DirectorySeparatorChar
        $fullPath = Join-Path $rootFull $localPath

        if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
            $missing.Add($relativePath)
            continue
        }

        $item = Get-Item -LiteralPath $fullPath
        $totalBytes += $item.Length
    }

    if ($missing.Count -gt 0) {
        Write-Warn "$($missing.Count) candidate file(s) no longer exist and will be skipped."
    }

    $displaySizeMb = [Math]::Round($totalBytes / 1MB, 2)

    Write-Host ""
    Write-Host "Package preview"
    Write-Host "---------------"
    Write-Host "Repo root : $rootFull"
    Write-Host "Output   : $fullZipPath"
    Write-Host "Files    : $($finalPaths.Count)"
    Write-Host "Size     : $displaySizeMb MB before compression"
    Write-Host ""

    if ($PreviewOnly) {
        $previewPath = Join-Path $zipDirectory "clean-source-preview.txt"
        $finalPaths | Set-Content -LiteralPath $previewPath -Encoding UTF8
        Write-Ok "Dry run complete. File list written to: $previewPath"
        return
    }

    if (Test-Path -LiteralPath $fullZipPath) {
        Remove-Item -LiteralPath $fullZipPath -Force
    }

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    Write-Step "Creating ZIP"

    $fileStream = [System.IO.File]::Open(
        $fullZipPath,
        [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::ReadWrite,
        [System.IO.FileShare]::None
    )

    try {
        $zip = New-Object System.IO.Compression.ZipArchive(
            $fileStream,
            [System.IO.Compression.ZipArchiveMode]::Create,
            $false
        )

        try {
            $added = 0

            foreach ($relativePath in $finalPaths) {
                $localPath = $relativePath -replace '/', [System.IO.Path]::DirectorySeparatorChar
                $fullPath = Join-Path $rootFull $localPath

                if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
                    continue
                }

                [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                    $zip,
                    $fullPath,
                    $relativePath,
                    [System.IO.Compression.CompressionLevel]::Optimal
                ) | Out-Null

                $added++
            }

            try {
                $gitBranch = Invoke-GitLines -WorkingDirectory $rootFull -Arguments @(
                    "rev-parse",
                    "--abbrev-ref",
                    "HEAD"
                ) | Select-Object -First 1
            }
            catch {
                $gitBranch = "(unknown)"
            }

            try {
                $gitCommit = Invoke-GitLines -WorkingDirectory $rootFull -Arguments @(
                    "rev-parse",
                    "HEAD"
                ) | Select-Object -First 1
            }
            catch {
                $gitCommit = "(unknown)"
            }

            $manifest = @()
            $manifest += "AC Rule Workbench / FW Editor Viewer clean source package"
            $manifest += "Generated at UTC: $([DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ"))"
            $manifest += "Repo root        : $rootFull"
            $manifest += "Git branch       : $gitBranch"
            $manifest += "Git commit       : $gitCommit"
            $manifest += "File count       : $added"
            $manifest += ""
            $manifest += "Included files:"
            $manifest += $finalPaths

            Add-TextEntryToZip -Zip $zip -EntryName "PACKAGED_FILES.txt" -Content ($manifest -join "`n")

            Write-Ok "Added $added file(s)."
        }
        finally {
            $zip.Dispose()
        }
    }
    finally {
        $fileStream.Dispose()
    }

    $zipInfo = Get-Item -LiteralPath $fullZipPath
    $zipSizeMb = [Math]::Round($zipInfo.Length / 1MB, 2)

    Write-Ok "Created clean source ZIP: $fullZipPath"
    Write-Ok "ZIP size: $zipSizeMb MB"
}

try {
    if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
        if ($PSScriptRoot) {
            $scriptDirectory = $PSScriptRoot
        }
        else {
            $scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
        }

        $RepoRoot = Resolve-FullPath (Join-Path $scriptDirectory "..")
    }
    else {
        $RepoRoot = Resolve-FullPath $RepoRoot
    }

    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git") -PathType Container)) {
        throw "RepoRoot does not look like a Git repository: $RepoRoot"
    }

    if ([string]::IsNullOrWhiteSpace($OutputPath)) {
        $repoName = Split-Path -Leaf $RepoRoot
        $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $parent = Split-Path -Parent $RepoRoot
        $OutputPath = Join-Path $parent "$repoName-clean-source-$stamp.zip"
    }

    $cleanFiles = Get-CleanPackageFileList `
        -RootPath $RepoRoot `
        -OnlyTracked:$TrackedOnly `
        -AllowGitIgnored:$IncludeGitIgnored

    New-CleanSourceZip `
        -RootPath $RepoRoot `
        -ZipPath $OutputPath `
        -RelativePaths $cleanFiles `
        -PreviewOnly:$DryRun
}
catch {
    Write-Fail $_.Exception.Message
    exit 1
}
