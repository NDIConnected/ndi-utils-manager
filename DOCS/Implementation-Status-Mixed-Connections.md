# NDI Manager 6.3 - Implementation Status
## Mixed Connection States (Purple Indicator)

**Document Version:** 1.0
**Last Updated:** 25 November 2025
**Author:** Development Team

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Project Overview](#project-overview)
3. [Latest Implementation: Mixed Connection States](#latest-implementation-mixed-connection-states)
4. [Technical Architecture](#technical-architecture)
5. [Implementation Details](#implementation-details)
6. [Testing Guide](#testing-guide)
7. [Files Modified](#files-modified)
8. [Future Enhancements](#future-enhancements)

---

## Executive Summary

**NDI Manager 6.3** is a web-based application for managing NDI (Network Device Interface) senders and receivers through an intuitive visual interface. The application communicates with the **NDI Discovery Server** to monitor and control NDI devices in real-time.

### Latest Update: Mixed Connection States

We have successfully implemented a **three-state color coding system** for NDI Senders that provides visual feedback about the types of receivers connected to each sender:

- 🟢 **GREEN** - Sender connected only to full (video+audio) receivers
- 🟠 **ORANGE** - Sender connected only to audio-only receivers
- 🟣 **PURPLE** - Sender connected to BOTH full and audio-only receivers simultaneously

This enhancement allows operators to instantly identify senders serving mixed workloads, improving monitoring and troubleshooting capabilities.

---

## Project Overview

### Technology Stack

**Backend:**
- .NET 9.0 (C#)
- ASP.NET Core Web API
- NDI SDK 6
- WebSockets support

**Frontend:**
- React 19.2
- Vite build system
- React Flow (visual node editor)
- Axios (HTTP client)
- Modern ES6+ JavaScript

**Deployment:**
- Self-contained .NET application
- Inno Setup installer
- Windows Service with automatic startup
- Integrated web UI (port 5000)

### Key Features

1. **Real-time Discovery**: Automatic detection of NDI senders and receivers via Discovery Server
2. **Visual Flow Editor**: Drag-and-drop interface using React Flow
3. **Connection Management**: Create/delete connections between senders and receivers
4. **Event Monitoring**: Real-time events from NDI SDK (connection states, bandwidth, codec info)
5. **Persistent Layout**: Node positions saved to localStorage
6. **Color-Coded States**: Visual indicators for connection types and states

---

## Latest Implementation: Mixed Connection States

### Problem Statement

**Previous Behavior:**
The system used a binary (true/false) logic to determine sender colors:
- If a sender was connected to **at least one** audio-only receiver, it turned ORANGE
- Otherwise, it remained GREEN

**Limitation:**
This approach did not distinguish between:
- A sender connected ONLY to audio-only receivers (should be ORANGE)
- A sender connected to BOTH full and audio-only receivers (needed a new state)

### Solution: Three-State System

We implemented a tri-state logic that tracks **both types** of connections:

| State | Color | Condition | Use Case |
|-------|-------|-----------|----------|
| **FULL** | 🟢 Green | All connected receivers receive VIDEO+AUDIO | Standard video distribution |
| **AUDIO** | 🟠 Orange | All connected receivers receive AUDIO only | Audio-only distribution (e.g., IFB, comms) |
| **MIXED** | 🟣 Purple | Some receivers get VIDEO+AUDIO, others AUDIO only | Hybrid workflows (e.g., main output + commentary feed) |

### Visual Indicators

**PURPLE sender includes:**
- Purple gradient background (`#4c1d95` to `#5b21b6`)
- Purple border (`#7c3aed`)
- Purple pulsing indicator dot
- Purple connection badge
- Special "Mixed (Video + Audio-Only)" label
- Purple output handle

**Example Scenario:**
```
NDI Sender "Camera 1"
    ├─► Receiver A (Program Monitor) - receiving VIDEO+AUDIO  ← Full connection
    └─► Receiver B (Audio Console) - receiving AUDIO only     ← Audio-only connection

    Result: Sender "Camera 1" displays in PURPLE 🟣
```

---

## Technical Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    NDI Discovery Server                      │
│              (NDI SDK 6)                                    │
└─────────────────┬───────────────────────────┬───────────────┘
                  │                           │
                  │ Events API                │ Events API
                  ▼                           ▼
        ┌─────────────────┐         ┌─────────────────┐
        │ SendListener    │         │ RecvListener    │
        │ (monitors       │         │ (monitors       │
        │  senders)       │         │  receivers)     │
        └────────┬────────┘         └────────┬────────┘
                 │                           │
                 └───────────┬───────────────┘
                             │
                   ┌─────────▼──────────┐
                   │ NDIDiscoveryService │
                   │  (BackgroundService)│
                   │                     │
                   │ - Event caching     │
                   │ - State management  │
                   │ - Correlation logic │
                   └─────────┬───────────┘
                             │
                   ┌─────────▼──────────┐
                   │   NDIController     │
                   │   (REST API)        │
                   │                     │
                   │ GET /api/ndi/senders│
                   │ GET /api/ndi/receivers│
                   │ POST /api/ndi/connect│
                   │ POST /api/ndi/disconnect│
                   └─────────┬───────────┘
                             │
                             │ HTTP/JSON
                             ▼
                   ┌──────────────────────┐
                   │   React Frontend     │
                   │                      │
                   │ - NDIFlowEditor.jsx  │
                   │ - SenderNode.jsx     │
                   │ - ReceiverNode.jsx   │
                   │ - CustomEdge.jsx     │
                   └──────────────────────┘
```

### Data Flow: Connection State Detection

```javascript
1. NDIDiscoveryService polls Discovery Server every 2 seconds
   ├─► GetSenders() - retrieves all registered senders
   ├─► GetReceivers() - retrieves all registered receivers
   └─► GetEvents() - retrieves NDI events (video-codec, audio-codec, etc.)

2. Events are cached in ConcurrentDictionary:
   ├─► _senderEventCache: { senderUuid → { eventName → eventValue } }
   └─► _receiverEventCache: { receiverUuid → { eventName → eventValue } }

3. Receiver connection detection:
   ├─► Check event: "source-name" - which sender is connected
   ├─► Check event: "video-codec" - is video being received?
   └─► Determine: receiverIsAudioOnly = (!videoCodec || width === 0)

4. Frontend (NDIFlowEditor.jsx) analyzes connections:
   ├─► For each receiver connected to a sender:
   │   ├─► If receiver is audio-only → increment audioReceiverCount
   │   └─► If receiver is full → increment fullReceiverCount
   │
   └─► Determine sender state:
       ├─► If both counts > 0 → state = 'mixed' (PURPLE)
       ├─► If only audioReceiverCount > 0 → state = 'audio' (ORANGE)
       ├─► If only fullReceiverCount > 0 → state = 'full' (GREEN)
       └─► Otherwise → state = 'none' (GRAY)

5. SenderNode.jsx renders with appropriate color scheme
```

---

## Implementation Details

### Backend Changes

**Status:** ✅ **No backend changes required**

The backend already provides all necessary information through NDI events:
- `video-codec`: Identifies if video is present
- `video-resolution`: Width x Height (0x0 means no video)
- `audio-codec`: Audio stream information
- `source-name`: Which sender a receiver is connected to

The mixed connection detection logic is implemented entirely in the frontend for optimal performance.

### Frontend Changes

#### 1. NDIFlowEditor.jsx

**File:** `ndi-web-ui/src/components/NDIFlowEditor.jsx`
**Lines Modified:** 245-302

**Before:**
```javascript
const sendersConnectedToAudioOnlyReceivers = new Set();
// Simple boolean: sender is connected to audio-only OR not
```

**After:**
```javascript
const senderConnectionTypes = {};
// Tracks: { senderId: { hasFullReceivers: bool, hasAudioReceivers: bool } }

// Analysis loop
receivers.forEach(receiver => {
  if (receiver.isConnected && receiver.currentSource) {
    const connectedSender = senders.find(s => s.name === receiver.currentSource);
    if (connectedSender) {
      if (!senderConnectionTypes[connectedSender.id]) {
        senderConnectionTypes[connectedSender.id] = {
          hasFullReceivers: false,
          hasAudioReceivers: false
        };
      }

      const receiverIsAudioOnly = !receiver.videoCodec ||
                                   receiver.videoCodec === '' ||
                                   (receiver.width === 0 && receiver.height === 0);

      if (receiverIsAudioOnly) {
        senderConnectionTypes[connectedSender.id].hasAudioReceivers = true;
      } else {
        senderConnectionTypes[connectedSender.id].hasFullReceivers = true;
      }
    }
  }
});

// Determine state for each sender
senders.forEach((sender) => {
  let connectionState = 'none';
  const connectionType = senderConnectionTypes[sender.id];

  if (connectionType) {
    if (connectionType.hasFullReceivers && connectionType.hasAudioReceivers) {
      connectionState = 'mixed';  // PURPLE
    } else if (connectionType.hasAudioReceivers) {
      connectionState = 'audio';  // ORANGE
    } else if (connectionType.hasFullReceivers) {
      connectionState = 'full';   // GREEN
    }
  }

  // Pass connectionState to node data
  newNodes.push({
    id: nodeId,
    type: 'senderNode',
    position: position,
    data: { ...sender, connectionState }
  });
});
```

**Key Changes:**
- Replaced boolean `Set` with object tracking both connection types
- Implemented tri-state logic
- Changed prop from `isConnectedToAudioOnlyReceiver` (boolean) to `connectionState` (string)

#### 2. SenderNode.jsx

**File:** `ndi-web-ui/src/components/SenderNode.jsx`
**Lines Modified:** 1-239 (complete refactor)

**Color Schemes Defined:**
```javascript
const COLOR_SCHEMES = {
  green: {
    border: '#10b981',
    gradient: ['#064e3b', '#065f46'],
    indicator: '#4ade80',
    badge: '#16a34a',
    handle: '#10b981',
    handleBorder: '#6ee7b7'
  },
  orange: {
    border: '#A35304',
    gradient: ['#7c2d12', '#92400e'],
    indicator: '#fb923c',
    badge: '#c2410c',
    handle: '#A35304',
    handleBorder: '#fb923c'
  },
  purple: {  // NEW
    border: '#7c3aed',
    gradient: ['#4c1d95', '#5b21b6'],
    indicator: '#a78bfa',
    badge: '#7c3aed',
    handle: '#7c3aed',
    handleBorder: '#a78bfa'
  },
  gray: {
    border: '#4b5563',
    gradient: ['#1f2937', '#374151'],
    indicator: '#6b7280',
    badge: '#6b7280',
    handle: '#4b5563',
    handleBorder: '#6b7280'
  }
};
```

**Dynamic Color Selection:**
```javascript
const getColorScheme = (isActive, connectionState) => {
  if (!isActive) return COLOR_SCHEMES.gray;

  switch (connectionState) {
    case 'mixed':
      return COLOR_SCHEMES.purple;
    case 'audio':
      return COLOR_SCHEMES.orange;
    case 'full':
      return COLOR_SCHEMES.green;
    default:
      return COLOR_SCHEMES.gray;
  }
};
```

**Mixed Connection Badge:**
```javascript
{connectionState === 'mixed' && (
  <div style={{
    fontSize: '11px',
    color: '#e9d5ff',
    backgroundColor: 'rgba(124, 58, 237, 0.3)',
    padding: '4px 8px',
    borderRadius: '4px',
    marginBottom: '8px',
    textAlign: 'center',
    fontWeight: '500'
  }}>
    Mixed (Video + Audio-Only)
  </div>
)}
```

**Key Changes:**
- Replaced boolean logic with state-based color scheme system
- Added purple color scheme for mixed connections
- Refactored all style functions to use dynamic colorScheme
- Added special badge for mixed state
- Changed prop from `isConnectedToAudioOnlyReceiver` to `connectionState`

---

## Testing Guide

### Prerequisites

1. NDI Discovery Server running on the network
2. At least 1 NDI Sender available
3. At least 2 NDI Receivers available
4. Receivers must support connection control via Discovery Server

### Test Scenarios

#### Test 1: GREEN State (Full Connections Only)

**Setup:**
```
Sender: "Test Source 1"
  └─► Receiver A: Connect and receive VIDEO+AUDIO
```

**Expected Result:**
- ✅ Sender node displays with GREEN border and background
- ✅ Connection badge shows "1 connected" in green
- ✅ Edge between sender and receiver is green
- ✅ Indicator dot pulses in green

#### Test 2: ORANGE State (Audio-Only Connections Only)

**Setup:**
```
Sender: "Test Source 1"
  └─► Receiver B: Connect and receive AUDIO ONLY
```

**Expected Result:**
- ✅ Sender node displays with ORANGE border and background
- ✅ Connection badge shows "1 connected" in orange
- ✅ Edge between sender and receiver is orange
- ✅ Indicator dot pulses in orange

#### Test 3: PURPLE State (Mixed Connections)

**Setup:**
```
Sender: "Test Source 1"
  ├─► Receiver A: Connect and receive VIDEO+AUDIO
  └─► Receiver B: Connect and receive AUDIO ONLY
```

**Expected Result:**
- ✅ Sender node displays with PURPLE border and background
- ✅ Special badge appears: "Mixed (Video + Audio-Only)"
- ✅ Connection badge shows "2 connected" in purple
- ✅ Indicator dot pulses in purple
- ✅ Output handle is purple
- ✅ Edge to Receiver A is green (full connection)
- ✅ Edge to Receiver B is orange (audio-only connection)

### How to Test

#### Option 1: Run from Source

```bash
cd C:\TEMP\MANAGER-6.3
dotnet run --project NDIManager.csproj
```

Open browser: **http://localhost:5000**

#### Option 2: Use Installer

```bash
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" "C:\TEMP\MANAGER-6.3\NDIManager-Setup.iss"
```

Install from: `C:\TEMP\MANAGER-6.3\Output\NDIManager-v1.0-Setup.exe`

### Verification Checklist

- [ ] Frontend builds without errors (`npm run build`)
- [ ] Backend compiles without warnings (`dotnet build`)
- [ ] Application starts and web UI loads
- [ ] Senders and receivers appear in the flow editor
- [ ] Drag-and-drop connections work
- [ ] GREEN state appears for full connections
- [ ] ORANGE state appears for audio-only connections
- [ ] PURPLE state appears when mixing connection types
- [ ] "Mixed" badge appears only in purple state
- [ ] Node positions persist after page refresh
- [ ] Connections can be deleted by selecting edge and pressing Delete
- [ ] Real-time updates occur every 2 seconds

---

## Files Modified

### Complete List of Changes

| File | Lines Modified | Change Type | Description |
|------|---------------|-------------|-------------|
| `ndi-web-ui/src/components/NDIFlowEditor.jsx` | 245-302 | Modified | Implemented tri-state connection tracking logic |
| `ndi-web-ui/src/components/SenderNode.jsx` | 1-239 | Refactored | Added purple color scheme and dynamic styling |

### Build Artifacts

| Artifact | Location | Status |
|----------|----------|--------|
| Frontend Build | `ndi-web-ui/dist/` | ✅ Built |
| Backend Release | `bin/Release/net9.0/` | ✅ Compiled |
| Published Application | `publish/` | ✅ Ready |
| Web UI in wwwroot | `wwwroot/` | ✅ Deployed |
| Web UI in publish | `publish/wwwroot/` | ✅ Deployed |

### No Changes Required

- ✅ Backend C# code (NDIDiscoveryService.cs, NDIController.cs)
- ✅ NDI wrapper classes (NDISendListener.cs, NDIRecvListener.cs)
- ✅ Models (NDISenderInfo.cs, NDIReceiverInfo.cs)
- ✅ Other React components (ReceiverNode.jsx, CustomEdge.jsx)

---

## Future Enhancements

### Potential Improvements

1. **Bandwidth Monitoring per Connection Type**
   - Track separate bandwidth for video vs audio-only connections
   - Display split statistics in sender node

2. **Connection Type Filtering**
   - Filter view to show only senders with specific connection states
   - Add legend explaining color meanings

3. **Historical Data**
   - Track connection state changes over time
   - Show timeline of mixed connection periods

4. **Alerts and Notifications**
   - Notify when a sender transitions to mixed state
   - Warning if mixed connections cause performance issues

5. **Advanced Codec Information**
   - Show which codec each receiver is using
   - Identify if receivers are requesting different quality levels

6. **WebSocket Real-Time Updates**
   - Replace polling with WebSocket push notifications
   - Reduce latency for state changes

7. **Multi-Source Support for Receivers**
   - Handle receivers that can switch between multiple sources
   - Show source history and switching patterns

8. **Export/Import Layouts**
   - Save and restore entire flow configurations
   - Share layouts between team members

---

## Appendix: Color Reference

### Color Palette

**Green (Full Connections)**
```
Border:     #10b981
Gradient:   #064e3b → #065f46
Indicator:  #4ade80
Badge:      #16a34a
Handle:     #10b981
```

**Orange (Audio-Only Connections)**
```
Border:     #A35304
Gradient:   #7c2d12 → #92400e
Indicator:  #fb923c
Badge:      #c2410c
Handle:     #A35304
```

**Purple (Mixed Connections)**
```
Border:     #7c3aed
Gradient:   #4c1d95 → #5b21b6
Indicator:  #a78bfa
Badge:      #7c3aed
Handle:     #7c3aed
```

**Gray (Inactive/No Connections)**
```
Border:     #4b5563
Gradient:   #1f2937 → #374151
Indicator:  #6b7280
Badge:      #6b7280
Handle:     #4b5563
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-25 | Development Team | Initial documentation of mixed connection states implementation |

---

**Copyright © 2025 Vizrt NDI AB**

This document contains confidential information. Distribution outside the organization is prohibited.
