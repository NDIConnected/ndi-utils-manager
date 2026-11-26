using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using NDIManager.Models;

namespace NDIManager;

/// <summary>
/// Represents an event from an NDI sender
/// </summary>
public class NDISenderEvent
{
    public string SenderUuid { get; set; } = string.Empty;
    public string EventName { get; set; } = string.Empty;
    public string EventValue { get; set; } = string.Empty;
}

/// <summary>
/// Send Listener API (NDI Discovery Server — sender monitoring, §18).
/// Not the same as NDIlib_find source enumeration.
/// </summary>
public class NDISendListener : IDisposable
{
    private readonly ILogger<NDISendListener> _logger;
    private IntPtr _listenerInstance = IntPtr.Zero;
    private IntPtr _discoveryUrlAlloc = IntPtr.Zero;
    private readonly object _subscriptionLock = new();
    private readonly HashSet<string> _subscribedSenderUuids = new(StringComparer.Ordinal);

    public NDISendListener(ILogger<NDISendListener> logger)
    {
        _logger = logger;
    }

    /// <summary>True when the native listener instance exists (create can fail while no Discovery Server is reachable).</summary>
    public bool IsCreated => _listenerInstance != IntPtr.Zero;

    public bool IsConnected
    {
        get
        {
            if (_listenerInstance == IntPtr.Zero)
                return false;
            return NDI.NDIlib_send_listener_is_connected(_listenerInstance);
        }
    }

    public string? ServerUrl
    {
        get
        {
            if (_listenerInstance == IntPtr.Zero)
                return null;
            IntPtr urlPtr = NDI.NDIlib_send_listener_get_server_url(_listenerInstance);
            if (urlPtr == IntPtr.Zero)
                return null;
            return NdiStringUtil.PtrToUtf8String(urlPtr);
        }
    }

    /// <summary>
    /// Call only after <c>NDIlib_initialize()</c>. <paramref name="discoveryServerUrl"/> is e.g. <c>192.168.1.10:5959</c> or null for SDK default.
    /// </summary>
    public bool Initialize(string? discoveryServerUrl = null)
    {
        TeardownListener();

        if (!string.IsNullOrWhiteSpace(discoveryServerUrl))
            _discoveryUrlAlloc = NdiStringUtil.AllocUtf8NullTerminated(discoveryServerUrl);

        var listenerSettings = new NDI.send_listener_create_t
        {
            p_url_address = _discoveryUrlAlloc
        };

        _listenerInstance = NDI.NDIlib_send_listener_create(ref listenerSettings);

        lock (_subscriptionLock)
            _subscribedSenderUuids.Clear();

        if (_listenerInstance == IntPtr.Zero)
        {
            _logger.LogWarning(
                "[NDI SendListener] NDIlib_send_listener_create failed (url_param={Url})",
                discoveryServerUrl ?? "(SDK default)");
            FreeDiscoveryUrlAlloc();
            return false;
        }

        _logger.LogInformation(
            "[NDI SendListener] created: url_param={UrlParam}, connected={Connected}, server_url={ServerUrl}",
            discoveryServerUrl ?? "(SDK default)",
            IsConnected,
            ServerUrl ?? "NULL");

        return true;
    }

    /// <summary>Poll-friendly: returns immediately if nothing pending.</summary>
    public bool WaitForSenders(uint timeoutMs = 0)
    {
        if (_listenerInstance == IntPtr.Zero)
            return false;
        return NDI.NDIlib_send_listener_wait_for_senders(_listenerInstance, timeoutMs);
    }

    public List<NDISenderInfo> GetSenders()
    {
        var senderList = new List<NDISenderInfo>();

        if (_listenerInstance == IntPtr.Zero)
            return senderList;

        uint numSenders = 0;
        IntPtr sendersPtr = NDI.NDIlib_send_listener_get_senders(_listenerInstance, ref numSenders);

        if (sendersPtr == IntPtr.Zero || numSenders == 0)
        {
            _logger.LogDebug("[NDI SendListener] get_senders: count=0");
            return senderList;
        }

        int structSize = Marshal.SizeOf<NDI.sender_t>();
        var namesForLog = new List<string>();

        for (int i = 0; i < numSenders; i++)
        {
            IntPtr currentPtr = IntPtr.Add(sendersPtr, i * structSize);
            var sender = Marshal.PtrToStructure<NDI.sender_t>(currentPtr);

            string uuid = NdiStringUtil.PtrToUtf8String(sender.p_uuid);
            string name = NdiStringUtil.PtrToUtf8String(sender.p_name);
            string metadata = NdiStringUtil.PtrToUtf8String(sender.p_metadata);
            string address = NdiStringUtil.PtrToUtf8String(sender.p_address);

            namesForLog.Add(string.IsNullOrEmpty(name) ? $"(unnamed uuid={uuid})" : name);

            var senderInfo = new NDISenderInfo
            {
                Id = uuid,
                Name = name,
                HostName = address,
                Address = address,
                Port = sender.port,
                SourceMetadata = metadata,
                LastSeen = DateTime.Now
            };

            senderList.Add(senderInfo);

            EnsureSubscribedToSenderEvents(uuid);
        }

        _logger.LogInformation(
            "[NDI SendListener] get_senders: count={Count}, p_name[]=[{Names}]",
            numSenders,
            string.Join(" | ", namesForLog));

        return senderList;
    }

