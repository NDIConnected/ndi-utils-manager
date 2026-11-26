import { useCallback, useEffect, useRef, useState } from 'react';
import { filterDevicesByHost } from '../utils/deviceGrouping';
import { samePosition, senderNodeId, receiverNodeId } from '../utils/flowGraph';
import {
  computeDefaultLayout,
  computeHostAlignedLayout,
  collectLayoutHostKeys,
  enrichNodesWithDomMeasurements,
  saveHostPreset,
  loadHostPreset,
  mergeLayoutWithNewDevices,
  isValidSavedPosition,
  repackColumns,
} from '../utils/layoutUtils';

const NODE_LAYOUT_VERSION = '11';
const POSITIONS_KEY = 'ndi-multichannel-node-positions';
const LAYOUT_VERSION_KEY = 'ndi-multichannel-layout-version';

function savePositions(positions) {
  try {
    localStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
  } catch {
    // Storage full or unavailable: layout still applies for this session.
  }
}

function loadInitialPositions() {
  try {
    if (localStorage.getItem(LAYOUT_VERSION_KEY) !== NODE_LAYOUT_VERSION) {
      localStorage.setItem(LAYOUT_VERSION_KEY, NODE_LAYOUT_VERSION);
      localStorage.removeItem(POSITIONS_KEY);
      return {};
    }
    const saved = localStorage.getItem(POSITIONS_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function hasSavedLayout() {
  try {
    if (localStorage.getItem(LAYOUT_VERSION_KEY) !== NODE_LAYOUT_VERSION) return false;
    const saved = JSON.parse(localStorage.getItem(POSITIONS_KEY) || '{}');
    return Object.values(saved).some(isValidSavedPosition);
  } catch {
    return false;
  }
}

/**
 * Node positions on the canvas: persistence (localStorage), seeding/placing new devices,
 * drag tracking, auto (measured) layout and the layout toolbar actions.
 */
export function useCanvasLayout({
  snapshot,
  loading,
  selectedHostKeys,
  singleHostKey,
  expandedDeviceKeys,
  compactDeviceKeys,
  filters,
  applyFilters,
  setNodes,
  onNodesChange,
  rfInstanceRef,
  toast,
}) {
  // Order matters: loadInitialPositions clears positions saved by an older layout version first.
  const [nodePositions, setNodePositions] = useState(loadInitialPositions);
  const [initialHasSavedLayout] = useState(hasSavedLayout);
  const [autoMeasureLayout, setAutoMeasureLayout] = useState(!initialHasSavedLayout);
  const [layoutEpoch, setLayoutEpoch] = useState(0);
  const nodePositionsRef = useRef(nodePositions);
  const draggingNodeIdsRef = useRef(new Set());
  const layoutSeededRef = useRef(false);
  // True once the user arranged nodes (drag, align, preset): auto layout must not override it.
  const userLayoutRef = useRef(initialHasSavedLayout);

  useEffect(() => {
    nodePositionsRef.current = nodePositions;
  }, [nodePositions]);

  /** Saved position, or a default stacked slot for devices never placed. */
  const resolvePosition = useCallback((nodeId, fallbackLayout) => {
    const saved = nodePositionsRef.current[nodeId];
    if (isValidSavedPosition(saved)) return saved;
    return fallbackLayout?.[nodeId] || { x: 80, y: 120 };
  }, []);

  const applyPositionsToFlow = useCallback((positions) => {
    setNodes((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const next = prev.map((node) => {
        const nextPos = positions[node.id];
        if (!nextPos || samePosition(node.position, nextPos)) return node;
        changed = true;
        return { ...node, position: { x: nextPos.x, y: nextPos.y } };
      });
      return changed ? next : prev;
    });
  }, [setNodes]);

  /** Saves positions and moves nodes now. merge=true keeps nodes not in `positions` where they are. */
  const persistPositions = useCallback((positions, { merge = false } = {}) => {
    const next = merge ? { ...nodePositionsRef.current, ...positions } : positions;
    nodePositionsRef.current = next;
    setNodePositions(next);
    savePositions(next);
    applyPositionsToFlow(positions);
  }, [applyPositionsToFlow]);

  /** After expand/compact toggles: re-run the measured layout unless the user arranged nodes. */
  const requestAutoLayout = useCallback(() => {
    if (userLayoutRef.current) return;
    setAutoMeasureLayout(true);
    setLayoutEpoch((epoch) => epoch + 1);
  }, []);

  /**
   * After cards change size (minimize / expand): without a user layout, re-run the measured auto layout;
   * with one, "accordion" re-pack each column (same order and columns, no gaps or overlaps).
   */
  const relayoutAfterResize = useCallback(() => {
    if (!userLayoutRef.current) {
      requestAutoLayout();
      return;
    }
    let attempts = 0;
    const run = () => {
      const inst = rfInstanceRef.current;
      const nodes = inst?.getNodes?.() ?? [];
      if (nodes.length === 0) return;
      // offsetHeight = layout size, unaffected by the canvas zoom transform.
      const boxes = nodes.map((node) => {
        const el = document.querySelector(`.react-flow__node[data-id="${CSS.escape(node.id)}"]`);
        return { id: node.id, x: node.position.x, y: node.position.y, height: el?.offsetHeight ?? 0 };
      });
      if (boxes.some((b) => b.height <= 0) && attempts++ < 10) {
        requestAnimationFrame(run);
        return;
      }
      persistPositions(repackColumns(boxes.filter((b) => b.height > 0)), { merge: true });
    };
    // Let React render the new card size first.
    requestAnimationFrame(() => requestAnimationFrame(run));
  }, [requestAutoLayout, rfInstanceRef, persistPositions]);

  const fitView = useCallback((padding, delay) => {
    setTimeout(() => rfInstanceRef.current?.fitView({ padding, maxZoom: 1, duration: 350 }), delay);
  }, [rfInstanceRef]);

  const resetLayout = useCallback(() => {
    userLayoutRef.current = false;
    setAutoMeasureLayout(true);
    persistPositions(computeDefaultLayout(snapshot.senders, snapshot.receivers, expandedDeviceKeys, compactDeviceKeys));
    toast('Layout reset', 'success');
    fitView(0.15, 100);
  }, [snapshot.senders, snapshot.receivers, expandedDeviceKeys, compactDeviceKeys, persistPositions, toast, fitView]);

  const alignLayoutByHost = useCallback(() => {
    userLayoutRef.current = false;
    setAutoMeasureLayout(false);

    const partial = selectedHostKeys.size > 0; // only the selected hosts are laid out
    const senders = partial ? filterDevicesByHost(snapshot.senders, selectedHostKeys) : snapshot.senders;
    const receivers = partial ? filterDevicesByHost(snapshot.receivers, selectedHostKeys) : snapshot.receivers;
    const hostKeys = collectLayoutHostKeys(senders, receivers);

    const updateAllNodeInternals = () => {
      const inst = rfInstanceRef.current;
      if (!inst?.updateNodeInternals) return;
      (inst.getNodes?.() ?? []).forEach((node) => inst.updateNodeInternals(node.id));
    };
    const getFlowNodes = () => rfInstanceRef.current?.getNodes?.() ?? [];
    const nodesReadyForMeasure = (nodes) =>
      nodes.length > 0 && nodes.every((node) => (node.measured?.height ?? 0) >= 80);

    const applyHostLayout = (nodes = null) => {
      const enrichedNodes = nodes?.length ? enrichNodesWithDomMeasurements(nodes) : null;
      const positions = computeHostAlignedLayout(
        senders, receivers, expandedDeviceKeys, compactDeviceKeys, enrichedNodes, hostKeys,
      );
      persistPositions(positions, { merge: partial });
    };

    // First pass with estimated heights, then again once React Flow has measured the real cards.
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
      fitView(0.12, 120);
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
  }, [snapshot.senders, snapshot.receivers, selectedHostKeys, expandedDeviceKeys, compactDeviceKeys, persistPositions, rfInstanceRef, toast, fitView]);

  const saveCurrentHostPreset = useCallback(() => {
    if (!singleHostKey) {
      toast('Select exactly one host from the Hosts panel', 'warning');
      return;
    }
    saveHostPreset(singleHostKey, { nodePositions, ...filters });
    toast(`Preset saved for ${singleHostKey}`, 'success');
  }, [singleHostKey, nodePositions, filters, toast]);

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
    if (preset.nodePositions) {
      // Restore only this host's nodes; other hosts keep their current layout.
      const hostNodeIds = new Set([
        ...filterDevicesByHost(snapshot.senders, singleHostKey).map((d) => senderNodeId(d.deviceKey)),
        ...filterDevicesByHost(snapshot.receivers, singleHostKey).map((d) => receiverNodeId(d.deviceKey)),
      ]);
      const hostPositions = Object.fromEntries(
        Object.entries(preset.nodePositions).filter(([id]) => hostNodeIds.has(id)),
      );
      userLayoutRef.current = true;
      setAutoMeasureLayout(false);
      persistPositions(hostPositions, { merge: true });
    }
    applyFilters(preset);
    toast(`Preset loaded for ${singleHostKey}`, 'success');
  }, [singleHostKey, snapshot.senders, snapshot.receivers, persistPositions, applyFilters, toast]);

  const handleMeasuredLayout = useCallback((positions) => {
    if (userLayoutRef.current) {
      setAutoMeasureLayout(false);
      return;
    }
    persistPositions(positions);
    setAutoMeasureLayout(false);
    fitView(0.12, 80);
  }, [persistPositions, fitView]);

  /** Wraps React Flow's onNodesChange to track drags and persist dropped positions. */
  const handleNodesChange = useCallback((changes) => {
    onNodesChange(changes);
    changes.forEach((change) => {
      if (change.type !== 'position') return;
      if (change.dragging) draggingNodeIdsRef.current.add(change.id);
      else draggingNodeIdsRef.current.delete(change.id);

      if (change.position && !change.dragging && isValidSavedPosition(change.position)) {
        userLayoutRef.current = true;
        setAutoMeasureLayout(false);
        setNodePositions((prev) => {
          const updated = { ...prev, [change.id]: change.position };
          nodePositionsRef.current = updated;
          savePositions(updated);
          return updated;
        });
      }
    });
  }, [onNodesChange]);

  // Seed a layout on first load; place newly discovered devices without overlapping existing ones.
  useEffect(() => {
    if (loading) return;
    const nodeIds = [
      ...snapshot.senders.map((d) => senderNodeId(d.deviceKey)),
      ...snapshot.receivers.map((d) => receiverNodeId(d.deviceKey)),
    ];
    if (nodeIds.length === 0) return;

    const validSaved = nodeIds.filter((id) => isValidSavedPosition(nodePositionsRef.current[id])).length;

    if (!layoutSeededRef.current && validSaved === 0) {
      layoutSeededRef.current = true;
      userLayoutRef.current = false;
      // Syncing with newly arrived backend data: first layout for a fresh canvas.
      setAutoMeasureLayout(true);
      persistPositions(computeDefaultLayout(snapshot.senders, snapshot.receivers, expandedDeviceKeys, compactDeviceKeys));
      return;
    }

    if (validSaved < nodeIds.length) {
      const merged = mergeLayoutWithNewDevices(
        nodePositionsRef.current, snapshot.senders, snapshot.receivers, expandedDeviceKeys, compactDeviceKeys,
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
  }, [loading, snapshot.senders, snapshot.receivers, expandedDeviceKeys, compactDeviceKeys, persistPositions]);

  return {
    resolvePosition,
    draggingNodeIdsRef,
    autoMeasureLayout,
    layoutEpoch,
    requestAutoLayout,
    relayoutAfterResize,
    resetLayout,
    alignLayoutByHost,
    saveCurrentHostPreset,
    loadCurrentHostPreset,
    handleMeasuredLayout,
    handleNodesChange,
  };
}
