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
      findUniqueOrThrow: vi.fn(),
    },
    quoteHistory: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/quote-calculations', () => ({
  recalculateAndPersistQuoteTotals: vi.fn(),
}));

describe('PUT /api/quotes/[id] - input validation', () => {
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
    status: 'TASLAK',
    companyId: 'company1',
    createdById: 'user1',
    currency: 'EUR',
    exchangeRate: 35,
    company: { id: 'company1', name: 'Test Co' },
    project: null,
    createdBy: { id: 'user1', fullName: 'Test User' },
    items: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(mockUser as never);
    vi.mocked(db.quote.findUnique).mockResolvedValue(mockQuote as never);
    vi.mocked(db.quote.update).mockResolvedValue(mockQuote as never);
    vi.mocked(db.quote.findUniqueOrThrow).mockResolvedValue(mockQuote as never);
    vi.mocked(db.quoteHistory.create).mockResolvedValue({} as never);
  });

  function createPutRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/quotes/quote1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // Authorization
  it('rejects non-owner non-admin user', async () => {
    vi.mocked(db.quote.findUnique).mockResolvedValue({ ...mockQuote, createdById: 'other-user' } as never);
    const request = createPutRequest({ subject: 'test' });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(403);
  });

  it('allows admin to edit any quote', async () => {
    vi.mocked(getSession).mockResolvedValue({
      ...mockUser,
      role: { ...mockUser.role, canManageUsers: true },
    } as never);
    vi.mocked(db.quote.findUnique).mockResolvedValue({ ...mockQuote, createdById: 'other-user' } as never);
    const request = createPutRequest({ subject: 'test' });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(200);
  });

  // Exchange rate validation
  it('rejects negative exchangeRate', async () => {
    const request = createPutRequest({ exchangeRate: -5 });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(400);
  });

  it('rejects exchangeRate of 0', async () => {
    const request = createPutRequest({ exchangeRate: 0 });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(400);
  });

  it('rejects exchangeRate over 1000', async () => {
    const request = createPutRequest({ exchangeRate: 1001 });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(400);
  });

  it('accepts valid exchangeRate', async () => {
    const request = createPutRequest({ exchangeRate: 35.5 });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(200);
  });

  it('rejects non-number exchangeRate', async () => {
    const request = createPutRequest({ exchangeRate: 'abc' });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(400);
  });

  // protectionPct validation
  it('rejects protectionPct below 0', async () => {
    const request = createPutRequest({ protectionPct: -1 });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(400);
  });

  it('rejects protectionPct over 100', async () => {
    const request = createPutRequest({ protectionPct: 101 });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(400);
  });

  it('accepts protectionPct at 0', async () => {
    const request = createPutRequest({ protectionPct: 0 });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(200);
  });

  // discountPct validation
  it('rejects discountPct below 0', async () => {
    const request = createPutRequest({ discountPct: -1 });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(400);
  });

  it('rejects discountPct over 100', async () => {
    const request = createPutRequest({ discountPct: 101 });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(400);
  });

  // validityDays validation
  it('rejects validityDays of 0', async () => {
    const request = createPutRequest({ validityDays: 0 });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(400);
  });

  it('rejects validityDays over 365', async () => {
    const request = createPutRequest({ validityDays: 366 });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(400);
  });

  // Currency validation
  it('rejects invalid currency', async () => {
    const request = createPutRequest({ currency: 'INVALID' });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(400);
  });

  it('accepts valid currency EUR', async () => {
    const request = createPutRequest({ currency: 'EUR' });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(200);
  });

  // Language validation
  it('rejects invalid language', async () => {
    const request = createPutRequest({ language: 'FR' });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(400);
  });

  it('accepts valid language TR', async () => {
    const request = createPutRequest({ language: 'TR' });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(200);
  });

  // Unknown fields should be stripped
  it('strips unknown fields from body', async () => {
    const request = createPutRequest({
      subject: 'Test',
      maliciousField: 'evil',
      __proto__: 'hack',
    });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(200);

    // Verify db.quote.update was called without the unknown fields
    const updateCall = vi.mocked(db.quote.update).mock.calls[0];
    expect(updateCall).toBeDefined();
    const updateData = updateCall[0].data;
    expect(updateData).not.toHaveProperty('maliciousField');
    expect(updateData).not.toHaveProperty('__proto__');
  });

  // Valid full update
  it('accepts valid full update', async () => {
    const request = createPutRequest({
      companyId: 'company-2',
      subject: 'Updated subject',
      currency: 'USD',
      exchangeRate: 32.5,
      protectionPct: 10,
      discountPct: 5,
      validityDays: 60,
      notes: 'Updated notes',
      language: 'EN',
    });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(200);
  });

  // Empty body should work (no updates)
  it('accepts empty body', async () => {
    const request = createPutRequest({});
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(200);
  });

  // Return 400 with error details for validation failure
  it('returns error details on validation failure', async () => {
    const request = createPutRequest({ exchangeRate: -5, discountPct: 200 });
    const response = await PUT(request, { params: Promise.resolve({ id: 'quote1' }) });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
    expect(data.details).toBeDefined();
  });
});
