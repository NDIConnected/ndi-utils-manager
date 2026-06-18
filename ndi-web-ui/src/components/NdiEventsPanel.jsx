import { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE = '/api/ndi';

export default function NdiEventsPanel({ refreshToken }) {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await axios.get(`${API_BASE}/events`, { params: { limit: 150 } });
        if (!cancelled) setEvents(Array.isArray(res.data) ? res.data : []);
      } catch {
        if (!cancelled) setEvents([]);
      }
    };
    load();
    const interval = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshToken]);

  const filtered = events.filter((evt) => {
    if (sourceFilter !== 'all' && evt.source !== sourceFilter) return false;
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return [evt.source, evt.endpointUuid, evt.eventName, evt.eventValue]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#111827', minHeight: 0 }}>
      <div style={{ padding: '12px 16px', display: 'flex', gap: 10, borderBottom: '1px solid #374151' }}>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter events (UUID, name, value…)"
          style={{
            flex: 1,
            padding: '7px 10px',
            borderRadius: 6,
            border: '1px solid #4b5563',
            backgroundColor: '#0f172a',
            color: '#e5e7eb',
            fontSize: 12,
          }}
        />
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          style={{
            padding: '7px 10px',
            borderRadius: 6,
            border: '1px solid #4b5563',
            backgroundColor: '#0f172a',
            color: '#e5e7eb',
            fontSize: 12,
          }}
        >
          <option value="all">All</option>
          <option value="SendListener">SendListener</option>
          <option value="RecvListener">RecvListener</option>
        </select>
      </div>
      <div style={{ flex: 1, overflow: 'auto', fontFamily: 'Consolas, monospace', fontSize: 11 }}>
        {filtered.map((evt, idx) => (
          <div
            key={`${evt.timestamp}-${evt.endpointUuid}-${evt.eventName}-${idx}`}
            style={{
              padding: '6px 16px',
              borderBottom: '1px solid #1f2937',
              color: evt.source === 'SendListener' ? '#86efac' : '#93c5fd',
            }}
          >
            <span style={{ color: '#6b7280' }}>
              {new Date(evt.timestamp).toLocaleTimeString('en-US')}
            </span>
            {' '}
            <span style={{ color: '#d1d5db' }}>[{evt.source}]</span>
            {' '}
            <span style={{ color: '#fbbf24' }}>{evt.eventName}</span>
            {' '}
            <span style={{ color: '#9ca3af' }}>{evt.endpointUuid?.slice(0, 8)}…</span>
            {' = '}
            <span style={{ color: '#e5e7eb' }}>{evt.eventValue || '—'}</span>
          </div>
        ))}
        {filtered.length === 0 ? (
          <div style={{ padding: 24, color: '#6b7280', textAlign: 'center' }}>No events</div>
        ) : null}
      </div>
    </div>
  );
}
