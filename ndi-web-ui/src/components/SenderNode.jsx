import { Handle, Position } from '@xyflow/react';

const tallyChip = {
  pgm: {
    padding: '2px 4px',
    borderRadius: '3px',
    backgroundColor: '#dc2626',
    color: 'white',
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '0.04em',
    lineHeight: 1.2,
  },
  pvw: {
    padding: '2px 4px',
    borderRadius: '3px',
    backgroundColor: '#16a34a',
    color: 'white',
    fontSize: '9px',
    fontWeight: '700',
    letterSpacing: '0.04em',
    lineHeight: 1.2,
  },
};

function channelTallyProgram(c) {
  return c?.tallyOnProgram === true || c?.tallyOnProgram === 'true';
}

function channelTallyPreview(c) {
  return c?.tallyOnPreview === true || c?.tallyOnPreview === 'true';
}

// Color schemes for different connection states
const COLOR_SCHEMES = {
  green: {
    border: '#10b981',
    gradient: ['#064e3b', '#065f46'],
    indicator: '#4ade80',
    badge: '#16a34a',
    handle: '#10b981',
    handleBorder: '#6ee7b7'
  },
  orange: {
    border: '#A35304',
    gradient: ['#7c2d12', '#92400e'],
    indicator: '#fb923c',
    badge: '#c2410c',
    handle: '#A35304',
    handleBorder: '#fb923c'
  },
  purple: {
    border: '#7c3aed',
    gradient: ['#4c1d95', '#5b21b6'],
    indicator: '#a78bfa',
    badge: '#7c3aed',
    handle: '#7c3aed',
    handleBorder: '#a78bfa'
  },
  gray: {
    border: '#4b5563',
    gradient: ['#1f2937', '#374151'],
    indicator: '#6b7280',
    badge: '#6b7280',
    handle: '#4b5563',
    handleBorder: '#6b7280'
  }
};

// Determine color scheme based on connection state
const getColorScheme = (isActive, connectionState) => {
  if (!isActive) return COLOR_SCHEMES.gray;

  switch (connectionState) {
    case 'mixed':
      return COLOR_SCHEMES.purple;  // Connected to BOTH full and audio-only receivers
    case 'audio':
      return COLOR_SCHEMES.orange;  // Connected ONLY to audio-only receivers
    case 'full':
      return COLOR_SCHEMES.green;   // Connected ONLY to full video+audio receivers
    default:
      return COLOR_SCHEMES.gray;
  }
};

