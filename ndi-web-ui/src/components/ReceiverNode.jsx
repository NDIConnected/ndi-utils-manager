import { Handle, Position } from '@xyflow/react';

const styles = {
  node: (isConnected) => ({
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
};

export default function ReceiverNode({ data }) {
  const { name, hostName, currentSource, isConnected, status, width, height,
          frameRate, videoCodec, audioCodec, audioChannels, audioSampleRate } = data;

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

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.indicator(isConnected)} />
          <span>📺 RECEIVER</span>
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
