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
import AutoMeasureLayout from './AutoMeasureLayout';
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
  collectLayoutHostKeys,
  enrichNodesWithDomMeasurements,
  saveHostPreset,
  loadHostPreset,
  getBundleLabel,
  mergeLayoutWithNewDevices,
  isValidSavedPosition,
} from '../utils/layoutUtils';

const API_BASE = '/api/ndi';
const HIDE_INTERNAL_CONNECTIONS = false;
const NODE_LAYOUT_VERSION = '11';

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

function mergeNodes(prevNodes, nextNodes, draggingNodeIds) {
  if (nextNodes.length === 0 && prevNodes.length > 0) {
    return prevNodes;
  }
  const prevMap = new Map(prevNodes.map((n) => [n.id, n]));
  return nextNodes.map((node) => {
    const prev = prevMap.get(node.id);
    const keepDragPosition = prev?.position && draggingNodeIds.has(node.id);
    return {
      ...node,
      position: keepDragPosition ? prev.position : node.position,
      selected: prev?.selected ?? false,
    };
  });
}

function mergeEdges(prevEdges, nextEdges) {
  if (nextEdges.length === 0 && prevEdges.length > 0) {
    return prevEdges;
  }
  const prevMap = new Map(prevEdges.map((e) => [e.id, e]));
  return nextEdges.map((edge) => ({
    ...edge,
    selected: prevMap.get(edge.id)?.selected ?? false,
  }));
}

