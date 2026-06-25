import { describe, it, expect } from 'vitest';
import { nextStfRevisionNumber } from './stf-revision-number';

describe('nextStfRevisionNumber', () => {
  it('first revision of a base number → .1', () => {
    expect(nextStfRevisionNumber('STF-6000', ['STF-6000'])).toBe('STF-6000.1');
  });
  it('next sibling increments the flat counter', () => {
    expect(nextStfRevisionNumber('STF-6000.1', ['STF-6000', 'STF-6000.1'])).toBe('STF-6000.2');
  });
  it('revising any sibling collapses to the same root', () => {
    expect(nextStfRevisionNumber('STF-6000', ['STF-6000', 'STF-6000.1', 'STF-6000.2'])).toBe('STF-6000.3');
  });
  it('ignores legacy multi-dot names when counting', () => {
    expect(nextStfRevisionNumber('STF-6000.1', ['STF-6000.1', 'STF-6000.1.2'])).toBe('STF-6000.2');
  });
  it('only counts siblings of the same root', () => {
    expect(nextStfRevisionNumber('STF-6000', ['STF-6000', 'STF-6001.1', 'STF-6001.2'])).toBe('STF-6000.1');
  });
});
