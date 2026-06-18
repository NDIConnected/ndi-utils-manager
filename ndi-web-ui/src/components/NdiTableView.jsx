import { useMemo, useState } from 'react';
import { channelHealthWarning } from '../utils/channelHealth';
import { deviceMatchesHostSelection } from '../utils/deviceGrouping';

export default function NdiTableView({
  snapshot,
  selectedHostKeys,
  onDisconnect,
  onSelectRow,
}) {
  const [sortKey, setSortKey] = useState('host');
  const [sortDir, setSortDir] = useState('asc');

  const rows = useMemo(() => {
    const list = [];
    snapshot.receivers.forEach((device) => {
      if (!deviceMatchesHostSelection(device, selectedHostKeys)) return;
      (device.channels || []).forEach((channel) => {
        list.push({
          id: channel.endpointUuid || `${device.deviceKey}-${channel.channelId}`,
          host: device.hostName || device.address || '—',
          device: device.displayName || device.applicationId || '—',
          channel: channel.streamLabel || channel.endpointName || channel.channelId,
          source: channel.currentSource || '—',
          videoCodec: channel.videoCodec || '—',
          audioCodec: channel.audioCodec || '—',
          streaming: channel.isStreaming ? 'Yes' : 'No',
          connections: channel.connectionCount ?? 0,
          warning: channelHealthWarning(channel, { checkConnectedWithoutSource: true }),
          receiverUuid: channel.endpointUuid,
          deviceKey: device.deviceKey,
          channelId: channel.channelId,
          rawDevice: device,
          rawChannel: channel,
        });
      });
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const av = String(a[sortKey] ?? '').toLowerCase();
      const bv = String(b[sortKey] ?? '').toLowerCase();
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return list;
  }, [snapshot.receivers, selectedHostKeys, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const headerCell = (key, label) => (
    <th
      key={key}
      style={{
        textAlign: 'left',
        padding: '8px 10px',
        color: '#9ca3af',
        fontWeight: 600,
        cursor: 'pointer',
        borderBottom: '1px solid #374151',
        whiteSpace: 'nowrap',
      }}
      onClick={() => toggleSort(key)}
    >
      {label}{sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#111827', padding: '0 16px 16px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#e5e7eb' }}>
        <thead>
          <tr>
            {headerCell('host', 'Host')}
            {headerCell('device', 'Device')}
            {headerCell('channel', 'Channel')}
            {headerCell('source', 'Source')}
            {headerCell('videoCodec', 'Video')}
            {headerCell('audioCodec', 'Audio')}
            {headerCell('streaming', 'Streaming')}
            {headerCell('connections', 'RX')}
            <th style={{ padding: '8px 10px', borderBottom: '1px solid #374151' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              style={{ borderBottom: '1px solid #1f2937', cursor: 'pointer' }}
              onClick={() => onSelectRow?.({ device: row.rawDevice, channel: row.rawChannel, role: 'receiver' })}
            >
              <td style={{ padding: '8px 10px' }}>{row.host}</td>
              <td style={{ padding: '8px 10px' }}>{row.device}</td>
              <td style={{ padding: '8px 10px' }}>
                {row.warning ? <span title={row.warning} style={{ marginRight: 4 }}>⚠️</span> : null}
                {row.channel}
              </td>
              <td style={{ padding: '8px 10px', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.source}</td>
              <td style={{ padding: '8px 10px' }}>{row.videoCodec}</td>
              <td style={{ padding: '8px 10px' }}>{row.audioCodec}</td>
              <td style={{ padding: '8px 10px' }}>{row.streaming}</td>
              <td style={{ padding: '8px 10px' }}>{row.connections}</td>
              <td style={{ padding: '8px 10px' }}>
                {row.receiverUuid ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDisconnect?.(row.receiverUuid);
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: 11,
                      borderRadius: 4,
                      border: '1px solid #7f1d1d',
                      backgroundColor: '#450a0a',
                      color: '#fecaca',
                      cursor: 'pointer',
                    }}
                  >
                    Disconnect
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <div style={{ padding: 24, color: '#6b7280', textAlign: 'center' }}>No receivers found</div>
      ) : null}
    </div>
  );
}
