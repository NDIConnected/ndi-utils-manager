export default function ChannelDetailDrawer({ detail, onClose }) {
  if (!detail) return null;

  const { device, channel, role } = detail;
  const rows = [
    ['Host', device?.hostName || device?.address || '—'],
    ['Application', device?.applicationId || '—'],
    ['Channel', channel?.streamLabel || channel?.endpointName || '—'],
    ...(channel?.upstreamLabel ? [['Upstream', channel.upstreamLabel]] : []),
    ...(channel?.isBridgeOutput ? [['Type', 'Bridge transcoded output']] : []),
    ...(channel?.hasBridgeMirror ? [['Bridge mirror', channel.bridgeMirrorLabel || 'Available on NDI Bridge']] : []),
    ['UUID', channel?.endpointUuid || '—'],
    ['Source', channel?.currentSource || '—'],
    ['Video codec', channel?.videoCodec || '—'],
    ['Audio codec', channel?.audioCodec || '—'],
    ['Resolution', channel?.width && channel?.height ? `${channel.width}×${channel.height}` : '—'],
    ['Frame rate', channel?.frameRateN && channel?.frameRateD ? `${channel.frameRateN}/${channel.frameRateD}` : '—'],
    ['Connections', String(channel?.connectionCount ?? 0)],
    ['Streaming', channel?.isStreaming ? 'Yes' : 'No'],
    ['Dropped frames', String(channel?.droppedFrames ?? 0)],
    ['Address', channel?.address ? `${channel.address}:${channel.port}` : '—'],
  ];

  return (
    <div
      style={{
        width: 320,
        flexShrink: 0,
        borderLeft: '1px solid #374151',
        backgroundColor: '#111827',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <div
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid #374151',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>
            {role === 'sender' ? 'Output' : 'Input'} detail
          </div>
          <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 2 }}>
            {device?.displayName || '—'}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            fontSize: 18,
          }}
          aria-label="Close detail"
        >
          ×
        </button>
      </div>
      <div style={{ padding: '12px 14px', overflowY: 'auto', flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <td style={{ color: '#9ca3af', padding: '6px 8px 6px 0', verticalAlign: 'top', width: '38%' }}>
                  {label}
                </td>
                <td style={{ color: '#e5e7eb', padding: '6px 0', wordBreak: 'break-word' }}>
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
