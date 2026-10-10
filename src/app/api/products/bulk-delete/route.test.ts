import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

vi.mock('@/lib/db', () => ({
  db: {
    product: { findMany: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock('@/lib/session', () => ({ getSession: vi.fn() }));

const user = (role: Partial<{ canDeleteProducts: boolean; canEditProducts: boolean }>) => ({
  id: 'u1',
  role: { canDeleteProducts: false, canEditProducts: false, ...role },
});
const req = (body: unknown) =>
  new NextRequest('http://localhost/api/products/bulk-delete', {
    method: 'POST',
    body: JSON.stringify(body),
  });

describe('POST /api/products/bulk-delete', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes unused products and reports used ones as blocked', async () => {
    vi.mocked(getSession).mockResolvedValue(user({ canDeleteProducts: true }) as never);
    vi.mocked(db.product.findMany).mockResolvedValue([
      { id: 'p1', code: 'A', name: 'Unused', _count: { quoteItems: 0, priceHistory: 0 } },
      { id: 'p2', code: 'B', name: 'In quote', _count: { quoteItems: 3, priceHistory: 0 } },
      { id: 'p3', code: 'C', name: 'History only', _count: { quoteItems: 0, priceHistory: 2 } },
    ] as never);
    vi.mocked(db.product.deleteMany).mockResolvedValue({ count: 1 } as never);

    const res = await POST(req({ productIds: ['p1', 'p2', 'p3'], action: 'delete' }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.deleted).toBe(1);
    expect(data.blocked.map((b: { id: string }) => b.id)).toEqual(['p2', 'p3']);
    // The delete re-checks usage atomically
    expect(vi.mocked(db.product.deleteMany).mock.calls[0][0]).toEqual({
      where: { id: { in: ['p1'] }, quoteItems: { none: {} }, priceHistory: { none: {} } },
    });
  });

  it('requires canDeleteProducts to delete', async () => {
    vi.mocked(getSession).mockResolvedValue(user({ canEditProducts: true }) as never);
    const res = await POST(req({ productIds: ['p1'], action: 'delete' }));
    expect(res.status).toBe(403);
    expect(db.product.deleteMany).not.toHaveBeenCalled();
  });

  it('deactivates with either edit or delete permission', async () => {
    vi.mocked(getSession).mockResolvedValue(user({ canDeleteProducts: true }) as never);
    vi.mocked(db.product.updateMany).mockResolvedValue({ count: 2 } as never);
    const res = await POST(req({ productIds: ['p2', 'p3'], action: 'deactivate' }));
    expect(await res.json()).toEqual({ deactivated: 2 });
    expect(vi.mocked(db.product.updateMany).mock.calls[0][0]).toEqual({
      where: { id: { in: ['p2', 'p3'] } },
      data: { isActive: false },
    });
  });

  it('rejects an empty selection', async () => {
    vi.mocked(getSession).mockResolvedValue(user({ canDeleteProducts: true }) as never);
    const res = await POST(req({ productIds: [], action: 'delete' }));
    expect(res.status).toBe(400);
  });
});
