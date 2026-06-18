# NDI Manager 6.3 - Installer Build Instructions

## Version 3.0

## Overview

This document describes how to build and package the standalone desktop/tray version of NDI Manager using Inno Setup.

## Key Release Notes (v3.0)

- Web UI v3.0: per-device compact view, drag handle, instant connection select/disconnect, layout fixes, **multi-host sidebar** (Ctrl+Click)
- Standalone WinForms tray application (not a Windows Service)
- **Self-contained** `.NET 9` publish for `win-x64` — **no separate .NET install** on target machines
- Tray menu in English; disconnect balloon notifications removed
- **Installer license aligned with NDI GPIO Panel:** MIT License + NDI SDK installer notice (`LICENSE`, `INSTALLER-NOTICE.txt`); notice text uses ASCII + CRLF for correct display in the wizard
- Installer output: `Output\NDIManager-v3.0-Setup.exe`
- Unified icon branding with `MAN_icon.ico` for installer, application, and tray

## Prerequisites

1. **Inno Setup 6.x** — https://jrsoftware.org/isdl.php
2. **.NET SDK 9.x** (build machine only)
3. **Node.js** (to rebuild the Web UI)
4. NDI SDK runtime DLL at:
   - `C:\Program Files\NDI\NDI 6 SDK\Bin\x64\Processing.NDI.Lib.x64.dll`

## Build and Packaging Steps

### Option A — script (recommended)

```powershell
cd ndi-web-ui
npm run build
cd ..
Remove-Item .\wwwroot\* -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item .\ndi-web-ui\dist\* .\wwwroot\ -Recurse -Force
.\scripts\publish-standalone.ps1
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" ".\NDIManager-Setup.iss"
```

### Option B — manual steps

#### 1) Build frontend

```powershell
cd ndi-web-ui
npm run build
```

#### 2) Copy frontend into backend static folder

```powershell
cd ..
Remove-Item .\wwwroot\* -Recurse -Force
Copy-Item .\ndi-web-ui\dist\* .\wwwroot\ -Recurse -Force
```

#### 3) Publish backend (self-contained)

```powershell
dotnet publish -c Release -r win-x64 --self-contained true -o .\publish
```

Verify `publish\NDIManager.runtimeconfig.json` contains `"includedFrameworks"` (not `"frameworks"` only).

#### 4) Compile installer

```powershell
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" ".\NDIManager-Setup.iss"
```

Result:

- `Output\NDIManager-v3.0-Setup.exe`

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
  - **Open Web UI**
  - **Port** — change HTTP port
  - **Restart service**
  - **Open data folder** — `%LocalAppData%\NDIManager`
  - **Exit**
- Default Web UI URL: `http://localhost:5000` (configurable in-app)

## Installed File Layout (simplified)

```text
{InstallDir}\
├── NDIManager.exe
├── MAN_icon.ico
├── Processing.NDI.Lib.x64.dll
├── wwwroot\
├── ThirdPartyLicenses\
└── Licenses\
    ├── LICENSE
    ├── INSTALLER-NOTICE.txt
    └── THIRD_PARTY_LICENSES.txt
```

User settings (HTTP port only): `%LocalAppData%\NDIManager\settings.json`

## Uninstall

The uninstaller closes running `NDIManager.exe`, removes installed files, and removes shortcuts.

## Troubleshooting

### App shows “You must install or update .NET”

- The publish folder was not built **self-contained**. Re-run step 3 with `--self-contained true` and confirm `includedFrameworks` in `runtimeconfig.json`.

### App does not start

- Ensure no other `NDIManager.exe` instance is already running
- Verify local security/AV did not block executable launch

### Web UI not reachable

- Confirm app is running in tray
- Verify selected port is not occupied
- Open from tray menu to avoid URL/port mismatch
- Hard refresh browser: **Ctrl+F5**

### Installer compile fails

- Verify `ISCC.exe` path
- Verify `publish` folder exists and is up-to-date
- Verify `MAN_icon.ico` exists at repository root

---

**Copyright © 2026 Vizrt NDI AB**
