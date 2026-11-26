import { describe, expect, it } from 'vitest';
import {
  buildDeviceSearchText,
  filterSnapshotDevices,
  isConnectionConfirmed,
  matchesFilterQuery,
  sourcesMatch,
} from '../flowFilters';
import { basicSnapshot, channel, connection, device } from './fixtures';

describe('matchesFilterQuery', () => {
  const text = 'vmix studio camera 1 shq2 192.168.1.10';

  it('matches everything for an empty query', () => {
    expect(matchesFilterQuery(text, '')).toBe(true);
    expect(matchesFilterQuery(text, '   ')).toBe(true);
    expect(matchesFilterQuery(text, undefined)).toBe(true);
  });

  it('does a case-insensitive substring match', () => {
    expect(matchesFilterQuery(text, 'VMIX')).toBe(true);
    expect(matchesFilterQuery(text, 'tricaster')).toBe(false);
  });

  it('treats "|" as OR and "," as AND', () => {
    expect(matchesFilterQuery(text, 'tricaster|vmix')).toBe(true);
    expect(matchesFilterQuery(text, 'vmix, shq2')).toBe(true);
    expect(matchesFilterQuery(text, 'vmix, hx')).toBe(false);
    expect(matchesFilterQuery(text, 'tricaster|vmix, hx|shq2')).toBe(true);
  });

  it('supports * and ? wildcards without treating other characters as regex', () => {
    expect(matchesFilterQuery(text, 'cam*1')).toBe(true);
    expect(matchesFilterQuery(text, 'shq?')).toBe(true);
    expect(matchesFilterQuery(text, '192.168.*.10')).toBe(true);
    expect(matchesFilterQuery('a+b (x)', 'a+b (*)')).toBe(true);
    expect(matchesFilterQuery('axb', 'a.b*')).toBe(false);
  });
});

describe('buildDeviceSearchText', () => {
  it('includes device fields and channel labels, lower-cased', () => {
    const d = device('Cam', [channel('c1', { streamLabel: 'STUDIO (Città)', videoCodec: 'SHQ2' })]);
    const textValue = buildDeviceSearchText(d);
    expect(textValue).toContain('studio (città)');
    expect(textValue).toContain('shq2');
    expect(textValue).toContain('10.0.0.1');
  });
});

describe('filterSnapshotDevices', () => {
  const snapshot = {
    senders: [
      device('cam', [channel('c1', { isStreaming: true })], { hostName: 'A' }),
      device('gfx', [channel('g1')], { hostName: 'B' }),
    ],
    receivers: [device('mon', [channel('m1')], { hostName: 'A' })],
    connections: [],
  };
  const base = { senderFilter: '', receiverFilter: '', selectedHostKeys: new Set(), showActiveOnly: false };

  it('returns all devices without filters', () => {
    const { filteredSenders, filteredReceivers } = filterSnapshotDevices(snapshot, base);
    expect(filteredSenders.map((d) => d.deviceKey)).toEqual(['cam', 'gfx']);
    expect(filteredReceivers.map((d) => d.deviceKey)).toEqual(['mon']);
  });

  it('applies the sender text filter independently from receivers', () => {
    const { filteredSenders, filteredReceivers } = filterSnapshotDevices(snapshot, { ...base, senderFilter: 'gfx' });
    expect(filteredSenders.map((d) => d.deviceKey)).toEqual(['gfx']);
    expect(filteredReceivers).toHaveLength(1);
  });

  it('keeps only devices of the selected hosts', () => {
    const { filteredSenders, filteredReceivers } = filterSnapshotDevices(snapshot, { ...base, selectedHostKeys: new Set(['A']) });
    expect(filteredSenders.map((d) => d.deviceKey)).toEqual(['cam']);
    expect(filteredReceivers.map((d) => d.deviceKey)).toEqual(['mon']);
  });

  it('"Active only" keeps devices with a streaming or connected channel', () => {
    const { filteredSenders, filteredReceivers } = filterSnapshotDevices(snapshot, { ...base, showActiveOnly: true });
    expect(filteredSenders.map((d) => d.deviceKey)).toEqual(['cam']);
    expect(filteredReceivers).toEqual([]);
  });

  it('can filter everything out (the canvas must then be empty, not stale)', () => {
    const { filteredSenders } = filterSnapshotDevices(snapshot, { ...base, senderFilter: 'nothing-matches' });
    expect(filteredSenders).toEqual([]);
  });
});

describe('sourcesMatch / isConnectionConfirmed', () => {
  it('compares names case-insensitively but accent-sensitively', () => {
    expect(sourcesMatch('HOST (Cam)', 'host (cam)')).toBe(true);
    expect(sourcesMatch(' HOST (Cam) ', 'HOST (Cam)')).toBe(true);
    expect(sourcesMatch('Città', 'Citta')).toBe(false);
    expect(sourcesMatch('', '')).toBe(false);
  });

  it('confirms a connection when the receiver channel reports that source', () => {
    const snapshot = basicSnapshot();
    expect(isConnectionConfirmed(snapshot.connections[0], snapshot)).toBe(true);
  });

  it('never confirms optimistic connections or unknown channels', () => {
    const snapshot = basicSnapshot();
    expect(isConnectionConfirmed({ ...snapshot.connections[0], optimistic: true }, snapshot)).toBe(false);
    expect(isConnectionConfirmed(connection('cam', 'cam-out1', 'mon', 'missing'), snapshot)).toBe(false);
  });
});
