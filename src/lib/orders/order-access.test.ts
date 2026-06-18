import { describe, it, expect } from 'vitest';
import { canAccessOrder, isStfEditable } from './order-access';

const order = (over: Partial<Parameters<typeof canAccessOrder>[0]> = {}) => ({
  createdById: 'creator',
  quote: {
    createdById: 'quoteCreator',
    project: { visibility: 'SPECIFIC_USERS', visibleTo: [{ userId: 'allowed' }] },
  },
  ...over,
});

describe('canAccessOrder', () => {
  it('grants managers access to everything', () => {
    expect(canAccessOrder(order(), 'stranger', true)).toBe(true);
  });

  it('grants the STF creator access', () => {
    expect(canAccessOrder(order(), 'creator', false)).toBe(true);
  });

  it('grants the source quote creator access', () => {
    expect(canAccessOrder(order(), 'quoteCreator', false)).toBe(true);
  });

  it('grants access to users on a SPECIFIC_USERS project visibleTo list', () => {
    expect(canAccessOrder(order(), 'allowed', false)).toBe(true);
  });

  it('grants everyone access when the project is EVERYONE', () => {
    const o = order({ quote: { createdById: 'q', project: { visibility: 'EVERYONE' } } });
    expect(canAccessOrder(o, 'stranger', false)).toBe(true);
  });

  it('denies a stranger with no creator/visibility match', () => {
    expect(canAccessOrder(order(), 'stranger', false)).toBe(false);
  });

  it('denies a stranger when there is no quote relation', () => {
    expect(canAccessOrder({ createdById: 'creator', quote: null }, 'stranger', false)).toBe(false);
  });
});

describe('isStfEditable', () => {
  it('allows editing in HAZIRLANIYOR and ONAYLANDI', () => {
    expect(isStfEditable('HAZIRLANIYOR')).toBe(true);
    expect(isStfEditable('ONAYLANDI')).toBe(true);
  });
  it('freezes sent/terminal STFs', () => {
    expect(isStfEditable('GONDERILDI')).toBe(false);
    expect(isStfEditable('TAMAMLANDI')).toBe(false);
    expect(isStfEditable('IPTAL')).toBe(false);
  });
});
