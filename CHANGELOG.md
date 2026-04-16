# NDI Manager 6.3 - Changelog

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
