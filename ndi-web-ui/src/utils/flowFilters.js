import { filterDevicesByHost, deviceHasActivity } from './deviceGrouping';

/** Lower-cased text searched by the sender/receiver filter boxes. */
export function buildDeviceSearchText(device) {
  const channels = Array.isArray(device?.channels) ? device.channels : [];
  const channelTokens = channels.flatMap((c) => [
    c?.streamLabel || '',
    c?.endpointName || '',
    c?.videoCodec || '',
    c?.audioCodec || '',
    c?.address || '',
  ]);

  return [
    device?.applicationId || '',
    device?.displayName || '',
    device?.address || '',
    device?.videoSummary || '',
    device?.audioSummary || '',
    device?.resolutionSummary || '',
    device?.frameRateSummary || '',
    device?.portSummary || '',
    ...channelTokens,
  ].join(' ').toLowerCase();
}

/**
 * Filter syntax: `a, b` = a AND b; `a|b` = a OR b; `*` and `?` wildcards; case-insensitive substring otherwise.
 */
export function matchesFilterQuery(searchText, rawQuery) {
  const query = (rawQuery || '').trim().toLowerCase();
  if (!query) return true;

  const matchesTerm = (term) => {
    const t = (term || '').trim();
    if (!t) return true;
    if (t.includes('*') || t.includes('?')) {
      const escaped = t
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
      return new RegExp(escaped, 'i').test(searchText);
    }
    return searchText.includes(t);
  };

  const andGroups = query.split(',').map((g) => g.trim()).filter(Boolean);
  if (andGroups.length === 0) return true;

  return andGroups.every((group) => {
    const orTerms = group.split('|').map((t) => t.trim()).filter(Boolean);
    if (orTerms.length === 0) return true;
    return orTerms.some((term) => matchesTerm(term));
  });
}

/** Devices shown on the canvas for the current filters, host selection and "Active only". */
export function filterSnapshotDevices(snapshot, { senderFilter, receiverFilter, selectedHostKeys, showActiveOnly }) {
  let filteredSenders = snapshot.senders.filter((device) =>
    matchesFilterQuery(buildDeviceSearchText(device), senderFilter));
  let filteredReceivers = snapshot.receivers.filter((device) =>
    matchesFilterQuery(buildDeviceSearchText(device), receiverFilter));

  filteredSenders = filterDevicesByHost(filteredSenders, selectedHostKeys);
  filteredReceivers = filterDevicesByHost(filteredReceivers, selectedHostKeys);

  if (showActiveOnly) {
    filteredSenders = filteredSenders.filter(deviceHasActivity);
    filteredReceivers = filteredReceivers.filter(deviceHasActivity);
  }

  return { filteredSenders, filteredReceivers };
}

/** NDI source names compare case-insensitively but accent-sensitively ("Città" ≠ "Citta"). */
export function sourcesMatch(a, b) {
  const left = (a || '').trim();
  const right = (b || '').trim();
  if (!left || !right) return false;
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}

/** A connection is confirmed when the receiver channel reports that source; optimistic ones never are. */
export function isConnectionConfirmed(conn, snapshot) {
  if (conn?.optimistic) return false;
  const receiverDevice = snapshot.receivers.find((d) => d.deviceKey === conn.receiverDeviceKey);
  const channel = receiverDevice?.channels?.find((c) => c.channelId === conn.receiverChannelId);
  if (!channel) return false;
  return sourcesMatch(channel.currentSource, conn.sourceName);
}
