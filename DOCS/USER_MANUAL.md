# NDI Manager — User Manual

**Version 3.3** · November 2026

NDI Manager is a Windows desktop application that discovers NDI senders and receivers on your network, shows them on a visual canvas, and lets you connect receiver inputs to sender outputs through the NDI Discovery Server.

This manual describes day-to-day use of the installed application and Web UI. For build and packaging instructions, see [INSTALLER_README.md](../INSTALLER_README.md).

---

## Table of contents

1. [Overview](#1-overview)
2. [Requirements](#2-requirements)
3. [Installation](#3-installation)
4. [System tray application](#4-system-tray-application)
5. [Web UI — getting started](#5-web-ui--getting-started)
6. [Canvas view](#6-canvas-view)
   - [NDI Bridge hub](#ndi-bridge-hub)
   - [Legacy senders](#legacy-senders)
7. [Managing connections](#7-managing-connections)
8. [Hosts sidebar](#8-hosts-sidebar)
9. [Filters and search](#9-filters-and-search)
10. [Table view](#10-table-view)
11. [Node details and statistics](#11-node-details-and-statistics)
12. [Layout tools](#12-layout-tools)
13. [Configuration](#13-configuration)
    - [NDI Bridge hosts](#ndi-bridge-hosts)
14. [Troubleshooting](#14-troubleshooting)
15. [Glossary](#15-glossary)

---

## 1. Overview

NDI Manager runs in the **Windows system tray**. It hosts a local web server and opens a browser-based control panel where you can:

- See **sender** devices (outputs) on the left and **receiver** devices (inputs) on the right
- **Drag connections** from a sender output to a receiver input
- Monitor **video/audio statistics**, **tally**, and **dropped frames** (on NDI 6 Discovery Server sources)
- Route to **legacy** (pre-NDI 6) senders discovered via NDI Finder — connect-only, no live metrics
- Work with **NDI Bridge** republished outputs grouped in a single hub node per bridge machine
- Work on large installations using **host grouping**, **filters**, and a **table view**

Connections are sent as NDI Discovery Server commands (`CONNECT` / `DISCONNECT`). The canvas reflects the real network state reported by NDI, not just local UI state.

---

## 2. Requirements

| Component | Requirement |
|-----------|-------------|
| Operating system | Windows 10/11 x64 |
| .NET runtime | **Not required** — bundled in the installer (self-contained) |
| NDI | NDI SDK 6 runtime (`Processing.NDI.Lib.x64.dll`), tested with 6.4.0 |
| Network | NDI Discovery Server reachable from this PC (for remote monitoring and connect commands) |
| Browser | Modern browser (Chrome, Edge, Firefox) for the Web UI |
| Permissions | Administrator rights to install; standard user can run after install |

The application listens on **localhost** by default (port **5000**). Other machines on the LAN can reach it if Windows Firewall allows inbound traffic on the chosen port.

---

## 3. Installation

1. Run **`NDIManager-v3.1-Setup.exe`** (or the current installer from your release package).
2. Follow the wizard. Optional steps:
   - Create a **desktop shortcut**
   - **Start with Windows** (auto-launch at login)
3. When installation completes, NDI Manager starts in the tray and may open the Web UI automatically.

**Install location (default):** `C:\Program Files\NDI Manager`

**Uninstall:** Windows Settings → Apps → NDI Manager, or the uninstall shortcut in the Start Menu. The uninstaller closes any running instance before removing files.

---

## 4. System tray application

After launch, look for the **NDI Manager** icon in the notification area (system tray).

### Tray icon colours

| Colour | Meaning |
|--------|---------|
| **Green** | Discovery listeners OK and NDI devices visible |
| **Yellow** | Server running but no NDI devices, or partial listener connection |
| **Red** | Error — listeners or SDK not healthy |

### Tray menu

Right-click the tray icon:

| Menu item | Action |
|-----------|--------|
| **Open Web UI** | Opens `http://localhost:<port>` in your default browser |
| **Status** | Shows sender/receiver counts and health summary |
| **Discovery Server** | Shows send/recv listener status and configured Discovery Server URL |
| **Port** | Change the HTTP port (requires service restart) |
| **Restart service** | Restarts the embedded web server without closing the app |
| **Open data folder** | Opens `%LocalAppData%\NDIManager` (settings, logs) |
| **Exit** | Stops the application |

**Double-click** the tray icon to open the Web UI (same as **Open Web UI**).

### Data folder

**Open data folder** opens `%LocalAppData%\NDIManager`. This stores **`settings.json`** (HTTP port only) and the **`logs\`** folder: one file per day (`ndimanager-yyyyMMdd.log`, last 7 days kept) with startup, Discovery Server listener state, receiver routing changes, warnings and errors. Canvas layout, filters, and compact-view preferences are stored in the **browser** (`localStorage`), not in this folder.

---

## 5. Web UI — getting started

Open the Web UI from the tray menu or navigate to:

```text
http://localhost:5000
```

(Replace `5000` with your configured port.)

### Header

- **Title** — NDI Manager
- **Subtitle** — current host filter, or a hint to select a host from the sidebar
- **Discovery pill** — e.g. `Discovery OK · 12 snd · 8 rcv`
  - Hover to see the Discovery Server URL
  - **Discovery partial** means one listener (send or recv) is not connected
- **Tabs** — Canvas | Table
- **Refresh** — force an immediate data refresh

### Footer

- **Version** — e.g. `v3.1.0`
- **Last update time** — when discovery last ran
- **Bundle hash** — identifies the built Web UI file (useful to confirm the browser is not showing a cached old version)

After an update, press **Ctrl+F5** in the browser for a hard refresh if the footer hash does not match the new build.

### Toast messages

Connect, disconnect, and layout actions show short **toast notifications** at the bottom-right instead of blocking dialog boxes. Errors appear in red; success in green.

---

## 6. Canvas view

The **Canvas** tab shows an interactive diagram:

- **Sender nodes** (green) on the left — NDI outputs monitored via the Discovery Server
- **Bridge hub nodes** (orange) on the left — NDI Bridge republished outputs, grouped per bridge machine
- **Legacy sender nodes** (gray) on the left — pre-NDI 6 / Finder-only sources (connect-only)
- **Receiver nodes** (blue) on the right — NDI inputs
- **Edges** (lines) — active or pending connections between channels

### Aggregated devices

Each node represents one **application instance** on a machine (e.g. vMix, OBS, an intercom system). Devices with many channels show:

- A **channel count** badge
- **Collapsible** output/input rows — click **expand** to see all connectors
- On large devices (16+ channels), only active or connected channels may show until expanded

### Compact vs detailed view

Click the device **name** (shown with a dotted underline) to toggle **compact** ↔ **detailed** for that device only. The choice is remembered per device in the browser.

- **Compact** — small card: header, name, address, one connector (multi-channel devices use a stacked handle)
- **Detailed** — full channel list, statistics, and expand/collapse controls

### Moving nodes

Drag a node by its **header bar** (`SENDER DEVICE` / `RECEIVER DEVICE` — cursor changes to **grab**). Other areas (name, channels, stats) are for clicks, not dragging.

Drag nodes to rearrange; positions are **saved automatically** in the browser.

### Canvas controls

Use the built-in React Flow controls (bottom-left):

- **Zoom** in/out
- **Fit view** — frame all nodes
- **Mini-map** — overview of large topologies

### Toolbar (Canvas tab)

| Control | Description |
|---------|-------------|
| **Show hosts / Canvas only** | Toggle the host sidebar: hide it for more canvas space, or show it again to pick a host |
| **Active only** | Hide devices with no streaming or connections |
| **ℹ️** | Open the metrics legend |
| **Reset layout** | Restore default node positions |
| **Align by host** | Arrange senders/receivers in columns per machine |
| **Save preset / Load preset** | Save or restore layout and filters for the selected host (see [Layout tools](#13-layout-tools)) |
| **Disconnect host** | Disconnect all receivers on the focused host |

### NDI Bridge hub

When a machine runs **NDI Bridge** (Local Mode or similar) and republishes many transcoded outputs (e.g. H.264/H.265), NDI Manager **collapses** those outputs into **one orange hub node** per bridge host instead of dozens of separate sender cards.

| Visual cue | Meaning |
|------------|---------|
| **Orange** border and gradient | NDI Bridge hub device |
| **BRIDGE** badge in the header | Hub node (not a normal green sender) |
| **Upstream label** on each output row | Original source name before transcoding (e.g. the SpeeHQ path name) |
| **Codec badge** (e.g. H264, H265) | Transcoded format on that bridge output |
| Banner *Transcoded outputs — drag to connect H.264/H.265 paths* | Use these connectors for bandwidth-friendly paths |

**Collapsed by default:** if the hub has more than one output, it starts **collapsed** (like large multichannel devices). Click **expand** on the node to show all bridge outputs. Compact view still works via the device name toggle.

**Upstream pairing:** when the same logical source exists both as a **direct SHQ** sender (green) and as a **bridge republish** (orange hub), the direct sender shows:

- A blue **→ Bridge** badge on the matching output row
- An info banner: *Bridge transcoded mirror available (connect via NDI Bridge hub)*

This helps you choose **direct high-quality** vs **transcoded bridge** paths without hunting through duplicate names.

**Typical workflow (mix):** receivers on the same machine may connect to **both** the direct SHQ sender and the matching bridge output — NDI Manager shows both connections. Use the bridge hub when you need H.264/H.265; use the direct sender for full-quality SHQ.

**Auto-detection:** hosts whose name contains `bridge` (case-insensitive), e.g. `7010-01-BRIDGE`, are treated as bridge machines automatically. You can also list bridge hosts explicitly in configuration (see [NDI Bridge hosts](#ndi-bridge-hosts)).

### Legacy senders

Some senders are not registered on the NDI Discovery Server (common with **pre-NDI 6** applications or sources that only appear on the network via **NDI Finder**). NDI Manager merges these into the canvas for **routing only**.

| Visual cue | Meaning |
|------------|---------|
| **Gray** border | Legacy / Finder-only source |
| **LEGACY** badge in the header | Not monitored via Discovery Server Send Listener |
| Banner *Legacy source — connect only (no SDK monitoring)* | Connect and disconnect work; live stats do not |

**What works on legacy senders:**

- Appear on the canvas and in filters (by name, address, stream label)
- **Drag to connect** receivers to the legacy output — same as normal senders
- **Disconnect** via edge select/delete

**What does not work on legacy senders:**

- Connected RX, Active ch, dropped frames, codec/resolution summaries
- Video / Audio / Metadata expandable statistics
- Tally PGM / PVW
- Channel detail drawer shows limited fields (no live monitoring events)

Legacy sources are **deduplicated by NDI name**: if the same source later appears on the Discovery Server, the monitored (green) entry takes precedence and legacy duplicate is not shown separately.

---

## 7. Managing connections

### Connect

1. Locate the **sender output** row (e.g. `Output 01`) on a sender node.
2. Drag from the **connector** (circle on the right edge) to the **receiver input** connector (circle on the left edge).
3. While dragging, a tooltip shows the **NDI source name** that will be used.
4. Release on the target input. A toast confirms the connect command was sent.

### Connection edge colours

| Appearance | Meaning |
|------------|---------|
| **Dashed yellow** | Connect **pending** NDI confirmation (line is still selectable) |
| **Solid green**, animated | Connection **confirmed** by NDI (`source-name` matches on the receiver) |

**Click** a connection line to **select** it, then click the **×** button to disconnect. Lines appear immediately after you connect; you do not need to wait for the line to turn green.

### Disconnect

**Method 1 — Delete edge:** Select the connection line, then click the **×** button on the edge.

**Method 2 — Drag away:** Drag an edge endpoint to empty space and release (reconnect cancelled = disconnect).

**Method 3 — Table view:** Use the **Disconnect** button on a receiver row.

**Method 4 — Bulk:** With a host selected, click **Disconnect host** in the toolbar.

### Reconnect

Drag an existing edge endpoint to a **different** input or output. NDI Manager disconnects the old receiver (if needed) and connects the new one.

---

## 8. Hosts sidebar

On large networks, use the **Hosts** panel (left side) to group devices by **machine name** (e.g. `VECTAR-PLUS`, `HP-PRODESK`).

| Action | Effect |
|--------|--------|
| **All hosts** | Show every machine (no filter) |
| **Click** a host | Show only that machine on the canvas and in the table |
| **Ctrl+Click** a host | Add or remove that machine from the selection (combine several hosts, e.g. HOST 01 + HOST 02) |

Each host row shows channel counts, streaming activity, and link counts. Selected hosts are highlighted in the sidebar.

When **one** host is selected:

- The header subtitle shows `Host: <name>`
- **Save preset / Load preset** and **Disconnect host** become available

When **several** hosts are selected:

- The header shows `Hosts: <name1>, <name2>, …`
- Canvas and table include devices from all selected machines
- **Save preset / Load preset** and **Disconnect host** require exactly one host (select a single host for those actions)

---

## 9. Filters and search

Two filter boxes in the header narrow visible devices:

| Field | Filters |
|-------|---------|
| **Sender filter** | Sender devices and their channels |
| **Receiver filter** | Receiver devices and their channels |

### Query syntax

| Syntax | Meaning | Example |
|--------|---------|---------|
| `term` | Contains text | `vMix` |
| `a\|b` | OR — either term | `SHQ7\|SHQ2` |
| `a,b` | AND — both groups | `Intercom,192.168.1.10` |
| `*` | Any characters | `HP-*` |
| `?` | Single character | `Out?1` |

Filters apply to application name, address, stream labels, codec summaries, and related text. Connections are hidden if either end of the link is filtered out.

---

## 10. Table view

The **Table** tab lists all **receiver channels** in a sortable grid:

| Column | Description |
|--------|-------------|
| Host | Machine name |
| Device | Application / display name |
| Channel | Input label |
| Source | Current NDI source name |
| Video / Audio | Codecs |
| Streaming | Yes / No |
| RX | Connection count |
| Actions | **Disconnect** button |

Click a column header to sort. Click a row to open the **channel detail drawer** on the right.

⚠️ icons mark channels with warnings (dropped frames, connected without source, etc.).

---

## 11. Node details and statistics

### Sender node summary

Normal (green) senders show full monitoring. **Bridge hub** (orange) and **legacy** (gray) senders follow the rules in [NDI Bridge hub](#ndi-bridge-hub) and [Legacy senders](#legacy-senders).

| Field | Description |
|-------|-------------|
| **Connected RX** | Number of NDI receivers listening to this sender (click to focus connections) — *not shown on legacy senders* |
| **Active ch** | Channels currently streaming — *not shown on legacy senders* |
| **Dropped frames** | Cumulative dropped frames (red if &gt; 0) — *not shown on legacy senders* |
| **Video / Audio / Res/FPS / Ports** | Aggregated technical summaries — *bridge hub: per-output when expanded; legacy: unavailable* |
| **Monitoring** | *Legacy:* “Unavailable (pre-NDI 6 sender)” · *Bridge hub:* “Per-output (transcoded)” |

Sender **colour** on outputs may indicate connection type:

| Colour | Meaning |
|--------|---------|
| Green | Full video+audio receivers only |
| Orange | Audio-only receivers |
| Purple | Mixed full and audio-only receivers |
| Gray | No active connections |

**Bridge hub** outputs use **upstream labels** (original source name) instead of generic `Output 01` numbering when available.

**→ Bridge** on a direct sender output indicates a matching transcoded path on the bridge hub for the same upstream source.

**PGM / PVW** badges show NDI tally state (not available on legacy senders).

### Receiver node summary

| Field | Description |
|-------|-------------|
| **Connected** | Channels with an active NDI connection |
| **Streaming** | Channels actually receiving media |
| **Dropped frames** | Per-device total (red if &gt; 0) |

Input rows show the current **source** name (`→ source`) when connected.

### Expandable statistics

Click **Video**, **Audio**, or **Metadata** sections on a node to expand per-channel statistics:

- Codecs, resolution, frame rate
- Frames/bytes sent (senders) or receive mode (receivers)
- **Dropped frames** per channel
- Colour metadata (senders)

### Channel detail drawer

Click any **input** or **output** row (or a table row) to open the drawer on the right with full channel properties: UUID, source, codecs, streaming state, dropped frames, address, etc.

For **bridge** outputs, the drawer may show upstream label and bridge mirror hints. For **legacy** senders, monitoring fields are empty or marked unavailable.

### Metrics legend

Press **ℹ️** in the toolbar to open a short explanation of Connected RX, Active ch, Streaming, and edge colours.

---

## 12. Layout tools

### Reset layout

Clears custom positions and returns nodes to the default left/right grid.

### Align by host

Groups devices by machine into vertical columns — useful after adding many nodes or when the canvas becomes cluttered. Devices on the same IP address stay in one column (e.g. Bridge hub and Studio Monitor on the same host). Card heights are measured after render so expanded Bridge hubs and multi-channel senders do not overlap.

If one or more **hosts are selected**, alignment applies to the filtered devices only. After upgrading, use **Reset layout** then **Align by host** once if nodes appear misaligned.

### Host presets

With a host selected in the sidebar:

1. Arrange nodes and set filters as desired.
2. Click **Save preset** — stored in the browser (`localStorage`).
3. Click **Load preset** on a later session to restore layout and filters for that host.

Presets are **per browser / per PC**, not shared across users.

---

## 13. Configuration

### HTTP port

1. Right-click tray icon → **Port**
2. Enter a new port (1024–65535)
3. The service restarts automatically

Setting is stored in:

```text
%LocalAppData%\NDIManager\settings.json
```

### NDI Discovery Server URL

By default NDI Manager uses the SDK default Discovery Server. To point at a specific server, set **one** of:

| Method | Example |
|--------|---------|
| Environment variable | `NDI_DISCOVERY_SERVER=192.168.1.10:5959` |
| `appsettings.json` (next to exe) | `"Ndi": { "DiscoveryServer": "192.168.1.10:5959" }` |

Restart the application after changing the Discovery Server URL.

The tray menu **Discovery Server** line and the Web UI discovery pill tooltip show the active URL.

### NDI Bridge hosts

Bridge hub grouping applies to senders on machines identified as **NDI Bridge** hosts. By default, any hostname containing `bridge` (case-insensitive) is detected automatically — e.g. `7010-01-BRIDGE`.

To force or extend the list (e.g. bridge machine without “bridge” in its hostname), set **one** of:

| Method | Example |
|--------|---------|
| Environment variable | `NDI_BRIDGE_HOSTS=7010-01-BRIDGE,192.168.1.50` |
| `appsettings.json` (next to exe) | `"Ndi": { "BridgeHosts": [ "7010-01-BRIDGE" ] }` |

Multiple hosts are comma-separated in the environment variable, or a JSON array in config.

Restart the application after changing bridge host settings.

**Note:** bridge configuration affects **canvas grouping and upstream pairing only**. Connect/disconnect still uses normal NDI source names — receivers on your network connect to the bridge outputs or direct SHQ sources independently of how NDI Manager displays them.

---

## 14. Troubleshooting

> **First stop:** tray → **Open data folder** → `logs\` — the log of the day shows listener connect/reconnect, receiver `source-name` / `connection-state` changes and any errors.

### Web UI is blank or shows old version

1. Confirm NDI Manager is running in the tray.
2. Hard refresh: **Ctrl+F5**.
3. Check the footer **bundle hash** matches the installed build.
4. Try **Restart service** from the tray menu.

### “Failed to fetch NDI devices”

- The embedded server is not running, or the wrong port is open in the browser.
- Open the UI from the tray menu to use the correct URL.

### No senders or receivers appear

- Verify NDI sources exist on the network (NDI Studio Monitor or other tools).
- Check the discovery pill: **Discovery partial** or **Discovery…** indicates listener issues.
- Confirm the **Discovery Server URL** matches your facility configuration.
- Ensure Windows Firewall allows NDI traffic.

### Connected RX is 0 but I see a line on the canvas

- **Yellow dashed edge** — connect sent; NDI may still be confirming. You can already select and disconnect the line.
- **Green edge** but RX = 0 — may be a timing/cache delay; click **Refresh**.

### “You must install or update .NET” when launching the exe

- You are running a **framework-dependent** build (e.g. from `bin\Debug`) instead of the **self-contained** installer or `publish\` output.
- Reinstall from **`NDIManager-v3.1-Setup.exe`** or run from a self-contained `publish\` folder.

### Stats (frames sent, dropped frames) are zero

- Many sender statistics update only when **receivers are connected** and media is flowing (NDI SDK behaviour).
- Expand the **Video** stats section after connections are active.
- **Legacy senders** never show live statistics — this is expected (see [Legacy senders](#legacy-senders)).

### Connect/disconnect does not work

- Requires a working **Recv Listener** connection to the Discovery Server.
- The receiver must be registered on the Discovery Server (typical for managed NDI installations).
- For **legacy** senders, connect is still sent via Discovery Server — the receiver must be able to resolve the NDI source name on the network even though NDI Manager discovered the sender via Finder only.
- Check the **Table** view for warning icons and connection state on the affected channel.

### Bridge hub shows wrong outputs or too many separate senders

1. Confirm the bridge machine hostname contains `bridge` or add it to `NDI_BRIDGE_HOSTS` / `Ndi:BridgeHosts` (see [NDI Bridge hosts](#ndi-bridge-hosts)).
2. Click **Refresh** in the Web UI header — bridge grouping is applied when the snapshot is built.
3. If outputs appear as gray **LEGACY** nodes instead of an orange hub, the Discovery Server may not be listing them yet. Finder-only paths still work for connect; add the bridge host explicitly in config to improve grouping.

### Legacy sender missing from canvas

1. The source must be visible to **NDI Finder** on this PC (same subnet / mDNS).
2. If the same NDI name is already on the Discovery Server, only the **monitored** (green) entry is shown — not a separate legacy node.
3. Wait a few seconds after the source starts — Finder merge runs on each discovery cycle.

### Port already in use

- Choose a different port from the tray menu.
- Close other applications using the same port.

### Application will not update after install

- Close all **NDIManager.exe** instances from the tray before running a new installer or publish.
- The NDI DLL is locked while the app is running.

---

## 15. Glossary

| Term | Definition |
|------|------------|
| **Sender** | An NDI source/output — produces a stream others can receive |
| **Receiver** | An NDI input — consumes a stream from a named NDI source |
| **Channel** | One logical input or output on a multichannel device |
| **Discovery Server** | NDI Advanced service that lists senders/receivers and relays connect commands |
| **Source name** | Full NDI name used in connect commands (e.g. `MACHINE (App - Output 1)`) |
| **Connected RX** | Count of receivers currently connected to a sender output |
| **Active ch** | Sender channels with active media |
| **Streaming** | Receiver channel actively receiving frames |
| **Tally PGM / PVW** | Program / Preview tally flags from compatible devices |
| **Dropped frames** | Cumulative count reported by NDI monitoring (`video-frames-dropped`) |
| **Host** | Machine name prefix from NDI stream naming (e.g. `VECTAR-PLUS`) |
| **Bridge hub** | Single canvas node grouping all republished outputs from one NDI Bridge machine |
| **Upstream label** | Original source name associated with a bridge transcoded output |
| **Legacy sender** | NDI source found via Finder but not monitored on Discovery Server Send Listener — connect-only |
| **NDI Finder** | SDK mechanism that enumerates NDI sources on the LAN (used to supplement legacy discovery) |

---

## Document information

| | |
|---|---|
| **Product** | NDI Manager |
| **Manual version** | 3.1 |
| **Audience** | Operators and technical users |
| **Related docs** | [CHANGELOG.md](../CHANGELOG.md), [INSTALLER_README.md](../INSTALLER_README.md) |

For issues and feature requests, contact your Vizrt / facility support channel or use the project repository: https://github.com/NDIConnected/ndi-utils-manager

---

*Copyright © 2026 Vizrt NDI AB*
