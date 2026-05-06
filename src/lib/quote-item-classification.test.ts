import { describe, it, expect } from 'vitest';
import {
  isRateSensitiveRow,
  isSetParentRow,
  isManualCommitmentRow,
} from './quote-item-classification';

describe('isRateSensitiveRow', () => {
  const baseProduct = {
    itemType: 'PRODUCT',
    productCurrency: 'TRY',
    productListPrice: 100,
    productCostPrice: 80,
    isManualPrice: false,
    priceLabel: null,
    parentItemId: null,
  };

  it('returns true for a normal product row with list and cost', () => {
    expect(isRateSensitiveRow(baseProduct)).toBe(true);
  });

  it('returns true for an insurance/service row with listPrice=0 but costPrice>0', () => {
    // Regression: a TRY-priced insurance product with master.listPrice=0
    // and master.costPrice=10 was being skipped by the predicate, so
    // currency-change recompute never updated its cost. Cost would
    // stay at the previous currency's converted value.
    expect(
      isRateSensitiveRow({
        ...baseProduct,
        productListPrice: 0,
        productCostPrice: 10,
      })
    ).toBe(true);
  });

  it('returns false when both listPrice and costPrice are absent', () => {
    expect(
      isRateSensitiveRow({
        ...baseProduct,
        productListPrice: 0,
        productCostPrice: null,
      })
    ).toBe(false);
  });

  it('returns false when productCurrency is missing', () => {
    expect(
      isRateSensitiveRow({ ...baseProduct, productCurrency: null })
    ).toBe(false);
  });

  it('returns false when productListPrice is null (no master reference)', () => {
    expect(
      isRateSensitiveRow({ ...baseProduct, productListPrice: null })
    ).toBe(false);
  });

  it('returns false for manual-priced rows', () => {
    expect(isRateSensitiveRow({ ...baseProduct, isManualPrice: true })).toBe(false);
  });

  it('returns false for price-labeled rows', () => {
    expect(
      isRateSensitiveRow({ ...baseProduct, priceLabel: 'TARAFINIZCA SAĞLANACAKTIR' })
    ).toBe(false);
  });

  it('returns false for HEADER / NOTE / SUBTOTAL / GRAND_TOTAL', () => {
    for (const t of ['HEADER', 'NOTE', 'SUBTOTAL', 'GRAND_TOTAL']) {
      expect(isRateSensitiveRow({ ...baseProduct, itemType: t })).toBe(false);
    }
  });

  it('returns false for top-level SET parents (rolled up from children)', () => {
    expect(
      isRateSensitiveRow({ ...baseProduct, itemType: 'SET', parentItemId: null })
    ).toBe(false);
  });

  it('returns true for a SET sub-item with listPrice and costPrice', () => {
    expect(
      isRateSensitiveRow({
        ...baseProduct,
        itemType: 'PRODUCT',
        parentItemId: 'set-1',
      })
    ).toBe(true);
  });
});

describe('isSetParentRow', () => {
  it('returns true only for top-level SET rows', () => {
    expect(isSetParentRow({ itemType: 'SET', parentItemId: null })).toBe(true);
    expect(isSetParentRow({ itemType: 'SET', parentItemId: 'parent-1' })).toBe(false);
    expect(isSetParentRow({ itemType: 'PRODUCT', parentItemId: null })).toBe(false);
  });
});

describe('isManualCommitmentRow', () => {
  const baseProduct = {
    itemType: 'PRODUCT',
    productCurrency: 'TRY',
    productListPrice: 100,
    productCostPrice: 80,
    isManualPrice: false,
    priceLabel: null,
    parentItemId: null,
  };

  it('returns true for explicitly manual-priced rows', () => {
    expect(isManualCommitmentRow({ ...baseProduct, isManualPrice: true })).toBe(true);
  });

  it('returns true for rows with no product reference', () => {
    expect(
      isManualCommitmentRow({ ...baseProduct, productCurrency: null })
    ).toBe(true);
  });

  it('returns false for normal product rows', () => {
    expect(isManualCommitmentRow(baseProduct)).toBe(false);
  });

  it('returns false for insurance rows (listPrice=0, costPrice>0) — mirror of isRateSensitiveRow', () => {
    expect(
      isManualCommitmentRow({
        ...baseProduct,
        productListPrice: 0,
        productCostPrice: 10,
      })
    ).toBe(false);
  });

  it('excludes structural rows', () => {
    for (const t of ['HEADER', 'NOTE', 'SUBTOTAL', 'GRAND_TOTAL']) {
      expect(isManualCommitmentRow({ ...baseProduct, itemType: t })).toBe(false);
    }
  });
});
