import {
  COLLAPSE_CHANNELS_THRESHOLD,
  MAX_VISIBLE_HANDLES_WHEN_COLLAPSED,
  getHostKey,
} from './deviceGrouping';

const DEFAULT_SENDER_X = 80;
const DEFAULT_RECEIVER_X = 960;
const DEFAULT_NODE_Y_START = 120;
const HOST_BAND_PADDING = 56;
const MIN_SENDER_RECEIVER_GAP = 88;
const NODE_MIN_WIDTH = 280;
const NODE_COMPACT_WIDTH = 280;
const NODE_DETAIL_WIDTH = 320;
const NODE_RECEIVER_DETAIL_WIDTH = 360;
const NODE_VERTICAL_PADDING = 52;
const NODE_HEADER_HEIGHT = 300;
const CHANNEL_ROW_HEIGHT = 40;
const BRIDGE_CHANNEL_ROW_HEIGHT = 46;
const COLLAPSED_EXTRA_HEIGHT = 48;
const STATS_SECTIONS_HEIGHT = 110;
const COLLAPSE_BUTTON_HEIGHT = 40;
const BRIDGE_HUB_EXTRA_HEIGHT = 88;
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
    // Header + "HOST (Stream)" title + Address row.
    const cardBody = 118;
    return Math.max(cardBody, 120);
  }

  const isBridgeHub = device?.isBridgeHub === true;
  const isCollapsed = isBridgeHub
    ? (channelCount > 1 && !expandedDeviceKeys.has(nodeId))
    : channelCount > COLLAPSE_CHANNELS_THRESHOLD && !expandedDeviceKeys.has(nodeId);
  const visibleRows = isCollapsed
    ? Math.min(MAX_VISIBLE_HANDLES_WHEN_COLLAPSED, channelCount)
    : channelCount;
  const rowHeight = isBridgeHub ? BRIDGE_CHANNEL_ROW_HEIGHT : CHANNEL_ROW_HEIGHT;

  let height = NODE_HEADER_HEIGHT + visibleRows * rowHeight;
  if (isBridgeHub) {
    height += BRIDGE_HUB_EXTRA_HEIGHT;
  } else {
    height += STATS_SECTIONS_HEIGHT;
  }
  if (isCollapsed && (isBridgeHub ? channelCount > 1 : channelCount > COLLAPSE_CHANNELS_THRESHOLD)) {
    height += COLLAPSED_EXTRA_HEIGHT;
  } else if (!isBridgeHub && channelCount > COLLAPSE_CHANNELS_THRESHOLD) {
    height += COLLAPSE_BUTTON_HEIGHT;
  }

  return Math.max(height, compactView ? 120 : MEASURED_HEIGHT_FALLBACK / 2);
}

function getNodeHeight(node, device, expandedDeviceKeys, rolePrefix, compactDeviceKeys = new Set()) {
  const nodeId = device?.deviceKey
    ? `${rolePrefix}-device-${device.deviceKey}`
    : node?.id;
  const compactView = node?.data?.compactView === true
    || (nodeId ? compactDeviceKeys.has(nodeId) : false);
  const estimated = device
    ? estimateAggregatedNodeHeight(device, expandedDeviceKeys, rolePrefix, compactView)
    : (compactView ? 140 : MEASURED_HEIGHT_FALLBACK);

  const measured = node?.measured?.height ?? node?.height;
  if (Number.isFinite(measured) && measured > 0) {
    return Math.max(measured, estimated);
  }
  return estimated;
}

export function estimateAggregatedNodeWidth(device, rolePrefix = 'sender', compactView = false) {
  if (compactView) return NODE_COMPACT_WIDTH;
  if (rolePrefix === 'receiver') return NODE_RECEIVER_DETAIL_WIDTH;
  const channelCount = device?.channels?.length || 0;
  if (device?.isBridgeHub && channelCount > 1) return 340;
  if (channelCount > COLLAPSE_CHANNELS_THRESHOLD) return 340;
  return NODE_DETAIL_WIDTH;
}

