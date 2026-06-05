<#!
.SYNOPSIS
  Validates AcRuleWorkbench package boundaries without confusing the local working tree with a source-clean package.

.DESCRIPTION
  Modes:
    WorkingTree   - Use against C:\dev\AcRuleWorkbench. Local runtime assets, generated sidecars,
                    docs, native DLLs, bin/, and obj/ are reported as package-excluded inventory,
                    but the script exits successfully.

    SourcePackage - Use against a source-clean staging folder or extracted source-clean zip.
                    Package-excluded inventory is treated as a validation failure.

  Compatible with Windows PowerShell 5.1.
  Avoids [System.IO.Path]::GetRelativePath and avoids String.TrimStart(char[]) overload pitfalls.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,

    [Parameter(Mandatory = $false)]
    [ValidateSet('WorkingTree', 'SourcePackage')]
    [string]$Mode = 'WorkingTree',

    [Parameter(Mandatory = $false)]
    [switch]$AllowBuildOutput,

    [Parameter(Mandatory = $false)]
    [switch]$Quiet
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

function Get-FullPathSafe {
    param([Parameter(Mandatory = $true)][string]$Path)

    $resolved = Resolve-Path -LiteralPath $Path
    return [System.IO.Path]::GetFullPath($resolved.Path)
}

