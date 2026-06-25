import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  db: {
    orderConfirmation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/session', () => ({
  getSession: vi.fn(),
}));

const mockUser = { id: 'user1', fullName: 'Test User', role: { canApprove: true, canManageUsers: true } };

const completedStf = {
  id: 'order1',
  orderNumber: 'STF-6000',
  quoteId: 'quote1',
  companyId: 'company1',
  status: 'TAMAMLANDI',
  customerName: 'X A.Ş', customerAddress: null, customerPhone: null, customerTaxInfo: null,
  projectName: null, quoteNo: 'SA0001', refNo: null, formDate: null, siparisNo: null,
  currency: 'EUR', discountTotal: 0, grandTotal: 100,
  manufacturers: null, warranty: null, deliveryPlace: null, deliveryTime: null,
  paymentTerms: null, vatNote: null, notes: null, deliveryDate: null,
  customerApprovalName: null, btsResponsibleName: null,
  items: [
    { sortOrder: 0, itemType: 'PRODUCT', pozNo: '1', code: 'A', brand: null, model: null,
      description: 'P', quantity: 1, unit: 'Adet', unitPrice: 100, totalPrice: 100,
      priceLabel: null, parentItemId: null, discountPct: 0, sectionNote: null,
      sectionDiscountPct: null, sectionDiscountLabel: null },
  ],
};

function req(): NextRequest {
  return new NextRequest('http://localhost/api/orders/order1/revisions', { method: 'POST' });
}
const params = (id = 'order1') => ({ params: Promise.resolve({ id }) });

describe('POST /api/orders/[id]/revisions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(mockUser as never);
  });

  it('401 without a session', async () => {
    vi.mocked(getSession).mockResolvedValue(null as never);
    const res = await POST(req(), params());
    expect(res.status).toBe(401);
  });

  it('404 when the source STF is missing', async () => {
    vi.mocked(db.orderConfirmation.findUnique).mockResolvedValue(null as never);
    const res = await POST(req(), params());
    expect(res.status).toBe(404);
  });

  it('400 when the source STF is not TAMAMLANDI', async () => {
    vi.mocked(db.orderConfirmation.findUnique).mockResolvedValue({ ...completedStf, status: 'TASLAK' } as never);
    const res = await POST(req(), params());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Sadece tamamlanmış STF revize edilebilir');
  });

  it('409 on an existing-number collision', async () => {
    vi.mocked(db.orderConfirmation.findUnique).mockResolvedValue(completedStf as never);
    vi.mocked(db.orderConfirmation.findMany).mockResolvedValue([{ orderNumber: 'STF-6000' }] as never);
    vi.mocked(db.orderConfirmation.findFirst).mockResolvedValue({ id: 'dup' } as never);
    const res = await POST(req(), params());
    expect(res.status).toBe(409);
  });

  it('creates a standalone TASLAK revision with a flat .N number', async () => {
    vi.mocked(db.orderConfirmation.findUnique).mockResolvedValue(completedStf as never);
    vi.mocked(db.orderConfirmation.findMany).mockResolvedValue([
      { orderNumber: 'STF-6000' }, { orderNumber: 'STF-6000.1' },
    ] as never);
    vi.mocked(db.orderConfirmation.findFirst).mockResolvedValue(null as never);
    vi.mocked(db.orderConfirmation.create).mockImplementation(((args: { data: { orderNumber: string } }) =>
      Promise.resolve({ id: 'rev1', ...args.data, items: [] })) as never);

    const res = await POST(req(), params());
    expect(res.status).toBe(201);

    const createArg = vi.mocked(db.orderConfirmation.create).mock.calls[0][0] as {
      data: { orderNumber: string; status: string; parentOrderId?: string };
    };
    expect(createArg.data.orderNumber).toBe('STF-6000.2'); // next flat sibling
    expect(createArg.data.status).toBe('TASLAK');
    expect(createArg.data.parentOrderId).toBeUndefined(); // standalone, no link
  });
});
