import { Handle, Position } from '@xyflow/react';

const styles = {
  node: (isConnected) => ({
    position: 'relative',
    overflow: 'hidden',
    padding: '12px 16px',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
    borderRadius: '8px',
    border: `2px solid ${isConnected ? '#3b82f6' : '#4b5563'}`,
    minWidth: '280px',
    background: isConnected
      ? 'linear-gradient(to bottom right, #1e3a8a, #1e40af)'
      : 'linear-gradient(to bottom right, #1f2937, #374151)',
  }),
  header: {
    fontWeight: 'bold',
    color: 'white',
    fontSize: '14px',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  indicator: (isConnected) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: isConnected ? '#60a5fa' : '#6b7280',
    animation: isConnected ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
  }),
  badge: (isConnected) => ({
    fontSize: '12px',
    backgroundColor: isConnected ? '#2563eb' : '#4b5563',
    padding: '2px 8px',
    borderRadius: '9999px',
  }),
  name: {
    color: 'white',
    fontWeight: '600',
    marginBottom: '12px',
    fontSize: '16px',
  },
  appValue: {
    color: 'white',
    fontWeight: '600',
    marginBottom: '4px',
    fontSize: '16px',
    lineHeight: 1.2,
  },
  appSubValue: {
    color: '#cbd5e1',
    fontWeight: '500',
    marginBottom: '10px',
    fontSize: '13px',
    lineHeight: 1.2,
  },
  infoGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '12px',
    color: '#d1d5db',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
  },
  label: {
    color: '#9ca3af',
  },
  value: {
    fontFamily: 'monospace',
  },
  codecValue: {
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#93c5fd',
  },
  connectedSection: {
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid #4b5563',
  },
  connectedLabel: {
    color: '#9ca3af',
    marginBottom: '4px',
    fontSize: '12px',
  },
  connectedSource: {
    fontFamily: 'monospace',
    color: '#6ee7b7',
    fontWeight: '600',
    fontSize: '12px',
  },
  notConnected: {
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid #4b5563',
    color: '#6b7280',
    fontStyle: 'italic',
    fontSize: '12px',
  },
  channelLabel: {
    position: 'absolute',
    transform: 'translateY(-50%)',
    left: '22px',
    color: '#d1d5db',
    fontSize: '11px',
    fontFamily: 'monospace',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    maxWidth: '130px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    pointerEvents: 'none',
  },
};