function Get-RelativePathCompat {
    param(
        [Parameter(Mandatory = $true)][string]$BasePath,
        [Parameter(Mandatory = $true)][string]$TargetPath
    )

    $baseFull = [System.IO.Path]::GetFullPath($BasePath)
    $targetFull = [System.IO.Path]::GetFullPath($TargetPath)

    if (-not $baseFull.EndsWith([System.IO.Path]::DirectorySeparatorChar.ToString())) {
        $baseFull += [System.IO.Path]::DirectorySeparatorChar
    }

    $baseUri = New-Object System.Uri($baseFull)
    $targetUri = New-Object System.Uri($targetFull)
    $relativeUri = $baseUri.MakeRelativeUri($targetUri)
    $relativePath = [System.Uri]::UnescapeDataString($relativeUri.ToString())

    return $relativePath.Replace('/', '\')
}

function Normalize-RelativePath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $normalized = $Path.Replace('/', '\')

    while ($normalized.StartsWith('.\')) {
        $normalized = $normalized.Substring(2)
    }

    while ($normalized.StartsWith('\')) {
        $normalized = $normalized.Substring(1)
    }

    return $normalized
}

function Test-IsUnderPath {
    param(
        [Parameter(Mandatory = $true)][string]$RelativePath,
        [Parameter(Mandatory = $true)][string]$DirectoryPath
    )

    $normalized = Normalize-RelativePath -Path $RelativePath
    $directory = Normalize-RelativePath -Path $DirectoryPath

    if ([string]::IsNullOrWhiteSpace($directory)) {
        return $false
    }

    if ([string]::Equals($normalized, $directory, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $true
    }

    if ($normalized.Length -gt $directory.Length -and
        $normalized.StartsWith($directory + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        return $true
    }

    if ($normalized.IndexOf('\' + $directory + '\', [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
        return $true
    }

    return $false
}

function New-Finding {
    param(
        [Parameter(Mandatory = $true)][string]$Type,
        [Parameter(Mandatory = $true)][string]$Rule,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Category
    )

    return [pscustomobject]@{
        Type = $Type
        Category = $Category
        Rule = $Rule
        Path = $Path
    }
}

$rootPath = Get-FullPathSafe -Path $Root
$findings = @()

$buildDirectories = @('bin', 'obj', 'TestResults')
$runtimeDirectories = @('lib', 'rri_bin')
$privateDirectories = @('attached_assets')
$dependencyDirectories = @('packages')
$repoDirectories = @('.git', '.vs')

$generatedFileNames = @(
    'ac-rule-viewer.fwd.json',
    'ac-rule-viewer.rules.json',
    'ac-rule-viewer.rel.json',
    'ac-rule-viewer.tree.json',
    'ac-rule-viewer.flow.json',
    'runtime-path.generated.ps1'
)

$privateFileNames = @('fwd.cfd')
$buildExtensions = @('.dll', '.pdb', '.exe')
$localExtensions = @('.log', '.trace', '.dmp', '.etl', '.user', '.suo')
$archiveExtensions = @('.zip', '.7z', '.rar')

Get-ChildItem -LiteralPath $rootPath -Recurse -Force -File | ForEach-Object {
    $relativePath = Get-RelativePathCompat -BasePath $rootPath -TargetPath $_.FullName
    $relativeUnix = $relativePath.Replace('\', '/')
    $fileName = $_.Name
    $extension = $_.Extension.ToLowerInvariant()

    foreach ($directory in $repoDirectories) {
        if (Test-IsUnderPath -RelativePath $relativePath -DirectoryPath $directory) {
            $script:findings += New-Finding -Type 'RepoMetadata' -Rule $directory -Path $relativePath -Category 'Repository metadata'
            return
        }
    }

    foreach ($directory in $buildDirectories) {
        if (Test-IsUnderPath -RelativePath $relativePath -DirectoryPath $directory) {
            $script:findings += New-Finding -Type 'BuildOutput' -Rule $directory -Path $relativePath -Category 'Build output'
            return
        }
    }

    foreach ($directory in $runtimeDirectories) {
        if (Test-IsUnderPath -RelativePath $relativePath -DirectoryPath $directory) {
            $script:findings += New-Finding -Type 'RuntimeAsset' -Rule $directory -Path $relativePath -Category 'Native/runtime asset'
            return
        }
    }

    foreach ($directory in $privateDirectories) {
        if (Test-IsUnderPath -RelativePath $relativePath -DirectoryPath $directory) {
            $script:findings += New-Finding -Type 'PrivateAttachment' -Rule $directory -Path $relativePath -Category 'Private/local attachment'
            return
        }
    }

    foreach ($directory in $dependencyDirectories) {
        if (Test-IsUnderPath -RelativePath $relativePath -DirectoryPath $directory) {
            $script:findings += New-Finding -Type 'DependencyCache' -Rule $directory -Path $relativePath -Category 'Dependency cache'
            return
        }
    }

    if ($generatedFileNames -contains $fileName) {
        $script:findings += New-Finding -Type 'GeneratedEvidence' -Rule $fileName -Path $relativePath -Category 'Generated evidence'
        return
    }

    if ($privateFileNames -contains $fileName) {
        $script:findings += New-Finding -Type 'PrivateFwd' -Rule $fileName -Path $relativePath -Category 'Private FWD/config'
        return
    }

    if ($buildExtensions -contains $extension) {
        $script:findings += New-Finding -Type 'BuildExtension' -Rule $extension -Path $relativePath -Category 'Build/binary extension'
        return
    }

    if ($localExtensions -contains $extension) {
        $script:findings += New-Finding -Type 'LocalArtifact' -Rule $extension -Path $relativePath -Category 'Local artifact'
        return
    }

    if ($archiveExtensions -contains $extension) {
        $script:findings += New-Finding -Type 'ArchiveArtifact' -Rule $extension -Path $relativePath -Category 'Archive/package artifact'
        return
    }

    if ($relativeUnix -match '^docs/.*\.(pdf|extracted\.txt)$') {
        $script:findings += New-Finding -Type 'BlockedDocsReference' -Rule 'docs/.*\.(pdf|extracted\.txt)' -Path $relativePath -Category 'Confidential/source reference'
        return
    }

    if ($relativeUnix -match '(^|/)ac-rule-viewer-live\.(html|css|js)$') {
        $script:findings += New-Finding -Type 'GeneratedLiveViewer' -Rule 'ac-rule-viewer-live.(html|css|js)' -Path $relativePath -Category 'Generated viewer'
        return
    }

    if ($relativeUnix -match '(^|/).*\.local\.json$') {
        $script:findings += New-Finding -Type 'LocalConfig' -Rule '*.local.json' -Path $relativePath -Category 'Local config'
        return
    }
}

$violations = @($findings)

if ($Mode -eq 'SourcePackage' -and $AllowBuildOutput) {
    $violations = @($violations | Where-Object {
        $_.Type -notin @('BuildOutput', 'BuildExtension')
    })
}

if (-not $Quiet) {
    Write-Host ''
    Write-Host "Package boundary validation mode: $Mode" -ForegroundColor Cyan
    Write-Host "Root: $rootPath"
    Write-Host ''
}

if ($Mode -eq 'WorkingTree') {
    if (-not $Quiet) {
        if ($findings.Count -eq 0) {
            Write-Host 'Working tree package-exclusion inventory: none found.' -ForegroundColor Green
        }
        else {
            Write-Host 'Working tree package-exclusion inventory found.' -ForegroundColor Yellow
            Write-Host 'This is acceptable for local development. These items must be excluded from source-clean packages.' -ForegroundColor Yellow
            Write-Host ''

            $findings |
                Group-Object Category |
                Sort-Object Name |
                Select-Object @{ Name = 'Category'; Expression = { $_.Name } }, Count |
                Format-Table -AutoSize

            Write-Host ''
            Write-Host 'Sample excluded paths:' -ForegroundColor DarkGray
            $findings |
                Sort-Object Category, Path |
                Select-Object -First 25 Type, Rule, Path |
                Format-Table -AutoSize

            if ($findings.Count -gt 25) {
                Write-Host "... $($findings.Count - 25) additional excluded paths omitted from display." -ForegroundColor DarkGray
            }
        }

        Write-Host ''
        Write-Host 'Working tree validation passed.' -ForegroundColor Green
        Write-Host 'Run SourcePackage mode against a staged source-clean folder before sharing.' -ForegroundColor Green
    }

    exit 0
}

if ($violations.Count -gt 0) {
    if (-not $Quiet) {
        Write-Host 'Source package boundary validation failed.' -ForegroundColor Red
        Write-Host ''

        $violations |
            Sort-Object Category, Rule, Path |
            Format-Table -AutoSize

        Write-Host ''
        Write-Host "Violations found: $($violations.Count)" -ForegroundColor Red
        Write-Host 'This folder is not source-clean. Use scripts\package-source-clean.ps1 and validate the staging/extracted package folder.' -ForegroundColor Red
    }

    exit 1
}

if (-not $Quiet) {
    Write-Host 'Source package boundary validation passed.' -ForegroundColor Green
}

exit 0
