; Installer for the AMCGH Capture Windows app (the same web app as the Android app, in its own window).
; Build the app first:  flutter build windows --release --dart-define=APP_URL=https://your-server
; Then, from mobile\:   ISCC windows\installer.iss    ->  build\AMCGH-Capture-Setup.exe

#define AppName "AMCGH Capture"
#define AppVersion "1.0.0"
#define Release "..\build\windows\x64\runner\Release"

[Setup]
AppId={{E9CB0A6B-1918-4C4B-BB35-91ED5B40EAEB}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=NSU Big-Matrix Lab
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
UninstallDisplayIcon={app}\amcgh_capture.exe
OutputDir=..\build
OutputBaseFilename=AMCGH-Capture-Setup
SetupIconFile=runner\resources\app_icon.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog commandline

[Tasks]
Name: "desktopicon"; Description: "Put a shortcut on the desktop"; GroupDescription: "Shortcuts:"

[Files]
Source: "{#Release}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\amcgh_capture.exe"
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\amcgh_capture.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\amcgh_capture.exe"; Description: "Open {#AppName} now"; Flags: nowait postinstall skipifsilent
