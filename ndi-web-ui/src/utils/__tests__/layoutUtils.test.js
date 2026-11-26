import { describe, expect, it } from 'vitest';
import {
  computeDefaultLayout,
  estimateAggregatedNodeHeight,
  isValidSavedPosition,
  mergeLayoutWithNewDevices,
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
