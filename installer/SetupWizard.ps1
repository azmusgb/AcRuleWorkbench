#Requires -Version 5.1
<#!
.SYNOPSIS
Graphical installer/configuration wizard for FW Editor Viewer on Windows Server.

.DESCRIPTION
This wizard installs AcRuleWorkbench/FW Editor Viewer into a selected folder,
builds the x86 Release executable if needed, generates the static viewer,
registers the always-on backend scheduled task, optionally configures IIS as the
front door, and enables browser-based refresh/update from the current fwd.cfd.

Run elevated. Designed for Windows Server 2019+ with PowerShell 5.1.
#>
[CmdletBinding()]
param(
    [string]$PackageRoot = $null,
    [ValidateSet('Auto','LocalLaptop','WindowsServerIis')]
    [string]$Preset = 'Auto',
    [switch]$NoCopy
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# v72: Resolve package root after parameter binding. Some PowerShell hosts can
# evaluate param defaults before $PSScriptRoot is populated, which caused:
# "Join-Path : Cannot bind argument to parameter 'Path' because it is an empty string."
function Resolve-InstallerPackageRoot {
    param([string]$ExplicitRoot)

    if (-not [string]::IsNullOrWhiteSpace($ExplicitRoot)) {
        return (Resolve-Path -LiteralPath $ExplicitRoot).Path
    }

    $scriptPath = $null
    if (-not [string]::IsNullOrWhiteSpace($PSCommandPath)) {
        $scriptPath = $PSCommandPath
    } elseif ($MyInvocation -and $MyInvocation.MyCommand -and -not [string]::IsNullOrWhiteSpace($MyInvocation.MyCommand.Path)) {
        $scriptPath = $MyInvocation.MyCommand.Path
    }

    if (-not [string]::IsNullOrWhiteSpace($scriptPath)) {
        $installerRoot = Split-Path -Parent $scriptPath
        if (-not [string]::IsNullOrWhiteSpace($installerRoot)) {
            $candidate = Split-Path -Parent $installerRoot
            if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path -LiteralPath $candidate)) {
                return (Resolve-Path -LiteralPath $candidate).Path
            }
        }
    }

    if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
        $candidate = Split-Path -Parent $PSScriptRoot
        if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path -LiteralPath $candidate)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    $cwd = (Get-Location).Path
    if (Test-Path -LiteralPath (Join-Path $cwd 'installer\SetupWizard.ps1')) {
        return $cwd
    }
    if ((Split-Path -Leaf $cwd) -ieq 'installer') {
        $candidate = Split-Path -Parent $cwd
        if (Test-Path -LiteralPath $candidate) { return (Resolve-Path -LiteralPath $candidate).Path }
    }

    throw 'Unable to resolve package root. Re-run from the extracted AcRuleWorkbench package folder, or pass -PackageRoot "C:\path\to\AcRuleWorkbench".'
}

$PackageRoot = Resolve-InstallerPackageRoot -ExplicitRoot $PackageRoot

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

function Test-IsAdmin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Show-ErrorBox {
    param([string]$Message)
    [System.Windows.Forms.MessageBox]::Show($Message, 'FW Editor Viewer Installer', 'OK', 'Error') | Out-Null
}

function Show-InfoBox {
    param([string]$Message)
    [System.Windows.Forms.MessageBox]::Show($Message, 'FW Editor Viewer Installer', 'OK', 'Information') | Out-Null
}

function Add-Log {
    param([string]$Message)
    $stamp = Get-Date -Format 'HH:mm:ss'
    $script:LogBox.AppendText("[$stamp] $Message`r`n")
    $script:LogBox.SelectionStart = $script:LogBox.Text.Length
    $script:LogBox.ScrollToCaret()
    [System.Windows.Forms.Application]::DoEvents()
}

function New-Label {
    param([string]$Text, [int]$X, [int]$Y, [int]$W = 160, [int]$H = 22)
    $label = [System.Windows.Forms.Label]::new()
    $label.Text = $Text
    $label.Location = [System.Drawing.Point]::new($X, $Y)
    $label.Size = [System.Drawing.Size]::new($W, $H)
    $label.ForeColor = [System.Drawing.Color]::FromArgb(28, 36, 52)
    return $label
}

function New-TextBox {
    param([string]$Text, [int]$X, [int]$Y, [int]$W = 520, [bool]$Password = $false)
    $box = [System.Windows.Forms.TextBox]::new()
    $box.Text = $Text
    $box.Location = [System.Drawing.Point]::new($X, $Y)
    $box.Size = [System.Drawing.Size]::new($W, 24)
    $box.BorderStyle = 'FixedSingle'
    if ($Password) { $box.UseSystemPasswordChar = $true }
    return $box
}

function New-CheckBox {
    param([string]$Text, [int]$X, [int]$Y, [bool]$Checked = $false, [int]$W = 360)
    $box = [System.Windows.Forms.CheckBox]::new()
    $box.Text = $Text
    $box.Location = [System.Drawing.Point]::new($X, $Y)
    $box.Size = [System.Drawing.Size]::new($W, 24)
    $box.Checked = $Checked
    $box.ForeColor = [System.Drawing.Color]::FromArgb(28, 36, 52)
    return $box
}

