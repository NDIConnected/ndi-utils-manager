import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { COLLAPSE_CHANNELS_THRESHOLD } from '../utils/deviceGrouping';
import { formatCount } from '../utils/formatStats';
import { channelHealthWarning, sumDroppedFrames } from '../utils/channelHealth';
import ReceiverStatsSections from './ReceiverStatsSections';
import { HiddenChannelHandles, CompactStackedHandles } from './CompactNodeParts';
import {
  compactCardStyle,
  compactHeaderStyle,
  compactAddressRowStyle,
  compactToggleTitleProps,
  detailedToggleTitleProps,
  nodeDragHandleProps,
  resolveMachineName,
} from './compactNodeHelpers';

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

const RECEIVER_HANDLE = {
  bg: '#3b82f6',
  border: '#93c5fd',
};

const styles = {
  node: (isConnected) => ({
    position: 'relative',
    overflow: 'visible',
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
  channelRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '8px',
    minHeight: '24px',
    marginTop: '8px',
    marginLeft: '-16px',
    marginRight: '-16px',
    paddingLeft: '8px',
    paddingRight: '16px',
    position: 'relative',
  },
  channelRowLabel: {
    color: '#d1d5db',
    fontSize: '11px',
    fontFamily: 'monospace',
    lineHeight: 1,
    whiteSpace: 'nowrap',
    marginLeft: '12px',
  },
  channelSourceHint: {
    flex: 1,
    minWidth: 0,
    color: '#6ee7b7',
    fontSize: '10px',
    fontFamily: 'monospace',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'right',
  },
  channelHandle: {
    position: 'absolute',
    left: '-7px',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '12px',
    height: '12px',
    backgroundColor: RECEIVER_HANDLE.bg,
    border: `2px solid ${RECEIVER_HANDLE.border}`,
  },
};

function ReceiverNode({ data }) {
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

  const shortSource = (source) => {
    const raw = (source || '').trim();
    if (!raw) return '';
    if (raw.length <= 22) return raw;
    return `${raw.slice(0, 19)}…`;
  };

  if (data?.isAggregated) {
    const channels = Array.isArray(data.channels) ? data.channels : [];
    const isCollapsed = data?.isCollapsed === true;
    const connectedChannelIds = data?.connectedChannelIds instanceof Set
      ? data.connectedChannelIds
      : new Set(data?.connectedChannelIds || []);

    const pickVisibleChannels = () => {
      if (!isCollapsed) return channels;
      const prioritized = channels.filter(
        (c) => c.isStreaming || c.isConnected || connectedChannelIds.has(c.channelId),
      );
      const pool = prioritized.length > 0 ? prioritized : channels;
      const limit = data?.maxVisibleHandles ?? 4;
      return pool.slice(0, limit);
    };

    const visibleChannels = pickVisibleChannels();
    const hiddenChannelCount = Math.max(0, channels.length - visibleChannels.length);

    const connectedChannels = channels.filter((c) => c.isConnected);
    const streamingChannels = channels.filter((c) => c.isStreaming);
    const firstLabel = channels.find((c) => c?.streamLabel)?.streamLabel || '';
    const { deviceName: inferredDeviceName, appName: inferredAppName } = splitDeviceAndAppNames(firstLabel);
    const appDisplayName = data.applicationId !== 'unknown'
      ? data.applicationId
      : (inferredDeviceName || data.displayName || 'unknown');
    const appSubDisplayName = data.applicationId === 'unknown' ? inferredAppName : '';
    // Only "HOST (App)" names carry a machine prefix; a bare name is the endpoint itself.
    const machineName = resolveMachineName(data, inferredAppName ? inferredDeviceName : '', appDisplayName);

    const deviceTallyPgm = channels.some(channelTallyProgram);
    const deviceTallyPvw = channels.some(channelTallyPreview);
    const hasActivity = connectedChannels.length > 0 || streamingChannels.length > 0;
    const totalDroppedFrames = sumDroppedFrames(channels);
    const hasWarning = channels.some((ch) => channelHealthWarning(ch, { checkConnectedWithoutSource: true }));

    if (data?.compactView) {
      const cardStyle = compactCardStyle({
        border: hasActivity ? '#3b82f6' : '#4b5563',
        gradientFrom: hasActivity ? '#1e3a8a' : '#1f2937',
        gradientTo: hasActivity ? '#1e40af' : '#374151',
        handleSide: 'left',
      });
      return (
        <div style={cardStyle} title={hasWarning ? 'Channel warning' : undefined}>
          <CompactStackedHandles
            channels={channels}
            prefix="in"
            handleType="target"
            position={Position.Left}
            connectedChannelIds={connectedChannelIds}
            visibleHandleStyle={styles.channelHandle}
            getTitle={(channel, idx) => getConnectionLabel(channel, idx)}
          />
          <div {...nodeDragHandleProps(compactHeaderStyle())}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <div style={styles.indicator(hasActivity)} />
              <span>RECEIVER DEVICE</span>
              {hasWarning ? <span style={{ fontSize: 10 }}>⚠️</span> : null}
            </div>
            <span style={styles.badge(hasActivity)}>{channels.length} ch</span>
          </div>
          <div {...compactToggleTitleProps(data?.onToggleCompactView)}>{appDisplayName}</div>
          {appSubDisplayName ? (
            <div style={{ color: '#cbd5e1', fontSize: '11px', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {appSubDisplayName}
            </div>
          ) : null}
          {machineName ? (
            <div style={compactAddressRowStyle()} title="Machine / device publishing these NDI endpoints">
              <span style={styles.label}>Host:</span>
              <span style={{ ...styles.value, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{machineName}</span>
            </div>
          ) : null}
          <div style={compactAddressRowStyle()}>
            <span style={styles.label}>Address:</span>
            <span style={styles.value}>{data.address || '—'}</span>
          </div>
        </div>
      );
    }

    return (
      <div style={styles.node(hasActivity)}>
        <div {...nodeDragHandleProps(styles.header)}>
          <div style={styles.headerLeft}>
            <div style={styles.indicator(hasActivity)} />
            <span>RECEIVER DEVICE</span>
          </div>
          <span style={styles.badge(hasActivity)}>
            {channels.length} ch
          </span>
        </div>

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
          {machineName ? (
            <div style={styles.infoRow} title="Machine / device publishing these NDI endpoints">
              <span style={styles.label}>Host:</span>
              <span style={{ ...styles.value, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{machineName}</span>
            </div>
          ) : null}
          <div style={styles.infoRow}>
            <span style={styles.label}>Address:</span>
            <span style={styles.value}>{data.address || '-'}</span>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.label}>Connected:</span>
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
                cursor: connectedChannels.length > 0 ? 'pointer' : 'default',
                color: connectedChannels.length > 0 ? '#93c5fd' : undefined,
                textDecoration: connectedChannels.length > 0 ? 'underline' : 'none',
              }}
            >
              {`${connectedChannels.length}/${channels.length}`}
            </button>
          </div>
          <div style={styles.infoRow}>
            <span style={styles.label}>Streaming:</span>
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
            </>
          )}
        </div>

        {visibleChannels.map((channel, idx) => {
          const pgm = channelTallyProgram(channel);
          const pvw = channelTallyPreview(channel);
          const label = getConnectionLabel(channel, idx);
          const sourceHint = shortSource(channel.currentSource);
          const warning = channelHealthWarning(channel, { checkConnectedWithoutSource: true });
          return (
            <div
              key={`in-row-${channel.channelId}-${idx}`}
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
              title={warning || channel.currentSource || label}
            >
              {warning ? <span style={{ fontSize: 10 }}>⚠️</span> : null}
              <Handle
                id={`in-${channel.channelId}`}
                type="target"
                position={Position.Left}
                style={styles.channelHandle}
                title={label}
              />
              <span style={styles.channelRowLabel}>{label}</span>
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
              {sourceHint && (
                <span style={styles.channelSourceHint} title={channel.currentSource}>
                  → {sourceHint}
                </span>
              )}
            </div>
          );
        })}

        {!isCollapsed && (
          <ReceiverStatsSections
            channels={channels}
            getChannelLabel={getConnectionLabel}
          />
        )}

        {isCollapsed && hiddenChannelCount > 0 && (
          <div style={{ position: 'relative' }}>
          {/* Connected channels that are not listed still need a handle, or their edges are not drawn. */}
          <HiddenChannelHandles
            channels={channels}
            visibleChannels={visibleChannels}
            connectedChannelIds={connectedChannelIds}
            prefix="in"
            handleType="target"
            position={Position.Left}
            handleStyle={styles.channelHandle}
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

  const { name, hostName, address, currentSource, isConnected, status, width, height,
          frameRate, videoCodec, audioCodec, audioChannels, audioSampleRate,
          streams, commands, tallyOnProgram, tallyOnPreview, webControlUrl, droppedFrames,
          videoFrameType, videoPresent, videoReceiveMode, videoHasAlpha,
          videoColorPrimaries, videoTransferFunction, videoMatrixCoefficients,
          audioPresent, audioReceiveMode, sdkVersion } = data;

  const statsChannel = {
    isConnected,
    currentSource,
    isStreaming: isConnected && !!currentSource,
    sdkVersion,
    webControlUrl,
    videoPresent,
    videoCodec,
    width,
    height,
    frameRateN: data.frameRateN,
    frameRateD: data.frameRateD,
    frameRate,
    videoFrameType,
    videoReceiveMode,
    videoHasAlpha,
    videoColorPrimaries,
    videoTransferFunction,
    videoMatrixCoefficients,
    droppedFrames,
    audioPresent,
    audioCodec,
    audioChannels,
    audioSampleRate,
    audioReceiveMode,
    streams,
    commands,
  };

  return (
    <div style={styles.node(isConnected)}>

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

      <div {...nodeDragHandleProps(styles.header)}>
        <div style={styles.headerLeft}>
          <div style={styles.indicator(isConnected)} />
          <span>RECEIVER</span>
        </div>
        <span style={styles.badge(isConnected)}>
          {status}
        </span>
      </div>

      <div style={styles.name}>
        {name}
      </div>

      <div style={styles.infoGrid}>
        <div style={styles.infoRow}>
          <span style={styles.label}>Host:</span>
          <span style={styles.value}>{hostName}</span>
        </div>

        {address && (
          <div style={styles.infoRow}>
            <span style={styles.label}>Address:</span>
            <span style={styles.value}>{address}</span>
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
      </div>

      <ReceiverStatsSections
        channels={[statsChannel]}
        getChannelLabel={() => name || 'Input'}
      />

      <Handle
        type="target"
        position={Position.Left}
        style={{
          width: '12px',
          height: '12px',
          backgroundColor: RECEIVER_HANDLE.bg,
          border: `2px solid ${RECEIVER_HANDLE.border}`,
        }}
      />
    </div>
  );
}

// Re-render only when React Flow passes new props (node data is kept stable when unchanged).
export default memo(ReceiverNode);
