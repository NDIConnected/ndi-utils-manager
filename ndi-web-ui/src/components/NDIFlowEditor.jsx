import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
} from '@xyflow/react';
import SenderNode from './SenderNode';
import ReceiverNode from './ReceiverNode';
import CustomEdge from './CustomEdge';
import HostOverview from './HostOverview';
import MetricsLegend from './MetricsLegend';
import ChannelDetailDrawer from './ChannelDetailDrawer';
import NdiTableView from './NdiTableView';
import AutoMeasureLayout from './AutoMeasureLayout';
import { styles } from './NDIFlowEditor.styles';
import { useToast } from '../context/useToast';
import { useNdiSnapshot } from '../hooks/useNdiSnapshot';
import { useRouting } from '../hooks/useRouting';
import { useCanvasLayout } from '../hooks/useCanvasLayout';
import { buildHostGroups } from '../utils/deviceGrouping';
import { buildViewModeMap, computeDefaultLayout, getBundleLabel } from '../utils/layoutUtils';
import { filterSnapshotDevices } from '../utils/flowFilters';
import { resolveConnectionDetails } from '../utils/routing';
import {
  buildFlowGraph,
  buildCanvasStructureKey,
  confirmedOptimisticReceivers,
  mergeNodes,
  mergeEdges,
  refreshNodes,
  shouldHoldPreviousGraph,
} from '../utils/flowGraph';

const LINK_LABELS = {
  live: 'Live',
  reconnecting: 'Reconnecting…',
  polling: 'Polling',
  offline: 'Offline',
};
const LINK_TITLES = {
  live: 'Real-time updates (SignalR) connected',
  reconnecting: 'Real-time channel reconnecting; polling every 2 s meanwhile',
  polling: 'Real-time channel unavailable; polling every 2 s',
  offline: 'Backend unreachable; showing last known state',
};

const COMPACT_KEYS_STORAGE = 'ndi-compact-device-keys';
const MINIMIZED_KEYS_STORAGE = 'ndi-minimized-device-keys';

function loadKeySet(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveKeySet(storageKey, set) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...set]));
  } catch {
    // Storage unavailable: the view still applies for this session.
  }
}

