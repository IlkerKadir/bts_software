import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { reportQuerySchema } from '@/lib/validations/report';
import { Prisma, QuoteStatus } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = reportQuerySchema.parse({
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      status: searchParams.get('status') || undefined,
      companyId: searchParams.get('companyId') || undefined,
      createdById: searchParams.get('createdById') || undefined,
      currency: searchParams.get('currency') || undefined,
      groupBy: searchParams.get('groupBy') || undefined,
    });

    // Build where clause
    const where: Prisma.QuoteWhereInput = {};

    if (query.startDate) {
      where.createdAt = {
        ...((where.createdAt as Prisma.DateTimeFilter) || {}),
        gte: new Date(query.startDate),
      };
    }

    if (query.endDate) {
      const endDate = new Date(query.endDate);
      endDate.setHours(23, 59, 59, 999);
      where.createdAt = {
        ...((where.createdAt as Prisma.DateTimeFilter) || {}),
        lte: endDate,
      };
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.companyId) {
      where.companyId = query.companyId;
    }

    if (query.createdById) {
      where.createdById = query.createdById;
    }

    if (query.currency) {
      where.currency = query.currency;
    }

    // Get quotes with relations
    const quotes = await db.quote.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate summary statistics
    const totalQuotes = quotes.length;
    const totalValue = quotes.reduce((sum, q) => sum + Number(q.grandTotal), 0);
    const avgValue = totalQuotes > 0 ? totalValue / totalQuotes : 0;

    // Status breakdown
    const statusCounts: Record<QuoteStatus, { count: number; value: number }> = {
      TASLAK: { count: 0, value: 0 },
      ONAY_BEKLIYOR: { count: 0, value: 0 },
      ONAYLANDI: { count: 0, value: 0 },
      GONDERILDI: { count: 0, value: 0 },
      TAKIPTE: { count: 0, value: 0 },
      REVIZYON: { count: 0, value: 0 },
      KAZANILDI: { count: 0, value: 0 },
      KAYBEDILDI: { count: 0, value: 0 },
      IPTAL: { count: 0, value: 0 },
    };

    for (const quote of quotes) {
      statusCounts[quote.status].count++;
      statusCounts[quote.status].value += Number(quote.grandTotal);
    }

    // Win rate calculation (won / (won + lost))
    const wonCount = statusCounts.KAZANILDI.count;
    const lostCount = statusCounts.KAYBEDILDI.count;
    const winRate = wonCount + lostCount > 0
      ? (wonCount / (wonCount + lostCount)) * 100
      : 0;

    // Group data if requested
    let groupedData: Record<string, { count: number; value: number }> | null = null;

    if (query.groupBy) {
      groupedData = {};

      for (const quote of quotes) {
        let key: string;

        switch (query.groupBy) {
          case 'status':
            key = quote.status;
            break;
          case 'company':
            key = quote.company.name;
            break;
          case 'user':
            key = quote.createdBy.fullName;
            break;
          case 'month':
            const date = new Date(quote.createdAt);
            key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            break;
          default:
            key = 'other';
        }

        if (!groupedData[key]) {
          groupedData[key] = { count: 0, value: 0 };
        }
        groupedData[key].count++;
        groupedData[key].value += Number(quote.grandTotal);
      }
    }

    // Top companies by value
    const companyTotals: Record<string, { name: string; count: number; value: number }> = {};
    for (const quote of quotes) {
      const companyId = quote.companyId;
      if (!companyTotals[companyId]) {
        companyTotals[companyId] = {
          name: quote.company.name,
          count: 0,
          value: 0,
        };
      }
      companyTotals[companyId].count++;
      companyTotals[companyId].value += Number(quote.grandTotal);
    }

    const topCompanies = Object.values(companyTotals)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Top users by value
    const userTotals: Record<string, { name: string; count: number; value: number }> = {};
    for (const quote of quotes) {
      const userId = quote.createdById;
      if (!userTotals[userId]) {
        userTotals[userId] = {
          name: quote.createdBy.fullName,
          count: 0,
          value: 0,
        };
      }
      userTotals[userId].count++;
      userTotals[userId].value += Number(quote.grandTotal);
    }

    const topUsers = Object.values(userTotals)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    return NextResponse.json({
      summary: {
        totalQuotes,
        totalValue,
        avgValue,
        winRate,
        wonValue: statusCounts.KAZANILDI.value,
        lostValue: statusCounts.KAYBEDILDI.value,
      },
      statusBreakdown: statusCounts,
      topCompanies,
      topUsers,
      groupedData,
      quotes: quotes.map((q) => ({
        id: q.id,
        quoteNumber: q.quoteNumber,
        company: q.company,
        project: q.project,
        createdBy: q.createdBy,
        currency: q.currency,
        grandTotal: Number(q.grandTotal),
        status: q.status,
        createdAt: q.createdAt,
      })),
    });
  } catch (error) {
    console.error('Reports GET error:', error);
    return NextResponse.json(
      { error: 'Rapor oluşturulurken bir hata oluştu' },
      { status: 500 }
    );
  }
}
