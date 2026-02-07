import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { Prisma } from '@prisma/client';

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

    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { company: { name: { contains: search, mode: 'insensitive' } } },
        { quote: { quoteNumber: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (status) {
      where.status = status as any;
    }

    if (companyId) {
      where.companyId = companyId;
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
        orderBy: { createdAt: 'desc' },
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

async function getNextOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SIP-${year}-`;

  const lastOrder = await db.orderConfirmation.findFirst({
    where: {
      orderNumber: { startsWith: prefix },
    },
    orderBy: { orderNumber: 'desc' },
  });

  let nextSequence = 1;
  if (lastOrder) {
    const match = lastOrder.orderNumber.match(/SIP-\d{4}-(\d+)$/);
    if (match) {
      nextSequence = parseInt(match[1], 10) + 1;
    }
  }

  return `${prefix}${String(nextSequence).padStart(4, '0')}`;
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

    // Verify the quote exists
    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      select: {
        id: true,
        companyId: true,
        quoteNumber: true,
        status: true,
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadi' }, { status: 404 });
    }

    const orderNumber = await getNextOrderNumber();

    const order = await db.orderConfirmation.create({
      data: {
        orderNumber,
        quoteId: quote.id,
        companyId: quote.companyId,
        status: 'HAZIRLANIYOR',
        notes: notes || null,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        createdById: user.id,
      },
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
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    console.error('Orders POST error:', error);
    return NextResponse.json(
      { error: 'Siparis olusturulurken bir hata olustu' },
      { status: 500 }
    );
  }
}
