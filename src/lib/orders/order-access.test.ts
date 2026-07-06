import { describe, it, expect } from 'vitest';
import { canAccessOrder, isStfEditable, orderVisibilityWhere } from './order-access';

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

describe('orderVisibilityWhere', () => {
  const manager = { id: 'm', role: { canApprove: true, canManageUsers: false } };
  const regular = { id: 'u1', role: { canApprove: false, canManageUsers: false } };

  it('returns no restriction for managers', () => {
    expect(orderVisibilityWhere(manager)).toEqual({});
  });

  it('mirrors canAccessOrder for regular users (creator, quote creator, project visibility)', () => {
    expect(orderVisibilityWhere(regular)).toEqual({
      OR: [
        { createdById: 'u1' },
        { quote: { createdById: 'u1' } },
        { quote: { project: { visibility: 'EVERYONE' } } },
        {
          quote: {
            project: {
              visibility: 'SPECIFIC_USERS',
              visibleTo: { some: { userId: 'u1' } },
            },
          },
        },
      ],
    });
  });
});

describe('isStfEditable', () => {
  it('allows editing only in TASLAK', () => {
    expect(isStfEditable('TASLAK')).toBe(true);
  });
  it('freezes completed/cancelled STFs', () => {
    expect(isStfEditable('TAMAMLANDI')).toBe(false);
    expect(isStfEditable('IPTAL')).toBe(false);
  });
});
