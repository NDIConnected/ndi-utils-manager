import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatBool,
  formatBytes,
  formatCount,
  sumChannels,
  distinctChannelValues,
  channelStat,
  formatResolution,
  formatFrameRate,
} from '../utils/formatStats';

const SECTION_PREVIEW = 4;

const ui = {
  section: {
    marginTop: '6px',
    borderRadius: '6px',
    border: '1px solid #374151',
    overflow: 'hidden',
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
  },
  header: (open) => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    padding: '5px 8px',
    fontSize: '11px',
    fontWeight: '600',
    color: '#e5e7eb',
    backgroundColor: open ? 'rgba(30, 41, 59, 0.9)' : 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  }),
  summary: {
    fontSize: '10px',
    color: '#9ca3af',
    fontWeight: '400',
    fontFamily: 'var(--ndi-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '170px',
  },
  body: {
    padding: '6px 8px 8px',
    borderTop: '1px solid #374151',
    fontSize: '10px',
    color: '#d1d5db',
  },
  channelTitle: {
    fontSize: '10px',
    fontWeight: '600',
    color: '#93c5fd',
    marginBottom: '4px',
    marginTop: '6px',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    lineHeight: 1.35,
    marginBottom: '2px',
  },
  label: { color: '#9ca3af' },
  value: { fontFamily: 'var(--ndi-mono)', color: '#e5e7eb', textAlign: 'right' },
  moreBtn: {
    marginTop: '6px',
    width: '100%',
    padding: '4px 6px',
    fontSize: '10px',
    borderRadius: '4px',
    border: '1px solid #4b5563',
    backgroundColor: '#111827',
    color: '#93c5fd',
    cursor: 'pointer',
  },
};

function StatRow({ label, value }) {
  return (
    <div style={ui.row}>
      <span style={ui.label}>{label}</span>
      <span style={ui.value}>{value ?? '-'}</span>
    </div>
  );
}

function CollapsibleSection({ title, summary, open, onToggle, children }) {
  return (
    <div style={ui.section}>
      <button
        type="button"
        className="nodrag nopan"
        style={ui.header(open)}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggle(); }}
      >
        <span>{open ? '▾' : '▸'} {title}</span>
        {!open && <span style={ui.summary}>{summary}</span>}
      </button>
      {open && <div style={ui.body}>{children}</div>}
    </div>
  );
}

function ChannelBlock({ label, children }) {
  return (
    <div>
      {label && <div style={ui.channelTitle}>{label}</div>}
      {children}
    </div>
  );
}

