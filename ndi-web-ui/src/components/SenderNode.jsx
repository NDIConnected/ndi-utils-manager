import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { COLLAPSE_CHANNELS_THRESHOLD } from '../utils/deviceGrouping';
import { formatCount, channelStat } from '../utils/formatStats';
import { channelHealthWarning, sumDroppedFrames } from '../utils/channelHealth';
import SenderStatsSections from './SenderStatsSections';
import {
  HiddenChannelHandles,
  CompactStackedHandles,
  compactCardStyle,
  compactHeaderStyle,
  compactAddressRowStyle,
  compactToggleTitleProps,
  detailedToggleTitleProps,
  nodeDragHandleProps,
} from './CompactNodeParts';

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
    overflow: 'visible',
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
  channelRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '8px',
    minHeight: '24px',
    marginTop: '8px',
    marginLeft: '-16px',
    marginRight: '-16px',
    paddingLeft: '16px',
    paddingRight: '8px',
    position: 'relative',
  },
  channelRowLabel: {
    color: '#d1d5db',
    fontSize: '11px',
    fontFamily: 'monospace',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    marginRight: '12px',
  },
  channelHandle: (colorScheme) => ({
    position: 'absolute',
    right: '-7px',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '12px',
    height: '12px',
    backgroundColor: colorScheme.handle,
    border: `2px solid ${colorScheme.handleBorder}`,
  }),
};

