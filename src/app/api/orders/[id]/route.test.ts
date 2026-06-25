import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH, DELETE } from './route';
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
  status: 'TASLAK',
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

  it('returns 400 for invalid state transition (TASLAK -> GONDERILDI)', async () => {
    const res = await PATCH(makeRequest({ status: 'GONDERILDI' }), makeParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Bu durum geçişi yapılamaz');
  });

  it('returns 400 for invalid transition from IPTAL (IPTAL -> TAMAMLANDI)', async () => {
    vi.mocked(db.orderConfirmation.findUnique).mockResolvedValue({
      ...mockOrder,
      status: 'IPTAL',
    } as never);

    const res = await PATCH(makeRequest({ status: 'TAMAMLANDI' }), makeParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Bu durum geçişi yapılamaz');
  });

  it('returns 400 for invalid transition from TAMAMLANDI (TAMAMLANDI -> GONDERILDI)', async () => {
    vi.mocked(db.orderConfirmation.findUnique).mockResolvedValue({
      ...mockOrder,
      status: 'TAMAMLANDI',
    } as never);

    const res = await PATCH(makeRequest({ status: 'GONDERILDI' }), makeParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Bu durum geçişi yapılamaz');
  });

  it('allows valid transition TASLAK -> TAMAMLANDI', async () => {
    vi.mocked(db.orderConfirmation.update).mockResolvedValue({
      ...mockOrder,
      status: 'TAMAMLANDI',
    } as never);

    const res = await PATCH(makeRequest({ status: 'TAMAMLANDI' }), makeParams());
    expect(res.status).toBe(200);
  });

  it('allows valid transition TASLAK -> IPTAL', async () => {
    vi.mocked(db.orderConfirmation.update).mockResolvedValue({
      ...mockOrder,
      status: 'IPTAL',
    } as never);

    const res = await PATCH(makeRequest({ status: 'IPTAL' }), makeParams());
    expect(res.status).toBe(200);
  });

  it('allows valid transition TAMAMLANDI -> TASLAK (Taslağa geri çek)', async () => {
    vi.mocked(db.orderConfirmation.findUnique).mockResolvedValue({
      ...mockOrder,
      status: 'TAMAMLANDI',
    } as never);
    vi.mocked(db.orderConfirmation.update).mockResolvedValue({
      ...mockOrder,
      status: 'TASLAK',
    } as never);

    const res = await PATCH(makeRequest({ status: 'TASLAK' }), makeParams());
    expect(res.status).toBe(200);
  });

  it('allows valid transition IPTAL -> TASLAK (İptali geri al)', async () => {
    vi.mocked(db.orderConfirmation.findUnique).mockResolvedValue({
      ...mockOrder,
      status: 'IPTAL',
    } as never);
    vi.mocked(db.orderConfirmation.update).mockResolvedValue({
      ...mockOrder,
      status: 'TASLAK',
    } as never);

    const res = await PATCH(makeRequest({ status: 'TASLAK' }), makeParams());
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

function makeDeleteRequest(): NextRequest {
  return new NextRequest('http://localhost/api/orders/order1', { method: 'DELETE' });
}

describe('DELETE /api/orders/[id] - delete gate (TASLAK only)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(mockUser as never);
  });

  it('returns 403 when the user lacks canDelete', async () => {
    vi.mocked(getSession).mockResolvedValue({
      ...mockUser,
      role: { ...mockUser.role, canDelete: false },
    } as never);
    const res = await DELETE(makeDeleteRequest(), makeParams());
    expect(res.status).toBe(403);
  });

  it('returns 400 when the STF is not TASLAK', async () => {
    vi.mocked(db.orderConfirmation.findUnique).mockResolvedValue({
      ...mockOrder,
      status: 'TAMAMLANDI',
    } as never);
    const res = await DELETE(makeDeleteRequest(), makeParams());
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Sadece taslak siparişler silinebilir');
  });

  it('deletes a TASLAK STF (200)', async () => {
    vi.mocked(db.orderConfirmation.findUnique).mockResolvedValue({
      ...mockOrder,
      status: 'TASLAK',
    } as never);
    vi.mocked(db.orderConfirmation.delete).mockResolvedValue(mockOrder as never);
    const res = await DELETE(makeDeleteRequest(), makeParams());
    expect(res.status).toBe(200);
  });
});