/** Group devices on the same machine by IP; fall back to sidebar host key. */
export function layoutHostKey(device) {
  const addr = (device?.address || '').trim();
  if (addr) return addr;
  return getHostKey(device);
}

export function collectLayoutHostKeys(senders, receivers) {
  const keys = new Set();
  senders.forEach((device) => keys.add(layoutHostKey(device)));
  receivers.forEach((device) => keys.add(layoutHostKey(device)));
  return [...keys].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** Merge React Flow measurements with DOM bounds when available. */
export function enrichNodesWithDomMeasurements(nodes) {
  if (typeof document === 'undefined') return nodes;

  return nodes.map((node) => {
    const el = document.querySelector(`.react-flow__node[data-id="${node.id}"]`);
    if (!el) return node;

    const rect = el.getBoundingClientRect();
    const width = Math.ceil(rect.width);
    const height = Math.ceil(rect.height);
    if (width <= 0 || height <= 0) return node;

    return {
      ...node,
      measured: {
        width: Math.max(node.measured?.width ?? 0, width),
        height: Math.max(node.measured?.height ?? 0, height),
      },
    };
  });
}

function getNodeWidth(node, device, rolePrefix, compactDeviceKeys = new Set()) {
  const nodeId = device?.deviceKey
    ? `${rolePrefix}-device-${device.deviceKey}`
    : node?.id;
  const compactView = node?.data?.compactView === true
    || (nodeId ? compactDeviceKeys.has(nodeId) : false);
  const estimated = device
    ? estimateAggregatedNodeWidth(device, rolePrefix, compactView)
    : NODE_MIN_WIDTH;

  const measured = node?.measured?.width ?? node?.width;
  if (Number.isFinite(measured) && measured > 0) {
    return Math.max(measured, estimated, NODE_MIN_WIDTH);
  }
  return Math.max(estimated, NODE_MIN_WIDTH);
}

function maxColumnWidth(devices, rolePrefix, nodeById, compactDeviceKeys) {
  if (!devices.length) return 0;
  return devices.reduce((max, device) => {
    const nodeId = `${rolePrefix}-device-${device.deviceKey}`;
    const node = nodeById?.get(nodeId);
    return Math.max(max, getNodeWidth(node, device, rolePrefix, compactDeviceKeys));
  }, NODE_MIN_WIDTH);
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

function sortHostDevices(devices) {
  return [...devices].sort((a, b) => {
    const bridgeDelta = Number(a?.isBridgeHub === true) - Number(b?.isBridgeHub === true);
    if (bridgeDelta !== 0) return bridgeDelta;
    const legacyDelta = Number(a?.isLegacyDiscovery === true) - Number(b?.isLegacyDiscovery === true);
    if (legacyDelta !== 0) return legacyDelta;
    return (a?.displayName || a?.deviceKey || '').localeCompare(
      b?.displayName || b?.deviceKey || '',
      undefined,
      { sensitivity: 'base' },
    );
  });
}

function buildHeightResolver(
  nodeById,
  expandedDeviceKeys,
  compactDeviceKeys,
  rolePrefix,
) {
  return (nodeId, device) => {
    if (nodeById) {
      const node = nodeById.get(nodeId);
      return getNodeHeight(node, device, expandedDeviceKeys, rolePrefix, compactDeviceKeys);
    }
    return estimateAggregatedNodeHeight(
      device,
      expandedDeviceKeys,
      rolePrefix,
      compactDeviceKeys.has(nodeId),
    );
  };
}

export function computeLayoutFromMeasuredNodes(
  nodes,
  senders,
  receivers,
  expandedDeviceKeys = new Set(),
  compactDeviceKeys = new Set(),
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const positions = {};

  let senderY = DEFAULT_NODE_Y_START;
  senders.forEach((device) => {
    const nodeId = `sender-device-${device.deviceKey}`;
    const node = nodeById.get(nodeId);
    const height = getNodeHeight(node, device, expandedDeviceKeys, 'sender', compactDeviceKeys);
    positions[nodeId] = { x: DEFAULT_SENDER_X, y: senderY };
    senderY += height + NODE_VERTICAL_PADDING;
  });

  let receiverY = DEFAULT_NODE_Y_START;
  receivers.forEach((device) => {
    const nodeId = `receiver-device-${device.deviceKey}`;
    const node = nodeById.get(nodeId);
    const height = getNodeHeight(node, device, expandedDeviceKeys, 'receiver', compactDeviceKeys);
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
  nodes = null,
  hostKeys = null,
) {
  const positions = {};
  const hostList = Array.isArray(hostKeys) && hostKeys.length > 0
    ? hostKeys
    : collectLayoutHostKeys(senders, receivers);
  const nodeById = Array.isArray(nodes) && nodes.length > 0
    ? new Map(nodes.map((node) => [node.id, node]))
    : null;

  let bandX = DEFAULT_SENDER_X;

  hostList.forEach((host) => {
    const hostSenders = sortHostDevices(senders.filter((d) => layoutHostKey(d) === host));
    const hostReceivers = sortHostDevices(receivers.filter((d) => layoutHostKey(d) === host));
    const senderColumnWidth = maxColumnWidth(hostSenders, 'sender', nodeById, compactDeviceKeys);
    const receiverColumnWidth = maxColumnWidth(hostReceivers, 'receiver', nodeById, compactDeviceKeys);
    const senderHeight = buildHeightResolver(nodeById, expandedDeviceKeys, compactDeviceKeys, 'sender');
    const receiverHeight = buildHeightResolver(nodeById, expandedDeviceKeys, compactDeviceKeys, 'receiver');

    const hasSenders = hostSenders.length > 0;
    const hasReceivers = hostReceivers.length > 0;
    const senderX = bandX;
    const receiverX = hasSenders && hasReceivers
      ? bandX + senderColumnWidth + MIN_SENDER_RECEIVER_GAP
      : bandX;

    if (hasSenders) {
      Object.assign(
        positions,
        stackDevicesWithHeights(hostSenders, 'sender', senderX, senderHeight),
      );
    }
    if (hasReceivers) {
      Object.assign(
        positions,
        stackDevicesWithHeights(hostReceivers, 'receiver', receiverX, receiverHeight),
      );
    }

    const bandWidth = hasSenders && hasReceivers
      ? senderColumnWidth + MIN_SENDER_RECEIVER_GAP + receiverColumnWidth
      : Math.max(hasSenders ? senderColumnWidth : 0, hasReceivers ? receiverColumnWidth : 0);

    bandX += bandWidth + HOST_BAND_PADDING;
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
  const merged = {};
  Object.entries(existingPositions || {}).forEach(([id, position]) => {
    if (isValidSavedPosition(position)) merged[id] = position;
  });

  // New devices go below the lowest already-placed device of the same role, instead of the
  // default slots from the top (which are usually occupied and caused overlapping cards).
  // Saved slots of devices currently offline count as occupied too, so they do not collide when they return.
  const placeNew = (devices, rolePrefix, x) => {
    const prefix = `${rolePrefix}-device-`;
    const deviceById = new Map(devices.map((d) => [`${prefix}${d.deviceKey}`, d]));
    let nextY = DEFAULT_NODE_Y_START;
    Object.entries(merged).forEach(([nodeId, pos]) => {
      if (!nodeId.startsWith(prefix)) return;
      const device = deviceById.get(nodeId);
      const height = device
        ? estimateAggregatedNodeHeight(device, expandedDeviceKeys, rolePrefix, compactDeviceKeys.has(nodeId))
        : MEASURED_HEIGHT_FALLBACK;
      nextY = Math.max(nextY, pos.y + height + NODE_VERTICAL_PADDING);
    });
    devices.forEach((device) => {
      const nodeId = `${rolePrefix}-device-${device.deviceKey}`;
      if (merged[nodeId]) return;
      merged[nodeId] = { x, y: nextY };
      const compact = compactDeviceKeys.has(nodeId);
      nextY += estimateAggregatedNodeHeight(device, expandedDeviceKeys, rolePrefix, compact) + NODE_VERTICAL_PADDING;
    });
  };

  placeNew(senders, 'sender', DEFAULT_SENDER_X);
  placeNew(receivers, 'receiver', DEFAULT_RECEIVER_X);

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
