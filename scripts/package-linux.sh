#!/usr/bin/env bash
# Builds the Linux x86_64 release of NDI Manager:
#   dist/linux/ndi-manager_<version>_amd64.deb
#   dist/linux/ndi-manager-<version>-linux-x64.tar.gz
#
# Requirements: bash, node/npm, .NET 9 SDK, dpkg-deb (Debian/Ubuntu; skip with NO_DEB=1), tar.
# Optional:
#   NDI_LINUX_LIB=/path/to/libndi.so.6   bundle the NDI runtime in the package (check the NDI SDK license first)
#   DEB_MAINTAINER="Name <email>"         Maintainer field of the .deb
#   SKIP_WEB_BUILD=1                      reuse an existing wwwroot/
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

VERSION="$(sed -n 's:.*<Version>\(.*\)</Version>.*:\1:p' NDIManager.Linux/NDIManager.Linux.csproj | head -n1)"
[ -n "$VERSION" ] || { echo "Cannot read <Version> from NDIManager.Linux.csproj" >&2; exit 1; }
MAINTAINER="${DEB_MAINTAINER:-NDI Manager Maintainers <maintainers@ndi-manager.invalid>}"
OUT="$REPO_ROOT/dist/linux"
WORK="$REPO_ROOT/build/linux"
APP="$WORK/app"

echo "==> NDI Manager $VERSION for linux-x64"
rm -rf "$WORK"
mkdir -p "$OUT" "$APP"

if [ "${SKIP_WEB_BUILD:-0}" != "1" ]; then
  echo "==> Building Web UI"
  (cd ndi-web-ui && npm ci --no-audit --no-fund && npm run build)
  rm -rf wwwroot
  mkdir -p wwwroot
  cp -r ndi-web-ui/dist/. wwwroot/
fi
[ -f wwwroot/index.html ] || { echo "wwwroot/index.html missing (build the Web UI first)" >&2; exit 1; }

echo "==> Publishing self-contained linux-x64"
dotnet publish NDIManager.Linux/NDIManager.Linux.csproj -c Release -r linux-x64 --self-contained true \
  -p:DebugType=none -o "$APP"
chmod 755 "$APP/ndi-manager"

if [ -n "${NDI_LINUX_LIB:-}" ]; then
  echo "==> Bundling NDI runtime from $NDI_LINUX_LIB"
  cp -L "$NDI_LINUX_LIB" "$APP/libndi.so.6"
fi

cp LICENSE "$APP/LICENSE.txt"
[ -f THIRD-PARTY-LICENSES.txt ] && cp THIRD-PARTY-LICENSES.txt "$APP/"

# ---- .tar.gz: app folder + extras + install.sh ---------------------------------------------------
TAR_NAME="ndi-manager-$VERSION-linux-x64"
TAR_DIR="$WORK/$TAR_NAME"
mkdir -p "$TAR_DIR/extras"
cp -r "$APP" "$TAR_DIR/ndi-manager"
cp packaging/linux/ndi-manager.service packaging/linux/ndi-manager.desktop \
   packaging/linux/ndi-manager-autostart.desktop "$TAR_DIR/extras/"
cp NDIManager.Linux/Assets/ndi-manager-256.png "$TAR_DIR/extras/ndi-manager.png"
cp packaging/linux/install.sh "$TAR_DIR/install.sh"
chmod 755 "$TAR_DIR/install.sh"
tar -C "$WORK" -czf "$OUT/$TAR_NAME.tar.gz" "$TAR_NAME"
echo "    $OUT/$TAR_NAME.tar.gz"

# ---- .deb ------------------------------------------------------------------------------------------
if [ "${NO_DEB:-0}" = "1" ]; then
  echo "==> Skipping .deb (NO_DEB=1)"
  exit 0
fi
command -v dpkg-deb >/dev/null || { echo "dpkg-deb not found (set NO_DEB=1 to build only the tarball)" >&2; exit 1; }

ROOT="$WORK/deb"
mkdir -p "$ROOT/DEBIAN" "$ROOT/opt" "$ROOT/usr/bin" "$ROOT/lib/systemd/system" \
         "$ROOT/usr/share/applications" "$ROOT/etc/xdg/autostart" \
         "$ROOT/usr/share/icons/hicolor/256x256/apps" "$ROOT/usr/share/doc/ndi-manager"
cp -r "$APP" "$ROOT/opt/ndi-manager"
ln -s /opt/ndi-manager/ndi-manager "$ROOT/usr/bin/ndi-manager"
install -m 644 packaging/linux/ndi-manager.service "$ROOT/lib/systemd/system/ndi-manager.service"
install -m 644 packaging/linux/ndi-manager.desktop "$ROOT/usr/share/applications/ndi-manager.desktop"
install -m 644 packaging/linux/ndi-manager-autostart.desktop "$ROOT/etc/xdg/autostart/ndi-manager.desktop"
install -m 644 NDIManager.Linux/Assets/ndi-manager-256.png "$ROOT/usr/share/icons/hicolor/256x256/apps/ndi-manager.png"
install -m 644 LICENSE "$ROOT/usr/share/doc/ndi-manager/copyright"
for script in postinst prerm postrm; do
  install -m 755 "packaging/linux/debian/$script" "$ROOT/DEBIAN/$script"
done

INSTALLED_KB="$(du -sk "$ROOT" | cut -f1)"
cat > "$ROOT/DEBIAN/control" <<EOF
Package: ndi-manager
Version: $VERSION
Section: video
Priority: optional
Architecture: amd64
Maintainer: $MAINTAINER
Installed-Size: $INSTALLED_KB
Depends: libc6 (>= 2.31), libgcc-s1, libstdc++6, zlib1g, adduser
Recommends: avahi-daemon, xdg-utils, libx11-6, libice6, libsm6, libfontconfig1
Homepage: https://github.com/NDIConnected/ndi-utils-manager
Description: NDI discovery and routing manager with a Web UI
 Discovers NDI senders and receivers through the NDI Discovery Server and
 routes them from a browser-based canvas. Runs as a systemd service
 (ndi-manager.service, Web UI on port 5000) with an optional tray icon.
 Requires the NDI 6 runtime (libndi.so.6) from the NDI SDK for Linux.
EOF

DEB="$OUT/ndi-manager_${VERSION}_amd64.deb"
dpkg-deb --build --root-owner-group "$ROOT" "$DEB" >/dev/null
echo "    $DEB"
