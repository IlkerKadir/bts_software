import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  db: {
    quote: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

describe('GET /api/quotes/[id]/revisions', () => {
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

  const mockQuote = {
    id: 'quote1',
    quoteNumber: 'BTS-2024-001',
    version: 2,
    parentQuoteId: 'parentQuote1',
  };

  const mockRevisions = [
    {
      id: 'quote1',
      quoteNumber: 'BTS-2024-001',
      version: 2,
      createdAt: new Date('2024-01-15'),
      createdBy: { id: 'user1', fullName: 'Test User' },
      grandTotal: 10000,
      currency: 'EUR',
      status: 'TASLAK',
      parentQuoteId: 'parentQuote1',
    },
    {
      id: 'parentQuote1',
      quoteNumber: 'BTS-2024-001',
      version: 1,
      createdAt: new Date('2024-01-10'),
      createdBy: { id: 'user1', fullName: 'Test User' },
      grandTotal: 9000,
      currency: 'EUR',
      status: 'GONDERILDI',
      parentQuoteId: null,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(mockUser as never);
  });

  it('returns 401 if not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/quotes/quote1/revisions');
    const response = await GET(request, { params: Promise.resolve({ id: 'quote1' }) });

    expect(response.status).toBe(401);
  });

  it('returns 404 if quote not found', async () => {
    vi.mocked(db.quote.findUnique).mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/quotes/quote1/revisions');
    const response = await GET(request, { params: Promise.resolve({ id: 'quote1' }) });

    expect(response.status).toBe(404);
  });

  it('returns all revisions for a quote with parent', async () => {
    vi.mocked(db.quote.findUnique)
      .mockResolvedValueOnce(mockQuote as never)
      .mockResolvedValueOnce({ id: 'parentQuote1', parentQuoteId: null } as never);
    vi.mocked(db.quote.findMany).mockResolvedValue(mockRevisions as never);

    const request = new NextRequest('http://localhost/api/quotes/quote1/revisions');
    const response = await GET(request, { params: Promise.resolve({ id: 'quote1' }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.revisions).toHaveLength(2);
    expect(data.currentVersion).toBe(2);
  });

  it('returns single revision for quote without parent', async () => {
    const singleQuote = { ...mockQuote, parentQuoteId: null, version: 1 };
    vi.mocked(db.quote.findUnique).mockResolvedValue(singleQuote as never);
    vi.mocked(db.quote.findMany).mockResolvedValue([mockRevisions[0]] as never);

    const request = new NextRequest('http://localhost/api/quotes/quote1/revisions');
    const response = await GET(request, { params: Promise.resolve({ id: 'quote1' }) });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.revisions.length).toBeGreaterThanOrEqual(1);
  });
});