function New-Button {
    param([string]$Text, [int]$X, [int]$Y, [int]$W = 110, [int]$H = 30)
    $btn = [System.Windows.Forms.Button]::new()
    $btn.Text = $Text
    $btn.Location = [System.Drawing.Point]::new($X, $Y)
    $btn.Size = [System.Drawing.Size]::new($W, $H)
    return $btn
}

function Resolve-MSBuild {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    if (Test-Path -LiteralPath $vswhere -PathType Leaf) {
        $found = & $vswhere -latest -products * -requires Microsoft.Component.MSBuild -find 'MSBuild\**\Bin\MSBuild.exe' 2>$null | Select-Object -First 1
        if ($found -and (Test-Path -LiteralPath $found -PathType Leaf)) { return $found }
    }

    $cmd = Get-Command msbuild.exe -ErrorAction SilentlyContinue
    if ($cmd -and (Test-Path -LiteralPath $cmd.Source -PathType Leaf)) { return $cmd.Source }

    $common = @(
        'C:\Program Files\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe',
        'C:\Program Files\Microsoft Visual Studio\2022\Community\MSBuild\Current\Bin\MSBuild.exe',
        'C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\MSBuild\Current\Bin\MSBuild.exe',
        'C:\Program Files (x86)\Microsoft Visual Studio\2019\Community\MSBuild\Current\Bin\MSBuild.exe'
    )
    foreach ($path in $common) {
        if (Test-Path -LiteralPath $path -PathType Leaf) { return $path }
    }

    return $null
}

function Invoke-LoggedProcess {
    param(
        [Parameter(Mandatory=$true)][string]$FilePath,
        [Parameter(Mandatory=$true)][string[]]$Arguments,
        [string]$WorkingDirectory = (Get-Location).Path,
        [string]$LogPrefix = 'process',
        [ValidateRange(1, 1440)][int]$TimeoutMinutes = 30,
        [ValidateRange(5, 300)][int]$StatusEverySeconds = 15
    )

    Add-Log "Running: $FilePath $($Arguments -join ' ')"
    $logRoot = Join-Path $env:ProgramData 'AcRuleWorkbench\install-logs'
    New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $outLog = Join-Path $logRoot "$LogPrefix-$stamp.out.log"
    $errLog = Join-Path $logRoot "$LogPrefix-$stamp.err.log"

    $p = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -PassThru -NoNewWindow -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    $started = Get-Date
    $lastStatus = $started

    while (-not $p.HasExited) {
        [System.Windows.Forms.Application]::DoEvents()
        Start-Sleep -Milliseconds 250

        $elapsed = (Get-Date) - $started
        if ($elapsed.TotalMinutes -ge $TimeoutMinutes) {
            try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch { }
            throw "$LogPrefix timed out after $TimeoutMinutes minute(s). Logs: $outLog $errLog"
        }

        if (((Get-Date) - $lastStatus).TotalSeconds -ge $StatusEverySeconds) {
            Add-Log "$LogPrefix still running... elapsed $([int]$elapsed.TotalSeconds)s. Logs: $outLog $errLog"
            $lastStatus = Get-Date
        }
    }

    $out = if (Test-Path -LiteralPath $outLog) { Get-Content -LiteralPath $outLog -Raw -ErrorAction SilentlyContinue } else { '' }
    $err = if (Test-Path -LiteralPath $errLog) { Get-Content -LiteralPath $errLog -Raw -ErrorAction SilentlyContinue } else { '' }
    if (-not [string]::IsNullOrWhiteSpace($out)) { Add-Log ($out.Trim()) }
    if (-not [string]::IsNullOrWhiteSpace($err)) { Add-Log ($err.Trim()) }
    if ($p.ExitCode -ne 0) {
        throw "$LogPrefix failed with exit code $($p.ExitCode). Logs: $outLog $errLog"
    }
}

