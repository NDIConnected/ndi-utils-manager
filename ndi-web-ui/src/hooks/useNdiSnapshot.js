import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNdiSignalR } from './useNdiSignalR';
import { acceptSnapshot, INITIAL_SNAPSHOT_ID } from '../utils/snapshotOrder';

export const API_BASE = '/api/ndi';
const FETCH_TIMEOUT_MS = 5000;
const FALLBACK_POLL_MS = 2000;
const LIVE_SAFETY_POLL_MS = 15000;
const SNAPSHOT_DEBOUNCE_MS = 80;
const EMPTY_SNAPSHOT = { senders: [], receivers: [], connections: [] };

/**
 * Backend data for the editor: aggregated snapshot + system status.
 * SignalR push is the primary channel; REST polling is a 2 s fallback while push is down
 * (15 s safety poll while live). Stale payloads are dropped by (instanceId, sequence).
 */
export function useNdiSnapshot() {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [systemStatus, setSystemStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [backendOfflineSince, setBackendOfflineSince] = useState(null);

  const lastSnapshotIdRef = useRef(INITIAL_SNAPSHOT_ID);
  const hasLoadedRef = useRef(false);
  const devicesInFlightRef = useRef(false);
  const debounceRef = useRef(null);
  const mutationBlockUntilRef = useRef(0);

  const applySnapshotPayload = useCallback((data) => {
    if (!data) return;
    const { accept, last } = acceptSnapshot(lastSnapshotIdRef.current, data);
    if (!accept) return;
    lastSnapshotIdRef.current = last;
    hasLoadedRef.current = true;
    setBackendOfflineSince(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      setSnapshot({
        senders: Array.isArray(data.senders) ? data.senders : [],
        receivers: Array.isArray(data.receivers) ? data.receivers : [],
        connections: Array.isArray(data.connections) ? data.connections : [],
      });
      setError(null);
    }, SNAPSHOT_DEBOUNCE_MS);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/status`, { timeout: FETCH_TIMEOUT_MS });
      setSystemStatus(res.data || null);
    } catch {
      // Status is optional; polling continues.
    }
  }, []);

  /** force=true for fetches right after an action; background polls skip while a mutation is settling or in flight. */
  const fetchDevices = useCallback(async (force = false) => {
    if (!force && Date.now() < mutationBlockUntilRef.current) return;
    if (!force && devicesInFlightRef.current) return;

    devicesInFlightRef.current = true;
    try {
      const res = await axios.get(`${API_BASE}/devices`, { timeout: FETCH_TIMEOUT_MS });
      applySnapshotPayload(res.data);
    } catch (err) {
      console.error('Error fetching aggregated devices:', err);
      if (hasLoadedRef.current) {
        // Keep the canvas and last known state; the editor shows a banner.
        setBackendOfflineSince((prev) => prev ?? new Date());
      } else {
        setError('Failed to fetch NDI devices. Make sure the backend is running.');
      }
    } finally {
      devicesInFlightRef.current = false;
      setLoading(false);
    }
  }, [applySnapshotPayload]);

  const blockPollingDuringMutation = useCallback((ms = 3500) => {
    mutationBlockUntilRef.current = Math.max(mutationBlockUntilRef.current, Date.now() + ms);
  }, []);

  const signalRState = useNdiSignalR({
    enabled: true,
    onSnapshot: useCallback((payload) => {
      if (payload?.snapshot) applySnapshotPayload(payload.snapshot);
      if (payload?.status) setSystemStatus(payload.status);
    }, [applySnapshotPayload]),
    onReconnected: useCallback(() => {
      fetchDevices(true);
      fetchStatus();
    }, [fetchDevices, fetchStatus]),
  });
  const pushLive = signalRState === 'live';

  useEffect(() => {
    fetchDevices(true);
    fetchStatus();
  }, [fetchDevices, fetchStatus]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchDevices(false);
      if (!pushLive) fetchStatus();
    }, pushLive ? LIVE_SAFETY_POLL_MS : FALLBACK_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchDevices, fetchStatus, pushLive]);

  /** 'live' | 'reconnecting' | 'polling' | 'offline' for the header badge. */
  const linkState = backendOfflineSince
    ? 'offline'
    : pushLive
      ? 'live'
      : signalRState === 'reconnecting' || signalRState === 'connecting'
        ? 'reconnecting'
        : 'polling';

  return {
    snapshot,
    systemStatus,
    loading,
    error,
    backendOfflineSince,
    linkState,
    fetchDevices,
    fetchStatus,
    blockPollingDuringMutation,
  };
}