    private void EnsureSubscribedToSenderEvents(string uuid)
    {
        if (_listenerInstance == IntPtr.Zero || string.IsNullOrEmpty(uuid))
            return;

        lock (_subscriptionLock)
        {
            if (_subscribedSenderUuids.Contains(uuid))
                return;

            NDI.NDIlib_send_listener_subscribe_events(_listenerInstance, uuid);
            _subscribedSenderUuids.Add(uuid);
            _logger.LogInformation("[NDI SendListener] subscribe_events: sender_uuid={Uuid}", uuid);
        }
    }

    public void SubscribeEvents(string senderUuid) => EnsureSubscribedToSenderEvents(senderUuid);

    public void UnsubscribeEvents(string senderUuid)
    {
        if (_listenerInstance == IntPtr.Zero || string.IsNullOrEmpty(senderUuid))
            return;

        lock (_subscriptionLock)
        {
            if (!_subscribedSenderUuids.Contains(senderUuid))
                return;

            NDI.NDIlib_send_listener_unsubscribe_events(_listenerInstance, senderUuid);
            _subscribedSenderUuids.Remove(senderUuid);
            _logger.LogInformation("[NDI SendListener] unsubscribe_events: sender_uuid={Uuid}", senderUuid);
        }
    }

    public List<NDISenderEvent> GetEvents(uint timeoutMs = 0)
    {
        var eventList = new List<NDISenderEvent>();

        if (_listenerInstance == IntPtr.Zero)
            return eventList;

        uint numEvents = 0;
        IntPtr eventsPtr = NDI.NDIlib_send_listener_get_events(_listenerInstance, ref numEvents, timeoutMs);

        if (eventsPtr == IntPtr.Zero)
            return eventList;

        try
        {
            if (numEvents == 0)
                return eventList;

            int structSize = Marshal.SizeOf<NDI.listener_event>();

            for (int i = 0; i < numEvents; i++)
            {
                IntPtr currentPtr = IntPtr.Add(eventsPtr, i * structSize);
                var evt = Marshal.PtrToStructure<NDI.listener_event>(currentPtr);

                string uuid = NdiStringUtil.PtrToUtf8String(evt.p_uuid);
                string name = NdiStringUtil.PtrToUtf8String(evt.p_name);
                string value = NdiStringUtil.PtrToUtf8String(evt.p_value);

                _logger.LogInformation(
                    "[NDI SendListener] event: sender_uuid={Uuid}, p_name={EventName}, p_value={EventValue}",
                    uuid,
                    name,
                    value);

                eventList.Add(new NDISenderEvent
                {
                    SenderUuid = uuid,
                    EventName = name,
                    EventValue = value
                });
            }
        }
        finally
        {
            NDI.NDIlib_send_listener_free_events(_listenerInstance, eventsPtr);
        }

        return eventList;
    }

    /// <summary>
    /// Forgets local subscription bookkeeping (no native calls) so the next discovery pass subscribes again,
    /// e.g. after the Discovery Server connection was lost and restored.
    /// </summary>
    public void ResetSubscriptions()
    {
        lock (_subscriptionLock)
            _subscribedSenderUuids.Clear();
    }

    private void TeardownListener()
    {
        if (_listenerInstance == IntPtr.Zero)
        {
            FreeDiscoveryUrlAlloc();
            return;
        }

        List<string> uuids;
        lock (_subscriptionLock)
        {
            uuids = new List<string>(_subscribedSenderUuids);
            _subscribedSenderUuids.Clear();
        }

        foreach (var uuid in uuids)
        {
            if (!string.IsNullOrEmpty(uuid))
                NDI.NDIlib_send_listener_unsubscribe_events(_listenerInstance, uuid);
        }

        NDI.NDIlib_send_listener_destroy(_listenerInstance);
        _listenerInstance = IntPtr.Zero;

        FreeDiscoveryUrlAlloc();
        _logger.LogInformation("[NDI SendListener] destroyed listener instance");
    }

    private void FreeDiscoveryUrlAlloc()
    {
        if (_discoveryUrlAlloc == IntPtr.Zero)
            return;
        Marshal.FreeHGlobal(_discoveryUrlAlloc);
        _discoveryUrlAlloc = IntPtr.Zero;
    }

    public void Dispose()
    {
        TeardownListener();
        GC.SuppressFinalize(this);
    }
}
