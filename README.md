# NDI Manager

[![CI](https://github.com/NDIConnected/ndi-utils-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/NDIConnected/ndi-utils-manager/actions/workflows/ci.yml)

> **Sample / reference software.** NDI Manager is an MIT-licensed community sample, **not officially supported** as a production product. The Web UI / API and NDI routing controls are intended for **trusted local networks**. See [SECURITY.md](SECURITY.md) before deploying on shared networks.

Windows (.NET 9) app that runs in the **system tray**, hosts an **ASP.NET Core** API, and ships a **Web UI** for NDI discovery and connection management (send/receive, visual flow with React Flow).

**Version:** 3.3  
**Platform:** Windows 10/11 x64  
**.NET:** 9.0 (self-contained installer)  
**Status:** Sample / R&D release  
**Repository:** [NDIConnected/ndi-utils-manager](https://github.com/NDIConnected/ndi-utils-manager)

## Requirements

- Windows 10/11 x64  
- **NDI SDK 6** runtime (`Processing.NDI.Lib.x64.dll`) — installed with NDI Tools/SDK; built and tested against **NDI SDK 6.4.0**  
- Node.js — only if you **rebuild** the Web UI from source  

The published installer bundles the .NET runtime. End users do **not** need to install .NET separately.

## Quick start (installed app)

1. Run **`NDIManager-v3.3-Setup.exe`** from `Output\` (after building the installer) or your release package.  
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

## What's new in 3.3 (summary)

- **Live signal on routes** — particles flow along each route, faster with the real throughput; cyan = video, green = audio.
- **Control-room tally** — red (program) / green (preview) breathing frame around cards.
- **Devices arriving / leaving** — new devices pop in; departed ones fade out with an `OFFLINE` badge. The canvas now clears when the last device leaves the network.
- **Visual refresh** — glass cards with role accents, navy canvas with pointer light, NDI favicon, card titles as `HOST (Stream)`, one-line minimized cards.
- **Reliability** — NDI SDK 6.4, UTF-8 names, serialized discovery loop, ordered snapshots, file logging, `stalled` health state.

See [CHANGELOG.md](CHANGELOG.md) for the full list.

## What's new in 3.2 (summary)

- **Align by host** — no more overlapping nodes on Bridge-heavy setups; devices grouped by IP with measured card heights.
- **Tighter canvas layout** — host columns sized dynamically instead of wide fixed slots.

See [CHANGELOG.md](CHANGELOG.md) for the full list.

## What's new in 3.1 (summary)

- **NDI Bridge hub** — republished outputs on bridge machines collapse into one node; direct SHQ sources show `→ Bridge` pairing.  
- **Legacy sender discovery** — NDI Finder sources for pre-6.x senders (connect-only, gray **LEGACY** badge).  
- **Canvas stability** — fixed cyclic flicker on Bridge-heavy networks.  
- **Per-device compact view**, **drag handle**, **instant connection lines**, **multi-host filter** (Ctrl+Click).  
- **Self-contained installer** — no separate .NET runtime on target PCs.

See [CHANGELOG.md](CHANGELOG.md) for the full list.

## Documentation

| Doc | Purpose |
|-----|---------|
| [SECURITY.md](SECURITY.md) | Sample notice, network trust model, vulnerability reporting |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Build, PRs, issue reporting |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Contributor Covenant |
| [CHANGELOG.md](CHANGELOG.md) | Release history |
| [DOCS/USER_MANUAL.md](DOCS/USER_MANUAL.md) | User manual |

## License

MIT License — Copyright (c) 2026 Vizrt NDI AB. See [LICENSE](LICENSE) (also in `Licenses/LICENSE`).

Third-party components are listed in [THIRD-PARTY-LICENSES.txt](THIRD-PARTY-LICENSES.txt). Web UI dependency notices are also under [ThirdPartyLicenses/THIRD_PARTY_NOTICES.txt](ThirdPartyLicenses/THIRD_PARTY_NOTICES.txt). When redistributing the NDI runtime DLL, also include [Processing.NDI.Lib.Licenses.txt](Processing.NDI.Lib.Licenses.txt). The NDI logo and NDI® trademark are **not** covered by MIT.

The installer shows [INSTALLER-NOTICE.txt](INSTALLER-NOTICE.txt) (NDI SDK runtime and trademark notice), then the MIT license. Installed copies include license files under `{app}` and `{app}\Licenses\`.

## Layout (simplified)

| Path | Contents |
|------|----------|
| `Controllers/`, `Services/` | API and NDI discovery |
| `ndi-web-ui/` | React + Vite |
| `wwwroot/` | Built UI served by the app (build output, not versioned) |
| `publish/` | Self-contained release output for the installer |
| `scripts/publish-standalone.ps1` | Publish helper (self-contained win-x64) |
| `NDIManager-Setup.iss` | Inno Setup installer script |
| `Licenses/` | MIT + third-party + NDI SDK notices |
