import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react';
import axios from 'axios';
import SenderNode from './SenderNode';
import ReceiverNode from './ReceiverNode';
import CustomEdge from './CustomEdge';
import HostOverview from './HostOverview';
import {
  buildHostGroups,
  filterDevicesByHost,
  deviceHasActivity,
  LARGE_NETWORK_DEVICE_THRESHOLD,
  COLLAPSE_CHANNELS_THRESHOLD,
  MAX_VISIBLE_HANDLES_WHEN_COLLAPSED,
} from '../utils/deviceGrouping';

const API_BASE = '/api/ndi';
const HIDE_INTERNAL_CONNECTIONS = false;
const NODE_LAYOUT_VERSION = '4';
const DEFAULT_SENDER_X = 80;
const DEFAULT_RECEIVER_X = 940;
const DEFAULT_NODE_Y_START = 120;
const DEFAULT_NODE_Y_GAP = 320;
const COMPACT_NODE_Y_GAP = 110;

const styles = {
  container: { width: '100vw', height: '100vh', backgroundColor: '#111827' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: '#1f2937',
    borderBottom: '1px solid #374151',
    padding: '16px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: { display: 'flex', flexDirection: 'column' },
  title: { fontSize: '24px', fontWeight: 'bold', color: 'white', margin: 0 },
  subtitle: { fontSize: '14px', color: '#9ca3af', margin: 0 },
  headerRight: { display: 'flex', alignItems: 'center', gap: '16px' },
  filtersRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  filterInput: {
    width: '260px',
    padding: '7px 10px',
    borderRadius: '6px',
    border: '1px solid #4b5563',
    backgroundColor: '#111827',
    color: '#e5e7eb',
    fontSize: '12px',
    outline: 'none',
  },
  stats: { fontSize: '14px', color: '#d1d5db' },
  statHighlight: { fontWeight: '600' },
  senderCount: { color: '#10b981' },
  receiverCount: { color: '#3b82f6' },
  refreshButton: {
    padding: '8px 16px',
    backgroundColor: '#2563eb',
    color: 'white',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
  },
  canvas: { width: '100%', height: '100%', paddingTop: '88px' },
  body: { display: 'flex', width: '100%', height: '100%', paddingTop: '88px' },
  flowPane: { flex: 1, minWidth: 0, height: '100%' },
  toolbar: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  viewBtn: (active) => ({
    padding: '6px 12px',
    fontSize: '12px',
    borderRadius: '6px',
    border: '1px solid #4b5563',
    backgroundColor: active ? '#2563eb' : '#111827',
    color: '#e5e7eb',
    cursor: 'pointer',
  }),
  checkLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: '#d1d5db',
    cursor: 'pointer',
    userSelect: 'none',
  },
};

function mergeNodes(prevNodes, nextNodes) {
  const prevMap = new Map(prevNodes.map((n) => [n.id, n]));
  return nextNodes.map((node) => {
    const prev = prevMap.get(node.id);
    return {
      ...node,
      position: prev?.position ?? node.position,
      selected: prev?.selected ?? false,
    };
  });
}

function mergeEdges(prevEdges, nextEdges) {
  const prevMap = new Map(prevEdges.map((e) => [e.id, e]));
  return nextEdges.map((edge) => ({
    ...edge,
    selected: prevMap.get(edge.id)?.selected ?? false,
  }));
}

function buildDeviceSearchText(device) {
  const channels = Array.isArray(device?.channels) ? device.channels : [];
  const channelTokens = channels.flatMap((c) => [
    c?.streamLabel || '',
    c?.endpointName || '',
    c?.videoCodec || '',
    c?.audioCodec || '',
    c?.address || '',
  ]);

  return [
    device?.applicationId || '',
    device?.displayName || '',
    device?.address || '',
    device?.videoSummary || '',
    device?.audioSummary || '',
    device?.resolutionSummary || '',
    device?.frameRateSummary || '',
    device?.portSummary || '',
    ...channelTokens,
  ].join(' ').toLowerCase();
}

function matchesFilterQuery(searchText, rawQuery) {
  const query = (rawQuery || '').trim().toLowerCase();
  if (!query) return true;

  const matchesTerm = (term) => {
    const t = (term || '').trim();
    if (!t) return true;

    // Wildcards:
    // * => any chars, ? => single char
    if (t.includes('*') || t.includes('?')) {
      const escaped = t
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      const regex = new RegExp(escaped, 'i');
      return regex.test(searchText);
    }

    return searchText.includes(t);
  };

  // Comma = AND groups, pipe = OR terms inside each group.
  const andGroups = query.split(',').map((g) => g.trim()).filter(Boolean);
  if (andGroups.length === 0) return true;

  return andGroups.every((group) => {
    const orTerms = group.split('|').map((t) => t.trim()).filter(Boolean);
    if (orTerms.length === 0) return true;
    return orTerms.some((term) => matchesTerm(term));
  });
}

