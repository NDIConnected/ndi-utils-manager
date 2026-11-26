import { describe, expect, it } from 'vitest';
import { resolveMachineName } from '../../components/compactNodeHelpers';

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
