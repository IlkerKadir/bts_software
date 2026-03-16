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
      create: vi.fn(),
      createMany: vi.fn(),
    },
    quoteCommercialTerm: {
      createMany: vi.fn(),
    },
    quoteEkMaliyet: {
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

  const mockCurrentQuote = {
    id: 'currentQuote',
    quoteNumber: 'BTS-2024-001-R1',
    version: 2,
    status: 'TASLAK',
    parentQuoteId: 'sourceQuote',
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
    subtotal: 1000,
    discountTotal: 0,
    discountPct: 0,
    vatTotal: 200,
    grandTotal: 1200,
    validityDays: 30,
    notes: 'Original notes',
    items: [
      {
        id: 'item1',
        productId: 'prod1',
        parentItemId: null,
        itemType: 'PRODUCT',
        sortOrder: 0,
        code: 'PROD-001',
        brand: 'ZETA',
        model: null,
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
        isManualPrice: false,
        costPrice: null,
        serviceMeta: null,
      },
    ],
    commercialTerms: [
      {
        category: 'payment',
        value: '30 gün',
        sortOrder: 0,
        highlight: false,
      },
    ],
    ekMaliyetler: [
      {
        id: 'ek1',
        title: 'Nakliye',
        amount: 500,
        sortOrder: 0,
      },
      {
        id: 'ek2',
        title: 'Montaj',
        amount: 1000,
        sortOrder: 1,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(mockUser as never);

    // Default: first findUnique call returns current quote, second returns source quote
    let findUniqueCallCount = 0;
    vi.mocked(db.quote.findUnique).mockImplementation(async (args: any) => {
      findUniqueCallCount++;
      if (findUniqueCallCount === 1) return mockCurrentQuote as never;
      if (findUniqueCallCount === 2) return mockSourceQuote as never;
      // Third call is the final fetch
      return {
        ...mockSourceQuote,
        id: 'newQuote',
        quoteNumber: 'BTS-2024-001-R3',
        company: { id: 'company1', name: 'Test Co' },
        project: { id: 'project1', name: 'Test Project' },
        createdBy: { id: 'user1', fullName: 'Test User' },
        items: [],
        commercialTerms: [],
      } as never;
    });

    // Mock create to return a new quote
    vi.mocked(db.quote.create).mockResolvedValue({
      id: 'newQuote',
      quoteNumber: 'BTS-2024-001-R3',
    } as never);

    // Mock item create to return with IDs
    vi.mocked(db.quoteItem.create).mockImplementation(async () => ({
      id: 'newItem1',
    } as never));

    vi.mocked(db.quoteCommercialTerm.createMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(db.quoteEkMaliyet.createMany).mockResolvedValue({ count: 2 } as never);
    vi.mocked(db.quoteHistory.create).mockResolvedValue({} as never);
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

  it('copies ekMaliyetler from source quote during revert', async () => {
    const request = new NextRequest('http://localhost/api/quotes/currentQuote/revert', {
      method: 'POST',
      body: JSON.stringify({ sourceQuoteId: 'sourceQuote' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'currentQuote' }) });

    expect(response.status).toBe(201);

    // Verify ekMaliyetler were created
    expect(db.quoteEkMaliyet.createMany).toHaveBeenCalledTimes(1);
    expect(db.quoteEkMaliyet.createMany).toHaveBeenCalledWith({
      data: [
        {
          quoteId: 'newQuote',
          title: 'Nakliye',
          amount: 500,
          sortOrder: 0,
        },
        {
          quoteId: 'newQuote',
          title: 'Montaj',
          amount: 1000,
          sortOrder: 1,
        },
      ],
    });
  });

  it('does not call createMany for ekMaliyetler when source has none', async () => {
    // Override findUnique to return source with no ekMaliyetler
    let findUniqueCallCount = 0;
    vi.mocked(db.quote.findUnique).mockImplementation(async () => {
      findUniqueCallCount++;
      if (findUniqueCallCount === 1) return mockCurrentQuote as never;
      if (findUniqueCallCount === 2) return { ...mockSourceQuote, ekMaliyetler: [] } as never;
      return {
        id: 'newQuote',
        quoteNumber: 'BTS-2024-001-R3',
        company: { id: 'company1', name: 'Test Co' },
        project: { id: 'project1', name: 'Test Project' },
        createdBy: { id: 'user1', fullName: 'Test User' },
        items: [],
        commercialTerms: [],
      } as never;
    });

    const request = new NextRequest('http://localhost/api/quotes/currentQuote/revert', {
      method: 'POST',
      body: JSON.stringify({ sourceQuoteId: 'sourceQuote' }),
    });
    const response = await POST(request, { params: Promise.resolve({ id: 'currentQuote' }) });

    expect(response.status).toBe(201);
    expect(db.quoteEkMaliyet.createMany).not.toHaveBeenCalled();
  });
});
