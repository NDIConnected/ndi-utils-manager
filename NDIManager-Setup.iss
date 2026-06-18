; NDI Manager Installer Script for Inno Setup
; Version 3.0 - Standalone Application (System Tray)

#define MyAppName "NDI Manager"
#define MyAppVersion "3.0"
#define MyAppPublisher "Vizrt NDI AB"
#define MyAppExeName "NDIManager.exe"
#define MyLicenseFile "License\LICENSE"
#define MyDisclaimerFile "INSTALLER-NOTICE.txt"

[Setup]
AppId={{E7F3C4A9-8D2B-4F1E-9A3C-5B6D7E8F9A0B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
LicenseFile={#MyLicenseFile}
OutputDir=Output
OutputBaseFilename=NDIManager-v{#MyAppVersion}-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
SetupIconFile=MAN_icon.ico

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
; Main application files from publish folder
Source: "publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Third-party licenses
Source: "ThirdPartyLicenses\*"; DestDir: "{app}\ThirdPartyLicenses"; Flags: ignoreversion recursesubdirs createallsubdirs
; Installer notice (extracted for custom wizard page)
Source: "{#MyDisclaimerFile}"; DestName: "INSTALLER-NOTICE.txt"; Flags: dontcopy
; License files (same layout as NDI GPIO Panel)
Source: "{#MyLicenseFile}"; DestDir: "{app}\Licenses"; DestName: "LICENSE"; Flags: ignoreversion
Source: "{#MyDisclaimerFile}"; DestDir: "{app}\Licenses"; DestName: "INSTALLER-NOTICE.txt"; Flags: ignoreversion
Source: "License\THIRD_PARTY_LICENSES.txt"; DestDir: "{app}\Licenses"; Flags: ignoreversion

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
var
  DisclaimerPage: TWizardPage;
  DisclaimerMemo: TNewMemo;
  DisclaimerAcceptCheck: TNewCheckBox;

function NormalizeLineBreaks(const S: String): String;
var
  T: String;
begin
  T := S;
  StringChangeEx(T, #13#10, #10, True);
  StringChangeEx(T, #10, #13#10, True);
  Result := T;
end;

function LoadDisclaimerText(): String;
var
  Filename: String;
  AnsiText: AnsiString;
begin
  Filename := ExpandConstant('{tmp}\INSTALLER-NOTICE.txt');
  if not LoadStringFromFile(Filename, AnsiText) then
    Result := ''
  else
    Result := NormalizeLineBreaks(String(AnsiText));
end;

procedure DisclaimerAcceptClick(Sender: TObject);
begin
  WizardForm.NextButton.Enabled := DisclaimerAcceptCheck.Checked;
end;

procedure InitializeWizard;
var
  CheckTop: Integer;
begin
  DisclaimerPage := CreateCustomPage(
    wpWelcome,
    'Installer Notice',
    'Read and accept this notice to continue. The MIT license agreement is on the next page.');

  ExtractTemporaryFile('INSTALLER-NOTICE.txt');

  CheckTop := DisclaimerPage.SurfaceHeight - ScaleY(26);

  DisclaimerAcceptCheck := TNewCheckBox.Create(DisclaimerPage);
  DisclaimerAcceptCheck.Parent := DisclaimerPage.Surface;
  DisclaimerAcceptCheck.Caption := 'I have read and accept this notice';
  DisclaimerAcceptCheck.Left := 0;
  DisclaimerAcceptCheck.Top := CheckTop;
  DisclaimerAcceptCheck.Width := DisclaimerPage.SurfaceWidth;
  DisclaimerAcceptCheck.Height := ScaleY(17);
  DisclaimerAcceptCheck.Anchors := [akLeft, akRight, akBottom];
  DisclaimerAcceptCheck.Checked := False;
  DisclaimerAcceptCheck.OnClick := @DisclaimerAcceptClick;

  DisclaimerMemo := TNewMemo.Create(DisclaimerPage);
  DisclaimerMemo.Parent := DisclaimerPage.Surface;
  DisclaimerMemo.Left := 0;
  DisclaimerMemo.Top := 0;
  DisclaimerMemo.Width := DisclaimerPage.SurfaceWidth;
  DisclaimerMemo.Height := CheckTop - ScaleY(10);
  DisclaimerMemo.Anchors := [akLeft, akTop, akRight];
  DisclaimerMemo.ReadOnly := True;
  DisclaimerMemo.ScrollBars := ssVertical;
  DisclaimerMemo.Text := LoadDisclaimerText();
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = DisclaimerPage.ID then
    WizardForm.NextButton.Enabled := DisclaimerAcceptCheck.Checked;
end;

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
