import { Handle, Position } from '@xyflow/react';
import { pickPrimaryCompactChannel } from './compactNodeHelpers';

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
