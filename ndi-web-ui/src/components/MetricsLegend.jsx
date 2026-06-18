export default function MetricsLegend({ onClose }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 96,
        left: 16,
        zIndex: 12,
        maxWidth: 360,
        padding: '12px 14px',
        borderRadius: 8,
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        border: '1px solid #374151',
        color: '#e5e7eb',
        fontSize: 12,
        lineHeight: 1.5,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong style={{ color: '#fff' }}>Metrics legend</strong>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
          }}
          aria-label="Close legend"
        >
          ×
        </button>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        <li><strong>Connected RX</strong> — NDI receivers connected to the sender</li>
        <li><strong>Active ch</strong> — sender channels with active signal</li>
        <li><strong>Streaming</strong> (receiver) — channel actually receiving media</li>
        <li><strong>Green edge</strong> — connection confirmed by NDI</li>
        <li><strong>Yellow edge</strong> — connect command sent, awaiting confirmation</li>
      </ul>
    </div>
  );
}
