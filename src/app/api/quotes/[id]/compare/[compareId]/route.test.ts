import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  db: {
    quote: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

describe('GET /api/quotes/[id]/compare/[compareId]', () => {
  const mockUser = {
    id: 'user1',
    fullName: 'Test User',
    role: {
      id: 'role1',
      name: 'User',
      canViewCosts: true,
      canApprove: false,
      canExport: true,
      canManageUsers: false,
      canEditProducts: false,
      canDelete: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  const mockQuote1 = {
    id: 'quote1',
    quoteNumber: 'BTS-2024-001',
    version: 1,
    status: 'GONDERILDI',
    currency: 'EUR',
    subtotal: 9000,
    discountTotal: 0,
    discountPct: 0,
    vatTotal: 1800,
    grandTotal: 10800,
    protectionPct: 0,
    exchangeRate: 1,
    validityDays: 30,
    notes: null,
    createdAt: new Date('2024-01-10'),
    createdBy: { id: 'user1', fullName: 'Test User' },
    items: [
      {
        id: 'item1',
        code: 'PROD-001',
        brand: 'ZETA',
        description: 'Test Product 1',
        quantity: 10,
        unit: 'Adet',
        unitPrice: 500,
        totalPrice: 5000,
        itemType: 'PRODUCT',
        sortOrder: 0,
      },
    ],
  };

  const mockQuote2 = {
    id: 'quote2',
    quoteNumber: 'BTS-2024-001',
    version: 2,
    status: 'TASLAK',
    currency: 'EUR',
    subtotal: 10000,
    discountTotal: 0,
    discountPct: 0,
    vatTotal: 2000,
    grandTotal: 12000,
    protectionPct: 0,
    exchangeRate: 1,
    validityDays: 30,
    notes: null,
    createdAt: new Date('2024-01-15'),
    createdBy: { id: 'user1', fullName: 'Test User' },
    items: [
      {
        id: 'item2',
        code: 'PROD-001',
        brand: 'ZETA',
        description: 'Test Product 1',
        quantity: 15,
        unit: 'Adet',
        unitPrice: 500,
        totalPrice: 7500,
        itemType: 'PRODUCT',
        sortOrder: 0,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(mockUser as never);
  });

  it('returns 401 if not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/quotes/quote1/compare/quote2');
    const response = await GET(request, {
      params: Promise.resolve({ id: 'quote1', compareId: 'quote2' }),
    });

    expect(response.status).toBe(401);
  });

  it('returns 404 if one quote not found', async () => {
    vi.mocked(db.quote.findUnique)
      .mockResolvedValueOnce(mockQuote1 as never)
      .mockResolvedValueOnce(null);

    const request = new NextRequest('http://localhost/api/quotes/quote1/compare/quote2');
    const response = await GET(request, {
      params: Promise.resolve({ id: 'quote1', compareId: 'quote2' }),
    });

    expect(response.status).toBe(404);
  });

  it('returns comparison data for two quotes', async () => {
    vi.mocked(db.quote.findUnique)
      .mockResolvedValueOnce(mockQuote1 as never)
      .mockResolvedValueOnce(mockQuote2 as never);

    const request = new NextRequest('http://localhost/api/quotes/quote1/compare/quote2');
    const response = await GET(request, {
      params: Promise.resolve({ id: 'quote1', compareId: 'quote2' }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.oldQuote.version).toBe(1);
    expect(data.newQuote.version).toBe(2);
    expect(data.headerChanges).toBeDefined();
    expect(data.itemDiffs).toBeDefined();
    expect(data.summary).toBeDefined();
  });

  it('detects item quantity changes', async () => {
    vi.mocked(db.quote.findUnique)
      .mockResolvedValueOnce(mockQuote1 as never)
      .mockResolvedValueOnce(mockQuote2 as never);

    const request = new NextRequest('http://localhost/api/quotes/quote1/compare/quote2');
    const response = await GET(request, {
      params: Promise.resolve({ id: 'quote1', compareId: 'quote2' }),
    });

    const data = await response.json();

    // Find the modified item
    const modifiedItem = data.itemDiffs.find((d: { type: string }) => d.type === 'modified');
    expect(modifiedItem).toBeDefined();
    expect(modifiedItem.changes.some((c: { field: string }) => c.field === 'Miktar')).toBe(true);
  });
});
