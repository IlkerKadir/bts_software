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
    commercialTermTemplate: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

// Mock the PDF service so we don't need Puppeteer
vi.mock('@/lib/pdf/pdf-service', () => ({
  getPdfService: vi.fn().mockReturnValue({
    generatePdf: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
  }),
}));

vi.mock('@/lib/pdf/quote-template', () => ({
  generateQuoteHtml: vi.fn().mockReturnValue('<html>fake</html>'),
}));

vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn().mockReturnValue(Buffer.from('fake-image')),
  },
}));

describe('GET /api/quotes/[id]/export/pdf', () => {
  const regularUser = {
    id: 'user1',
    fullName: 'Regular User',
    role: {
      id: 'role1',
      name: 'User',
      canViewCosts: true,
      canApprove: false,
      canExport: false,
      canManageUsers: false,
      canEditProducts: false,
      canDelete: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  const exportUser = {
    id: 'user2',
    fullName: 'Export User',
    role: {
      id: 'role2',
      name: 'Manager',
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

  const mockQuote = {
    id: 'quote1',
    quoteNumber: 'BTS-2024-001',
    createdById: 'user1', // owned by regularUser
    subject: 'Test Quote',
    refNo: 'REF-001',
    currency: 'EUR',
    language: 'TR',
    notes: null,
    subtotal: 1000,
    discountTotal: 0,
    vatTotal: 200,
    grandTotal: 1200,
    createdAt: new Date(),
    validUntil: new Date(),
    company: { name: 'Test Co', address: 'Test Address', taxNumber: '12345' },
    project: null,
    items: [],
    commercialTerms: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 if not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/quotes/quote1/export/pdf');
    const response = await GET(request, { params: Promise.resolve({ id: 'quote1' }) });

    expect(response.status).toBe(401);
  });

  it('returns 404 if quote not found', async () => {
    vi.mocked(getSession).mockResolvedValue(regularUser as never);
    vi.mocked(db.quote.findUnique).mockResolvedValue(null);

    const request = new NextRequest('http://localhost/api/quotes/nonexistent/export/pdf');
    const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });

    expect(response.status).toBe(404);
  });

  it('allows the quote creator to export their own quote', async () => {
    vi.mocked(getSession).mockResolvedValue(regularUser as never);
    vi.mocked(db.quote.findUnique).mockResolvedValue(mockQuote as never);

    const request = new NextRequest('http://localhost/api/quotes/quote1/export/pdf');
    const response = await GET(request, { params: Promise.resolve({ id: 'quote1' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
  });

  it('allows user with canExport to export any quote', async () => {
    vi.mocked(getSession).mockResolvedValue(exportUser as never);
    vi.mocked(db.quote.findUnique).mockResolvedValue(mockQuote as never);

    const request = new NextRequest('http://localhost/api/quotes/quote1/export/pdf');
    const response = await GET(request, { params: Promise.resolve({ id: 'quote1' }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
  });

  it('BLOCKS user without canExport from exporting another users quote', async () => {
    // regularUser (user1) has canExport=false, trying to export a quote created by someone else
    const otherUserQuote = { ...mockQuote, createdById: 'other-user-id' };
    vi.mocked(getSession).mockResolvedValue(regularUser as never);
    vi.mocked(db.quote.findUnique).mockResolvedValue(otherUserQuote as never);

    const request = new NextRequest('http://localhost/api/quotes/quote1/export/pdf');
    const response = await GET(request, { params: Promise.resolve({ id: 'quote1' }) });

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });
});
