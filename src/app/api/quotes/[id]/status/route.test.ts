import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PUT } from './route';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  db: {
    quote: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    quoteItem: {
      findMany: vi.fn(),
    },
    quoteHistory: {
      create: vi.fn(),
    },
    priceHistory: {
      create: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/services/notification-service', () => ({
  createNotification: vi.fn().mockResolvedValue({}),
}));

const mockUser = {
  id: 'user1',
  fullName: 'Test User',
  role: {
    id: 'role1',
    name: 'Admin',
    canViewCosts: true,
    canApprove: true,
    canExport: true,
    canManageUsers: true,
    canEditProducts: true,
    canDelete: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
};

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/quotes/quote1/status', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

function makeParams(id = 'quote1') {
  return { params: Promise.resolve({ id }) };
}

describe('PUT /api/quotes/[id]/status - empty quote validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(mockUser as never);
    vi.mocked(db.quoteHistory.create).mockResolvedValue({} as never);
    vi.mocked(db.user.findMany).mockResolvedValue([] as never);
  });

  it('returns 400 when transitioning to ONAY_BEKLIYOR with 0 priced items', async () => {
    vi.mocked(db.quote.findUnique).mockResolvedValue({
      id: 'quote1',
      status: 'TASLAK',
      validityDays: 30,
      createdById: 'user1',
    } as never);

    // The validation query filters for PRODUCT/CUSTOM/SET — should return empty
    // (only a HEADER exists, which doesn't match the filter)
    vi.mocked(db.quoteItem.findMany).mockResolvedValue([] as never);

    const res = await PUT(makeRequest({ status: 'ONAY_BEKLIYOR' }), makeParams());
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe('Onaya göndermek için en az bir kalem gereklidir.');
  });

  it('returns 400 when transitioning to ONAY_BEKLIYOR with 0 items at all', async () => {
    vi.mocked(db.quote.findUnique).mockResolvedValue({
      id: 'quote1',
      status: 'TASLAK',
      validityDays: 30,
      createdById: 'user1',
    } as never);

    vi.mocked(db.quoteItem.findMany).mockResolvedValue([] as never);

    const res = await PUT(makeRequest({ status: 'ONAY_BEKLIYOR' }), makeParams());
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toBe('Onaya göndermek için en az bir kalem gereklidir.');
  });

  it('allows transition to ONAY_BEKLIYOR when priced items exist', async () => {
    vi.mocked(db.quote.findUnique).mockResolvedValue({
      id: 'quote1',
      status: 'TASLAK',
      validityDays: 30,
      createdById: 'user1',
    } as never);

    // First call: validation (returns priced items)
    // Second call: notification katsayi check (returns items with product info)
    vi.mocked(db.quoteItem.findMany)
      .mockResolvedValueOnce([
        { id: 'item1', itemType: 'PRODUCT', quoteId: 'quote1' },
      ] as never)
      .mockResolvedValueOnce([
        { id: 'item1', itemType: 'PRODUCT', quoteId: 'quote1', katsayi: 1, product: null },
      ] as never);

    vi.mocked(db.quote.update).mockResolvedValue({
      id: 'quote1',
      status: 'ONAY_BEKLIYOR',
      quoteNumber: 'BTS-2026-0001',
      company: { id: 'c1', name: 'Test' },
      project: null,
      createdBy: { id: 'user1', fullName: 'Test User' },
      approvedBy: null,
    } as never);

    const res = await PUT(makeRequest({ status: 'ONAY_BEKLIYOR' }), makeParams());
    expect(res.status).toBe(200);
  });
});
