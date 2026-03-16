import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from './route';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  db: {
    orderConfirmation: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
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

const mockOrder = {
  id: 'order1',
  orderNumber: 'SIP-2026-0001',
  quoteId: 'quote1',
  companyId: 'company1',
  status: 'HAZIRLANIYOR',
  quote: {
    id: 'quote1',
    quoteNumber: 'BTS-2026-0001',
    subject: 'Test',
    currency: 'EUR',
    grandTotal: 1000,
  },
  company: { id: 'company1', name: 'Test Co' },
  createdBy: { id: 'user1', fullName: 'Test User' },
};

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/orders/order1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

function makeParams(id = 'order1') {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/orders/[id] - status validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(mockUser as never);
    vi.mocked(db.orderConfirmation.findUnique).mockResolvedValue(mockOrder as never);
  });

  it('returns 400 for invalid status value', async () => {
    const res = await PATCH(makeRequest({ status: 'INVALID_STATUS' }), makeParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Geçersiz sipariş durumu.');
  });

  it('returns 400 for invalid state transition (HAZIRLANIYOR -> TAMAMLANDI)', async () => {
    const res = await PATCH(makeRequest({ status: 'TAMAMLANDI' }), makeParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Bu durum geçişi yapılamaz');
  });

  it('returns 400 for transition from terminal state (IPTAL -> anything)', async () => {
    vi.mocked(db.orderConfirmation.findUnique).mockResolvedValue({
      ...mockOrder,
      status: 'IPTAL',
    } as never);

    const res = await PATCH(makeRequest({ status: 'HAZIRLANIYOR' }), makeParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Bu durum geçişi yapılamaz');
  });

  it('returns 400 for transition from terminal state (TAMAMLANDI -> anything)', async () => {
    vi.mocked(db.orderConfirmation.findUnique).mockResolvedValue({
      ...mockOrder,
      status: 'TAMAMLANDI',
    } as never);

    const res = await PATCH(makeRequest({ status: 'ONAYLANDI' }), makeParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Bu durum geçişi yapılamaz');
  });

  it('allows valid transition HAZIRLANIYOR -> ONAYLANDI', async () => {
    vi.mocked(db.orderConfirmation.update).mockResolvedValue({
      ...mockOrder,
      status: 'ONAYLANDI',
    } as never);

    const res = await PATCH(makeRequest({ status: 'ONAYLANDI' }), makeParams());
    expect(res.status).toBe(200);
  });

  it('allows valid transition HAZIRLANIYOR -> IPTAL', async () => {
    vi.mocked(db.orderConfirmation.update).mockResolvedValue({
      ...mockOrder,
      status: 'IPTAL',
    } as never);

    const res = await PATCH(makeRequest({ status: 'IPTAL' }), makeParams());
    expect(res.status).toBe(200);
  });

  it('allows valid transition ONAYLANDI -> GONDERILDI', async () => {
    vi.mocked(db.orderConfirmation.findUnique).mockResolvedValue({
      ...mockOrder,
      status: 'ONAYLANDI',
    } as never);
    vi.mocked(db.orderConfirmation.update).mockResolvedValue({
      ...mockOrder,
      status: 'GONDERILDI',
    } as never);

    const res = await PATCH(makeRequest({ status: 'GONDERILDI' }), makeParams());
    expect(res.status).toBe(200);
  });

  it('allows valid transition GONDERILDI -> TAMAMLANDI', async () => {
    vi.mocked(db.orderConfirmation.findUnique).mockResolvedValue({
      ...mockOrder,
      status: 'GONDERILDI',
    } as never);
    vi.mocked(db.orderConfirmation.update).mockResolvedValue({
      ...mockOrder,
      status: 'TAMAMLANDI',
    } as never);

    const res = await PATCH(makeRequest({ status: 'TAMAMLANDI' }), makeParams());
    expect(res.status).toBe(200);
  });

  it('allows notes-only update without status', async () => {
    vi.mocked(db.orderConfirmation.update).mockResolvedValue({
      ...mockOrder,
      notes: 'Updated notes',
    } as never);

    const res = await PATCH(makeRequest({ notes: 'Updated notes' }), makeParams());
    expect(res.status).toBe(200);
  });
});