function Copy-PackageToInstallRoot {
    param([string]$SourceRoot, [string]$InstallRoot)

    $sourceFull = [IO.Path]::GetFullPath($SourceRoot).TrimEnd('\')
    $targetFull = [IO.Path]::GetFullPath($InstallRoot).TrimEnd('\')
    if ($sourceFull -ieq $targetFull -or $NoCopy) {
        Add-Log "Using package in place: $sourceFull"
        return
    }

    if ($targetFull.StartsWith($sourceFull + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Install folder is inside the extracted package folder. That can cause recursive copy/hangs. Choose the package root itself or a separate folder. Source: $sourceFull Target: $targetFull"
    }

    if ($sourceFull.StartsWith($targetFull + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "The extracted package folder is inside the install folder. Rerun with -NoCopy or extract the package outside the install folder. Source: $sourceFull Target: $targetFull"
    }

    Add-Log "Copying package to $targetFull"
    New-Item -ItemType Directory -Path $targetFull -Force | Out-Null

    $items = Get-ChildItem -LiteralPath $sourceFull -Force
    foreach ($item in $items) {
        $dest = Join-Path $targetFull $item.Name
        if ($item.PSIsContainer) {
            Copy-Item -LiteralPath $item.FullName -Destination $dest -Recurse -Force
        }
        else {
            Copy-Item -LiteralPath $item.FullName -Destination $dest -Force
        }
    }
}

function New-ShortcutFile {
    param([string]$ShortcutPath, [string]$TargetUrl)
    $content = @"
[InternetShortcut]
URL=$TargetUrl
IconFile=C:\Windows\System32\shell32.dll
IconIndex=220
"@
    Set-Content -LiteralPath $ShortcutPath -Value $content -Encoding ASCII
}


function Get-SelectedDeploymentMode {
    if ($script:ModeServerRadio -and $script:ModeServerRadio.Checked) { return 'WindowsServerIis' }
    return 'LocalLaptop'
}

function Update-DeploymentUi {
    $mode = Get-SelectedDeploymentMode
    $serverMode = $mode -eq 'WindowsServerIis'

    if ($script:IisCheckBox) {
        $script:IisCheckBox.Enabled = $serverMode
        if (-not $serverMode) { $script:IisCheckBox.Checked = $false }
    }

    $iisEnabled = $serverMode -and $script:IisCheckBox -and $script:IisCheckBox.Checked
    foreach ($control in @($script:SiteNameBox, $script:SitePathBox, $script:SitePortBox, $script:HostHeaderBox, $script:FirewallCheckBox)) {
        if ($control) { $control.Enabled = $iisEnabled }
    }

    if ($script:ModeDescriptionLabel) {
        if ($serverMode) {
            $script:ModeDescriptionLabel.Text = 'Server/IIS mode installs under D:\rri\<app>, registers an always-on backend task, and exposes /viewer, /harness, and /api/* through IIS.'
        }
        else {
            $script:ModeDescriptionLabel.Text = 'Local laptop mode uses C:\dev\AcRuleWorkbench, skips IIS, runs the self-hosted workbench on 127.0.0.1, and still supports web Refresh from FWD.'
        }
    }
}

function Apply-DeploymentPreset {
    param([ValidateSet('LocalLaptop','WindowsServerIis')][string]$Mode)

    if ($Mode -eq 'LocalLaptop') {
        if ($script:ModeLocalRadio) { $script:ModeLocalRadio.Checked = $true }
        if ($script:ModeServerRadio) { $script:ModeServerRadio.Checked = $false }
        $script:InstallRootBox.Text = 'C:\dev\AcRuleWorkbench'
        $script:SiteNameBox.Text = 'FW Editor Viewer Local'
        $script:SitePathBox.Text = 'C:\dev\AcRuleWorkbench\iis-site'
        $script:SitePortBox.Text = '8080'
        $script:HostHeaderBox.Text = ''
        $script:BackendPortBox.Text = '8787'
        $script:IisCheckBox.Checked = $false
        $script:FirewallCheckBox.Checked = $false
        $script:TaskNameBox.Text = 'AcRuleWorkbench Local API Runner'
        $script:TaskUserBox.Text = 'SYSTEM'
        $script:AllowRefreshCheckBox.Checked = $true
        $script:BuildCheckBox.Checked = $true
    }
    else {
        if ($script:ModeServerRadio) { $script:ModeServerRadio.Checked = $true }
        if ($script:ModeLocalRadio) { $script:ModeLocalRadio.Checked = $false }
        $script:InstallRootBox.Text = 'D:\rri\ACRuleWorkbench'
        $script:SiteNameBox.Text = 'FW Editor Viewer'
        $script:SitePathBox.Text = 'D:\rri\ACRuleWorkbench\iis'
        $script:SitePortBox.Text = '80'
        $script:HostHeaderBox.Text = ''
        $script:BackendPortBox.Text = '8787'
        $script:IisCheckBox.Checked = $true
        $script:FirewallCheckBox.Checked = $true
        $script:TaskNameBox.Text = 'AcRuleWorkbench API Runner'
        $script:TaskUserBox.Text = 'SYSTEM'
        $script:AllowRefreshCheckBox.Checked = $true
        $script:BuildCheckBox.Checked = $true
    }

    Update-DeploymentUi
}


function Show-DeploymentModePrompt {
    $choiceForm = [System.Windows.Forms.Form]::new()
    $choiceForm.Text = 'Choose Install Type'
    $choiceForm.Size = [System.Drawing.Size]::new(720, 350)
    $choiceForm.StartPosition = 'CenterScreen'
    $choiceForm.FormBorderStyle = 'FixedDialog'
    $choiceForm.MaximizeBox = $false
    $choiceForm.MinimizeBox = $false
    $choiceForm.BackColor = [System.Drawing.Color]::FromArgb(246, 248, 251)
    $choiceForm.ShowInTaskbar = $true
    $choiceForm.TopMost = $true

    $titleLabel = [System.Windows.Forms.Label]::new()
    $titleLabel.Text = 'Where are you installing FW Editor Viewer?'
    $titleLabel.Font = [System.Drawing.Font]::new('Segoe UI Variable Display', 16, [System.Drawing.FontStyle]::Bold)
    $titleLabel.Location = [System.Drawing.Point]::new(24, 22)
    $titleLabel.Size = [System.Drawing.Size]::new(660, 32)
    $titleLabel.ForeColor = [System.Drawing.Color]::FromArgb(10, 21, 38)
    $choiceForm.Controls.Add($titleLabel)

    $helpLabel = [System.Windows.Forms.Label]::new()
    $helpLabel.Text = 'Choose one profile. You can still review and change detailed settings before installation starts.'
    $helpLabel.Font = [System.Drawing.Font]::new('Segoe UI', 9)
    $helpLabel.Location = [System.Drawing.Point]::new(26, 60)
    $helpLabel.Size = [System.Drawing.Size]::new(650, 24)
    $helpLabel.ForeColor = [System.Drawing.Color]::FromArgb(80, 93, 115)
    $choiceForm.Controls.Add($helpLabel)

    $localButton = [System.Windows.Forms.Button]::new()
    $localButton.Text = "Local laptop / developer workstation`r`nC:\dev\AcRuleWorkbench`r`nSelf-hosted at http://127.0.0.1:8787/viewer"
    $localButton.Location = [System.Drawing.Point]::new(28, 112)
    $localButton.Size = [System.Drawing.Size]::new(315, 118)
    $localButton.Font = [System.Drawing.Font]::new('Segoe UI', 9)
    $localButton.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
    $localButton.Padding = [System.Windows.Forms.Padding]::new(14, 0, 8, 0)
    $localButton.Tag = 'LocalLaptop'
    $choiceForm.Controls.Add($localButton)

    $serverButton = [System.Windows.Forms.Button]::new()
    $serverButton.Text = "Windows Server 2019 / IIS`r`nD:\rri\ACRuleWorkbench`r`nIIS front door at http://server-name/viewer"
    $serverButton.Location = [System.Drawing.Point]::new(363, 112)
    $serverButton.Size = [System.Drawing.Size]::new(315, 118)
    $serverButton.Font = [System.Drawing.Font]::new('Segoe UI', 9)
    $serverButton.TextAlign = [System.Drawing.ContentAlignment]::MiddleLeft
    $serverButton.Padding = [System.Windows.Forms.Padding]::new(14, 0, 8, 0)
    $serverButton.Tag = 'WindowsServerIis'
    $choiceForm.Controls.Add($serverButton)

    $cancelButton = [System.Windows.Forms.Button]::new()
    $cancelButton.Text = 'Cancel'
    $cancelButton.Location = [System.Drawing.Point]::new(568, 256)
    $cancelButton.Size = [System.Drawing.Size]::new(110, 32)
    $cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $choiceForm.CancelButton = $cancelButton
    $choiceForm.Controls.Add($cancelButton)

    $script:SelectedDeploymentPromptMode = $null
    $localButton.Add_Click({
        $script:SelectedDeploymentPromptMode = 'LocalLaptop'
        $choiceForm.DialogResult = [System.Windows.Forms.DialogResult]::OK
        $choiceForm.Close()
    })
    $serverButton.Add_Click({
        $script:SelectedDeploymentPromptMode = 'WindowsServerIis'
        $choiceForm.DialogResult = [System.Windows.Forms.DialogResult]::OK
        $choiceForm.Close()
    })

    $result = $choiceForm.ShowDialog()
    if ($result -ne [System.Windows.Forms.DialogResult]::OK -or [string]::IsNullOrWhiteSpace($script:SelectedDeploymentPromptMode)) {
        return $null
    }

    return $script:SelectedDeploymentPromptMode
}

function Install-Workbench {
    $deploymentMode = Get-SelectedDeploymentMode
    $iisRequested = ($deploymentMode -eq 'WindowsServerIis') -and $script:IisCheckBox.Checked

    $installRoot = $script:InstallRootBox.Text.Trim()
    $fwdPath = $script:FwdPathBox.Text.Trim()
    $viewerPath = Join-Path $installRoot 'ac-rule-viewer.html'
    $solutionPath = Join-Path $installRoot 'AcRuleWorkbench.sln'
    $exePath = Join-Path $installRoot 'AcRuleWorkbench\bin\x86\Release\net48\AcRuleWorkbench.exe'
    $backendPort = [int]$script:BackendPortBox.Text.Trim()
    $sitePort = [int]$script:SitePortBox.Text.Trim()
    $siteName = $script:SiteNameBox.Text.Trim()
    $sitePath = $script:SitePathBox.Text.Trim()
    $hostHeader = $script:HostHeaderBox.Text.Trim()
    $taskName = $script:TaskNameBox.Text.Trim()
    $taskUser = $script:TaskUserBox.Text.Trim()
    $taskPasswordText = $script:TaskPasswordBox.Text

    if ([string]::IsNullOrWhiteSpace($installRoot)) { throw 'Install folder is required.' }
    if (-not (Test-Path -LiteralPath $fwdPath -PathType Leaf)) { throw "FWD path was not found: $fwdPath" }
    if ($backendPort -lt 1 -or $backendPort -gt 65535) { throw 'Backend port must be 1-65535.' }
    if ($iisRequested) {
        if ($sitePort -lt 1 -or $sitePort -gt 65535) { throw 'IIS site port must be 1-65535.' }
        if ([string]::IsNullOrWhiteSpace($siteName)) { throw 'IIS site name is required.' }
        if ([string]::IsNullOrWhiteSpace($sitePath)) { throw 'IIS site path is required.' }
    }
    if ([string]::IsNullOrWhiteSpace($taskName)) { throw 'Scheduled task name is required.' }
    if ([string]::IsNullOrWhiteSpace($taskUser)) { throw 'Task account is required. Use SYSTEM unless you need a service account.' }

    $script:InstallButton.Enabled = $false
    $script:OpenButton.Enabled = $false
    $script:ProgressBar.Value = 0
    Add-Log "Starting installation. Mode: $deploymentMode"

    Copy-PackageToInstallRoot -SourceRoot $PackageRoot -InstallRoot $installRoot
    $script:ProgressBar.Value = 10

    if (-not (Test-Path -LiteralPath $solutionPath -PathType Leaf)) {
        throw "Solution file was not found after copy: $solutionPath"
    }

    if ($script:BuildCheckBox.Checked -or -not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
        $msbuild = Resolve-MSBuild
        if (-not $msbuild) {
            throw 'MSBuild was not found. Install Visual Studio Build Tools 2019/2022 with .NET desktop build tools, then rerun the installer.'
        }
        Add-Log "Building x86 Release with MSBuild: $msbuild"
        Invoke-LoggedProcess -FilePath $msbuild -Arguments @($solutionPath, '/p:Configuration=Release', '/p:Platform=x86', '/m') -WorkingDirectory $installRoot -LogPrefix 'msbuild' -TimeoutMinutes 45
    }
    else {
        Add-Log "Using existing executable: $exePath"
    }
    $script:ProgressBar.Value = 35

    if (-not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
        throw "AcRuleWorkbench.exe was not found: $exePath"
    }

    Add-Log 'Generating initial FW Editor Viewer viewer.'
    Invoke-LoggedProcess -FilePath $exePath -Arguments @('ac-viewer', '--path', $fwdPath, '--out', $viewerPath) -WorkingDirectory $installRoot -LogPrefix 'generate-viewer' -TimeoutMinutes 20
    $script:ProgressBar.Value = 50

    $registerScript = Join-Path $installRoot 'scripts\register-workbench-runner-task.ps1'
    if (-not (Test-Path -LiteralPath $registerScript -PathType Leaf)) { throw "Task registration script was not found: $registerScript" }

    Add-Log 'Registering always-on backend scheduled task.'
    $registerArgs = @(
        '-ExePath', $exePath,
        '-FwdPath', $fwdPath,
        '-ViewerPath', $viewerPath,
        '-Port', $backendPort,
        '-HostName', '127.0.0.1',
        '-TaskName', $taskName,
        '-TaskUser', $taskUser,
        '-StartNow'
    )
    if ($script:AllowRefreshCheckBox.Checked) { $registerArgs += '-AllowRefresh' }

    if ($taskUser -ine 'SYSTEM') {
        if ([string]::IsNullOrWhiteSpace($taskPasswordText)) { throw 'Password is required for a custom task account.' }
        Add-Log 'Registering task with custom account in-process so the password is not written to a command line.'
        $secure = ConvertTo-SecureString $taskPasswordText -AsPlainText -Force
        & $registerScript @registerArgs -TaskPassword $secure
        if ($LASTEXITCODE -ne 0) { throw "Task registration failed with exit code $LASTEXITCODE." }
    }
    else {
        $registerPsArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File', $registerScript) + $registerArgs
        Invoke-LoggedProcess -FilePath 'powershell.exe' -Arguments $registerPsArgs -WorkingDirectory $installRoot -LogPrefix 'register-task' -TimeoutMinutes 5
    }
    $script:ProgressBar.Value = 70

    if ($iisRequested) {
        $iisScript = Join-Path $installRoot 'scripts\install-iis-workbench.ps1'
        if (-not (Test-Path -LiteralPath $iisScript -PathType Leaf)) { throw "IIS installer script was not found: $iisScript" }
        Add-Log 'Creating/updating IIS front-door site.'
        $iisArgs = @(
            '-SiteName', $siteName,
            '-SitePath', $sitePath,
            '-SitePort', $sitePort,
            '-BackendHost', '127.0.0.1',
            '-BackendPort', $backendPort
        )
        if (-not [string]::IsNullOrWhiteSpace($hostHeader)) { $iisArgs += @('-HostHeader', $hostHeader) }
        if ($script:FirewallCheckBox.Checked) { $iisArgs += '-OpenFirewall' }
        $iisPsArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File', $iisScript) + $iisArgs
        Invoke-LoggedProcess -FilePath 'powershell.exe' -Arguments $iisPsArgs -WorkingDirectory $installRoot -LogPrefix 'configure-iis' -TimeoutMinutes 15
    }
    else {
        Add-Log 'Skipping IIS configuration. The self-hosted workbench will be available on 127.0.0.1 using the backend port.'
    }
    $script:ProgressBar.Value = 90

    $publicUrl = if ($iisRequested) {
        if (-not [string]::IsNullOrWhiteSpace($hostHeader)) {
            "http://$hostHeader/viewer"
        }
        elseif ($sitePort -eq 80) {
            'http://localhost/viewer'
        }
        else {
            "http://localhost:$sitePort/viewer"
        }
    }
    else {
        "http://127.0.0.1:$backendPort/viewer"
    }

    $shortcutDir = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\FW Editor Viewer'
    New-Item -ItemType Directory -Path $shortcutDir -Force | Out-Null
    New-ShortcutFile -ShortcutPath (Join-Path $shortcutDir 'FW Editor Viewer.url') -TargetUrl $publicUrl
    New-ShortcutFile -ShortcutPath (Join-Path $shortcutDir 'FW Editor Viewer API Harness.url') -TargetUrl ($publicUrl -replace '/viewer$', '/harness')

    $script:PublicUrl = $publicUrl
    $script:ProgressBar.Value = 100
    $script:OpenButton.Enabled = $true
    Add-Log 'Installation complete.'
    Add-Log "User URL: $publicUrl"
    Add-Log "API Harness: $($publicUrl -replace '/viewer$', '/harness')"
    Add-Log 'Refresh/update is available from the viewer if Allow Refresh was enabled.'
}

if (-not (Test-IsAdmin)) {
    Show-ErrorBox 'Run this installer as Administrator. Right-click Run-Setup-Wizard.cmd and choose Run as administrator.'
    exit 1
}

$form = [System.Windows.Forms.Form]::new()
$form.Text = 'FW Editor Viewer Setup'
$form.Size = [System.Drawing.Size]::new(930, 760)
$form.StartPosition = 'CenterScreen'
$form.MinimumSize = [System.Drawing.Size]::new(880, 700)
$form.BackColor = [System.Drawing.Color]::FromArgb(246, 248, 251)

$title = [System.Windows.Forms.Label]::new()
$title.Text = 'FW Editor Viewer Setup'
$title.Font = [System.Drawing.Font]::new('Segoe UI Variable Display', 18, [System.Drawing.FontStyle]::Bold)
$title.Location = [System.Drawing.Point]::new(24, 18)
$title.Size = [System.Drawing.Size]::new(620, 34)
$title.ForeColor = [System.Drawing.Color]::FromArgb(10, 21, 38)
$form.Controls.Add($title)

$subtitle = [System.Windows.Forms.Label]::new()
$subtitle.Text = 'Choose local laptop mode or Windows Server 2019/IIS mode. Installs the backend API, viewer, refresh endpoint, and test harness.'
$subtitle.Font = [System.Drawing.Font]::new('Segoe UI', 9)
$subtitle.Location = [System.Drawing.Point]::new(26, 54)
$subtitle.Size = [System.Drawing.Size]::new(820, 22)
$subtitle.ForeColor = [System.Drawing.Color]::FromArgb(80, 93, 115)
$form.Controls.Add($subtitle)

$tabs = [System.Windows.Forms.TabControl]::new()
$tabs.Location = [System.Drawing.Point]::new(24, 88)
$tabs.Size = [System.Drawing.Size]::new(870, 445)
$tabs.Anchor = 'Top,Left,Right'
$form.Controls.Add($tabs)

$tabInstall = [System.Windows.Forms.TabPage]::new()
$tabInstall.Text = 'Install paths'
$tabInstall.BackColor = [System.Drawing.Color]::FromArgb(255,255,255)
$tabs.Controls.Add($tabInstall)

$tabServer = [System.Windows.Forms.TabPage]::new()
$tabServer.Text = 'Server settings'
$tabServer.BackColor = [System.Drawing.Color]::FromArgb(255,255,255)
$tabs.Controls.Add($tabServer)

$tabAccount = [System.Windows.Forms.TabPage]::new()
$tabAccount.Text = 'Always-on task'
$tabAccount.BackColor = [System.Drawing.Color]::FromArgb(255,255,255)
$tabs.Controls.Add($tabAccount)

$tabOptions = [System.Windows.Forms.TabPage]::new()
$tabOptions.Text = 'Options'
$tabOptions.BackColor = [System.Drawing.Color]::FromArgb(255,255,255)
$tabs.Controls.Add($tabOptions)

# Install tab
$modeGroup = [System.Windows.Forms.GroupBox]::new()
$modeGroup.Text = 'Deployment profile'
$modeGroup.Location = [System.Drawing.Point]::new(20, 16)
$modeGroup.Size = [System.Drawing.Size]::new(820, 82)
$modeGroup.ForeColor = [System.Drawing.Color]::FromArgb(28, 36, 52)
$tabInstall.Controls.Add($modeGroup)

$script:ModeLocalRadio = [System.Windows.Forms.RadioButton]::new()
$script:ModeLocalRadio.Text = 'Local laptop / developer workstation'
$script:ModeLocalRadio.Location = [System.Drawing.Point]::new(16, 24)
$script:ModeLocalRadio.Size = [System.Drawing.Size]::new(260, 22)
$modeGroup.Controls.Add($script:ModeLocalRadio)

$script:ModeServerRadio = [System.Windows.Forms.RadioButton]::new()
$script:ModeServerRadio.Text = 'Windows Server 2019 / IIS'
$script:ModeServerRadio.Location = [System.Drawing.Point]::new(290, 24)
$script:ModeServerRadio.Size = [System.Drawing.Size]::new(220, 22)
$modeGroup.Controls.Add($script:ModeServerRadio)

$script:ModeDescriptionLabel = [System.Windows.Forms.Label]::new()
$script:ModeDescriptionLabel.Location = [System.Drawing.Point]::new(16, 50)
$script:ModeDescriptionLabel.Size = [System.Drawing.Size]::new(780, 22)
$script:ModeDescriptionLabel.ForeColor = [System.Drawing.Color]::FromArgb(80, 93, 115)
$modeGroup.Controls.Add($script:ModeDescriptionLabel)

$script:ModeLocalRadio.Add_CheckedChanged({ if ($script:ModeLocalRadio.Checked) { Apply-DeploymentPreset -Mode 'LocalLaptop' } })
$script:ModeServerRadio.Add_CheckedChanged({ if ($script:ModeServerRadio.Checked) { Apply-DeploymentPreset -Mode 'WindowsServerIis' } })

$tabInstall.Controls.Add((New-Label 'Install folder' 22 122))
$script:InstallRootBox = New-TextBox 'C:\dev\AcRuleWorkbench' 190 120 560
$tabInstall.Controls.Add($script:InstallRootBox)
$browseInstall = New-Button 'Browse...' 760 117 82
$browseInstall.Add_Click({
    $dlg = [System.Windows.Forms.FolderBrowserDialog]::new()
    $dlg.Description = 'Choose install folder'
    $dlg.SelectedPath = $script:InstallRootBox.Text
    if ($dlg.ShowDialog() -eq 'OK') { $script:InstallRootBox.Text = $dlg.SelectedPath }
})
$tabInstall.Controls.Add($browseInstall)

$tabInstall.Controls.Add((New-Label 'FWD / CFD path' 22 164))
$script:FwdPathBox = New-TextBox 'C:\rri\ddce\configs\Server\R1\fwd\fwd.cfd' 190 162 560
$tabInstall.Controls.Add($script:FwdPathBox)
$browseFwd = New-Button 'Browse...' 760 159 82
$browseFwd.Add_Click({
    $dlg = [System.Windows.Forms.OpenFileDialog]::new()
    $dlg.Title = 'Select fwd.cfd'
    $dlg.Filter = 'FWD/CFD files (*.cfd;*.fwd)|*.cfd;*.fwd|All files (*.*)|*.*'
    if (Test-Path -LiteralPath $script:FwdPathBox.Text -PathType Leaf) { $dlg.FileName = $script:FwdPathBox.Text }
    if ($dlg.ShowDialog() -eq 'OK') { $script:FwdPathBox.Text = $dlg.FileName }
})
$tabInstall.Controls.Add($browseFwd)

$installNote = [System.Windows.Forms.Label]::new()
$installNote.Text = 'Local laptop default: C:\dev\AcRuleWorkbench, no IIS, self-hosted at 127.0.0.1. Server default: D:\rri\ACRuleWorkbench with IIS front door and always-on backend.'
$installNote.Location = [System.Drawing.Point]::new(22, 210)
$installNote.Size = [System.Drawing.Size]::new(810, 48)
$installNote.ForeColor = [System.Drawing.Color]::FromArgb(80, 93, 115)
$tabInstall.Controls.Add($installNote)

# Server tab
$script:IisCheckBox = New-CheckBox 'Configure IIS front-door site' 24 24 $true 320
$script:IisCheckBox.Add_CheckedChanged({ Update-DeploymentUi })
$tabServer.Controls.Add($script:IisCheckBox)
$tabServer.Controls.Add((New-Label 'IIS site name' 24 66))
$script:SiteNameBox = New-TextBox 'FW Editor Viewer' 190 64 360
$tabServer.Controls.Add($script:SiteNameBox)
$tabServer.Controls.Add((New-Label 'IIS site path' 24 106))
$script:SitePathBox = New-TextBox 'D:\rri\ACRuleWorkbench\iis' 190 104 520
$tabServer.Controls.Add($script:SitePathBox)
$tabServer.Controls.Add((New-Label 'IIS site port' 24 146))
$script:SitePortBox = New-TextBox '80' 190 144 120
$tabServer.Controls.Add($script:SitePortBox)
$tabServer.Controls.Add((New-Label 'Host header optional' 24 186))
$script:HostHeaderBox = New-TextBox '' 190 184 360
$tabServer.Controls.Add($script:HostHeaderBox)
$tabServer.Controls.Add((New-Label 'Backend port' 24 226))
$script:BackendPortBox = New-TextBox '8787' 190 224 120
$tabServer.Controls.Add($script:BackendPortBox)
$script:FirewallCheckBox = New-CheckBox 'Open Windows Firewall for IIS site port' 190 264 $true 360
$tabServer.Controls.Add($script:FirewallCheckBox)

$serverNote = [System.Windows.Forms.Label]::new()
$serverNote.Text = 'Server/IIS mode reverse-proxies /viewer, /harness, and /api/* to the local backend on 127.0.0.1. URL Rewrite and ARR must be installed. Local laptop mode skips IIS.'
$serverNote.Location = [System.Drawing.Point]::new(24, 306)
$serverNote.Size = [System.Drawing.Size]::new(810, 48)
$serverNote.ForeColor = [System.Drawing.Color]::FromArgb(80, 93, 115)
$tabServer.Controls.Add($serverNote)

# Account tab
$tabAccount.Controls.Add((New-Label 'Scheduled task name' 24 34))
$script:TaskNameBox = New-TextBox 'AcRuleWorkbench API Runner' 190 32 380
$tabAccount.Controls.Add($script:TaskNameBox)
$tabAccount.Controls.Add((New-Label 'Task account' 24 76))
$script:TaskUserBox = New-TextBox 'SYSTEM' 190 74 380
$tabAccount.Controls.Add($script:TaskUserBox)
$tabAccount.Controls.Add((New-Label 'Password if custom' 24 118))
$script:TaskPasswordBox = New-TextBox '' 190 116 380 $true
$tabAccount.Controls.Add($script:TaskPasswordBox)

$accountNote = [System.Windows.Forms.Label]::new()
$accountNote.Text = 'Use SYSTEM unless FWD/config/licensing access requires a specific service account. If using DOMAIN\user, provide its password here. The password is used only for task registration.'
$accountNote.Location = [System.Drawing.Point]::new(24, 164)
$accountNote.Size = [System.Drawing.Size]::new(810, 58)
$accountNote.ForeColor = [System.Drawing.Color]::FromArgb(80, 93, 115)
$tabAccount.Controls.Add($accountNote)

# Options tab
$script:BuildCheckBox = New-CheckBox 'Build x86 Release before install' 24 28 $true 360
$tabOptions.Controls.Add($script:BuildCheckBox)
$script:AllowRefreshCheckBox = New-CheckBox 'Enable web Refresh from FWD button' 24 68 $true 360
$tabOptions.Controls.Add($script:AllowRefreshCheckBox)

$optionsNote = [System.Windows.Forms.Label]::new()
$optionsNote.Text = 'Refresh/update exposes POST /api/v1/snapshot/refresh. Keep enabled for trusted internal deployments. Disable it if users should only view the last generated snapshot.'
$optionsNote.Location = [System.Drawing.Point]::new(24, 112)
$optionsNote.Size = [System.Drawing.Size]::new(810, 50)
$optionsNote.ForeColor = [System.Drawing.Color]::FromArgb(80, 93, 115)
$tabOptions.Controls.Add($optionsNote)

$script:ProgressBar = [System.Windows.Forms.ProgressBar]::new()
$script:ProgressBar.Location = [System.Drawing.Point]::new(24, 548)
$script:ProgressBar.Size = [System.Drawing.Size]::new(870, 18)
$script:ProgressBar.Anchor = 'Left,Right,Bottom'
$form.Controls.Add($script:ProgressBar)

$script:LogBox = [System.Windows.Forms.TextBox]::new()
$script:LogBox.Location = [System.Drawing.Point]::new(24, 578)
$script:LogBox.Size = [System.Drawing.Size]::new(870, 92)
$script:LogBox.Anchor = 'Left,Right,Bottom'
$script:LogBox.Multiline = $true
$script:LogBox.ScrollBars = 'Vertical'
$script:LogBox.ReadOnly = $true
$script:LogBox.BackColor = [System.Drawing.Color]::FromArgb(10, 21, 38)
$script:LogBox.ForeColor = [System.Drawing.Color]::FromArgb(230, 239, 250)
$script:LogBox.Font = [System.Drawing.Font]::new('Consolas', 9)
$form.Controls.Add($script:LogBox)

$script:InstallButton = New-Button 'Install' 640 684 110 34
$script:InstallButton.Anchor = 'Right,Bottom'
$script:InstallButton.Add_Click({
    try {
        Install-Workbench
        Show-InfoBox "Installation complete.`r`n`r`n$script:PublicUrl"
    }
    catch {
        Add-Log "ERROR: $($_.Exception.Message)"
        Show-ErrorBox $_.Exception.Message
    }
    finally {
        $script:InstallButton.Enabled = $true
    }
})
$form.Controls.Add($script:InstallButton)

$script:OpenButton = New-Button 'Open viewer' 760 684 110 34
$script:OpenButton.Anchor = 'Right,Bottom'
$script:OpenButton.Enabled = $false
$script:OpenButton.Add_Click({
    if (-not [string]::IsNullOrWhiteSpace($script:PublicUrl)) { Start-Process $script:PublicUrl }
})
$form.Controls.Add($script:OpenButton)

$closeButton = New-Button 'Close' 24 684 110 34
$closeButton.Anchor = 'Left,Bottom'
$closeButton.Add_Click({ $form.Close() })
$form.Controls.Add($closeButton)

$initialPreset = if ($Preset -eq 'WindowsServerIis') {
    'WindowsServerIis'
}
elseif ($Preset -eq 'LocalLaptop') {
    'LocalLaptop'
}
else {
    Show-DeploymentModePrompt
}

if ([string]::IsNullOrWhiteSpace($initialPreset)) {
    exit 0
}

Apply-DeploymentPreset -Mode $initialPreset

Add-Log "Package root: $PackageRoot"
Add-Log "Selected install type: $initialPreset"
Add-Log 'Ready. Review settings, then click Install.'
[void]$form.ShowDialog()
