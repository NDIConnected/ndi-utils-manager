import { COLLAPSE_CHANNELS_THRESHOLD, MAX_VISIBLE_HANDLES_WHEN_COLLAPSED } from './deviceGrouping';
import { isConnectionConfirmed } from './flowFilters';

// Same value as MarkerType.ArrowClosed in @xyflow/react (kept literal so this module stays framework-free).
const MARKER_ARROW_CLOSED = 'arrowclosed';
const EDGE_COLOR_CONFIRMED = '#4ade80';
const EDGE_COLOR_PENDING = '#facc15';

export const senderNodeId = (deviceKey) => `sender-device-${deviceKey}`;
export const receiverNodeId = (deviceKey) => `receiver-device-${deviceKey}`;

export function samePosition(a, b) {
  return !!a && !!b && a.x === b.x && a.y === b.y;
}

/**
 * Merges freshly built nodes into React Flow's current nodes.
 * - Keeps the previous graph only while the raw snapshot is empty (backend restart), never for empty filter results.
 * - Reuses unchanged node objects (identity) and keeps `measured`/handle bounds for changed ones.
 */
export function mergeNodes(prevNodes, nextNodes, draggingNodeIds, snapshotIsEmpty) {
  if (snapshotIsEmpty && nextNodes.length === 0 && prevNodes.length > 0) {
    return prevNodes;
  }
  const prevMap = new Map(prevNodes.map((n) => [n.id, n]));
  return nextNodes.map((node) => {
    const prev = prevMap.get(node.id);
    if (!prev) return { ...node, selected: false };
    const keepDragPosition = prev.position && draggingNodeIds.has(node.id);
    const position = keepDragPosition ? prev.position : node.position;
    if (prev.data === node.data && samePosition(prev.position, position)) return prev;
    return { ...prev, ...node, position, selected: prev.selected ?? false };
  });
}

/** Same rules as {@link mergeNodes}; edges are cached per content, so equal data means an identical edge. */
export function mergeEdges(prevEdges, nextEdges, snapshotIsEmpty) {
  if (snapshotIsEmpty && nextEdges.length === 0 && prevEdges.length > 0) {
    return prevEdges;
  }
  const prevMap = new Map(prevEdges.map((e) => [e.id, e]));
  return nextEdges.map((edge) => {
    const prev = prevMap.get(edge.id);
    if (prev && prev.data === edge.data) return prev;
    return { ...edge, selected: prev?.selected ?? false };
  });
}

/** Data-only update (structure unchanged): keep node objects, refresh data/position where they changed. */
export function refreshNodes(prevNodes, nextNodes, draggingNodeIds, resolvePosition) {
  if (prevNodes.length === 0 && nextNodes.length > 0) return nextNodes;
  const nextById = new Map(nextNodes.map((n) => [n.id, n]));
  return prevNodes.map((node) => {
    const fresh = nextById.get(node.id);
    if (!fresh) return node;
    const keepDragPosition = node.position && draggingNodeIds.has(node.id);
    const position = keepDragPosition ? node.position : resolvePosition(node.id);
    if (node.data === fresh.data && samePosition(node.position, position)) return node;
    return { ...node, data: fresh.data, position };
  });
}

/** Changes whenever the set of nodes, handles or edges changes (vs. data-only updates). */
export function buildCanvasStructureKey({
  filteredSenders,
  filteredReceivers,
  visibleConnections,
  selectedHostKeys,
  senderFilter,
  receiverFilter,
  showActiveOnly,
  expandedDeviceKeys,
  compactDeviceKeys,
  minimizedDeviceKeys = new Set(),
}) {
  const senderPart = filteredSenders
    .map((d) => `${d.deviceKey}:${d.isBridgeHub ? 'hub' : 'dev'}:${(d.channels || []).map((c) => c.channelId).join(',')}`)
    .join('|');
  const receiverPart = filteredReceivers
    .map((d) => `${d.deviceKey}:${(d.channels || []).map((c) => c.channelId).join(',')}`)
    .join('|');
  const connPart = visibleConnections
    .map((c) => `${c.connectionId}:${c.senderChannelId}:${c.receiverChannelId}`)
    .join('|');
  const hostPart = [...selectedHostKeys].sort().join(',');
  const expandPart = [...expandedDeviceKeys].sort().join(',');
  const compactPart = [...compactDeviceKeys].sort().join(',');
  const miniPart = [...minimizedDeviceKeys].sort().join(',');
  return `${senderPart}::${receiverPart}::${connPart}::${hostPart}::${senderFilter}::${receiverFilter}::${showActiveOnly}::${expandPart}::${compactPart}::${miniPart}`;
}

