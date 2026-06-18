const DEFAULT_SENDER_X = 80;
const DEFAULT_RECEIVER_X = 940;
const DEFAULT_NODE_Y_START = 120;
const DEFAULT_NODE_Y_GAP = 320;
const COMPACT_NODE_Y_GAP = 110;
const HOST_COLUMN_GAP = 420;

export function getNodeGap(deviceCount, density) {
  if (density === 'compact') return COMPACT_NODE_Y_GAP;
  return deviceCount > 24 ? COMPACT_NODE_Y_GAP : DEFAULT_NODE_Y_GAP;
}

export function computeDefaultLayout(senders, receivers, density = 'comfort') {
  const gap = getNodeGap(senders.length + receivers.length, density);
  const positions = {};

  senders.forEach((device, index) => {
    positions[`sender-device-${device.deviceKey}`] = {
      x: DEFAULT_SENDER_X,
      y: DEFAULT_NODE_Y_START + index * gap,
    };
  });

  receivers.forEach((device, index) => {
    positions[`receiver-device-${device.deviceKey}`] = {
      x: DEFAULT_RECEIVER_X,
      y: DEFAULT_NODE_Y_START + index * gap,
    };
  });

  return positions;
}

export function computeHostAlignedLayout(senders, receivers, density = 'comfort') {
  const gap = getNodeGap(senders.length + receivers.length, density);
  const positions = {};
  const hosts = new Set();
  senders.forEach((d) => hosts.add(d.hostName || d.address || 'unknown'));
  receivers.forEach((d) => hosts.add(d.hostName || d.address || 'unknown'));
  const hostList = [...hosts].sort((a, b) => a.localeCompare(b));

  hostList.forEach((host, hostIndex) => {
    const hostSenders = senders.filter((d) => (d.hostName || d.address || 'unknown') === host);
    const hostReceivers = receivers.filter((d) => (d.hostName || d.address || 'unknown') === host);
    const senderX = DEFAULT_SENDER_X + hostIndex * HOST_COLUMN_GAP;
    const receiverX = DEFAULT_RECEIVER_X + hostIndex * HOST_COLUMN_GAP;

    hostSenders.forEach((device, index) => {
      positions[`sender-device-${device.deviceKey}`] = {
        x: senderX,
        y: DEFAULT_NODE_Y_START + index * gap,
      };
    });

    hostReceivers.forEach((device, index) => {
      positions[`receiver-device-${device.deviceKey}`] = {
        x: receiverX,
        y: DEFAULT_NODE_Y_START + index * gap,
      };
    });
  });

  return positions;
}

export function saveHostPreset(hostKey, data) {
  if (!hostKey) return;
  localStorage.setItem(`ndi-host-preset-${hostKey}`, JSON.stringify(data));
}

export function loadHostPreset(hostKey) {
  if (!hostKey) return null;
  try {
    const raw = localStorage.getItem(`ndi-host-preset-${hostKey}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getBundleLabel() {
  const script = document.querySelector('script[type="module"][src*="assets/"]');
  if (!script?.src) return 'dev';
  const parts = script.src.split('/');
  return parts[parts.length - 1] || 'bundle';
}
