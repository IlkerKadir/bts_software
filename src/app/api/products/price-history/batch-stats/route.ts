import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

// GET - Fetch aggregated price history stats for multiple products for a given company
// Returns: lastQuoted, lastOrdered, highest, lowest per product
export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Price history shows historical unitPrice/katsayi — not cost data, visible to all users

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const productIdsParam = searchParams.get('productIds');

    if (!companyId) {
      return NextResponse.json(
        { error: 'companyId parametresi gerekli' },
        { status: 400 }
      );
    }

    const productIds = productIdsParam
      ? productIdsParam.split(',').filter(Boolean)
      : [];

    if (productIds.length === 0) {
      return NextResponse.json({ stats: {} });
    }

    // Fetch all quote items for these products from sent/tracked/won/lost quotes for this company
    const quoteItems = await db.quoteItem.findMany({
      where: {
        productId: { in: productIds },
        quote: {
          companyId,
          status: {
            in: ['GONDERILDI', 'TAKIPTE', 'KAZANILDI', 'KAYBEDILDI'],
          },
        },
      },
      select: {
        productId: true,
        unitPrice: true,
        createdAt: true,
        quote: {
          select: {
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Group by productId and compute aggregates
    const grouped: Record<
      string,
      Array<{
        unitPrice: number;
        date: string;
        quoteStatus: string;
      }>
    > = {};

    for (const item of quoteItems) {
      if (!item.productId) continue;
      if (!grouped[item.productId]) {
        grouped[item.productId] = [];
      }
      grouped[item.productId].push({
        unitPrice: Number(item.unitPrice),
        date: item.quote.createdAt.toISOString(),
        quoteStatus: item.quote.status,
      });
    }

    // Compute stats per product
    const stats: Record<
      string,
      {
        lastQuoted: { unitPrice: number; date: string } | null;
        lastOrdered: { unitPrice: number; date: string } | null;
        highest: { unitPrice: number; date: string } | null;
        lowest: { unitPrice: number; date: string } | null;
      }
    > = {};

    for (const productId of productIds) {
      const entries = grouped[productId] || [];

      if (entries.length === 0) {
        stats[productId] = {
          lastQuoted: null,
          lastOrdered: null,
          highest: null,
          lowest: null,
        };
        continue;
      }

      // Last quoted: most recent entry (already sorted by createdAt desc)
      const lastQuoted = entries[0];

      // Last ordered: most recent with KAZANILDI status
      const ordered = entries.find((e) => e.quoteStatus === 'KAZANILDI');

      // Highest and lowest unit prices
      let highest = entries[0];
      let lowest = entries[0];
      for (const entry of entries) {
        if (entry.unitPrice > highest.unitPrice) highest = entry;
        if (entry.unitPrice < lowest.unitPrice) lowest = entry;
      }

      stats[productId] = {
        lastQuoted: { unitPrice: lastQuoted.unitPrice, date: lastQuoted.date },
        lastOrdered: ordered
          ? { unitPrice: ordered.unitPrice, date: ordered.date }
          : null,
        highest: { unitPrice: highest.unitPrice, date: highest.date },
        lowest: { unitPrice: lowest.unitPrice, date: lowest.date },
      };
    }

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('Batch price history stats GET error:', error);
    return NextResponse.json(
      { error: 'Fiyat geçmişi istatistikleri alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}
