import { describe, expect, it } from 'vitest';
import {
  buildViewModeMap,
  computeDefaultLayout,
  estimateAggregatedNodeHeight,
  isValidSavedPosition,
  mergeLayoutWithNewDevices,
  nodeViewMode,
  repackColumns,
} from '../layoutUtils';
import { channel, device } from './fixtures';

const senders = [device('a', [channel('a1')]), device('b', [channel('b1')]), device('c', [channel('c1')])];
const receivers = [device('r', [channel('r1')])];

function overlapsVertically(positions, devices, role) {
  const boxes = devices.map((d) => {
    const id = `${role}-device-${d.deviceKey}`;
    return { id, top: positions[id].y, bottom: positions[id].y + estimateAggregatedNodeHeight(d, new Set(), role) };
  });
  return boxes.some((a, i) => boxes.some((b, j) => i !== j && a.top < b.bottom && b.top < a.bottom));
}

describe('computeDefaultLayout', () => {
  it('stacks senders and receivers in two columns without overlap', () => {
    const layout = computeDefaultLayout(senders, receivers);
    expect(new Set(senders.map((d) => layout[`sender-device-${d.deviceKey}`].x)).size).toBe(1);
    expect(layout['receiver-device-r'].x).toBeGreaterThan(layout['sender-device-a'].x);
    expect(overlapsVertically(layout, senders, 'sender')).toBe(false);
  });
});

describe('mergeLayoutWithNewDevices', () => {
  it('keeps saved positions and places new devices below existing ones', () => {
    const saved = { 'sender-device-a': { x: 80, y: 120 } };
    const merged = mergeLayoutWithNewDevices(saved, senders, receivers);
    expect(merged['sender-device-a']).toEqual({ x: 80, y: 120 });
    expect(merged['sender-device-b'].y).toBeGreaterThan(120);
    expect(overlapsVertically(merged, senders, 'sender')).toBe(false);
    expect(isValidSavedPosition(merged['receiver-device-r'])).toBe(true);
  });

  it('treats saved slots of offline devices as occupied (no collision when they come back)', () => {
    const saved = { 'sender-device-offline': { x: 80, y: 120 } };
    const merged = mergeLayoutWithNewDevices(saved, [senders[0]], []);
    expect(merged['sender-device-offline']).toEqual({ x: 80, y: 120 });
    expect(merged['sender-device-a'].y).toBeGreaterThanOrEqual(120 + 420);
  });

  it('ignores invalid saved positions', () => {
    const merged = mergeLayoutWithNewDevices({ 'sender-device-a': { x: NaN, y: 1 } }, [senders[0]], []);
    expect(isValidSavedPosition(merged['sender-device-a'])).toBe(true);
  });
});

describe('minimized (one-line) cards', () => {
  it('nodeViewMode: minimized wins over compact; accepts a Set or a Map', () => {
    const map = buildViewModeMap(new Set(['a', 'b']), new Set(['b']));
    expect(nodeViewMode('a', map)).toBe('compact');
    expect(nodeViewMode('b', map)).toBe('mini');
    expect(nodeViewMode('c', map)).toBe(false);
    expect(nodeViewMode('a', new Set(['a']))).toBe('compact');
    expect(nodeViewMode('x', new Set(), { data: { minimized: true } })).toBe('mini');
  });

  it('estimates a short height for minimized cards and stacks them tightly', () => {
    const mini = estimateAggregatedNodeHeight(senders[0], new Set(), 'sender', 'mini');
    expect(mini).toBeLessThan(60);
    const ids = senders.map((d) => `sender-device-${d.deviceKey}`);
    const layout = computeDefaultLayout(senders, [], new Set(), buildViewModeMap(new Set(), new Set(ids)));
    const gap = layout[ids[1]].y - layout[ids[0]].y;
    expect(gap).toBeLessThan(120);
    const detailedGap = computeDefaultLayout(senders, [])[ids[1]].y - computeDefaultLayout(senders, [])[ids[0]].y;
    expect(gap).toBeLessThan(detailedGap);
  });
});

describe('repackColumns (accordion after minimize / expand)', () => {
  it('re-stacks each column from its top, keeping order and x, with tight gaps for one-line cards', () => {
    const positions = repackColumns([
      { id: 'b', x: 80, y: 600, height: 36 },
      { id: 'a', x: 82, y: 120, height: 36 },
      { id: 'c', x: 80, y: 1100, height: 400 },
      { id: 'r', x: 960, y: 500, height: 36 },
    ]);
    expect(positions.a).toEqual({ x: 82, y: 120 });
    expect(positions.b.y).toBe(120 + 36 + 14);
    expect(positions.c.y).toBe(positions.b.y + 36 + 14);
    expect(positions.r).toEqual({ x: 960, y: 500 }); // other column untouched
  });

  it('pushes cards down when one expands, so they never overlap', () => {
    const positions = repackColumns([
      { id: 'a', x: 0, y: 0, height: 400 },
      { id: 'b', x: 0, y: 50, height: 36 },
    ]);
    expect(positions.b.y).toBeGreaterThanOrEqual(400);
  });
});
