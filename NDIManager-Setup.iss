; NDI Manager Installer Script for Inno Setup
; Version 2.0 - Standalone Application (System Tray)

#define MyAppName "NDI Manager"
#define MyAppVersion "2.0"
#define MyAppPublisher "Vizrt NDI AB"
#define MyAppExeName "NDIManager.exe"

[Setup]
AppId={{E7F3C4A9-8D2B-4F1E-9A3C-5B6D7E8F9A0B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
LicenseFile=License\license.rtf
InfoBeforeFile=License\internal-only.txt
OutputDir=Output
OutputBaseFilename=NDIManager-v{#MyAppVersion}-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
SetupIconFile=

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Main application files from publish folder
Source: "publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Third-party licenses
Source: "ThirdPartyLicenses\*"; DestDir: "{app}\ThirdPartyLicenses"; Flags: ignoreversion recursesubdirs createallsubdirs
; License files
Source: "License\license.rtf"; DestDir: "{app}\License"; Flags: ignoreversion
Source: "License\internal-only.txt"; DestDir: "{app}\License"; Flags: ignoreversion

[Dirs]
Name: "{app}\wwwroot"; Permissions: users-modify
Name: "{app}\Logs"; Permissions: users-modify

[Icons]
; Start Menu shortcuts
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Comment: "Launch NDI Manager"
Name: "{group}\Open NDI Manager Web UI"; Filename: "http://localhost:5000"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
; Desktop shortcut (optional)
Name: "{commondesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
; Startup folder (optional - auto-start with Windows)
Name: "{commonstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startupicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"
Name: "startupicon"; Description: "Start NDI Manager automatically with Windows"; GroupDescription: "Startup:"; Flags: unchecked

[Run]
; Launch after installation
Filename: "{app}\{#MyAppExeName}"; Description: "Launch NDI Manager"; Flags: postinstall nowait skipifsilent

[Code]
function InitializeUninstall(): Boolean;
var
  ResultCode: Integer;
begin
  Result := True;

  // Kill running instances before uninstalling
  Exec('taskkill', '/F /IM {#MyAppExeName}', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(1000);
end;

[Messages]
WelcomeLabel2=This will install [name/ver] on your computer.%n%nNDI Manager runs as a system tray application. Right-click the tray icon to access settings.%n%nIt is recommended that you close all other applications before continuing.
ConfirmUninstall=Are you sure you want to completely remove %1 and all of its components?
