using System.Runtime.InteropServices;
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
/// Helper class for monitoring NDI senders registered in the Discovery Service (NDI 6 SDK)
/// </summary>
public class NDISendListener : IDisposable
{
    private IntPtr _listenerInstance = IntPtr.Zero;

    public NDISendListener()
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
            return NDI.NDIlib_send_listener_is_connected(_listenerInstance);
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
            IntPtr urlPtr = NDI.NDIlib_send_listener_get_server_url(_listenerInstance);
            if (urlPtr == IntPtr.Zero)
                return null;
            return Marshal.PtrToStringAnsi(urlPtr);
        }
    }

    /// <summary>
    /// Initialize the SendListener
    /// </summary>
    /// <param name="discoveryServerUrl">URL of the Discovery Server (null = default)</param>
    /// <returns>True if successfully initialized</returns>
    public bool Initialize(string? discoveryServerUrl = null)
    {
        var listenerSettings = new NDI.send_listener_create_t
        {
            p_url_address = IntPtr.Zero
        };

        _listenerInstance = NDI.NDIlib_send_listener_create(ref listenerSettings);

        if (_listenerInstance == IntPtr.Zero)
        {
            return false;
        }

        return true;
    }

    /// <summary>
    /// Get the current list of registered senders
    /// </summary>
    /// <returns>List of sender information</returns>
    public List<NDISenderInfo> GetSenders()
    {
        var senderList = new List<NDISenderInfo>();

        if (_listenerInstance == IntPtr.Zero)
            return senderList;

        uint numSenders = 0;
        IntPtr sendersPtr = NDI.NDIlib_send_listener_get_senders(_listenerInstance, ref numSenders);

        if (sendersPtr == IntPtr.Zero || numSenders == 0)
            return senderList;

        int structSize = Marshal.SizeOf<NDI.sender_t>();

        for (int i = 0; i < numSenders; i++)
        {
            IntPtr currentPtr = IntPtr.Add(sendersPtr, i * structSize);
            var sender = Marshal.PtrToStructure<NDI.sender_t>(currentPtr);

            // Debug logging to see all sender fields
            string uuid = sender.p_uuid != IntPtr.Zero ? Marshal.PtrToStringAnsi(sender.p_uuid) ?? "" : "";
            string name = sender.p_name != IntPtr.Zero ? Marshal.PtrToStringAnsi(sender.p_name) ?? "" : "";
            string metadata = sender.p_metadata != IntPtr.Zero ? Marshal.PtrToStringAnsi(sender.p_metadata) ?? "" : "";
            string address = sender.p_address != IntPtr.Zero ? Marshal.PtrToStringAnsi(sender.p_address) ?? "" : "";

            Console.WriteLine($"[NDISendListener] Sender {i}:");
            Console.WriteLine($"  UUID: {uuid}");
            Console.WriteLine($"  Name: {name}");
            Console.WriteLine($"  Metadata: {metadata}");
            Console.WriteLine($"  Address: {address}");
            Console.WriteLine($"  Port: {sender.port}");
            Console.WriteLine($"  Num Groups: {sender.num_groups}");
            Console.WriteLine($"  Events Subscribed: {sender.events_subscribed}");

            var senderInfo = new NDISenderInfo
            {
                Id = uuid,
                Name = name,
                HostName = address,
                LastSeen = DateTime.Now
            };

            if (string.IsNullOrEmpty(metadata))
            {
                Console.WriteLine($"[NDISendListener] No metadata available for {name}");
            }

            senderList.Add(senderInfo);

            // AUTOMATIC EVENT SUBSCRIPTION
            // Subscribe to events if not already subscribed
            if (!sender.events_subscribed && !string.IsNullOrEmpty(uuid))
            {
                SubscribeEvents(uuid);
                Console.WriteLine($"[NDISendListener] Subscribed to events for sender: {name}");
            }
        }

        return senderList;
    }

    /// <summary>
    /// Wait for changes in the sender list
    /// </summary>
    /// <param name="timeoutMs">Timeout in milliseconds</param>
    /// <returns>True if changes detected within timeout</returns>
    public bool WaitForChanges(uint timeoutMs = 5000)
    {
        if (_listenerInstance == IntPtr.Zero)
            return false;

        return NDI.NDIlib_send_listener_wait_for_senders(_listenerInstance, timeoutMs);
    }

    /// <summary>
    /// Subscribe to events from a specific sender
    /// </summary>
    /// <param name="senderUuid">UUID of the sender to subscribe to</param>
    public void SubscribeEvents(string senderUuid)
    {
        if (_listenerInstance == IntPtr.Zero || string.IsNullOrEmpty(senderUuid))
            return;

        NDI.NDIlib_send_listener_subscribe_events(_listenerInstance, senderUuid);
    }

    /// <summary>
    /// Unsubscribe from events from a specific sender
    /// </summary>
    /// <param name="senderUuid">UUID of the sender to unsubscribe from</param>
    public void UnsubscribeEvents(string senderUuid)
    {
        if (_listenerInstance == IntPtr.Zero || string.IsNullOrEmpty(senderUuid))
            return;

        NDI.NDIlib_send_listener_unsubscribe_events(_listenerInstance, senderUuid);
    }

    /// <summary>
    /// Get pending events from subscribed senders
    /// </summary>
    /// <param name="timeoutMs">Timeout in milliseconds (0 = don't wait)</param>
    /// <returns>List of sender events</returns>
    public List<NDISenderEvent> GetEvents(uint timeoutMs = 0)
    {
        var eventList = new List<NDISenderEvent>();

        if (_listenerInstance == IntPtr.Zero)
            return eventList;

        uint numEvents = 0;
        IntPtr eventsPtr = NDI.NDIlib_send_listener_get_events(_listenerInstance, ref numEvents, timeoutMs);

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
            // CRITICAL: Always free the events memory
            NDI.NDIlib_send_listener_free_events(_listenerInstance, eventsPtr);
        }

        return eventList;
    }

    public void Dispose()
    {
        if (_listenerInstance != IntPtr.Zero)
        {
            NDI.NDIlib_send_listener_destroy(_listenerInstance);
            _listenerInstance = IntPtr.Zero;
        }

        GC.SuppressFinalize(this);
    }
}
