import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { quoteQuerySchema } from '@/lib/validations/quote';
import { getSession } from '@/lib/session';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = quoteQuerySchema.parse({
      search: searchParams.get('search') || undefined,
      companyId: searchParams.get('companyId') || undefined,
      projectId: searchParams.get('projectId') || undefined,
      status: searchParams.get('status') || undefined,
      createdById: searchParams.get('createdById') || undefined,
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
    });

    const where: Prisma.QuoteWhereInput = {};

    if (query.search) {
      where.OR = [
        { quoteNumber: { contains: query.search, mode: 'insensitive' } },
        { company: { name: { contains: query.search, mode: 'insensitive' } } },
        { project: { name: { contains: query.search, mode: 'insensitive' } } },
        { subject: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.companyId) {
      where.companyId = query.companyId;
    }

    if (query.projectId) {
      where.projectId = query.projectId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.createdById) {
      where.createdById = query.createdById;
    }

    const [quotes, total] = await Promise.all([
      db.quote.findMany({
        where,
        include: {
          company: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      db.quote.count({ where }),
    ]);

    return NextResponse.json({
      quotes,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  } catch (error) {
    console.error('Quotes GET error:', error);
    return NextResponse.json(
      { error: 'Teklifler alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}

// Helper function to generate quote number
async function generateQuoteNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `BTS-${year}-`;

  const lastQuote = await db.quote.findFirst({
    where: {
      quoteNumber: { startsWith: prefix },
    },
    orderBy: { quoteNumber: 'desc' },
  });

  let nextNumber = 1;
  if (lastQuote) {
    const lastNumber = parseInt(lastQuote.quoteNumber.replace(prefix, ''), 10);
    nextNumber = lastNumber + 1;
  }

  return `${prefix}${nextNumber.toString().padStart(4, '0')}`;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.companyId) {
      return NextResponse.json({ error: 'Firma seçimi gereklidir' }, { status: 400 });
    }

    const quoteNumber = await generateQuoteNumber();

    // Get current exchange rate
    const exchangeRate = await db.exchangeRate.findFirst({
      where: {
        fromCurrency: body.currency || 'EUR',
        toCurrency: 'TRY',
      },
      orderBy: { fetchedAt: 'desc' },
    });

    const quote = await db.quote.create({
      data: {
        quoteNumber,
        companyId: body.companyId,
        projectId: body.projectId || null,
        subject: body.subject || null,
        currency: body.currency || 'EUR',
        exchangeRate: exchangeRate?.rate || 36.85,
        createdById: user.id,
        validityDays: 30,
      },
      include: {
        company: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });

    // Create history entry
    await db.quoteHistory.create({
      data: {
        quoteId: quote.id,
        userId: user.id,
        action: 'CREATE',
      },
    });

    return NextResponse.json({ quote }, { status: 201 });
  } catch (error) {
    console.error('Quotes POST error:', error);
    return NextResponse.json(
      { error: 'Teklif oluşturulurken bir hata oluştu' },
      { status: 500 }
    );
  }
}