function buildCanvasStructureKey({
  filteredSenders,
  filteredReceivers,
  visibleConnections,
  selectedHostKeys,
  senderFilter,
  receiverFilter,
  showActiveOnly,
  expandedDeviceKeys,
  compactDeviceKeys,
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
  return `${senderPart}::${receiverPart}::${connPart}::${hostPart}::${senderFilter}::${receiverFilter}::${showActiveOnly}::${expandPart}::${compactPart}`;
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

function isConnectionConfirmed(conn, snapshot) {
  if (conn?.optimistic) return true;
  const receiverDevice = snapshot.receivers.find((d) => d.deviceKey === conn.receiverDeviceKey);
  const channel = receiverDevice?.channels?.find((c) => c.channelId === conn.receiverChannelId);
  if (!channel) return false;
  return sourcesMatch(channel.currentSource, conn.sourceName);
}

function buildOptimisticConnection(details) {
  const {
    sourceDevice,
    targetDevice,
    sourceChannel,
    targetChannel,
    sourceName,
    receiverUuid,
  } = details;
  if (!sourceDevice || !targetDevice || !sourceChannel || !targetChannel || !receiverUuid) return null;

  return {
    connectionId: `${sourceChannel.endpointUuid}->${targetChannel.endpointUuid}`,
    senderDeviceKey: sourceDevice.deviceKey,
    senderChannelId: sourceChannel.channelId,
    senderLabel: sourceChannel.streamLabel,
    senderUuid: sourceChannel.endpointUuid,
    receiverDeviceKey: targetDevice.deviceKey,
    receiverChannelId: targetChannel.channelId,
    receiverLabel: targetChannel.streamLabel,
    receiverUuid,
    sourceName,
    optimistic: true,
  };
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
  const [selectedHostKeys, setSelectedHostKeys] = useState(() => new Set());
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [showLegend, setShowLegend] = useState(() => localStorage.getItem('ndi-metrics-legend-seen') !== '1');
  const [compactDeviceKeys, setCompactDeviceKeys] = useState(() => {
    try {
      const raw = localStorage.getItem('ndi-compact-device-keys');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [expandedDeviceKeys, setExpandedDeviceKeys] = useState(() => new Set());
  const [channelDetail, setChannelDetail] = useState(null);
  const [connectPreview, setConnectPreview] = useState(null);
  const [pendingEpoch, setPendingEpoch] = useState(0);
  const viewModeInitialized = useRef(false);
  const edgeReconnectSuccessful = useRef(true);
  const mutationBlockUntilRef = useRef(0);
  const suppressedReceiverUntilRef = useRef(new Map());
  const pendingReceiverUntilRef = useRef(new Map());
  const optimisticConnectionsRef = useRef(new Map());
  const rfInstanceRef = useRef(null);
  const draggingNodeIdsRef = useRef(new Set());
  const layoutSeededRef = useRef(false);
  const userLayoutRef = useRef(false);
  const nodePositionsRef = useRef({});
  const canvasStructureKeyRef = useRef('');
  const snapshotDebounceRef = useRef(null);
  const [autoMeasureLayout, setAutoMeasureLayout] = useState(() => {
    try {
      if (localStorage.getItem('ndi-multichannel-layout-version') !== NODE_LAYOUT_VERSION) return true;
      const saved = JSON.parse(localStorage.getItem('ndi-multichannel-node-positions') || '{}');
      return !Object.values(saved).some(isValidSavedPosition);
    } catch {
      return true;
    }
  });
  const [expandedLayoutEpoch, setExpandedLayoutEpoch] = useState(0);

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

  useEffect(() => {
    nodePositionsRef.current = nodePositions;
  }, [nodePositions]);

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
  const singleHostKey = selectedHostKeys.size === 1 ? [...selectedHostKeys][0] : null;
  const hostFilterLabel = useMemo(() => {
    if (selectedHostKeys.size === 0) return null;
    return [...selectedHostKeys].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).join(', ');
  }, [selectedHostKeys]);

  const handleHostClick = useCallback((hostKey, event) => {
    const multiSelect = event?.ctrlKey || event?.metaKey;
    setSelectedHostKeys((prev) => {
      if (multiSelect) {
        const next = new Set(prev);
        if (next.has(hostKey)) next.delete(hostKey);
        else next.add(hostKey);
        return next;
      }
      return new Set([hostKey]);
    });
  }, []);

  const clearHostSelection = useCallback(() => {
    setSelectedHostKeys(new Set());
  }, []);
  const bundleLabel = useMemo(() => getBundleLabel(), []);

  const markPendingReceiver = useCallback((receiverUuid, ms = 4000) => {
    if (!receiverUuid) return;
    pendingReceiverUntilRef.current.set(receiverUuid, Date.now() + ms);
    setPendingEpoch((e) => e + 1);
  }, []);

  const rememberOptimisticConnection = useCallback((details) => {
    const conn = buildOptimisticConnection(details);
    if (!conn) return;
    optimisticConnectionsRef.current.set(conn.receiverUuid, conn);
    setPendingEpoch((e) => e + 1);
  }, []);

  const clearOptimisticConnection = useCallback((receiverUuid) => {
    if (!receiverUuid) return;
    if (optimisticConnectionsRef.current.delete(receiverUuid)) {
      setPendingEpoch((e) => e + 1);
    }
  }, []);

  const applySnapshotPayload = useCallback((data) => {
    if (!data) return;
    if (snapshotDebounceRef.current) {
      clearTimeout(snapshotDebounceRef.current);
    }
    snapshotDebounceRef.current = setTimeout(() => {
      snapshotDebounceRef.current = null;
      setSnapshot({
        senders: Array.isArray(data.senders) ? data.senders : [],
        receivers: Array.isArray(data.receivers) ? data.receivers : [],
        connections: Array.isArray(data.connections) ? data.connections : [],
      });
      setError(null);
    }, 80);
  }, []);

  useEffect(() => () => {
    if (snapshotDebounceRef.current) clearTimeout(snapshotDebounceRef.current);
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

  const toggleCompactDevice = useCallback((nodeId) => {
    setCompactDeviceKeys((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      localStorage.setItem('ndi-compact-device-keys', JSON.stringify([...next]));
      return next;
    });
    if (!userLayoutRef.current) {
      setAutoMeasureLayout(true);
      setExpandedLayoutEpoch((epoch) => epoch + 1);
    }
  }, []);

  const toggleDeviceExpanded = useCallback((nodeId) => {
    setExpandedDeviceKeys((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
    if (!userLayoutRef.current) {
      setAutoMeasureLayout(true);
      setExpandedLayoutEpoch((epoch) => epoch + 1);
    }
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
    nodePositionsRef.current = positions;
    setNodePositions(positions);
    localStorage.setItem('ndi-multichannel-node-positions', JSON.stringify(positions));
  }, []);

  const resetLayout = useCallback(() => {
    userLayoutRef.current = false;
    setAutoMeasureLayout(true);
    const positions = computeDefaultLayout(snapshot.senders, snapshot.receivers, expandedDeviceKeys, compactDeviceKeys);
    persistPositions(positions);
    toast('Layout reset', 'success');
    setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.15, maxZoom: 1, duration: 350 }), 100);
  }, [snapshot.senders, snapshot.receivers, expandedDeviceKeys, compactDeviceKeys, persistPositions, toast]);

  const alignLayoutByHost = useCallback(() => {
    userLayoutRef.current = false;
    setAutoMeasureLayout(false);

    let senders = snapshot.senders;
    let receivers = snapshot.receivers;
    if (selectedHostKeys.size > 0) {
      senders = filterDevicesByHost(senders, selectedHostKeys);
      receivers = filterDevicesByHost(receivers, selectedHostKeys);
    }

    const hostKeys = collectLayoutHostKeys(senders, receivers);

    const fitAlignedView = () => {
      setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.12, maxZoom: 1, duration: 350 }), 120);
    };

    const updateAllNodeInternals = () => {
      const inst = rfInstanceRef.current;
      if (!inst?.updateNodeInternals) return;
      (inst.getNodes?.() ?? []).forEach((node) => {
        inst.updateNodeInternals(node.id);
      });
    };

    const applyPositionsToFlow = (positions) => {
      setNodes((prev) => {
        if (prev.length === 0) return prev;
        return prev.map((node) => {
          const nextPos = positions[node.id];
          if (!nextPos) return node;
          return { ...node, position: { x: nextPos.x, y: nextPos.y } };
        });
      });
    };

    const applyHostLayout = (nodes = null) => {
      const enrichedNodes = nodes?.length ? enrichNodesWithDomMeasurements(nodes) : null;
      const positions = computeHostAlignedLayout(
        senders,
        receivers,
        expandedDeviceKeys,
        compactDeviceKeys,
        enrichedNodes,
        hostKeys,
      );
      persistPositions(positions);
      applyPositionsToFlow(positions);
      return positions;
    };

    const getFlowNodes = () => rfInstanceRef.current?.getNodes?.() ?? [];

    const nodesReadyForMeasure = (nodes) =>
      nodes.length > 0 && nodes.every((node) => (node.measured?.height ?? 0) >= 80);

    applyHostLayout(null);
    updateAllNodeInternals();

    let attempts = 0;
    let finished = false;
    const finalize = (nodes) => {
      if (finished) return;
      finished = true;
      applyHostLayout(nodes);
      updateAllNodeInternals();
      userLayoutRef.current = true;
      toast('Layout aligned by host', 'success');
      fitAlignedView();
    };

    const retryMeasure = () => {
      if (finished) return;
      attempts += 1;
      updateAllNodeInternals();
      const nodes = enrichNodesWithDomMeasurements(getFlowNodes());
      if (nodesReadyForMeasure(nodes) || attempts >= 40) {
        finalize(nodes);
        return;
      }
      requestAnimationFrame(retryMeasure);
    };

    requestAnimationFrame(() => {
      retryMeasure();
      setTimeout(() => {
        if (!finished) finalize(enrichNodesWithDomMeasurements(getFlowNodes()));
      }, 320);
    });
  }, [
    snapshot.senders,
    snapshot.receivers,
    selectedHostKeys,
    expandedDeviceKeys,
    compactDeviceKeys,
    persistPositions,
    setNodes,
    toast,
  ]);

  const saveCurrentHostPreset = useCallback(() => {
    if (!singleHostKey) {
      toast('Select exactly one host from the Hosts panel', 'warning');
      return;
    }
    saveHostPreset(singleHostKey, {
      nodePositions,
      senderFilter,
      receiverFilter,
      showActiveOnly,
    });
    toast(`Preset saved for ${singleHostKey}`, 'success');
  }, [singleHostKey, nodePositions, senderFilter, receiverFilter, showActiveOnly, toast]);

  const loadCurrentHostPreset = useCallback(() => {
    if (!singleHostKey) {
      toast('Select exactly one host from the Hosts panel', 'warning');
      return;
    }
    const preset = loadHostPreset(singleHostKey);
    if (!preset) {
      toast('No preset saved for this host', 'warning');
      return;
    }
    if (preset.nodePositions) persistPositions(preset.nodePositions);
    if (preset.senderFilter != null) setSenderFilter(preset.senderFilter);
    if (preset.receiverFilter != null) setReceiverFilter(preset.receiverFilter);
    if (preset.showActiveOnly != null) setShowActiveOnly(preset.showActiveOnly);
    toast(`Preset loaded for ${singleHostKey}`, 'success');
  }, [singleHostKey, persistPositions, toast]);

  const bulkDisconnectHost = useCallback(async () => {
    if (!singleHostKey) {
      toast('Select exactly one host', 'warning');
      return;
    }
    const receivers = filterDevicesByHost(snapshot.receivers, singleHostKey);
    const uuids = receivers.flatMap((d) => (d.channels || []).map((c) => c.endpointUuid).filter(Boolean));
    if (uuids.length === 0) {
      toast('No receivers on this host', 'warning');
      return;
    }
    if (!window.confirm(`Disconnect ${uuids.length} receivers on ${singleHostKey}?`)) return;

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
  }, [singleHostKey, snapshot.receivers, blockPollingDuringMutation, fetchDevices, toast]);

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

  const handleMeasuredLayout = useCallback((positions) => {
    if (userLayoutRef.current) {
      setAutoMeasureLayout(false);
      return;
    }
    persistPositions(positions);
    setAutoMeasureLayout(false);
    setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.12, maxZoom: 1, duration: 350 }), 80);
  }, [persistPositions]);

  const handleNodesChange = useCallback((changes) => {
    onNodesChange(changes);
    changes.forEach((change) => {
      if (change.type === 'position') {
        if (change.dragging) draggingNodeIdsRef.current.add(change.id);
        else draggingNodeIdsRef.current.delete(change.id);

        if (change.position && !change.dragging && isValidSavedPosition(change.position)) {
          userLayoutRef.current = true;
          setAutoMeasureLayout(false);
          setNodePositions((prev) => {
            const updated = { ...prev, [change.id]: change.position };
            nodePositionsRef.current = updated;
            localStorage.setItem('ndi-multichannel-node-positions', JSON.stringify(updated));
            return updated;
          });
        }
      }
    });
  }, [onNodesChange]);

  useEffect(() => {
    if (loading) return;

    const nodeIds = [
      ...snapshot.senders.map((d) => `sender-device-${d.deviceKey}`),
      ...snapshot.receivers.map((d) => `receiver-device-${d.deviceKey}`),
    ];
    if (nodeIds.length === 0) return;

    const validSaved = nodeIds.filter((id) => isValidSavedPosition(nodePositionsRef.current[id])).length;

    if (!layoutSeededRef.current && validSaved === 0) {
      layoutSeededRef.current = true;
      userLayoutRef.current = false;
      setAutoMeasureLayout(true);
      persistPositions(computeDefaultLayout(snapshot.senders, snapshot.receivers, expandedDeviceKeys, compactDeviceKeys));
      return;
    }

    if (validSaved < nodeIds.length) {
      const merged = mergeLayoutWithNewDevices(
        nodePositionsRef.current,
        snapshot.senders,
        snapshot.receivers,
        expandedDeviceKeys,
        compactDeviceKeys,
      );
      const changed = nodeIds.some((id) => {
        const before = nodePositionsRef.current[id];
        const after = merged[id];
        if (!isValidSavedPosition(before)) return after != null;
        return before.x !== after?.x || before.y !== after?.y;
      });
      if (changed) persistPositions(merged);
    }

    layoutSeededRef.current = true;
  }, [
    loading,
    snapshot.senders,
    snapshot.receivers,
    expandedDeviceKeys,
    persistPositions,
    compactDeviceKeys,
  ]);

  useEffect(() => {
    try {
      if (localStorage.getItem('ndi-multichannel-layout-version') !== NODE_LAYOUT_VERSION) return;
      const saved = JSON.parse(localStorage.getItem('ndi-multichannel-node-positions') || '{}');
      if (Object.values(saved).some(isValidSavedPosition)) {
        userLayoutRef.current = true;
        setAutoMeasureLayout(false);
      }
    } catch {
      // Ignore malformed layout cache.
    }
  }, []);

  const onConnectStart = useCallback((_evt, params) => {
    const { sourceName } = resolveConnectionDetails(params, snapshot);
    setConnectPreview({ x: _evt.clientX, y: _evt.clientY, sourceName: sourceName || '—' });
  }, [snapshot, resolveConnectionDetails]);

  const onConnectEnd = useCallback(() => {
    setConnectPreview(null);
  }, []);

  const onConnect = useCallback(async (params) => {
    setConnectPreview(null);
    const details = resolveConnectionDetails(params, snapshot);
    const { sourceName, receiverUuid } = details;
    if (!receiverUuid || !sourceName) return;

    blockPollingDuringMutation();
    markPendingReceiver(receiverUuid);
    rememberOptimisticConnection(details);
    try {
      const response = await axios.post(`${API_BASE}/connect`, { receiverUuid, sourceName });
      if (!response?.data?.success) {
        clearOptimisticConnection(receiverUuid);
        toast(`Connect failed: ${response?.data?.message ?? 'error'}`, 'error');
      } else {
        toast(`Connect sent → ${sourceName}`, 'success');
        fetchDevices(true);
      }
    } catch {
      clearOptimisticConnection(receiverUuid);
      toast('Connect error', 'error');
    } finally {
      setTimeout(() => fetchDevices(true), 400);
      setTimeout(() => fetchDevices(true), 1200);
    }
  }, [
    snapshot,
    fetchDevices,
    blockPollingDuringMutation,
    resolveConnectionDetails,
    markPendingReceiver,
    rememberOptimisticConnection,
    clearOptimisticConnection,
    toast,
  ]);

  const onEdgesDelete = useCallback(async (edgesToDelete) => {
    blockPollingDuringMutation();
    for (const edge of edgesToDelete) {
      const receiverUuid = edge?.data?.receiverUuid;
      if (!receiverUuid) continue;
      clearOptimisticConnection(receiverUuid);
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
  }, [fetchDevices, blockPollingDuringMutation, suppressReceiverConnection, clearOptimisticConnection, toast]);

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
    rememberOptimisticConnection(resolveConnectionDetails(newConnection, snapshot));
    if (oldReceiverUuid && oldReceiverUuid !== newReceiverUuid) {
      clearOptimisticConnection(oldReceiverUuid);
      suppressReceiverConnection(oldReceiverUuid);
    }
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
  }, [
    snapshot,
    fetchDevices,
    blockPollingDuringMutation,
    resolveConnectionDetails,
    suppressReceiverConnection,
    markPendingReceiver,
    rememberOptimisticConnection,
    clearOptimisticConnection,
    toast,
  ]);

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

  useEffect(() => {
    let filteredSenders = snapshot.senders.filter((device) =>
      matchesFilterQuery(buildDeviceSearchText(device), senderFilter));
    let filteredReceivers = snapshot.receivers.filter((device) =>
      matchesFilterQuery(buildDeviceSearchText(device), receiverFilter));

    filteredSenders = filterDevicesByHost(filteredSenders, selectedHostKeys);
    filteredReceivers = filterDevicesByHost(filteredReceivers, selectedHostKeys);

    if (showActiveOnly) {
      filteredSenders = filteredSenders.filter(deviceHasActivity);
      filteredReceivers = filteredReceivers.filter(deviceHasActivity);
    }

    const senderByDeviceKey = new Map(filteredSenders.map((d) => [d.deviceKey, d]));
    const receiverByDeviceKey = new Map(filteredReceivers.map((d) => [d.deviceKey, d]));

    const snapshotConnectionIds = new Set(
      snapshot.connections.map((conn) => conn.receiverUuid?.toLowerCase()).filter(Boolean),
    );
    optimisticConnectionsRef.current.forEach((conn, receiverUuid) => {
      if (snapshotConnectionIds.has(receiverUuid.toLowerCase())) {
        optimisticConnectionsRef.current.delete(receiverUuid);
      }
    });

    const mergedConnections = [...snapshot.connections];
    optimisticConnectionsRef.current.forEach((conn) => {
      const exists = mergedConnections.some(
        (existing) => existing.receiverUuid?.toLowerCase() === conn.receiverUuid?.toLowerCase(),
      );
      if (!exists) mergedConnections.push(conn);
    });

    const connectedByDeviceKey = new Map();
    mergedConnections.forEach((conn) => {
      const add = (deviceKey, channelId) => {
        if (!deviceKey || !channelId) return;
        if (!connectedByDeviceKey.has(deviceKey)) connectedByDeviceKey.set(deviceKey, new Set());
        connectedByDeviceKey.get(deviceKey).add(channelId);
      };
      add(conn.senderDeviceKey, conn.senderChannelId);
      add(conn.receiverDeviceKey, conn.receiverChannelId);
    });

    const visibleConnections = mergedConnections.filter((conn) => {
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

    const stackedLayout = computeDefaultLayout(snapshot.senders, snapshot.receivers, expandedDeviceKeys, compactDeviceKeys);
    const resolvePosition = (nodeId) => {
      const saved = nodePositionsRef.current[nodeId];
      if (isValidSavedPosition(saved)) return saved;
      return stackedLayout[nodeId] || { x: 80, y: 120 };
    };

    const resolveNodePosition = (nodeId, node) => {
      if (draggingNodeIdsRef.current.has(nodeId) && isValidSavedPosition(node?.position)) {
        return node.position;
      }
      return resolvePosition(nodeId);
    };

    const buildNodeData = (device, rolePrefix) => {
      const nodeId = `${rolePrefix}-device-${device.deviceKey}`;
      const channelCount = device.channels?.length || 0;
      const isCollapsed = device.isBridgeHub
        ? (channelCount > 1 ? !expandedDeviceKeys.has(nodeId) : false)
        : channelCount > COLLAPSE_CHANNELS_THRESHOLD && !expandedDeviceKeys.has(nodeId);
      return {
        ...device,
        isAggregated: true,
        isCollapsed,
        maxVisibleHandles: MAX_VISIBLE_HANDLES_WHEN_COLLAPSED,
        connectedChannelIds: connectedByDeviceKey.get(device.deviceKey) || new Set(),
        logicalConnectionCount: logicalConnectionsByDeviceKey.get(device.deviceKey) || 0,
        compactView: compactDeviceKeys.has(nodeId),
        onToggleCompactView: () => toggleCompactDevice(nodeId),
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

    const senderNodes = filteredSenders.map((device) => {
      const nodeId = `sender-device-${device.deviceKey}`;
      return {
        id: nodeId,
        type: 'senderNode',
        dragHandle: '.node-drag-handle',
        position: resolveNodePosition(nodeId, undefined),
        data: buildNodeData(device, 'sender'),
      };
    });

    const receiverNodes = filteredReceivers.map((device) => {
      const nodeId = `receiver-device-${device.deviceKey}`;
      return {
        id: nodeId,
        type: 'receiverNode',
        dragHandle: '.node-drag-handle',
        position: resolveNodePosition(nodeId, undefined),
        data: buildNodeData(device, 'receiver'),
      };
    });

    const nextNodes = [...senderNodes, ...receiverNodes];
    const structureKey = buildCanvasStructureKey({
      filteredSenders,
      filteredReceivers,
      visibleConnections,
      selectedHostKeys,
      senderFilter,
      receiverFilter,
      showActiveOnly,
      expandedDeviceKeys,
      compactDeviceKeys,
    });
    const structureChanged = structureKey !== canvasStructureKeyRef.current;
    canvasStructureKeyRef.current = structureKey;

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
        const confirmed = isConnectionConfirmed(conn, snapshot);
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

    if (!structureChanged) {
      setNodes((prev) => {
        if (prev.length === 0 && nextNodes.length > 0) return nextNodes;
        const nextById = new Map(nextNodes.map((n) => [n.id, n]));
        return prev.map((node) => {
          const fresh = nextById.get(node.id);
          if (!fresh) return node;
          const keepDragPosition = node.position && draggingNodeIdsRef.current.has(node.id);
          return {
            ...node,
            data: fresh.data,
            position: keepDragPosition ? node.position : resolvePosition(node.id),
          };
        });
      });
      setEdges((prev) => mergeEdges(prev, nextEdges));
      if (isFirstLoad && nextNodes.length > 0) setIsFirstLoad(false);
      return;
    }

    setNodes((prev) => mergeNodes(prev, nextNodes, draggingNodeIdsRef.current));
    setEdges((prev) => mergeEdges(prev, nextEdges));
    if (isFirstLoad && nextNodes.length > 0) setIsFirstLoad(false);
  }, [
    snapshot,
    setNodes,
    setEdges,
    isFirstLoad,
    isReceiverConnectionSuppressed,
    senderFilter,
    receiverFilter,
    selectedHostKeys,
    showActiveOnly,
    expandedDeviceKeys,
    toggleDeviceExpanded,
    handleChannelSelect,
    pendingEpoch,
    isReceiverPending,
    compactDeviceKeys,
    toggleCompactDevice,
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
            {hostFilterLabel
              ? `${selectedHostKeys.size > 1 ? 'Hosts' : 'Host'}: ${hostFilterLabel}`
              : 'Multichannel — select a host from the sidebar'}
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
            {mainTab === 'canvas' ? (
              <button
                type="button"
                style={styles.viewBtn(viewMode === 'flow')}
                onClick={() => setViewMode((v) => (v === 'flow' ? 'overview' : 'flow'))}
              >
                {viewMode === 'flow' ? 'Show hosts' : 'Canvas only'}
              </button>
            ) : null}
            <label style={styles.checkLabel}>
              <input type="checkbox" checked={showActiveOnly} onChange={(e) => setShowActiveOnly(e.target.checked)} />
              Active only
            </label>
            <button type="button" style={styles.viewBtn(false)} onClick={() => setShowLegend(true)} title="Metrics legend">
              ℹ️
            </button>
          </div>
          {mainTab === 'canvas' ? (
            <div style={styles.toolbar}>
              <button type="button" style={styles.viewBtn(false)} onClick={resetLayout}>Reset layout</button>
              <button type="button" style={styles.viewBtn(false)} onClick={alignLayoutByHost}>Align by host</button>
              {singleHostKey ? (
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
        {mainTab === 'canvas' && viewMode === 'overview' && (
          <HostOverview
            hostGroups={hostGroups}
            selectedHostKeys={selectedHostKeys}
            onHostClick={handleHostClick}
            onClearHostSelection={clearHostSelection}
            totalSenders={snapshot.senders.length}
            totalReceivers={snapshot.receivers.length}
          />
        )}

        {mainTab === 'canvas' ? (
          <div style={styles.flowPane}>
            {showLegend ? <MetricsLegend onClose={dismissLegend} /> : null}
            <ReactFlowProvider>
              <AutoMeasureLayout
                enabled={autoMeasureLayout}
                senders={snapshot.senders}
                receivers={snapshot.receivers}
                expandedDeviceKeys={expandedDeviceKeys}
                expandedLayoutEpoch={expandedLayoutEpoch}
                onLayout={handleMeasuredLayout}
              />
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
                selectNodesOnDrag={false}
                nodeDragThreshold={2}
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
            selectedHostKeys={selectedHostKeys}
            onDisconnect={disconnectReceiver}
            onSelectRow={handleChannelSelect}
          />
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
          v{systemStatus?.appVersion || '3.2.0'}
          {systemStatus?.lastDiscoveryAt
            ? ` · updated ${new Date(systemStatus.lastDiscoveryAt).toLocaleTimeString('en-US')}`
            : ''}
        </span>
        <span>{bundleLabel}</span>
      </div>
    </div>
  );
}
