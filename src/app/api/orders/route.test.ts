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
  status: 'KAZANILDI',
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
            create: vi.fn().mockResolvedValue(mockOrder),
          },
        };
        return fn(tx);
      }
    );

    const res = await POST(makeRequest({ quoteId: 'quote1' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.order.orderNumber).toBe('SIP-2026-0001');
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
            findFirst: vi.fn().mockResolvedValue({
              orderNumber: 'SIP-2026-0001',
            }),
            create: vi.fn().mockResolvedValue({
              ...mockOrder,
              orderNumber: 'SIP-2026-0002',
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

  it('generates sequential order number within the transaction', async () => {
    vi.mocked(db.$transaction).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          orderConfirmation: {
            findFirst: vi.fn().mockResolvedValue({
              orderNumber: 'SIP-2026-0005',
            }),
            create: vi.fn().mockImplementation(async (args: { data: { orderNumber: string } }) => {
              // Verify the generated order number is sequential
              expect(args.data.orderNumber).toBe('SIP-2026-0006');
              return { ...mockOrder, orderNumber: 'SIP-2026-0006' };
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
