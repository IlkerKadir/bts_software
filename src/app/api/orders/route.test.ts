import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/db', () => ({
  db: {
    quote: {
      findUnique: vi.fn(),
    },
    orderConfirmation: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
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

const mockQuote = {
  id: 'quote1',
  companyId: 'company1',
  quoteNumber: 'BTS-2026-0001',
  refNo: null,
  currency: 'EUR',
  discountTotal: 0,
  grandTotal: 1000,
  status: 'KAZANILDI',
  company: { name: 'Test Co', address: null, phone: null, taxNumber: null },
  project: null,
  items: [],
  commercialTerms: [],
};

const mockOrder = {
  id: 'order1',
  orderNumber: 'STF-6000',
  quoteId: 'quote1',
  companyId: 'company1',
  status: 'HAZIRLANIYOR',
  company: { id: 'company1', name: 'Test Co' },
  createdBy: { id: 'user1', fullName: 'Test User' },
};

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('POST /api/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(mockUser as never);
    vi.mocked(db.quote.findUnique).mockResolvedValue(mockQuote as never);
    // By default, no existing active order for the quote (dedup check passes)
    vi.mocked(db.orderConfirmation.findFirst).mockResolvedValue(null as never);
  });

  it('returns 401 if not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await POST(makeRequest({ quoteId: 'quote1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 if quoteId is missing', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 404 if quote does not exist', async () => {
    vi.mocked(db.quote.findUnique).mockResolvedValue(null);

    const res = await POST(makeRequest({ quoteId: 'nonexistent' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 if quote is not KAZANILDI', async () => {
    vi.mocked(db.quote.findUnique).mockResolvedValue({
      ...mockQuote,
      status: 'TASLAK',
    } as never);

    const res = await POST(makeRequest({ quoteId: 'quote1' }));
    expect(res.status).toBe(400);
  });

  it('creates order inside a Serializable transaction', async () => {
    // Mock $transaction to execute the callback and verify isolation level
    vi.mocked(db.$transaction).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>, opts?: { isolationLevel?: string }) => {
        // Verify Serializable isolation is requested
        expect(opts?.isolationLevel).toBe(
          Prisma.TransactionIsolationLevel.Serializable
        );

        // Provide a mock transaction client
        const tx = {
          orderConfirmation: {
            findFirst: vi.fn().mockResolvedValue(null),
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockResolvedValue(mockOrder),
          },
        };
        return fn(tx);
      }
    );

    const res = await POST(makeRequest({ quoteId: 'quote1' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.order.orderNumber).toBe('STF-6000');
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('retries on unique constraint violation (P2002) and succeeds', async () => {
    let callCount = 0;

    vi.mocked(db.$transaction).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        callCount++;
        if (callCount === 1) {
          // First attempt: simulate unique constraint collision
          const error = new Prisma.PrismaClientKnownRequestError(
            'Unique constraint failed on the fields: (`orderNumber`)',
            { code: 'P2002', clientVersion: '5.0.0', meta: { target: ['orderNumber'] } }
          );
          throw error;
        }
        // Second attempt: succeed
        const tx = {
          orderConfirmation: {
            findFirst: vi.fn().mockResolvedValue(null),  // dedup check
            findMany: vi.fn().mockResolvedValue([{ orderNumber: 'STF-6000' }]),  // number generation
            create: vi.fn().mockResolvedValue({
              ...mockOrder,
              orderNumber: 'STF-6001',
            }),
          },
        };
        return fn(tx);
      }
    );

    const res = await POST(makeRequest({ quoteId: 'quote1' }));
    expect(res.status).toBe(201);
    // Should have retried once
    expect(callCount).toBe(2);
  });

  it('returns 500 after exhausting all retries on persistent P2002', async () => {
    vi.mocked(db.$transaction).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.0.0', meta: { target: ['orderNumber'] } }
      )
    );

    const res = await POST(makeRequest({ quoteId: 'quote1' }));
    expect(res.status).toBe(500);
    // Should have attempted 3 times (MAX_ORDER_RETRIES)
    expect(db.$transaction).toHaveBeenCalledTimes(3);
  });

  it('does not retry on non-P2002 errors', async () => {
    vi.mocked(db.$transaction).mockRejectedValue(
      new Error('Some other database error')
    );

    const res = await POST(makeRequest({ quoteId: 'quote1' }));
    expect(res.status).toBe(500);
    // Should only try once — non-unique errors are not retried
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns 409 with the existing orderId if an active order already exists for this quoteId', async () => {
    // Dedup check runs INSIDE the transaction now
    vi.mocked(db.$transaction).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          orderConfirmation: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'existing-order-1',
              status: 'HAZIRLANIYOR',
            }),
            create: vi.fn(),
          },
        };
        return fn(tx);
      }
    );

    const res = await POST(makeRequest({ quoteId: 'quote1' }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.orderId).toBe('existing-order-1');
    expect(data.error).toContain('zaten');
  });

  it('allows order creation if existing order for quote is IPTAL', async () => {
    // Existing order is cancelled — should not block
    vi.mocked(db.orderConfirmation.findFirst).mockResolvedValue(null as never);

    vi.mocked(db.$transaction).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          orderConfirmation: {
            findFirst: vi.fn().mockResolvedValue(null),
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockResolvedValue(mockOrder),
          },
        };
        return fn(tx);
      }
    );

    const res = await POST(makeRequest({ quoteId: 'quote1' }));
    expect(res.status).toBe(201);
  });

  it('maps a non-empty items array into the order snapshot', async () => {
    const quoteWithItems = {
      ...mockQuote,
      items: [
        {
          itemType: 'PRODUCT',
          sortOrder: 1,
          code: 'X1',
          brand: null,
          model: null,
          description: 'Test Ürün',
          quantity: 2,
          unit: 'Adet',
          unitPrice: 100,
          totalPrice: 200,
          priceLabel: null,
          parentItemId: null,
          discountPct: 0,
        },
      ],
    };
    vi.mocked(db.quote.findUnique).mockResolvedValue(quoteWithItems as never);

    let capturedCreateArgs: { data: { items: { create: unknown[] } } } | undefined;
    vi.mocked(db.$transaction).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          orderConfirmation: {
            findFirst: vi.fn().mockResolvedValue(null),
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockImplementation(async (args: typeof capturedCreateArgs) => {
              capturedCreateArgs = args;
              return mockOrder;
            }),
          },
        };
        return fn(tx);
      }
    );

    const res = await POST(makeRequest({ quoteId: 'quote1' }));
    expect(res.status).toBe(201);

    const created = capturedCreateArgs!.data.items.create as Array<{
      pozNo: string | null;
      description: string;
      code: string | null;
      itemType: string;
    }>;
    expect(created).toHaveLength(1);
    expect(created[0].pozNo).toBe('1');
    expect(created[0].description).toBe('Test Ürün');
    expect(created[0].code).toBe('X1');
    expect(created[0].itemType).toBe('PRODUCT');
  });

  it('generates sequential order number within the transaction', async () => {
    vi.mocked(db.$transaction).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          orderConfirmation: {
            findFirst: vi.fn().mockResolvedValue(null),  // dedup check — no existing order
            findMany: vi.fn().mockResolvedValue([{ orderNumber: 'STF-6005' }]),  // number generation
            create: vi.fn().mockImplementation(async (args: { data: { orderNumber: string } }) => {
              // Verify the generated order number is sequential
              expect(args.data.orderNumber).toBe('STF-6006');
              return { ...mockOrder, orderNumber: 'STF-6006' };
            }),
          },
        };
        return fn(tx);
      }
    );

    const res = await POST(makeRequest({ quoteId: 'quote1' }));
    expect(res.status).toBe(201);
  });
});
