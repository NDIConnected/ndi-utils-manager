import { describe, expect, it } from 'vitest';
import { formatCardTitle, resolveMachineName } from '../../components/compactNodeHelpers';

describe('resolveMachineName', () => {
  it('uses the raw "HOST" prefix of the stream name (keeps spaces and case)', () => {
    expect(resolveMachineName({ hostName: 'STUDIO-PC-1' }, 'STUDIO PC 1', 'vMix')).toBe('STUDIO PC 1');
  });

  it('falls back to the backend hostName', () => {
    expect(resolveMachineName({ hostName: 'ISE-DEMO' }, '', 'Mic')).toBe('ISE-DEMO');
  });

  it('keeps accented names', () => {
    expect(resolveMachineName({ hostName: 'èèè' }, 'èèè', 'òòòòò')).toBe('èèè');
  });

  it('returns nothing when unknown, for Bridge hubs, or when it would repeat the title', () => {
    expect(resolveMachineName({ hostName: '' }, '', 'Mic')).toBe('');
    expect(resolveMachineName({ hostName: 'unknown' }, '', 'Mic')).toBe('');
    expect(resolveMachineName({ hostName: 'BRIDGE-01', isBridgeHub: true }, 'BRIDGE-01', 'NDI Bridge · BRIDGE-01')).toBe('');
    expect(resolveMachineName({ hostName: 'CAM-1' }, 'CAM-1', 'cam-1')).toBe('');
  });
});

describe('formatCardTitle', () => {
  it('formats "HOST (Stream)" like NDI source names', () => {
    expect(formatCardTitle('ISE-DEMO', 'Mic')).toBe('ISE-DEMO (Mic)');
    expect(formatCardTitle('èèè', 'òòòòò')).toBe('èèè (òòòòò)');
  });

  it('shows just the stream when the host is unknown', () => {
    expect(formatCardTitle('', 'NDI-Studio-Monitor')).toBe('NDI-Studio-Monitor');
  });
});
