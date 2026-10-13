import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from './route';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { recalculateAndPersistQuoteTotals } from '@/lib/quote-calculations';

vi.mock('@/lib/db', () => ({
  db: {
    quote: { findUnique: vi.fn() },
    quoteItem: { updateMany: vi.fn() },
    quoteHistory: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('@/lib/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/quote-calculations', () => ({ recalculateAndPersistQuoteTotals: vi.fn() }));

const user = { id: 'u1', roleId: 'r1', role: { canApprove: false, canManageUsers: false } };
const quote = { id: 'q1', createdById: 'u1', status: 'TASLAK', project: null };
const patch = (body: unknown) =>
  PATCH(
    new NextRequest('http://localhost/api/quotes/q1/items/order', { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: 'q1' }) },
  );

describe('PATCH /api/quotes/[id]/items/order — sortOrder only', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(user as never);
    vi.mocked(db.quote.findUnique).mockResolvedValue(quote as never);
    vi.mocked(db.quoteItem.updateMany).mockImplementation(((args: unknown) => args) as never);
    vi.mocked(db.$transaction).mockImplementation((async (ops: unknown[]) => ops.map(() => ({ count: 1 }))) as never);
  });

  it('updates only sortOrder, scoped to this quote, and recalculates totals', async () => {
    const res = await patch({ order: [{ id: 'a', sortOrder: 1 }, { id: 'b', sortOrder: 2 }] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ updated: 2 });
    expect(db.quoteItem.updateMany).toHaveBeenCalledTimes(2);
    expect(db.quoteItem.updateMany).toHaveBeenCalledWith({ where: { id: 'a', quoteId: 'q1' }, data: { sortOrder: 1 } });
    expect(db.quoteItem.updateMany).toHaveBeenCalledWith({ where: { id: 'b', quoteId: 'q1' }, data: { sortOrder: 2 } });
    expect(recalculateAndPersistQuoteTotals).toHaveBeenCalledWith('q1');
    // No history entry for a pure reorder.
    expect(db.quoteHistory.create).not.toHaveBeenCalled();
  });

  it('rejects malformed input with 400', async () => {
    expect((await patch({ order: [{ id: 'a', sortOrder: 1.5 }] })).status).toBe(400);
    expect((await patch({ order: [] })).status).toBe(400);
    expect((await patch({ order: [{ id: 'a', sortOrder: 3_000_000_000 }] })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('401 without a session, 404 for a missing quote', async () => {
    vi.mocked(getSession).mockResolvedValueOnce(null as never);
    expect((await patch({ order: [{ id: 'a', sortOrder: 1 }] })).status).toBe(401);
    vi.mocked(db.quote.findUnique).mockResolvedValueOnce(null as never);
    expect((await patch({ order: [{ id: 'a', sortOrder: 1 }] })).status).toBe(404);
  });

  it('applies the same edit rule as the bulk save (pending approval → approvers only)', async () => {
    vi.mocked(db.quote.findUnique).mockResolvedValueOnce({ ...quote, status: 'ONAY_BEKLIYOR' } as never);
    const res = await patch({ order: [{ id: 'a', sortOrder: 1 }] });
    expect(res.status).toBe(403);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
