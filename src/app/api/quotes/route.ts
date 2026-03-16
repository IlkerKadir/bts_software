import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { quoteQuerySchema, createQuoteSchema } from '@/lib/validations/quote';
import { getSession } from '@/lib/session';
import { Prisma } from '@prisma/client';
import { generateQuoteNumber, getCurrentYearPrefix, getNextSequence } from '@/lib/quote-number';

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

    // Date range filtering
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    if (dateFrom) {
      where.createdAt = { ...(where.createdAt as Prisma.DateTimeFilter || {}), gte: new Date(dateFrom) };
    }
    if (dateTo) {
      where.createdAt = { ...(where.createdAt as Prisma.DateTimeFilter || {}), lte: new Date(dateTo + 'T23:59:59.999Z') };
    }

    // Sales reps can only see their own quotes
    if (!user.role.canManageUsers && !user.role.canApprove) {
      where.createdById = user.id;
    }

    // Server-side sorting
    const sortField = searchParams.get('sortField') || 'createdAt';
    const sortDirection = (searchParams.get('sortDirection') === 'asc' ? 'asc' : 'desc') as Prisma.SortOrder;

    let orderBy: Prisma.QuoteOrderByWithRelationInput;
    switch (sortField) {
      case 'quoteNumber':
        orderBy = { quoteNumber: sortDirection };
        break;
      case 'company':
        orderBy = { company: { name: sortDirection } };
        break;
      case 'grandTotal':
        orderBy = { grandTotal: sortDirection };
        break;
      case 'status':
        orderBy = { status: sortDirection };
        break;
      case 'createdAt':
      default:
        orderBy = { createdAt: sortDirection };
        break;
    }

    const [quotes, total] = await Promise.all([
      db.quote.findMany({
        where,
        include: {
          company: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
        orderBy,
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


export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate input using schema
    const validation = createQuoteSchema.safeParse(body);
    if (!validation.success) {
      const firstError = validation.error.issues[0];
      return NextResponse.json(
        { error: firstError?.message || 'Geçersiz veri' },
        { status: 400 }
      );
    }
    const data = validation.data;

    // Get current exchange rate (outside transaction since it's read-only)
    const exchangeRate = await db.exchangeRate.findFirst({
      where: {
        fromCurrency: data.currency,
        toCurrency: 'TRY',
      },
      orderBy: { fetchedAt: 'desc' },
    });

    // Determine exchange rate
    let resolvedExchangeRate: number;
    if (data.currency === 'TRY') {
      resolvedExchangeRate = 1.0;
    } else if (exchangeRate?.rate) {
      resolvedExchangeRate = Number(exchangeRate.rate);
    } else {
      return NextResponse.json(
        { error: 'Döviz kuru bulunamadı. Lütfen önce kurları güncelleyin.' },
        { status: 400 }
      );
    }

    // Wrap quote number generation and creation in a transaction to prevent race conditions
    const quote = await db.$transaction(async (tx) => {
      const prefix = getCurrentYearPrefix();

      const lastQuote = await tx.quote.findFirst({
        where: {
          quoteNumber: { startsWith: prefix },
          // Exclude revision numbers (e.g. BTS-2026-0010-R2) so we find the true last sequence
          NOT: { quoteNumber: { contains: '-R' } },
        },
        orderBy: { quoteNumber: 'desc' },
      });

      const nextSequence = getNextSequence(lastQuote?.quoteNumber || null);
      const quoteNumber = generateQuoteNumber(nextSequence);

      return await tx.quote.create({
        data: {
          quoteNumber,
          companyId: data.companyId,
          projectId: data.projectId || null,
          subject: data.subject || null,
          description: data.description || null,
          currency: data.currency,
          exchangeRate: resolvedExchangeRate,
          createdById: user.id,
          validityDays: data.validityDays,
          notes: data.notes || null,
        },
        include: {
          company: { select: { id: true, name: true } },
          project: { select: { id: true, name: true } },
          createdBy: { select: { id: true, fullName: true } },
        },
      });
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
