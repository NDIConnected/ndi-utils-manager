import { describe, expect, it } from 'vitest';
import { buildOptimisticConnection, resolveConnectionDetails } from '../routing';
import { acceptSnapshot, INITIAL_SNAPSHOT_ID, retryDelay } from '../snapshotOrder';
import { basicSnapshot } from './fixtures';

describe('resolveConnectionDetails', () => {
  it('maps React Flow node/handle ids to the NDI source name and receiver UUID', () => {
    const details = resolveConnectionDetails({
      source: 'sender-device-cam',
      sourceHandle: 'out-cam-out2',
      target: 'receiver-device-mon',
      targetHandle: 'in-mon-in1',
    }, basicSnapshot());
    expect(details.sourceName).toBe('HOST (cam-out2)');
    expect(details.receiverUuid).toBe('uuid-mon-in1');
  });

  it('returns empty values for unknown devices or channels', () => {
    const details = resolveConnectionDetails({ source: 'sender-device-x', target: 'receiver-device-y' }, basicSnapshot());
    expect(details.sourceName).toBe('');
    expect(details.receiverUuid).toBe('');
  });
});

describe('buildOptimisticConnection', () => {
  it('builds a connection with the same id format as the backend', () => {
    const details = resolveConnectionDetails({
      source: 'sender-device-cam',
      sourceHandle: 'out-cam-out2',
      target: 'receiver-device-mon',
      targetHandle: 'in-mon-in1',
    }, basicSnapshot());
    const conn = buildOptimisticConnection(details, 1000);
    expect(conn).toMatchObject({
      connectionId: 'uuid-cam-out2->uuid-mon-in1',
      receiverUuid: 'uuid-mon-in1',
      sourceName: 'HOST (cam-out2)',
      optimistic: true,
      createdAt: 1000,
    });
  });

  it('returns null when an end cannot be resolved', () => {
    expect(buildOptimisticConnection({ receiverUuid: 'x' })).toBeNull();
  });
});

describe('acceptSnapshot', () => {
  it('accepts newer sequences and drops older or equal ones from the same backend', () => {
    let last = INITIAL_SNAPSHOT_ID;
    let r = acceptSnapshot(last, { instanceId: 'A', sequence: 5 });
    expect(r.accept).toBe(true);
    last = r.last;
    expect(acceptSnapshot(last, { instanceId: 'A', sequence: 4 }).accept).toBe(false);
    expect(acceptSnapshot(last, { instanceId: 'A', sequence: 5 }).accept).toBe(false);
    r = acceptSnapshot(last, { instanceId: 'A', sequence: 6 });
    expect(r.accept).toBe(true);
    expect(r.last).toEqual({ instanceId: 'A', sequence: 6 });
  });

  it('resets ordering when the backend restarts (new instance id)', () => {
    const last = { instanceId: 'A', sequence: 900 };
    const r = acceptSnapshot(last, { instanceId: 'B', sequence: 1 });
    expect(r.accept).toBe(true);
    expect(r.last).toEqual({ instanceId: 'B', sequence: 1 });
  });

  it('accepts payloads without ordering info (older backends)', () => {
    const last = { instanceId: 'A', sequence: 9 };
    expect(acceptSnapshot(last, { senders: [] })).toEqual({ accept: true, last });
  });
});

describe('retryDelay', () => {
  it('backs off exponentially and is capped at 10 s, never giving up', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 50].map(retryDelay)).toEqual([0, 1000, 2000, 4000, 8000, 10000, 10000, 10000]);
  });
});
