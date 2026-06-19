import {
  COLLAPSE_CHANNELS_THRESHOLD,
  MAX_VISIBLE_HANDLES_WHEN_COLLAPSED,
} from './deviceGrouping';

const DEFAULT_SENDER_X = 80;
const DEFAULT_RECEIVER_X = 940;
const DEFAULT_NODE_Y_START = 120;
const HOST_COLUMN_GAP = 420;
const NODE_VERTICAL_PADDING = 48;
const NODE_HEADER_HEIGHT = 300;
const CHANNEL_ROW_HEIGHT = 40;
const COLLAPSED_EXTRA_HEIGHT = 48;
const STATS_SECTIONS_HEIGHT = 110;
const COLLAPSE_BUTTON_HEIGHT = 40;
const MEASURED_HEIGHT_FALLBACK = 420;

export function estimateAggregatedNodeHeight(
  device,
  expandedDeviceKeys = new Set(),
  rolePrefix = 'sender',
  compactView = false,
) {
  const nodeId = `${rolePrefix}-device-${device.deviceKey}`;
  const channelCount = device?.channels?.length || 0;
  if (channelCount === 0) return compactView ? 120 : 220;

  if (compactView) {
    const cardBody = 118 + (device?.applicationId === 'unknown' ? 14 : 0);
    return Math.max(cardBody, 120);
  }

  const isBridgeHub = device?.isBridgeHub === true;
  const isCollapsed = isBridgeHub
    ? (channelCount > 1 && !expandedDeviceKeys.has(nodeId))
    : channelCount > COLLAPSE_CHANNELS_THRESHOLD && !expandedDeviceKeys.has(nodeId);
  const visibleRows = isCollapsed
    ? Math.min(MAX_VISIBLE_HANDLES_WHEN_COLLAPSED, channelCount)
    : channelCount;

  let height = NODE_HEADER_HEIGHT + visibleRows * CHANNEL_ROW_HEIGHT;
  if (!isBridgeHub) height += STATS_SECTIONS_HEIGHT;
  if (isCollapsed && (isBridgeHub ? channelCount > 1 : channelCount > COLLAPSE_CHANNELS_THRESHOLD)) {
    height += COLLAPSED_EXTRA_HEIGHT;
  } else if (!isBridgeHub && channelCount > COLLAPSE_CHANNELS_THRESHOLD) {
    height += COLLAPSE_BUTTON_HEIGHT;
  }

  return Math.max(height, MEASURED_HEIGHT_FALLBACK / 2);
}

function getNodeHeight(node, device, expandedDeviceKeys, rolePrefix) {
  const measured = node?.measured?.height ?? node?.height;
  if (Number.isFinite(measured) && measured > 0) return measured;
  const compactView = node?.data?.compactView === true;
  if (device) return estimateAggregatedNodeHeight(device, expandedDeviceKeys, rolePrefix, compactView);
  return compactView ? 140 : MEASURED_HEIGHT_FALLBACK;
}

function stackDevicesWithHeights(devices, rolePrefix, x, getHeight) {
  const positions = {};
  let y = DEFAULT_NODE_Y_START;

  devices.forEach((device) => {
    const nodeId = `${rolePrefix}-device-${device.deviceKey}`;
    positions[nodeId] = { x, y };
    y += getHeight(nodeId, device) + NODE_VERTICAL_PADDING;
  });

  return positions;
}

function stackDevices(devices, rolePrefix, x, expandedDeviceKeys, compactDeviceKeys = new Set()) {
  return stackDevicesWithHeights(
    devices,
    rolePrefix,
    x,
    (nodeId, device) => estimateAggregatedNodeHeight(
      device,
      expandedDeviceKeys,
      rolePrefix,
      compactDeviceKeys.has(nodeId),
    ),
  );
}

export function computeLayoutFromMeasuredNodes(
  nodes,
  senders,
  receivers,
  expandedDeviceKeys = new Set(),
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const positions = {};

  let senderY = DEFAULT_NODE_Y_START;
  senders.forEach((device) => {
    const nodeId = `sender-device-${device.deviceKey}`;
    const node = nodeById.get(nodeId);
    const height = getNodeHeight(node, device, expandedDeviceKeys, 'sender');
    positions[nodeId] = { x: DEFAULT_SENDER_X, y: senderY };
    senderY += height + NODE_VERTICAL_PADDING;
  });

  let receiverY = DEFAULT_NODE_Y_START;
  receivers.forEach((device) => {
    const nodeId = `receiver-device-${device.deviceKey}`;
    const node = nodeById.get(nodeId);
    const height = getNodeHeight(node, device, expandedDeviceKeys, 'receiver');
    positions[nodeId] = { x: DEFAULT_RECEIVER_X, y: receiverY };
    receiverY += height + NODE_VERTICAL_PADDING;
  });

  return positions;
}

export function computeDefaultLayout(
  senders,
  receivers,
  expandedDeviceKeys = new Set(),
  compactDeviceKeys = new Set(),
) {
  return {
    ...stackDevices(senders, 'sender', DEFAULT_SENDER_X, expandedDeviceKeys, compactDeviceKeys),
    ...stackDevices(receivers, 'receiver', DEFAULT_RECEIVER_X, expandedDeviceKeys, compactDeviceKeys),
  };
}

export function computeHostAlignedLayout(
  senders,
  receivers,
  expandedDeviceKeys = new Set(),
  compactDeviceKeys = new Set(),
) {
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

    Object.assign(positions, stackDevices(hostSenders, 'sender', senderX, expandedDeviceKeys, compactDeviceKeys));
    Object.assign(positions, stackDevices(hostReceivers, 'receiver', receiverX, expandedDeviceKeys, compactDeviceKeys));
  });

  return positions;
}

export function isValidSavedPosition(position) {
  if (!position) return false;
  const { x, y } = position;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return !(x === 0 && y === 0);
}

export function mergeLayoutWithNewDevices(
  existingPositions,
  senders,
  receivers,
  expandedDeviceKeys = new Set(),
  compactDeviceKeys = new Set(),
) {
  const layout = computeDefaultLayout(senders, receivers, expandedDeviceKeys, compactDeviceKeys);
  const merged = { ...layout };

  Object.entries(existingPositions || {}).forEach(([id, position]) => {
    if (isValidSavedPosition(position)) merged[id] = position;
  });

  return merged;
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
