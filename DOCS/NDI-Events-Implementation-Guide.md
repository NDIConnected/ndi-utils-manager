# NDI 6 Event System Implementation Guide

## Table of Contents
1. [Introduction](#introduction)
2. [System Architecture](#system-architecture)
3. [Prerequisites](#prerequisites)
4. [Step-by-Step Implementation](#step-by-step-implementation)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)
7. [Best Practices](#best-practices)

---

## Introduction

### The Problem
When working with the NDI SDK and Discovery Server, receivers can be connected to sources but the Discovery Server API doesn't directly provide the connected source name. The `p_input_name` field of the `NDIlib_receiver_t` structure is always empty.

### The Solution
NDI 6 introduces an **event system** that allows monitoring receiver state in real-time. Through these events, we can obtain:
- Connected source name (`source-name`)
- Connection state (`connection-state`)
- Audio/video codecs in use
- Resolution and frame rate
- And many other details

### Key APIs
- `NDIlib_recv_listener_create` — creates a listener for receiver monitoring
- `NDIlib_recv_listener_subscribe_events` — subscribes to events for a specific receiver
- `NDIlib_recv_listener_get_events` — polls pending events
- `NDIlib_recv_listener_free_events` — frees event memory

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    NDI Discovery Server                      │
│                   (NDI SDK 6)                                │
└────────────────┬────────────────────────────┬────────────────┘
                 │                            │
                 │ Register                   │ Register
                 │                            │
    ┌────────────▼────────────┐  ┌───────────▼────────────┐
    │    NDI Senders          │  │   NDI Receivers        │
    │  (SendAdvertiser)       │  │  (Studio Monitor)      │
    │                         │  │                        │
    │  - SENDER 001           │  │  - Monitor 1           │
    │  - SENDER 002           │  │  - Monitor 2           │
    └─────────────────────────┘  └────────────────────────┘
                 ▲                            │
                 │                            │
                 │ Monitor                    │ Subscribe to Events
                 │                            │
    ┌────────────┴────────────────────────────▼────────────┐
    │              NDI Manager Application                 │
    │                                                       │
    │  ┌───────────────────────────────────────────────┐  │
    │  │   NDISendListener                             │  │
    │  │   - Monitors registered senders               │  │
    │  └───────────────────────────────────────────────┘  │
    │                                                       │
    │  ┌───────────────────────────────────────────────┐  │
    │  │   NDIRecvListener                             │  │
    │  │   - Monitors registered receivers             │  │
    │  │   - Subscribes to receiver events             │  │
    │  │   - Receives source-name, connection-state... │  │
    │  └───────────────────────────────────────────────┘  │
    │                                                       │
    │  ┌───────────────────────────────────────────────┐  │
    │  │   NDIDiscoveryService                         │  │
    │  │   - Polls events every 2 seconds              │  │
    │  │   - Caches source names from events           │  │
    │  │   - Populates CurrentSource field             │  │
    │  └───────────────────────────────────────────────┘  │
    │                                                       │
    │  ┌───────────────────────────────────────────────┐  │
    │  │   REST API                                    │  │
    │  │   GET /api/ndi/receivers                      │  │
    │  │   - Returns receiver with currentSource       │  │
    │  └───────────────────────────────────────────────┘  │
    └───────────────────────────────────────────────────────┘
```

---

## Prerequisites

1. **NDI 6 SDK** installed
2. **Discovery Server** active on the network
3. **.NET 9.0 SDK** or higher
4. DLL file: `Processing.NDI.Lib.x64.dll`

---

## Step-by-Step Implementation

### Step 1: Add RecvListener Functions to NDI Wrapper

**File:** `NDIWrapper.cs`

```csharp
// RecvListener API - NDI 6
[DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
public static extern IntPtr NDIlib_recv_listener_create(ref recv_listener_create_t p_create_settings);

[DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
public static extern void NDIlib_recv_listener_destroy(IntPtr p_instance);

// Event subscription functions
[DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
public static extern void NDIlib_recv_listener_subscribe_events(
    IntPtr p_instance,
    string p_receiver_uuid);

[DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
public static extern void NDIlib_recv_listener_unsubscribe_events(
    IntPtr p_instance,
    string p_receiver_uuid);

[DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
public static extern IntPtr NDIlib_recv_listener_get_events(
    IntPtr p_instance,
    ref uint p_num_events,
    uint timeout_in_ms);

[DllImport(DLL_NAME, CallingConvention = CallingConvention.Cdecl)]
public static extern void NDIlib_recv_listener_free_events(
    IntPtr p_instance,
    IntPtr p_events);
```

### Step 2: Define Event Structure

**File:** `NDIWrapper.cs`

```csharp
[StructLayout(LayoutKind.Sequential)]
public struct listener_event
{
    public IntPtr p_uuid;   // UUID of receiver that generated the event
    public IntPtr p_name;   // Event name (e.g. "source-name", "connection-state")
    public IntPtr p_value;  // Event value
}
```

### Step 3: Create Event Class

**File:** `NDIRecvListener.cs`

```csharp
/// <summary>
/// Represents an event received from an NDI receiver
/// </summary>
public class NDIReceiverEvent
{
    public string ReceiverUuid { get; set; } = string.Empty;
    public string EventName { get; set; } = string.Empty;
    public string EventValue { get; set; } = string.Empty;
}
```

### Step 4: Initialize the RecvListener

**File:** `NDIRecvListener.cs`

```csharp
/// <summary>
/// Initialize the RecvListener
/// </summary>
public bool Initialize(string? discoveryServerUrl = null)
{
    var listenerSettings = new NDI.recv_listener_create_t
    {
        p_url_address = IntPtr.Zero
    };

    _listenerInstance = NDI.NDIlib_recv_listener_create(ref listenerSettings);

    if (_listenerInstance == IntPtr.Zero)
    {
        return false;
    }

    return true;
}
```

### Step 5: Implement Automatic Event Subscription

**File:** `NDIRecvListener.cs`

```csharp
public List<NDIReceiverInfo> GetReceivers()
{
    var receiverList = new List<NDIReceiverInfo>();

    if (_listenerInstance == IntPtr.Zero)
        return receiverList;

    uint numReceivers = 0;
    IntPtr receiversPtr = NDI.NDIlib_recv_listener_get_receivers(_listenerInstance, ref numReceivers);

    if (receiversPtr == IntPtr.Zero || numReceivers == 0)
        return receiverList;

    int structSize = Marshal.SizeOf<NDI.receiver_t>();

    for (int i = 0; i < numReceivers; i++)
    {
        IntPtr currentPtr = IntPtr.Add(receiversPtr, i * structSize);
        var receiver = Marshal.PtrToStructure<NDI.receiver_t>(currentPtr);

        string uuid = receiver.p_uuid != IntPtr.Zero ? Marshal.PtrToStringAnsi(receiver.p_uuid) ?? "" : "";
        string name = receiver.p_name != IntPtr.Zero ? Marshal.PtrToStringAnsi(receiver.p_name) ?? "" : "";
        string inputUuid = receiver.p_input_uuid != IntPtr.Zero ? Marshal.PtrToStringAnsi(receiver.p_input_uuid) ?? "" : "";

        var receiverInfo = new NDIReceiverInfo
        {
            Id = uuid,
            Name = name,
            InputUuid = !string.IsNullOrEmpty(inputUuid) ? inputUuid : null,
            IsConnected = !string.IsNullOrEmpty(inputUuid),
            LastSeen = DateTime.Now
        };

        receiverList.Add(receiverInfo);

        // AUTOMATIC EVENT SUBSCRIPTION
        if (!receiver.events_subscribed && !string.IsNullOrEmpty(uuid))
        {
            SubscribeEvents(uuid);
        }
    }

    return receiverList;
}
```

### Step 6: Implement Event Polling

**File:** `NDIRecvListener.cs`

```csharp
/// <summary>
/// Get pending events from subscribed receivers
/// </summary>
/// <param name="timeoutMs">Timeout in milliseconds (0 = don't wait)</param>
/// <returns>List of receiver events</returns>
public List<NDIReceiverEvent> GetEvents(uint timeoutMs = 0)
{
    var eventList = new List<NDIReceiverEvent>();

    if (_listenerInstance == IntPtr.Zero)
        return eventList;

    uint numEvents = 0;
    IntPtr eventsPtr = NDI.NDIlib_recv_listener_get_events(_listenerInstance, ref numEvents, timeoutMs);

    if (eventsPtr == IntPtr.Zero || numEvents == 0)
        return eventList;

    try
    {
        int structSize = Marshal.SizeOf<NDI.listener_event>();

        for (int i = 0; i < numEvents; i++)
        {
            IntPtr currentPtr = IntPtr.Add(eventsPtr, i * structSize);
            var evt = Marshal.PtrToStructure<NDI.listener_event>(currentPtr);

            string uuid = evt.p_uuid != IntPtr.Zero ? Marshal.PtrToStringAnsi(evt.p_uuid) ?? "" : "";
            string name = evt.p_name != IntPtr.Zero ? Marshal.PtrToStringAnsi(evt.p_name) ?? "" : "";
            string value = evt.p_value != IntPtr.Zero ? Marshal.PtrToStringAnsi(evt.p_value) ?? "" : "";

            eventList.Add(new NDIReceiverEvent
            {
                ReceiverUuid = uuid,
                EventName = name,
                EventValue = value
            });
        }
    }
    finally
    {
        // CRITICAL: Always free the events memory
        NDI.NDIlib_recv_listener_free_events(_listenerInstance, eventsPtr);
    }

    return eventList;
}
```

### Step 7: Implement Source Name Caching

**File:** `NDIDiscoveryService.cs`

```csharp
public class NDIDiscoveryService : BackgroundService
{
    private readonly NDIRecvListener _recvListener;
    private readonly ConcurrentDictionary<string, NDIReceiverInfo> _receivers;

    // CACHE: Persistent cache of receiver UUID -> source name from events
    private readonly ConcurrentDictionary<string, string> _receiverSourceNames;

    private void DiscoverDevices(object? state)
    {
        try
        {
            var receivers = _recvListener.GetReceivers();

            // Poll for events and update persistent cache
            var events = _recvListener.GetEvents(0);  // 0 = non-blocking
            foreach (var evt in events)
            {
                if (evt.EventName == "source-name")
                {
                    if (!string.IsNullOrEmpty(evt.EventValue))
                    {
                        _receiverSourceNames[evt.ReceiverUuid] = evt.EventValue;
                    }
                }

                if (evt.EventName == "connection-state" && evt.EventValue == "disconnected")
                {
                    _receiverSourceNames.TryRemove(evt.ReceiverUuid, out _);
                }
            }

            // Update receivers and populate CurrentSource from cache
            _receivers.Clear();
            foreach (var receiver in receivers)
            {
                if (_receiverSourceNames.TryGetValue(receiver.Id, out var sourceName))
                {
                    receiver.CurrentSource = sourceName;
                    receiver.IsConnected = true;
                }

                _receivers[receiver.Id] = receiver;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during NDI discovery");
        }
    }
}
```

---

## Testing

### Test 1: Verify Event Reception

Start the application and check that events are being received:

```
[NDIRecvListener] Subscribed to events for receiver: MEDIANEWS-ZBOOK (NDI Studio Monitor 1)
[Event] UUID: 0386dbe3-..., Name: source-name, Value: MEDIANEWS-ZBOOK (SENDER 001)
[Event] UUID: 0386dbe3-..., Name: connection-state, Value: connected
[Event] UUID: 0386dbe3-..., Name: video-resolution, Value: 1920x1080
[Event] UUID: 0386dbe3-..., Name: video-codec, Value: shq7
```

### Test 2: Verify REST API

```bash
# Request
curl http://localhost:5000/api/ndi/receivers

# Expected response
[
  {
    "id": "0386dbe3-dabb-4ad6-a4e9-1ff55f85cee9",
    "name": "MEDIANEWS-ZBOOK (NDI Studio Monitor 1)",
    "inputUuid": "236514f6-104b-4efc-a1f1-ba919f789712",
    "currentSource": "MEDIANEWS-ZBOOK (SENDER 001)",
    "isConnected": true,
    "status": "Connected"
  }
]
```

### Test 3: Test Disconnection/Reconnection

1. Disconnect a monitor from Studio Monitor
2. Verify you receive a `connection-state: disconnected` event
3. Verify `currentSource` becomes `null` in the API
4. Reconnect the monitor
5. Verify you receive a `source-name` event with the new name
6. Verify `currentSource` is updated

---

## Troubleshooting

### Problem: No Events Received

**Symptom:** `events_subscribed` is `True` but no events appear.

**Possible causes:**
- The listener was not created successfully (check return value)
- The Discovery Server is not reachable
- No state changes have occurred (events are edge-triggered)

**Solution:**
1. Verify `NDIlib_recv_listener_create` returns a valid pointer
2. Check Discovery Server connectivity with `NDIlib_recv_listener_is_connected`
3. Trigger a state change (connect/disconnect a receiver) to generate events

### Problem: Events Received Only on First Poll

**Symptom:** Events received only at startup, then nothing.

**Cause:** Events are **edge-triggered**: they're only sent when a value changes.

**Solution:**
Implement a persistent cache (`ConcurrentDictionary`) to store event values:

```csharp
private readonly ConcurrentDictionary<string, string> _receiverSourceNames;
```

### Problem: Memory Leak

**Symptom:** Memory usage grows over time.

**Cause:** Not calling `NDIlib_recv_listener_free_events` after processing events.

**Solution:**
Always use a `try-finally` block:

```csharp
try
{
    // Process events...
}
finally
{
    NDI.NDIlib_recv_listener_free_events(_listenerInstance, eventsPtr);
}
```

---

## Best Practices

### 1. Event Polling Frequency

Don't poll too frequently. Events are edge-triggered and only sent when a value changes.

**Recommended:** 1-2 seconds

```csharp
_discoveryTimer = new Timer(DiscoverDevices, null, TimeSpan.Zero, TimeSpan.FromSeconds(2));
```

### 2. Event Caching

Always implement a cache for important events like `source-name`, since they're only sent on state change.

```csharp
private readonly ConcurrentDictionary<string, string> _receiverSourceNames;
```

### 3. Automatic Subscription

Automatically subscribe to events when discovering a new receiver:

```csharp
if (!receiver.events_subscribed && !string.IsNullOrEmpty(uuid))
{
    SubscribeEvents(uuid);
}
```

### 4. Connection State Monitoring

Monitor the `connection-state` event to detect disconnections:

```csharp
if (evt.EventName == "connection-state")
{
    if (evt.EventValue == "disconnected")
    {
        // Handle disconnection
    }
}
```

### 5. Error Handling

Always handle errors during event processing:

```csharp
try
{
    var events = _recvListener.GetEvents(0);
    // Process events...
}
catch (Exception ex)
{
    _logger.LogError(ex, "Error processing NDI events");
}
```

### 6. Resource Cleanup

Always clean up resources in `Dispose`:

```csharp
public void Dispose()
{
    if (_listenerInstance != IntPtr.Zero)
    {
        NDI.NDIlib_recv_listener_destroy(_listenerInstance);
        _listenerInstance = IntPtr.Zero;
    }
    GC.SuppressFinalize(this);
}
```

---

## Available Events

Here's a list of the most common events you can receive:

| Event Name | Description | Example Value |
|------------|-------------|---------------|
| `source-name` | Connected source name | `MEDIANEWS-ZBOOK (SENDER 001)` |
| `connection-state` | Connection state | `connected`, `disconnected` |
| `video-resolution` | Video resolution | `1920x1080` |
| `video-frame-rate` | Video frame rate | `50/1` |
| `video-codec` | Video codec in use | `shq7`, `h264`, `h265` |
| `video-receive-mode` | Video receive mode | `single-tcp`, `multicast` |
| `audio-sample-rate` | Audio sample rate | `48000` |
| `audio-channels` | Number of audio channels | `8` |
| `audio-codec` | Audio codec in use | `pcm`, `aac` |
| `audio-receive-mode` | Audio receive mode | `single-tcp`, `multicast` |
| `sdk-version` | Receiver's NDI SDK version | `6.3.0.0` |

---

## References

- **NDI SDK 6 Documentation** — RecvListener and SendListener API sections
- **NDI SDK 6 C# Examples** — `Examples/C#/Managed NDI Recv Listener`
- **NDI Discovery Server Protocol** — Official Vizrt NDI documentation

---

## Conclusion

The NDI 6 event system provides a powerful and efficient way to monitor receiver state in real-time. The key steps are:

1. **Create listeners** with `NDIlib_recv_listener_create`
2. **Automatically subscribe** to events for each receiver
3. **Implement a cache** for edge-triggered events
4. **Poll regularly** for events (1-2 seconds)
5. **Always manage** memory with `free_events`

With this implementation, you'll have a complete NDI monitoring system that shows in real-time which source is connected to which receiver!

---

**Version:** 2.0
**Date:** February 2026
**Author:** NDI Manager Development Team
