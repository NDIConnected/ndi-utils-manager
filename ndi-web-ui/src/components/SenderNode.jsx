import { Handle, Position } from '@xyflow/react';

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
};

export default function SenderNode({ data }) {
  const { name, hostName, width, height, frameRate, videoCodec, audioCodec,
          audioChannels, audioSampleRate, connectionCount, status, connectionState } = data;

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

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.indicator(colorScheme, isActive)} />
          <span>📡 SENDER</span>
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
