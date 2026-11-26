import { describe, expect, it, vi } from 'vitest';
import {
  buildCanvasStructureKey,
  buildFlowGraph,
  confirmedOptimisticReceivers,
  isDeviceCollapsed,
  mergeConnections,
  mergeEdges,
  mergeNodes,
  refreshNodes,
} from '../flowGraph';
import { COLLAPSE_CHANNELS_THRESHOLD } from '../deviceGrouping';
import { basicSnapshot, channel, connection, device } from './fixtures';

const position = () => ({ x: 0, y: 0 });

function graphFor(snapshot, overrides = {}) {
  return buildFlowGraph({
    snapshot,
    filteredSenders: snapshot.senders,
    filteredReceivers: snapshot.receivers,
    resolvePosition: position,
    ...overrides,
  });
}

describe('buildFlowGraph', () => {
  it('creates one node per visible device and one edge per visible connection', () => {
    const { nodes, edges, visibleConnections } = graphFor(basicSnapshot());
    expect(nodes.map((n) => n.id)).toEqual(['sender-device-cam', 'receiver-device-mon']);
    expect(nodes.map((n) => n.type)).toEqual(['senderNode', 'receiverNode']);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      id: 'edge-uuid-cam-out1->uuid-mon-in1',
      source: 'sender-device-cam',
      target: 'receiver-device-mon',
      sourceHandle: 'out-cam-out1',
      targetHandle: 'in-mon-in1',
    });
    expect(visibleConnections).toHaveLength(1);
  });

  it('never makes nodes deletable (Backspace must not disconnect a whole device)', () => {
    const { nodes } = graphFor(basicSnapshot());
    expect(nodes.every((n) => n.deletable === false)).toBe(true);
  });

  it('draws confirmed edges green/animated and optimistic ones as pending', () => {
    const snapshot = basicSnapshot();
    const optimistic = connection('cam', 'cam-out2', 'mon', 'mon-in1', {
      connectionId: 'opt', receiverUuid: 'uuid-other', optimistic: true,
    });
    const { edges } = graphFor(snapshot, { optimisticConnections: [optimistic] });
    const confirmed = edges.find((e) => e.id === 'edge-uuid-cam-out1->uuid-mon-in1');
    const pending = edges.find((e) => e.id === 'edge-opt');
    expect(confirmed.data.confirmed).toBe(true);
    expect(confirmed.animated).toBe(true);
    expect(pending.data.confirmed).toBe(false);
    expect(pending.animated).toBe(false);
  });

  it('hides edges whose sender or receiver is filtered out, and suppressed receivers', () => {
    const snapshot = basicSnapshot();
    expect(graphFor(snapshot, { filteredReceivers: [] }).edges).toEqual([]);
    expect(graphFor(snapshot, { isReceiverSuppressed: (uuid) => uuid === 'uuid-mon-in1' }).edges).toEqual([]);
  });

  it('marks connected channels even when the other end is filtered out', () => {
    const snapshot = basicSnapshot();
    const { nodes } = graphFor(snapshot, { filteredReceivers: [] });
    expect([...nodes[0].data.connectedChannelIds]).toEqual(['cam-out1']);
    expect(nodes[0].data.logicalConnectionCount).toBe(0);
  });

  it('reuses node data and edge objects when nothing changed, and rebuilds them when content changes', () => {
    const nodeDataCache = new Map();
    const edgeCache = new Map();
    const createNodeCallbacks = vi.fn(() => ({ onToggleExpand: () => {} }));
    const first = graphFor(basicSnapshot(), { nodeDataCache, edgeCache, createNodeCallbacks });
    const second = graphFor(basicSnapshot(), { nodeDataCache, edgeCache, createNodeCallbacks });

    expect(second.nodes[0].data).toBe(first.nodes[0].data);
    expect(second.edges[0]).toBe(first.edges[0]);
    expect(createNodeCallbacks).toHaveBeenCalledTimes(2); // only for the first build

    const changed = basicSnapshot();
    changed.senders[0].channels[0].isStreaming = true;
    const third = graphFor(changed, { nodeDataCache, edgeCache, createNodeCallbacks });
    expect(third.nodes[0].data).not.toBe(first.nodes[0].data);
    expect(third.nodes[1].data).toBe(first.nodes[1].data); // receiver unchanged
  });

  it('evicts cache entries for devices and edges that disappeared', () => {
    const nodeDataCache = new Map();
    const edgeCache = new Map();
    graphFor(basicSnapshot(), { nodeDataCache, edgeCache });
    graphFor({ senders: [], receivers: [], connections: [] }, { nodeDataCache, edgeCache });
    expect(nodeDataCache.size).toBe(0);
    expect(edgeCache.size).toBe(0);
  });

  it('orders parallel edges between the same devices into lanes by sender channel', () => {
    const snapshot = {
      senders: [device('cam', [channel('ch-2'), channel('ch-10'), channel('ch-1')])],
      receivers: [device('mv', [channel('in-a'), channel('in-b'), channel('in-c')])],
      connections: [
        connection('cam', 'ch-10', 'mv', 'in-c'),
        connection('cam', 'ch-1', 'mv', 'in-a'),
        connection('cam', 'ch-2', 'mv', 'in-b'),
      ],
    };
    const { edges } = graphFor(snapshot);
    const lanes = Object.fromEntries(edges.map((e) => [e.sourceHandle, e.data.edgeLaneIndex]));
    expect(lanes).toEqual({ 'out-ch-1': 0, 'out-ch-2': 1, 'out-ch-10': 2 });
    expect(edges.every((e) => e.data.edgeLaneCount === 3)).toBe(true);
  });
});

