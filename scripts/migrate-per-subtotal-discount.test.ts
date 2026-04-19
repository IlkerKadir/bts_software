import { describe, it, expect, vi, beforeEach } from 'vitest';

// Under test — imported lazily inside tests so we can mock the db module
// before the module graph is resolved.
const modulePath = './migrate-per-subtotal-discount';

// Minimal Decimal fake so tests don't pull in @prisma/client/runtime.
class FakeDecimal {
  constructor(public value: number) {}
  toNumber() { return this.value; }
  // Make `Number(fakeDec)` and arithmetic coercion work — the migration
  // script calls `Number(x)` on Prisma Decimal values, and JS looks up
  // valueOf() for that.
  valueOf() { return this.value; }
}

const makeQuote = (overrides: Partial<{
  id: string;
  discountPct: number;
  discountScopeSubtotalId: string | null;
  subtotal: number;
  grandTotal: number;
  currency: string;
  exchangeRate: number;
  protectionPct: number;
}>) => ({
  id: 'q1',
  discountScopeSubtotalId: null,
  currency: 'EUR',
  quoteNumber: 'Q-0001',
  ...overrides,
  discountPct: overrides.discountPct != null ? new FakeDecimal(overrides.discountPct) : new FakeDecimal(0),
  subtotal: overrides.subtotal != null ? new FakeDecimal(overrides.subtotal) : new FakeDecimal(0),
  grandTotal: overrides.grandTotal != null ? new FakeDecimal(overrides.grandTotal) : new FakeDecimal(0),
  exchangeRate: overrides.exchangeRate != null ? new FakeDecimal(overrides.exchangeRate) : new FakeDecimal(1),
  protectionPct: overrides.protectionPct != null ? new FakeDecimal(overrides.protectionPct) : new FakeDecimal(0),
});

const makeItem = (overrides: Partial<{
  id: string;
  itemType: string;
  quoteId: string;
  sortOrder: number;
  sectionDiscountPct: number | null;
  unitPrice: number;
  quantity: number;
  discountPct: number;
  parentItemId: string | null;
  priceLabel: string | null;
  currency: string | null;
}>) => ({
  id: 'item',
  itemType: 'PRODUCT',
  quoteId: 'q1',
  sortOrder: 1,
  parentItemId: null,
  priceLabel: null,
  currency: null,
  vatRate: new FakeDecimal(0),
  totalPrice: new FakeDecimal(0),
  listPrice: new FakeDecimal(0),
  katsayi: new FakeDecimal(1),
  ...overrides,
  sectionDiscountPct: overrides.sectionDiscountPct != null ? new FakeDecimal(overrides.sectionDiscountPct) : null,
  unitPrice: overrides.unitPrice != null ? new FakeDecimal(overrides.unitPrice) : new FakeDecimal(100),
  quantity: overrides.quantity != null ? new FakeDecimal(overrides.quantity) : new FakeDecimal(1),
  discountPct: overrides.discountPct != null ? new FakeDecimal(overrides.discountPct) : new FakeDecimal(0),
});

