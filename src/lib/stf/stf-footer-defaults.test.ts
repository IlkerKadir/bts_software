import { describe, it, expect } from 'vitest';
import { footerDefaultsFromTerms } from './stf-footer-defaults';

describe('footerDefaultsFromTerms', () => {
  it('maps known categories to footer fields', () => {
    const r = footerDefaultsFromTerms([
      { category: 'payment', value: '30 gün' },
      { category: 'delivery', value: 'BTS depo' },
      { category: 'warranty', value: '2 yıl' },
      { category: 'vat', value: 'KDV dahil değildir' },
      { category: 'teslim_yeri', value: 'İstanbul' },
    ]);
    expect(r.paymentTerms).toBe('30 gün');
    expect(r.warranty).toBe('2 yıl');
    expect(r.vatNote).toBe('KDV dahil değildir');
    // teslim_yeri preferred over delivery for deliveryPlace
    expect(r.deliveryPlace).toBe('İstanbul');
  });

  it('falls back to delivery when teslim_yeri is absent', () => {
    const r = footerDefaultsFromTerms([{ category: 'delivery', value: 'BTS depo' }]);
    expect(r.deliveryPlace).toBe('BTS depo');
  });

  it('joins multiple terms in the same category with newlines', () => {
    const r = footerDefaultsFromTerms([
      { category: 'payment', value: 'A' },
      { category: 'payment', value: 'B' },
    ]);
    expect(r.paymentTerms).toBe('A\nB');
  });

  it('returns all-null for empty input', () => {
    expect(footerDefaultsFromTerms([])).toEqual({
      paymentTerms: null, deliveryPlace: null, warranty: null, vatNote: null,
    });
  });
});