function SenderNode({ data }) {
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

  const getBridgeChannelLabel = (channel, idx) => {
    if (channel?.upstreamLabel) return channel.upstreamLabel;
    return getChannelConnectorLabel(channel, idx);
  };

  const formatCodecBadge = (codec) => {
    if (!codec) return null;
    return String(codec).toUpperCase();
  };

  if (data?.isAggregated) {
    const channels = Array.isArray(data.channels) ? data.channels : [];
    const isLegacy = data?.isLegacyDiscovery === true;
    const isBridgeHub = data?.isBridgeHub === true;
    const deviceScheme = isBridgeHub
      ? COLOR_SCHEMES.orange
      : isLegacy
        ? COLOR_SCHEMES.gray
        : COLOR_SCHEMES.green;
    const isCollapsed = data?.isCollapsed === true;
    const connectedChannelIds = data?.connectedChannelIds instanceof Set
      ? data.connectedChannelIds
      : new Set(data?.connectedChannelIds || []);

    const pickVisibleChannels = () => {
      if (!isCollapsed) return channels;
      const prioritized = channels.filter(
        (c) => c.isStreaming || connectedChannelIds.has(c.channelId),
      );
      const pool = prioritized.length > 0 ? prioritized : channels;
      const limit = data?.maxVisibleHandles ?? 4;
      return pool.slice(0, limit);
    };

    const visibleChannels = pickVisibleChannels();
    const hiddenChannelCount = Math.max(0, channels.length - visibleChannels.length);

    const streamingChannels = channels.filter(c => c.isStreaming);
    const ndiConnectedRx = channels.reduce(
      (acc, ch) => acc + (Number(ch?.connectionCount) || 0),
      0,
    );
    const connectedRx = Math.max(ndiConnectedRx, Number(data.logicalConnectionCount) || 0);
    const firstLabel = channels.find((c) => c?.streamLabel)?.streamLabel || '';
    const { deviceName: inferredDeviceName, appName: inferredAppName } = splitDeviceAndAppNames(firstLabel);
    const appDisplayName = isBridgeHub
      ? `NDI Bridge · ${data.hostName || data.displayName || 'Bridge'}`
      : data.applicationId !== 'unknown'
        ? data.applicationId
        : (inferredDeviceName || data.displayName || 'unknown');
    const appSubDisplayName = isBridgeHub
      ? `${channels.length} transcoded output${channels.length === 1 ? '' : 's'}`
      : data.applicationId === 'unknown'
        ? inferredAppName
        : '';
    const deviceTallyPgm = channels.some(channelTallyProgram);
    const deviceTallyPvw = channels.some(channelTallyPreview);
    const totalDroppedFrames = sumDroppedFrames(channels);
    const hasWarning = channels.some((ch) => channelHealthWarning(ch));

    if (data?.compactView) {
      const cardStyle = compactCardStyle({
        border: deviceScheme.border,
        gradientFrom: deviceScheme.gradient[0],
        gradientTo: deviceScheme.gradient[1],
        handleSide: 'right',
      });
      return (
        <div style={cardStyle} title={hasWarning ? 'Channel warning' : undefined}>
          <div {...nodeDragHandleProps(compactHeaderStyle())}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <div style={styles.indicator(deviceScheme, !isLegacy && streamingChannels.length > 0)} />
              <span>SENDER DEVICE</span>
              {isBridgeHub ? <span style={{ fontSize: 9, color: '#fed7aa' }}>BRIDGE</span> : null}
              {isLegacy ? <span style={{ fontSize: 9, color: '#fcd34d' }}>LEGACY</span> : null}
              {hasWarning ? <span style={{ fontSize: 10 }}>⚠️</span> : null}
            </div>
            <span style={styles.badge(deviceScheme)}>{channels.length} ch</span>
          </div>
          <div {...compactToggleTitleProps(data?.onToggleCompactView)}>{appDisplayName}</div>
          {appSubDisplayName ? (
            <div style={{ color: '#cbd5e1', fontSize: '11px', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {appSubDisplayName}
            </div>
          ) : null}
          <div style={compactAddressRowStyle()}>
            <span style={styles.label}>Address:</span>
            <span style={styles.value}>{data.address || '—'}</span>
          </div>
          <CompactStackedHandles
            channels={channels}
            prefix="out"
            handleType="source"
            position={Position.Right}
            connectedChannelIds={connectedChannelIds}
            visibleHandleStyle={styles.channelHandle(deviceScheme)}
            getTitle={(channel, idx) => (isBridgeHub ? getBridgeChannelLabel(channel, idx) : getChannelConnectorLabel(channel, idx))}
          />
        </div>
      );
    }

    return (
      <div style={styles.node(deviceScheme)}>
        <div {...nodeDragHandleProps(styles.header)}>
          <div style={styles.headerLeft}>
            <div style={styles.indicator(deviceScheme, !isLegacy)} />
            <span>SENDER DEVICE</span>
          </div>
          <span style={styles.badge(deviceScheme)}>
            {isBridgeHub ? `${channels.length} out` : `${channels.length} ch`}
          </span>
        </div>

        {isBridgeHub && (
          <div style={{
            fontSize: '11px',
            color: '#fed7aa',
            backgroundColor: 'rgba(124, 45, 18, 0.45)',
            padding: '4px 8px',
            borderRadius: '4px',
            marginBottom: '8px',
            textAlign: 'center',
            fontWeight: 500,
          }}
          >
            Transcoded outputs — drag to connect H.264/H.265 paths
          </div>
        )}

        {isLegacy && (
          <div style={{
            fontSize: '11px',
            color: '#fcd34d',
            backgroundColor: 'rgba(120, 53, 15, 0.35)',
            padding: '4px 8px',
            borderRadius: '4px',
            marginBottom: '8px',
            textAlign: 'center',
            fontWeight: 500,
          }}
          >
            Legacy source — connect only (no SDK monitoring)
          </div>
        )}

        {(() => {
          const titleToggleProps = detailedToggleTitleProps(data?.onToggleCompactView);
          return (
            <div {...titleToggleProps} style={{ ...styles.appValue, ...titleToggleProps.style }}>
              {appDisplayName}
            </div>
          );
        })()}
        {appSubDisplayName && (
          <div style={styles.appSubValue}>{appSubDisplayName}</div>
        )}

        {!isBridgeHub && data?.hasBridgeMirror && (
          <div style={{
            fontSize: '11px',
            color: '#93c5fd',
            backgroundColor: 'rgba(30, 58, 95, 0.45)',
            padding: '4px 8px',
            borderRadius: '4px',
            marginBottom: '8px',
            textAlign: 'center',
          }}
          >
            Bridge transcoded mirror available (connect via NDI Bridge hub)
          </div>
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
          {!isLegacy && !isBridgeHub && (
            <>
              <div style={styles.infoRow}>
                <span style={styles.label}>Connected RX:</span>
                <button
                  type="button"
                  className="nodrag nopan"
                  onClick={(e) => {
                    e.stopPropagation();
                    data?.onFocusConnections?.();
                  }}
                  style={{
                    ...styles.value,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: connectedRx > 0 ? 'pointer' : 'default',
                    color: connectedRx > 0 ? '#93c5fd' : '#e5e7eb',
                    textDecoration: connectedRx > 0 ? 'underline' : 'none',
                  }}
                  title={connectedRx > 0 ? 'Highlight connections' : undefined}
                >
                  {connectedRx}
                </button>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.label}>Active ch:</span>
                <span style={styles.value}>{`${streamingChannels.length}/${channels.length}`}</span>
              </div>
              <div style={styles.infoRow}>
                <span style={styles.label}>Dropped frames:</span>
                <span style={{
                  ...styles.value,
                  color: totalDroppedFrames > 0 ? '#f87171' : undefined,
                }}
                >
                  {formatCount(totalDroppedFrames)}
                </span>
              </div>
              {!isCollapsed && (
                <>
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
                </>
              )}
            </>
          )}
          {isLegacy && (
            <div style={styles.infoRow}>
              <span style={styles.label}>Monitoring:</span>
              <span style={styles.value}>Unavailable (pre-NDI 6 sender)</span>
            </div>
          )}
          {isBridgeHub && (
            <div style={styles.infoRow}>
              <span style={styles.label}>Monitoring:</span>
              <span style={styles.value}>Per-output (transcoded)</span>
            </div>
          )}
        </div>

        {visibleChannels.map((channel, idx) => {
          const pgm = channelTallyProgram(channel);
          const pvw = channelTallyPreview(channel);
          const label = isBridgeHub
            ? getBridgeChannelLabel(channel, idx)
            : getChannelConnectorLabel(channel, idx);
          const codecBadge = formatCodecBadge(channel.videoCodec);
          const warning = channelHealthWarning(channel);
          return (
            <div
              key={`out-row-${channel.channelId}-${idx}`}
              className="nodrag nopan"
              style={{
                ...styles.channelRow,
                marginTop: idx === 0 ? '8px' : '2px',
                cursor: 'pointer',
              }}
              onClick={(e) => {
                e.stopPropagation();
                data?.onChannelSelect?.(channel);
              }}
              title={warning || label}
            >
              {warning ? <span style={{ fontSize: 10 }}>⚠️</span> : null}
              {(pgm || pvw) && (
                <div style={{ display: 'flex', gap: '3px', pointerEvents: 'none' }}>
                  {pgm && (
                    <span style={{ ...tallyChip.pgm, animation: 'tallyPulse 1.5s ease-in-out infinite' }}>
                      PGM
                    </span>
                  )}
                  {pvw && <span style={tallyChip.pvw}>PVW</span>}
                </div>
              )}
              {codecBadge ? (
                <span style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#ffedd5',
                  backgroundColor: 'rgba(194, 65, 12, 0.55)',
                  padding: '1px 4px',
                  borderRadius: 3,
                  flexShrink: 0,
                }}
                >
                  {codecBadge}
                </span>
              ) : null}
              <span style={{
                ...styles.channelRowLabel,
                maxWidth: isBridgeHub ? 200 : undefined,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              >
                {label}
              </span>
              {!isBridgeHub && channel.hasBridgeMirror ? (
                <span style={{ fontSize: 9, color: '#93c5fd', flexShrink: 0 }} title={channel.bridgeMirrorLabel || 'On Bridge'}>
                  → Bridge
                </span>
              ) : null}
              <Handle
                id={`out-${channel.channelId}`}
                type="source"
                position={Position.Right}
                style={styles.channelHandle(deviceScheme)}
                title={label}
              />
            </div>
          );
        })}

        {!isCollapsed && !isLegacy && !isBridgeHub && (
          <SenderStatsSections
            channels={channels}
            getChannelLabel={getChannelConnectorLabel}
          />
        )}

        {isCollapsed && hiddenChannelCount > 0 && (
          <div style={{ position: 'relative' }}>
          {/* Connected channels that are not listed still need a handle, or their edges are not drawn. */}
          <HiddenChannelHandles
            channels={channels}
            visibleChannels={visibleChannels}
            connectedChannelIds={connectedChannelIds}
            prefix="out"
            handleType="source"
            position={Position.Right}
            handleStyle={styles.channelHandle(deviceScheme)}
          />
          <button
            type="button"
            className="nodrag nopan"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); data?.onToggleExpand?.(); }}
            style={{
              position: 'relative',
              zIndex: 20,
              marginTop: '8px',
              width: '100%',
              padding: '6px 8px',
              fontSize: '11px',
              borderRadius: '6px',
              border: '1px solid #4b5563',
              backgroundColor: '#111827',
              color: '#93c5fd',
              cursor: 'pointer',
            }}
          >
            +{hiddenChannelCount} channels — expand
          </button>
          </div>
        )}

        {!isCollapsed && channels.length > COLLAPSE_CHANNELS_THRESHOLD && (
          <button
            type="button"
            className="nodrag nopan"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); data?.onToggleExpand?.(); }}
            style={{
              position: 'relative',
              zIndex: 20,
              marginTop: '8px',
              width: '100%',
              padding: '6px 8px',
              fontSize: '11px',
              borderRadius: '6px',
              border: '1px solid #4b5563',
              backgroundColor: '#111827',
              color: '#93c5fd',
              cursor: 'pointer',
            }}
          >
            collapse
          </button>
        )}
      </div>
    );
  }

  const { name, hostName, address, port, width, height, frameRate, videoCodec, audioCodec,
          audioChannels, audioSampleRate, connectionCount, status, connectionState,
          groups, tallyOnProgram, tallyOnPreview, webControlUrl, droppedFrames,
          videoFramesSent, videoBytesSent, videoHasAlpha, videoColorPrimaries,
          videoTransferFunction, videoMatrixCoefficients, audioFramesSent, audioBytesSent,
          metadataFramesSent, metadataBytesSent } = data;

  const statsChannel = {
    connectionCount,
    videoCodec,
    width,
    height,
    frameRateN: data.frameRateN,
    frameRateD: data.frameRateD,
    frameRate: data.frameRate,
    audioCodec,
    audioChannels,
    audioSampleRate,
    videoFramesSent,
    videoBytesSent,
    videoHasAlpha,
    videoColorPrimaries,
    videoTransferFunction,
    videoMatrixCoefficients,
    audioFramesSent,
    audioBytesSent,
    metadataFramesSent,
    metadataBytesSent,
  };

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
      <div {...nodeDragHandleProps(styles.header)}>
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

        <div style={styles.infoRow}>
          <span style={styles.label}>Dropped frames:</span>
          <span style={{
            ...styles.value,
            color: droppedFrames > 0 ? '#f87171' : undefined,
          }}
          >
            {formatCount(droppedFrames)}
          </span>
        </div>

        {webControlUrl && (
          <div style={{ marginTop: '4px' }}>
            <a href={webControlUrl} target="_blank" rel="noopener noreferrer"
               style={{ color: '#93c5fd', fontSize: '11px', textDecoration: 'underline' }}>
              Web Control
            </a>
          </div>
        )}
      </div>

      <SenderStatsSections
        channels={[statsChannel]}
        getChannelLabel={() => name || 'Output'}
      />

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

// Re-render only when React Flow passes new props (node data is kept stable when unchanged).
export default memo(SenderNode);
