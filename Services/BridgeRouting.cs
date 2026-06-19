using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;
using NDIManager.Models;

namespace NDIManager.Services;

/// <summary>
/// Groups NDI Bridge republished outputs into a single hub device and pairs them with direct upstream sources.
/// </summary>
internal static class BridgeRouting
{
    private static readonly Regex BridgeHostPattern = new(@"\bbridge\b", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static HashSet<string> ResolveBridgeHosts(IConfiguration configuration)
    {
        var hosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var env = Environment.GetEnvironmentVariable("NDI_BRIDGE_HOSTS");
        if (!string.IsNullOrWhiteSpace(env))
        {
            foreach (var part in env.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                hosts.Add(part);
        }

        var section = configuration.GetSection("Ndi:BridgeHosts");
        foreach (var child in section.GetChildren())
        {
            if (!string.IsNullOrWhiteSpace(child.Value))
                hosts.Add(child.Value.Trim());
        }

        return hosts;
    }

    public static bool IsBridgeHost(string? hostName, HashSet<string> configuredHosts)
    {
        if (string.IsNullOrWhiteSpace(hostName))
            return false;

        if (configuredHosts.Contains(hostName))
            return true;

        return BridgeHostPattern.IsMatch(hostName);
    }

    /// <summary>
    /// Ensures legacy/finder-only bridge republish streams group under the bridge host (not IP address).
    /// </summary>
    public static void NormalizeBridgeSenderHosts(
        IEnumerable<NDISenderInfo> senders,
        HashSet<string> configuredBridgeHosts)
    {
        var bridgeHosts = new HashSet<string>(configuredBridgeHosts, StringComparer.OrdinalIgnoreCase);

        foreach (var sender in senders)
        {
            if (!string.IsNullOrWhiteSpace(sender.HostName) && IsBridgeHost(sender.HostName, configuredBridgeHosts))
            {
                bridgeHosts.Add(sender.HostName);
                continue;
            }

            var hostPrefix = ExtractHostPrefixFromStreamName(sender.Name);
            if (!string.IsNullOrWhiteSpace(hostPrefix) && IsBridgeHost(hostPrefix, configuredBridgeHosts))
            {
                sender.HostName = hostPrefix;
                bridgeHosts.Add(hostPrefix);
                continue;
            }

            foreach (var bridgeHost in bridgeHosts)
            {
                if (TryExtractBridgeUpstreamLabel(bridgeHost, sender.Name, out _))
                {
                    sender.HostName = bridgeHost;
                    break;
                }
            }
        }
    }

    /// <summary>
    /// Merges per-output sender devices on bridge hosts into one hub node per bridge machine.
    /// </summary>
    public static void ConsolidateBridgeHubs(
        Dictionary<string, NDIMultiDevice> senderDevices,
        HashSet<string> configuredBridgeHosts)
    {
        var bridgeHosts = senderDevices.Values
            .Select(d => d.HostName)
            .Where(h => IsBridgeHost(h, configuredBridgeHosts))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        foreach (var bridgeHost in bridgeHosts)
        {
            var bridgeDeviceKeys = senderDevices
                .Where(kvp => string.Equals(kvp.Value.HostName, bridgeHost, StringComparison.OrdinalIgnoreCase))
                .Select(kvp => kvp.Key)
                .ToList();

            if (bridgeDeviceKeys.Count == 0)
                continue;

            var hubChannels = new List<NDIMultiChannel>();
            string? address = null;

            foreach (var key in bridgeDeviceKeys)
            {
                var device = senderDevices[key];
                if (string.IsNullOrWhiteSpace(address) && !string.IsNullOrWhiteSpace(device.Address))
                    address = device.Address;

                foreach (var channel in device.Channels)
                {
                    var upstreamLabel = TryExtractBridgeUpstreamLabel(bridgeHost, channel.StreamLabel, out var label)
                        ? label
                        : channel.StreamLabel;

                    channel.IsBridgeOutput = true;
                    channel.UpstreamLabel = upstreamLabel;
                    channel.UpstreamKey = NormalizeUpstreamKey(upstreamLabel);
                    hubChannels.Add(channel);
                }

                senderDevices.Remove(key);
            }

            if (hubChannels.Count == 0)
                continue;

            hubChannels = hubChannels
                .OrderBy(c => c.UpstreamLabel, StringComparer.OrdinalIgnoreCase)
                .ThenBy(c => c.StreamLabel, StringComparer.OrdinalIgnoreCase)
                .ToList();

            StabilizeBridgeHubChannelIds(hubChannels);

            var hubKey = $"NDI-Bridge:sender:hub@{SanitizeKeyPart(bridgeHost)}";
            senderDevices[hubKey] = new NDIMultiDevice
            {
                DeviceKey = hubKey,
                Role = "sender",
                DisplayName = "NDI Bridge",
                ApplicationId = "NDI-Bridge",
                HostName = bridgeHost,
                Address = address ?? string.Empty,
                Status = hubChannels.Any(c => c.IsStreaming || c.ConnectionCount > 0) ? "Active" : "Idle",
                IsBridgeHub = true,
                Channels = hubChannels,
            };
        }
    }

    public static void ApplyUpstreamPairing(IEnumerable<NDIMultiDevice> senderDevices)
    {
        var bridgeByKey = new Dictionary<string, NDIMultiChannel>(StringComparer.OrdinalIgnoreCase);

        foreach (var device in senderDevices.Where(d => d.IsBridgeHub))
        {
            foreach (var channel in device.Channels)
            {
                if (string.IsNullOrWhiteSpace(channel.UpstreamKey))
                    continue;
                bridgeByKey[channel.UpstreamKey] = channel;
            }
        }

        foreach (var device in senderDevices.Where(d => !d.IsBridgeHub))
        {
            foreach (var channel in device.Channels)
            {
                if (channel.IsBridgeOutput)
                    continue;

                channel.UpstreamKey = NormalizeUpstreamKey(channel.StreamLabel);
                if (bridgeByKey.TryGetValue(channel.UpstreamKey, out var bridgeChannel))
                {
                    channel.HasBridgeMirror = true;
                    channel.BridgeMirrorLabel = bridgeChannel.UpstreamLabel;
                }
            }

            device.HasBridgeMirror = device.Channels.Any(c => c.HasBridgeMirror);
        }
    }

    public static void RebuildSenderChannelMaps(
        IEnumerable<NDIMultiDevice> senderDevices,
        Dictionary<string, NDIMultiChannel> senderChannelsByName,
        Dictionary<string, NDIMultiChannel> senderChannelsByAppChannel)
    {
        senderChannelsByName.Clear();
        senderChannelsByAppChannel.Clear();

        foreach (var device in senderDevices)
        {
            foreach (var channel in device.Channels)
            {
                if (!string.IsNullOrWhiteSpace(channel.StreamLabel))
                    senderChannelsByName[channel.StreamLabel] = channel;

                if (!string.IsNullOrWhiteSpace(channel.EndpointName) &&
                    !senderChannelsByName.ContainsKey(channel.EndpointName))
                {
                    senderChannelsByName[channel.EndpointName] = channel;
                }
            }
        }
    }

    public static bool TryExtractBridgeUpstreamLabel(string bridgeHost, string streamLabel, out string upstreamLabel)
    {
        upstreamLabel = string.Empty;
        if (string.IsNullOrWhiteSpace(streamLabel))
            return false;

        var open = streamLabel.IndexOf('(');
        var close = streamLabel.LastIndexOf(')');
        if (open >= 0 && close > open)
        {
            upstreamLabel = streamLabel.Substring(open + 1, close - open - 1).Trim();
            return !string.IsNullOrWhiteSpace(upstreamLabel);
        }

        if (streamLabel.StartsWith(bridgeHost, StringComparison.OrdinalIgnoreCase))
        {
            upstreamLabel = streamLabel[bridgeHost.Length..].TrimStart(' ', '-', ':');
            return !string.IsNullOrWhiteSpace(upstreamLabel);
        }

        return false;
    }

    public static string NormalizeUpstreamKey(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        var collapsed = Regex.Replace(value.Trim(), @"\s+", " ");
        return collapsed.ToLowerInvariant();
    }

    /// <summary>
    /// Stable React Flow handle IDs across discovery cycles (UUID vs legacy finder IDs).
    /// </summary>
    public static void StabilizeBridgeHubChannelIds(IList<NDIMultiChannel> channels)
    {
        foreach (var channel in channels)
        {
            var keySource = !string.IsNullOrWhiteSpace(channel.UpstreamKey)
                ? channel.UpstreamKey
                : NormalizeUpstreamKey(channel.StreamLabel);
            if (string.IsNullOrWhiteSpace(keySource))
                continue;

            var hash = System.Security.Cryptography.SHA256.HashData(
                System.Text.Encoding.UTF8.GetBytes(keySource));
            var stableId = "bridge:" + Convert.ToHexString(hash)[..16];
            channel.ChannelId = stableId;
            channel.EndpointUuid = stableId;
        }
    }

    private static string SanitizeKeyPart(string value) =>
        Regex.Replace(value.Trim(), @"[^A-Za-z0-9_.-]+", "-");

    private static string ExtractHostPrefixFromStreamName(string? streamLabel)
    {
        if (string.IsNullOrWhiteSpace(streamLabel))
            return string.Empty;

        var raw = streamLabel.Trim();
        var open = raw.IndexOf('(');
        if (open > 0)
            return raw[..open].Trim();

        var bracket = raw.IndexOf('[');
        if (bracket > 0)
            return raw[..bracket].Trim();

        return raw;
    }
}
