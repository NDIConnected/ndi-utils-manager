# NDI Manager - Changelog

## [Unreleased]

### NDI SDK

- Built and tested against **NDI SDK 6.4.0** (runtime `6.4.0.2`); runtime version now logged at startup and exposed as `ndiSdkVersion` in `/api/ndi/status`.
- P/Invoke string parameters (`send_connect`, `subscribe_events`, `unsubscribe_events`) marshalled as **UTF-8** instead of ANSI: sources/receivers with non-ASCII names (e.g. `Città`) now connect correctly.
- Device/host identity parsing keeps Unicode letters: senders like `èèè (òòòòò)` were shown as `-` (name collapsed by an ASCII-only sanitizer).
- Added 6.4 `recv_bandwidth` values (`video_only_lowest`, `video_only_highest`) and `NDIlib_version()` binding.
- Send/Recv listeners are re-created every 10 s when no Discovery Server was reachable at startup (SDK create returns NULL in that case).

### Reliability

- Discovery runs in a single non-overlapping loop inside the hosted service (was a `System.Threading.Timer` that could overlap itself); all native NDI calls are serialized, and shutdown waits for the loop before NDI handles are destroyed — fixes possible crashes on Exit / Restart service / port change.
- Restart waits for the previous web host to fully stop instead of a fixed 500 ms delay.
- Content root anchored to the executable folder: the Web UI no longer returns 404 when the app is started from a different working directory.
- Discovery loop runs on the thread pool (it was running on the tray UI thread because the host is started from WinForms).
- Snapshot pushes are sent in order (awaited, one per pass) and carry `instanceId` + `sequence` so clients can drop stale data.
- After a Send/Recv listener reconnects to the Discovery Server, event subscriptions are renewed.
- Event caches and subscriptions for endpoints unseen for 5 minutes are dropped (no unbounded growth, no stale "connected" state on return).
- New health state `stalled` (tray icon red) when no discovery pass completed for 10 s.
- Tray status reuses the computed status instead of building a second snapshot every second.
- Identical snapshots are no longer pushed every second (content fingerprint + 10 s heartbeat).
- **File logging** to `%LocalAppData%\NDIManager\logs` (daily files, 7 kept); receiver routing changes logged at Information, per-second listener traces moved to Debug.

### Web UI

- Canvas nodes are no longer deletable: pressing Backspace on a selected device no longer disconnects all of its routes.
- Removed "ghost" edges/nodes: disconnecting the last route or applying a filter with no matches now clears the canvas (previous graph is kept only while the backend snapshot is empty).
- Optimistic connections are drawn as pending (yellow, dashed) until the receiver confirms, expire after 8 s with a warning, and are cleared on every disconnect / failed reconnect path.
- Out-of-order snapshots (REST polls vs. pushes) are dropped using `instanceId` / `sequence`; edges no longer flicker after a connect.
- SignalR reconnects forever with capped backoff (was giving up after ~17 s), retries a failed initial start, and resyncs with a full fetch after reconnecting.
- Connection indicator in the header: **Live / Reconnecting… / Polling / Offline**.
- Polling is a 2 s fallback only while push is down (15 s safety poll while live); background polls never overlap and time out after 5 s.
- A backend outage no longer replaces the UI with an error page: the canvas keeps the last known state with an "Backend unreachable since …" banner, and recovers automatically.
- Vite dev proxy forwards `/hubs` (WebSocket) so SignalR works with `npm run dev`.
- Canvas performance: unchanged devices/edges keep the same objects across snapshots, node components are memoized, React Flow measurements are preserved (no hide/re-measure flicker on connect, filter or expand), and node keyframes moved to CSS.
- Collapsed devices keep (invisible) handles for connected channels that are not listed, so all their edges are drawn.
- Reset layout, Load preset and auto layout move nodes immediately (not on the next snapshot).
- Align by host with a host filter keeps the other hosts' positions; host presets restore only that host's nodes.
- Newly discovered devices are placed below existing ones (including saved slots of offline devices) instead of overlapping them.

## [Version 3.2.1] - 2026-07

### Docs / licensing

- Community docs aligned with other NDI samples: `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, GitHub PR template.
- `Processing.NDI.Lib.Licenses.txt` (NDI SDK third-party notices) shipped with the installer alongside the NDI runtime DLL.
- Root `THIRD-PARTY-LICENSES.txt` (hyphenated naming); `License\` folder renamed to `Licenses\`.
- Repository retargeted to **NDIConnected/ndi-utils-manager**; installer notice references `http://ndi.link/ndisdk_license`.

## [Version 3.2] - 2026-06-16

### Web UI

