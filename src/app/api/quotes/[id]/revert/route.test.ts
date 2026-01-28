import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  db: {
    quote: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    quoteItem: {
      createMany: vi.fn(),
    },
    quoteCommercialTerm: {
      createMany: vi.fn(),
    },
    quoteHistory: {
      create: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(db)),
  },
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/quote-number', () => ({
  generateQuoteNumber: vi.fn().mockResolvedValue('BTS-2024-002'),
}));

describe('POST /api/quotes/[id]/revert', () => {
  const mockUser = {
    id: 'user1',
    fullName: 'Test User',
    role: {
      id: 'role1',
      name: 'Admin',
      canViewCosts: true,
      canApprove: true,
      canExport: true,
      canManageUsers: false,
      canEditProducts: false,
      canDelete: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  const mockSourceQuote = {
    id: 'sourceQuote',
    quoteNumber: 'BTS-2024-001',
    version: 1,
    companyId: 'company1',
    projectId: 'project1',
    subject: 'Test Quote',
    currency: 'EUR',
    exchangeRate: 1,
    protectionPct: 0,
    discountPct: 0,
    validityDays: 30,
    notes: 'Original notes',
    items: [
      {
        productId: 'prod1',
        itemType: 'PRODUCT',
        sortOrder: 0,
        code: 'PROD-001',
        brand: 'ZETA',
        description: 'Test Product',
        quantity: 10,
        unit: 'Adet',
        listPrice: 100,
        katsayi: 1,
        unitPrice: 100,
        discountPct: 0,
        vatRate: 20,
        totalPrice: 1000,
        notes: null,
      },
    ],
    commercialTerms: [
      {
        category: 'payment',
        value: '30 gün',
        sortOrder: 0,
      },
    ],
  };

  const mockCurrentQuote = {
    id: 'currentQuote',
    quoteNumber: 'BTS-2024-001-R1',
    version: 2,
    parentQuoteId: 'sourceQuote',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(mockUser as never);
  });

  it('returns 401 if not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/quotes/currentQuote/revert', {
      method: 'POST',
      body: JSON.stringify({ sourceQuoteId: 'sourceQuote' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'currentQuote' }) });

    expect(response.status).toBe(401);
  });

  it('returns 400 if sourceQuoteId is not provided', async () => {
    const request = new NextRequest('http://localhost/api/quotes/currentQuote/revert', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'currentQuote' }) });

    expect(response.status).toBe(400);
  });
});
