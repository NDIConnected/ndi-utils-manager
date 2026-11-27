// Live-activity helpers for the canvas: per-channel throughput, edge "signal" look, tally and
// arriving/departing device tracking. All pure, so the editor only wires them to React state.

/** Counters older than this without growth mean the sender stopped pushing data. */
export const RATE_STALE_MS = 5000;
/** How long a device that left the network stays on the canvas as a fading ghost. */
export const DEPARTURE_TTL_MS = 4000;
/** How long a newly discovered device keeps its "arriving" highlight. */
export const ARRIVAL_TTL_MS = 1400;

/** Particle count and loop duration (s) per activity level 0..4. */
export const EDGE_PARTICLES = [
  { count: 0, duration: 0 },
  { count: 1, duration: 3.2 },
  { count: 2, duration: 2.4 },
  { count: 3, duration: 1.7 },
  { count: 4, duration: 1.1 },
];

export const EDGE_KIND_COLORS = {
  video: '#22d3ee',
  audio: '#4ade80',
  signal: '#5eead4',
  pending: '#facc15',
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function channelBytes(ch) {
  return num(ch?.videoBytesSent) + num(ch?.audioBytesSent) + num(ch?.metadataBytesSent);
}

/**
 * Bytes/s per sender channel from the cumulative "bytes sent" counters of successive snapshots.
 * Returns a new Map channelId → { bytes, at, rate } (rate is null until two samples exist).
 * Counters that stay flat keep the last rate for a while (updates are bursty) and drop to 0 after
 * {@link RATE_STALE_MS}.
 */
export function updateChannelRates(prevRates, senders, now) {
  const next = new Map();
  for (const device of senders || []) {
    for (const ch of device?.channels || []) {
      if (!ch?.channelId) continue;
      const bytes = channelBytes(ch);
      const prev = prevRates?.get(ch.channelId);
      if (!prev || bytes < prev.bytes) {
        next.set(ch.channelId, { bytes, at: now, rate: null });
      } else if (bytes > prev.bytes) {
        const seconds = Math.max((now - prev.at) / 1000, 0.25);
        next.set(ch.channelId, { bytes, at: now, rate: (bytes - prev.bytes) / seconds });
      } else if (bytes > 0 && now - prev.at >= RATE_STALE_MS) {
        next.set(ch.channelId, { bytes, at: prev.at, rate: 0 });
      } else {
        next.set(ch.channelId, prev);
      }
    }
  }
  return next;
}

/** Rough bytes/s from the stream format, for senders without monitoring counters. */
export function estimateChannelRate(ch) {
  const width = num(ch?.width);
  const height = num(ch?.height);
  const fps = num(ch?.frameRate) || (num(ch?.frameRateD) > 0 ? num(ch?.frameRateN) / num(ch?.frameRateD) : 0);
  if (width > 0 && height > 0) return width * height * (fps || 30) * 0.25; // ~2 bits/pixel (SpeedHQ)
  const audioChannels = num(ch?.audioChannels);
  if (audioChannels > 0) return audioChannels * (num(ch?.audioSampleRate) || 48000) * 4;
  return null;
}

/** Activity level 1..4 from bytes/s (0 only when the data flow is known to have stopped). */
export function rateLevel(bytesPerSecond) {
  if (bytesPerSecond === 0) return 0;
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond < 0) return 2;
  if (bytesPerSecond < 50_000) return 1;
  if (bytesPerSecond < 1_000_000) return 2;
  if (bytesPerSecond < 10_000_000) return 3;
  return 4;
}

/** Media carried by a sender channel: 'video' (maybe with audio), 'audio' or unknown 'signal'. */
export function channelMediaKind(ch) {
  const hasVideo = num(ch?.width) > 0 || Boolean(ch?.videoCodec) || ch?.videoPresent === true;
  const hasAudio = num(ch?.audioChannels) > 0 || Boolean(ch?.audioCodec) || ch?.audioPresent === true;
  if (hasVideo) return { kind: 'video', withAudio: hasAudio };
  if (hasAudio) return { kind: 'audio', withAudio: false };
  return { kind: 'signal', withAudio: false };
}