export default function SenderStatsSections({
  channels,
  getChannelLabel,
  disabled = false,
  onHeightChange,
}) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState({ video: false, audio: false, metadata: false });
  const [previewLimit, setPreviewLimit] = useState({
    video: SECTION_PREVIEW,
    audio: SECTION_PREVIEW,
    metadata: SECTION_PREVIEW,
  });

  const summaries = useMemo(() => ({
    video: `${formatCount(sumChannels(channels, 'videoFramesSent'))} fr | ${formatBytes(sumChannels(channels, 'videoBytesSent'))}`,
    audio: `${formatCount(sumChannels(channels, 'audioFramesSent'))} fr | ${formatBytes(sumChannels(channels, 'audioBytesSent'))}`,
    metadata: `${formatCount(sumChannels(channels, 'metadataFramesSent'))} fr | ${formatBytes(sumChannels(channels, 'metadataBytesSent'))}`,
  }), [channels]);

  useEffect(() => {
    if (!onHeightChange || !rootRef.current) return undefined;
    const el = rootRef.current;
    const notify = () => onHeightChange(el.offsetHeight);
    notify();
    const ro = new ResizeObserver(notify);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeightChange, open, previewLimit, channels.length, disabled]);

  if (disabled) return null;

  const toggle = (key) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const renderChannelList = (key, renderFields) => {
    const limit = previewLimit[key];
    const visible = channels.slice(0, limit);
    const hidden = Math.max(0, channels.length - visible.length);

    return (
      <>
        {visible.map((channel, idx) => (
          <ChannelBlock
            key={`${key}-${channel.channelId || idx}`}
            label={channels.length > 1 ? getChannelLabel(channel, idx) : ''}
          >
            {renderFields(channel)}
          </ChannelBlock>
        ))}
        {hidden > 0 && (
          <button
            type="button"
            className="nodrag nopan"
            style={ui.moreBtn}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setPreviewLimit((prev) => ({ ...prev, [key]: prev[key] + SECTION_PREVIEW }));
            }}
          >
            +{hidden} channels — expand
          </button>
        )}
        {limit > SECTION_PREVIEW && channels.length > SECTION_PREVIEW && (
          <button
            type="button"
            className="nodrag nopan"
            style={{ ...ui.moreBtn, marginTop: '4px' }}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setPreviewLimit((prev) => ({ ...prev, [key]: SECTION_PREVIEW }));
            }}
          >
            collapse list
          </button>
        )}
      </>
    );
  };

  const colorSummary = distinctChannelValues(channels, 'videoColorPrimaries').join(', ') || '-';

    return (
    <div ref={rootRef} className="nodrag nopan" onClick={(e) => e.stopPropagation()}>
      <CollapsibleSection
        title="Video"
        summary={summaries.video}
        open={open.video}
        onToggle={() => toggle('video')}
      >
        {channels.length > 1 && (
          <StatRow label="Color primaries (all)" value={colorSummary} />
        )}
        {renderChannelList('video', (ch) => (
          <>
            <StatRow label="Connected RX" value={formatCount(channelStat(ch, 'connectionCount'))} />
            <StatRow label="Codec" value={channelStat(ch, 'videoCodec') || '-'} />
            <StatRow label="Resolution" value={formatResolution(ch)} />
            <StatRow label="Frame Rate" value={formatFrameRate(ch)} />
            <StatRow label="Frames Sent" value={formatCount(channelStat(ch, 'videoFramesSent'))} />
            <StatRow label="Bytes Sent" value={formatBytes(channelStat(ch, 'videoBytesSent'))} />
            <StatRow label="Dropped frames" value={formatCount(channelStat(ch, 'droppedFrames'))} />
            <StatRow label="Alpha Channel" value={formatBool(channelStat(ch, 'videoHasAlpha'))} />
            <StatRow label="Color Primaries" value={channelStat(ch, 'videoColorPrimaries') || '-'} />
            <StatRow label="Transfer Function" value={channelStat(ch, 'videoTransferFunction') || '-'} />
            <StatRow label="Matrix Coefficient" value={channelStat(ch, 'videoMatrixCoefficients') || '-'} />
          </>
        ))}
      </CollapsibleSection>

      <CollapsibleSection
        title="Audio"
        summary={summaries.audio}
        open={open.audio}
        onToggle={() => toggle('audio')}
      >
        {renderChannelList('audio', (ch) => (
          <>
            <StatRow label="Codec" value={channelStat(ch, 'audioCodec') || '-'} />
            <StatRow label="Channels" value={formatCount(channelStat(ch, 'audioChannels'))} />
            <StatRow label="Sample Rate" value={
              Number(channelStat(ch, 'audioSampleRate')) > 0
                ? `${channelStat(ch, 'audioSampleRate')} Hz`
                : '-'
            } />
            <StatRow label="Frames Sent" value={formatCount(channelStat(ch, 'audioFramesSent'))} />
            <StatRow label="Bytes Sent" value={formatBytes(channelStat(ch, 'audioBytesSent'))} />
          </>
        ))}
      </CollapsibleSection>

      <CollapsibleSection
        title="Metadata"
        summary={summaries.metadata}
        open={open.metadata}
        onToggle={() => toggle('metadata')}
      >
        {renderChannelList('metadata', (ch) => (
          <>
            <StatRow label="Frames Sent" value={formatCount(channelStat(ch, 'metadataFramesSent'))} />
            <StatRow label="Bytes Sent" value={formatBytes(channelStat(ch, 'metadataBytesSent'))} />
          </>
        ))}
      </CollapsibleSection>
    </div>
  );
}
