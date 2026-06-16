/**
 * Host key for grouping devices by machine (e.g. all apps on VECTAR-PLUS).
 */
export function getHostKey(device) {
  const host = (device?.hostName || '').trim();
  if (host && host.toLowerCase() !== 'unknown') return host;
  const app = (device?.applicationId || '').trim();
  if (app && app.toLowerCase() !== 'unknown') return app;
  const addr = (device?.address || '').trim();
  if (addr) return addr;
  return (device?.displayName || device?.deviceKey || 'unknown').trim();
}

export function getHostLabel(device) {
  return getHostKey(device);
}

function countStreaming(channels) {
  if (!Array.isArray(channels)) return 0;
  return channels.filter((c) => c.isStreaming).length;
}

function countConnected(channels) {
  if (!Array.isArray(channels)) return 0;
  return channels.filter((c) => c.isConnected).length;
}

export function deviceHasActivity(device) {
  const ch = device?.channels || [];
  return countStreaming(ch) > 0 || countConnected(ch) > 0;
}

/**
 * @param {{ senders: object[], receivers: object[], connections: object[] }} snapshot
 * @returns {Array<{ key: string, label: string, address: string, senders: object[], receivers: object[], senderChannels: number, receiverChannels: number, streamingSenders: number, streamingReceivers: number, connectionCount: number }>}
 */
export function buildHostGroups(snapshot) {
  const hosts = new Map();

  const ensure = (key, label, address) => {
    if (!hosts.has(key)) {
      hosts.set(key, {
        key,
        label,
        address: address || '',
        senders: [],
        receivers: [],
        senderChannels: 0,
        receiverChannels: 0,
        streamingSenders: 0,
        streamingReceivers: 0,
        connectionCount: 0,
      });
    }
    return hosts.get(key);
  };

  (snapshot.senders || []).forEach((device) => {
    const key = getHostKey(device);
    const group = ensure(key, getHostLabel(device), device.address);
    group.senders.push(device);
    group.senderChannels += device.channels?.length || 0;
    group.streamingSenders += countStreaming(device.channels);
  });

  (snapshot.receivers || []).forEach((device) => {
    const key = getHostKey(device);
    const group = ensure(key, getHostLabel(device), device.address);
    group.receivers.push(device);
    group.receiverChannels += device.channels?.length || 0;
    group.streamingReceivers += countStreaming(device.channels);
  });

  const connByHost = new Map();
  (snapshot.connections || []).forEach((conn) => {
    const sender = snapshot.senders?.find((d) => d.deviceKey === conn.senderDeviceKey);
    const receiver = snapshot.receivers?.find((d) => d.deviceKey === conn.receiverDeviceKey);
    const keys = new Set();
    if (sender) keys.add(getHostKey(sender));
    if (receiver) keys.add(getHostKey(receiver));
    keys.forEach((k) => {
      connByHost.set(k, (connByHost.get(k) || 0) + 1);
    });
  });

  connByHost.forEach((count, key) => {
    if (hosts.has(key)) hosts.get(key).connectionCount = count;
  });

  return [...hosts.values()].sort((a, b) => {
    const actA = a.streamingSenders + a.streamingReceivers + a.connectionCount;
    const actB = b.streamingSenders + b.streamingReceivers + b.connectionCount;
    if (actB !== actA) return actB - actA;
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });
}

export function filterDevicesByHost(devices, hostKey) {
  if (!hostKey) return devices;
  return devices.filter((d) => getHostKey(d) === hostKey);
}

export const LARGE_NETWORK_DEVICE_THRESHOLD = 10;
export const COLLAPSE_CHANNELS_THRESHOLD = 6;
export const MAX_VISIBLE_HANDLES_WHEN_COLLAPSED = 4;
