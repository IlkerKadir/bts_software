import { describe, it, expect } from 'vitest';
import {
  computeManagerProfitSummary,
  type ProfitSummaryItem,
} from './brand-profit-summary';

const EUR = { currency: 'EUR', exchangeRate: 1, protectionPct: 0 };

function item(partial: Partial<ProfitSummaryItem> & { id: string; itemType: string }): ProfitSummaryItem {
  return { ...partial };
}

describe('computeManagerProfitSummary', () => {
  it('groups plain products by their own brand (back-compat)', () => {
    const items: ProfitSummaryItem[] = [
      item({ id: 'a', itemType: 'PRODUCT', brand: 'X', quantity: 2, unitPrice: 100, costPrice: 60 }),
      item({ id: 'b', itemType: 'PRODUCT', brand: 'Y', quantity: 1, unitPrice: 50, costPrice: 20 }),
    ];
    const r = computeManagerProfitSummary(items, items, EUR);

    expect(r.brands).toEqual([
      { brand: 'X', itemCount: 1, totalRevenue: 200, totalCost: 120, profit: 80, margin: 40 },
      { brand: 'Y', itemCount: 1, totalRevenue: 50, totalCost: 20, profit: 30, margin: 60 },
    ]);
    expect(r.sets).toEqual([]);
    expect(r.totals.totalRevenue).toBe(250);
    expect(r.totals.totalCost).toBe(140);
  });

  it('attributes a cross-brand SET child cost to the SET parent brand (B6 fix)', () => {
    // Mirrors CC0335-YAS: SET parent ADVANTECH; children of mixed brands.
    const items: ProfitSummaryItem[] = [
      item({ id: 's1', itemType: 'SET', brand: 'ADVANTECH', description: 'Devreye Alma', quantity: 1, unitPrice: 1000 }),
      item({ id: 'c1', itemType: 'PRODUCT', brand: 'ADVANTECH', parentItemId: 's1', quantity: 1, unitPrice: 600, costPrice: 400 }),
      item({ id: 'c2', itemType: 'PRODUCT', brand: 'BTS', parentItemId: 's1', quantity: 1, unitPrice: 400, costPrice: 300 }),
    ];
    const r = computeManagerProfitSummary(items, items, EUR);

    // Old buggy behaviour: ADVANTECH rev 1000 / cost 400, plus a phantom
    // BTS row with cost 300 and zero revenue. Fixed: one ADVANTECH bucket.
    expect(r.brands).toHaveLength(1);
    expect(r.brands[0]).toEqual({
      brand: 'ADVANTECH',
      itemCount: 1,
      totalRevenue: 1000,
      totalCost: 700,
      profit: 300,
      margin: 30,
    });
    // No phantom BTS loss row.
    expect(r.brands.find((b) => b.brand === 'BTS')).toBeUndefined();
  });

  it('produces a per-set breakdown (sale / cost / profit)', () => {
    const items: ProfitSummaryItem[] = [
      item({ id: 's1', itemType: 'SET', brand: 'ADVANTECH', description: 'Set 1', quantity: 1, unitPrice: 1000 }),
      item({ id: 'c1', itemType: 'PRODUCT', brand: 'ADVANTECH', parentItemId: 's1', quantity: 1, unitPrice: 600, costPrice: 400 }),
      item({ id: 'c2', itemType: 'PRODUCT', brand: 'BTS', parentItemId: 's1', quantity: 1, unitPrice: 400, costPrice: 300 }),
    ];
    const r = computeManagerProfitSummary(items, items, EUR);

    expect(r.sets).toEqual([
      { id: 's1', name: 'Set 1', totalRevenue: 1000, totalCost: 700, profit: 300, margin: 30 },
    ]);
  });

  it('multiplies child cost by quantity in the set breakdown', () => {
    const items: ProfitSummaryItem[] = [
      item({ id: 's1', itemType: 'SET', brand: 'BTS', description: 'Set', quantity: 1, unitPrice: 900 }),
      item({ id: 'c1', itemType: 'PRODUCT', brand: 'BTS', parentItemId: 's1', quantity: 3, unitPrice: 300, costPrice: 150 }),
    ];
    const r = computeManagerProfitSummary(items, items, EUR);
    // cost = 150 * 3 = 450, not 150
    expect(r.sets[0].totalCost).toBe(450);
    expect(r.brands[0].totalCost).toBe(450);
  });

  it('scales child costs by the parent SET quantity (qty>1 sets)', () => {
    // Revenue side is set.qty × unitPrice; child quantities are per ONE set,
    // so cost must scale by set.qty too or margins inflate.
    const items: ProfitSummaryItem[] = [
      item({ id: 's1', itemType: 'SET', brand: 'BTS', description: 'Set', quantity: 2, unitPrice: 1000 }),
      item({ id: 'c1', itemType: 'PRODUCT', brand: 'BTS', parentItemId: 's1', quantity: 3, unitPrice: 300, costPrice: 100 }),
    ];
    const r = computeManagerProfitSummary(items, items, EUR);
    expect(r.sets[0].totalRevenue).toBe(2000);
    expect(r.sets[0].totalCost).toBe(600); // 100 × 3 (per set) × 2 sets
    expect(r.brands[0].totalCost).toBe(600);
  });

  it('uses listPrice as the cost for CUSTOM (serbest kalem) rows without a costPrice', () => {
    // Client 30.06: serbest kalem liste 100 / katsayı 2 → satış 200; maliyet
    // must show 100, not blank/0.
    const items: ProfitSummaryItem[] = [
      item({ id: 'f1', itemType: 'CUSTOM', quantity: 1, unitPrice: 200, listPrice: 100 }),
    ];
    const r = computeManagerProfitSummary(items, items, EUR);
    expect(r.brands[0]).toEqual({
      brand: 'Diger', itemCount: 1, totalRevenue: 200, totalCost: 100, profit: 100, margin: 50,
    });
  });

  it('a CUSTOM row with an explicit costPrice keeps it (no listPrice override)', () => {
    const items: ProfitSummaryItem[] = [
      item({ id: 'f1', itemType: 'CUSTOM', quantity: 1, unitPrice: 200, listPrice: 100, costPrice: 80 }),
    ];
    const r = computeManagerProfitSummary(items, items, EUR);
    expect(r.brands[0].totalCost).toBe(80);
  });

  it('finds SET children from the FULL list when a section slice excludes them (07.07)', () => {
    // Live data: children's flat position (sortOrder) can sit in ANOTHER
    // section than their parent. Section filter slices visibleItems
    // positionally → the old code showed the SET's revenue with 0 cost.
    const parent = item({ id: 's1', itemType: 'SET', brand: 'BTS', description: 'Montaj Set', quantity: 1, unitPrice: 1082 });
    const childA = item({ id: 'c1', itemType: 'PRODUCT', parentItemId: 's1', quantity: 3, unitPrice: 200, costPrice: 150 });
    const childB = item({ id: 'c2', itemType: 'PRODUCT', parentItemId: 's1', quantity: 1, unitPrice: 100, costPrice: 90 });
    const allItems = [childA, childB, parent]; // children positioned elsewhere
    const visible = [parent]; // section slice contains only the parent

    const r = computeManagerProfitSummary(allItems, visible, EUR);
    expect(r.sets[0].totalCost).toBe(540); // 150×3 + 90×1
    expect(r.brands[0].totalCost).toBe(540);
    expect(r.brands[0].totalRevenue).toBe(1082);
  });

  it('a child sliced into view WITHOUT its parent adds no phantom cost', () => {
    const parent = item({ id: 's1', itemType: 'SET', brand: 'BTS', quantity: 1, unitPrice: 1000 });
    const child = item({ id: 'c1', itemType: 'PRODUCT', brand: 'BTS', parentItemId: 's1', quantity: 1, unitPrice: 0, costPrice: 400 });
    const r = computeManagerProfitSummary([parent, child], [child], EUR);
    expect(r.brands).toEqual([]); // no revenue row, no cost-only phantom row
    expect(r.totals.totalCost).toBe(0);
  });

  it('keeps grand totals identical regardless of attribution', () => {
    const items: ProfitSummaryItem[] = [
      item({ id: 's1', itemType: 'SET', brand: 'ADVANTECH', quantity: 1, unitPrice: 1000 }),
      item({ id: 'c1', itemType: 'PRODUCT', brand: 'ADVANTECH', parentItemId: 's1', quantity: 1, unitPrice: 600, costPrice: 400 }),
      item({ id: 'c2', itemType: 'PRODUCT', brand: 'BTS', parentItemId: 's1', quantity: 1, unitPrice: 400, costPrice: 300 }),
    ];
    const r = computeManagerProfitSummary(items, items, EUR);
    expect(r.totals.totalRevenue).toBe(1000);
    expect(r.totals.totalCost).toBe(700);
    expect(r.totals.profit).toBe(300);
  });

  it('applies discountPct and section discount to revenue', () => {
    const items: ProfitSummaryItem[] = [
      item({ id: 'p1', itemType: 'PRODUCT', brand: 'X', quantity: 1, unitPrice: 100, discountPct: 10, costPrice: 50 }),
      item({ id: 'st', itemType: 'SUBTOTAL', sectionDiscountPct: 10 }),
    ];
    const r = computeManagerProfitSummary(items, items, EUR);
    // 100 * (1 - 0.10) * (1 - 0.10) = 81
    expect(r.brands[0].totalRevenue).toBeCloseTo(81, 5);
  });

  it('converts TRY-priced SET and children into the quote (EUR) currency', () => {
    const ctx = { currency: 'EUR', exchangeRate: 30, protectionPct: 0 };
    const items: ProfitSummaryItem[] = [
      item({ id: 's1', itemType: 'SET', brand: 'BTS', currency: 'TRY', quantity: 1, unitPrice: 3000 }),
      item({ id: 'c1', itemType: 'PRODUCT', brand: 'BTS', parentItemId: 's1', quantity: 1, unitPrice: 1500, costPrice: 1500 }),
    ];
    const r = computeManagerProfitSummary(items, items, ctx);
    // 3000 TRY / 30 = 100 EUR revenue; 1500 TRY / 30 = 50 EUR cost
    expect(r.sets[0].totalRevenue).toBeCloseTo(100, 5);
    expect(r.sets[0].totalCost).toBeCloseTo(50, 5);
  });

  it('skips price-labeled rows entirely (no revenue, no cost)', () => {
    const items: ProfitSummaryItem[] = [
      item({ id: 'p1', itemType: 'PRODUCT', brand: 'X', quantity: 1, unitPrice: 100, costPrice: 40 }),
      item({ id: 'p2', itemType: 'CUSTOM', brand: 'X', quantity: 1, unitPrice: 0, priceLabel: 'tarafınızca sağlanacaktır' }),
    ];
    const r = computeManagerProfitSummary(items, items, EUR);
    expect(r.brands).toHaveLength(1);
    expect(r.brands[0].itemCount).toBe(1);
    expect(r.brands[0].totalRevenue).toBe(100);
  });

  it('does not emit an empty brand row for a cost-less SET child', () => {
    // A SET child with no cost (e.g. a labor line, null costPrice) and a brand
    // different from the parent must NOT create a zero-valued brand row.
    const items: ProfitSummaryItem[] = [
      item({ id: 's1', itemType: 'SET', brand: 'ADVANTECH', quantity: 1, unitPrice: 1000 }),
      item({ id: 'c1', itemType: 'PRODUCT', brand: 'ADVANTECH', parentItemId: 's1', quantity: 1, unitPrice: 600, costPrice: 400 }),
      item({ id: 'c2', itemType: 'PRODUCT', brand: 'LABOR', parentItemId: 's1', quantity: 1, unitPrice: 400, costPrice: null }),
    ];
    const r = computeManagerProfitSummary(items, items, EUR);
    expect(r.brands.find((b) => b.brand === 'LABOR')).toBeUndefined();
    expect(r.brands).toHaveLength(1);
  });

  it('ignores headers, notes, subtotals and grand totals', () => {
    const items: ProfitSummaryItem[] = [
      item({ id: 'h', itemType: 'HEADER' }),
      item({ id: 'n', itemType: 'NOTE' }),
      item({ id: 'g', itemType: 'GRAND_TOTAL' }),
      item({ id: 'p1', itemType: 'PRODUCT', brand: 'X', quantity: 1, unitPrice: 100, costPrice: 40 }),
    ];
    const r = computeManagerProfitSummary(items, items, EUR);
    expect(r.brands).toHaveLength(1);
    expect(r.totals.itemCount).toBe(1);
  });
});
