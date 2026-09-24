import { describe, it, expect } from 'vitest';
import { getQuoteEditDenial, QUOTE_EDIT_FORBIDDEN, QUOTE_EDIT_PENDING_APPROVAL } from './quote-edit-access';

const sales = (id: string, roleId = 'role-sales') => ({
  id, roleId, role: { canApprove: false, canManageUsers: false },
});
const approver = { id: 'mgr', roleId: 'role-mgr', role: { canApprove: true, canManageUsers: false } };

describe('getQuoteEditDenial', () => {
  it('allows the creator on a TASLAK quote', () => {
    expect(getQuoteEditDenial(sales('a'), { createdById: 'a', status: 'TASLAK', project: null })).toBeNull();
  });

  it('denies a non-creator with no project visibility', () => {
    expect(getQuoteEditDenial(sales('b'), { createdById: 'a', status: 'TASLAK', project: null }))
      .toEqual({ status: 403, error: QUOTE_EDIT_FORBIDDEN });
  });

  it('allows a non-creator who can see the quote through project visibility (client 02.09)', () => {
    const quote = { createdById: 'a', status: 'TASLAK', project: { visibility: 'EVERYONE' } };
    expect(getQuoteEditDenial(sales('b'), quote)).toBeNull();
    const roleQuote = { createdById: 'a', status: 'TASLAK', project: { visibility: 'ROLE', visibleToRoleId: 'role-sales' } };
    expect(getQuoteEditDenial(sales('b'), roleQuote)).toBeNull();
    expect(getQuoteEditDenial(sales('b', 'role-other'), roleQuote)).not.toBeNull();
  });

  it('keeps ONAY_BEKLIYOR approver-only even for the creator', () => {
    const quote = { createdById: 'a', status: 'ONAY_BEKLIYOR', project: null };
    expect(getQuoteEditDenial(sales('a'), quote)).toEqual({ status: 403, error: QUOTE_EDIT_PENDING_APPROVAL });
    expect(getQuoteEditDenial(approver, quote)).toBeNull();
  });

  it('managers bypass visibility', () => {
    expect(getQuoteEditDenial(approver, { createdById: 'a', status: 'TASLAK', project: null })).toBeNull();
  });
});
