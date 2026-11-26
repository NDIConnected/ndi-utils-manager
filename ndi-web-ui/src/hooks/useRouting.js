import { useCallback, useRef, useState } from 'react';
import axios from 'axios';
import { API_BASE } from './useNdiSnapshot';
import { filterDevicesByHost } from '../utils/deviceGrouping';
import { buildOptimisticConnection, resolveConnectionDetails } from '../utils/routing';

const OPTIMISTIC_CONNECTION_TTL_MS = 8000;
const SUPPRESS_AFTER_DISCONNECT_MS = 3500;

/**
 * Connect / disconnect / reconnect commands and the client-side state that bridges the gap until the
 * backend snapshot reflects them:
 * - optimistic connections (drawn as pending, expire after 8 s if never confirmed),
 * - suppressed receivers (edge hidden right after a disconnect so it does not flash back).
 * `epoch` changes whenever that state changes, so the graph can be rebuilt.
 */
export function useRouting({ snapshot, fetchDevices, blockPollingDuringMutation, toast, singleHostKey }) {
  const [epoch, setEpoch] = useState(0);
  const optimisticRef = useRef(new Map());
  const suppressedUntilRef = useRef(new Map());
  const reconnectSucceededRef = useRef(true);
  const bump = useCallback(() => setEpoch((e) => e + 1), []);

  const rememberOptimisticConnection = useCallback((details) => {
    const conn = buildOptimisticConnection(details);
    if (!conn) return;
    optimisticRef.current.set(conn.receiverUuid, conn);
    bump();
    setTimeout(() => {
      if (optimisticRef.current.get(conn.receiverUuid) !== conn) return; // confirmed, cleared or superseded
      optimisticRef.current.delete(conn.receiverUuid);
      bump();
      toast(`Connection not confirmed by receiver: ${conn.receiverLabel || conn.receiverUuid} → ${conn.sourceName}`, 'warning');
    }, OPTIMISTIC_CONNECTION_TTL_MS);
  }, [bump, toast]);

  const clearOptimisticConnection = useCallback((receiverUuid) => {
    if (receiverUuid && optimisticRef.current.delete(receiverUuid)) bump();
  }, [bump]);

  /** Drops optimistic entries the backend now reports (call when a new snapshot arrives). */
  const forgetOptimistic = useCallback((receiverUuids) => {
    receiverUuids.forEach((uuid) => optimisticRef.current.delete(uuid));
  }, []);

  const suppressReceiverConnection = useCallback((receiverUuid, ms = SUPPRESS_AFTER_DISCONNECT_MS) => {
    if (receiverUuid) suppressedUntilRef.current.set(receiverUuid, Date.now() + ms);
  }, []);

  const isReceiverConnectionSuppressed = useCallback((receiverUuid) => {
    if (!receiverUuid) return false;
    const until = suppressedUntilRef.current.get(receiverUuid);
    if (!until) return false;
    if (Date.now() >= until) {
      suppressedUntilRef.current.delete(receiverUuid);
      return false;
    }
    return true;
  }, []);

  const postDisconnect = useCallback(async (receiverUuid) => {
    try {
      const response = await axios.post(`${API_BASE}/disconnect`, { receiverUuid });
      if (!response.data?.success) toast(`Disconnect failed: ${response.data?.message ?? 'error'}`, 'error');
      else toast('Disconnect sent', 'success');
    } catch {
      toast('Disconnect error', 'error');
    }
  }, [toast]);

  const connect = useCallback(async (params) => {
    const details = resolveConnectionDetails(params, snapshot);
    const { sourceName, receiverUuid } = details;
    if (!receiverUuid || !sourceName) return;

    blockPollingDuringMutation();
    rememberOptimisticConnection(details);
    try {
      const response = await axios.post(`${API_BASE}/connect`, { receiverUuid, sourceName });
      if (!response?.data?.success) {
        clearOptimisticConnection(receiverUuid);
        toast(`Connect failed: ${response?.data?.message ?? 'error'}`, 'error');
      } else {
        toast(`Connect sent → ${sourceName}`, 'success');
        fetchDevices(true);
      }
    } catch {
      clearOptimisticConnection(receiverUuid);
      toast('Connect error', 'error');
    } finally {
      setTimeout(() => fetchDevices(true), 400);
      setTimeout(() => fetchDevices(true), 1200);
    }
  }, [snapshot, fetchDevices, blockPollingDuringMutation, rememberOptimisticConnection, clearOptimisticConnection, toast]);

  const disconnectReceiver = useCallback(async (receiverUuid) => {
    if (!receiverUuid) return;
    blockPollingDuringMutation();
    clearOptimisticConnection(receiverUuid);
    suppressReceiverConnection(receiverUuid);
    try {
      await postDisconnect(receiverUuid);
    } finally {
      setTimeout(() => fetchDevices(true), 800);
    }
  }, [blockPollingDuringMutation, clearOptimisticConnection, suppressReceiverConnection, postDisconnect, fetchDevices]);

  /** React Flow onEdgesDelete (× button or Delete key on a selected edge). */
  const disconnectEdges = useCallback(async (edgesToDelete) => {
    blockPollingDuringMutation();
    for (const edge of edgesToDelete) {
      const receiverUuid = edge?.data?.receiverUuid;
      if (!receiverUuid) continue;
      clearOptimisticConnection(receiverUuid);
      suppressReceiverConnection(receiverUuid);
      await postDisconnect(receiverUuid);
    }
    setTimeout(() => fetchDevices(true), 800);
    setTimeout(() => fetchDevices(true), 1800);
  }, [fetchDevices, blockPollingDuringMutation, suppressReceiverConnection, clearOptimisticConnection, postDisconnect]);

  const onReconnectStart = useCallback(() => {
    reconnectSucceededRef.current = false;
  }, []);

  /** Edge end dragged onto another receiver input: disconnect the old receiver, connect the new one. */
  const onReconnect = useCallback(async (oldEdge, newConnection) => {
    reconnectSucceededRef.current = true;
    const oldReceiverUuid = oldEdge?.data?.receiverUuid || '';
    const details = resolveConnectionDetails(newConnection, snapshot);
    const { sourceName, receiverUuid: newReceiverUuid } = details;
    if (!newReceiverUuid || !sourceName) return;

    const movedToOtherReceiver = oldReceiverUuid && oldReceiverUuid !== newReceiverUuid;
    blockPollingDuringMutation();
    rememberOptimisticConnection(details);
    if (movedToOtherReceiver) {
      clearOptimisticConnection(oldReceiverUuid);
      suppressReceiverConnection(oldReceiverUuid);
    }
    suppressReceiverConnection(newReceiverUuid, 2000);

    try {
      if (movedToOtherReceiver) {
        await axios.post(`${API_BASE}/disconnect`, { receiverUuid: oldReceiverUuid });
      }
      const response = await axios.post(`${API_BASE}/connect`, { receiverUuid: newReceiverUuid, sourceName });
      if (!response?.data?.success) {
        clearOptimisticConnection(newReceiverUuid);
        toast(`Reconnect failed: ${response?.data?.message ?? 'error'}`, 'error');
      } else {
        toast(`Reconnect → ${sourceName}`, 'success');
      }
    } catch {
      clearOptimisticConnection(newReceiverUuid);
      toast('Reconnect error', 'error');
    } finally {
      setTimeout(() => fetchDevices(true), 800);
      setTimeout(() => fetchDevices(true), 1800);
    }
  }, [
    snapshot,
    fetchDevices,
    blockPollingDuringMutation,
    suppressReceiverConnection,
    rememberOptimisticConnection,
    clearOptimisticConnection,
    toast,
  ]);

  /** Edge end dropped on empty canvas: treat as disconnect. */
  const onReconnectEnd = useCallback(async (_event, edge) => {
    if (reconnectSucceededRef.current) return;
    await disconnectReceiver(edge?.data?.receiverUuid);
  }, [disconnectReceiver]);

  const bulkDisconnectHost = useCallback(async () => {
    if (!singleHostKey) {
      toast('Select exactly one host', 'warning');
      return;
    }
    const receivers = filterDevicesByHost(snapshot.receivers, singleHostKey);
    const uuids = receivers.flatMap((d) => (d.channels || []).map((c) => c.endpointUuid).filter(Boolean));
    if (uuids.length === 0) {
      toast('No receivers on this host', 'warning');
      return;
    }
    if (!window.confirm(`Disconnect ${uuids.length} receivers on ${singleHostKey}?`)) return;
    uuids.forEach((uuid) => clearOptimisticConnection(uuid));

    blockPollingDuringMutation(5000);
    try {
      const res = await axios.post(`${API_BASE}/disconnect-bulk`, { receiverUuids: uuids });
      const ok = res.data?.succeeded ?? 0;
      toast(`Bulk disconnect: ${ok}/${uuids.length} succeeded`, ok === uuids.length ? 'success' : 'warning');
    } catch {
      toast('Bulk disconnect error', 'error');
    } finally {
      setTimeout(() => fetchDevices(true), 800);
    }
  }, [singleHostKey, snapshot.receivers, blockPollingDuringMutation, clearOptimisticConnection, fetchDevices, toast]);

  return {
    epoch,
    optimisticRef,
    forgetOptimistic,
    isReceiverConnectionSuppressed,
    connect,
    disconnectReceiver,
    disconnectEdges,
    onReconnectStart,
    onReconnect,
    onReconnectEnd,
    bulkDisconnectHost,
  };
}