describe('isDeviceCollapsed', () => {
  const many = Array.from({ length: COLLAPSE_CHANNELS_THRESHOLD + 1 }, (_, i) => channel(`c${i}`));

  it('collapses devices above the channel threshold unless expanded', () => {
    const d = device('mv', many);
    expect(isDeviceCollapsed(d, 'receiver-device-mv', new Set())).toBe(true);
    expect(isDeviceCollapsed(d, 'receiver-device-mv', new Set(['receiver-device-mv']))).toBe(false);
    expect(isDeviceCollapsed(device('cam', [channel('a')]), 'x', new Set())).toBe(false);
  });

  it('collapses Bridge hubs with more than one output', () => {
    expect(isDeviceCollapsed(device('hub', [channel('a'), channel('b')], { isBridgeHub: true }), 'h', new Set())).toBe(true);
    expect(isDeviceCollapsed(device('hub', [channel('a')], { isBridgeHub: true }), 'h', new Set())).toBe(false);
  });
});

describe('optimistic connections', () => {
  it('adds optimistic connections only for receivers the backend does not report yet', () => {
    const snapshotConns = [connection('cam', 'cam-out1', 'mon', 'mon-in1')];
    const dup = connection('cam', 'cam-out2', 'mon', 'mon-in1', { optimistic: true });
    const fresh = connection('cam', 'cam-out2', 'mon2', 'mon2-in1', { optimistic: true });
    const merged = mergeConnections(snapshotConns, [dup, fresh]);
    expect(merged).toHaveLength(2);
    expect(merged[1]).toBe(fresh);
  });

  it('reports which optimistic receivers are now confirmed (case-insensitive UUIDs)', () => {
    const optimistic = new Map([['UUID-MON-IN1', {}], ['uuid-other', {}]]);
    expect(confirmedOptimisticReceivers([connection('cam', 'cam-out1', 'mon', 'mon-in1')], optimistic))
      .toEqual(['UUID-MON-IN1']);
  });
});

describe('mergeNodes / mergeEdges / refreshNodes', () => {
  const node = (id, data, pos = { x: 0, y: 0 }) => ({ id, data, position: pos });

  it('keeps the previous graph only while the backend snapshot is empty', () => {
    const prev = [node('a', {})];
    expect(mergeNodes(prev, [], new Set(), true)).toBe(prev);
    expect(mergeNodes(prev, [], new Set(), false)).toEqual([]);
    const prevEdges = [{ id: 'e', data: {} }];
    expect(mergeEdges(prevEdges, [], true)).toBe(prevEdges);
    expect(mergeEdges(prevEdges, [], false)).toEqual([]);
  });

  it('reuses unchanged nodes and keeps React Flow measurements on changed ones', () => {
    const data = {};
    const prev = [{ ...node('a', data), measured: { width: 300, height: 400 }, selected: true }];
    const same = mergeNodes(prev, [node('a', data)], new Set(), false);
    expect(same[0]).toBe(prev[0]);

    const changed = mergeNodes(prev, [node('a', { changed: true })], new Set(), false);
    expect(changed[0]).not.toBe(prev[0]);
    expect(changed[0].measured).toEqual({ width: 300, height: 400 });
    expect(changed[0].selected).toBe(true);
  });

  it('keeps the dragged position of a node being dragged', () => {
    const prev = [node('a', {}, { x: 50, y: 60 })];
    const merged = mergeNodes(prev, [node('a', { v: 2 }, { x: 0, y: 0 })], new Set(['a']), false);
    expect(merged[0].position).toEqual({ x: 50, y: 60 });
  });

  it('reuses edges whose data object is unchanged', () => {
    const data = {};
    const prevEdges = [{ id: 'e', data, selected: true }];
    expect(mergeEdges(prevEdges, [{ id: 'e', data }], false)[0]).toBe(prevEdges[0]);
    expect(mergeEdges(prevEdges, [{ id: 'e', data: {} }], false)[0].selected).toBe(true);
  });

  it('refreshNodes updates data/position in place and keeps untouched nodes', () => {
    const data = {};
    const prev = [node('a', data, { x: 1, y: 1 }), node('b', {})];
    const next = refreshNodes(prev, [node('a', data), node('b', { v: 2 })], new Set(), () => ({ x: 1, y: 1 }));
    expect(next[0]).toBe(prev[0]);
    expect(next[1].data).toEqual({ v: 2 });
  });
});

describe('buildCanvasStructureKey', () => {
  const base = {
    filteredSenders: basicSnapshot().senders,
    filteredReceivers: basicSnapshot().receivers,
    visibleConnections: basicSnapshot().connections,
    selectedHostKeys: new Set(),
    senderFilter: '',
    receiverFilter: '',
    showActiveOnly: false,
    expandedDeviceKeys: new Set(),
    compactDeviceKeys: new Set(),
  };

  it('is stable for data-only changes and changes when structure changes', () => {
    const key = buildCanvasStructureKey(base);
    const statsOnly = basicSnapshot();
    statsOnly.senders[0].channels[0].isStreaming = true;
    expect(buildCanvasStructureKey({ ...base, filteredSenders: statsOnly.senders })).toBe(key);
    expect(buildCanvasStructureKey({ ...base, visibleConnections: [] })).not.toBe(key);
    expect(buildCanvasStructureKey({ ...base, expandedDeviceKeys: new Set(['x']) })).not.toBe(key);
  });
});