- **Align by host** — fixed overlapping nodes (Bridge hub, Studio Monitor, multi-channel senders) using DOM height measurement and IP-based host grouping.
- **Tighter host layout** — dynamic column bands per machine instead of fixed-width slots; reduced horizontal and vertical spacing while keeping nodes separated.
- Layout version bumped to invalidate stale saved positions after upgrade.

### Desktop / installer

- Application version **3.2.0**; installer **3.2** (`NDIManager-v3.2-Setup.exe`).

---

## [Version 3.1] - 2026-06-16

### Web UI

- **Legacy sender discovery** — NDI Finder merges pre-NDI 6 / non-Discovery-Server sources for connect-only routing (no codec/tally monitoring on those senders); legacy nodes shown in gray with **LEGACY** badge.
- **NDI Bridge hub** — republished outputs on bridge hosts (e.g. `7010-01-BRIDGE`) collapse into one orange hub node; upstream pairing shows `→ Bridge` on direct SHQ sources; hub collapsed by default when multiple channels.
- **Canvas stability** — fixed cyclic flicker on Bridge-heavy networks: structural vs metrics-only snapshot updates, layout position ref (no rebuild loop), empty-snapshot guard, snapshot debounce.

### Backend

- **Discovery merge** — senders/receivers merged across cycles with stale grace (10s senders, 3s receivers) instead of full clear; Finder keeps visible sources alive.
- **`BridgeRouting`** — hub consolidation, upstream pairing, stable `bridge:` channel handle IDs, legacy stream host normalization for bridge machines.
- NDI Finder wait API (`NDIlib_find_wait_for_sources`) for legacy source enumeration.

### Desktop / installer

- Application version **3.1.0**; installer **3.1** (`NDIManager-v3.1-Setup.exe`).

---

## [Version 3.0] - 2026-06-19

### Web UI

- **Per-device compact view** — click the device **name** (dotted underline) to toggle compact ↔ detailed; preference saved per device in the browser.
- **Compact cards** — minimal sender/receiver layout with address and a single stacked connector for multi-channel devices.
- **Drag handle** — move nodes from the **header bar** only (`SENDER DEVICE` / `RECEIVER DEVICE`); avoids conflicts with channel clicks and compact toggle.
- **Connection UX** — optimistic edges on connect; click a line immediately to select and disconnect (no wait for green confirm); NDI confirm still shown as solid green when reported.
- **Layout** — stacked auto-layout with post-render height measurement; saved positions preserved; layout version bumped to avoid stale overlaps on first load.
- **Canvas toolbar** — single **Show hosts / Canvas only** toggle (replaces separate hosts + canvas-only controls).
- **Multi-host selection** — **Ctrl+Click** (Cmd+Click on Mac) in the Hosts sidebar to show several machines at once (e.g. HOST 01 + HOST 02); normal click selects one host only; **All hosts** clears the filter.
- Removed **Events** tab and NDI events panel (unused).
- Removed global **Compact nodes** toggle (replaced by per-device control).

### Backend / desktop

- Tray context menu translated to **English** (Open Web UI, Port, Restart service, Open data folder, Exit).
- Removed Windows **balloon notifications** when a receiver loses its source.
- **Self-contained** Release publish (`win-x64`) — installer no longer requires a separate .NET runtime on target PCs.
- Added `scripts/publish-standalone.ps1` and fixed publish profile output path.

### Desktop / installer

- Application version **3.0.0**; installer **3.0** (`NDIManager-v3.0-Setup.exe`).
- Installer **NDI SDK notice** page: fixed text encoding and line breaks (ASCII notice file + CRLF normalization in Inno Setup script).

---

## [Version 2.9] - 2026-06-16

### Web UI

- Full UX refresh: toast notifications, Discovery status pill, Canvas / Table / Events tabs, metrics legend, channel detail drawer.
- SignalR push with polling fallback; NDI events panel; host layout presets and bulk disconnect.
- Edge confirmed (green) vs pending (yellow); auto-layout and density toggle.
- **Dropped frames** on sender and receiver nodes and stats panels.
- English UI throughout; removed duplicate “RX connected” label on sender connectors.
- Fixed React infinite re-render causing blank screen after load.

### Backend

- `/api/ndi/status`, `/api/ndi/events`, `/api/ndi/disconnect-bulk`; SignalR hub `/hubs/ndi`.
- Tray icon health colors, discovery menu, restart service, balloon on source lost.

### Desktop / installer

- Application version **2.9.0**; installer **2.9** (`NDIManager-v2.9-Setup.exe`).

---

## [Version 2.8] - 2026-06-16

### Device aggregation

- Separate NDI applications on the same machine now appear as distinct nodes (e.g. OBS, vMix, Wirecast), instead of one merged multichannel object.
- Multichannel apps (intercom / multi-output) still group by application name from stream names: `HOST (App)` or `HOST (Channel(App))`.
- Added `HostName` on aggregated devices; Host sidebar groups by machine, canvas nodes by application.

