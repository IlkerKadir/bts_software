import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  db: {
    quote: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    quoteItem: {
      create: vi.fn(),
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
    exchangeRate: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/quote-number', () => ({
  generateQuoteNumber: vi.fn((seq: number) => `BTS-2026-${String(seq).padStart(4, '0')}`),
  getCurrentYearPrefix: vi.fn(() => 'BTS-2026-'),
  getNextSequence: vi.fn(() => 42),
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

const mockSourceQuote = {
  id: 'source1',
  quoteNumber: 'BTS-2026-0001',
  companyId: 'c1',
  projectId: 'p1',
  subject: 'Test',
  currency: 'EUR',
  exchangeRate: 1,
  protectionPct: 0,
  subtotal: 1000,
  discountTotal: 0,
  discountPct: 0,
  vatTotal: 200,
  grandTotal: 1200,
  validityDays: 30,
  notes: null,
  language: 'TR',
  items: [],
  commercialTerms: [],
  ekMaliyetler: [],
};

function makeParams(id = 'source1') {
  return { params: Promise.resolve({ id }) };
}

describe('POST /api/quotes/[id]/clone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(mockUser as never);
    vi.mocked(db.exchangeRate.findFirst).mockResolvedValue(null as never);
  });

  it('wraps quote number generation and creation in a transaction', async () => {
    vi.mocked(db.quote.findUnique).mockResolvedValue(mockSourceQuote as never);

    const createdQuote = {
      ...mockSourceQuote,
      id: 'new1',
      quoteNumber: 'BTS-2026-0042',
      status: 'TASLAK',
      company: { id: 'c1', name: 'Test Co' },
      project: { id: 'p1', name: 'Test Project' },
      createdBy: { id: 'user1', fullName: 'Test User' },
    };

    // The key assertion: $transaction should be called
    vi.mocked(db.$transaction).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        quote: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue(createdQuote),
        },
        quoteItem: {
          create: vi.fn(),
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
      };
      return fn(tx);
    });

    const request = new NextRequest('http://localhost/api/quotes/source1/clone', {
      method: 'POST',
    });
    const res = await POST(request, makeParams());

    expect(res.status).toBe(201);
    // Verify $transaction was used
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns 404 if source quote not found', async () => {
    vi.mocked(db.quote.findUnique).mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/quotes/source1/clone', {
      method: 'POST',
    });
    const res = await POST(request, makeParams());
    expect(res.status).toBe(404);
  });
});
