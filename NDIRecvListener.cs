using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Extensions.Logging;
using NDIManager.Models;

namespace NDIManager;

/// <summary>
/// Represents an event from an NDI receiver
/// </summary>
public class NDIReceiverEvent
{
    public string ReceiverUuid { get; set; } = string.Empty;
    public string EventName { get; set; } = string.Empty;
    public string EventValue { get; set; } = string.Empty;
}

/// <summary>
/// Recv Listener API (NDI Discovery Server — receiver monitoring).
/// </summary>
public class NDIRecvListener : IDisposable
{
    private readonly ILogger<NDIRecvListener> _logger;
    private IntPtr _listenerInstance = IntPtr.Zero;
    private IntPtr _discoveryUrlAlloc = IntPtr.Zero;
    private readonly object _subscriptionLock = new();
    private readonly HashSet<string> _subscribedReceiverUuids = new(StringComparer.Ordinal);

    public NDIRecvListener(ILogger<NDIRecvListener> logger)
    {
        _logger = logger;
    }

    public bool IsConnected
    {
        get
        {
            if (_listenerInstance == IntPtr.Zero)
                return false;
            return NDI.NDIlib_recv_listener_is_connected(_listenerInstance);
        }
    }

    public string? ServerUrl
    {
        get
        {
            if (_listenerInstance == IntPtr.Zero)
                return null;
            IntPtr urlPtr = NDI.NDIlib_recv_listener_get_server_url(_listenerInstance);
            if (urlPtr == IntPtr.Zero)
                return null;
            return NdiStringUtil.PtrToUtf8String(urlPtr);
        }
    }

    /// <summary>Call only after <c>NDIlib_initialize()</c>.</summary>
    public bool Initialize(string? discoveryServerUrl = null)
    {
        TeardownListener();

        if (!string.IsNullOrWhiteSpace(discoveryServerUrl))
            _discoveryUrlAlloc = NdiStringUtil.AllocUtf8NullTerminated(discoveryServerUrl);

        var listenerSettings = new NDI.recv_listener_create_t
        {
            p_url_address = _discoveryUrlAlloc
        };

        _listenerInstance = NDI.NDIlib_recv_listener_create(ref listenerSettings);

        lock (_subscriptionLock)
            _subscribedReceiverUuids.Clear();

        if (_listenerInstance == IntPtr.Zero)
        {
            _logger.LogWarning(
                "[NDI RecvListener] NDIlib_recv_listener_create failed (url_param={Url})",
                discoveryServerUrl ?? "(SDK default)");
            FreeDiscoveryUrlAlloc();
            return false;
        }

        _logger.LogInformation(
            "[NDI RecvListener] created: url_param={UrlParam}, connected={Connected}, server_url={ServerUrl}",
            discoveryServerUrl ?? "(SDK default)",
            IsConnected,
            ServerUrl ?? "NULL");

        return true;
    }

    public bool WaitForReceivers(uint timeoutMs = 0)
    {
        if (_listenerInstance == IntPtr.Zero)
            return false;
        return NDI.NDIlib_recv_listener_wait_for_receivers(_listenerInstance, timeoutMs);
    }

    public List<NDIReceiverInfo> GetReceivers()
    {
        var receiverList = new List<NDIReceiverInfo>();

        if (_listenerInstance == IntPtr.Zero)
        {
            _logger.LogWarning("[NDI RecvListener] get_receivers: listener instance is NULL");
            return receiverList;
        }

        uint numReceivers = 0;
        IntPtr receiversPtr = NDI.NDIlib_recv_listener_get_receivers(_listenerInstance, ref numReceivers);

        if (receiversPtr == IntPtr.Zero || numReceivers == 0)
        {
            _logger.LogDebug("[NDI RecvListener] get_receivers: count=0");
            return receiverList;
        }

        int structSize = Marshal.SizeOf<NDI.receiver_t>();
        var namesForLog = new List<string>();

        for (int i = 0; i < numReceivers; i++)
        {
            try
            {
                IntPtr currentPtr = IntPtr.Add(receiversPtr, i * structSize);
                var receiver = Marshal.PtrToStructure<NDI.receiver_t>(currentPtr);

                string uuid = NdiStringUtil.PtrToUtf8String(receiver.p_uuid);
                string name = NdiStringUtil.PtrToUtf8String(receiver.p_name);
                string inputUuid = NdiStringUtil.PtrToUtf8String(receiver.p_input_uuid);
                string inputName = NdiStringUtil.PtrToUtf8String(receiver.p_input_name);
                string address = NdiStringUtil.PtrToUtf8String(receiver.p_address);

                namesForLog.Add(string.IsNullOrEmpty(name) ? $"(unnamed uuid={uuid})" : name);

                var streams = new List<string>();
                if (receiver.p_streams != IntPtr.Zero && receiver.num_streams > 0)
                {
                    for (uint s = 0; s < receiver.num_streams; s++)
                    {
                        int val = Marshal.ReadInt32(receiver.p_streams, (int)(s * sizeof(int)));
                        streams.Add(((NDI.receiver_type)val) switch
                        {
                            NDI.receiver_type.Video => "video",
                            NDI.receiver_type.Audio => "audio",
                            NDI.receiver_type.Metadata => "metadata",
                            _ => $"unknown({val})"
                        });
                    }
                }

                var commands = new List<string>();
                if (receiver.p_commands != IntPtr.Zero && receiver.num_commands > 0)
                {
                    for (uint c = 0; c < receiver.num_commands; c++)
                    {
                        int val = Marshal.ReadInt32(receiver.p_commands, (int)(c * sizeof(int)));
                        commands.Add(((NDI.receiver_command)val) switch
                        {
                            NDI.receiver_command.Connect => "connect",
                            _ => $"unknown({val})"
                        });
                    }
                }

                var receiverInfo = new NDIReceiverInfo
                {
                    Id = uuid,
                    Name = name,
                    Address = address,
                    InputGroupUuid = !string.IsNullOrEmpty(inputUuid) ? inputUuid : null,
                    InputGroupName = !string.IsNullOrEmpty(inputName) ? inputName : null,
                    InputUuid = !string.IsNullOrEmpty(inputUuid) ? inputUuid : null,
                    CurrentSource = !string.IsNullOrEmpty(inputName) ? inputName : null,
                    IsConnected = !string.IsNullOrEmpty(inputUuid),
                    Streams = streams,
                    Commands = commands,
                    LastSeen = DateTime.Now
                };

                receiverList.Add(receiverInfo);
                EnsureSubscribedToReceiverEvents(uuid);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[NDI RecvListener] ERROR parsing receiver index {Index}", i);
            }
        }

        _logger.LogInformation(
            "[NDI RecvListener] get_receivers: count={Count}, p_name[]=[{Names}]",
            numReceivers,
            string.Join(" | ", namesForLog));

        return receiverList;
    }

