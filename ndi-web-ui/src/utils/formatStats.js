export function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  if (n <= 0) return '0';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}G`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  if (n <= 0) return '0 B';
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function formatBool(value) {
  if (value === true || value === 'true') return 'True';
  if (value === false || value === 'false') return 'False';
  return '-';
}

export function channelStat(ch, camelKey) {
  if (!ch) return undefined;
  if (ch[camelKey] !== undefined && ch[camelKey] !== null) return ch[camelKey];
  const pascalKey = camelKey.charAt(0).toUpperCase() + camelKey.slice(1);
  return ch[pascalKey];
}

export function formatResolution(ch) {
  const w = Number(channelStat(ch, 'width'));
  const h = Number(channelStat(ch, 'height'));
  if (w > 0 && h > 0) return `${w}x${h}`;
  return '-';
}

export function formatFrameRate(ch) {
  const n = Number(channelStat(ch, 'frameRateN'));
  const d = Number(channelStat(ch, 'frameRateD'));
  if (Number.isFinite(n) && Number.isFinite(d) && d > 0) return `${n}/${d}`;
  const rate = Number(channelStat(ch, 'frameRate'));
  if (Number.isFinite(rate) && rate > 0) return rate.toFixed(2);
  return '-';
}

export function sumChannels(channels, key) {
  if (!Array.isArray(channels) || channels.length === 0) return 0;
  return channels.reduce((acc, ch) => {
    const v = Number(channelStat(ch, key));
    return acc + (Number.isFinite(v) ? v : 0);
  }, 0);
}

export function distinctChannelValues(channels, key) {
  if (!Array.isArray(channels)) return [];
  return [...new Set(
    channels
      .map((ch) => (channelStat(ch, key) || '').toString().trim())
      .filter(Boolean),
  )];
}

export function channelsHaveConnectedReceivers(channels) {
  if (!Array.isArray(channels) || channels.length === 0) return false;
  return channels.some((ch) => Number(channelStat(ch, 'connectionCount')) > 0);
}
