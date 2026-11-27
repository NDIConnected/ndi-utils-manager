import { Handle, Position } from '@xyflow/react';
import { hexToRgba, pickPrimaryCompactChannel } from './compactNodeHelpers';

/**
 * Invisible, non-connectable handles for connected channels that a collapsed node does not list,
 * anchored where the "+N channels" button is, so their edges are still drawn.
 */
export function HiddenChannelHandles({
  channels,
  visibleChannels,
  connectedChannelIds,
  prefix,
  handleType,
  position,
  handleStyle,
}) {
  const visibleIds = new Set((visibleChannels || []).map((c) => c.channelId));
  const ids = connectedChannelIds instanceof Set ? connectedChannelIds : new Set(connectedChannelIds || []);
  const hidden = (channels || []).filter((c) => !visibleIds.has(c.channelId) && ids.has(c.channelId));
  if (hidden.length === 0) return null;
  return hidden.map((channel) => (
    <Handle
      key={`${prefix}-hidden-${channel.channelId}`}
      id={`${prefix}-${channel.channelId}`}
      type={handleType}
      position={position}
      isConnectable={false}
      style={{ ...handleStyle, opacity: 0, pointerEvents: 'none' }}
    />
  ));
}

export function CompactStackedHandles({
  channels,
  prefix,
  handleType,
  position,
  connectedChannelIds,
  visibleHandleStyle,
  getTitle,
}) {
  if (!channels.length) return null;

  const primary = pickPrimaryCompactChannel(channels, connectedChannelIds);
  const primaryId = primary?.channelId;

  return channels.map((channel, idx) => {
    const isPrimary = channel.channelId === primaryId;
    return (
      <Handle
        key={`${prefix}-${channel.channelId}-${idx}`}
        id={`${prefix}-${channel.channelId}`}
        type={handleType}
        position={position}
        title={getTitle?.(channel, idx) || ''}
        style={{
          ...visibleHandleStyle,
          top: '50%',
          opacity: isPrimary ? 1 : 0,
          width: isPrimary ? (visibleHandleStyle?.width ?? 12) : 1,
          height: isPrimary ? (visibleHandleStyle?.height ?? 12) : 1,
          pointerEvents: isPrimary ? 'all' : 'none',
          zIndex: isPrimary ? 2 : 1,
        }}
      />
    );
  });
}

/**
 * Small round chevron button that minimizes a card to a single line (chevron up) or restores it
 * (chevron down). Not draggable, so clicking it never starts a node drag.
 */
export function CollapseToggle({ collapsed, onToggle }) {
  const label = collapsed ? 'Expand card' : 'Minimize card';
  return (
    <button
      type="button"
      className="nodrag nopan ndi-collapse-toggle"
      aria-label={label}
      aria-expanded={!collapsed}
      title={`${label} (double-click the header)`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle?.();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"
        style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 160ms ease' }}
      >
        <path d="M3 7.5 L6 4.5 L9 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/**
 * One-line "pill" card: role chip (SENDER / RECEIVER), activity dot and "HOST (Stream)" title.
 * Keeps one handle per channel (stacked) so existing edges stay attached and new ones can be dropped.
 * The whole pill drags the node; double-click or the chevron restores the full card.
 */
export function MiniNodeCard({
  role,
  title,
  active,
  scheme,
  tags = [],
  warning,
  channels,
  connectedChannelIds,
  handleStyle,
  getHandleTitle,
  onExpand,
}) {
  const isSender = role === 'sender';
  return (
    <div
      className={`node-drag-handle ndi-card-enter ndi-mini-card ndi-card--${isSender ? 'sender' : 'receiver'}`}
      title={title}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onExpand?.();
      }}
      style={{
        '--mini-accent': scheme.accent,
        borderColor: hexToRgba(scheme.border, 0.75),
        background: `linear-gradient(90deg, ${hexToRgba(scheme.from, 0.85)}, ${hexToRgba(scheme.to, 0.6)}), rgba(8, 12, 22, 0.6)`,
        boxShadow: `0 10px 22px -12px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 0 18px -8px ${hexToRgba(scheme.border, 0.6)}`,
      }}
    >
      {!isSender && (
        <CompactStackedHandles
          channels={channels}
          prefix="in"
          handleType="target"
          position={Position.Left}
          connectedChannelIds={connectedChannelIds}
          visibleHandleStyle={handleStyle}
          getTitle={getHandleTitle}
        />
      )}
      <span className="ndi-mini-dot" data-active={active ? 'true' : 'false'} />
      <span className="ndi-mini-role">{isSender ? 'SENDER' : 'RECEIVER'}</span>
      {tags.map((tag) => (
        <span key={tag} className="ndi-mini-tag">{tag}</span>
      ))}
      <span className="ndi-mini-title">{title}</span>
      {warning ? <span aria-label="Channel warning" title="Channel warning">⚠️</span> : null}
      <CollapseToggle collapsed onToggle={onExpand} />
      {isSender && (
        <CompactStackedHandles
          channels={channels}
          prefix="out"
          handleType="source"
          position={Position.Right}
          connectedChannelIds={connectedChannelIds}
          visibleHandleStyle={handleStyle}
          getTitle={getHandleTitle}
        />
      )}
    </div>
  );
}
