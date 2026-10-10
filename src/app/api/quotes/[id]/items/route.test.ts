import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PUT } from './route';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

const tx = {
  quoteItem: { deleteMany: vi.fn(), update: vi.fn() },
};

vi.mock('@/lib/db', () => ({
  db: {
    quote: { findUnique: vi.fn() },
    quoteItem: { findMany: vi.fn() },
    quoteHistory: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/quote-calculations', async (orig) => ({
  ...(await orig<typeof import('@/lib/quote-calculations')>()),
  recalculateAndPersistQuoteTotals: vi.fn(),
}));

const user = { id: 'u1', roleId: 'r1', role: { canApprove: false, canManageUsers: false, canViewCosts: true } };
const quote = { id: 'q1', createdById: 'u1', status: 'TASLAK', currency: 'EUR', project: null };
const row = (id: string) => ({
  id, itemType: 'PRODUCT', description: `Ürün ${id}`, quantity: 1, unit: 'Adet',
  listPrice: 10, katsayi: 1, discountPct: 0, vatRate: 20, sortOrder: 1,
});
const put = (body: unknown) =>
  PUT(
    new NextRequest('http://localhost/api/quotes/q1/items', { method: 'PUT', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: 'q1' }) },
  );

describe('PUT /api/quotes/[id]/items — deferred deletes + missing rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(user as never);
    vi.mocked(db.quote.findUnique).mockResolvedValue(quote as never);
    vi.mocked(db.$transaction).mockImplementation((async (fn: (t: typeof tx) => unknown) => fn(tx)) as never);
    tx.quoteItem.update.mockResolvedValue({});
    tx.quoteItem.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('returns 409 naming the row when an id is not in this quote (instead of a 500)', async () => {
    vi.mocked(db.quoteItem.findMany).mockResolvedValueOnce([{ id: 'a' }] as never);
    const res = await put({ items: [row('a'), row('gone')] });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain('"Ürün gone" satırı sunucuda bulunamadı');
    expect(data.missingIds).toEqual(['gone']);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('deletes deferred ids scoped to the quote before updating', async () => {
    vi.mocked(db.quoteItem.findMany)
      .mockResolvedValueOnce([{ id: 'a' }] as never) // existence pre-check
      .mockResolvedValue([] as never); // response reload
    const res = await put({ items: [row('a')], deletedIds: ['x', 'y'] });
    expect(res.status).toBe(200);
    expect(tx.quoteItem.deleteMany).toHaveBeenCalledWith({ where: { quoteId: 'q1', id: { in: ['x', 'y'] } } });
    expect(tx.quoteItem.update).toHaveBeenCalledTimes(1);
  });

  it('never deletes a row that is also being updated, and skips children of deleted rows', async () => {
    vi.mocked(db.quoteItem.findMany)
      .mockResolvedValueOnce([{ id: 'a' }, { id: 'child' }] as never)
      .mockResolvedValue([] as never);
    const res = await put({
      items: [row('a'), { ...row('child'), parentItemId: 'p' }],
      deletedIds: ['a', 'p'],
    });
    expect(res.status).toBe(200);
    expect(tx.quoteItem.deleteMany).toHaveBeenCalledWith({ where: { quoteId: 'q1', id: { in: ['p'] } } });
    // only 'a' is updated; 'child' (parent p deleted → cascaded) is skipped
    expect(tx.quoteItem.update).toHaveBeenCalledTimes(1);
  });

  it('accepts a delete-only save (no rows left to update)', async () => {
    vi.mocked(db.quoteItem.findMany).mockResolvedValue([] as never);
    const res = await put({ items: [], deletedIds: ['x'] });
    expect(res.status).toBe(200);
    expect(tx.quoteItem.deleteMany).toHaveBeenCalledWith({ where: { quoteId: 'q1', id: { in: ['x'] } } });
  });

  it('maps a row deleted between pre-check and transaction (P2025) to 409, not 500', async () => {
    vi.mocked(db.quoteItem.findMany).mockResolvedValueOnce([{ id: 'a' }] as never);
    tx.quoteItem.update.mockRejectedValueOnce(Object.assign(new Error('not found'), { code: 'P2025' }));
    const res = await put({ items: [row('a')] });
    expect(res.status).toBe(409);
  });

  it('rejects an empty save', async () => {
    const res = await put({ items: [] });
    expect(res.status).toBe(400);
  });
});
