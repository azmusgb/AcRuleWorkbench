#define MyAppName "FW Editor Viewer"
#define MyAppVersion "v72"
#define MyAppPublisher "AcRuleWorkbench"
#define MyAppExeName "Run-Setup-Wizard.cmd"

[Setup]
AppId={{1E655C80-0D39-45C3-B6EC-ACRULEWORKBENCH}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName=D:\rri\ACRuleWorkbench
DefaultGroupName=FW Editor Viewer
DisableProgramGroupPage=yes
OutputDir=Output
OutputBaseFilename=ACRuleWorkbenchSetup_v72
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
PrivilegesRequired=admin
WizardStyle=modern
SetupLogging=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "installer\Output\*,.git\*,bin\*,obj\*"

[Icons]
Name: "{group}\FW Editor Viewer Setup"; Filename: "{app}\installer\Run-Setup-Wizard.cmd"; WorkingDir: "{app}"
Name: "{group}\Setup - Local Laptop"; Filename: "{app}\installer\Run-Setup-Wizard-Local.cmd"; WorkingDir: "{app}"
Name: "{group}\Setup - Windows Server IIS"; Filename: "{app}\installer\Run-Setup-Wizard-Server-IIS.cmd"; WorkingDir: "{app}"
Name: "{group}\FW Editor Viewer Viewer"; Filename: "http://localhost/viewer"
Name: "{group}\API Harness"; Filename: "http://localhost/harness"

[Run]
Filename: "{app}\installer\Run-Setup-Wizard.cmd"; Description: "Launch setup wizard"; Flags: postinstall runascurrentuser nowait skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
