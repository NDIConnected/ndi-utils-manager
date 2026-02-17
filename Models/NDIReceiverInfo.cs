namespace NDIManager.Models;

public class NDIReceiverInfo
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = string.Empty;
    public string HostName { get; set; } = Environment.MachineName;
    public string? InputUuid { get; set; }  // UUID of the connected sender
    public string? CurrentSource { get; set; }
    public bool IsConnected { get; set; }

    // Video properties (from source)
    public int Width { get; set; }
    public int Height { get; set; }
    public int FrameRateN { get; set; }
    public int FrameRateD { get; set; }
    public double FrameRate => FrameRateD > 0 ? (double)FrameRateN / FrameRateD : 0;
    public string VideoCodec { get; set; } = string.Empty;
    public string VideoFrameType { get; set; } = string.Empty;
    public bool VideoHasAlpha { get; set; }

    // Audio properties (from source)
    public string AudioCodec { get; set; } = string.Empty;
    public int AudioChannels { get; set; }
    public int AudioSampleRate { get; set; }

    // General properties
    public string SdkVersion { get; set; } = string.Empty;
    public DateTime LastSeen { get; set; } = DateTime.Now;
    public string Status => IsConnected ? "Connected" : "Idle";
}
