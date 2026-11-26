export const INITIAL_SNAPSHOT_ID = Object.freeze({ instanceId: '', sequence: -1 });

/**
 * Decides whether a snapshot payload is newer than the last one applied.
 * Payloads without ordering info (older backends) are always accepted.
 * A different backend instance (restart) resets the ordering.
 *
 * @returns {{ accept: boolean, last: { instanceId: string, sequence: number } }} the updated "last applied" id
 */
export function acceptSnapshot(last, payload) {
  const instanceId = payload?.instanceId || '';
  const sequence = Number(payload?.sequence);
  if (!instanceId || !Number.isFinite(sequence)) return { accept: true, last };
  if (last.instanceId === instanceId && sequence <= last.sequence) return { accept: false, last };
  return { accept: true, last: { instanceId, sequence } };
}

const MAX_RETRY_DELAY_MS = 10000;

/** SignalR reconnect backoff that never gives up: 0, 1, 2, 4, 8, 10, 10, ... seconds. */
export function retryDelay(attempt) {
  return attempt === 0 ? 0 : Math.min(1000 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
}
