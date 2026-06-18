import { describe, it, expect } from 'vitest';
import { nextStfNumber } from './stf-number';

describe('nextStfNumber', () => {
  it('starts at STF-6000 when there are no STFs', () => {
    expect(nextStfNumber([])).toBe('STF-6000');
  });

  it('ignores legacy SIP-* numbers', () => {
    expect(nextStfNumber(['SIP-2026-0001', 'SIP-2026-0002'])).toBe('STF-6000');
  });

  it('increments from the highest base STF number', () => {
    expect(nextStfNumber(['STF-6000', 'STF-6001'])).toBe('STF-6002');
  });

  it('ignores revision suffixes when computing the next base number', () => {
    expect(nextStfNumber(['STF-6000', 'STF-6000-R1', 'STF-6001'])).toBe('STF-6002');
  });

  it('handles unsorted input', () => {
    expect(nextStfNumber(['STF-6005', 'STF-6001'])).toBe('STF-6006');
  });
});
