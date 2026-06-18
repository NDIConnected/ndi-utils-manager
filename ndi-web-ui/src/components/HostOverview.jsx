const panel = {
  root: {
    width: '300px',
    minWidth: '300px',
    height: '100%',
    borderRight: '1px solid #374151',
    backgroundColor: '#0f172a',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    padding: '12px 14px',
    borderBottom: '1px solid #374151',
    color: '#e5e7eb',
    fontSize: '13px',
    fontWeight: '600',
  },
  hint: {
    padding: '8px 14px',
    fontSize: '11px',
    color: '#9ca3af',
    borderBottom: '1px solid #1f2937',
    lineHeight: 1.4,
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px',
  },
  row: (selected) => ({
    width: '100%',
    textAlign: 'left',
    padding: '10px 12px',
    marginBottom: '6px',
    borderRadius: '8px',
    border: selected ? '1px solid #3b82f6' : '1px solid #374151',
    backgroundColor: selected ? '#1e3a5f' : '#1f2937',
    color: '#e5e7eb',
    cursor: 'pointer',
  }),
  rowTitle: {
    fontSize: '14px',
    fontWeight: '600',
    marginBottom: '4px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowSub: {
    fontSize: '11px',
    color: '#9ca3af',
    marginBottom: '6px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  stats: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    fontSize: '11px',
  },
  chip: (color) => ({
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: color,
    color: '#f9fafb',
    fontWeight: '500',
  }),
  allRow: (selected) => ({
    width: '100%',
    textAlign: 'left',
    padding: '10px 12px',
    marginBottom: '10px',
    borderRadius: '8px',
    border: selected ? '1px solid #3b82f6' : '1px dashed #4b5563',
    backgroundColor: selected ? '#1e3a5f' : '#111827',
    color: '#e5e7eb',
    cursor: 'pointer',
  }),
};

function StatChip({ label, value, color }) {
  if (!value) return null;
  return <span style={panel.chip(color)}>{value} {label}</span>;
}

export default function HostOverview({
  hostGroups,
  selectedHostKeys,
  onHostClick,
  onClearHostSelection,
  totalSenders,
  totalReceivers,
}) {
  const hasSelection = selectedHostKeys.size > 0;

  return (
    <aside style={panel.root}>
      <div style={panel.header}>Hosts</div>
      <div style={panel.hint}>
        Click a host to focus the canvas. Ctrl+Click to combine multiple hosts (e.g. HOST 01 + HOST 02).
      </div>
      <div style={panel.list}>
        <button
          type="button"
          style={panel.allRow(!hasSelection)}
          onClick={onClearHostSelection}
        >
          <div style={panel.rowTitle}>All hosts</div>
          <div style={panel.stats}>
            <StatChip label="sender dev." value={totalSenders} color="#065f46" />
            <StatChip label="recv dev." value={totalReceivers} color="#1e3a8a" />
          </div>
        </button>

        {hostGroups.map((host) => {
          const selected = selectedHostKeys.has(host.key);
          const active =
            host.streamingSenders + host.streamingReceivers + host.connectionCount > 0;
          return (
            <button
              key={host.key}
              type="button"
              style={{
                ...panel.row(selected),
                opacity: active ? 1 : 0.72,
              }}
              onClick={(e) => onHostClick(host.key, e)}
            >
              <div style={panel.rowTitle} title={host.label}>
                {host.label}
              </div>
              {host.address && host.address !== host.label && (
                <div style={panel.rowSub} title={host.address}>
                  {host.address}
                </div>
              )}
              <div style={panel.stats}>
                <StatChip
                  label="snd ch"
                  value={host.senderChannels || null}
                  color="#047857"
                />
                <StatChip
                  label="rcv ch"
                  value={host.receiverChannels || null}
                  color="#1d4ed8"
                />
                <StatChip
                  label="streaming"
                  value={
                    host.streamingSenders + host.streamingReceivers > 0
                      ? host.streamingSenders + host.streamingReceivers
                      : null
                  }
                  color="#7c2d12"
                />
                <StatChip
                  label="link"
                  value={host.connectionCount || null}
                  color="#5b21b6"
                />
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
