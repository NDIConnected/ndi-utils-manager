# NDI Manager 6.3 - Installer Build Instructions

## Version 2.9

## Overview

This document describes how to build and package the standalone desktop/tray version of NDI Manager using Inno Setup.

## Key Release Notes (v2.9)

- Web UI v2.9: SignalR, table/events tabs, dropped frames, English UI, UX fixes
- Standalone WinForms tray application (not a Windows Service)
- Self-contained `.NET 9` publish for `win-x64`
- Installer output: `Output\NDIManager-v2.9-Setup.exe`
- Unified icon branding with `MAN_icon.ico` for:
  - installer executable
  - application executable
  - tray/taskbar icon

## Prerequisites

1. **Inno Setup 6.x**
   - https://jrsoftware.org/isdl.php
2. **.NET SDK 9.x** installed
3. NDI SDK runtime DLL available at:
   - `C:\Program Files\NDI\NDI 6 SDK\Bin\x64\Processing.NDI.Lib.x64.dll`

## Build and Packaging Steps

### 1) Build frontend

```powershell
cd ndi-web-ui
npm run build
```

### 2) Copy frontend into backend static folder

```powershell
cd ..
Remove-Item .\wwwroot\* -Recurse -Force
Copy-Item .\ndi-web-ui\dist\* .\wwwroot\ -Recurse -Force
```

### 3) Publish backend (self-contained)

```powershell
dotnet publish -c Release -r win-x64 --self-contained true -o .\publish
```

### 4) Compile installer

```powershell
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" ".\NDIManager-Setup.iss"
```

Result:
- `Output\NDIManager-v2.9-Setup.exe`

## Installer Behavior

- Installs the standalone application to `Program Files\NDI Manager`
- Creates Start Menu shortcut
- Optional desktop shortcut
- Optional startup shortcut (run at Windows login)
- Launches app after install (unless silent mode)
- Uses bundled icon (`MAN_icon.ico`) for installer/app identity

## Runtime Behavior

- App runs in system tray
- Right-click tray icon:
  - Open Web UI
  - Change port
  - Exit
- Default Web UI URL: `http://localhost:5000` (configurable in-app)

## Installed File Layout (simplified)

```text
{InstallDir}\
├── NDIManager.exe
├── MAN_icon.ico
├── Processing.NDI.Lib.x64.dll
├── wwwroot\
├── ThirdPartyLicenses\
└── License\
```

## Uninstall

The uninstaller closes running `NDIManager.exe`, removes installed files, and removes shortcuts.

## Troubleshooting

### App does not start

- Ensure no other `NDIManager.exe` instance is already running
- Verify local security/AV did not block executable launch

### Web UI not reachable

- Confirm app is running in tray
- Verify selected port is not occupied
- Open from tray menu to avoid URL/port mismatch

### Installer compile fails

- Verify `ISCC.exe` path
- Verify `publish` folder exists and is up-to-date
- Verify `MAN_icon.ico` exists at repository root

---

**Copyright © 2026 Vizrt NDI AB**
