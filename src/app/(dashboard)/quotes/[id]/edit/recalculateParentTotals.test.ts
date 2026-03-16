import { describe, it, expect } from 'vitest';
import { recalculateParentTotals } from './QuoteEditor';
import type { QuoteItemData } from '@/components/quotes/QuoteItemRow';

function makeItem(overrides: Partial<QuoteItemData> & { id: string }): QuoteItemData {
  return {
    itemType: 'PRODUCT',
    sortOrder: 1,
    description: 'Test Item',
    quantity: 1,
    unit: 'Adet',
    listPrice: 0,
    katsayi: 1,
    unitPrice: 0,
    discountPct: 0,
    vatRate: 20,
    totalPrice: 0,
    ...overrides,
  };
}

describe('recalculateParentTotals', () => {
  it('SET with basePrice=0: unitPrice equals children sum', () => {
    const items: QuoteItemData[] = [
      makeItem({ id: 'parent', itemType: 'SET', quantity: 1, discountPct: 0, listPrice: 0, katsayi: 1 }),
      makeItem({ id: 'child1', parentItemId: 'parent', totalPrice: 100 }),
      makeItem({ id: 'child2', parentItemId: 'parent', totalPrice: 200 }),
    ];

    const result = recalculateParentTotals(items, 'parent');
    const parent = result.find((i) => i.id === 'parent')!;

    expect(parent.unitPrice).toBe(300);
    expect(parent.totalPrice).toBe(300); // qty=1, disc=0
  });

  it('SET parent price equals childrenTotal only (ignores own listPrice/katsayi)', () => {
    const items: QuoteItemData[] = [
      makeItem({ id: 'parent', itemType: 'SET', quantity: 1, discountPct: 0, listPrice: 500, katsayi: 1.2 }),
      makeItem({ id: 'child1', parentItemId: 'parent', totalPrice: 200 }),
    ];

    const result = recalculateParentTotals(items, 'parent');
    const parent = result.find((i) => i.id === 'parent')!;

    expect(parent.unitPrice).toBe(200); // childrenTotal only
    expect(parent.totalPrice).toBe(200);
  });

  it('SET with quantity=3: totalPrice = 3 × unitPrice', () => {
    const items: QuoteItemData[] = [
      makeItem({ id: 'parent', itemType: 'SET', quantity: 3, discountPct: 0, listPrice: 0, katsayi: 1 }),
      makeItem({ id: 'child1', parentItemId: 'parent', totalPrice: 100 }),
      makeItem({ id: 'child2', parentItemId: 'parent', totalPrice: 50 }),
    ];

    const result = recalculateParentTotals(items, 'parent');
    const parent = result.find((i) => i.id === 'parent')!;

    expect(parent.unitPrice).toBe(150);
    expect(parent.totalPrice).toBe(450); // qty=3 * 150
  });

  it('SET with discountPct=10%: totalPrice includes discount', () => {
    const items: QuoteItemData[] = [
      makeItem({ id: 'parent', itemType: 'SET', quantity: 1, discountPct: 10, listPrice: 0, katsayi: 1 }),
      makeItem({ id: 'child1', parentItemId: 'parent', totalPrice: 200 }),
    ];

    const result = recalculateParentTotals(items, 'parent');
    const parent = result.find((i) => i.id === 'parent')!;

    expect(parent.unitPrice).toBe(200);
    expect(parent.totalPrice).toBe(180); // 1 * 200 * (1 - 10/100)
  });

  it('SET with no children: unitPrice = 0', () => {
    const items: QuoteItemData[] = [
      makeItem({ id: 'parent', itemType: 'SET', quantity: 1, discountPct: 0, listPrice: 500, katsayi: 1.5 }),
    ];

    const result = recalculateParentTotals(items, 'parent');
    const parent = result.find((i) => i.id === 'parent')!;

    expect(parent.unitPrice).toBe(0);
    expect(parent.totalPrice).toBe(0);
  });

  it('does not modify non-parent items', () => {
    const items: QuoteItemData[] = [
      makeItem({ id: 'parent', itemType: 'SET', quantity: 1, discountPct: 0, listPrice: 0, katsayi: 1 }),
      makeItem({ id: 'child1', parentItemId: 'parent', totalPrice: 100 }),
      makeItem({ id: 'other', totalPrice: 999 }),
    ];

    const result = recalculateParentTotals(items, 'parent');
    const other = result.find((i) => i.id === 'other')!;

    expect(other.totalPrice).toBe(999);
  });

  it('does not mutate the original array', () => {
    const items: QuoteItemData[] = [
      makeItem({ id: 'parent', itemType: 'SET', quantity: 1, discountPct: 0, listPrice: 0, katsayi: 1 }),
      makeItem({ id: 'child1', parentItemId: 'parent', totalPrice: 100 }),
    ];

    const originalParent = items[0];
    recalculateParentTotals(items, 'parent');

    // Original should not be mutated
    expect(originalParent.unitPrice).toBe(0);
    expect(originalParent.totalPrice).toBe(0);
  });
});
