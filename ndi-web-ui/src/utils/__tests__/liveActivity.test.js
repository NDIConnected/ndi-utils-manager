import { describe, expect, it } from 'vitest';
import {
  RATE_STALE_MS,
  deviceNodeClassName,
  deviceTally,
  edgeActivity,
  nextExpiry,
  rateLevel,
  updateArrivals,
  updateChannelRates,
  updateDepartures,
} from '../liveActivity';

const sender = (channels) => [{ deviceKey: 'cam', channels }];

describe('updateChannelRates', () => {
  it('derives bytes/s from growing counters and resets on counter restart', () => {
    let rates = updateChannelRates(new Map(), sender([{ channelId: 'c', videoBytesSent: 1000 }]), 0);
    expect(rates.get('c').rate).toBeNull();
    rates = updateChannelRates(rates, sender([{ channelId: 'c', videoBytesSent: 3000, audioBytesSent: 1000 }]), 2000);
    expect(rates.get('c').rate).toBe(1500);
    rates = updateChannelRates(rates, sender([{ channelId: 'c', videoBytesSent: 10 }]), 3000);
    expect(rates.get('c').rate).toBeNull();
  });

  it('keeps the last rate while counters are briefly flat, then reports 0 (sender stopped)', () => {
    let rates = updateChannelRates(new Map(), sender([{ channelId: 'c', videoBytesSent: 0 }]), 0);
    rates = updateChannelRates(rates, sender([{ channelId: 'c', videoBytesSent: 5000 }]), 1000);
    rates = updateChannelRates(rates, sender([{ channelId: 'c', videoBytesSent: 5000 }]), 2000);
    expect(rates.get('c').rate).toBe(5000);
    rates = updateChannelRates(rates, sender([{ channelId: 'c', videoBytesSent: 5000 }]), 1000 + RATE_STALE_MS);
    expect(rates.get('c').rate).toBe(0);
  });
});

describe('edge look', () => {
  it('maps throughput to levels on a log-like scale', () => {
    expect(rateLevel(0)).toBe(0);
    expect(rateLevel(null)).toBe(2);
    expect(rateLevel(20_000)).toBe(1);
    expect(rateLevel(300_000)).toBe(2);
    expect(rateLevel(2_000_000)).toBe(3);
    expect(rateLevel(20_000_000)).toBe(4);
  });

  it('uses the media kind for colour and the format estimate when there are no counters', () => {
    const audio = edgeActivity({ audioChannels: 1, audioSampleRate: 48000 }, undefined, true);
    expect(audio).toMatchObject({ kind: 'audio', level: 2 });
    const video = edgeActivity({ width: 1920, height: 1080, frameRate: 50 }, undefined, true);
    expect(video).toMatchObject({ kind: 'video', level: 4 });
    expect(edgeActivity({}, undefined, true)).toMatchObject({ kind: 'signal', level: 2 });
    expect(edgeActivity({ width: 1920, height: 1080 }, { rate: 0 }, true).level).toBe(0);
    expect(edgeActivity({ width: 1920 }, undefined, false)).toMatchObject({ kind: 'pending', level: 0 });
    // Legacy sender without format: the receiver's view of the stream decides.
    expect(edgeActivity({}, undefined, true, { width: 1920, height: 1080, frameRate: 50, audioChannels: 4 }))
      .toMatchObject({ kind: 'video', withAudio: true, level: 4 });
  });
});

describe('tally', () => {
  it('program wins over preview, string booleans accepted', () => {
    expect(deviceTally({ channels: [{ tallyOnPreview: true }, { tallyOnProgram: 'true' }] })).toBe('pgm');
    expect(deviceTally({ channels: [{ tallyOnPreview: 'true' }] })).toBe('pvw');
    expect(deviceTally({ channels: [{}] })).toBeNull();
    expect(deviceNodeClassName({ channels: [{ tallyOnPreview: true }] }, 'receiver'))
      .toBe('ndi-node ndi-node--receiver ndi-tally-pvw');
  });
});

describe('arrivals and departures', () => {
  const nodeA = { id: 'a', className: 'ndi-node', position: { x: 1, y: 2 } };
  const nodeB = { id: 'b', className: 'ndi-node', position: { x: 3, y: 4 } };

  it('turns a device that left the network into a fading, non-interactive ghost', () => {
    const departing = updateDepartures({
      departing: new Map(), previousNodes: [nodeA, nodeB], nextNodeIds: new Set(['b']),
      stillPresent: () => false, now: 100, ttl: 1000,
    });
    expect([...departing.keys()]).toEqual(['a']);
    expect(departing.get('a')).toMatchObject({ until: 1100, node: { className: 'ndi-node ndi-node-leaving', draggable: false } });
    expect(departing.get('a').node.position).toEqual({ x: 1, y: 2 });
  });

  it('no ghost for filtered-out devices; ghosts expire or vanish when the device returns', () => {
    const filtered = updateDepartures({
      departing: new Map(), previousNodes: [nodeA], nextNodeIds: new Set(),
      stillPresent: () => true, now: 0,
    });
    expect(filtered.size).toBe(0);
    const ghost = new Map([['a', { until: 500, node: nodeA }]]);
    expect(updateDepartures({ departing: ghost, previousNodes: [], nextNodeIds: new Set(), stillPresent: () => false, now: 600 }).size).toBe(0);
    expect(updateDepartures({ departing: ghost, previousNodes: [], nextNodeIds: new Set(['a']), stillPresent: () => true, now: 100 }).size).toBe(0);
  });

  it('highlights new devices except on the first build, and reports the next expiry', () => {
    const first = updateArrivals({ arriving: new Map(), previousNodeIds: new Set(), nextNodeIds: new Set(['a']), isFirstBuild: true, now: 0 });
    expect(first.size).toBe(0);
    const later = updateArrivals({ arriving: first, previousNodeIds: new Set(['a']), nextNodeIds: new Set(['a', 'b']), isFirstBuild: false, now: 10, ttl: 100 });
    expect([...later.entries()]).toEqual([['b', 110]]);
    expect(nextExpiry(new Map([['x', { until: 50 }]]), later)).toBe(50);
    expect(nextExpiry(new Map(), new Map())).toBeNull();
  });
});