const styles = {
  node: (colorScheme) => ({
    position: 'relative',
    overflow: 'hidden',
    padding: '12px 16px',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
    borderRadius: '8px',
    border: `2px solid ${colorScheme.border}`,
    minWidth: '280px',
    background: `linear-gradient(to bottom right, ${colorScheme.gradient[0]}, ${colorScheme.gradient[1]})`,
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
  indicator: (colorScheme, isActive) => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: colorScheme.indicator,
    animation: isActive ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
  }),
  badge: (colorScheme) => ({
    fontSize: '12px',
    backgroundColor: colorScheme.badge,
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
  channelLabel: {
    position: 'absolute',
    transform: 'translateY(-50%)',
    right: '22px',
    color: '#d1d5db',
    fontSize: '11px',
    fontFamily: 'monospace',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    maxWidth: '100px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    pointerEvents: 'none',
    textAlign: 'right',
  },
};

export default function SenderNode({ data }) {
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

  const getChannelConnectorLabel = (channel, idx) => {
    const numeric = Number.isFinite(channel?.channelIndex) ? channel.channelIndex : (idx + 1);
    const safe = numeric > 0 ? numeric : (idx + 1);
    return `Output ${String(safe).padStart(2, '0')}`;
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

    const deviceTallyPgm = channels.some(channelTallyProgram);
    const deviceTallyPvw = channels.some(channelTallyPreview);

    return (
      <div style={{ ...styles.node(COLOR_SCHEMES.green), minHeight: `${nodeMinHeight}px` }}>
        <style>{`
          @keyframes tallyPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.55; }
          }
        `}</style>
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.indicator(COLOR_SCHEMES.green, true)} />
            <span>SENDER DEVICE</span>
          </div>
          <span style={styles.badge(COLOR_SCHEMES.green)}>
            {channels.length} ch
          </span>
        </div>

        <div style={styles.appValue}>{appDisplayName}</div>
        {appSubDisplayName && (
          <div style={styles.appSubValue}>{appSubDisplayName}</div>
        )}

        {(deviceTallyPgm || deviceTallyPvw) && (
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
            {deviceTallyPgm && (
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
                animation: 'tallyPulse 1.5s ease-in-out infinite',
              }}>PGM</div>
            )}
            {deviceTallyPvw && (
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

        {channels.map((channel, idx) => (
          <Handle
            key={`out-${channel.channelId}-${idx}`}
            id={`out-${channel.channelId}`}
            type="source"
            position={Position.Right}
            style={{
              top: `${channelsStartTop + (idx * channelRowHeight)}px`,
              width: '12px',
              height: '12px',
              backgroundColor: COLOR_SCHEMES.green.handle,
              border: `2px solid ${COLOR_SCHEMES.green.handleBorder}`,
            }}
            title={getChannelConnectorLabel(channel, idx)}
          />
        ))}

        {channels.map((channel, idx) => (
          <div
            key={`out-label-${channel.channelId}-${idx}`}
            style={{
              ...styles.channelLabel,
              top: `${channelsStartTop + (idx * channelRowHeight)}px`,
            }}
            title={getChannelConnectorLabel(channel, idx)}
          >
            {getChannelConnectorLabel(channel, idx)}
          </div>
        ))}

        {channels.map((channel, idx) => {
          const pgm = channelTallyProgram(channel);
          const pvw = channelTallyPreview(channel);
          if (!pgm && !pvw) return null;
          const top = `${channelsStartTop + (idx * channelRowHeight)}px`;
          return (
            <div
              key={`out-tally-${channel.channelId}-${idx}`}
              style={{
                position: 'absolute',
                transform: 'translateY(-50%)',
                right: '128px',
                top,
                display: 'flex',
                gap: '3px',
                pointerEvents: 'none',
              }}
            >
              {pgm && <span style={{ ...tallyChip.pgm, animation: 'tallyPulse 1.5s ease-in-out infinite' }}>PGM</span>}
              {pvw && <span style={tallyChip.pvw}>PVW</span>}
            </div>
          );
        })}
      </div>
    );
  }

  const { name, hostName, address, port, width, height, frameRate, videoCodec, audioCodec,
          audioChannels, audioSampleRate, connectionCount, status, connectionState,
          groups, tallyOnProgram, tallyOnPreview, webControlUrl, droppedFrames } = data;

  const isActive = status === 'Active';
  const colorScheme = getColorScheme(isActive, connectionState);

  // Get connection state label
  const getConnectionLabel = () => {
    switch (connectionState) {
      case 'mixed':
        return 'Mixed (Video + Audio-Only)';
      case 'audio':
        return 'Audio-Only';
      case 'full':
        return 'Full (Video + Audio)';
      default:
        return '';
    }
  };

  return (
    <div style={styles.node(colorScheme)}>
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
          <div style={styles.indicator(colorScheme, isActive)} />
          <span>SENDER</span>
        </div>
        {connectionCount > 0 && (
          <span style={styles.badge(colorScheme)}>
            {connectionCount} connected
          </span>
        )}
      </div>

      {/* Connection State Badge (for mixed connections) */}
      {connectionState === 'mixed' && (
        <div style={{
          fontSize: '11px',
          color: '#e9d5ff',
          backgroundColor: 'rgba(124, 58, 237, 0.3)',
          padding: '4px 8px',
          borderRadius: '4px',
          marginBottom: '8px',
          textAlign: 'center',
          fontWeight: '500'
        }}>
          {getConnectionLabel()}
        </div>
      )}

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

        {address && port > 0 && (
          <div style={styles.infoRow}>
            <span style={styles.label}>Endpoint:</span>
            <span style={styles.value}>{address}:{port}</span>
          </div>
        )}

        {groups && groups.length > 0 && (
          <div style={styles.infoRow}>
            <span style={styles.label}>Groups:</span>
            <span style={styles.value}>{groups.join(', ')}</span>
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
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        style={{
          width: '12px',
          height: '12px',
          backgroundColor: colorScheme.handle,
          border: `2px solid ${colorScheme.handleBorder}`,
        }}
      />
    </div>
  );
}
