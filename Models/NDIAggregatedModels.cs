namespace NDIManager.Models;

public class NDIAggregatedSnapshot
{
    public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
    public List<NDIMultiDevice> Senders { get; set; } = new();
    public List<NDIMultiDevice> Receivers { get; set; } = new();
    public List<NDIMultiConnection> Connections { get; set; } = new();
}

public class NDIMultiDevice
{
    public string DeviceKey { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty; // sender | receiver
    public string DisplayName { get; set; } = string.Empty;
    public string ApplicationId { get; set; } = "unknown";
    /// <summary>Machine / PC prefix from NDI stream name (e.g. VECTAR-PLUS).</summary>
    public string HostName { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string VideoSummary { get; set; } = "-";
    public string AudioSummary { get; set; } = "-";
    public string ResolutionSummary { get; set; } = "-";
    public string FrameRateSummary { get; set; } = "-";
    public string PortSummary { get; set; } = "-";
    public int ChannelCount => Channels.Count;
    public List<NDIMultiChannel> Channels { get; set; } = new();
}

public class NDIMultiChannel
{
    public string ChannelId { get; set; } = string.Empty;
    public int? ChannelIndex { get; set; }
    public string StreamLabel { get; set; } = string.Empty;
    public string EndpointUuid { get; set; } = string.Empty;
    public string EndpointName { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty; // sender | receiver
    public bool IsConnected { get; set; }
    public bool IsStreaming { get; set; }
    public string? CurrentSource { get; set; }
    public string Address { get; set; } = string.Empty;
    public int Port { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public int FrameRateN { get; set; }
    public int FrameRateD { get; set; }
    public double FrameRate => FrameRateD > 0 ? (double)FrameRateN / FrameRateD : 0;
    public string VideoCodec { get; set; } = string.Empty;
    public bool VideoHasAlpha { get; set; }
    public string AudioCodec { get; set; } = string.Empty;
    public int AudioChannels { get; set; }
    public int AudioSampleRate { get; set; }
    public bool TallyOnProgram { get; set; }
    public bool TallyOnPreview { get; set; }
    public string SdkVersion { get; set; } = string.Empty;
    public string WebControlUrl { get; set; } = string.Empty;
    public int DroppedFrames { get; set; }
    public List<string> Streams { get; set; } = new();
    public List<string> Commands { get; set; } = new();
}

public class NDIMultiConnection
{
    public string ConnectionId { get; set; } = string.Empty;
    public string SenderDeviceKey { get; set; } = string.Empty;
    public string SenderChannelId { get; set; } = string.Empty;
    public string SenderLabel { get; set; } = string.Empty;
    public string SenderUuid { get; set; } = string.Empty;
    public string ReceiverDeviceKey { get; set; } = string.Empty;
    public string ReceiverChannelId { get; set; } = string.Empty;
    public string ReceiverLabel { get; set; } = string.Empty;
    public string ReceiverUuid { get; set; } = string.Empty;
    public string SourceName { get; set; } = string.Empty;
}
