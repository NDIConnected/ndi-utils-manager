import { useMemo, useState } from 'react';
import {
  formatBool,
  formatCount,
  channelStat,
  formatResolution,
  formatFrameRate,
  distinctChannelValues,
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
    fontFamily: 'monospace',
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
  value: { fontFamily: 'monospace', color: '#e5e7eb', textAlign: 'right' },
  sourceValue: { fontFamily: 'monospace', color: '#6ee7b7', textAlign: 'right', maxWidth: '160px', wordBreak: 'break-word' },
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
  link: { color: '#93c5fd', fontSize: '10px', textDecoration: 'underline' },
};

function StatRow({ label, value, valueStyle }) {
  return (
    <div style={ui.row}>
      <span style={ui.label}>{label}</span>
      <span style={valueStyle || ui.value}>{value ?? '-'}</span>
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

function shortSourceName(source) {
  const raw = (source || '').trim();
  if (!raw) return 'disconnected';
  if (raw.length <= 28) return raw;
  return `${raw.slice(0, 25)}…`;
}

function connectionSummary(channels) {
  const connected = channels.filter((ch) => ch?.isConnected || channelStat(ch, 'currentSource')).length;
  const first = channels.find((ch) => channelStat(ch, 'currentSource'));
  const sourceHint = first ? shortSourceName(channelStat(first, 'currentSource')) : 'idle';
  return `${connected}/${channels.length} · ${sourceHint}`;
}

function videoSummary(channels) {
  const codecs = distinctChannelValues(channels, 'videoCodec');
  const res = distinctChannelValues(channels, 'width').length > 0
    ? channels.map((ch) => formatResolution(ch)).filter((v) => v !== '-').slice(0, 1).join('')
    : '-';
  if (codecs.length === 0) return res;
  return `${codecs.join(', ')} | ${res}`;
}

function audioSummary(channels) {
  const codecs = distinctChannelValues(channels, 'audioCodec');
  if (codecs.length === 0) return '-';
  const ch = channels.find((c) => channelStat(c, 'audioChannels'));
  const rate = channelStat(ch, 'audioSampleRate');
  const chCount = Number(channelStat(ch, 'audioChannels'));
  if (chCount > 0 && rate > 0) return `${codecs.join(', ')} ${chCount}ch/${rate}Hz`;
  return codecs.join(', ');
}

export default function ReceiverStatsSections({
  channels,
  getChannelLabel,
  disabled = false,
}) {
  const [open, setOpen] = useState({ connection: false, video: false, audio: false, capabilities: false });
  const [previewLimit, setPreviewLimit] = useState({
    connection: SECTION_PREVIEW,
    video: SECTION_PREVIEW,
    audio: SECTION_PREVIEW,
    capabilities: SECTION_PREVIEW,
  });

  const summaries = useMemo(() => ({
    connection: connectionSummary(channels),
    video: videoSummary(channels),
    audio: audioSummary(channels),
    capabilities: [...new Set(channels.flatMap((ch) => {
      const streams = channelStat(ch, 'streams');
      return Array.isArray(streams) ? streams : [];
    }))].join(', ') || '-',
  }), [channels]);

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

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <CollapsibleSection
        title="Connection"
        summary={summaries.connection}
        open={open.connection}
        onToggle={() => toggle('connection')}
      >
        {renderChannelList('connection', (ch) => (
          <>
            <StatRow
              label="Status"
              value={channelStat(ch, 'isConnected') ? 'connected' : 'idle'}
            />
            <StatRow
              label="Source"
              value={channelStat(ch, 'currentSource') || '—'}
              valueStyle={ui.sourceValue}
            />
            <StatRow
              label="Streaming"
              value={channelStat(ch, 'isStreaming') ? 'yes' : 'no'}
            />
            <StatRow label="SDK" value={channelStat(ch, 'sdkVersion') || '-'} />
            {channelStat(ch, 'webControlUrl') && (
              <div style={{ marginTop: '4px', textAlign: 'right' }}>
                <a
                  href={channelStat(ch, 'webControlUrl')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="nodrag nopan"
                  style={ui.link}
                  onClick={(e) => e.stopPropagation()}
                >
                  Web Control
                </a>
              </div>
            )}
          </>
        ))}
      </CollapsibleSection>

      <CollapsibleSection
        title="Video"
        summary={summaries.video}
        open={open.video}
        onToggle={() => toggle('video')}
      >
        {renderChannelList('video', (ch) => (
          <>
            <StatRow label="Present" value={formatBool(channelStat(ch, 'videoPresent'))} />
            <StatRow label="Codec" value={channelStat(ch, 'videoCodec') || '-'} />
            <StatRow label="Resolution" value={formatResolution(ch)} />
            <StatRow label="Frame Rate" value={formatFrameRate(ch)} />
            <StatRow label="Frame Type" value={channelStat(ch, 'videoFrameType') || '-'} />
            <StatRow label="Receive Mode" value={channelStat(ch, 'videoReceiveMode') || '-'} />
            <StatRow label="Alpha Channel" value={formatBool(channelStat(ch, 'videoHasAlpha'))} />
            <StatRow label="Color Primaries" value={channelStat(ch, 'videoColorPrimaries') || '-'} />
            <StatRow label="Transfer Function" value={channelStat(ch, 'videoTransferFunction') || '-'} />
            <StatRow label="Matrix Coefficient" value={channelStat(ch, 'videoMatrixCoefficients') || '-'} />
            <StatRow label="Dropped frames" value={formatCount(channelStat(ch, 'droppedFrames'))} />
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
            <StatRow label="Present" value={formatBool(channelStat(ch, 'audioPresent'))} />
            <StatRow label="Codec" value={channelStat(ch, 'audioCodec') || '-'} />
            <StatRow label="Channels" value={formatCount(channelStat(ch, 'audioChannels'))} />
            <StatRow
              label="Sample Rate"
              value={Number(channelStat(ch, 'audioSampleRate')) > 0
                ? `${channelStat(ch, 'audioSampleRate')} Hz`
                : '-'}
            />
            <StatRow label="Receive Mode" value={channelStat(ch, 'audioReceiveMode') || '-'} />
          </>
        ))}
      </CollapsibleSection>

      <CollapsibleSection
        title="Capabilities"
        summary={summaries.capabilities}
        open={open.capabilities}
        onToggle={() => toggle('capabilities')}
      >
        {renderChannelList('capabilities', (ch) => (
          <>
            <StatRow
              label="Streams"
              value={(channelStat(ch, 'streams') || []).join(', ') || '-'}
            />
            <StatRow
              label="Commands"
              value={(channelStat(ch, 'commands') || []).join(', ') || '-'}
            />
          </>
        ))}
      </CollapsibleSection>
    </div>
  );
}