/**
 * Look of one edge: media kind, colour and activity level. Pending (not yet confirmed) routes have no flow.
 * The measured rate wins; without counters the format estimate is used. Legacy senders report no format,
 * so the receiver's view of the stream (resolution, audio) is the fallback.
 */
export function edgeActivity(senderChannel, channelRate, confirmed, receiverChannel) {
  if (!confirmed) return { kind: 'pending', withAudio: false, level: 0, color: EDGE_KIND_COLORS.pending };
  const fromSender = channelMediaKind(senderChannel);
  const useReceiver = fromSender.kind === 'signal' && receiverChannel;
  const { kind, withAudio } = useReceiver ? channelMediaKind(receiverChannel) : fromSender;
  const measured = channelRate?.rate;
  const rate = measured === 0 || measured > 0
    ? measured
    : estimateChannelRate(senderChannel) ?? (receiverChannel ? estimateChannelRate(receiverChannel) : null);
  return { kind, withAudio, level: rateLevel(rate), color: EDGE_KIND_COLORS[kind] };
}

const isTrue = (v) => v === true || v === 'true';

/** 'pgm' when any channel is on program, 'pvw' when on preview, otherwise null. */
export function deviceTally(device) {
  const channels = device?.channels || [];
  if (channels.some((c) => isTrue(c?.tallyOnProgram))) return 'pgm';
  if (channels.some((c) => isTrue(c?.tallyOnPreview))) return 'pvw';
  return null;
}

/** React Flow wrapper class for a device node (role, tally glow). */
export function deviceNodeClassName(device, role) {
  const tally = deviceTally(device);
  return ['ndi-node', `ndi-node--${role}`, tally ? `ndi-tally-${tally}` : ''].filter(Boolean).join(' ');
}

/**
 * Tracks devices that left the network so they can fade out instead of vanishing.
 * - `previousNodes`: the live nodes of the last build; `nextNodeIds`: ids in the new build.
 * - `stillPresent(id)`: true when the device is still in the snapshot (only filtered out → no ghost).
 * Returns a new Map id → { node, until } without expired entries and without devices that came back.
 */
export function updateDepartures({ departing, previousNodes, nextNodeIds, stillPresent, now, ttl = DEPARTURE_TTL_MS }) {
  const next = new Map();
  departing?.forEach((entry, id) => {
    if (entry.until > now && !nextNodeIds.has(id)) next.set(id, entry);
  });
  for (const node of previousNodes || []) {
    if (nextNodeIds.has(node.id) || next.has(node.id) || stillPresent(node.id)) continue;
    next.set(node.id, {
      until: now + ttl,
      node: {
        ...node,
        className: `${node.className || ''} ndi-node-leaving`.trim(),
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
      },
    });
  }
  return next;
}

/**
 * Tracks newly discovered devices (not on first load). Returns a new Map id → until.
 */
export function updateArrivals({ arriving, previousNodeIds, nextNodeIds, isFirstBuild, now, ttl = ARRIVAL_TTL_MS }) {
  const next = new Map();
  arriving?.forEach((until, id) => {
    if (until > now && nextNodeIds.has(id)) next.set(id, until);
  });
  if (isFirstBuild) return next;
  nextNodeIds.forEach((id) => {
    if (!previousNodeIds.has(id) && !next.has(id)) next.set(id, now + ttl);
  });
  return next;
}

/** Earliest expiry among arrival/departure entries, or null. */
export function nextExpiry(departing, arriving) {
  let min = null;
  departing?.forEach((e) => { if (min === null || e.until < min) min = e.until; });
  arriving?.forEach((until) => { if (min === null || until < min) min = until; });
  return min;
}
