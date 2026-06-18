import { describe, it, expect } from 'vitest';
import { computeStfTotals } from './stf-totals';

const base = {
  pozNo: null, code: null, brand: null, model: null, unit: 'Adet',
  quantity: 1, sortOrder: 0, sectionDiscountLabel: null,
};

describe('computeStfTotals', () => {
  it('sums priced rows with no sections or discounts', () => {
    const r = computeStfTotals([
      { ...base, itemType: 'PRODUCT', description: 'A', unitPrice: 100, totalPrice: 100, priceLabel: null, parentItemId: null, discountPct: 0, sectionDiscountPct: null },
      { ...base, itemType: 'PRODUCT', description: 'B', unitPrice: 50, totalPrice: 50, priceLabel: null, parentItemId: null, discountPct: 0, sectionDiscountPct: null },
    ]);
    expect(r.grandTotal).toBe(150);
    expect(r.discountTotal).toBe(0);
  });

  it('applies per-section discount at SUBTOTAL and accumulates net across sections', () => {
    const r = computeStfTotals([
      { ...base, itemType: 'PRODUCT', description: 'A', totalPrice: 100, priceLabel: null, parentItemId: null, discountPct: 0, sectionDiscountPct: null },
      { ...base, itemType: 'SUBTOTAL', description: '', totalPrice: 0, priceLabel: null, parentItemId: null, discountPct: 0, sectionDiscountPct: 30 },
      { ...base, itemType: 'PRODUCT', description: 'B', totalPrice: 200, priceLabel: null, parentItemId: null, discountPct: 0, sectionDiscountPct: null },
      { ...base, itemType: 'SUBTOTAL', description: '', totalPrice: 0, priceLabel: null, parentItemId: null, discountPct: 0, sectionDiscountPct: 10 },
    ]);
    expect(r.discountTotal).toBe(50);
    expect(r.grandTotal).toBe(250);
  });

  it('excludes priceLabel rows and SET children from the section sum', () => {
    const r = computeStfTotals([
      { ...base, itemType: 'SET', description: 'Set', totalPrice: 400, priceLabel: null, parentItemId: null, discountPct: 0, sectionDiscountPct: null },
      { ...base, itemType: 'PRODUCT', description: 'child', totalPrice: 999, priceLabel: null, parentItemId: 'set1', discountPct: 0, sectionDiscountPct: null },
      { ...base, itemType: 'PRODUCT', description: 'incl', totalPrice: 0, priceLabel: 'dahildir', parentItemId: null, discountPct: 0, sectionDiscountPct: null },
    ]);
    expect(r.grandTotal).toBe(400);
    expect(r.discountTotal).toBe(0);
  });
});
