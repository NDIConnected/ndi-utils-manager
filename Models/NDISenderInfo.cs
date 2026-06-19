namespace NDIManager.Models;

public class NDISenderInfo
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string HostName { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public int Port { get; set; }
    public string SourceMetadata { get; set; } = string.Empty;

    /// <summary>Discovered via NDI Finder only (pre-NDI 6 / no Send Listener registration).</summary>
    public bool IsLegacyDiscovery { get; set; }

    // Tally
    public bool TallyOnProgram { get; set; }
    public bool TallyOnPreview { get; set; }

    // Video properties
    public int Width { get; set; }
    public int Height { get; set; }
    public int FrameRateN { get; set; }
    public int FrameRateD { get; set; }
    public double FrameRate => FrameRateD > 0 ? (double)FrameRateN / FrameRateD : 0;
    public string VideoCodec { get; set; } = string.Empty;
    public string VideoFrameType { get; set; } = string.Empty;
    public bool VideoHasAlpha { get; set; }
    public bool VideoPresent { get; set; }

    // Audio properties
    public string AudioCodec { get; set; } = string.Empty;
    public int AudioChannels { get; set; }
    public int AudioSampleRate { get; set; }
    public bool AudioPresent { get; set; }

    // Connection properties
    public int ConnectionCount { get; set; }
    public long BytesPerSecond { get; set; }
    public string BandwidthMBps => (BytesPerSecond / (1024.0 * 1024.0)).ToString("F2");
    public int DroppedFrames { get; set; }

    // Sender monitoring (NDI Send Listener events)
    public long VideoFramesSent { get; set; }
    public long VideoBytesSent { get; set; }
    public string VideoColorPrimaries { get; set; } = string.Empty;
    public string VideoTransferFunction { get; set; } = string.Empty;
    public string VideoMatrixCoefficients { get; set; } = string.Empty;
    public long AudioFramesSent { get; set; }
    public long AudioBytesSent { get; set; }
    public long MetadataFramesSent { get; set; }
    public long MetadataBytesSent { get; set; }

    // General properties
    public string SdkVersion { get; set; } = string.Empty;
    public string WebControlUrl { get; set; } = string.Empty;
    public DateTime LastSeen { get; set; } = DateTime.Now;
    public string Status => IsLegacyDiscovery
        ? "Legacy"
        : ConnectionCount > 0 ? "Active" : "Idle";
}
