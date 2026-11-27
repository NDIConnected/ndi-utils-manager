# NDI Manager on Linux

NDI Manager for Linux (x86_64) is the same server and Web UI as the Windows app, packaged as:

- **`ndi-manager.service`** — systemd service that serves the Web UI (default `http://<host>:5000`) and runs NDI discovery.
- **Tray icon** — `ndi-manager` started in a desktop session. When the service already answers on the configured port the tray is a *client* (status, Open Web UI, data folder); otherwise it runs the server itself, like on Windows.

Packages (from the GitHub release or the CI artifact `ndi-manager-linux-x64`):

| File | For |
|---|---|
| `ndi-manager_<version>_amd64.deb` | Debian, Ubuntu, Mint, Pop!_OS … |
| `ndi-manager-<version>-linux-x64.tar.gz` | other distributions (`install.sh`) |

Both are self-contained: no .NET install needed.

## 1. NDI runtime (required)

The packages do **not** include the NDI library. Install the **NDI 6 SDK for Linux** (`Install_NDI_SDK_v6_Linux.tar.gz` from [ndi.video](https://ndi.video/for-developers/ndi-sdk/)) and copy the runtime to the system library path:

```bash
tar xzf Install_NDI_SDK_v6_Linux.tar.gz && ./Install_NDI_SDK_v6_Linux.sh   # accept the license
sudo cp -P "NDI SDK for Linux/lib/x86_64-linux-gnu/"libndi.so.6* /usr/local/lib/
sudo ldconfig
```

Alternatively set `NDI_RUNTIME_DIR_V6` to the folder containing `libndi.so.6`.
Check with:

```bash
ndi-manager --check-ndi
```

mDNS discovery (sources without a Discovery Server, legacy senders) needs **avahi-daemon** running.

## 2. Install

**Debian / Ubuntu**

```bash
sudo apt install ./ndi-manager_3.3.0_amd64.deb
```

This installs the app in `/opt/ndi-manager`, creates the system user `ndi-manager`, enables and starts `ndi-manager.service`, and adds the tray icon to the autostart of desktop sessions.

**Other distributions**

```bash
tar xzf ndi-manager-3.3.0-linux-x64.tar.gz
cd ndi-manager-3.3.0-linux-x64
sudo ./install.sh              # service + tray autostart
sudo ./install.sh --no-service # app + menu entry only
sudo ./install.sh --uninstall
```

## 3. Configure

| What | Where |
|---|---|
| Discovery Server, NDI groups (service) | `/var/lib/ndi-manager/.ndi/ndi-config.v1.json` (the service's `$HOME`) |
| Web port (service) | `/var/lib/ndi-manager/settings.json` (`{"Port": 5000}`) or `Environment=NDIMANAGER_PORT=…` in `sudo systemctl edit ndi-manager` |
| Logs (service) | `journalctl -u ndi-manager` and `/var/lib/ndi-manager/logs/` |
| Tray / desktop mode settings and logs | `~/.local/share/NDIManager/` |
| NDI config (desktop mode) | `~/.ndi/ndi-config.v1.json` |

Example `ndi-config.v1.json` with a Discovery Server:

```json
{ "ndi": { "networks": { "discovery": "192.168.15.120" } } }
```

After changing configuration: `sudo systemctl restart ndi-manager`.

The tray finds the service on the port in its own settings (`~/.local/share/NDIManager/settings.json`, default 5000). If you change the service port, start the tray with `ndi-manager --port <n>` or set the same port there.

## 4. Tray icon

- KDE Plasma, XFCE, Cinnamon, MATE, Budgie: works out of the box.
- GNOME: needs the **AppIndicator** extension (preinstalled on Ubuntu; elsewhere install `gnome-shell-extension-appindicator`).
- The icon color shows the discovery health: green OK, yellow waiting/partial, red error/stalled.

## 5. Command line

```text
ndi-manager                 tray icon (+ server unless the service is running)
ndi-manager --service       headless server (what systemd runs)
ndi-manager --port <n>      web port
ndi-manager --check-ndi     is the NDI runtime found? which version?
ndi-manager --version
```

## 6. Build from source

On Linux with Node.js and the .NET 9 SDK:

```bash
./scripts/package-linux.sh            # → dist/linux/*.deb and *.tar.gz
NO_DEB=1 ./scripts/package-linux.sh   # tarball only
```