export default function NDIFlowEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [snapshot, setSnapshot] = useState({ senders: [], receivers: [], connections: [] });
  const [senderFilter, setSenderFilter] = useState('');
  const [receiverFilter, setReceiverFilter] = useState('');
  const [viewMode, setViewMode] = useState('overview');
  const [hostFocus, setHostFocus] = useState(null);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [expandedDeviceKeys, setExpandedDeviceKeys] = useState(() => new Set());
  const viewModeInitialized = useRef(false);
  const edgeReconnectSuccessful = useRef(true);
  const mutationBlockUntilRef = useRef(0);
  const suppressedReceiverUntilRef = useRef(new Map());
  const [nodePositions, setNodePositions] = useState(() => {
    try {
      const savedVersion = localStorage.getItem('ndi-multichannel-layout-version');
      if (savedVersion !== NODE_LAYOUT_VERSION) {
        localStorage.setItem('ndi-multichannel-layout-version', NODE_LAYOUT_VERSION);
        localStorage.removeItem('ndi-multichannel-node-positions');
        return {};
      }
      const saved = localStorage.getItem('ndi-multichannel-node-positions');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const nodeTypes = useMemo(() => ({ senderNode: SenderNode, receiverNode: ReceiverNode }), []);
  const edgeTypes = useMemo(() => ({ custom: CustomEdge }), []);

  const hostGroups = useMemo(
    () => buildHostGroups(snapshot),
    [snapshot],
  );

  const toggleDeviceExpanded = useCallback((nodeId) => {
    setExpandedDeviceKeys((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (viewModeInitialized.current || loading) return;
    const deviceCount = snapshot.senders.length + snapshot.receivers.length;
    if (deviceCount > LARGE_NETWORK_DEVICE_THRESHOLD) {
      setViewMode('overview');
    }
    viewModeInitialized.current = true;
  }, [loading, snapshot.senders.length, snapshot.receivers.length]);

  const fetchDevices = useCallback(async (force = false) => {
    if (!force && Date.now() < mutationBlockUntilRef.current) {
      return;
    }

    try {
      const res = await axios.get(`${API_BASE}/devices`);
      const data = res.data || {};
      setSnapshot({
        senders: Array.isArray(data.senders) ? data.senders : [],
        receivers: Array.isArray(data.receivers) ? data.receivers : [],
        connections: Array.isArray(data.connections) ? data.connections : [],
      });
      setError(null);
    } catch (err) {
      console.error('Error fetching aggregated devices:', err);
      setError('Failed to fetch NDI devices. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  }, []);

  const blockPollingDuringMutation = useCallback((ms = 3500) => {
    const until = Date.now() + ms;
    mutationBlockUntilRef.current = Math.max(mutationBlockUntilRef.current, until);
  }, []);

  const suppressReceiverConnection = useCallback((receiverUuid, ms = 3500) => {
    if (!receiverUuid) return;
    suppressedReceiverUntilRef.current.set(receiverUuid, Date.now() + ms);
  }, []);

  const isReceiverConnectionSuppressed = useCallback((receiverUuid) => {
    if (!receiverUuid) return false;
    const until = suppressedReceiverUntilRef.current.get(receiverUuid);
    if (!until) return false;
    if (Date.now() >= until) {
      suppressedReceiverUntilRef.current.delete(receiverUuid);
      return false;
    }
    return true;
  }, []);

  const resolveConnectionDetails = useCallback((params, currentSnapshot) => {
    const sourceDeviceKey = (params?.source ?? '').replace('sender-device-', '');
    const targetDeviceKey = (params?.target ?? '').replace('receiver-device-', '');
    const sourceChannelId = (params?.sourceHandle ?? '').replace('out-', '');
    const targetChannelId = (params?.targetHandle ?? '').replace('in-', '');
    const sourceDevice = currentSnapshot.senders.find((d) => d.deviceKey === sourceDeviceKey);
    const sourceChannel = sourceDevice?.channels?.find((c) => c.channelId === sourceChannelId);
    const targetDevice = currentSnapshot.receivers.find((d) => d.deviceKey === targetDeviceKey);
    const targetChannel = targetDevice?.channels?.find((c) => c.channelId === targetChannelId);
    const sourceName = sourceChannel?.endpointName || sourceChannel?.streamLabel || '';
    const receiverUuid = targetChannel?.endpointUuid || '';
    return { sourceName, receiverUuid };
  }, []);

  const handleNodesChange = useCallback((changes) => {
    onNodesChange(changes);
    changes.forEach((change) => {
      if (change.type === 'position' && change.position && !change.dragging) {
        setNodePositions((prev) => {
          const updated = { ...prev, [change.id]: change.position };
          localStorage.setItem('ndi-multichannel-node-positions', JSON.stringify(updated));
          return updated;
        });
      }
    });
  }, [onNodesChange]);

  const onConnect = useCallback(async (params) => {
    const { sourceName, receiverUuid } = resolveConnectionDetails(params, snapshot);

    if (!receiverUuid || !sourceName) {
      return;
    }

    blockPollingDuringMutation();
    try {
      const response = await axios.post(`${API_BASE}/connect`, {
        receiverUuid,
        sourceName,
      });

      if (!response?.data?.success) {
        alert(`Connect failed: ${response?.data?.message ?? 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error connecting channel:', err);
      alert('Failed to connect channel');
    } finally {
      setTimeout(() => fetchDevices(true), 600);
    }
  }, [snapshot, fetchDevices, blockPollingDuringMutation, resolveConnectionDetails]);

  const onEdgesDelete = useCallback(async (edgesToDelete) => {
    blockPollingDuringMutation();
    for (const edge of edgesToDelete) {
      const receiverUuid = edge?.data?.receiverUuid;
      if (!receiverUuid) continue;
      suppressReceiverConnection(receiverUuid);

      try {
        const response = await axios.post(`${API_BASE}/disconnect`, { receiverUuid });
        if (!response.data?.success) {
          alert(`Disconnect failed: ${response.data?.message ?? 'Unknown error'}`);
        }
      } catch (err) {
        console.error('Error disconnecting channel:', err);
        alert('Failed to disconnect channel');
      }
    }
    setTimeout(() => fetchDevices(true), 800);
    setTimeout(() => fetchDevices(true), 1800);
  }, [fetchDevices, blockPollingDuringMutation, suppressReceiverConnection]);

  const disconnectEdgeByReceiver = useCallback(async (edge) => {
    const receiverUuid = edge?.data?.receiverUuid;
    if (!receiverUuid) return;

    blockPollingDuringMutation();
    suppressReceiverConnection(receiverUuid);
    try {
      const response = await axios.post(`${API_BASE}/disconnect`, { receiverUuid });
      if (!response.data?.success) {
        alert(`Disconnect failed: ${response.data?.message ?? 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error disconnecting channel:', err);
      alert('Failed to disconnect channel');
    } finally {
      setTimeout(() => fetchDevices(true), 800);
      setTimeout(() => fetchDevices(true), 1800);
    }
  }, [fetchDevices, blockPollingDuringMutation, suppressReceiverConnection]);

  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  const onReconnect = useCallback(async (_oldEdge, newConnection) => {
    edgeReconnectSuccessful.current = true;
    const oldReceiverUuid = _oldEdge?.data?.receiverUuid || '';
    const { sourceName, receiverUuid: newReceiverUuid } = resolveConnectionDetails(newConnection, snapshot);
    if (!newReceiverUuid || !sourceName) {
      return;
    }

    blockPollingDuringMutation();
    if (oldReceiverUuid && oldReceiverUuid !== newReceiverUuid) {
      suppressReceiverConnection(oldReceiverUuid);
    }
    suppressReceiverConnection(newReceiverUuid, 2000);

    try {
      if (oldReceiverUuid && oldReceiverUuid !== newReceiverUuid) {
        await axios.post(`${API_BASE}/disconnect`, { receiverUuid: oldReceiverUuid });
      }

      const connectResponse = await axios.post(`${API_BASE}/connect`, { receiverUuid: newReceiverUuid, sourceName });
      if (!connectResponse?.data?.success) {
        alert(`Reconnect failed: ${connectResponse?.data?.message ?? 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error reconnecting channel:', err);
      alert('Failed to reconnect channel');
    } finally {
      setTimeout(() => fetchDevices(true), 800);
      setTimeout(() => fetchDevices(true), 1800);
    }
  }, [snapshot, fetchDevices, blockPollingDuringMutation, resolveConnectionDetails, suppressReceiverConnection]);

  const onReconnectEnd = useCallback(async (_event, edge) => {
    if (edgeReconnectSuccessful.current) return;
    await disconnectEdgeByReceiver(edge);
  }, [disconnectEdgeByReceiver]);

  useEffect(() => {
    let filteredSenders = snapshot.senders.filter((device) =>
      matchesFilterQuery(buildDeviceSearchText(device), senderFilter));
    let filteredReceivers = snapshot.receivers.filter((device) =>
      matchesFilterQuery(buildDeviceSearchText(device), receiverFilter));

    filteredSenders = filterDevicesByHost(filteredSenders, hostFocus);
    filteredReceivers = filterDevicesByHost(filteredReceivers, hostFocus);

    if (showActiveOnly) {
      filteredSenders = filteredSenders.filter(deviceHasActivity);
      filteredReceivers = filteredReceivers.filter(deviceHasActivity);
    }

    const connectedByDeviceKey = new Map();
    snapshot.connections.forEach((conn) => {
      const add = (deviceKey, channelId) => {
        if (!deviceKey || !channelId) return;
        if (!connectedByDeviceKey.has(deviceKey)) {
          connectedByDeviceKey.set(deviceKey, new Set());
        }
        connectedByDeviceKey.get(deviceKey).add(channelId);
      };
      add(conn.senderDeviceKey, conn.senderChannelId);
      add(conn.receiverDeviceKey, conn.receiverChannelId);
    });

    const nodeGap =
      filteredSenders.length + filteredReceivers.length > LARGE_NETWORK_DEVICE_THRESHOLD
        ? COMPACT_NODE_Y_GAP
        : DEFAULT_NODE_Y_GAP;

    const buildNodeData = (device, rolePrefix) => {
      const nodeId = `${rolePrefix}-device-${device.deviceKey}`;
      const channelCount = device.channels?.length || 0;
      const isCollapsed =
        channelCount > COLLAPSE_CHANNELS_THRESHOLD && !expandedDeviceKeys.has(nodeId);
      return {
        ...device,
        isAggregated: true,
        isCollapsed,
        maxVisibleHandles: MAX_VISIBLE_HANDLES_WHEN_COLLAPSED,
        connectedChannelIds: connectedByDeviceKey.get(device.deviceKey) || new Set(),
        onToggleExpand: () => toggleDeviceExpanded(nodeId),
      };
    };

    const senderNodes = filteredSenders.map((device, index) => ({
      id: `sender-device-${device.deviceKey}`,
      type: 'senderNode',
      position: nodePositions[`sender-device-${device.deviceKey}`] || { x: DEFAULT_SENDER_X, y: DEFAULT_NODE_Y_START + (index * nodeGap) },
      data: buildNodeData(device, 'sender'),
    }));

    const receiverNodes = filteredReceivers.map((device, index) => ({
      id: `receiver-device-${device.deviceKey}`,
      type: 'receiverNode',
      position: nodePositions[`receiver-device-${device.deviceKey}`] || { x: DEFAULT_RECEIVER_X, y: DEFAULT_NODE_Y_START + (index * nodeGap) },
      data: buildNodeData(device, 'receiver'),
    }));

    const nextNodes = [...senderNodes, ...receiverNodes];
    const senderByDeviceKey = new Map(filteredSenders.map((d) => [d.deviceKey, d]));
    const receiverByDeviceKey = new Map(filteredReceivers.map((d) => [d.deviceKey, d]));
    const visibleConnections = snapshot.connections.filter((conn) => {
      if (!senderByDeviceKey.has(conn.senderDeviceKey)) return false;
      if (!receiverByDeviceKey.has(conn.receiverDeviceKey)) return false;
      if (isReceiverConnectionSuppressed(conn.receiverUuid)) return false;
      if (!HIDE_INTERNAL_CONNECTIONS) return true;
      const sender = senderByDeviceKey.get(conn.senderDeviceKey);
      const receiver = receiverByDeviceKey.get(conn.receiverDeviceKey);
      if (!sender || !receiver) return true;
      const sameApp = sender.applicationId === receiver.applicationId;
      const sameAddress = (sender.address || '') === (receiver.address || '');
      const appIsKnown = sender.applicationId !== 'unknown' && receiver.applicationId !== 'unknown';
      return !(sameApp && sameAddress && appIsKnown);
    });

    const groupedConnections = new Map();
    visibleConnections.forEach((conn) => {
      const pairKey = `${conn.senderDeviceKey}->${conn.receiverDeviceKey}`;
      const list = groupedConnections.get(pairKey) || [];
      list.push(conn);
      groupedConnections.set(pairKey, list);
    });

    const nextEdges = [];
    groupedConnections.forEach((connections) => {
      const ordered = [...connections].sort((a, b) => {
        const ai = Number(a.senderChannelId?.replace(/[^\d]/g, '')) || 0;
        const bi = Number(b.senderChannelId?.replace(/[^\d]/g, '')) || 0;
        return ai - bi;
      });

      ordered.forEach((conn, laneIndex) => {
        nextEdges.push({
          id: `edge-${conn.connectionId}`,
          type: 'custom',
          source: `sender-device-${conn.senderDeviceKey}`,
          target: `receiver-device-${conn.receiverDeviceKey}`,
          sourceHandle: `out-${conn.senderChannelId}`,
          targetHandle: `in-${conn.receiverChannelId}`,
          animated: true,
          deletable: true,
          selectable: true,
          reconnectable: true,
          style: { stroke: '#4ade80', strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#4ade80', width: 12, height: 12 },
          data: {
            senderLabel: conn.senderLabel,
            receiverLabel: conn.receiverLabel,
            sourceName: conn.sourceName,
            receiverUuid: conn.receiverUuid,
            edgeLaneIndex: laneIndex,
            edgeLaneCount: ordered.length,
          },
        });
      });
    });

    setNodes((prev) => mergeNodes(prev, nextNodes));
    setEdges((prev) => mergeEdges(prev, nextEdges));
    if (isFirstLoad && nextNodes.length > 0) setIsFirstLoad(false);
  }, [
    snapshot,
    nodePositions,
    setNodes,
    setEdges,
    isFirstLoad,
    isReceiverConnectionSuppressed,
    senderFilter,
    receiverFilter,
    hostFocus,
    showActiveOnly,
    expandedDeviceKeys,
    toggleDeviceExpanded,
  ]);

  useEffect(() => {
    fetchDevices(true);
    const interval = setInterval(() => fetchDevices(false), 1000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  if (loading) {
    return <div style={styles.container} />;
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.header, justifyContent: 'center', color: '#f87171' }}>{error}</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>NDI Manager</h1>
          <p style={styles.subtitle}>
            {hostFocus ? `Host: ${hostFocus}` : 'Raggruppa per macchina — apri Hosts per VECTAR-PLUS ecc.'}
          </p>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.toolbar}>
            <button
              type="button"
              style={styles.viewBtn(viewMode === 'overview')}
              onClick={() => setViewMode('overview')}
            >
              Hosts
            </button>
            <button
              type="button"
              style={styles.viewBtn(viewMode === 'flow')}
              onClick={() => setViewMode('flow')}
            >
              Canvas
            </button>
            <label style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={showActiveOnly}
                onChange={(e) => setShowActiveOnly(e.target.checked)}
              />
              Solo attivi
            </label>
          </div>
          <div style={styles.filtersRow}>
            <input
              type="text"
              value={senderFilter}
              onChange={(e) => setSenderFilter(e.target.value)}
              placeholder="Sender filter (e.g. SHQ7|SHQ2, Intercom_A, 192.168.15.22)"
              style={styles.filterInput}
            />
            <input
              type="text"
              value={receiverFilter}
              onChange={(e) => setReceiverFilter(e.target.value)}
              placeholder="Receiver filter (e.g. HX, Intercom_A)"
              style={styles.filterInput}
            />
          </div>
          <div style={styles.stats}>
            <span style={{ ...styles.statHighlight, ...styles.senderCount }}>{snapshot.senders.length}</span> snd
            <span style={{ margin: '0 8px' }}>•</span>
            <span style={{ ...styles.statHighlight, ...styles.receiverCount }}>{snapshot.receivers.length}</span> rcv
            <span style={{ margin: '0 8px' }}>•</span>
            <span>{hostGroups.length}</span> host
          </div>
          <button onClick={() => fetchDevices(true)} style={styles.refreshButton}>
            <span>🔄</span>
            Refresh
          </button>
        </div>
      </div>

      <div style={styles.body}>
        {(viewMode === 'overview' ||
          snapshot.senders.length + snapshot.receivers.length > LARGE_NETWORK_DEVICE_THRESHOLD) && (
          <HostOverview
            hostGroups={hostGroups}
            selectedHostKey={hostFocus}
            onSelectHost={(key) => {
              setHostFocus(key);
            }}
            totalSenders={snapshot.senders.length}
            totalReceivers={snapshot.receivers.length}
          />
        )}
        <div style={styles.flowPane}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnectStart={onReconnectStart}
            onReconnect={onReconnect}
            onReconnectEnd={onReconnectEnd}
            onEdgesDelete={onEdgesDelete}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView={isFirstLoad}
            minZoom={0.05}
            maxZoom={1.5}
            attributionPosition="bottom-right"
          >
            <Background color="#374151" gap={16} />
            <Controls />
            <MiniMap
              nodeColor={(node) => {
                if (node.type === 'senderNode') return '#10b981';
                if (node.type === 'receiverNode') return '#3b82f6';
                return '#6b7280';
              }}
            />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