/** Receiver UUIDs whose optimistic connection now appears in the backend snapshot. */
export function confirmedOptimisticReceivers(snapshotConnections, optimisticByReceiver) {
  const inSnapshot = new Set(snapshotConnections.map((c) => c.receiverUuid?.toLowerCase()).filter(Boolean));
  return [...optimisticByReceiver.keys()].filter((uuid) => inSnapshot.has(uuid.toLowerCase()));
}

/** Backend connections plus optimistic ones for receivers the backend does not report yet. */
export function mergeConnections(snapshotConnections, optimisticConnections) {
  const merged = [...snapshotConnections];
  for (const conn of optimisticConnections) {
    const exists = merged.some((c) => c.receiverUuid?.toLowerCase() === conn.receiverUuid?.toLowerCase());
    if (!exists) merged.push(conn);
  }
  return merged;
}

export function isDeviceCollapsed(device, nodeId, expandedDeviceKeys) {
  const channelCount = device.channels?.length || 0;
  return device.isBridgeHub
    ? (channelCount > 1 ? !expandedDeviceKeys.has(nodeId) : false)
    : channelCount > COLLAPSE_CHANNELS_THRESHOLD && !expandedDeviceKeys.has(nodeId);
}

function channelOrder(channelId) {
  return Number(channelId?.replace(/[^\d]/g, '')) || 0;
}

/**
 * Builds React Flow nodes and edges for the visible devices. Pure apart from the two caches it maintains:
 * a device/edge whose content is unchanged gets back the same object, so memoized components skip work.
 *
 * @returns {{ nodes: object[], edges: object[], visibleConnections: object[] }}
 */
