using NDIManager.Models;
using NDIManager.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Configuration;
using NDIManager;
using System.Collections.Concurrent;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Xml.Linq;

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
    private readonly IHubContext<NdiHub>? _hubContext;
    // Serializes every native NDI call (discovery loop, connect/disconnect commands, teardown).
    private readonly object _ndiLock = new();
    private bool _disposed;
    private volatile bool _sendListenerConnected;
    private volatile bool _recvListenerConnected;
    private volatile string? _sendListenerServerUrl;
    private volatile string? _recvListenerServerUrl;
    private readonly string _ndiSdkVersion;
    private DateTime _lastListenerRetryAt = DateTime.MinValue;
    private static readonly TimeSpan DiscoveryInterval = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan ListenerRetryInterval = TimeSpan.FromSeconds(10);
    private IntPtr _finderInstance = IntPtr.Zero;
    private readonly string? _discoveryServerUrl;
    private readonly HashSet<string> _bridgeHosts;
    private DateTime _lastDiscoveryAt = DateTime.UtcNow;
    private static readonly TimeSpan SenderStaleGrace = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan ReceiverStaleGrace = TimeSpan.FromSeconds(3);

    /// <summary>Raised after each discovery pass with the freshly computed status (no extra snapshot work for subscribers).</summary>
    public event Action<NdiSystemStatus>? SnapshotUpdated;

    // Ordering for clients: snapshots carry (InstanceId, Sequence); a restarted backend gets a new InstanceId.
    private readonly string _instanceId = Guid.NewGuid().ToString("N");
    private long _snapshotSequence;

    // Event caches / subscriptions are dropped only after an endpoint has been gone for a while,
    // so short Discovery Server blips do not lose connection state.
    private readonly ConcurrentDictionary<string, DateTime> _senderUuidLastSeen = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, DateTime> _receiverUuidLastSeen = new(StringComparer.OrdinalIgnoreCase);
    private static readonly TimeSpan EventCacheRetention = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan DiscoveryStallThreshold = TimeSpan.FromSeconds(10);
    private static readonly TimeSpan PushHeartbeatInterval = TimeSpan.FromSeconds(10);
    private string? _lastPushedFingerprint;
    private DateTime _lastPushAt = DateTime.MinValue;
    private bool _prevSendConnected;
    private bool _prevRecvConnected;

    public NDIDiscoveryService(
        ILogger<NDIDiscoveryService> logger,
        ILoggerFactory loggerFactory,
        IConfiguration configuration,
        IHubContext<NdiHub>? hubContext = null)
    {
        _hubContext = hubContext;
        _logger = logger;
        _senders = new ConcurrentDictionary<string, NDISenderInfo>();
        _receivers = new ConcurrentDictionary<string, NDIReceiverInfo>();
        _receiverSourceNames = new ConcurrentDictionary<string, string>();
        _senderEventCache = new ConcurrentDictionary<string, Dictionary<string, string>>();
        _receiverEventCache = new ConcurrentDictionary<string, Dictionary<string, string>>();

        // NDIlib_initialize MUST run before send_listener / recv_listener create (SDK §18).
        if (!NDI.NDIlib_initialize())
        {
            throw new Exception("Failed to initialize NDI library");
        }

        _ndiSdkVersion = NdiStringUtil.PtrToUtf8String(NDI.NDIlib_version());
        _logger.LogInformation("NDI SDK initialized successfully (runtime {Version})", _ndiSdkVersion);

        var sendLogger = loggerFactory.CreateLogger<NDISendListener>();
        var recvLogger = loggerFactory.CreateLogger<NDIRecvListener>();
        _sendListener = new NDISendListener(sendLogger);
        _recvListener = new NDIRecvListener(recvLogger);

        _discoveryServerUrl = ResolveDiscoveryServerUrl(configuration);
        _bridgeHosts = BridgeRouting.ResolveBridgeHosts(configuration);
        var discoveryUrl = _discoveryServerUrl;
        _logger.LogInformation(
            "NDI Discovery Server URL: {Url}",
            string.IsNullOrEmpty(discoveryUrl) ? "(SDK default — null p_url_address)" : discoveryUrl);

        if (_bridgeHosts.Count > 0)
        {
            _logger.LogInformation("NDI Bridge hosts configured: {Hosts}", string.Join(", ", _bridgeHosts));
        }

        if (!_sendListener.Initialize(discoveryUrl))
        {
            _logger.LogError("NDISendListener failed to initialize; sender monitoring and tally will be unavailable.");
        }

        if (!_recvListener.Initialize(discoveryUrl))
        {
            _logger.LogError("NDIRecvListener failed to initialize; receiver discovery/commands may be unavailable.");
        }

        _logger.LogInformation("SendListener connected={Connected}, server_url={ServerUrl}",
            _sendListener.IsConnected, _sendListener.ServerUrl ?? "NULL");
        _logger.LogInformation("RecvListener connected={Connected}, server_url={ServerUrl}",
            _recvListener.IsConnected, _recvListener.ServerUrl ?? "NULL");

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

        RefreshListenerState();
        // Startup is not a "reconnect": subscriptions are created by the first discovery pass.
        _prevSendConnected = _sendListenerConnected;
        _prevRecvConnected = _recvListenerConnected;
    }

    /// <summary>
    /// Single discovery loop: one tick at a time (no overlap), stopped and awaited by the host
    /// before <see cref="Dispose"/> releases the native NDI instances.
    /// </summary>
    protected override Task ExecuteAsync(CancellationToken stoppingToken) =>
        // Run on the thread pool: the host is started from the WinForms UI thread, and awaiting there
        // would capture its SynchronizationContext and run every discovery pass on the tray UI thread.
        Task.Run(() => RunDiscoveryLoopAsync(stoppingToken), CancellationToken.None);

    private async Task RunDiscoveryLoopAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("NDI Discovery Service started");

        using var timer = new PeriodicTimer(DiscoveryInterval);
        try
        {
            do
            {
                bool updated;
                lock (_ndiLock)
                {
                    if (_disposed)
                        break;

                    RetryMissingListeners();
                    updated = DiscoverDevices();
                    RefreshListenerState();
                    ResubscribeAfterReconnect();
                    PruneStaleEventCaches();
                }

                // Awaited (not fire-and-forget) so pushes leave in order, one per pass.
                if (updated)
                    await PublishSnapshotUpdateAsync();
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Normal shutdown.
        }

        _logger.LogInformation("NDI Discovery Service stopped");
    }

    /// <summary>
    /// Listener create returns NULL while no Discovery Server is reachable (SDK 6.4 docs); retry periodically.
    /// Caller must hold <see cref="_ndiLock"/>.
    /// </summary>
    private void RetryMissingListeners()
    {
        if (_sendListener.IsCreated && _recvListener.IsCreated)
            return;

        var now = DateTime.UtcNow;
        if (now - _lastListenerRetryAt < ListenerRetryInterval)
            return;
        _lastListenerRetryAt = now;

        if (!_sendListener.IsCreated && _sendListener.Initialize(_discoveryServerUrl))
            _logger.LogInformation("NDISendListener created on retry");

        if (!_recvListener.IsCreated && _recvListener.Initialize(_discoveryServerUrl))
            _logger.LogInformation("NDIRecvListener created on retry");
    }

    /// <summary>
    /// Caches listener state so status readers never touch native handles.
    /// Caller must hold <see cref="_ndiLock"/> (or be in the constructor).
    /// </summary>
    private void RefreshListenerState()
    {
        _sendListenerConnected = _sendListener.IsConnected;
        _recvListenerConnected = _recvListener.IsConnected;
        _sendListenerServerUrl = _sendListener.ServerUrl;
        _recvListenerServerUrl = _recvListener.ServerUrl;
    }

    /// <summary>
    /// When a listener reconnects to the Discovery Server, forget local subscription bookkeeping so the
    /// next get_senders/get_receivers pass subscribes again. Caller must hold <see cref="_ndiLock"/>.
    /// </summary>
    private void ResubscribeAfterReconnect()
    {
        var send = _sendListenerConnected;
        var recv = _recvListenerConnected;

        if (send && !_prevSendConnected)
        {
            _sendListener.ResetSubscriptions();
            _logger.LogInformation("SendListener (re)connected to Discovery Server; re-subscribing sender events");
        }

        if (recv && !_prevRecvConnected)
        {
            _recvListener.ResetSubscriptions();
            _logger.LogInformation("RecvListener (re)connected to Discovery Server; re-subscribing receiver events");
        }

        _prevSendConnected = send;
        _prevRecvConnected = recv;
    }

    /// <summary>
    /// Drops event caches and subscriptions for endpoints unseen for <see cref="EventCacheRetention"/>,
    /// so caches do not grow forever and a returning endpoint does not inherit stale state.
    /// Caller must hold <see cref="_ndiLock"/>.
    /// </summary>
    private void PruneStaleEventCaches()
    {
        var cutoff = DateTime.UtcNow - EventCacheRetention;

        foreach (var (uuid, lastSeen) in _senderUuidLastSeen)
        {
            if (lastSeen >= cutoff)
                continue;
            _senderUuidLastSeen.TryRemove(uuid, out _);
            _senderEventCache.TryRemove(uuid, out _);
            _sendListener.UnsubscribeEvents(uuid);
        }

        foreach (var (uuid, lastSeen) in _receiverUuidLastSeen)
        {
            if (lastSeen >= cutoff)
                continue;
            _receiverUuidLastSeen.TryRemove(uuid, out _);
            _receiverEventCache.TryRemove(uuid, out _);
            _receiverSourceNames.TryRemove(uuid, out _);
            _recvListener.UnsubscribeEvents(uuid);
        }
    }

    /// <summary>One discovery pass. Caller must hold <see cref="_ndiLock"/>. Returns true when the cache was refreshed.</summary>
    private bool DiscoverDevices()
    {
        try
        {
            // Send Listener: wait (non-blocking) → get_senders → subscribe by uuid → get_events → merge cache (SDK §18).
            _sendListener.WaitForSenders(0);
            var senders = _sendListener.GetSenders();

            // Drain immediately, then briefly wait so post-subscribe events are not missed.
            CacheSenderEvents(_sendListener.GetEvents(0));
            CacheSenderEvents(_sendListener.GetEvents(50));

            MergeDiscoveredSenders(senders);

            _logger.LogDebug("Discovered {Count} NDI senders from Discovery Server", senders.Count);

            var legacyAdded = MergeFinderLegacySenders();

            _recvListener.WaitForReceivers(0);
            var receivers = _recvListener.GetReceivers();
            _logger.LogDebug("RecvListener connected={Connected}, receivers={Count}",
                _recvListener.IsConnected, receivers.Count);

            CacheReceiverEvents(_recvListener.GetEvents(0));
            CacheReceiverEvents(_recvListener.GetEvents(50));

            SyncReceiverSourceNamesFromEventCache();

            MergeDiscoveredReceivers(receivers);

            _logger.LogDebug($"Discovered {receivers.Count} NDI receivers");

            if (legacyAdded > 0)
            {
                _logger.LogDebug(
                    "Merged {LegacyAdded} legacy finder source(s); total senders={Total} ({Legacy} legacy, {Monitored} monitored)",
                    legacyAdded,
                    _senders.Count,
                    _senders.Values.Count(s => s.IsLegacyDiscovery),
                    _senders.Values.Count(s => !s.IsLegacyDiscovery));
            }

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during NDI discovery");
            return false;
        }
    }

    public NdiSystemStatus GetSystemStatus()
    {
        var snapshot = GetAggregatedSnapshot();
        return BuildSystemStatus(snapshot);
    }

    public NdiBulkOperationResponse BulkDisconnectReceivers(IEnumerable<string> receiverUuids)
    {
        var response = new NdiBulkOperationResponse();
        foreach (var uuid in receiverUuids.Where(u => !string.IsNullOrWhiteSpace(u)).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            response.Requested++;
            if (DisconnectReceiver(uuid))
                response.Succeeded++;
            else
                response.Errors.Add(uuid);
        }
        return response;
    }

    private NdiSystemStatus BuildSystemStatus(NDIAggregatedSnapshot snapshot)
    {
        var version = typeof(NDIDiscoveryService).Assembly.GetName().Version?.ToString(3) ?? "3.3.0";
        var sendConnected = _sendListenerConnected;
        var recvConnected = _recvListenerConnected;
        var health = "ok";
        if (DateTime.UtcNow - _lastDiscoveryAt > DiscoveryStallThreshold)
            health = "stalled";
        else if (!sendConnected && !recvConnected)
            health = "error";
        else if (!sendConnected || !recvConnected)
            health = "degraded";
        else if (snapshot.Senders.Count + snapshot.Receivers.Count == 0)
            health = "idle";

        return new NdiSystemStatus
        {
            AppVersion = version,
            NdiSdkVersion = _ndiSdkVersion,
            ServerTime = DateTime.UtcNow,
            DiscoveryServerUrl = _discoveryServerUrl ?? "(SDK default)",
            SendListenerConnected = sendConnected,
            RecvListenerConnected = recvConnected,
            SendListenerServerUrl = _sendListenerServerUrl,
            RecvListenerServerUrl = _recvListenerServerUrl,
            FinderAvailable = _finderInstance != IntPtr.Zero,
            SenderCount = snapshot.Senders.Count,
            LegacySenderCount = snapshot.Senders.Count(d => d.IsLegacyDiscovery),
            ReceiverCount = snapshot.Receivers.Count,
            ConnectionCount = snapshot.Connections.Count,
            LastDiscoveryAt = _lastDiscoveryAt,
            Health = health,
        };
    }

    private async Task PublishSnapshotUpdateAsync()
    {
        _lastDiscoveryAt = DateTime.UtcNow;

        NDIAggregatedSnapshot snapshot;
        NdiSystemStatus status;
        try
        {
            snapshot = GetAggregatedSnapshot();
            status = BuildSystemStatus(snapshot);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to build snapshot");
            return;
        }

        try
        {
            SnapshotUpdated?.Invoke(status);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "SnapshotUpdated handler failed");
        }

        if (_hubContext == null)
            return;

        // Skip identical pushes (idle networks) but keep a heartbeat so clients see the backend is alive.
        // New/reconnected clients fetch /devices themselves, so they never wait for a change.
        var fingerprint = ComputeSnapshotFingerprint(snapshot, status);
        var now = DateTime.UtcNow;
        if (fingerprint == _lastPushedFingerprint && now - _lastPushAt < PushHeartbeatInterval)
            return;

        try
        {
            _lastPushedFingerprint = fingerprint;
            _lastPushAt = now;
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            await _hubContext.Clients.All.SendAsync("snapshotUpdated", new { snapshot, status }, timeout.Token);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "SignalR snapshot publish failed");
        }
    }

    /// <summary>Hash of everything clients render, excluding per-pass fields (sequence, timestamps).</summary>
    private static string ComputeSnapshotFingerprint(NDIAggregatedSnapshot snapshot, NdiSystemStatus status)
    {
        var bytes = System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(new
        {
            snapshot.Senders,
            snapshot.Receivers,
            snapshot.Connections,
            status.Health,
            status.SendListenerConnected,
            status.RecvListenerConnected,
            status.SendListenerServerUrl,
            status.RecvListenerServerUrl,
        });
        return Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes));
    }

    public List<NDISenderInfo> GetSenders()
    {
        return _senders.Values.OrderBy(s => s.Name).ToList();
    }

    public List<NDIReceiverInfo> GetReceivers()
    {
        return _receivers.Values.OrderBy(r => r.Name).ToList();
    }

    public NDIAggregatedSnapshot GetAggregatedSnapshot()
    {
        // Taken before reading state, so a higher sequence never carries older data than a lower one.
        var sequence = Interlocked.Increment(ref _snapshotSequence);
        var senders = GetSenders();
        var receivers = GetReceivers();

        BridgeRouting.NormalizeBridgeSenderHosts(senders, _bridgeHosts);

        var senderByName = senders
            .Where(s => !string.IsNullOrWhiteSpace(s.Name))
            .GroupBy(s => s.Name, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var senderDevices = new Dictionary<string, NDIMultiDevice>(StringComparer.OrdinalIgnoreCase);
        var receiverDevices = new Dictionary<string, NDIMultiDevice>(StringComparer.OrdinalIgnoreCase);
        var senderChannelsByName = new Dictionary<string, NDIMultiChannel>(StringComparer.OrdinalIgnoreCase);
        var senderChannelsByAppChannel = new Dictionary<string, NDIMultiChannel>(StringComparer.OrdinalIgnoreCase);
        var senderAppByDeviceId = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var receiverChannelsByUuid = new Dictionary<string, NDIMultiChannel>(StringComparer.OrdinalIgnoreCase);

        foreach (var sender in senders)
        {
            var parsed = ParseIntercomIdentity(sender.SourceMetadata, sender.Name);
            var role = "sender";
            var deviceHint = ResolveDeviceHint(parsed, sender.Address, sender.Id, sender.Name);
            var deviceKey = $"{parsed.ApplicationId}:{role}:{deviceHint}";

            if (!senderDevices.TryGetValue(deviceKey, out var device))
            {
                device = new NDIMultiDevice
                {
                    DeviceKey = deviceKey,
                    Role = role,
                    DisplayName = BuildDeviceDisplayName(parsed, "Sender"),
                    ApplicationId = parsed.ApplicationId,
                    HostName = parsed.HostName != "unknown" ? parsed.HostName : string.Empty,
                    Status = sender.Status,
                    Address = sender.Address
                };
                senderDevices[deviceKey] = device;
            }

            // Prefer endpoint UUID so channel ids stay unique across aggregated devices (avoids ch-1 collisions).
            var channelId = !string.IsNullOrWhiteSpace(sender.Id)
                ? sender.Id
                : (!string.IsNullOrWhiteSpace(parsed.ChannelId)
                    ? parsed.ChannelId
                    : Guid.NewGuid().ToString("N"));

            var channel = new NDIMultiChannel
            {
                ChannelId = channelId,
                ChannelIndex = parsed.ChannelIndex,
                StreamLabel = sender.Name,
                EndpointUuid = sender.Id,
                EndpointName = sender.Name,
                Role = role,
                IsLegacyDiscovery = sender.IsLegacyDiscovery,
                IsConnected = sender.ConnectionCount > 0,
                ConnectionCount = sender.ConnectionCount,
                IsStreaming = IsChannelStreaming(
                    sender.VideoPresent,
                    sender.AudioPresent,
                    sender.VideoCodec,
                    sender.Width,
                    sender.Height,
                    sender.AudioCodec,
                    sender.AudioChannels),
                Address = sender.Address,
                Port = sender.Port,
                Width = sender.Width,
                Height = sender.Height,
                FrameRateN = sender.FrameRateN,
                FrameRateD = sender.FrameRateD,
                VideoCodec = sender.VideoCodec,
                VideoHasAlpha = sender.VideoHasAlpha,
                AudioCodec = sender.AudioCodec,
                AudioChannels = sender.AudioChannels,
                AudioSampleRate = sender.AudioSampleRate,
                TallyOnProgram = sender.TallyOnProgram,
                TallyOnPreview = sender.TallyOnPreview,
                SdkVersion = sender.SdkVersion,
                WebControlUrl = sender.WebControlUrl,
                DroppedFrames = sender.DroppedFrames,
                VideoFramesSent = sender.VideoFramesSent,
                VideoBytesSent = sender.VideoBytesSent,
                VideoColorPrimaries = sender.VideoColorPrimaries,
                VideoTransferFunction = sender.VideoTransferFunction,
                VideoMatrixCoefficients = sender.VideoMatrixCoefficients,
                AudioFramesSent = sender.AudioFramesSent,
                AudioBytesSent = sender.AudioBytesSent,
                MetadataFramesSent = sender.MetadataFramesSent,
                MetadataBytesSent = sender.MetadataBytesSent
            };

            device.Channels.Add(channel);
            if (!string.IsNullOrWhiteSpace(sender.Name))
                senderChannelsByName[sender.Name] = channel;

            var appChannelKey = BuildAppChannelKey(parsed.ApplicationId, channel.ChannelId, channel.ChannelIndex);
            if (!string.IsNullOrWhiteSpace(appChannelKey))
                senderChannelsByAppChannel[appChannelKey] = channel;

            if (parsed.ApplicationId != "unknown" && !string.IsNullOrWhiteSpace(parsed.DeviceId))
                senderAppByDeviceId[parsed.DeviceId] = parsed.ApplicationId;
        }

        BridgeRouting.ConsolidateBridgeHubs(senderDevices, _bridgeHosts);
        BridgeRouting.RebuildSenderChannelMaps(senderDevices.Values, senderChannelsByName, senderChannelsByAppChannel);
        BridgeRouting.ApplyUpstreamPairing(senderDevices.Values);

        foreach (var receiver in receivers)
        {
            var parsed = ParseIntercomIdentity(string.Empty, receiver.Name);
            if (parsed.ApplicationId == "unknown" &&
                !string.IsNullOrWhiteSpace(receiver.CurrentSource) &&
                senderByName.TryGetValue(receiver.CurrentSource, out var senderForSource))
            {
                var senderParsed = ParseIntercomIdentity(senderForSource.SourceMetadata, senderForSource.Name);
                parsed = parsed with
                {
                    ApplicationId = senderParsed.ApplicationId,
                    HostName = senderParsed.HostName != "unknown" ? senderParsed.HostName : parsed.HostName
                };
            }

            if (parsed.ApplicationId == "unknown" &&
                !string.IsNullOrWhiteSpace(parsed.DeviceId) &&
                senderAppByDeviceId.TryGetValue(parsed.DeviceId, out var inferredAppId))
            {
                parsed = parsed with { ApplicationId = inferredAppId };
            }

            var role = "receiver";
            var deviceHint = ResolveDeviceHint(parsed, receiver.Address, receiver.Id, receiver.Name);
            var deviceKey = $"{parsed.ApplicationId}:{role}:{deviceHint}";

            if (!receiverDevices.TryGetValue(deviceKey, out var device))
            {
                device = new NDIMultiDevice
                {
                    DeviceKey = deviceKey,
                    Role = role,
                    DisplayName = BuildDeviceDisplayName(parsed, "Receiver"),
                    ApplicationId = parsed.ApplicationId,
                    HostName = parsed.HostName != "unknown" ? parsed.HostName : string.Empty,
                    Status = receiver.Status,
                    Address = receiver.Address
                };
                receiverDevices[deviceKey] = device;
            }

            var channelId = !string.IsNullOrWhiteSpace(receiver.Id)
                ? receiver.Id
                : (!string.IsNullOrWhiteSpace(parsed.ChannelId)
                    ? parsed.ChannelId
                    : Guid.NewGuid().ToString("N"));

            var channel = new NDIMultiChannel
            {
                ChannelId = channelId,
                ChannelIndex = parsed.ChannelIndex,
                StreamLabel = receiver.Name,
                EndpointUuid = receiver.Id,
                EndpointName = receiver.Name,
                Role = role,
                IsConnected = receiver.IsConnected,
                IsStreaming = IsChannelStreaming(
                    receiver.VideoPresent,
                    receiver.AudioPresent,
                    receiver.VideoCodec,
                    receiver.Width,
                    receiver.Height,
                    receiver.AudioCodec,
                    receiver.AudioChannels),
                CurrentSource = receiver.CurrentSource,
                Address = receiver.Address,
                Width = receiver.Width,
                Height = receiver.Height,
                FrameRateN = receiver.FrameRateN,
                FrameRateD = receiver.FrameRateD,
                VideoCodec = receiver.VideoCodec,
                VideoFrameType = receiver.VideoFrameType,
                VideoHasAlpha = receiver.VideoHasAlpha,
                VideoPresent = receiver.VideoPresent,
                VideoReceiveMode = receiver.VideoReceiveMode,
                VideoColorPrimaries = receiver.VideoColorPrimaries,
                VideoTransferFunction = receiver.VideoTransferFunction,
                VideoMatrixCoefficients = receiver.VideoMatrixCoefficients,
                AudioCodec = receiver.AudioCodec,
                AudioChannels = receiver.AudioChannels,
                AudioSampleRate = receiver.AudioSampleRate,
                AudioPresent = receiver.AudioPresent,
                AudioReceiveMode = receiver.AudioReceiveMode,
                TallyOnProgram = receiver.TallyOnProgram,
                TallyOnPreview = receiver.TallyOnPreview,
                SdkVersion = receiver.SdkVersion,
                WebControlUrl = receiver.WebControlUrl,
                DroppedFrames = receiver.DroppedFrames,
                Streams = receiver.Streams?.ToList() ?? new List<string>(),
                Commands = receiver.Commands?.ToList() ?? new List<string>()
            };

            device.Channels.Add(channel);
            if (!string.IsNullOrWhiteSpace(receiver.Id))
                receiverChannelsByUuid[receiver.Id] = channel;
        }

        foreach (var device in senderDevices.Values)
            device.Channels = device.Channels.OrderBy(c => c.ChannelIndex ?? int.MaxValue).ThenBy(c => c.StreamLabel).ToList();

        foreach (var device in receiverDevices.Values)
            device.Channels = device.Channels.OrderBy(c => c.ChannelIndex ?? int.MaxValue).ThenBy(c => c.StreamLabel).ToList();

        foreach (var device in senderDevices.Values)
            UpdateDeviceTechnicalSummaries(device);

        foreach (var device in senderDevices.Values)
            device.IsLegacyDiscovery = device.Channels.Count > 0 && device.Channels.All(c => c.IsLegacyDiscovery);

        foreach (var device in receiverDevices.Values)
            UpdateDeviceTechnicalSummaries(device);

        // If one side has stable identity and the other doesn't, infer by address as a best-effort fallback.
        InferUnknownApplicationIdsByAddress(senderDevices.Values, receiverDevices.Values, "sender");
        InferUnknownApplicationIdsByAddress(receiverDevices.Values, senderDevices.Values, "receiver");

        var senderDeviceList = senderDevices.Values.ToList();
        var connections = new List<NDIMultiConnection>();
        foreach (var receiver in receivers.Where(r => r.IsConnected && !string.IsNullOrWhiteSpace(r.CurrentSource)))
        {
            if (!receiverChannelsByUuid.TryGetValue(receiver.Id, out var receiverChannel))
                continue;

            var senderChannel = TryFindSenderChannelForSource(
                receiver.CurrentSource!,
                senderChannelsByName,
                senderChannelsByAppChannel,
                senderDeviceList);
            if (senderChannel == null)
                continue;

            var senderDevice = senderDeviceList.FirstOrDefault(d =>
                d.Channels.Any(c =>
                    string.Equals(c.EndpointUuid, senderChannel.EndpointUuid, StringComparison.OrdinalIgnoreCase)));
            var receiverDevice = receiverDevices.Values.FirstOrDefault(d =>
                d.Channels.Any(c =>
                    string.Equals(c.EndpointUuid, receiverChannel.EndpointUuid, StringComparison.OrdinalIgnoreCase)));
            if (senderDevice == null || receiverDevice == null)
                continue;

            connections.Add(new NDIMultiConnection
            {
                ConnectionId = $"{senderChannel.EndpointUuid}->{receiverChannel.EndpointUuid}",
                SenderDeviceKey = senderDevice.DeviceKey,
                SenderChannelId = senderChannel.ChannelId,
                SenderLabel = senderChannel.StreamLabel,
                SenderUuid = senderChannel.EndpointUuid,
                ReceiverDeviceKey = receiverDevice.DeviceKey,
                ReceiverChannelId = receiverChannel.ChannelId,
                ReceiverLabel = receiverChannel.StreamLabel,
                ReceiverUuid = receiverChannel.EndpointUuid,
                SourceName = receiver.CurrentSource ?? string.Empty
            });
        }

        return new NDIAggregatedSnapshot
        {
            InstanceId = _instanceId,
            Sequence = sequence,
            GeneratedAt = DateTime.UtcNow,
            Senders = senderDevices.Values.OrderBy(d => d.DisplayName).ToList(),
            Receivers = receiverDevices.Values.OrderBy(d => d.DisplayName).ToList(),
            Connections = connections
        };
    }

    private static IntercomIdentity ParseIntercomIdentity(
        string? metadataXml,
        string? fallbackName)
    {
        string appId = "unknown";
        string hostName = "unknown";
        string? deviceId = null;
        string? channelId = null;
        int? channelIndex = null;

        if (!string.IsNullOrWhiteSpace(metadataXml))
        {
            try
            {
                var xml = XDocument.Parse(metadataXml);
                var intercomNode = xml.Descendants()
                    .FirstOrDefault(x => string.Equals(x.Name.LocalName, "intercom", StringComparison.OrdinalIgnoreCase));

                if (intercomNode != null)
                {
                    appId = intercomNode.Attribute("app_id")?.Value ?? appId;
                    deviceId = intercomNode.Attribute("device_id")?.Value ?? deviceId;
                    channelId = intercomNode.Attribute("channel_id")?.Value ?? channelId;

                    var channelIndexRaw = intercomNode.Attribute("channel_index")?.Value;
                    if (int.TryParse(channelIndexRaw, out var idx))
                        channelIndex = idx;
                }
            }
            catch
            {
                // Best-effort parser: silently fallback.
            }
        }

        var streamIdentity = ParseNdiStreamName(fallbackName);
        if (hostName == "unknown" && !string.IsNullOrWhiteSpace(streamIdentity.HostName))
            hostName = streamIdentity.HostName;

        if (channelIndex == null && !string.IsNullOrWhiteSpace(fallbackName))
        {
            var match = Regex.Match(fallbackName, @"(?:CH|Channel)\s*0*(\d+)", RegexOptions.IgnoreCase);
            if (match.Success && int.TryParse(match.Groups[1].Value, out var idx))
                channelIndex = idx;
        }

        if (appId == "unknown" && !string.IsNullOrWhiteSpace(fallbackName))
        {
            var appMatch = Regex.Match(fallbackName, @"(?:app|application)\s*[:=]\s*([\p{L}\p{M}\p{N}_.-]+)", RegexOptions.IgnoreCase);
            if (appMatch.Success)
                appId = appMatch.Groups[1].Value;
        }

        // NDI names: "HOST (App) Output" or "HOST (Channel(App))" — app name drives grouping, host is separate.
        if (appId == "unknown" && !string.IsNullOrWhiteSpace(streamIdentity.ApplicationName))
            appId = streamIdentity.ApplicationName;

        if (string.IsNullOrWhiteSpace(channelId) && !string.IsNullOrWhiteSpace(streamIdentity.ChannelLabel))
        {
            channelId = streamIdentity.ChannelLabel;
            if (channelIndex == null && TryParseChannelIndex(streamIdentity.ChannelLabel, out var idx))
                channelIndex = idx;
        }

        if (string.IsNullOrWhiteSpace(deviceId) && TryExtractNameToken(fallbackName, "device", out var tokenDevice))
            deviceId = tokenDevice;

        if (TryExtractNameToken(fallbackName, "channel_id", out var tokenChannelId))
            channelId = tokenChannelId;

        if (TryExtractNameToken(fallbackName, "ch", out var tokenCh))
        {
            if (string.IsNullOrWhiteSpace(channelId))
                channelId = tokenCh;
            if (channelIndex == null && TryParseChannelIndex(tokenCh, out var idx))
                channelIndex = idx;
        }

        if (channelIndex == null && TryExtractNameToken(fallbackName, "channel", out var tokenChannel) &&
            TryParseChannelIndex(tokenChannel, out var chIdx))
        {
            channelIndex = chIdx;
        }

        if (string.IsNullOrWhiteSpace(channelId) && channelIndex != null)
            channelId = $"ch-{channelIndex.Value}";

        appId = SanitizeIdentity(appId, "unknown");
        hostName = SanitizeIdentity(hostName, "unknown");
        deviceId = string.IsNullOrWhiteSpace(deviceId) ? null : SanitizeIdentity(deviceId, "device");
        channelId = string.IsNullOrWhiteSpace(channelId) ? null : SanitizeIdentity(channelId, "ch");

        return new IntercomIdentity(appId, hostName, deviceId, channelId, channelIndex);
    }

    /// <summary>
    /// Parses NDI endpoint names:
    /// - "HOST (App) Output" → host + application
    /// - "HOST (Channel(App))" → host + channel + nested application (multichannel intercom)
    /// </summary>
    private static (string HostName, string? ApplicationName, string? ChannelLabel) ParseNdiStreamName(string? endpointName)
    {
        var hostName = ExtractHostLabelFromEndpointName(endpointName);
        if (string.IsNullOrWhiteSpace(endpointName))
            return (hostName, null, null);

        var raw = endpointName.Trim();

        var nestedMatch = Regex.Match(raw, @"\(([^()]+)\(([^()]+)\)\)");
        if (nestedMatch.Success)
        {
            var channelLabel = nestedMatch.Groups[1].Value.Trim();
            var applicationName = nestedMatch.Groups[2].Value.Trim();
            return (hostName, applicationName, channelLabel);
        }

        var simpleMatch = Regex.Match(raw, @"\(([^()]+)\)");
        if (simpleMatch.Success)
            return (hostName, simpleMatch.Groups[1].Value.Trim(), null);

        return (hostName, null, null);
    }

    private static string BuildDeviceDisplayName(IntercomIdentity parsed, string roleSuffix)
    {
        if (!string.Equals(parsed.ApplicationId, "unknown", StringComparison.OrdinalIgnoreCase))
            return $"{parsed.ApplicationId} {roleSuffix}";

        if (!string.Equals(parsed.HostName, "unknown", StringComparison.OrdinalIgnoreCase))
            return $"{parsed.HostName} {roleSuffix}";

        return $"Unknown {roleSuffix}";
    }

    /// <summary>
    /// Machine / host prefix before "(" or "[" in NDI endpoint names (e.g. "VECTAR-PLUS (App)").
    /// </summary>
    private static string ExtractHostLabelFromEndpointName(string? endpointName)
    {
        if (string.IsNullOrWhiteSpace(endpointName))
            return string.Empty;

        var raw = endpointName.Trim();
        var cut = raw.IndexOfAny(['(', '[']);
        if (cut <= 0)
            return string.Empty;

        var host = raw[..cut].Trim();
        if (string.IsNullOrWhiteSpace(host))
            return string.Empty;

        var sanitized = SanitizeIdentity(host, string.Empty);
        return string.Equals(sanitized, "unknown", StringComparison.OrdinalIgnoreCase) ? string.Empty : sanitized;
    }

    private static string SanitizeIdentity(string? value, string fallback)
    {
        if (string.IsNullOrWhiteSpace(value))
            return fallback;

        // Keep Unicode letters/digits (accented and non-Latin NDI names), collapse everything else to '-'.
        var cleaned = Regex.Replace(value.Trim(), @"[^\p{L}\p{M}\p{N}_.-]+", "-");
        if (string.IsNullOrWhiteSpace(cleaned) || cleaned.Trim('-').Length == 0)
            return fallback;

        // Treat placeholder tokens as missing identity values.
        if (cleaned.Equals("none", StringComparison.OrdinalIgnoreCase) ||
            cleaned.Equals("null", StringComparison.OrdinalIgnoreCase) ||
            cleaned.Equals("n-a", StringComparison.OrdinalIgnoreCase) ||
            cleaned.Equals("na", StringComparison.OrdinalIgnoreCase))
        {
            return fallback;
        }

        return cleaned;
    }

    private static bool TryExtractNameToken(string? source, string key, out string value)
    {
        value = string.Empty;
        if (string.IsNullOrWhiteSpace(source))
            return false;

        var tokenMatch = Regex.Match(
            source,
            $@"(?:^|[\[\s;]){Regex.Escape(key)}\s*=\s*([\p{{L}}\p{{M}}\p{{N}}_.-]+)",
            RegexOptions.IgnoreCase);

        if (!tokenMatch.Success)
            return false;

        value = tokenMatch.Groups[1].Value;
        return !string.IsNullOrWhiteSpace(value);
    }

    private static bool TryParseChannelIndex(string raw, out int index)
    {
        index = 0;
        if (string.IsNullOrWhiteSpace(raw))
            return false;

        var m = Regex.Match(raw, @"(?:ch[-_]?)?0*(\d+)$", RegexOptions.IgnoreCase);
        return m.Success && int.TryParse(m.Groups[1].Value, out index);
    }

    private static void InferUnknownApplicationIdsByAddress(
        IEnumerable<NDIMultiDevice> unknownSide,
        IEnumerable<NDIMultiDevice> knownSide,
        string roleLabel)
    {
        var knownAppByAddressAndDeviceHint = knownSide
            .Where(d =>
                !string.IsNullOrWhiteSpace(d.Address) &&
                d.ApplicationId != "unknown" &&
                TryGetStableDeviceHint(d, out _))
            .Select(d => new
            {
                d.ApplicationId,
                d.Address,
                DeviceHint = GetDeviceHintFromDeviceKey(d.DeviceKey)
            })
            .Where(x => !string.IsNullOrWhiteSpace(x.DeviceHint))
            .GroupBy(x => $"{x.Address}|{x.DeviceHint}", StringComparer.OrdinalIgnoreCase)
            .ToDictionary(
                g => g.Key,
                g => g.Select(x => x.ApplicationId).Distinct(StringComparer.OrdinalIgnoreCase).ToList(),
                StringComparer.OrdinalIgnoreCase);

        foreach (var device in unknownSide.Where(d =>
                     d.ApplicationId == "unknown" &&
                     !string.IsNullOrWhiteSpace(d.Address) &&
                     TryGetStableDeviceHint(d, out _)))
        {
            var unknownHint = GetDeviceHintFromDeviceKey(device.DeviceKey);
            if (string.IsNullOrWhiteSpace(unknownHint))
                continue;

            var lookupKey = $"{device.Address}|{unknownHint}";
            if (!knownAppByAddressAndDeviceHint.TryGetValue(lookupKey, out var appIds))
                continue;
            if (appIds.Count != 1)
                continue;

            device.ApplicationId = appIds[0];
            device.DisplayName = $"{device.ApplicationId} {(roleLabel == "sender" ? "Sender" : "Receiver")}";
        }
    }

    private static bool TryGetStableDeviceHint(NDIMultiDevice device, out string hint)
    {
        hint = GetDeviceHintFromDeviceKey(device.DeviceKey);
        if (string.IsNullOrWhiteSpace(hint))
            return false;
        if (string.IsNullOrWhiteSpace(device.Address))
            return false;

        // If hint equals address, it's just the address fallback (not stable enough).
        return !string.Equals(hint, device.Address, StringComparison.OrdinalIgnoreCase);
    }

    private static string GetDeviceHintFromDeviceKey(string deviceKey)
    {
        if (string.IsNullOrWhiteSpace(deviceKey))
            return string.Empty;

        var idx = deviceKey.LastIndexOf(':');
        if (idx < 0 || idx >= deviceKey.Length - 1)
            return string.Empty;

        return deviceKey[(idx + 1)..].Trim();
    }

    private static string? BuildAppChannelKey(string appId, string? channelId, int? channelIndex)
    {
        var safeApp = SanitizeIdentity(appId, "unknown");
        if (!string.IsNullOrWhiteSpace(channelId))
            return $"{safeApp}:{SanitizeIdentity(channelId, "ch")}";
        if (channelIndex is int idx)
            return $"{safeApp}:ch-{idx}";
        return null;
    }

    private static string ResolveDeviceHint(
        IntercomIdentity parsed,
        string? address,
        string? endpointUuid,
        string? endpointName)
    {
        if (!string.IsNullOrWhiteSpace(parsed.DeviceId))
            return parsed.DeviceId;

        var safeAddress = string.IsNullOrWhiteSpace(address) ? "unknown" : address;
        var hasAppIdentity = !string.Equals(parsed.ApplicationId, "unknown", StringComparison.OrdinalIgnoreCase);
        var hasHostIdentity = !string.Equals(parsed.HostName, "unknown", StringComparison.OrdinalIgnoreCase);
        var hasChannelIdentity = !string.IsNullOrWhiteSpace(parsed.ChannelId) || parsed.ChannelIndex is not null;

        // Unknown identity without channel metadata: one node per endpoint.
        if (!hasAppIdentity && !hasChannelIdentity)
        {
            if (!string.IsNullOrWhiteSpace(endpointUuid))
                return endpointUuid;
            if (!string.IsNullOrWhiteSpace(endpointName))
                return SanitizeIdentity(endpointName, "endpoint");
        }

        // Same application on the same host → one multichannel node (e.g. vMix outputs, intercom channels).
        if (hasAppIdentity)
        {
            if (hasHostIdentity)
                return $"{parsed.ApplicationId}@{parsed.HostName}";
            return parsed.ApplicationId;
        }

        return safeAddress;
    }

    private void CacheSenderEvents(List<NDISenderEvent> events)
    {
        foreach (var evt in events)
        {
            if (string.IsNullOrEmpty(evt.SenderUuid))
                continue;

            var eventData = _senderEventCache.GetOrAdd(
                evt.SenderUuid,
                _ => new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase));

            var key = evt.EventName?.Trim();
            if (string.IsNullOrEmpty(key))
                continue;

            lock (eventData)
            {
                eventData[key] = evt.EventValue ?? string.Empty;
            }
        }
    }

    private void CacheReceiverEvents(List<NDIReceiverEvent> events)
    {
        foreach (var evt in events)
        {
            if (string.IsNullOrEmpty(evt.ReceiverUuid))
                continue;

            if (string.Equals(evt.EventName, "source-name", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(evt.EventName, "connection-state", StringComparison.OrdinalIgnoreCase))
            {
                // Routing changes are rare and the key trail for "why is this receiver (not) connected".
                _logger.LogInformation("Receiver {Uuid} {Event} = '{Value}'", evt.ReceiverUuid, evt.EventName, evt.EventValue);
            }

            if (string.Equals(evt.EventName, "source-name", StringComparison.OrdinalIgnoreCase))
            {
                if (string.IsNullOrWhiteSpace(evt.EventValue))
                    _receiverSourceNames.TryRemove(evt.ReceiverUuid, out _);
                else
                    _receiverSourceNames[evt.ReceiverUuid] = evt.EventValue.Trim();
            }

            if (string.Equals(evt.EventName, "connection-state", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(evt.EventValue, "disconnected", StringComparison.OrdinalIgnoreCase))
            {
                _receiverSourceNames.TryRemove(evt.ReceiverUuid, out _);
            }

            var eventData = _receiverEventCache.GetOrAdd(
                evt.ReceiverUuid,
                _ => new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase));

            var key = evt.EventName?.Trim();
            if (string.IsNullOrEmpty(key))
                continue;

            lock (eventData)
            {
                eventData[key] = evt.EventValue ?? string.Empty;
            }
        }
    }

    private static void ApplyReceiverMonitoringEvents(NDIReceiverInfo receiver, Dictionary<string, string> eventData)
    {
        if (eventData.TryGetValue("video-resolution", out var resolutionStr))
        {
            var resolution = resolutionStr.Split('x');
            if (resolution.Length == 2 && int.TryParse(resolution[0], out var width) && int.TryParse(resolution[1], out var height))
            {
                receiver.Width = width;
                receiver.Height = height;
            }
        }

        if (eventData.TryGetValue("video-frame-rate", out var frameRateStr))
        {
            var parts = frameRateStr.Split('/');
            if (parts.Length == 2 && int.TryParse(parts[0], out var n) && int.TryParse(parts[1], out var d))
            {
                receiver.FrameRateN = n;
                receiver.FrameRateD = d;
            }
        }

        if (eventData.TryGetValue("video-codec", out var videoCodec))
            receiver.VideoCodec = videoCodec.ToUpper();

        if (eventData.TryGetValue("video-frame-type", out var frameType))
            receiver.VideoFrameType = frameType;

        if (eventData.TryGetValue("video-has-alpha", out var hasAlphaStr))
            receiver.VideoHasAlpha = NdiStringUtil.IsNdiTrueString(hasAlphaStr);

        if (eventData.TryGetValue("video-present", out var videoPresentStr))
            receiver.VideoPresent = NdiStringUtil.IsNdiTrueString(videoPresentStr);

        if (eventData.TryGetValue("video-receive-mode", out var videoReceiveMode))
            receiver.VideoReceiveMode = videoReceiveMode.Trim();

        if (eventData.TryGetValue("video-color-primaries", out var colorPrimaries))
            receiver.VideoColorPrimaries = colorPrimaries.Trim();

        if (eventData.TryGetValue("video-transfer-function", out var transferFunction))
            receiver.VideoTransferFunction = transferFunction.Trim();

        if (eventData.TryGetValue("video-matrix-coefficients", out var matrixCoefficients))
            receiver.VideoMatrixCoefficients = matrixCoefficients.Trim();

        if (eventData.TryGetValue("audio-codec", out var audioCodec))
            receiver.AudioCodec = audioCodec.ToUpper();

        if (eventData.TryGetValue("audio-channels", out var channelsStr) && int.TryParse(channelsStr, out var audioChannels))
            receiver.AudioChannels = audioChannels;

        if (eventData.TryGetValue("audio-sample-rate", out var sampleRateStr) && int.TryParse(sampleRateStr, out var sampleRate))
            receiver.AudioSampleRate = sampleRate;

        if (eventData.TryGetValue("audio-present", out var audioPresentStr))
            receiver.AudioPresent = NdiStringUtil.IsNdiTrueString(audioPresentStr);

        if (eventData.TryGetValue("audio-receive-mode", out var audioReceiveMode))
            receiver.AudioReceiveMode = audioReceiveMode.Trim();

        if (eventData.TryGetValue("sdk-version", out var sdkVersion))
            receiver.SdkVersion = sdkVersion;

        if (eventData.TryGetValue("tally-on-program", out var pgmStr))
            receiver.TallyOnProgram = NdiStringUtil.IsNdiTrueString(pgmStr);

        if (eventData.TryGetValue("tally-on-preview", out var pvwStr))
            receiver.TallyOnPreview = NdiStringUtil.IsNdiTrueString(pvwStr);

        if (eventData.TryGetValue("web-control", out var webControl))
            receiver.WebControlUrl = webControl;

        if (eventData.TryGetValue("video-frames-dropped", out var droppedStr) && int.TryParse(droppedStr, out var dropped))
            receiver.DroppedFrames = dropped;
    }

    private static void ApplySenderMonitoringEvents(NDISenderInfo sender, Dictionary<string, string> eventData)
    {
        if (eventData.TryGetValue("connected-receivers", out var connectionsStr) &&
            int.TryParse(connectionsStr, NumberStyles.Integer, CultureInfo.InvariantCulture, out var connections))
            sender.ConnectionCount = connections;

        if (eventData.TryGetValue("video-resolution", out var resolutionStr))
        {
            var resolution = resolutionStr.Split('x');
            if (resolution.Length == 2 && int.TryParse(resolution[0], out var width) && int.TryParse(resolution[1], out var height))
            {
                sender.Width = width;
                sender.Height = height;
            }
        }

        if (eventData.TryGetValue("video-frame-rate", out var frameRateStr))
        {
            var parts = frameRateStr.Split('/');
            if (parts.Length == 2 && int.TryParse(parts[0], out var n) && int.TryParse(parts[1], out var d))
            {
                sender.FrameRateN = n;
                sender.FrameRateD = d;
            }
        }

        if (eventData.TryGetValue("video-codec", out var videoCodec))
            sender.VideoCodec = videoCodec.ToUpper();

        if (eventData.TryGetValue("video-frame-type", out var frameType))
            sender.VideoFrameType = frameType;

        if (eventData.TryGetValue("video-has-alpha", out var hasAlphaStr))
            sender.VideoHasAlpha = NdiStringUtil.IsNdiTrueString(hasAlphaStr);

        if (eventData.TryGetValue("video-present", out var videoPresentStr))
            sender.VideoPresent = NdiStringUtil.IsNdiTrueString(videoPresentStr);

        if (eventData.TryGetValue("audio-codec", out var audioCodec))
            sender.AudioCodec = audioCodec.ToUpper();

        if (eventData.TryGetValue("audio-channels", out var channelsStr) && int.TryParse(channelsStr, out var audioChannels))
            sender.AudioChannels = audioChannels;

        if (eventData.TryGetValue("audio-sample-rate", out var sampleRateStr) && int.TryParse(sampleRateStr, out var sampleRate))
            sender.AudioSampleRate = sampleRate;

        if (eventData.TryGetValue("audio-present", out var audioPresentStr))
            sender.AudioPresent = NdiStringUtil.IsNdiTrueString(audioPresentStr);

        if (eventData.TryGetValue("sdk-version", out var sdkVersion))
            sender.SdkVersion = sdkVersion;

        if (eventData.TryGetValue("video-frames-sent", out var videoFramesStr) &&
            long.TryParse(videoFramesStr, NumberStyles.Integer, CultureInfo.InvariantCulture, out var videoFrames))
            sender.VideoFramesSent = videoFrames;

        if (eventData.TryGetValue("video-bytes-sent", out var videoBytesStr) &&
            long.TryParse(videoBytesStr, NumberStyles.Integer, CultureInfo.InvariantCulture, out var videoBytes))
        {
            sender.VideoBytesSent = videoBytes;
            sender.BytesPerSecond = videoBytes;
        }

        if (eventData.TryGetValue("video-color-primaries", out var colorPrimaries))
            sender.VideoColorPrimaries = colorPrimaries.Trim();

        if (eventData.TryGetValue("video-transfer-function", out var transferFunction))
            sender.VideoTransferFunction = transferFunction.Trim();

        if (eventData.TryGetValue("video-matrix-coefficients", out var matrixCoefficients))
            sender.VideoMatrixCoefficients = matrixCoefficients.Trim();

        if (eventData.TryGetValue("audio-frames-sent", out var audioFramesStr) &&
            long.TryParse(audioFramesStr, NumberStyles.Integer, CultureInfo.InvariantCulture, out var audioFrames))
            sender.AudioFramesSent = audioFrames;

        if (eventData.TryGetValue("audio-bytes-sent", out var audioBytesStr) &&
            long.TryParse(audioBytesStr, NumberStyles.Integer, CultureInfo.InvariantCulture, out var audioBytes))
            sender.AudioBytesSent = audioBytes;

        if (eventData.TryGetValue("metadata-frames-sent", out var metadataFramesStr) &&
            long.TryParse(metadataFramesStr, NumberStyles.Integer, CultureInfo.InvariantCulture, out var metadataFrames))
            sender.MetadataFramesSent = metadataFrames;

        if (eventData.TryGetValue("metadata-bytes-sent", out var metadataBytesStr) &&
            long.TryParse(metadataBytesStr, NumberStyles.Integer, CultureInfo.InvariantCulture, out var metadataBytes))
            sender.MetadataBytesSent = metadataBytes;

        if (eventData.TryGetValue("video-frames-dropped", out var droppedStr) && int.TryParse(droppedStr, out var dropped))
            sender.DroppedFrames = dropped;

        if (eventData.TryGetValue("tally-on-program", out var pgmStr))
            sender.TallyOnProgram = NdiStringUtil.IsNdiTrueString(pgmStr);

        if (eventData.TryGetValue("tally-on-preview", out var pvwStr))
            sender.TallyOnPreview = NdiStringUtil.IsNdiTrueString(pvwStr);

        if (eventData.TryGetValue("web-control", out var webControl))
            sender.WebControlUrl = webControl;
    }

    private static void UpdateDeviceTechnicalSummaries(NDIMultiDevice device)
    {
        var channels = device.Channels;
        if (channels.Count == 0)
            return;

        device.VideoSummary = BuildDistinctSummary(channels
            .Select(c => c.VideoCodec)
            .Where(v => !string.IsNullOrWhiteSpace(v)));

        device.AudioSummary = BuildDistinctSummary(channels
            .Select(c =>
            {
                if (string.IsNullOrWhiteSpace(c.AudioCodec) && c.AudioChannels <= 0 && c.AudioSampleRate <= 0)
                    return string.Empty;

                var codec = string.IsNullOrWhiteSpace(c.AudioCodec) ? "audio" : c.AudioCodec;
                var channelsPart = c.AudioChannels > 0 ? $"{c.AudioChannels}ch" : "?ch";
                var sampleRatePart = c.AudioSampleRate > 0 ? $"{c.AudioSampleRate}Hz" : "?Hz";
                return $"{codec} {channelsPart}/{sampleRatePart}";
            })
            .Where(v => !string.IsNullOrWhiteSpace(v)));

        device.ResolutionSummary = BuildDistinctSummary(channels
            .Where(c => c.Width > 0 && c.Height > 0)
            .Select(c => $"{c.Width}x{c.Height}"));

        device.FrameRateSummary = BuildDistinctSummary(channels
            .Where(c => c.FrameRateN > 0 && c.FrameRateD > 0)
            .Select(c => $"{c.FrameRate:0.00} fps"));

        var ports = channels
            .Where(c => c.Port > 0)
            .Select(c => c.Port)
            .Distinct()
            .OrderBy(p => p)
            .ToList();

        device.PortSummary = ports.Count switch
        {
            0 => "-",
            1 => ports[0].ToString(),
            _ => $"{ports.First()}-{ports.Last()} ({ports.Count})"
        };
    }

    private void SyncReceiverSourceNamesFromEventCache()
    {
        foreach (var (receiverUuid, eventData) in _receiverEventCache)
        {
            lock (eventData)
            {
                if (eventData.TryGetValue("source-name", out var sourceName) && !string.IsNullOrWhiteSpace(sourceName))
                    _receiverSourceNames[receiverUuid] = sourceName.Trim();
            }
        }
    }

    private void ApplyReceiverConnectionFromEvents(NDIReceiverInfo receiver)
    {
        receiver.IsConnected = false;
        receiver.CurrentSource = null;

        if (string.IsNullOrEmpty(receiver.Id))
            return;

        if (_receiverEventCache.TryGetValue(receiver.Id, out var eventData))
        {
            lock (eventData)
            {
                if (eventData.TryGetValue("connection-state", out var connState) &&
                    string.Equals(connState, "disconnected", StringComparison.OrdinalIgnoreCase))
                {
                    return;
                }

                if (eventData.TryGetValue("source-name", out var sourceName) && !string.IsNullOrWhiteSpace(sourceName))
                {
                    receiver.CurrentSource = sourceName.Trim();
                    receiver.IsConnected = true;
                    return;
                }
            }
        }

        if (_receiverSourceNames.TryGetValue(receiver.Id, out var cachedSource) && !string.IsNullOrWhiteSpace(cachedSource))
        {
            receiver.CurrentSource = cachedSource.Trim();
            receiver.IsConnected = true;
        }
    }

    private static NDIMultiChannel? TryFindSenderChannelForSource(
        string sourceName,
        Dictionary<string, NDIMultiChannel> senderChannelsByName,
        Dictionary<string, NDIMultiChannel> senderChannelsByAppChannel,
        IReadOnlyList<NDIMultiDevice> senderDevices)
    {
        var trimmed = sourceName.Trim();
        if (string.IsNullOrEmpty(trimmed))
            return null;

        if (senderChannelsByName.TryGetValue(trimmed, out var exact))
            return exact;

        foreach (var device in senderDevices)
        {
            foreach (var channel in device.Channels)
            {
                if (string.Equals(channel.StreamLabel, trimmed, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(channel.EndpointName, trimmed, StringComparison.OrdinalIgnoreCase))
                {
                    return channel;
                }
            }
        }

        var sourceIdentity = ParseIntercomIdentity(string.Empty, trimmed);
        var sourceKey = BuildAppChannelKey(sourceIdentity.ApplicationId, sourceIdentity.ChannelId, sourceIdentity.ChannelIndex);
        if (!string.IsNullOrWhiteSpace(sourceKey) &&
            senderChannelsByAppChannel.TryGetValue(sourceKey, out var byAppChannel))
        {
            return byAppChannel;
        }

        return null;
    }

    private static string BuildDistinctSummary(IEnumerable<string> values)
    {
        var list = values
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Select(v => v.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(v => v, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (list.Count == 0)
            return "-";
        if (list.Count == 1)
            return list[0];

        var preview = string.Join(", ", list.Take(2));
        return list.Count > 2 ? $"mixed ({preview}, ...)" : $"mixed ({preview})";
    }

    private static bool IsChannelStreaming(
        bool videoPresent,
        bool audioPresent,
        string? videoCodec,
        int width,
        int height,
        string? audioCodec,
        int audioChannels)
    {
        if (videoPresent || audioPresent)
            return true;

        if (!string.IsNullOrWhiteSpace(videoCodec))
            return true;

        if (width > 0 && height > 0)
            return true;

        return !string.IsNullOrWhiteSpace(audioCodec) && audioChannels > 0;
    }

    private readonly record struct IntercomIdentity(
        string ApplicationId,
        string HostName,
        string? DeviceId,
        string? ChannelId,
        int? ChannelIndex);

    public bool ConnectReceiver(string receiverUuid, string sourceName)
    {
        try
        {
            bool success;
            lock (_ndiLock)
            {
                if (_disposed)
                    return false;
                success = _recvListener.SendConnectCommand(receiverUuid, sourceName);
            }

            if (success)
            {
                var trimmed = sourceName.Trim();
                _receiverSourceNames[receiverUuid] = trimmed;
                var eventData = _receiverEventCache.GetOrAdd(receiverUuid, _ => new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase));
                lock (eventData)
                {
                    eventData["source-name"] = trimmed;
                    eventData["connection-state"] = "connected";
                }

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
            bool success;
            lock (_ndiLock)
            {
                if (_disposed)
                    return false;
                success = _recvListener.SendDisconnectCommand(receiverUuid);
            }

            if (success)
            {
                _receiverSourceNames.TryRemove(receiverUuid, out _);
                if (_receiverEventCache.TryGetValue(receiverUuid, out var eventData))
                {
                    lock (eventData)
                    {
                        eventData["source-name"] = string.Empty;
                        eventData["connection-state"] = "disconnected";
                    }
                }

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

    private void MergeDiscoveredSenders(IReadOnlyList<NDISenderInfo> discovered)
    {
        var now = DateTime.UtcNow;
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var sender in discovered)
        {
            if (string.IsNullOrWhiteSpace(sender.Name))
                continue;

            if (!string.IsNullOrEmpty(sender.Id) && _senderEventCache.TryGetValue(sender.Id, out var eventData))
            {
                lock (eventData)
                {
                    ApplySenderMonitoringEvents(sender, eventData);
                }
            }

            sender.LastSeen = now;
            _senders[sender.Name] = sender;
            seen.Add(sender.Name);
            if (!string.IsNullOrEmpty(sender.Id))
                _senderUuidLastSeen[sender.Id] = now;
        }

        TouchFinderVisibleSenders(seen, now);

        foreach (var key in _senders.Keys.ToList())
        {
            if (seen.Contains(key))
                continue;

            if (now - _senders[key].LastSeen > SenderStaleGrace)
                _senders.TryRemove(key, out _);
        }
    }

    private void MergeDiscoveredReceivers(IReadOnlyList<NDIReceiverInfo> discovered)
    {
        var now = DateTime.UtcNow;
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var receiver in discovered)
        {
            if (string.IsNullOrWhiteSpace(receiver.Id))
                continue;

            ApplyReceiverConnectionFromEvents(receiver);

            if (_receiverEventCache.TryGetValue(receiver.Id, out var eventData))
            {
                lock (eventData)
                {
                    ApplyReceiverMonitoringEvents(receiver, eventData);
                }
            }

            receiver.LastSeen = now;
            _receivers[receiver.Id] = receiver;
            seen.Add(receiver.Id);
            _receiverUuidLastSeen[receiver.Id] = now;
        }

        foreach (var key in _receivers.Keys.ToList())
        {
            if (seen.Contains(key))
                continue;

            if (now - _receivers[key].LastSeen > ReceiverStaleGrace)
                _receivers.TryRemove(key, out _);
        }
    }

    /// <summary>
    /// Refreshes LastSeen for senders still visible on the network via NDI Finder (avoids stale flapping).
    /// </summary>
    private void TouchFinderVisibleSenders(HashSet<string> seen, DateTime now)
    {
        foreach (var name in EnumerateFinderSourceNames())
        {
            foreach (var key in _senders.Keys)
            {
                if (!string.Equals(key, name, StringComparison.OrdinalIgnoreCase))
                    continue;

                _senders[key].LastSeen = now;
                seen.Add(key);
                break;
            }
        }
    }

    private IEnumerable<(string Name, string Url)> EnumerateFinderSources()
    {
        if (_finderInstance == IntPtr.Zero)
            yield break;

        NDI.NDIlib_find_wait_for_sources(_finderInstance, 0);

        uint numSources = 0;
        IntPtr sourcesPtr = NDI.NDIlib_find_get_current_sources(_finderInstance, ref numSources);
        if (sourcesPtr == IntPtr.Zero || numSources == 0)
            yield break;

        int structSize = Marshal.SizeOf<NDI.source_t>();
        for (int i = 0; i < numSources; i++)
        {
            IntPtr currentPtr = IntPtr.Add(sourcesPtr, i * structSize);
            var source = Marshal.PtrToStructure<NDI.source_t>(currentPtr);
            var sourceName = NdiStringUtil.PtrToUtf8String(source.p_ndi_name);
            if (string.IsNullOrWhiteSpace(sourceName))
                continue;

            var sourceUrl = NdiStringUtil.PtrToUtf8String(source.p_url_address);
            yield return (sourceName, sourceUrl);
        }
    }

    private IEnumerable<string> EnumerateFinderSourceNames()
    {
        foreach (var (name, _) in EnumerateFinderSources())
            yield return name;
    }

    /// <summary>
    /// Adds NDI Finder sources not already registered on the Discovery Server Send Listener (legacy / pre-6.x senders).
    /// </summary>
    private int MergeFinderLegacySenders()
    {
        if (_finderInstance == IntPtr.Zero)
            return 0;


        var added = 0;
        var finderCount = 0;

        foreach (var (sourceName, sourceUrl) in EnumerateFinderSources())
        {
            finderCount++;
            if (_senders.Keys.Any(k => string.Equals(k, sourceName, StringComparison.OrdinalIgnoreCase)))
                continue;

            ParseFinderSourceUrl(sourceUrl, out var address, out var port);

            var legacySender = new NDISenderInfo
            {
                Id = BuildLegacySenderId(sourceName),
                Name = sourceName,
                Address = address,
                HostName = address,
                Port = port,
                IsLegacyDiscovery = true,
                LastSeen = DateTime.UtcNow,
            };

            _senders[sourceName] = legacySender;
            added++;
        }

        _logger.LogDebug("NDI Finder enumerated {Count} network source(s)", finderCount);
        return added;
    }

    private static string BuildLegacySenderId(string sourceName)
    {
        var hash = System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(sourceName.Trim()));
        return "legacy:" + Convert.ToHexString(hash)[..16];
    }

    private static void ParseFinderSourceUrl(string? url, out string address, out int port)
    {
        address = string.Empty;
        port = 0;
        if (string.IsNullOrWhiteSpace(url))
            return;

        var trimmed = url.Trim();
        var lastColon = trimmed.LastIndexOf(':');
        if (lastColon > 0 && lastColon < trimmed.Length - 1)
        {
            var portPart = trimmed[(lastColon + 1)..];
            if (int.TryParse(portPart, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedPort))
            {
                port = parsedPort;
                address = trimmed[..lastColon].Trim();
                return;
            }
        }

        address = trimmed;
    }

    /// <summary>
    /// NDI Discovery Server host:port (e.g. 192.168.1.10:5959). Empty = SDK default (null p_url_address).
    /// Env <c>NDI_DISCOVERY_SERVER</c> or configuration <c>Ndi:DiscoveryServer</c> / <c>Ndi__DiscoveryServer</c>.
    /// </summary>
    private static string? ResolveDiscoveryServerUrl(IConfiguration configuration)
    {
        var env = Environment.GetEnvironmentVariable("NDI_DISCOVERY_SERVER");
        if (!string.IsNullOrWhiteSpace(env))
            return env.Trim();

        var cfg = configuration["Ndi:DiscoveryServer"]
                  ?? configuration["NdiDiscoveryServer"];
        if (!string.IsNullOrWhiteSpace(cfg))
            return cfg.Trim();

        return null;
    }

    public override void Dispose()
    {
        // The host awaits ExecuteAsync during StopAsync; the lock also waits for any in-flight
        // connect/disconnect command before native instances are released.
        lock (_ndiLock)
        {
            if (_disposed)
                return;
            _disposed = true;

            _receivers.Clear();

            _sendListener?.Dispose();
            _recvListener?.Dispose();

            if (_finderInstance != IntPtr.Zero)
            {
                NDI.NDIlib_find_destroy(_finderInstance);
                _finderInstance = IntPtr.Zero;
            }

            NDI.NDIlib_destroy();
        }

        base.Dispose();
        GC.SuppressFinalize(this);
    }
}
