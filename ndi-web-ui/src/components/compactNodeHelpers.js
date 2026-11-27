// Style/prop helpers and channel picking shared by the compact and detailed node views.

export function pickPrimaryCompactChannel(channels, connectedChannelIds = new Set()) {
  if (!Array.isArray(channels) || channels.length === 0) return null;
  const ids = connectedChannelIds instanceof Set
    ? connectedChannelIds
    : new Set(connectedChannelIds || []);

  return (
    channels.find((channel) => ids.has(channel.channelId) || channel.isConnected || channel.isStreaming)
    || channels[0]
  );
}

/** '#rrggbb' → 'rgba(r, g, b, alpha)'; other colour strings are returned unchanged. */
export function hexToRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Glass card surface: translucent tinted gradient over the dark canvas, hairline border in the state colour,
 * soft inner highlight and a faint glow. No backdrop-filter (too costly with many nodes while zooming).
 */
export function glassSurface({ border, from, to, radius = 12 }) {
  return {
    borderRadius: radius,
    border: `1px solid ${hexToRgba(border, 0.7)}`,
    background: `linear-gradient(150deg, ${hexToRgba(from, 0.82)} 0%, ${hexToRgba(to, 0.6)} 100%), rgba(8, 12, 22, 0.55)`,
    boxShadow: [
      '0 18px 36px -18px rgba(0, 0, 0, 0.85)',
      'inset 0 1px 0 rgba(255, 255, 255, 0.09)',
      'inset 0 0 0 1px rgba(255, 255, 255, 0.02)',
      `0 0 24px -10px ${hexToRgba(border, 0.55)}`,
    ].join(', '),
  };
}

export function compactCardStyle({ border, gradientFrom, gradientTo, minWidth = 200, handleSide = 'right' }) {
  return {
    position: 'relative',
    overflow: 'visible',
    padding: '10px 12px',
    paddingRight: handleSide === 'right' ? 18 : 12,
    paddingLeft: handleSide === 'left' ? 18 : 12,
    minWidth: `${minWidth}px`,
    maxWidth: '240px',
    ...glassSurface({ border, from: gradientFrom, to: gradientTo, radius: 10 }),
  };
}

export function compactHeaderStyle() {
  return {
    fontWeight: 700,
    color: 'white',
    fontSize: '11px',
    letterSpacing: '0.04em',
    marginBottom: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  };
}

export function nodeDragHandleProps(style = {}) {
  return {
    className: 'node-drag-handle',
    title: 'Drag to move',
    style: {
      cursor: 'grab',
      ...style,
    },
  };
}

export function compactTitleStyle() {
  return {
    color: 'white',
    fontWeight: 700,
    fontSize: '22px',
    lineHeight: 1.1,
    marginBottom: '8px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };
}

export function compactToggleTitleProps(onToggle) {
  return {
    className: 'nodrag nopan',
    role: 'button',
    tabIndex: 0,
    title: 'Click to expand or compact',
    style: {
      ...compactTitleStyle(),
      cursor: 'pointer',
      textDecoration: 'underline',
      textDecorationStyle: 'dotted',
      textUnderlineOffset: '3px',
    },
    onClick: (e) => {
      e.stopPropagation();
      e.preventDefault();
      onToggle?.();
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.stopPropagation();
        e.preventDefault();
        onToggle?.();
      }
    },
  };
}

export function detailedToggleTitleProps(onToggle) {
  return {
    className: 'nodrag nopan',
    role: 'button',
    tabIndex: 0,
    title: 'Click to compact',
    style: {
      cursor: 'pointer',
      textDecoration: 'underline',
      textDecorationStyle: 'dotted',
      textUnderlineOffset: '3px',
    },
    onClick: (e) => {
      e.stopPropagation();
      e.preventDefault();
      onToggle?.();
    },
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.stopPropagation();
        e.preventDefault();
        onToggle?.();
      }
    },
  };
}

export function compactAddressRowStyle() {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    fontSize: '11px',
    color: '#d1d5db',
  };
}

/** Card title in NDI naming style: "HOST (Stream)", or just the stream when the host is unknown. */
export function formatCardTitle(machineName, streamName) {
  const stream = (streamName || '').trim();
  return machineName ? `${machineName} (${stream})` : stream;
}

/**
 * Machine (PC / hardware device) publishing the NDI endpoints: the "HOST" part of "HOST (App)".
 * Prefers the raw prefix of the stream name (keeps spaces/case) over the backend's sanitized hostName.
 * Returns '' when unknown, for Bridge hubs (the title already names the bridge host) or when it would repeat the title.
 */
export function resolveMachineName(data, inferredDeviceName, title) {
  if (data?.isBridgeHub) return '';
  const name = (inferredDeviceName || data?.hostName || '').trim();
  if (!name || name.toLowerCase() === 'unknown') return '';
  if (name.localeCompare((title || '').trim(), undefined, { sensitivity: 'accent' }) === 0) return '';
  return name;
}
