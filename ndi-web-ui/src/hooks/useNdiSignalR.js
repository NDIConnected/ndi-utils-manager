import { useEffect, useRef, useState } from 'react';
import * as signalR from '@microsoft/signalr';

const MAX_RETRY_DELAY_MS = 10000;

// Never give up: 0, 1, 2, 4, 8, 10, 10, ... seconds.
const retryDelay = (attempt) => (attempt === 0 ? 0 : Math.min(1000 * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS));

/**
 * Live snapshot push from the backend hub.
 * Returns the connection state: 'connecting' | 'live' | 'reconnecting' | 'offline'.
 * Reconnects forever (backend restart, sleep/resume, network loss) and calls
 * onReconnected so the caller can resync with a full fetch.
 */
export function useNdiSignalR({ onSnapshot, onReconnected, enabled = true }) {
  const onSnapshotRef = useRef(onSnapshot);
  const onReconnectedRef = useRef(onReconnected);
  const [state, setState] = useState('connecting');

  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
    onReconnectedRef.current = onReconnected;
  }, [onSnapshot, onReconnected]);

  useEffect(() => {
    if (!enabled) return undefined;

    let disposed = false;
    let retryTimer = null;
    let startAttempt = 0;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/ndi')
      .withAutomaticReconnect({ nextRetryDelayInMilliseconds: (ctx) => retryDelay(ctx.previousRetryCount) })
      .build();

    connection.on('snapshotUpdated', (payload) => {
      onSnapshotRef.current?.(payload);
    });

    connection.onreconnecting(() => {
      if (!disposed) setState('reconnecting');
    });

    connection.onreconnected(() => {
      if (disposed) return;
      setState('live');
      onReconnectedRef.current?.();
    });

    const start = async () => {
      if (disposed) return;
      try {
        await connection.start();
        if (disposed) return;
        startAttempt = 0;
        setState('live');
        onReconnectedRef.current?.();
      } catch {
        if (disposed) return;
        setState('offline');
        startAttempt += 1;
        retryTimer = setTimeout(start, retryDelay(startAttempt) || 1000);
      }
    };

    // Automatic reconnect only covers drops after a successful start; restart manually after onclose.
    connection.onclose(() => {
      if (disposed) return;
      setState('offline');
      startAttempt += 1;
      retryTimer = setTimeout(start, retryDelay(startAttempt) || 1000);
    });

    start();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      connection.stop().catch(() => {});
    };
  }, [enabled]);

  return state;
}