describe('migrate-per-subtotal-discount script', () => {
  const quoteFindMany = vi.fn();
  const itemFindMany = vi.fn();
  const itemUpdate = vi.fn();
  const quoteUpdate = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    vi.doMock('@/lib/db', () => ({
      db: {
        quote: { findMany: quoteFindMany, update: quoteUpdate },
        quoteItem: { findMany: itemFindMany, update: itemUpdate },
        $transaction: (cb: (tx: unknown) => unknown) => cb({
          quote: { update: quoteUpdate },
          quoteItem: { update: itemUpdate, findMany: itemFindMany },
        }),
      },
    }));
  });

  it('Case 1 (scoped): copies discountPct onto the targeted SUBTOTAL row', async () => {
    quoteFindMany.mockResolvedValueOnce([
      makeQuote({ id: 'q1', discountPct: 5, discountScopeSubtotalId: 'sub-a' }),
    ]);
    itemFindMany.mockResolvedValue([
      makeItem({ id: 'p1', itemType: 'PRODUCT', quoteId: 'q1', sortOrder: 1, unitPrice: 100, quantity: 10 }),
      makeItem({ id: 'sub-a', itemType: 'SUBTOTAL', quoteId: 'q1', sortOrder: 2 }),
    ]);

    const { migratePerSubtotalDiscount } = await import(modulePath);
    const report = await migratePerSubtotalDiscount({ dryRun: false });

    expect(itemUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sub-a' },
      data: expect.objectContaining({ sectionDiscountPct: 5 }),
    }));
    expect(report.cases.case1).toBe(1);
    expect(report.cases.case2).toBe(0);
    expect(report.mismatches).toHaveLength(0);
  });

  it('Case 2 (null scope, legacy whole-quote): fans discount onto every SUBTOTAL', async () => {
    quoteFindMany.mockResolvedValueOnce([
      makeQuote({ id: 'q1', discountPct: 10, discountScopeSubtotalId: null }),
    ]);
    itemFindMany.mockResolvedValue([
      makeItem({ id: 'p1', itemType: 'PRODUCT', quoteId: 'q1', sortOrder: 1, unitPrice: 100, quantity: 10 }),
      makeItem({ id: 'sub-a', itemType: 'SUBTOTAL', quoteId: 'q1', sortOrder: 2 }),
      makeItem({ id: 'p2', itemType: 'PRODUCT', quoteId: 'q1', sortOrder: 3, unitPrice: 50, quantity: 10 }),
      makeItem({ id: 'sub-b', itemType: 'SUBTOTAL', quoteId: 'q1', sortOrder: 4 }),
    ]);

    const { migratePerSubtotalDiscount } = await import(modulePath);
    const report = await migratePerSubtotalDiscount({ dryRun: false });

    expect(itemUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sub-a' },
      data: expect.objectContaining({ sectionDiscountPct: 10 }),
    }));
    expect(itemUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sub-b' },
      data: expect.objectContaining({ sectionDiscountPct: 10 }),
    }));
    expect(report.cases.case2).toBe(1);
  });

  it('Case 3 (discountPct = 0): skips the quote entirely', async () => {
    quoteFindMany.mockResolvedValueOnce([]);

    const { migratePerSubtotalDiscount } = await import(modulePath);
    const report = await migratePerSubtotalDiscount({ dryRun: false });

    expect(itemUpdate).not.toHaveBeenCalled();
    expect(report.cases.case1 + report.cases.case2).toBe(0);
  });

  it('idempotency: a SUBTOTAL already carrying sectionDiscountPct causes the quote to skip', async () => {
    quoteFindMany.mockResolvedValueOnce([
      makeQuote({ id: 'q1', discountPct: 5, discountScopeSubtotalId: 'sub-a' }),
    ]);
    itemFindMany.mockResolvedValue([
      makeItem({ id: 'sub-a', itemType: 'SUBTOTAL', quoteId: 'q1', sortOrder: 1, sectionDiscountPct: 5 }),
    ]);

    const { migratePerSubtotalDiscount } = await import(modulePath);
    const report = await migratePerSubtotalDiscount({ dryRun: false });

    expect(itemUpdate).not.toHaveBeenCalled();
    expect(report.cases.alreadyMigrated).toBe(1);
  });

  it('logs a mismatch when old grand total differs from recomputed grand total by more than ±0.02', async () => {
    quoteFindMany.mockResolvedValueOnce([
      makeQuote({ id: 'q1', discountPct: 10, discountScopeSubtotalId: 'sub-a', grandTotal: 9999 }),
    ]);
    itemFindMany.mockResolvedValue([
      makeItem({ id: 'p1', itemType: 'PRODUCT', quoteId: 'q1', sortOrder: 1, unitPrice: 100, quantity: 10 }),
      makeItem({ id: 'sub-a', itemType: 'SUBTOTAL', quoteId: 'q1', sortOrder: 2 }),
    ]);

    const { migratePerSubtotalDiscount } = await import(modulePath);
    const report = await migratePerSubtotalDiscount({ dryRun: false });

    expect(report.mismatches).toHaveLength(1);
    expect(report.mismatches[0]).toMatchObject({ quoteId: 'q1' });
  });
});