    private void EnsureSubscribedToReceiverEvents(string uuid)
    {
        if (_listenerInstance == IntPtr.Zero || string.IsNullOrEmpty(uuid))
            return;

        lock (_subscriptionLock)
        {
            if (_subscribedReceiverUuids.Contains(uuid))
                return;

            NDI.NDIlib_recv_listener_subscribe_events(_listenerInstance, uuid);
            _subscribedReceiverUuids.Add(uuid);
            _logger.LogInformation("[NDI RecvListener] subscribe_events: receiver_uuid={Uuid}", uuid);
        }
    }

    public void SubscribeEvents(string receiverUuid) => EnsureSubscribedToReceiverEvents(receiverUuid);

    public bool SendConnectCommand(string receiverUuid, string sourceName)
    {
        if (_listenerInstance == IntPtr.Zero || string.IsNullOrEmpty(receiverUuid) || string.IsNullOrEmpty(sourceName))
            return false;

        return NDI.NDIlib_recv_listener_send_connect(_listenerInstance, receiverUuid, sourceName);
    }

    public bool SendDisconnectCommand(string receiverUuid)
    {
        if (_listenerInstance == IntPtr.Zero || string.IsNullOrEmpty(receiverUuid))
            return false;

        return NDI.NDIlib_recv_listener_send_connect(_listenerInstance, receiverUuid, "");
    }

    public void UnsubscribeEvents(string receiverUuid)
    {
        if (_listenerInstance == IntPtr.Zero || string.IsNullOrEmpty(receiverUuid))
            return;

        lock (_subscriptionLock)
        {
            if (!_subscribedReceiverUuids.Contains(receiverUuid))
                return;

            NDI.NDIlib_recv_listener_unsubscribe_events(_listenerInstance, receiverUuid);
            _subscribedReceiverUuids.Remove(receiverUuid);
            _logger.LogInformation("[NDI RecvListener] unsubscribe_events: receiver_uuid={Uuid}", receiverUuid);
        }
    }

    public List<NDIReceiverEvent> GetEvents(uint timeoutMs = 0)
    {
        var eventList = new List<NDIReceiverEvent>();

        if (_listenerInstance == IntPtr.Zero)
            return eventList;

        uint numEvents = 0;
        IntPtr eventsPtr = NDI.NDIlib_recv_listener_get_events(_listenerInstance, ref numEvents, timeoutMs);

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
                    "[NDI RecvListener] event: receiver_uuid={Uuid}, p_name={EventName}, p_value={EventValue}",
                    uuid,
                    name,
                    value);

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
            NDI.NDIlib_recv_listener_free_events(_listenerInstance, eventsPtr);
        }

        return eventList;
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
            uuids = new List<string>(_subscribedReceiverUuids);
            _subscribedReceiverUuids.Clear();
        }

        foreach (var uuid in uuids)
        {
            if (!string.IsNullOrEmpty(uuid))
                NDI.NDIlib_recv_listener_unsubscribe_events(_listenerInstance, uuid);
        }

        NDI.NDIlib_recv_listener_destroy(_listenerInstance);
        _listenerInstance = IntPtr.Zero;

        FreeDiscoveryUrlAlloc();
        _logger.LogInformation("[NDI RecvListener] destroyed listener instance");
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
