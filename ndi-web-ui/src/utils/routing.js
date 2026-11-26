/** Resolves a React Flow connection (node + handle ids) to devices, channels, NDI source name and receiver UUID. */
export function resolveConnectionDetails(params, snapshot) {
  const sourceDeviceKey = (params?.source ?? '').replace('sender-device-', '');
  const targetDeviceKey = (params?.target ?? '').replace('receiver-device-', '');
  const sourceChannelId = (params?.sourceHandle ?? '').replace('out-', '');
  const targetChannelId = (params?.targetHandle ?? '').replace('in-', '');
  const sourceDevice = snapshot.senders.find((d) => d.deviceKey === sourceDeviceKey);
  const sourceChannel = sourceDevice?.channels?.find((c) => c.channelId === sourceChannelId);
  const targetDevice = snapshot.receivers.find((d) => d.deviceKey === targetDeviceKey);
  const targetChannel = targetDevice?.channels?.find((c) => c.channelId === targetChannelId);
  const sourceName = sourceChannel?.endpointName || sourceChannel?.streamLabel || '';
  const receiverUuid = targetChannel?.endpointUuid || '';
  return { sourceName, receiverUuid, sourceChannel, targetChannel, sourceDevice, targetDevice };
}

/** Connection drawn immediately after a connect command, until the backend confirms (or it expires). */
export function buildOptimisticConnection(details, now = Date.now()) {
  const { sourceDevice, targetDevice, sourceChannel, targetChannel, sourceName, receiverUuid } = details;
  if (!sourceDevice || !targetDevice || !sourceChannel || !targetChannel || !receiverUuid) return null;

  return {
    connectionId: `${sourceChannel.endpointUuid}->${targetChannel.endpointUuid}`,
    senderDeviceKey: sourceDevice.deviceKey,
    senderChannelId: sourceChannel.channelId,
    senderLabel: sourceChannel.streamLabel,
    senderUuid: sourceChannel.endpointUuid,
    receiverDeviceKey: targetDevice.deviceKey,
    receiverChannelId: targetChannel.channelId,
    receiverLabel: targetChannel.streamLabel,
    receiverUuid,
    sourceName,
    optimistic: true,
    createdAt: now,
  };
}
