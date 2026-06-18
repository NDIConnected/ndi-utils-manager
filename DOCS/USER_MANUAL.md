# NDI Manager — User Manual

**Version 2.9** · June 2026

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
7. [Managing connections](#7-managing-connections)
8. [Hosts sidebar](#8-hosts-sidebar)
9. [Filters and search](#9-filters-and-search)
10. [Table view](#10-table-view)
11. [Events view](#11-events-view)
12. [Node details and statistics](#12-node-details-and-statistics)
13. [Layout tools](#13-layout-tools)
14. [Configuration](#14-configuration)
15. [Troubleshooting](#15-troubleshooting)
16. [Glossary](#16-glossary)

---

## 1. Overview

NDI Manager runs in the **Windows system tray**. It hosts a local web server and opens a browser-based control panel where you can:

- See **sender** devices (outputs) on the left and **receiver** devices (inputs) on the right
- **Drag connections** from a sender output to a receiver input
- Monitor **video/audio statistics**, **tally**, and **dropped frames**
- Work on large installations using **host grouping**, **filters**, and a **table view**
- Inspect raw **NDI monitoring events** for diagnostics

Connections are sent as NDI Discovery Server commands (`CONNECT` / `DISCONNECT`). The canvas reflects the real network state reported by NDI, not just local UI state.

---

## 2. Requirements

| Component | Requirement |
|-----------|-------------|
| Operating system | Windows 10/11 x64 |
| NDI | NDI SDK 6 runtime (`Processing.NDI.Lib.x64.dll`) |
| Network | NDI Discovery Server reachable from this PC (for remote monitoring and connect commands) |
| Browser | Modern browser (Chrome, Edge, Firefox) for the Web UI |
| Permissions | Administrator rights to install; standard user can run after install |

The application listens on **localhost** by default (port **5000**). Other machines on the LAN can reach it if Windows Firewall allows inbound traffic on the chosen port.

---

## 3. Installation

1. Run **`NDIManager-v2.9-Setup.exe`** (or the current installer from your release package).
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
| **Open data folder** | Opens `%LocalAppData%\NDIManager` (settings, etc.) |
| **Exit** | Stops the application |

**Double-click** the tray icon to open the Web UI (same as **Open Web UI**).

### Notifications

If a receiver **loses its source**, a balloon notification may appear while the app runs in the background. This helps catch dropped links without keeping the browser open.

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
- **Tabs** — Canvas | Table | Events
- **Refresh** — force an immediate data refresh

### Footer

- **Version** — e.g. `v2.9.0`
- **Last update time** — when discovery last ran
- **Bundle hash** — identifies the built Web UI file (useful to confirm the browser is not showing a cached old version)

After an update, press **Ctrl+F5** in the browser for a hard refresh if the footer hash does not match the new build.

### Toast messages

Connect, disconnect, and layout actions show short **toast notifications** at the bottom-right instead of blocking dialog boxes. Errors appear in red; success in green.

---

## 6. Canvas view

The **Canvas** tab shows an interactive diagram:

- **Sender nodes** (green) on the left — NDI outputs
- **Receiver nodes** (blue) on the right — NDI inputs
- **Edges** (lines) — active or pending connections between channels

### Aggregated devices

Each node represents one **application instance** on a machine (e.g. vMix, OBS, an intercom system). Devices with many channels show:

- A **channel count** badge
- **Collapsible** output/input rows — click **expand** to see all connectors
- On large devices (16+ channels), only active or connected channels may show until expanded

### Canvas controls

Use the built-in React Flow controls (bottom-left):

- **Zoom** in/out
- **Fit view** — frame all nodes
- **Mini-map** — overview of large topologies

Drag nodes to rearrange; positions are **saved automatically** in the browser.

### Toolbar (Canvas tab)

| Control | Description |
|---------|-------------|
| **Hosts** | Show the host sidebar |
| **Canvas only** | Hide the host sidebar for more canvas space |
| **Active only** | Hide devices with no streaming or connections |
| **Compact / Comfort** | Toggle node density |
| **ℹ️** | Open the metrics legend |
| **Reset layout** | Restore default node positions |
| **Align by host** | Arrange senders/receivers in columns per machine |
| **Save preset / Load preset** | Save or restore layout and filters for the selected host (see [Layout tools](#13-layout-tools)) |
| **Disconnect host** | Disconnect all receivers on the focused host |

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
| **Solid green**, animated | Connection **confirmed** by NDI (`source-name` matches on the receiver) |
| **Dashed yellow** | Connect command **sent**, waiting for NDI to confirm |

Click an edge to **focus** the connected sender and receiver in the view.

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

- Click **All hosts** to show everything.
- Click a **host name** to filter the canvas and table to that machine only.
- Each host row shows channel counts, streaming activity, and link counts.

When a host is selected:

- The header subtitle shows `Host: <name>`
- **Save preset / Load preset** and **Disconnect host** become available

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

## 11. Events view

The **Events** tab shows a live log of NDI monitoring events from the Discovery Server listeners:

- **SendListener** — sender-side events (green)
- **RecvListener** — receiver-side events (blue)

Use the filter box to search by UUID, event name, or value. Filter the dropdown to one listener type.

Typical event names include `source-name`, `connection-state`, `video-codec`, `connected-receivers`, `video-frames-dropped`, etc.

This view is **read-only** and intended for troubleshooting when the canvas shows unexpected state.

---

## 12. Node details and statistics

### Sender node summary

| Field | Description |
|-------|-------------|
| **Connected RX** | Number of NDI receivers listening to this sender (click to focus connections) |
| **Active ch** | Channels currently streaming |
| **Dropped frames** | Cumulative dropped frames (red if &gt; 0) |
| **Video / Audio / Res/FPS / Ports** | Aggregated technical summaries |

Sender **colour** on outputs may indicate connection type:

| Colour | Meaning |
|--------|---------|
| Green | Full video+audio receivers only |
| Orange | Audio-only receivers |
| Purple | Mixed full and audio-only receivers |
| Gray | No active connections |

**PGM / PVW** badges show NDI tally state.

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

### Metrics legend

Press **ℹ️** in the toolbar to open a short explanation of Connected RX, Active ch, Streaming, and edge colours.

---

## 13. Layout tools

### Reset layout

Clears custom positions and returns nodes to the default left/right grid.

### Align by host

Groups devices by machine into vertical columns — useful after adding many nodes or when the canvas becomes cluttered.

If a **host is selected**, alignment applies to filtered devices only.

### Host presets

With a host selected in the sidebar:

1. Arrange nodes and set filters as desired.
2. Click **Save preset** — stored in the browser (`localStorage`).
3. Click **Load preset** on a later session to restore layout, filters, and density for that host.

Presets are **per browser / per PC**, not shared across users.

---

## 14. Configuration

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

---

## 15. Troubleshooting

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

- **Yellow dashed edge** — connect command sent, NDI has not confirmed yet; wait a few seconds.
- **Green edge** but RX = 0 — may be a timing/cache delay; click **Refresh**.

### Stats (frames sent, dropped frames) are zero

- Many sender statistics update only when **receivers are connected** and media is flowing (NDI SDK behaviour).
- Expand the **Video** stats section after connections are active.

### Connect/disconnect does not work

- Requires a working **Recv Listener** connection to the Discovery Server.
- The receiver must be registered on the Discovery Server (typical for managed NDI installations).
- Check the **Events** tab for `connection-state` and error-related events.

### Port already in use

- Choose a different port from the tray menu.
- Close other applications using the same port.

### Application will not update after install

- Close all **NDIManager.exe** instances from the tray before running a new installer or publish.
- The NDI DLL is locked while the app is running.

---

## 16. Glossary

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

---

## Document information

| | |
|---|---|
| **Product** | NDI Manager 6.3 |
| **Manual version** | 2.9 |
| **Audience** | Operators and technical users |
| **Related docs** | [CHANGELOG.md](../CHANGELOG.md), [INSTALLER_README.md](../INSTALLER_README.md) |

For issues and feature requests, contact your Vizrt / facility support channel or use the project repository: https://github.com/NDIConnected/ndi-utils-manager

---

*Copyright © 2026 Vizrt NDI AB*
