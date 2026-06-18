# NDI Manager 6.3

Windows (.NET 9) app that runs in the **system tray**, hosts an **ASP.NET Core** API, and ships a **Web UI** for NDI discovery and connection management (send/receive, visual flow with React Flow).

Repository: https://github.com/NDIConnected/ndi-utils-manager

## Requirements

- Windows x64  
- [.NET SDK 9](https://dotnet.microsoft.com/download)  
- **NDI SDK 6** installed, with the DLL at  
  `C:\Program Files\NDI\NDI 6 SDK\Bin\x64\Processing.NDI.Lib.x64.dll`  
  (as referenced by the project file)  
- Node.js to develop or rebuild the UI (see the `ndi-web-ui` folder)

## Development run

From the repository root:

```powershell
dotnet run
```

The app starts in the tray; use the tray menu to open the **Web UI** (default `http://localhost:5000`, port configurable from the menu).

## Web UI (frontend)

See the `ndi-web-ui` folder and [ndi-web-ui/README.md](ndi-web-ui/README.md).

```powershell
cd ndi-web-ui
npm install
npm run dev
```

In production the backend serves static files from `wwwroot/` (see below).

## Installer and release packaging

Full pipeline (frontend → `wwwroot` → publish → Inno Setup):  
[INSTALLER_README.md](INSTALLER_README.md).

## Further documentation

- [DOCS/USER_MANUAL.md](DOCS/USER_MANUAL.md) — **User manual** (installation, Web UI, connections, troubleshooting)
- [DOCS/](DOCS/) — implementation notes and guides  
- [CHANGELOG.md](CHANGELOG.md)

## Layout (simplified)

| Path | Contents |
|------|----------|
| `Controllers/`, `Services/` | API and NDI discovery |
| `ndi-web-ui/` | React + Vite |
| `wwwroot/` | Built UI served by the app (build output, not versioned) |
| `NDIManager-Setup.iss` | Inno Setup installer script |
