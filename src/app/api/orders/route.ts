import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { Prisma, OrderStatus, QuoteItemType } from '@prisma/client';
import { expandTurkishVariants } from '@/lib/search-helpers';
import { nextStfNumber } from '@/lib/stf/stf-number';
import { buildStfSnapshot } from '@/lib/stf/stf-snapshot';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || undefined;
    const status = searchParams.get('status') || undefined;
    const companyId = searchParams.get('companyId') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const where: Prisma.OrderConfirmationWhereInput = {};

    const searchVariants = expandTurkishVariants(search ?? '');
    if (searchVariants.length > 0) {
      where.OR = searchVariants.flatMap((v) => [
        { orderNumber: { contains: v, mode: 'insensitive' as const } },
        { company: { name: { contains: v, mode: 'insensitive' as const } } },
        { quote: { quoteNumber: { contains: v, mode: 'insensitive' as const } } },
      ]);
    }

    if (status && Object.values(OrderStatus).includes(status as OrderStatus)) {
      where.status = status as OrderStatus;
    }

    if (companyId) {
      where.companyId = companyId;
    }

    // Server-side sorting
    const sortField = searchParams.get('sortField') || 'createdAt';
    const sortDirection = (searchParams.get('sortDirection') === 'asc' ? 'asc' : 'desc') as Prisma.SortOrder;

    let orderBy: Prisma.OrderConfirmationOrderByWithRelationInput;
    switch (sortField) {
      case 'orderNumber':
        orderBy = { orderNumber: sortDirection };
        break;
      case 'company':
        orderBy = { company: { name: sortDirection } };
        break;
      case 'status':
        orderBy = { status: sortDirection };
        break;
      case 'createdAt':
      default:
        orderBy = { createdAt: sortDirection };
        break;
    }

    const [orders, total] = await Promise.all([
      db.orderConfirmation.findMany({
        where,
        include: {
          quote: {
            select: {
              id: true,
              quoteNumber: true,
              subject: true,
              currency: true,
              grandTotal: true,
            },
          },
          company: { select: { id: true, name: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.orderConfirmation.count({ where }),
    ]);

    return NextResponse.json({
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Orders GET error:', error);
    return NextResponse.json(
      { error: 'Siparisler alinirken bir hata olustu' },
      { status: 500 }
    );
  }
}

/** Max retries for order creation on unique constraint collision */
const MAX_ORDER_RETRIES = 3;

/**
 * Generate the next STF number inside a transaction context.
 * Uses the transaction client (tx) so the read+write is atomic
 * under Serializable isolation.
 */
async function getNextOrderNumber(
  tx: Prisma.TransactionClient
): Promise<string> {
  const all = await tx.orderConfirmation.findMany({
    select: { orderNumber: true },
  });
  return nextStfNumber(all.map((o) => o.orderNumber));
}

/**
 * Check whether a Prisma error is a unique constraint violation (P2002)
 * which indicates a concurrent insert grabbed the same order number.
 */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { quoteId, notes, deliveryDate } = body;

    if (!quoteId) {
      return NextResponse.json(
        { error: 'Teklif ID zorunludur' },
        { status: 400 }
      );
    }

    // Verify the quote exists (outside the retry loop — immutable check)
    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      include: {
        company: { select: { name: true, address: true, phone: true, taxNumber: true } },
        project: { select: { name: true } },
        items: { orderBy: { sortOrder: 'asc' } },
        commercialTerms: { select: { category: true, value: true } },
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadi' }, { status: 404 });
    }

    if (quote.status !== 'KAZANILDI') {
      return NextResponse.json(
        { error: 'Sadece kazanilmis teklifler siparis olusturabilir' },
        { status: 400 }
      );
    }

    // Retry loop: serializable transaction prevents read-then-write race.
    // If two concurrent requests still collide on the unique orderNumber,
    // the unique constraint causes P2002 and we retry with a fresh number.
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ORDER_RETRIES; attempt++) {
      try {
        const order = await db.$transaction(
          async (tx) => {
            // Dedup check INSIDE transaction to prevent TOCTOU race
            const existingOrder = await tx.orderConfirmation.findFirst({
              where: {
                quoteId: quote.id,
                status: { not: 'IPTAL' },
              },
            });

            if (existingOrder) {
              throw new Error('DUPLICATE_ORDER:' + existingOrder.id);
            }

            const orderNumber = await getNextOrderNumber(tx);
            const { header, items } = buildStfSnapshot(
              {
                quoteNumber: quote.quoteNumber,
                refNo: quote.refNo,
                currency: quote.currency,
                discountTotal: Number(quote.discountTotal),
                grandTotal: Number(quote.grandTotal),
                company: quote.company,
                project: quote.project,
                items: quote.items.map((i) => ({
                  itemType: i.itemType,
                  sortOrder: i.sortOrder,
                  code: i.code,
                  brand: i.brand,
                  model: i.model,
                  description: i.description,
                  quantity: Number(i.quantity),
                  unit: i.unit,
                  unitPrice: Number(i.unitPrice),
                  totalPrice: Number(i.totalPrice),
                  priceLabel: i.priceLabel,
                  parentItemId: i.parentItemId,
                  discountPct: Number(i.discountPct),
                })),
                commercialTerms: quote.commercialTerms,
              },
              new Date()
            );

            return tx.orderConfirmation.create({
              data: {
                orderNumber,
                quoteId: quote.id,
                companyId: quote.companyId,
                status: 'HAZIRLANIYOR',
                notes: notes || null,
                deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
                createdById: user.id,
                ...header,
                items: {
                  create: items.map((it) => ({ ...it, itemType: it.itemType as QuoteItemType })),
                },
              },
              include: {
                company: { select: { id: true, name: true } },
                createdBy: { select: { id: true, fullName: true } },
              },
            });
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          }
        );

        return NextResponse.json({ order }, { status: 201 });
      } catch (error) {
        // Duplicate order check thrown from inside transaction
        if (error instanceof Error && error.message.startsWith('DUPLICATE_ORDER')) {
          const existingId = error.message.split(':')[1] || null;
          return NextResponse.json(
            { error: 'Bu teklif için zaten bir STF var', orderId: existingId },
            { status: 409 }
          );
        }
        lastError = error;
        if (!isUniqueConstraintError(error)) {
          // Not a collision — re-throw immediately
          throw error;
        }
        // Unique constraint collision — retry with fresh number
      }
    }

    // All retries exhausted
    console.error('Orders POST error: max retries reached', lastError);
    return NextResponse.json(
      { error: 'Siparis olusturulurken bir hata olustu' },
      { status: 500 }
    );
  } catch (error) {
    console.error('Orders POST error:', error);
    return NextResponse.json(
      { error: 'Siparis olusturulurken bir hata olustu' },
      { status: 500 }
    );
  }
}
