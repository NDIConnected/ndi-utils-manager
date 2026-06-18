import { channelStat } from './formatStats';

export function channelHealthWarning(channel, { checkConnectedWithoutSource = false } = {}) {
  if ((channel?.droppedFrames ?? 0) > 0) return 'Dropped frames';
  if (checkConnectedWithoutSource && channel?.isConnected && !channel?.currentSource) {
    return 'Connected without source';
  }
  if (channel?.isStreaming && !channel?.videoCodec && channel?.videoPresent) {
    return 'Streaming without codec';
  }
  return '';
}

export function sumDroppedFrames(channels) {
  if (!Array.isArray(channels)) return 0;
  return channels.reduce(
    (acc, ch) => acc + (Number(channelStat(ch, 'droppedFrames')) || 0),
    0,
  );
}
