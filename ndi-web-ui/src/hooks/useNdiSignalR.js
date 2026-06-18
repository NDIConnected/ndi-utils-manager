import { useEffect, useRef } from 'react';
import * as signalR from '@microsoft/signalr';

export function useNdiSignalR({ onSnapshot, enabled = true }) {
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;

  useEffect(() => {
    if (!enabled) return undefined;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/ndi')
      .withAutomaticReconnect([0, 2000, 5000, 10000])
      .build();

    connection.on('snapshotUpdated', (payload) => {
      onSnapshotRef.current?.(payload);
    });

    connection.start().catch(() => {
      // Polling fallback remains active.
    });

    return () => {
      connection.stop().catch(() => {});
    };
  }, [enabled]);
}
