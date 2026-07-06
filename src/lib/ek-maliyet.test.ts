import { describe, it, expect } from 'vitest';
import {
  getEffectiveCostPrice,
  getEffectiveCostPriceForItem,
  getSetEffectiveCostPrice,
} from './ek-maliyet';

describe('getEffectiveCostPrice', () => {
  it('returns base cost when no delta', () => {
    expect(getEffectiveCostPrice({ costPrice: 100 })).toBe(100);
  });
  it('adds ek maliyet delta', () => {
    expect(getEffectiveCostPrice({ costPrice: 100, ekMaliyetDelta: 20 })).toBe(120);
  });
  it('returns null when cost is null and no delta', () => {
    expect(getEffectiveCostPrice({ costPrice: null })).toBeNull();
  });
});

describe('getEffectiveCostPriceForItem', () => {
  it('CUSTOM (serbest kalem) without costPrice falls back to listPrice', () => {
    expect(getEffectiveCostPriceForItem({ itemType: 'CUSTOM', costPrice: null, listPrice: 100 })).toBe(100);
  });
  it('CUSTOM with an explicit costPrice keeps it', () => {
    expect(getEffectiveCostPriceForItem({ itemType: 'CUSTOM', costPrice: 80, listPrice: 100 })).toBe(80);
  });
  it('CUSTOM with listPrice 0 stays null (no fake 0-cost)', () => {
    expect(getEffectiveCostPriceForItem({ itemType: 'CUSTOM', costPrice: null, listPrice: 0 })).toBeNull();
  });
  it('PRODUCT rows never fall back to listPrice', () => {
    expect(getEffectiveCostPriceForItem({ itemType: 'PRODUCT', costPrice: null, listPrice: 100 })).toBeNull();
  });
});

describe('getSetEffectiveCostPrice', () => {
  it('a CUSTOM child without costPrice contributes its listPrice', () => {
    expect(
      getSetEffectiveCostPrice([
        { itemType: 'CUSTOM', costPrice: null, listPrice: 50, quantity: 2 }, // 100
        { costPrice: 10, quantity: 1 },                                      // 10
      ])
    ).toBe(110);
  });

  it('sums children effective cost × quantity (per one set)', () => {
    // child A: 285.05 × 1, child B: 498.56 × 4 = 285.05 + 1994.24 = 2279.29
    expect(
      getSetEffectiveCostPrice([
        { costPrice: 285.05, quantity: 1 },
        { costPrice: 498.56, quantity: 4 },
      ])
    ).toBeCloseTo(2279.29, 2);
  });

  it('only sums children that have a cost (skips null-cost children)', () => {
    expect(
      getSetEffectiveCostPrice([
        { costPrice: 21.2, quantity: 3 }, // 63.60
        { costPrice: null, quantity: 5 }, // skipped
      ])
    ).toBeCloseTo(63.6, 2);
  });

  it('includes ek maliyet delta in each child cost', () => {
    // (10 + 2) × 2 = 24
    expect(getSetEffectiveCostPrice([{ costPrice: 10, ekMaliyetDelta: 2, quantity: 2 }])).toBe(24);
  });

  it('returns null when NO child has a cost (so UI shows "-" not 0)', () => {
    expect(
      getSetEffectiveCostPrice([
        { costPrice: null, quantity: 2 },
        { costPrice: null, quantity: 1 },
      ])
    ).toBeNull();
  });

  it('returns null for an empty set', () => {
    expect(getSetEffectiveCostPrice([])).toBeNull();
  });
});
