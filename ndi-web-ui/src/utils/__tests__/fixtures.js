// Small snapshot builders shared by the unit tests (shape matches /api/ndi/devices).

export function channel(id, overrides = {}) {
  return {
    channelId: id,
    endpointUuid: `uuid-${id}`,
    endpointName: `HOST (${id})`,
    streamLabel: `HOST (${id})`,
    isConnected: false,
    isStreaming: false,
    ...overrides,
  };
}

export function device(deviceKey, channels, overrides = {}) {
  return {
    deviceKey,
    displayName: deviceKey,
    applicationId: deviceKey,
    hostName: 'HOST',
    address: '10.0.0.1',
    channels,
    ...overrides,
  };
}

export function connection(sender, senderCh, receiver, receiverCh, overrides = {}) {
  return {
    connectionId: `uuid-${senderCh}->uuid-${receiverCh}`,
    senderDeviceKey: sender,
    senderChannelId: senderCh,
    senderLabel: `HOST (${senderCh})`,
    senderUuid: `uuid-${senderCh}`,
    receiverDeviceKey: receiver,
    receiverChannelId: receiverCh,
    receiverLabel: `HOST (${receiverCh})`,
    receiverUuid: `uuid-${receiverCh}`,
    sourceName: `HOST (${senderCh})`,
    ...overrides,
  };
}

/** One camera sender (2 outputs), one monitor receiver (1 input) connected to cam out1. */
export function basicSnapshot() {
  return {
    senders: [device('cam', [channel('cam-out1'), channel('cam-out2')])],
    receivers: [
      device('mon', [channel('mon-in1', { currentSource: 'HOST (cam-out1)', isConnected: true })], {
        applicationId: 'Monitor',
      }),
    ],
    connections: [connection('cam', 'cam-out1', 'mon', 'mon-in1')],
  };
}
