namespace NDIManager.Models;

public class NdiSystemStatus
{
    public string AppVersion { get; set; } = string.Empty;
    public DateTime ServerTime { get; set; } = DateTime.UtcNow;
    public string DiscoveryServerUrl { get; set; } = string.Empty;
    public bool SendListenerConnected { get; set; }
    public bool RecvListenerConnected { get; set; }
    public string? SendListenerServerUrl { get; set; }
    public string? RecvListenerServerUrl { get; set; }
    public bool FinderAvailable { get; set; }
    public int SenderCount { get; set; }
    public int LegacySenderCount { get; set; }
    public int ReceiverCount { get; set; }
    public int ConnectionCount { get; set; }
    public DateTime LastDiscoveryAt { get; set; }
    public string Health { get; set; } = "unknown";
}

public class NdiBulkDisconnectRequest
{
    public List<string> ReceiverUuids { get; set; } = new();
}

public class NdiBulkOperationResponse
{
    public int Requested { get; set; }
    public int Succeeded { get; set; }
    public List<string> Errors { get; set; } = new();
}