### UI fixes

- Receiver multichannel nodes: expand/collapse button works reliably (aligned with sender layout and position).
- Collapse button when expanded; improved compact node height for 16+ channels.

### Desktop / installer

- Application version **2.8.0**; installer **2.8** (`NDIManager-v2.8-Setup.exe`).

---

## [Version 2.7] - 2026-05-18

### UI — Large network usability

- Host sidebar to group devices by machine (e.g. VECTAR-PLUS) and focus the canvas on one host.
- Compact collapsed nodes for devices with many channels; expand on demand.
- **Solo attivi** filter; tighter layout spacing on large topologies.

### Connection mapping fixes

- Connections use NDI `source-name` events only (removed incorrect `InputUuid` → sender fallback).
- Sender/receiver channels keyed by endpoint UUID to avoid wrong edges (e.g. CAMERA-02 → MN-INTERCOM).
- Host label extracted from NDI names like `VECTAR-PLUS (App)` for better aggregation.

### Desktop / installer

- Application version **2.7.0**; installer **2.7** (`NDIManager-v2.7-Setup.exe`).

---

## [Version 2.6] - 2026-03-25

### NDI Discovery / Sender monitoring (§18)

- **Send Listener** aligned with NDI Advanced SDK: `NDIlib_initialize` before listener create; optional Discovery Server URL via `p_url_address` (UTF-8), environment variable `NDI_DISCOVERY_SERVER` or configuration `Ndi:DiscoveryServer`.
- **Event subscription** uses sender/receiver **UUID** consistently (tracked subscriptions, `free_events` whenever the pointer is non-null).
- **Tally** (`tally-on-program` / `tally-on-preview`): values parsed as SDK string `"true"` / `"false"`; discovery loop applies `get_events` in the same poll as `get_senders` / `get_receivers`.
- **Recv Listener** uses the same Discovery URL and UTF-8 string handling for parity.
- Diagnostic **Information** logs for listener connect, sender/receiver lists, subscriptions, and events (filter `NDIManager`).

### Web UI

- **Aggregated sender nodes** show PGM/PVW tally (device summary and per-output chips); fixes tally hidden when `isAggregated` is true.

### Desktop / installer

- Application version **2.6.0**; installer **2.6** (`NDIManager-v2.6-Setup.exe`).

---

## [Version 2.5] - 2026-02-26

### 🚀 Added - Filtering, Connection UX, Packaging Refresh

#### UI Filtering (Sender/Receiver)
- Added dedicated **Sender filter** and **Receiver filter** textboxes in the header.
- Implemented advanced query syntax:
  - `,` = AND groups
  - `|` = OR terms
  - wildcard support: `*` (any chars), `?` (single char)
- Filtering matches app ID, address, stream labels, endpoint names, and codec summaries.
- Connections are filtered consistently with visible sender/receiver nodes.

#### Connection Interaction Improvements
- Added drag-to-disconnect behavior: dragging an edge endpoint to empty space disconnects the receiver.
- Added reconnect behavior: dragging to another valid connector reconnects via API.
- Improved delete interaction: edge delete button stays fixed and centered on the selected connection.
- Improved edge alignment with channel handles for multichannel nodes.

#### Streaming-Centric Status
- Aggregated nodes now show **Streaming X/Y** as primary activity metric.
- Removed aggregated **Connected** count from the UI to avoid ambiguity with logical (idle) links.

#### Visual & Layout Updates
- Refined multichannel node spacing and connection rendering for better readability.
- Kept support for multi-lane edge rendering while reducing visual clutter.

#### Desktop/Installer Updates
- Application version updated to **2.5.0**.
- Installer version updated to **2.5**.
- Configured `MAN_icon.ico` as:
  - application executable icon
  - installer icon
  - tray/taskbar icon (with safe runtime fallback)
- Built new installer: `Output/NDIManager-v2.5-Setup.exe`.

---

## [Version 1.1] - 2025-11-25

### 🎨 Added - Mixed Connection States (Purple Indicator)

#### New Feature: Three-State Color Coding for Senders

NDI Senders now display different colors based on the types of receivers connected to them:

- **🟢 GREEN** - Sender connected only to receivers receiving VIDEO+AUDIO (full stream)
- **🟠 ORANGE** - Sender connected only to receivers receiving AUDIO ONLY
- **🟣 PURPLE** - Sender connected to BOTH types simultaneously (mixed connections)

#### Visual Enhancements

- Added purple color scheme for mixed connection state
- New "Mixed (Video + Audio-Only)" badge for senders in purple state
- All visual elements (border, gradient, indicator, handle) change color dynamically
- Improved visual feedback for operators monitoring complex workflows

#### Technical Implementation

