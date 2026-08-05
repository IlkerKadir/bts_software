import { db } from '@/lib/db';

export interface PriceHistoryStat {
  unitPrice: number;
  date: string;
}

export interface PriceHistoryStats {
  lastQuoted: PriceHistoryStat | null;
  lastOrdered: PriceHistoryStat | null;
  highest: PriceHistoryStat | null;
  lowest: PriceHistoryStat | null;
}

/**
 * Aggregated per-product price history for a company, computed from
 * quote items of sent/tracked/won/lost quotes: most recent price,
 * most recent WON price, and the highest/lowest ever quoted.
 *
 * Shared by the batch-stats API (editor's Fiyat Geçmişi columns) and
 * the manager quote Excel export — keep the two surfaces identical.
 */
export async function computePriceHistoryStats(
  companyId: string,
  productIds: string[]
): Promise<Record<string, PriceHistoryStats>> {
  const stats: Record<string, PriceHistoryStats> = {};
  if (productIds.length === 0) return stats;

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

  const grouped: Record<
    string,
    Array<{ unitPrice: number; date: string; quoteStatus: string }>
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

  return stats;
}