function toggleInSet(set, key) {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

function FlowCanvas(props) {
  return <ReactFlow {...props} />;
}

/**
 * Main screen: header/toolbar, host sidebar, React Flow canvas and table view.
 * Data, routing commands and layout live in hooks (useNdiSnapshot, useRouting, useCanvasLayout);
 * the graph itself is built by the pure buildFlowGraph().
 */
export default function NDIFlowEditor() {
  const { push: toast } = useToast();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // ---- view state
  const [senderFilter, setSenderFilter] = useState('');
  const [receiverFilter, setReceiverFilter] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [mainTab, setMainTab] = useState('canvas');
  const [viewMode, setViewMode] = useState('overview');
  const [selectedHostKeys, setSelectedHostKeys] = useState(() => new Set());
  const [showLegend, setShowLegend] = useState(() => localStorage.getItem('ndi-metrics-legend-seen') !== '1');
  const [compactDeviceKeys, setCompactDeviceKeys] = useState(() => loadKeySet(COMPACT_KEYS_STORAGE));
  // One-line cards (role + "HOST (Stream)"); wins over compact/detailed while set.
  const [minimizedDeviceKeys, setMinimizedDeviceKeys] = useState(() => loadKeySet(MINIMIZED_KEYS_STORAGE));
  const layoutViewModes = useMemo(
    () => buildViewModeMap(compactDeviceKeys, minimizedDeviceKeys),
    [compactDeviceKeys, minimizedDeviceKeys],
  );
  const [expandedDeviceKeys, setExpandedDeviceKeys] = useState(() => new Set());
  const [channelDetail, setChannelDetail] = useState(null);
  const [connectPreview, setConnectPreview] = useState(null);
  const rfInstanceRef = useRef(null);
  const canvasStructureKeyRef = useRef('');
  // Content-keyed caches used by buildFlowGraph (unchanged devices/edges keep the same objects).
  const nodeDataCacheRef = useRef(new Map());
  const edgeCacheRef = useRef(new Map());
  const visibleConnectionsRef = useRef([]);

  const singleHostKey = selectedHostKeys.size === 1 ? [...selectedHostKeys][0] : null;

  // ---- data, routing, layout
  const {
    snapshot,
    systemStatus,
    loading,
    error,
    backendOfflineSince,
    linkState,
    fetchDevices,
    fetchStatus,
    blockPollingDuringMutation,
  } = useNdiSnapshot();

  const routing = useRouting({ snapshot, fetchDevices, blockPollingDuringMutation, toast, singleHostKey });
  const { optimisticRef, forgetOptimistic, isReceiverConnectionSuppressed } = routing;

  const presetFilters = useMemo(
    () => ({ senderFilter, receiverFilter, showActiveOnly }),
    [senderFilter, receiverFilter, showActiveOnly],
  );
  const applyPresetFilters = useCallback((preset) => {
    if (preset.senderFilter != null) setSenderFilter(preset.senderFilter);
    if (preset.receiverFilter != null) setReceiverFilter(preset.receiverFilter);
    if (preset.showActiveOnly != null) setShowActiveOnly(preset.showActiveOnly);
  }, []);

  const layout = useCanvasLayout({
    snapshot,
    loading,
    selectedHostKeys,
    singleHostKey,
    expandedDeviceKeys,
    compactDeviceKeys: layoutViewModes,
    filters: presetFilters,
    applyFilters: applyPresetFilters,
    setNodes,
    onNodesChange,
    rfInstanceRef,
    toast,
  });
  const { resolvePosition, draggingNodeIdsRef, requestAutoLayout, relayoutAfterResize } = layout;

  // ---- derived view data
  const nodeTypes = useMemo(() => ({ senderNode: SenderNode, receiverNode: ReceiverNode }), []);
  const edgeTypes = useMemo(() => ({ custom: CustomEdge }), []);
  const hostGroups = useMemo(() => buildHostGroups(snapshot), [snapshot]);
  const bundleLabel = useMemo(() => getBundleLabel(), []);
  const hostFilterLabel = useMemo(() => {
    if (selectedHostKeys.size === 0) return null;
    return [...selectedHostKeys].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).join(', ');
  }, [selectedHostKeys]);

  // ---- view actions
  const handleHostClick = useCallback((hostKey, event) => {
    const multiSelect = event?.ctrlKey || event?.metaKey;
    setSelectedHostKeys((prev) => (multiSelect ? toggleInSet(prev, hostKey) : new Set([hostKey])));
  }, []);

  const clearHostSelection = useCallback(() => setSelectedHostKeys(new Set()), []);

  const toggleCompactDevice = useCallback((nodeId) => {
    setCompactDeviceKeys((prev) => {
      const next = toggleInSet(prev, nodeId);
      saveKeySet(COMPACT_KEYS_STORAGE, next);
      return next;
    });
    requestAutoLayout();
  }, [requestAutoLayout]);

  const toggleMinimizedDevice = useCallback((nodeId) => {
    setMinimizedDeviceKeys((prev) => {
      const next = toggleInSet(prev, nodeId);
      saveKeySet(MINIMIZED_KEYS_STORAGE, next);
      return next;
    });
    relayoutAfterResize();
  }, [relayoutAfterResize]);

  /** Toolbar: minimize every card on the canvas, or restore them all when they already are. */
  const visibleNodeIds = useMemo(() => nodes.map((n) => n.id), [nodes]);
  const allMinimized = visibleNodeIds.length > 0 && visibleNodeIds.every((id) => minimizedDeviceKeys.has(id));
  const toggleMinimizeAll = useCallback(() => {
    setMinimizedDeviceKeys((prev) => {
      const next = new Set(prev);
      if (allMinimized) visibleNodeIds.forEach((id) => next.delete(id));
      else visibleNodeIds.forEach((id) => next.add(id));
      saveKeySet(MINIMIZED_KEYS_STORAGE, next);
      return next;
    });
    relayoutAfterResize();
  }, [allMinimized, visibleNodeIds, relayoutAfterResize]);

  const toggleDeviceExpanded = useCallback((nodeId) => {
    setExpandedDeviceKeys((prev) => toggleInSet(prev, nodeId));
    requestAutoLayout();
  }, [requestAutoLayout]);

  const handleChannelSelect = useCallback((detail) => setChannelDetail(detail), []);

  const dismissLegend = useCallback(() => {
    setShowLegend(false);
    localStorage.setItem('ndi-metrics-legend-seen', '1');
  }, []);

  const onConnectStart = useCallback((evt, params) => {
    const { sourceName } = resolveConnectionDetails(params, snapshot);
    setConnectPreview({ x: evt.clientX, y: evt.clientY, sourceName: sourceName || '—' });
  }, [snapshot]);

  const onConnectEnd = useCallback(() => setConnectPreview(null), []);

  const { connect } = routing;
  const onConnect = useCallback((params) => {
    setConnectPreview(null);
    return connect(params);
  }, [connect]);

  // Callbacks stored in node/edge data (only created when a device's content changes).
  const createNodeCallbacks = useCallback(({ nodeId, device, role }) => ({
    onToggleCompactView: () => toggleCompactDevice(nodeId),
    onToggleMinimized: () => toggleMinimizedDevice(nodeId),
    onToggleExpand: () => toggleDeviceExpanded(nodeId),
    onChannelSelect: (channel) => handleChannelSelect({ device, channel, role }),
    onFocusConnections: () => {
      // Read through a ref: cached data may outlive the snapshot it was built from.
      const related = visibleConnectionsRef.current.find((c) =>
        (role === 'sender' ? c.senderDeviceKey : c.receiverDeviceKey) === device.deviceKey);
      if (!related) return;
      rfInstanceRef.current?.fitView({
        nodes: [
          { id: `sender-device-${related.senderDeviceKey}` },
          { id: `receiver-device-${related.receiverDeviceKey}` },
        ],
        padding: 0.35,
        duration: 350,
      });
    },
  }), [toggleCompactDevice, toggleMinimizedDevice, toggleDeviceExpanded, handleChannelSelect]);

  const createEdgeFocus = useCallback((sourceNodeId, targetNodeId) => () => {
    rfInstanceRef.current?.fitView({
      nodes: [{ id: sourceNodeId }, { id: targetNodeId }],
      padding: 0.35,
      duration: 350,
    });
  }, []);

  const backendHealth = systemStatus?.health ?? null;

  // ---- snapshot / view state → React Flow nodes and edges
  useEffect(() => {
    const viewFilters = { senderFilter, receiverFilter, selectedHostKeys, showActiveOnly };
    const { filteredSenders, filteredReceivers } = filterSnapshotDevices(snapshot, viewFilters);

    forgetOptimistic(confirmedOptimisticReceivers(snapshot.connections, optimisticRef.current));

    const stackedLayout = computeDefaultLayout(snapshot.senders, snapshot.receivers, expandedDeviceKeys, layoutViewModes);
    const positionOf = (nodeId) => resolvePosition(nodeId, stackedLayout);

    const { nodes: nextNodes, edges: nextEdges, visibleConnections } = buildFlowGraph({
      snapshot,
      filteredSenders,
      filteredReceivers,
      optimisticConnections: [...optimisticRef.current.values()],
      isReceiverSuppressed: isReceiverConnectionSuppressed,
      expandedDeviceKeys,
      compactDeviceKeys,
      minimizedDeviceKeys,
      resolvePosition: positionOf,
      nodeDataCache: nodeDataCacheRef.current,
      edgeCache: edgeCacheRef.current,
      createNodeCallbacks,
      createEdgeFocus,
    });
    visibleConnectionsRef.current = visibleConnections;

    // Hold the last graph only while an empty snapshot is unconfirmed (backend restarting); once the
    // network is confirmed empty (last device gone), clear the canvas instead of showing stale cards.
    const holdPreviousGraph = shouldHoldPreviousGraph(snapshot, backendHealth);
    const structureKey = holdPreviousGraph ? 'held-while-unconfirmed' : buildCanvasStructureKey({
      filteredSenders,
      filteredReceivers,
      visibleConnections,
      expandedDeviceKeys,
      compactDeviceKeys,
      minimizedDeviceKeys,
      ...viewFilters,
    });
    const structureChanged = structureKey !== canvasStructureKeyRef.current;
    canvasStructureKeyRef.current = structureKey;

    if (structureChanged) {
      setNodes((prev) => mergeNodes(prev, nextNodes, draggingNodeIdsRef.current, holdPreviousGraph));
    } else {
      setNodes((prev) => refreshNodes(prev, nextNodes, draggingNodeIdsRef.current, positionOf));
    }
    setEdges((prev) => mergeEdges(prev, nextEdges, holdPreviousGraph));
  }, [
    snapshot,
    backendHealth,
    senderFilter,
    receiverFilter,
    selectedHostKeys,
    showActiveOnly,
    expandedDeviceKeys,
    compactDeviceKeys,
    minimizedDeviceKeys,
    layoutViewModes,
    routing.epoch,
    optimisticRef,
    forgetOptimistic,
    isReceiverConnectionSuppressed,
    resolvePosition,
    draggingNodeIdsRef,
    createNodeCallbacks,
    createEdgeFocus,
    setNodes,
    setEdges,
  ]);

  // Follow the mouse while dragging a new connection (listener only while a drag is active).
  const isConnecting = connectPreview != null;
  useEffect(() => {
    if (!isConnecting) return undefined;
    const move = (e) => setConnectPreview((p) => (p ? { ...p, x: e.clientX, y: e.clientY } : p));
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, [isConnecting]);

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
  const linkLabel = LINK_LABELS[linkState];
  const linkTitle = LINK_TITLES[linkState];
  const discoveryLabel = systemStatus
    ? `${systemStatus.sendListenerConnected && systemStatus.recvListenerConnected ? 'Discovery OK' : 'Discovery partial'} · ${systemStatus.senderCount} snd · ${systemStatus.receiverCount} rcv`
    : 'Discovery…';
  const {
    resetLayout,
    alignLayoutByHost,
    saveCurrentHostPreset,
    loadCurrentHostPreset,
    handleMeasuredLayout,
    handleNodesChange,
  } = layout;
  const {
    bulkDisconnectHost,
    disconnectReceiver,
    disconnectEdges: onEdgesDelete,
    onReconnectStart,
    onReconnect,
    onReconnectEnd,
  } = routing;

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
          <span style={styles.linkPill(linkState)} title={linkTitle}>
            ● {linkLabel}
          </span>
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
              <button
                type="button"
                style={styles.viewBtn(allMinimized)}
                onClick={toggleMinimizeAll}
                disabled={visibleNodeIds.length === 0}
                title={allMinimized
                  ? 'Restore every card on the canvas'
                  : 'Shrink every card on the canvas to one line (role + HOST (Stream)). Per card: chevron or double-click the header.'}
              >
                {allMinimized ? '▾ Expand all' : '▴ Minimize all'}
              </button>
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

      {backendOfflineSince && (
        <div style={styles.offlineBanner} role="status">
          Backend unreachable since {backendOfflineSince.toLocaleTimeString('en-US')} — showing last known state.
          Reconnecting automatically…
        </div>
      )}

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
                enabled={layout.autoMeasureLayout}
                senders={snapshot.senders}
                receivers={snapshot.receivers}
                expandedDeviceKeys={expandedDeviceKeys}
                expandedLayoutEpoch={layout.layoutEpoch}
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
                // Queued once at mount and applied when the first nodes are measured.
                fitView
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
