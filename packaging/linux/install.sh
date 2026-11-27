#!/usr/bin/env bash
# Installs NDI Manager from the .tar.gz (for distributions without .deb support).
#   sudo ./install.sh              app in /opt/ndi-manager, systemd service enabled and started, tray autostart
#   sudo ./install.sh --no-service app + desktop entry only (run `ndi-manager` from the desktop)
#   sudo ./install.sh --uninstall
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo ./install.sh)" >&2; exit 1; }

has_systemd() { command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; }

if [ "${1:-}" = "--uninstall" ]; then
  if has_systemd; then
    systemctl disable --now ndi-manager.service 2>/dev/null || true
  fi
  rm -f /etc/systemd/system/ndi-manager.service /usr/bin/ndi-manager \
        /usr/share/applications/ndi-manager.desktop /etc/xdg/autostart/ndi-manager.desktop \
        /usr/share/icons/hicolor/256x256/apps/ndi-manager.png
  rm -rf /opt/ndi-manager
  has_systemd && systemctl daemon-reload || true
  echo "NDI Manager removed (data kept in /var/lib/ndi-manager and ~/.local/share/NDIManager)."
  exit 0
fi

rm -rf /opt/ndi-manager
cp -r "$HERE/ndi-manager" /opt/ndi-manager
chmod 755 /opt/ndi-manager/ndi-manager
ln -sf /opt/ndi-manager/ndi-manager /usr/bin/ndi-manager
install -Dm 644 "$HERE/extras/ndi-manager.desktop" /usr/share/applications/ndi-manager.desktop
install -Dm 644 "$HERE/extras/ndi-manager.png" /usr/share/icons/hicolor/256x256/apps/ndi-manager.png

if [ "${1:-}" != "--no-service" ] && has_systemd; then
  if ! getent passwd ndi-manager >/dev/null; then
    useradd --system --home-dir /var/lib/ndi-manager --no-create-home --shell /usr/sbin/nologin ndi-manager
  fi
  mkdir -p /var/lib/ndi-manager
  chown ndi-manager:ndi-manager /var/lib/ndi-manager
  install -Dm 644 "$HERE/extras/ndi-manager.service" /etc/systemd/system/ndi-manager.service
  install -Dm 644 "$HERE/extras/ndi-manager-autostart.desktop" /etc/xdg/autostart/ndi-manager.desktop
  systemctl daemon-reload
  systemctl enable --now ndi-manager.service
  echo "Service started: http://localhost:5000 (systemctl status ndi-manager)"
fi

/opt/ndi-manager/ndi-manager --check-ndi || true
echo "NDI Manager installed in /opt/ndi-manager."
