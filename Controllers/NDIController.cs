using Microsoft.AspNetCore.Mvc;
using NDIManager.Models;
using NDIManager.Services;

namespace NDIManager.Controllers;

[ApiController]
[Route("api/ndi")]
public class NDIController : ControllerBase
{
    private readonly NDIDiscoveryService _discoveryService;
    private readonly ILogger<NDIController> _logger;

    public NDIController(
        NDIDiscoveryService discoveryService,
        ILogger<NDIController> logger)
    {
        _discoveryService = discoveryService;
        _logger = logger;
    }

    /// <summary>
    /// Get all discovered NDI senders
    /// </summary>
    [HttpGet("senders")]
    public ActionResult<List<NDISenderInfo>> GetSenders()
    {
        try
        {
            var senders = _discoveryService.GetSenders();
            return Ok(senders);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting senders");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Get all discovered NDI receivers from Discovery Server
    /// </summary>
    [HttpGet("receivers")]
    public ActionResult<List<NDIReceiverInfo>> GetReceivers()
    {
        try
        {
            var receivers = _discoveryService.GetReceivers();
            return Ok(receivers);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting receivers");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Get aggregated multichannel devices and channel-level connections
    /// </summary>
    [HttpGet("devices")]
    public ActionResult<NDIAggregatedSnapshot> GetDevices()
    {
        try
        {
            var snapshot = _discoveryService.GetAggregatedSnapshot();
            return Ok(snapshot);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting aggregated devices");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Connect a receiver to a sender via Discovery Server command
    /// </summary>
    [HttpPost("connect")]
    public ActionResult<ConnectionResponse> Connect([FromBody] ConnectionRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.ReceiverUuid) || string.IsNullOrWhiteSpace(request.SourceName))
            {
                return BadRequest(new ConnectionResponse
                {
                    Success = false,
                    Message = "Both ReceiverUuid and SourceName are required"
                });
            }

            bool success = _discoveryService.ConnectReceiver(request.ReceiverUuid, request.SourceName);

            return Ok(new ConnectionResponse
            {
                Success = success,
                Message = success ? $"CONNECT command sent successfully" : "Failed to send CONNECT command",
                ReceiverUuid = request.ReceiverUuid,
                SourceName = request.SourceName
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending connect command");
            return StatusCode(500, new ConnectionResponse
            {
                Success = false,
                Message = ex.Message
            });
        }
    }

    /// <summary>
    /// Disconnect a receiver via Discovery Server command
    /// </summary>
    [HttpPost("disconnect")]
    public ActionResult<ConnectionResponse> Disconnect([FromBody] DisconnectionRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.ReceiverUuid))
            {
                return BadRequest(new ConnectionResponse
                {
                    Success = false,
                    Message = "ReceiverUuid is required"
                });
            }

            bool success = _discoveryService.DisconnectReceiver(request.ReceiverUuid);

            return Ok(new ConnectionResponse
            {
                Success = success,
                Message = success ? "DISCONNECT command sent successfully" : "Failed to send DISCONNECT command",
                ReceiverUuid = request.ReceiverUuid
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending disconnect command");
            return StatusCode(500, new ConnectionResponse
            {
                Success = false,
                Message = ex.Message
            });
        }
    }

    /// <summary>
    /// System status including Discovery Server listener health
    /// </summary>
    [HttpGet("status")]
    public ActionResult<NdiSystemStatus> GetStatus()
    {
        try
        {
            return Ok(_discoveryService.GetSystemStatus());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting system status");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Disconnect multiple receivers in one request
    /// </summary>
    [HttpPost("disconnect-bulk")]
    public ActionResult<NdiBulkOperationResponse> DisconnectBulk([FromBody] NdiBulkDisconnectRequest request)
    {
        try
        {
            var uuids = request?.ReceiverUuids ?? new List<string>();
            if (uuids.Count == 0)
            {
                return BadRequest(new NdiBulkOperationResponse
                {
                    Errors = { "At least one ReceiverUuid is required" }
                });
            }

            var result = _discoveryService.BulkDisconnectReceivers(uuids);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during bulk disconnect");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Health check endpoint
    /// </summary>
    [HttpGet("health")]
    public ActionResult GetHealth()
    {
        var status = _discoveryService.GetSystemStatus();
        return Ok(new
        {
            status = status.Health,
            timestamp = DateTime.UtcNow,
            senderCount = status.SenderCount,
            receiverCount = status.ReceiverCount,
            sendListenerConnected = status.SendListenerConnected,
            recvListenerConnected = status.RecvListenerConnected,
        });
    }
}
