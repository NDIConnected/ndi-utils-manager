# NDI Manager

Windows (.NET 9) app that runs in the **system tray**, hosts an **ASP.NET Core** API, and ships a **Web UI** for NDI discovery and connection management (send/receive, visual flow with React Flow).

**Current release:** version **3.1** — self-contained installer, no separate .NET runtime required.

Repository: https://github.com/NDIConnected/ndi-utils-manager

## Requirements

- Windows 10/11 x64  
- **NDI SDK 6** runtime (`Processing.NDI.Lib.x64.dll`) — installed with NDI Tools/SDK  
- Node.js — only if you **rebuild** the Web UI from source  

The published installer bundles the .NET runtime. End users do **not** need to install .NET separately.

## Quick start (installed app)

1. Run **`NDIManager-v3.1-Setup.exe`** from `Output\` (after building the installer) or your release package.  
2. Use the **system tray** icon → **Open Web UI** (default `http://localhost:5000`).  
3. Drag connections on the **Canvas** tab; use **Table** for a receiver list.

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

```powershell
.\scripts\publish-standalone.ps1
npm run build --prefix ndi-web-ui
# then copy dist to wwwroot if not using the script's full pipeline
dotnet publish -c Release -r win-x64 --self-contained true -o .\publish
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" ".\NDIManager-Setup.iss"
```

Details: [INSTALLER_README.md](INSTALLER_README.md).

## What's new in 3.1 (summary)

- **NDI Bridge hub** — republished outputs on bridge machines collapse into one node; direct SHQ sources show `→ Bridge` pairing.  
- **Legacy sender discovery** — NDI Finder sources for pre-6.x senders (connect-only, gray **LEGACY** badge).  
- **Canvas stability** — fixed cyclic flicker on Bridge-heavy networks.  
- **Per-device compact view**, **drag handle**, **instant connection lines**, **multi-host filter** (Ctrl+Click).  
- **Self-contained installer** — no separate .NET runtime on target PCs.

See [CHANGELOG.md](CHANGELOG.md) for the full list.

## License

Application source code is licensed under the [MIT License](License/LICENSE) (Copyright © 2026 Vizrt NDI AB), same as [NDI GPIO Panel](https://github.com/NDIConnected/ndi-gpio).

The installer shows [INSTALLER-NOTICE.txt](INSTALLER-NOTICE.txt) (NDI SDK runtime and trademark notice), then the MIT license. Installed copies are placed under `{app}\Licenses\` together with [License/THIRD_PARTY_LICENSES.txt](License/THIRD_PARTY_LICENSES.txt) and [ThirdPartyLicenses/THIRD_PARTY_NOTICES.txt](ThirdPartyLicenses/THIRD_PARTY_NOTICES.txt).

The bundled `Processing.NDI.Lib.x64.dll` is **not** covered by MIT; it is subject to the NDI SDK license from Vizrt NDI AB.

## Further documentation

- [DOCS/USER_MANUAL.md](DOCS/USER_MANUAL.md) — **User manual** (installation, Web UI, NDI Bridge hub, legacy senders, connections, troubleshooting)
- [DOCS/](DOCS/) — implementation notes and guides  
- [CHANGELOG.md](CHANGELOG.md)

## Layout (simplified)

| Path | Contents |
|------|----------|
| `Controllers/`, `Services/` | API and NDI discovery |
| `ndi-web-ui/` | React + Vite |
| `wwwroot/` | Built UI served by the app (build output, not versioned) |
| `publish/` | Self-contained release output for the installer |
| `scripts/publish-standalone.ps1` | Publish helper (self-contained win-x64) |
| `NDIManager-Setup.iss` | Inno Setup installer script |