export function buildFlowGraph({
  snapshot,
  filteredSenders,
  filteredReceivers,
  optimisticConnections = [],
  isReceiverSuppressed = () => false,
  expandedDeviceKeys = new Set(),
  compactDeviceKeys = new Set(),
  minimizedDeviceKeys = new Set(),
  resolvePosition,
  nodeDataCache = new Map(),
  edgeCache = new Map(),
  createNodeCallbacks = () => ({}),
  createEdgeFocus = () => undefined,
}) {
  const senderByDeviceKey = new Map(filteredSenders.map((d) => [d.deviceKey, d]));
  const receiverByDeviceKey = new Map(filteredReceivers.map((d) => [d.deviceKey, d]));
  const mergedConnections = mergeConnections(snapshot.connections, optimisticConnections);

  // Channels with a route (any route, even to a filtered-out device) keep their handle visible.
  const connectedByDeviceKey = new Map();
  const addConnected = (deviceKey, channelId) => {
    if (!deviceKey || !channelId) return;
    if (!connectedByDeviceKey.has(deviceKey)) connectedByDeviceKey.set(deviceKey, new Set());
    connectedByDeviceKey.get(deviceKey).add(channelId);
  };
  mergedConnections.forEach((conn) => {
    addConnected(conn.senderDeviceKey, conn.senderChannelId);
    addConnected(conn.receiverDeviceKey, conn.receiverChannelId);
  });

  const visibleConnections = mergedConnections.filter((conn) =>
    senderByDeviceKey.has(conn.senderDeviceKey)
    && receiverByDeviceKey.has(conn.receiverDeviceKey)
    && !isReceiverSuppressed(conn.receiverUuid));

  const logicalConnectionsByDeviceKey = new Map();
  visibleConnections.forEach((conn) => {
    for (const key of [conn.senderDeviceKey, conn.receiverDeviceKey]) {
      logicalConnectionsByDeviceKey.set(key, (logicalConnectionsByDeviceKey.get(key) || 0) + 1);
    }
  });

  // ---- nodes
  const liveNodeIds = new Set();
  const buildNodeData = (device, role) => {
    const nodeId = role === 'sender' ? senderNodeId(device.deviceKey) : receiverNodeId(device.deviceKey);
    const isCollapsed = isDeviceCollapsed(device, nodeId, expandedDeviceKeys);
    const connectedIds = connectedByDeviceKey.get(device.deviceKey) || new Set();
    const logicalCount = logicalConnectionsByDeviceKey.get(device.deviceKey) || 0;
    const compactView = compactDeviceKeys.has(nodeId);
    const minimized = minimizedDeviceKeys.has(nodeId);
    const cacheKey = JSON.stringify([device, isCollapsed, compactView, minimized, logicalCount, [...connectedIds].sort()]);
    liveNodeIds.add(nodeId);

    const cached = nodeDataCache.get(nodeId);
    if (cached && cached.key === cacheKey) return cached.data;

    const data = {
      ...device,
      isAggregated: true,
      isCollapsed,
      maxVisibleHandles: MAX_VISIBLE_HANDLES_WHEN_COLLAPSED,
      connectedChannelIds: connectedIds,
      logicalConnectionCount: logicalCount,
      compactView,
      minimized,
      ...createNodeCallbacks({ nodeId, device, role }),
    };
    nodeDataCache.set(nodeId, { key: cacheKey, data });
    return data;
  };

  const toNode = (device, role) => {
    const id = role === 'sender' ? senderNodeId(device.deviceKey) : receiverNodeId(device.deviceKey);
    return {
      id,
      type: role === 'sender' ? 'senderNode' : 'receiverNode',
      dragHandle: '.node-drag-handle',
      deletable: false,
      position: resolvePosition(id),
      data: buildNodeData(device, role),
    };
  };

  const nodes = [
    ...filteredSenders.map((d) => toNode(d, 'sender')),
    ...filteredReceivers.map((d) => toNode(d, 'receiver')),
  ];
  nodeDataCache.forEach((_, id) => {
    if (!liveNodeIds.has(id)) nodeDataCache.delete(id);
  });

  // ---- edges: one lane per connection between the same pair of devices
  const groupedConnections = new Map();
  visibleConnections.forEach((conn) => {
    const pairKey = `${conn.senderDeviceKey}->${conn.receiverDeviceKey}`;
    if (!groupedConnections.has(pairKey)) groupedConnections.set(pairKey, []);
    groupedConnections.get(pairKey).push(conn);
  });

  const edges = [];
  const liveEdgeIds = new Set();
  groupedConnections.forEach((connections) => {
    const ordered = [...connections].sort((a, b) => channelOrder(a.senderChannelId) - channelOrder(b.senderChannelId));
    ordered.forEach((conn, laneIndex) => {
      const confirmed = isConnectionConfirmed(conn, snapshot);
      const color = confirmed ? EDGE_COLOR_CONFIRMED : EDGE_COLOR_PENDING;
      const sourceNodeId = senderNodeId(conn.senderDeviceKey);
      const targetNodeId = receiverNodeId(conn.receiverDeviceKey);
      const edgeId = `edge-${conn.connectionId}`;
      const edgeKey = JSON.stringify([conn, laneIndex, ordered.length, confirmed]);
      liveEdgeIds.add(edgeId);

      const cached = edgeCache.get(edgeId);
      if (cached && cached.key === edgeKey) {
        edges.push(cached.edge);
        return;
      }

      const edge = {
        id: edgeId,
        type: 'custom',
        source: sourceNodeId,
        target: targetNodeId,
        sourceHandle: `out-${conn.senderChannelId}`,
        targetHandle: `in-${conn.receiverChannelId}`,
        animated: confirmed,
        deletable: true,
        selectable: true,
        reconnectable: true,
        style: { stroke: color, strokeWidth: 1.5 },
        markerEnd: { type: MARKER_ARROW_CLOSED, color, width: 12, height: 12 },
        data: {
          senderLabel: conn.senderLabel,
          receiverLabel: conn.receiverLabel,
          sourceName: conn.sourceName,
          receiverUuid: conn.receiverUuid,
          edgeLaneIndex: laneIndex,
          edgeLaneCount: ordered.length,
          confirmed,
          sourceNodeId,
          targetNodeId,
          onFocus: createEdgeFocus(sourceNodeId, targetNodeId),
        },
      };
      edgeCache.set(edgeId, { key: edgeKey, edge });
      edges.push(edge);
    });
  });
  edgeCache.forEach((_, id) => {
    if (!liveEdgeIds.has(id)) edgeCache.delete(id);
  });

  return { nodes, edges, visibleConnections };
}
