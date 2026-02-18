using NDIManager.Models;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;

namespace NDIManager.Services;

public class NDIDiscoveryService : BackgroundService
{
    private readonly NDISendListener _sendListener;
    private readonly NDIRecvListener _recvListener;
    private readonly ConcurrentDictionary<string, NDISenderInfo> _senders;
    private readonly ConcurrentDictionary<string, NDIReceiverInfo> _receivers;
    private readonly ConcurrentDictionary<string, string> _receiverSourceNames;  // Cache of receiver UUID -> source name from events
    private readonly ConcurrentDictionary<string, Dictionary<string, string>> _senderEventCache;  // Cache of sender UUID -> event data
    private readonly ConcurrentDictionary<string, Dictionary<string, string>> _receiverEventCache;  // Cache of receiver UUID -> event data
    private readonly ILogger<NDIDiscoveryService> _logger;
    private readonly System.Threading.Timer _discoveryTimer;
    private IntPtr _finderInstance = IntPtr.Zero;

    public NDIDiscoveryService(ILogger<NDIDiscoveryService> logger)
    {
        _logger = logger;
        _senders = new ConcurrentDictionary<string, NDISenderInfo>();
        _receivers = new ConcurrentDictionary<string, NDIReceiverInfo>();
        _receiverSourceNames = new ConcurrentDictionary<string, string>();
        _senderEventCache = new ConcurrentDictionary<string, Dictionary<string, string>>();
        _receiverEventCache = new ConcurrentDictionary<string, Dictionary<string, string>>();
        _sendListener = new NDISendListener();
        _recvListener = new NDIRecvListener();

        if (!NDI.NDIlib_initialize())
        {
            throw new Exception("Failed to initialize NDI library");
        }

        _logger.LogInformation("NDI SDK initialized successfully");

        // Log listener connection status
        _logger.LogInformation($"SendListener connected to Discovery Server: {_sendListener.IsConnected}");
        _logger.LogInformation($"SendListener server URL: {_sendListener.ServerUrl ?? "NULL"}");
        _logger.LogInformation($"RecvListener connected to Discovery Server: {_recvListener.IsConnected}");
        _logger.LogInformation($"RecvListener server URL: {_recvListener.ServerUrl ?? "NULL"}");

        // Initialize NDI Finder for source discovery
        var finderSettings = new NDI.find_create_t
        {
            show_local_sources = true,
            p_groups = IntPtr.Zero,
            p_extra_ips = IntPtr.Zero
        };
        _finderInstance = NDI.NDIlib_find_create_v2(ref finderSettings);

        if (_finderInstance == IntPtr.Zero)
        {
            _logger.LogWarning("Failed to create NDI Finder instance");
        }
        else
        {
            _logger.LogInformation("NDI Finder initialized successfully");
        }

        // Timer for periodic discovery (every 2 seconds)
        _discoveryTimer = new System.Threading.Timer(DiscoverDevices, null, TimeSpan.Zero, TimeSpan.FromSeconds(1));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("NDI Discovery Service started");

        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(1000, stoppingToken);
        }
    }

    private void DiscoverDevices(object? state)
    {
        try
        {
            // Get senders from NDI Discovery Server
            var senders = _sendListener.GetSenders();

            // Update senders dictionary with UUID as key
            _senders.Clear();
            var sendersByUuid = new Dictionary<string, NDISenderInfo>();
            foreach (var sender in senders)
            {
                // Populate sender properties from cached event data
                if (!string.IsNullOrEmpty(sender.Id) && _senderEventCache.TryGetValue(sender.Id, out var eventData))
                {
                    lock (eventData)
                    {
                        // Parse connection count
                        if (eventData.TryGetValue("connected-receivers", out var connectionsStr) && int.TryParse(connectionsStr, out var connections))
                        {
                            sender.ConnectionCount = connections;
                        }

                        // Parse video resolution
                        if (eventData.TryGetValue("video-resolution", out var resolutionStr))
                        {
                            // Format: "1920x1080"
                            var resolution = resolutionStr.Split('x');
                            if (resolution.Length == 2 && int.TryParse(resolution[0], out var width) && int.TryParse(resolution[1], out var height))
                            {
                                sender.Width = width;
                                sender.Height = height;
                            }
                        }

                        // Parse video frame rate
                        if (eventData.TryGetValue("video-frame-rate", out var frameRateStr))
                        {
                            // Format: "50/1" or "50000/1000"
                            var parts = frameRateStr.Split('/');
                            if (parts.Length == 2 && int.TryParse(parts[0], out var n) && int.TryParse(parts[1], out var d))
                            {
                                sender.FrameRateN = n;
                                sender.FrameRateD = d;
                            }
                        }

                        // Parse video codec
                        if (eventData.TryGetValue("video-codec", out var videoCodec))
                        {
                            sender.VideoCodec = videoCodec.ToUpper();
                        }

                        // Parse video frame type
                        if (eventData.TryGetValue("video-frame-type", out var frameType))
                        {
                            sender.VideoFrameType = frameType;
                        }

                        // Parse video has alpha
                        if (eventData.TryGetValue("video-has-alpha", out var hasAlphaStr) && bool.TryParse(hasAlphaStr, out var hasAlpha))
                        {
                            sender.VideoHasAlpha = hasAlpha;
                        }

                        // Parse audio codec
                        if (eventData.TryGetValue("audio-codec", out var audioCodec))
                        {
                            sender.AudioCodec = audioCodec.ToUpper();
                        }

                        // Parse audio channels
                        if (eventData.TryGetValue("audio-channels", out var channelsStr) && int.TryParse(channelsStr, out var channels))
                        {
                            sender.AudioChannels = channels;
                        }

                        // Parse audio sample rate
                        if (eventData.TryGetValue("audio-sample-rate", out var sampleRateStr) && int.TryParse(sampleRateStr, out var sampleRate))
                        {
                            sender.AudioSampleRate = sampleRate;
                        }

                        // Parse SDK version
                        if (eventData.TryGetValue("sdk-version", out var sdkVersion))
                        {
                            sender.SdkVersion = sdkVersion;
                        }

                        // Calculate approximate bandwidth from video bytes sent
                        if (eventData.TryGetValue("video-bytes-sent", out var videoBytesStr) && long.TryParse(videoBytesStr, out var videoBytes))
                        {
                            // This is cumulative, so we'd need to track delta over time
                            // For now, just store the total bytes
                            sender.BytesPerSecond = videoBytes;
                        }

                        // Parse dropped frames
                        if (eventData.TryGetValue("video-frames-dropped", out var droppedStr) && int.TryParse(droppedStr, out var dropped))
                        {
                            sender.DroppedFrames = dropped;
                        }

                        // Parse tally state
                        if (eventData.TryGetValue("tally-on-program", out var pgmStr) && bool.TryParse(pgmStr, out var pgm))
                        {
                            sender.TallyOnProgram = pgm;
                        }
                        if (eventData.TryGetValue("tally-on-preview", out var pvwStr) && bool.TryParse(pvwStr, out var pvw))
                        {
                            sender.TallyOnPreview = pvw;
                        }

                        // Parse web control URL
                        if (eventData.TryGetValue("web-control", out var webControl))
                        {
                            sender.WebControlUrl = webControl;
                        }
                    }
                }

                _senders[sender.Name] = sender;
                if (!string.IsNullOrEmpty(sender.Id))
                {
                    sendersByUuid[sender.Id] = sender;
                }
            }

            _logger.LogDebug($"Discovered {senders.Count} NDI senders from Discovery Server");

            // Get events from senders and update persistent cache
            var senderEvents = _sendListener.GetEvents(0);  // 0 = non-blocking
            foreach (var evt in senderEvents)
            {
                Console.WriteLine($"[NDISendListener Event] UUID: {evt.SenderUuid}, Name: {evt.EventName}, Value: {evt.EventValue}");

                // Cache event data for each sender
                if (!string.IsNullOrEmpty(evt.SenderUuid))
                {
                    var eventData = _senderEventCache.GetOrAdd(evt.SenderUuid, _ => new Dictionary<string, string>());

                    // Update or add the event value
                    lock (eventData)
                    {
                        eventData[evt.EventName] = evt.EventValue;
                    }
                }
            }

            // Discover actual NDI sources using NDI Finder (standard API)
            var sourcesByName = new Dictionary<string, string>();
            if (_finderInstance != IntPtr.Zero)
            {
                uint numSources = 0;
                IntPtr sourcesPtr = NDI.NDIlib_find_get_current_sources(_finderInstance, ref numSources);

                if (sourcesPtr != IntPtr.Zero && numSources > 0)
                {
                    int structSize = Marshal.SizeOf<NDI.source_t>();

                    for (int i = 0; i < numSources; i++)
                    {
                        IntPtr currentPtr = IntPtr.Add(sourcesPtr, i * structSize);
                        var source = Marshal.PtrToStructure<NDI.source_t>(currentPtr);

                        string sourceName = source.p_ndi_name != IntPtr.Zero ? Marshal.PtrToStringAnsi(source.p_ndi_name) ?? "" : "";

                        if (!string.IsNullOrEmpty(sourceName))
                            sourcesByName[sourceName] = sourceName;
                    }

                    _logger.LogDebug("Discovered {Count} NDI sources using Finder", numSources);
                }
            }

            // Get receivers from NDI Discovery Server
            var receivers = _recvListener.GetReceivers();
            _logger.LogDebug("RecvListener connected={Connected}, receivers={Count}",
                _recvListener.IsConnected, receivers.Count);

            // Get events from receivers and update persistent cache
            var events = _recvListener.GetEvents(0);  // 0 = non-blocking
            foreach (var evt in events)
            {
                Console.WriteLine($"[NDIRecvListener Event] UUID: {evt.ReceiverUuid}, Name: {evt.EventName}, Value: {evt.EventValue}");

                // Extract source-name events and save to persistent cache
                if (evt.EventName == "source-name")
                {
                    if (!string.IsNullOrEmpty(evt.EventValue))
                    {
                        Console.WriteLine($"[RECEIVER EVENT] source-name SET for {evt.ReceiverUuid}: {evt.EventValue}");
                        _receiverSourceNames[evt.ReceiverUuid] = evt.EventValue;
                    }
                    // Don't remove source-name on empty value - wait for connection-state: disconnected instead
                    // This prevents flickering when connecting audio-only sources
                }

                // Remove source-name when connection-state becomes disconnected
                if (evt.EventName == "connection-state" && evt.EventValue == "disconnected")
                {
                    if (_receiverSourceNames.ContainsKey(evt.ReceiverUuid))
                    {
                        Console.WriteLine($"[RECEIVER EVENT] source-name CLEARED for {evt.ReceiverUuid} (connection-state: disconnected)");
                        _receiverSourceNames.TryRemove(evt.ReceiverUuid, out _);
                    }
                }

                // Cache all event data for each receiver
                if (!string.IsNullOrEmpty(evt.ReceiverUuid))
                {
                    var eventData = _receiverEventCache.GetOrAdd(evt.ReceiverUuid, _ => new Dictionary<string, string>());

                    // Update or add the event value
                    lock (eventData)
                    {
                        eventData[evt.EventName] = evt.EventValue;
                    }
                }
            }

            // Update receivers dictionary and correlate with sources
            _receivers.Clear();
            foreach (var receiver in receivers)
            {
                // BEST: Use source-name from cached events (most reliable)
                if (_receiverSourceNames.TryGetValue(receiver.Id, out var sourceNameFromEvent))
                {
                    receiver.CurrentSource = sourceNameFromEvent;
                    receiver.IsConnected = true;
                }
                // Fallback: Try to match with senders from Discovery Server by UUID
                else if (!string.IsNullOrEmpty(receiver.InputUuid) && sendersByUuid.TryGetValue(receiver.InputUuid, out var connectedSender))
                {
                    receiver.CurrentSource = connectedSender.Name;
                    receiver.IsConnected = true;
                }

                // Populate receiver technical properties from cached event data
                if (!string.IsNullOrEmpty(receiver.Id) && _receiverEventCache.TryGetValue(receiver.Id, out var eventData))
                {
                    lock (eventData)
                    {
                        // Parse video resolution
                        if (eventData.TryGetValue("video-resolution", out var resolutionStr))
                        {
                            var resolution = resolutionStr.Split('x');
                            if (resolution.Length == 2 && int.TryParse(resolution[0], out var width) && int.TryParse(resolution[1], out var height))
                            {
                                receiver.Width = width;
                                receiver.Height = height;
                            }
                        }

                        // Parse video frame rate
                        if (eventData.TryGetValue("video-frame-rate", out var frameRateStr))
                        {
                            var parts = frameRateStr.Split('/');
                            if (parts.Length == 2 && int.TryParse(parts[0], out var n) && int.TryParse(parts[1], out var d))
                            {
                                receiver.FrameRateN = n;
                                receiver.FrameRateD = d;
                            }
                        }

                        // Parse video codec
                        if (eventData.TryGetValue("video-codec", out var videoCodec))
                        {
                            receiver.VideoCodec = videoCodec.ToUpper();
                        }

                        // Parse video frame type
                        if (eventData.TryGetValue("video-frame-type", out var frameType))
                        {
                            receiver.VideoFrameType = frameType;
                        }

                        // Parse video has alpha
                        if (eventData.TryGetValue("video-has-alpha", out var hasAlphaStr) && bool.TryParse(hasAlphaStr, out var hasAlpha))
                        {
                            receiver.VideoHasAlpha = hasAlpha;
                        }

                        // Parse audio codec
                        if (eventData.TryGetValue("audio-codec", out var audioCodec))
                        {
                            receiver.AudioCodec = audioCodec.ToUpper();
                        }

                        // Parse audio channels
                        if (eventData.TryGetValue("audio-channels", out var channelsStr) && int.TryParse(channelsStr, out var channels))
                        {
                            receiver.AudioChannels = channels;
                        }

                        // Parse audio sample rate
                        if (eventData.TryGetValue("audio-sample-rate", out var sampleRateStr) && int.TryParse(sampleRateStr, out var sampleRate))
                        {
                            receiver.AudioSampleRate = sampleRate;
                        }

                        // Parse SDK version
                        if (eventData.TryGetValue("sdk-version", out var sdkVersion))
                        {
                            receiver.SdkVersion = sdkVersion;
                        }

                        // Parse tally state
                        if (eventData.TryGetValue("tally-on-program", out var pgmStr) && bool.TryParse(pgmStr, out var pgm))
                        {
                            receiver.TallyOnProgram = pgm;
                        }
                        if (eventData.TryGetValue("tally-on-preview", out var pvwStr) && bool.TryParse(pvwStr, out var pvw))
                        {
                            receiver.TallyOnPreview = pvw;
                        }

                        // Parse web control URL
                        if (eventData.TryGetValue("web-control", out var webControl))
                        {
                            receiver.WebControlUrl = webControl;
                        }

                        // Parse dropped frames
                        if (eventData.TryGetValue("video-frames-dropped", out var droppedStr) && int.TryParse(droppedStr, out var dropped))
                        {
                            receiver.DroppedFrames = dropped;
                        }
                    }
                }

                _receivers[receiver.Id] = receiver;
            }

            _logger.LogDebug($"Discovered {receivers.Count} NDI receivers");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during NDI discovery");
        }
    }

    public List<NDISenderInfo> GetSenders()
    {
        return _senders.Values.OrderBy(s => s.Name).ToList();
    }

    public List<NDIReceiverInfo> GetReceivers()
    {
        return _receivers.Values.OrderBy(r => r.Name).ToList();
    }

    public bool ConnectReceiver(string receiverUuid, string sourceName)
    {
        try
        {
            bool success = _recvListener.SendConnectCommand(receiverUuid, sourceName);

            if (success)
            {
                _logger.LogInformation($"Sent CONNECT command to receiver {receiverUuid} for source {sourceName}");
            }
            else
            {
                _logger.LogWarning($"Failed to send CONNECT command to receiver {receiverUuid}");
            }

            return success;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error sending CONNECT command to receiver {receiverUuid}");
            return false;
        }
    }

    public bool DisconnectReceiver(string receiverUuid)
    {
        try
        {
            bool success = _recvListener.SendDisconnectCommand(receiverUuid);

            if (success)
            {
                _logger.LogInformation($"Sent DISCONNECT command to receiver {receiverUuid}");
            }
            else
            {
                _logger.LogWarning($"Failed to send DISCONNECT command to receiver {receiverUuid}");
            }

            return success;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error sending DISCONNECT command to receiver {receiverUuid}");
            return false;
        }
    }

    public override void Dispose()
    {
        _discoveryTimer?.Dispose();

        _receivers.Clear();

        _sendListener?.Dispose();
        _recvListener?.Dispose();

        if (_finderInstance != IntPtr.Zero)
        {
            NDI.NDIlib_find_destroy(_finderInstance);
            _finderInstance = IntPtr.Zero;
        }

        NDI.NDIlib_destroy();

        base.Dispose();
    }
}
