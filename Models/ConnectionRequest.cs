namespace NDIManager.Models;

public class ConnectionRequest
{
    public string ReceiverUuid { get; set; } = string.Empty;
    public string SourceName { get; set; } = string.Empty;
}

public class ConnectionResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? ReceiverUuid { get; set; }
    public string? SourceName { get; set; }
}

public class DisconnectionRequest
{
    public string ReceiverUuid { get; set; } = string.Empty;
}