**Frontend Changes:**
- `NDIFlowEditor.jsx`: Implemented tri-state connection tracking logic
  - Replaced boolean flag with connection type tracking object
  - Counts both full and audio-only receivers per sender
  - Determines state: `'full'`, `'audio'`, `'mixed'`, or `'none'`

- `SenderNode.jsx`: Complete refactor for dynamic color schemes
  - Defined 4 color schemes: green, orange, purple, gray
  - Dynamic color selection based on `connectionState` prop
  - Added special badge for mixed connections
  - All styling functions now use dynamic color scheme

**Backend Changes:**
- ✅ No backend changes required (all information already provided by NDI events)

#### Use Cases

**Mixed Connection Scenario:**
```
NDI Sender "Camera 1"
  ├─► Program Monitor (VIDEO+AUDIO)  ← Full connection
  └─► Audio Console (AUDIO ONLY)     ← Audio-only connection

Result: "Camera 1" displays in PURPLE with "Mixed" badge
```

This is useful for:
- Production workflows with main output + audio monitoring
- Broadcast setups with video to vision mixer + audio to mixing desk
- Remote production with different quality streams to different locations
- IFB/Comms systems alongside main video distribution

---

## [Version 1.0] - 2025-11-14

### Initial Release

#### Core Features

- Real-time NDI device discovery via NDI Discovery Server
- Visual flow editor using React Flow
- Drag-and-drop connection management
- WebSocket support for real-time updates
- Event monitoring from NDI SDK 6
- Persistent node layout (localStorage)
- Windows Service integration with automatic startup
- Self-contained installer using Inno Setup

#### Components

**Backend (.NET 9.0):**
- ASP.NET Core Web API (port 5000)
- NDI SDK wrapper via P/Invoke
- Background service for continuous monitoring
- REST API endpoints for device control
- Event caching system

**Frontend (React 19.2):**
- Modern React with Vite build system
- React Flow visual editor
- Custom node components for senders and receivers
- Real-time polling (2-second intervals)
- Responsive dark theme UI

**Deployment:**
- Inno Setup installer
- Windows Service registration
- Automatic service startup
- Integrated web UI serving

#### Supported Operations

- ✅ Discover NDI senders and receivers
- ✅ Create connections via Discovery Server
- ✅ Delete connections
- ✅ Monitor connection states
- ✅ View technical properties (codecs, resolution, frame rate)
- ✅ Persist UI layout between sessions

---

## File Changes Summary

### Version 1.1 (2025-11-25)

| File | Status | Description |
|------|--------|-------------|
| `ndi-web-ui/src/components/NDIFlowEditor.jsx` | Modified | Tri-state connection tracking |
| `ndi-web-ui/src/components/SenderNode.jsx` | Refactored | Dynamic color schemes |
| `DOCS/Implementation-Status-Mixed-Connections.md` | Added | Complete implementation documentation |
| `CHANGELOG.md` | Added | Version history |

---

## Upgrade Notes

### From Version 1.0 to 1.1

**Build Steps:**
```bash
# 1. Build frontend
cd ndi-web-ui
npm run build

# 2. Copy to wwwroot
Copy-Item -Path "dist\*" -Destination "..\wwwroot\" -Recurse -Force

# 3. Build backend
cd ..
dotnet build -c Release

# 4. Publish for installer
dotnet publish -c Release -r win-x64 --self-contained true -o ./publish

# 5. Copy frontend to publish
Copy-Item -Path "ndi-web-ui\dist\*" -Destination "publish\wwwroot\" -Recurse -Force

# 6. Create installer (optional)
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" "NDIManager-Setup.iss"
```

**Breaking Changes:**
- None - fully backward compatible
- Existing installations will automatically benefit from new color coding

**Data Migration:**
- No database or configuration changes required
- LocalStorage layout data remains compatible

---

## Known Issues

### Version 1.1

- None reported

### Version 1.0

- None reported

---

## Roadmap

### Planned Features

**v1.2 - Enhanced Monitoring**
- Bandwidth statistics per connection type
- Historical connection state tracking
- Performance metrics dashboard

**v1.3 - Advanced UI**
- Connection type filtering
- Color legend in UI
- Export/import layout configurations

**v1.4 - Real-Time Optimization**
- WebSocket-based updates (replace polling)
- Reduced latency for state changes
- Push notifications for state transitions

**v2.0 - Enterprise Features**
- Multi-user support
- Role-based access control
- Centralized configuration management
- REST API v2 with GraphQL support

---

## Support

For issues, questions, or feature requests, contact the Vizrt NDI AB development team.

**Documentation:**
- Installation: `INSTALLER_README.md`
- Implementation Details: `DOCS/Implementation-Status-Mixed-Connections.md`
- NDI Events Guide: `DOCS/NDI-Events-Implementation-Guide.md`

---

**Copyright © 2025 Vizrt NDI AB**
