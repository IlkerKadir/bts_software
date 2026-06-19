import { describe, it, expect } from 'vitest';
import { computeStfTotals } from './stf-totals';

const base = {
  pozNo: null, code: null, brand: null, model: null, unit: 'Adet',
  quantity: 1, sortOrder: 0, sectionDiscountLabel: null,
};

describe('computeStfTotals', () => {
  it('sums priced rows with no sections or discounts', () => {
    const r = computeStfTotals([
      { ...base, itemType: 'PRODUCT', totalPrice: 100, priceLabel: null, parentItemId: null, sectionDiscountPct: null },
      { ...base, itemType: 'PRODUCT', totalPrice: 50, priceLabel: null, parentItemId: null, sectionDiscountPct: null },
    ]);
    expect(r.grandTotal).toBe(150);
    expect(r.discountTotal).toBe(0);
  });

  it('applies per-section discount at SUBTOTAL and accumulates net across sections', () => {
    const r = computeStfTotals([
      { ...base, itemType: 'PRODUCT',totalPrice: 100, priceLabel: null, parentItemId: null, sectionDiscountPct: null },
      { ...base, itemType: 'SUBTOTAL',totalPrice: 0, priceLabel: null, parentItemId: null, sectionDiscountPct: 30 },
      { ...base, itemType: 'PRODUCT',totalPrice: 200, priceLabel: null, parentItemId: null, sectionDiscountPct: null },
      { ...base, itemType: 'SUBTOTAL',totalPrice: 0, priceLabel: null, parentItemId: null, sectionDiscountPct: 10 },
    ]);
    expect(r.discountTotal).toBe(50);
    expect(r.grandTotal).toBe(250);
  });

  it('excludes priceLabel rows and SET children from the section sum', () => {
    const r = computeStfTotals([
      { ...base, itemType: 'SET',totalPrice: 400, priceLabel: null, parentItemId: null, sectionDiscountPct: null },
      { ...base, itemType: 'PRODUCT',totalPrice: 999, priceLabel: null, parentItemId: 'set1', sectionDiscountPct: null },
      { ...base, itemType: 'PRODUCT',totalPrice: 0, priceLabel: 'dahildir', parentItemId: null, sectionDiscountPct: null },
    ]);
    expect(r.grandTotal).toBe(400);
    expect(r.discountTotal).toBe(0);
  });
});
