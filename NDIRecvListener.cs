using System.Runtime.InteropServices;
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
/// Helper class for monitoring NDI receivers registered in the Discovery Service (NDI 6 SDK)
/// </summary>
public class NDIRecvListener : IDisposable
{
    private IntPtr _listenerInstance = IntPtr.Zero;

    public NDIRecvListener()
    {
        Initialize();
    }

    /// <summary>
    /// Gets whether the listener is connected to the Discovery Server
    /// </summary>
    public bool IsConnected
    {
        get
        {
            if (_listenerInstance == IntPtr.Zero)
                return false;
            return NDI.NDIlib_recv_listener_is_connected(_listenerInstance);
        }
    }

    /// <summary>
    /// Gets the URL of the Discovery Server
    /// </summary>
    public string? ServerUrl
    {
        get
        {
            if (_listenerInstance == IntPtr.Zero)
                return null;
            IntPtr urlPtr = NDI.NDIlib_recv_listener_get_server_url(_listenerInstance);
            if (urlPtr == IntPtr.Zero)
                return null;
            return Marshal.PtrToStringAnsi(urlPtr);
        }
    }

    /// <summary>
    /// Initialize the RecvListener
    /// </summary>
    /// <param name="discoveryServerUrl">URL of the Discovery Server (null = default)</param>
    /// <returns>True if successfully initialized</returns>
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

    /// <summary>
    /// Get the current list of registered receivers
    /// </summary>
    /// <returns>List of receiver information</returns>
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

            // Debug logging to see raw values from Discovery Server
            string uuid = receiver.p_uuid != IntPtr.Zero ? Marshal.PtrToStringAnsi(receiver.p_uuid) ?? "" : "";
            string name = receiver.p_name != IntPtr.Zero ? Marshal.PtrToStringAnsi(receiver.p_name) ?? "" : "";
            string inputUuid = receiver.p_input_uuid != IntPtr.Zero ? Marshal.PtrToStringAnsi(receiver.p_input_uuid) ?? "" : "";
            string inputName = receiver.p_input_name != IntPtr.Zero ? Marshal.PtrToStringAnsi(receiver.p_input_name) ?? "" : "";
            string address = receiver.p_address != IntPtr.Zero ? Marshal.PtrToStringAnsi(receiver.p_address) ?? "" : "";

            Console.WriteLine($"[NDIRecvListener] Receiver {i}:");
            Console.WriteLine($"  UUID: {uuid}");
            Console.WriteLine($"  Name: {name}");
            Console.WriteLine($"  Input UUID: {inputUuid}");
            Console.WriteLine($"  Input Name: {inputName}");
            Console.WriteLine($"  Address: {address}");
            Console.WriteLine($"  Num Streams: {receiver.num_streams}");
            Console.WriteLine($"  Num Commands: {receiver.num_commands}");
            Console.WriteLine($"  Events Subscribed: {receiver.events_subscribed}");

            var receiverInfo = new NDIReceiverInfo
            {
                Id = uuid,
                Name = name,
                InputUuid = !string.IsNullOrEmpty(inputUuid) ? inputUuid : null,
                CurrentSource = !string.IsNullOrEmpty(inputName) ? inputName : null,
                IsConnected = !string.IsNullOrEmpty(inputUuid),  // Connected if has an input UUID
                LastSeen = DateTime.Now
            };

            receiverList.Add(receiverInfo);

            // Automatically subscribe to events if not already subscribed
            if (!receiver.events_subscribed && !string.IsNullOrEmpty(uuid))
            {
                SubscribeEvents(uuid);
                Console.WriteLine($"[NDIRecvListener] Subscribed to events for receiver: {name}");
            }
        }

        return receiverList;
    }

    /// <summary>
    /// Wait for changes in the receiver list
    /// </summary>
    /// <param name="timeoutMs">Timeout in milliseconds</param>
    /// <returns>True if changes detected within timeout</returns>
    public bool WaitForChanges(uint timeoutMs = 5000)
    {
        if (_listenerInstance == IntPtr.Zero)
            return false;

        return NDI.NDIlib_recv_listener_wait_for_receivers(_listenerInstance, timeoutMs);
    }

    /// <summary>
    /// Send a CONNECT command to a receiver
    /// </summary>
    /// <param name="receiverUuid">UUID of the receiver</param>
    /// <param name="sourceName">Name of the source to connect to</param>
    /// <returns>True if command sent successfully</returns>
    public bool SendConnectCommand(string receiverUuid, string sourceName)
    {
        if (_listenerInstance == IntPtr.Zero || string.IsNullOrEmpty(receiverUuid) || string.IsNullOrEmpty(sourceName))
            return false;

        return NDI.NDIlib_recv_listener_send_connect(_listenerInstance, receiverUuid, sourceName);
    }

    /// <summary>
    /// Send a DISCONNECT command to a receiver (pass empty string to disconnect)
    /// </summary>
    /// <param name="receiverUuid">UUID of the receiver</param>
    /// <returns>True if command sent successfully</returns>
    public bool SendDisconnectCommand(string receiverUuid)
    {
        if (_listenerInstance == IntPtr.Zero || string.IsNullOrEmpty(receiverUuid))
            return false;

        // Pass empty string to disconnect from current source
        return NDI.NDIlib_recv_listener_send_connect(_listenerInstance, receiverUuid, "");
    }

    /// <summary>
    /// Subscribe to events from a specific receiver
    /// </summary>
    /// <param name="receiverUuid">UUID of the receiver to subscribe to</param>
    public void SubscribeEvents(string receiverUuid)
    {
        if (_listenerInstance == IntPtr.Zero || string.IsNullOrEmpty(receiverUuid))
            return;

        NDI.NDIlib_recv_listener_subscribe_events(_listenerInstance, receiverUuid);
    }

    /// <summary>
    /// Unsubscribe from events from a specific receiver
    /// </summary>
    /// <param name="receiverUuid">UUID of the receiver to unsubscribe from</param>
    public void UnsubscribeEvents(string receiverUuid)
    {
        if (_listenerInstance == IntPtr.Zero || string.IsNullOrEmpty(receiverUuid))
            return;

        NDI.NDIlib_recv_listener_unsubscribe_events(_listenerInstance, receiverUuid);
    }

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
            // Always free the events memory
            NDI.NDIlib_recv_listener_free_events(_listenerInstance, eventsPtr);
        }

        return eventList;
    }

    public void Dispose()
    {
        if (_listenerInstance != IntPtr.Zero)
        {
            NDI.NDIlib_recv_listener_destroy(_listenerInstance);
            _listenerInstance = IntPtr.Zero;
        }

        GC.SuppressFinalize(this);
    }
}
