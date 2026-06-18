import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  ReactFlowProvider,
} from '@xyflow/react';
import axios from 'axios';
import SenderNode from './SenderNode';
import ReceiverNode from './ReceiverNode';
import CustomEdge from './CustomEdge';
import HostOverview from './HostOverview';
import MetricsLegend from './MetricsLegend';
import ChannelDetailDrawer from './ChannelDetailDrawer';
import NdiTableView from './NdiTableView';
import NdiEventsPanel from './NdiEventsPanel';
import { useToast } from '../context/ToastContext';
import { useNdiSignalR } from '../hooks/useNdiSignalR';
import {
  buildHostGroups,
  filterDevicesByHost,
  deviceHasActivity,
  LARGE_NETWORK_DEVICE_THRESHOLD,
  COLLAPSE_CHANNELS_THRESHOLD,
  MAX_VISIBLE_HANDLES_WHEN_COLLAPSED,
} from '../utils/deviceGrouping';
import {
  computeDefaultLayout,
  computeHostAlignedLayout,
  saveHostPreset,
  loadHostPreset,
  getBundleLabel,
  getNodeGap,
} from '../utils/layoutUtils';

const API_BASE = '/api/ndi';
const HIDE_INTERNAL_CONNECTIONS = false;
const NODE_LAYOUT_VERSION = '7';
const DEFAULT_SENDER_X = 80;
const DEFAULT_RECEIVER_X = 940;
const DEFAULT_NODE_Y_START = 120;

