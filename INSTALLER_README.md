# NDI Manager 6.3 - Installer Build Instructions

## Version 1.0

## Overview

This document describes how to build the Windows installer for NDI Manager 6.3 using Inno Setup.

## Prerequisites

1. **Inno Setup 6.x** - Download from: https://jrsoftware.org/isdl.php
2. All project files must be built and ready:
   - Backend published to `./publish`
   - Frontend built to `./ndi-web-ui/dist` and copied to `./publish/wwwroot`
   - Third-party licenses in `./ThirdPartyLicenses`

## Build Process

The build process has already been completed:

1. **Backend Build**
   - Published as self-contained .NET 9.0 application
   - Includes Windows Service support via `Microsoft.Extensions.Hosting.WindowsServices`
   - Target: Windows x64
   - Output: `./publish` folder

2. **Frontend Build**
   - React + Vite production build
   - Output: `./ndi-web-ui/dist` (copied to `./publish/wwwroot`)

3. **Third-Party Licenses**
   - Collected in `./ThirdPartyLicenses/THIRD_PARTY_NOTICES.txt`
   - Includes: .NET Runtime, NDI SDK, React, React Flow, Axios, Vite

## Creating the Installer

### Step 1: Install Inno Setup
Download and install Inno Setup from: https://jrsoftware.org/isdl.php

### Step 2: Compile the Installer Script

1. Open **Inno Setup Compiler**
2. Open the file: `C:\TEMP\MANAGER-6.3\NDIManager-Setup.iss`
3. Click **Build** → **Compile** (or press F9)
4. The installer will be created in: `C:\TEMP\MANAGER-6.3\Output\NDIManager-v1.0-Setup.exe`

### Alternative: Command Line Compilation

```cmd
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" "C:\TEMP\MANAGER-6.3\NDIManager-Setup.iss"
```

## Installer Features

### License Agreements

The installer presents two license screens:

1. **Confidentiality Notice** (`License\internal-only.txt`)
   - Displayed after welcome screen
   - Must be acknowledged to continue
   - Contains Vizrt NDI AB confidentiality notice

2. **License Agreement** (`License\license.rtf`)
   - Standard license agreement screen
   - Must be accepted to continue

### Installation Features

- **Installation Directory**: Default to `C:\Program Files\NDI Manager`
- **Windows Service Installation**:
  - Service Name: `NDIManagerService`
  - Display Name: `NDI Manager 6.3 Service`
  - Startup Type: Automatic
  - Service starts automatically after installation
- **Third-Party Licenses**: Installed to `{InstallDir}\ThirdPartyLicenses`
- **Web UI Access**: Optionally opens `http://localhost:5000` after installation
- **Start Menu Shortcuts**:
  - Open NDI Manager Web UI
  - Uninstall NDI Manager

### File Structure

```
{InstallDir}\
├── NDIManager.exe                    (Main executable)
├── Processing.NDI.Lib.x64.dll
├── wwwroot\                          (Web UI files)
│   ├── index.html
│   └── assets\
├── ThirdPartyLicenses\
│   └── THIRD_PARTY_NOTICES.txt
└── License\
    ├── internal-only.txt
    └── license.rtf
```

## Uninstallation

The uninstaller:
1. Stops the NDI Manager Windows Service
2. Removes the service registration
3. Deletes all application files
4. Removes Start Menu shortcuts

## Service Management

### Manual Service Control

Start service:
```cmd
sc start NDIManagerService
```

Stop service:
```cmd
sc stop NDIManagerService
```

Check service status:
```cmd
sc query NDIManagerService
```

### Service Configuration

- **Binary Path**: `{InstallDir}\NDIManager.exe`
- **Startup Type**: Automatic
- **Service Account**: Local System
- **Description**: NDI Manager 6.3 - Manages NDI senders and receivers

## Web Interface Access

After installation, the web interface is available at:
- **URL**: http://localhost:5000
- **REST API**: http://localhost:5000/api/ndi
- **Swagger UI**: http://localhost:5000/swagger (development mode only)

## Troubleshooting

### Service Won't Start

1. Check Windows Event Viewer for errors
2. Verify NDI SDK is installed on the target machine
3. Ensure port 5000 is not in use by another application

### Web UI Not Accessible

1. Verify service is running: `sc query NDIManagerService`
2. Check firewall settings for port 5000
3. Try accessing from browser: http://localhost:5000

### Installation Fails

1. Run installer as Administrator
2. Ensure no previous version is running
3. Check Windows Event Log for installation errors

## Development Notes

### Rebuilding After Code Changes

1. Build frontend:
   ```cmd
   cd ndi-web-ui
   npm run build
   ```

2. Publish backend:
   ```cmd
   dotnet publish NDIManager.csproj -c Release -r win-x64 --self-contained true -o ./publish
   ```

3. Copy frontend to publish:
   ```cmd
   xcopy /E /Y ndi-web-ui\dist\* publish\wwwroot\
   ```

4. Recompile installer with Inno Setup

## Support

For issues or questions regarding the installer, please contact the Vizrt NDI AB development team.

---

**Copyright © 2025 Vizrt NDI AB**