export default function ReceiverNode({ data }) {
  const getChannelDisplayLabel = (label, fallback) => {
    const raw = (label || fallback || '').trim();
    const withoutBracketMetadata = raw.replace(/\s*\[.*$/, '').trim();
    const parenStart = withoutBracketMetadata.indexOf('(');
    if (parenStart >= 0) {
      const candidate = withoutBracketMetadata
        .slice(parenStart + 1)
        .replace(/\)\s*$/, '')
        .trim();
      if (candidate) return candidate;
    }

    return (withoutBracketMetadata || fallback || '').trim();
  };

  const splitDeviceAndAppNames = (label) => {
    const raw = (label || '').trim().replace(/\s*\[.*$/, '').trim();
    if (!raw) return { deviceName: '', appName: '' };

    const parenStart = raw.indexOf('(');
    if (parenStart >= 0) {
      const deviceName = raw.slice(0, parenStart).trim();
      const appName = raw.slice(parenStart + 1).replace(/\)\s*$/, '').trim();
      return { deviceName, appName };
    }

    return { deviceName: raw, appName: '' };
  };

  const getConnectionLabel = (channel, idx) => {
    const numeric = Number.isFinite(channel?.channelIndex) ? channel.channelIndex : (idx + 1);
    const safe = numeric > 0 ? numeric : (idx + 1);
    return `Input ${String(safe).padStart(2, '0')}`;
  };

  if (data?.isAggregated) {
    const channels = Array.isArray(data.channels) ? data.channels : [];
    const streamingChannels = channels.filter(c => c.isStreaming);
    const channelsStartTop = 242;
    const channelRowHeight = 24;
    const nodeMinHeight = Math.max(290, channelsStartTop + (channels.length * channelRowHeight) + 14);
    const firstLabel = channels.find((c) => c?.streamLabel)?.streamLabel || '';
    const { deviceName: inferredDeviceName, appName: inferredAppName } = splitDeviceAndAppNames(firstLabel);
    const appDisplayName = data.applicationId !== 'unknown'
      ? data.applicationId
      : (inferredDeviceName || data.displayName || 'unknown');
    const appSubDisplayName = data.applicationId === 'unknown' ? inferredAppName : '';

    return (
      <div style={{ ...styles.node(streamingChannels.length > 0), minHeight: `${nodeMinHeight}px` }}>
        {channels.map((channel, idx) => (
          <Handle
            key={`in-${channel.channelId}-${idx}`}
            id={`in-${channel.channelId}`}
            type="target"
            position={Position.Left}
            style={{
              top: `${channelsStartTop + (idx * channelRowHeight)}px`,
              width: '12px',
              height: '12px',
              backgroundColor: '#3b82f6',
              border: '2px solid #93c5fd',
            }}
            title={getConnectionLabel(channel, idx)}
          />
        ))}

        {channels.map((channel, idx) => (
          <div
            key={`in-label-${channel.channelId}-${idx}`}
            style={{
              ...styles.channelLabel,
              top: `${channelsStartTop + (idx * channelRowHeight)}px`,
            }}
            title={getConnectionLabel(channel, idx)}
          >
            {getConnectionLabel(channel, idx)}
          </div>
        ))}

        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.indicator(streamingChannels.length > 0)} />
            <span>RECEIVER DEVICE</span>
          </div>
          <span style={styles.badge(streamingChannels.length > 0)}>
            {channels.length} ch
          </span>
        </div>

        <div style={styles.appValue}>{appDisplayName}</div>
        {appSubDisplayName && (
          <div style={styles.appSubValue}>{appSubDisplayName}</div>
        )}
        <div style={styles.infoGrid}>
          <div style={styles.infoRow}>
            <span style={styles.label}>Address:</span>
            <span style={styles.value}>{data.address || '-'}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.label}>Streaming:</span>
            <span style={styles.value}>{`${streamingChannels.length}/${channels.length}`}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.label}>Video:</span>
            <span style={styles.value}>{data.videoSummary || '-'}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.label}>Audio:</span>
            <span style={styles.value}>{data.audioSummary || '-'}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.label}>Res/FPS:</span>
            <span style={styles.value}>{`${data.resolutionSummary || '-'} / ${data.frameRateSummary || '-'}`}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.label}>Ports:</span>
            <span style={styles.value}>{data.portSummary || '-'}</span>
          </div>
        </div>
      </div>
    );
  }

  const { name, hostName, address, currentSource, isConnected, status, width, height,
          frameRate, videoCodec, audioCodec, audioChannels, audioSampleRate,
          streams, commands, tallyOnProgram, tallyOnPreview, webControlUrl, droppedFrames } = data;

  return (
    <div style={styles.node(isConnected)}>
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: .5;
          }
        }
      `}</style>

      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: '12px',
          height: '12px',
          backgroundColor: '#3b82f6',
          border: '2px solid #93c5fd',
        }}
      />

      {/* Tally Bar */}
      {(tallyOnProgram || tallyOnPreview) && (
        <div style={{
          display: 'flex',
          gap: '4px',
          marginBottom: '8px',
        }}>
          {tallyOnProgram && (
            <div style={{
              flex: 1,
              padding: '3px 0',
              borderRadius: '4px',
              backgroundColor: '#dc2626',
              color: 'white',
              textAlign: 'center',
              fontSize: '11px',
              fontWeight: '700',
              letterSpacing: '0.05em',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}>PGM</div>
          )}
          {tallyOnPreview && (
            <div style={{
              flex: 1,
              padding: '3px 0',
              borderRadius: '4px',
              backgroundColor: '#16a34a',
              color: 'white',
              textAlign: 'center',
              fontSize: '11px',
              fontWeight: '700',
              letterSpacing: '0.05em',
            }}>PVW</div>
          )}
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.indicator(isConnected)} />
          <span>RECEIVER</span>
        </div>
        <span style={styles.badge(isConnected)}>
          {status}
        </span>
      </div>

      {/* Name */}
      <div style={styles.name}>
        {name}
      </div>

      {/* Info Grid */}
      <div style={styles.infoGrid}>
        <div style={styles.infoRow}>
          <span style={styles.label}>Host:</span>
          <span style={styles.value}>{hostName}</span>
        </div>

        {width && height && (
          <div style={styles.infoRow}>
            <span style={styles.label}>Resolution:</span>
            <span style={styles.value}>{width}x{height}</span>
          </div>
        )}

        {frameRate && (
          <div style={styles.infoRow}>
            <span style={styles.label}>Frame Rate:</span>
            <span style={styles.value}>{frameRate.toFixed(2)} fps</span>
          </div>
        )}

        {videoCodec && (
          <div style={styles.infoRow}>
            <span style={styles.label}>Video Codec:</span>
            <span style={styles.codecValue}>{videoCodec}</span>
          </div>
        )}

        {audioCodec && (
          <div style={styles.infoRow}>
            <span style={styles.label}>Audio:</span>
            <span style={styles.value}>{audioCodec} {audioChannels}ch/{audioSampleRate}Hz</span>
          </div>
        )}

        {address && (
          <div style={styles.infoRow}>
            <span style={styles.label}>Address:</span>
            <span style={styles.value}>{address}</span>
          </div>
        )}

        {streams && streams.length > 0 && (
          <div style={styles.infoRow}>
            <span style={styles.label}>Streams:</span>
            <span style={styles.value}>{streams.join(', ')}</span>
          </div>
        )}

        {droppedFrames > 0 && (
          <div style={styles.infoRow}>
            <span style={styles.label}>Dropped:</span>
            <span style={{ ...styles.value, color: '#f87171' }}>{droppedFrames}</span>
          </div>
        )}

        {webControlUrl && (
          <div style={{ marginTop: '4px' }}>
            <a href={webControlUrl} target="_blank" rel="noopener noreferrer"
               style={{ color: '#93c5fd', fontSize: '11px', textDecoration: 'underline' }}>
              Web Control
            </a>
          </div>
        )}

        {currentSource ? (
          <div style={styles.connectedSection}>
            <div style={styles.connectedLabel}>Connected to:</div>
            <div style={styles.connectedSource}>
              {currentSource}
            </div>
          </div>
        ) : (
          <div style={styles.notConnected}>
            Not connected
          </div>
        )}
      </div>
    </div>
  );
}