const styles = {
  container: { width: '100vw', height: '100vh', backgroundColor: '#111827', display: 'flex', flexDirection: 'column' },
  header: {
    flexShrink: 0,
    backgroundColor: '#1f2937',
    borderBottom: '1px solid #374151',
    padding: '12px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  headerLeft: { display: 'flex', flexDirection: 'column', minWidth: 180 },
  title: { fontSize: '22px', fontWeight: 'bold', color: 'white', margin: 0 },
  subtitle: { fontSize: '13px', color: '#9ca3af', margin: 0 },
  headerRight: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  filtersRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  filterInput: {
    width: '220px',
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid #4b5563',
    backgroundColor: '#111827',
    color: '#e5e7eb',
    fontSize: '12px',
    outline: 'none',
  },
  stats: { fontSize: '13px', color: '#d1d5db' },
  statHighlight: { fontWeight: '600' },
  senderCount: { color: '#10b981' },
  receiverCount: { color: '#3b82f6' },
  body: { display: 'flex', flex: 1, minHeight: 0 },
  flowPane: { flex: 1, minWidth: 0, height: '100%', position: 'relative' },
  toolbar: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' },
  viewBtn: (active) => ({
    padding: '5px 10px',
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
    gap: '5px',
    fontSize: '12px',
    color: '#d1d5db',
    cursor: 'pointer',
    userSelect: 'none',
  },
  statusPill: (health) => ({
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 600,
    backgroundColor:
      health === 'ok' ? '#14532d' : health === 'idle' ? '#78350f' : health === 'degraded' ? '#713f12' : '#7f1d1d',
    color: '#f9fafb',
    border: '1px solid #374151',
    whiteSpace: 'nowrap',
  }),
  refreshButton: {
    padding: '6px 12px',
    backgroundColor: '#2563eb',
    color: 'white',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
  },
  footer: {
    flexShrink: 0,
    padding: '6px 16px',
    borderTop: '1px solid #374151',
    backgroundColor: '#0f172a',
    color: '#6b7280',
    fontSize: 11,
    display: 'flex',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  connectPreview: {
    position: 'fixed',
    pointerEvents: 'none',
    zIndex: 50,
    padding: '6px 10px',
    borderRadius: 6,
    backgroundColor: 'rgba(17,24,39,0.95)',
    border: '1px solid #4ade80',
    color: '#ecfdf5',
    fontSize: 12,
    maxWidth: 360,
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
    if (t.includes('*') || t.includes('?')) {
      const escaped = t
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(escaped, 'i').test(searchText);
    }
    return searchText.includes(t);
  };

  const andGroups = query.split(',').map((g) => g.trim()).filter(Boolean);
  if (andGroups.length === 0) return true;

  return andGroups.every((group) => {
    const orTerms = group.split('|').map((t) => t.trim()).filter(Boolean);
    if (orTerms.length === 0) return true;
    return orTerms.some((term) => matchesTerm(term));
  });
}

function sourcesMatch(a, b) {
  const left = (a || '').trim();
  const right = (b || '').trim();
  if (!left || !right) return false;
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

function isConnectionConfirmed(conn, snapshot, isReceiverPending) {
  if (isReceiverPending(conn.receiverUuid)) return false;
  const receiverDevice = snapshot.receivers.find((d) => d.deviceKey === conn.receiverDeviceKey);
  const channel = receiverDevice?.channels?.find((c) => c.channelId === conn.receiverChannelId);
  if (!channel) return false;
  return sourcesMatch(channel.currentSource, conn.sourceName);
}

function FlowCanvas(props) {
  return <ReactFlow {...props} />;
}

export default function NDIFlowEditor() {
  const { push: toast } = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [snapshot, setSnapshot] = useState({ senders: [], receivers: [], connections: [] });
  const [systemStatus, setSystemStatus] = useState(null);
  const [senderFilter, setSenderFilter] = useState('');
  const [receiverFilter, setReceiverFilter] = useState('');
  const [mainTab, setMainTab] = useState('canvas');
  const [viewMode, setViewMode] = useState('overview');
  const [hostFocus, setHostFocus] = useState(null);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [showLegend, setShowLegend] = useState(() => localStorage.getItem('ndi-metrics-legend-seen') !== '1');
  const [density, setDensity] = useState(() => localStorage.getItem('ndi-ui-density') || 'comfort');
  const [expandedDeviceKeys, setExpandedDeviceKeys] = useState(() => new Set());
  const [channelDetail, setChannelDetail] = useState(null);
  const [connectPreview, setConnectPreview] = useState(null);
  const [eventsRefreshToken, setEventsRefreshToken] = useState(0);
  const [pendingEpoch, setPendingEpoch] = useState(0);
  const viewModeInitialized = useRef(false);
  const edgeReconnectSuccessful = useRef(true);
  const mutationBlockUntilRef = useRef(0);
  const suppressedReceiverUntilRef = useRef(new Map());
  const pendingReceiverUntilRef = useRef(new Map());
  const rfInstanceRef = useRef(null);

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

  const isReceiverPending = useCallback((uuid) => {
    if (!uuid) return false;
    const until = pendingReceiverUntilRef.current.get(uuid);
    if (!until) return false;
    if (Date.now() >= until) {
      pendingReceiverUntilRef.current.delete(uuid);
      return false;
    }
    return true;
  }, []);

  const hostGroups = useMemo(() => buildHostGroups(snapshot), [snapshot]);
  const bundleLabel = useMemo(() => getBundleLabel(), []);

  const markPendingReceiver = useCallback((receiverUuid, ms = 12000) => {
    if (!receiverUuid) return;
    pendingReceiverUntilRef.current.set(receiverUuid, Date.now() + ms);
    setPendingEpoch((e) => e + 1);
  }, []);

  const applySnapshotPayload = useCallback((data) => {
    if (!data) return;
    setSnapshot({
      senders: Array.isArray(data.senders) ? data.senders : [],
      receivers: Array.isArray(data.receivers) ? data.receivers : [],
      connections: Array.isArray(data.connections) ? data.connections : [],
    });
    setError(null);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/status`);
      setSystemStatus(res.data || null);
    } catch {
      // Status is optional; polling continues.
    }
  }, []);

  const fetchDevices = useCallback(async (force = false) => {
    if (!force && Date.now() < mutationBlockUntilRef.current) return;

    try {
      const res = await axios.get(`${API_BASE}/devices`);
      applySnapshotPayload(res.data);
    } catch (err) {
      console.error('Error fetching aggregated devices:', err);
      setError('Failed to fetch NDI devices. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  }, [applySnapshotPayload]);

  useNdiSignalR({
    enabled: true,
    onSnapshot: useCallback((payload) => {
      if (payload?.snapshot) applySnapshotPayload(payload.snapshot);
      if (payload?.status) setSystemStatus(payload.status);
    }, [applySnapshotPayload]),
  });

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
    if (deviceCount > LARGE_NETWORK_DEVICE_THRESHOLD) setViewMode('overview');
    viewModeInitialized.current = true;
  }, [loading, snapshot.senders.length, snapshot.receivers.length]);

  const blockPollingDuringMutation = useCallback((ms = 3500) => {
    mutationBlockUntilRef.current = Math.max(mutationBlockUntilRef.current, Date.now() + ms);
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
    return { sourceName, receiverUuid, sourceChannel, targetChannel, sourceDevice, targetDevice };
  }, []);

  const persistPositions = useCallback((positions) => {
    setNodePositions(positions);
    localStorage.setItem('ndi-multichannel-node-positions', JSON.stringify(positions));
  }, []);

  const resetLayout = useCallback(() => {
    const positions = computeDefaultLayout(snapshot.senders, snapshot.receivers, density);
    persistPositions(positions);
    toast('Layout reset', 'success');
    setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.2, duration: 350 }), 100);
  }, [snapshot.senders, snapshot.receivers, density, persistPositions, toast]);

  const alignLayoutByHost = useCallback(() => {
    let senders = snapshot.senders;
    let receivers = snapshot.receivers;
    if (hostFocus) {
      senders = filterDevicesByHost(senders, hostFocus);
      receivers = filterDevicesByHost(receivers, hostFocus);
    }
    const positions = computeHostAlignedLayout(senders, receivers, density);
    persistPositions(positions);
    toast('Layout aligned by host', 'success');
    setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.15, duration: 350 }), 100);
  }, [snapshot.senders, snapshot.receivers, hostFocus, density, persistPositions, toast]);

  const saveCurrentHostPreset = useCallback(() => {
    if (!hostFocus) {
      toast('Select a host from the Hosts panel', 'warning');
      return;
    }
    saveHostPreset(hostFocus, {
      nodePositions,
      senderFilter,
      receiverFilter,
      showActiveOnly,
      density,
    });
    toast(`Preset saved for ${hostFocus}`, 'success');
  }, [hostFocus, nodePositions, senderFilter, receiverFilter, showActiveOnly, density, toast]);

  const loadCurrentHostPreset = useCallback(() => {
    if (!hostFocus) {
      toast('Select a host from the Hosts panel', 'warning');
      return;
    }
    const preset = loadHostPreset(hostFocus);
    if (!preset) {
      toast('No preset saved for this host', 'warning');
      return;
    }
    if (preset.nodePositions) persistPositions(preset.nodePositions);
    if (preset.senderFilter != null) setSenderFilter(preset.senderFilter);
    if (preset.receiverFilter != null) setReceiverFilter(preset.receiverFilter);
    if (preset.showActiveOnly != null) setShowActiveOnly(preset.showActiveOnly);
    if (preset.density) {
      setDensity(preset.density);
      localStorage.setItem('ndi-ui-density', preset.density);
    }
    toast(`Preset loaded for ${hostFocus}`, 'success');
  }, [hostFocus, persistPositions, toast]);

  const bulkDisconnectHost = useCallback(async () => {
    if (!hostFocus) {
      toast('Select a host', 'warning');
      return;
    }
    const receivers = filterDevicesByHost(snapshot.receivers, hostFocus);
    const uuids = receivers.flatMap((d) => (d.channels || []).map((c) => c.endpointUuid).filter(Boolean));
    if (uuids.length === 0) {
      toast('No receivers on this host', 'warning');
      return;
    }
    if (!window.confirm(`Disconnect ${uuids.length} receivers on ${hostFocus}?`)) return;

    blockPollingDuringMutation(5000);
    try {
      const res = await axios.post(`${API_BASE}/disconnect-bulk`, { receiverUuids: uuids });
      const ok = res.data?.succeeded ?? 0;
      toast(`Bulk disconnect: ${ok}/${uuids.length} succeeded`, ok === uuids.length ? 'success' : 'warning');
    } catch {
      toast('Bulk disconnect error', 'error');
    } finally {
      setTimeout(() => fetchDevices(true), 800);
    }
  }, [hostFocus, snapshot.receivers, blockPollingDuringMutation, fetchDevices, toast]);

  const disconnectReceiver = useCallback(async (receiverUuid) => {
    if (!receiverUuid) return;
    blockPollingDuringMutation();
    suppressReceiverConnection(receiverUuid);
    try {
      const response = await axios.post(`${API_BASE}/disconnect`, { receiverUuid });
      if (!response.data?.success) {
        toast(`Disconnect failed: ${response.data?.message ?? 'error'}`, 'error');
      } else {
        toast('Disconnect sent', 'success');
      }
    } catch {
      toast('Disconnect error', 'error');
    } finally {
      setTimeout(() => fetchDevices(true), 800);
    }
  }, [blockPollingDuringMutation, suppressReceiverConnection, fetchDevices, toast]);

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

  const onConnectStart = useCallback((_evt, params) => {
    const { sourceName } = resolveConnectionDetails(params, snapshot);
    setConnectPreview({ x: _evt.clientX, y: _evt.clientY, sourceName: sourceName || '—' });
  }, [snapshot, resolveConnectionDetails]);

  const onConnectEnd = useCallback(() => {
    setConnectPreview(null);
  }, []);

  const onConnect = useCallback(async (params) => {
    setConnectPreview(null);
    const { sourceName, receiverUuid } = resolveConnectionDetails(params, snapshot);
    if (!receiverUuid || !sourceName) return;

    blockPollingDuringMutation();
    markPendingReceiver(receiverUuid);
    try {
      const response = await axios.post(`${API_BASE}/connect`, { receiverUuid, sourceName });
      if (!response?.data?.success) {
        toast(`Connect failed: ${response?.data?.message ?? 'error'}`, 'error');
      } else {
        toast(`Connect sent → ${sourceName}`, 'success');
      }
    } catch {
      toast('Connect error', 'error');
    } finally {
      setTimeout(() => fetchDevices(true), 600);
    }
  }, [snapshot, fetchDevices, blockPollingDuringMutation, resolveConnectionDetails, markPendingReceiver, toast]);

  const onEdgesDelete = useCallback(async (edgesToDelete) => {
    blockPollingDuringMutation();
    for (const edge of edgesToDelete) {
      const receiverUuid = edge?.data?.receiverUuid;
      if (!receiverUuid) continue;
      suppressReceiverConnection(receiverUuid);
      try {
        const response = await axios.post(`${API_BASE}/disconnect`, { receiverUuid });
        if (!response.data?.success) {
          toast(`Disconnect failed: ${response.data?.message ?? 'error'}`, 'error');
        } else {
          toast('Disconnect sent', 'success');
        }
      } catch {
        toast('Disconnect error', 'error');
      }
    }
    setTimeout(() => fetchDevices(true), 800);
    setTimeout(() => fetchDevices(true), 1800);
  }, [fetchDevices, blockPollingDuringMutation, suppressReceiverConnection, toast]);

  const disconnectEdgeByReceiver = useCallback(async (edge) => {
    const receiverUuid = edge?.data?.receiverUuid;
    if (!receiverUuid) return;
    await disconnectReceiver(receiverUuid);
  }, [disconnectReceiver]);

  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessful.current = false;
  }, []);

  const onReconnect = useCallback(async (_oldEdge, newConnection) => {
    edgeReconnectSuccessful.current = true;
    const oldReceiverUuid = _oldEdge?.data?.receiverUuid || '';
    const { sourceName, receiverUuid: newReceiverUuid } = resolveConnectionDetails(newConnection, snapshot);
    if (!newReceiverUuid || !sourceName) return;

    blockPollingDuringMutation();
    markPendingReceiver(newReceiverUuid);
    if (oldReceiverUuid && oldReceiverUuid !== newReceiverUuid) suppressReceiverConnection(oldReceiverUuid);
    suppressReceiverConnection(newReceiverUuid, 2000);

    try {
      if (oldReceiverUuid && oldReceiverUuid !== newReceiverUuid) {
        await axios.post(`${API_BASE}/disconnect`, { receiverUuid: oldReceiverUuid });
      }
      const connectResponse = await axios.post(`${API_BASE}/connect`, { receiverUuid: newReceiverUuid, sourceName });
      if (!connectResponse?.data?.success) {
        toast(`Reconnect failed: ${connectResponse?.data?.message ?? 'error'}`, 'error');
      } else {
        toast(`Reconnect → ${sourceName}`, 'success');
      }
    } catch {
      toast('Reconnect error', 'error');
    } finally {
      setTimeout(() => fetchDevices(true), 800);
      setTimeout(() => fetchDevices(true), 1800);
    }
  }, [snapshot, fetchDevices, blockPollingDuringMutation, resolveConnectionDetails, suppressReceiverConnection, markPendingReceiver, toast]);

  const onReconnectEnd = useCallback(async (_event, edge) => {
    if (edgeReconnectSuccessful.current) return;
    await disconnectEdgeByReceiver(edge);
  }, [disconnectEdgeByReceiver]);

  const handleChannelSelect = useCallback((detail) => {
    setChannelDetail(detail);
  }, []);

  const dismissLegend = useCallback(() => {
    setShowLegend(false);
    localStorage.setItem('ndi-metrics-legend-seen', '1');
  }, []);

  const toggleDensity = useCallback(() => {
    setDensity((prev) => {
      const next = prev === 'compact' ? 'comfort' : 'compact';
      localStorage.setItem('ndi-ui-density', next);
      return next;
    });
  }, []);

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
        if (!connectedByDeviceKey.has(deviceKey)) connectedByDeviceKey.set(deviceKey, new Set());
        connectedByDeviceKey.get(deviceKey).add(channelId);
      };
      add(conn.senderDeviceKey, conn.senderChannelId);
      add(conn.receiverDeviceKey, conn.receiverChannelId);
    });

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

    const logicalConnectionsByDeviceKey = new Map();
    visibleConnections.forEach((conn) => {
      logicalConnectionsByDeviceKey.set(
        conn.senderDeviceKey,
        (logicalConnectionsByDeviceKey.get(conn.senderDeviceKey) || 0) + 1,
      );
      logicalConnectionsByDeviceKey.set(
        conn.receiverDeviceKey,
        (logicalConnectionsByDeviceKey.get(conn.receiverDeviceKey) || 0) + 1,
      );
    });

    const nodeGap = getNodeGap(filteredSenders.length + filteredReceivers.length, density);
    const compactPadding = density === 'compact' ? 8 : 12;

    const buildNodeData = (device, rolePrefix) => {
      const nodeId = `${rolePrefix}-device-${device.deviceKey}`;
      const channelCount = device.channels?.length || 0;
      const isCollapsed = channelCount > COLLAPSE_CHANNELS_THRESHOLD && !expandedDeviceKeys.has(nodeId);
      return {
        ...device,
        isAggregated: true,
        isCollapsed,
        maxVisibleHandles: MAX_VISIBLE_HANDLES_WHEN_COLLAPSED,
        connectedChannelIds: connectedByDeviceKey.get(device.deviceKey) || new Set(),
        logicalConnectionCount: logicalConnectionsByDeviceKey.get(device.deviceKey) || 0,
        density,
        compactPadding,
        onToggleExpand: () => toggleDeviceExpanded(nodeId),
        onChannelSelect: (channel) => handleChannelSelect({
          device,
          channel,
          role: rolePrefix === 'sender' ? 'sender' : 'receiver',
        }),
        onFocusConnections: () => {
          const related = visibleConnections.filter((c) =>
            rolePrefix === 'sender'
              ? c.senderDeviceKey === device.deviceKey
              : c.receiverDeviceKey === device.deviceKey);
          if (related.length === 0) return;
          const conn = related[0];
          rfInstanceRef.current?.fitView({
            nodes: [
              { id: `sender-device-${conn.senderDeviceKey}` },
              { id: `receiver-device-${conn.receiverDeviceKey}` },
            ],
            padding: 0.35,
            duration: 350,
          });
        },
      };
    };

    const senderNodes = filteredSenders.map((device, index) => ({
      id: `sender-device-${device.deviceKey}`,
      type: 'senderNode',
      position: nodePositions[`sender-device-${device.deviceKey}`] || {
        x: DEFAULT_SENDER_X,
        y: DEFAULT_NODE_Y_START + index * nodeGap,
      },
      data: buildNodeData(device, 'sender'),
    }));

    const receiverNodes = filteredReceivers.map((device, index) => ({
      id: `receiver-device-${device.deviceKey}`,
      type: 'receiverNode',
      position: nodePositions[`receiver-device-${device.deviceKey}`] || {
        x: DEFAULT_RECEIVER_X,
        y: DEFAULT_NODE_Y_START + index * nodeGap,
      },
      data: buildNodeData(device, 'receiver'),
    }));

    const nextNodes = [...senderNodes, ...receiverNodes];
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
        const confirmed = isConnectionConfirmed(conn, snapshot, isReceiverPending);
        const color = confirmed ? '#4ade80' : '#facc15';
        const sourceNodeId = `sender-device-${conn.senderDeviceKey}`;
        const targetNodeId = `receiver-device-${conn.receiverDeviceKey}`;

        nextEdges.push({
          id: `edge-${conn.connectionId}`,
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
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 12, height: 12 },
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
            onFocus: () => {
              rfInstanceRef.current?.fitView({
                nodes: [{ id: sourceNodeId }, { id: targetNodeId }],
                padding: 0.35,
                duration: 350,
              });
            },
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
    density,
    handleChannelSelect,
    pendingEpoch,
    isReceiverPending,
  ]);

  useEffect(() => {
    fetchDevices(true);
    fetchStatus();
    const interval = setInterval(() => {
      fetchDevices(false);
      fetchStatus();
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchDevices, fetchStatus]);

  useEffect(() => {
    if (!connectPreview) return undefined;
    const move = (e) => setConnectPreview((p) => (p ? { ...p, x: e.clientX, y: e.clientY } : p));
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, [connectPreview]);

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

  const health = systemStatus?.health || 'unknown';
  const discoveryLabel = systemStatus
    ? `${systemStatus.sendListenerConnected && systemStatus.recvListenerConnected ? 'Discovery OK' : 'Discovery partial'} · ${systemStatus.senderCount} snd · ${systemStatus.receiverCount} rcv`
    : 'Discovery…';

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>NDI Manager</h1>
          <p style={styles.subtitle}>
            {hostFocus ? `Host: ${hostFocus}` : 'Multichannel — select a host from the sidebar'}
          </p>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.statusPill(health)} title={systemStatus?.discoveryServerUrl || ''}>
            {discoveryLabel}
          </span>
          <div style={styles.toolbar}>
            <button type="button" style={styles.viewBtn(mainTab === 'canvas')} onClick={() => setMainTab('canvas')}>
              Canvas
            </button>
            <button type="button" style={styles.viewBtn(mainTab === 'table')} onClick={() => setMainTab('table')}>
              Table
            </button>
            <button type="button" style={styles.viewBtn(mainTab === 'events')} onClick={() => setMainTab('events')}>
              Events
            </button>
            {mainTab === 'canvas' ? (
              <>
                <button type="button" style={styles.viewBtn(viewMode === 'overview')} onClick={() => setViewMode('overview')}>
                  Hosts
                </button>
                <button type="button" style={styles.viewBtn(viewMode === 'flow')} onClick={() => setViewMode('flow')}>
                  Canvas only
                </button>
              </>
            ) : null}
            <label style={styles.checkLabel}>
              <input type="checkbox" checked={showActiveOnly} onChange={(e) => setShowActiveOnly(e.target.checked)} />
              Active only
            </label>
            <button type="button" style={styles.viewBtn(false)} onClick={toggleDensity}>
              {density === 'compact' ? 'Comfort' : 'Compact'}
            </button>
            <button type="button" style={styles.viewBtn(false)} onClick={() => setShowLegend(true)} title="Metrics legend">
              ℹ️
            </button>
          </div>
          {mainTab === 'canvas' ? (
            <div style={styles.toolbar}>
              <button type="button" style={styles.viewBtn(false)} onClick={resetLayout}>Reset layout</button>
              <button type="button" style={styles.viewBtn(false)} onClick={alignLayoutByHost}>Align by host</button>
              {hostFocus ? (
                <>
                  <button type="button" style={styles.viewBtn(false)} onClick={saveCurrentHostPreset}>Save preset</button>
                  <button type="button" style={styles.viewBtn(false)} onClick={loadCurrentHostPreset}>Load preset</button>
                  <button type="button" style={styles.viewBtn(false)} onClick={bulkDisconnectHost}>Disconnect host</button>
                </>
              ) : null}
            </div>
          ) : null}
          <div style={styles.filtersRow}>
            <input
              type="text"
              value={senderFilter}
              onChange={(e) => setSenderFilter(e.target.value)}
              placeholder="Sender filter (e.g. SHQ7|SHQ2)"
              style={styles.filterInput}
            />
            <input
              type="text"
              value={receiverFilter}
              onChange={(e) => setReceiverFilter(e.target.value)}
              placeholder="Receiver filter (e.g. HX)"
              style={styles.filterInput}
            />
          </div>
          <div style={styles.stats}>
            <span style={{ ...styles.statHighlight, ...styles.senderCount }}>{snapshot.senders.length}</span> snd
            <span style={{ margin: '0 6px' }}>•</span>
            <span style={{ ...styles.statHighlight, ...styles.receiverCount }}>{snapshot.receivers.length}</span> rcv
            <span style={{ margin: '0 6px' }}>•</span>
            <span>{hostGroups.length}</span> host
          </div>
          <button type="button" onClick={() => { fetchDevices(true); fetchStatus(); }} style={styles.refreshButton}>
            Refresh
          </button>
        </div>
      </div>

      <div style={styles.body}>
        {mainTab === 'canvas' && (viewMode === 'overview' ||
          snapshot.senders.length + snapshot.receivers.length > LARGE_NETWORK_DEVICE_THRESHOLD) && (
          <HostOverview
            hostGroups={hostGroups}
            selectedHostKey={hostFocus}
            onSelectHost={setHostFocus}
            totalSenders={snapshot.senders.length}
            totalReceivers={snapshot.receivers.length}
          />
        )}

        {mainTab === 'canvas' ? (
          <div style={styles.flowPane}>
            {showLegend ? <MetricsLegend onClose={dismissLegend} /> : null}
            <ReactFlowProvider>
              <FlowCanvas
                nodes={nodes}
                edges={edges}
                onNodesChange={handleNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onConnectStart={onConnectStart}
                onConnectEnd={onConnectEnd}
                onReconnectStart={onReconnectStart}
                onReconnect={onReconnect}
                onReconnectEnd={onReconnectEnd}
                onEdgesDelete={onEdgesDelete}
                onInit={(inst) => { rfInstanceRef.current = inst; }}
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
              </FlowCanvas>
            </ReactFlowProvider>
          </div>
        ) : null}

        {mainTab === 'table' ? (
          <NdiTableView
            snapshot={snapshot}
            hostFocus={hostFocus}
            onDisconnect={disconnectReceiver}
            onSelectRow={handleChannelSelect}
          />
        ) : null}

        {mainTab === 'events' ? (
          <NdiEventsPanel refreshToken={eventsRefreshToken} />
        ) : null}

        {channelDetail ? (
          <ChannelDetailDrawer detail={channelDetail} onClose={() => setChannelDetail(null)} />
        ) : null}
      </div>

      {connectPreview ? (
        <div
          style={{
            ...styles.connectPreview,
            left: connectPreview.x + 14,
            top: connectPreview.y + 14,
          }}
        >
          Source NDI: <strong>{connectPreview.sourceName}</strong>
        </div>
      ) : null}

      <div style={styles.footer}>
        <span>
          v{systemStatus?.appVersion || '2.9.0'}
          {systemStatus?.lastDiscoveryAt
            ? ` · updated ${new Date(systemStatus.lastDiscoveryAt).toLocaleTimeString('en-US')}`
            : ''}
        </span>
        <span>{bundleLabel}</span>
      </div>
    </div>
  );
}
