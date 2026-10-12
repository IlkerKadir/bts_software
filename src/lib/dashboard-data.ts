import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { quoteVisibilityWhere } from '@/lib/quote-visibility';
import { computeQuoteProfit } from '@/lib/quote-profit';
import {
  type DashQuote,
  istanbulMonthKey,
  lastMonths,
  makeEurRateLookup,
  toEur,
  familyDecisions,
  monthlyWonEur,
  monthlyWinRate,
  sentInPeriod,
  wonInPeriod,
  SUMMARY_PERIOD_MONTHS,
  type SummaryPeriod,
} from '@/lib/dashboard-metrics';

interface DashboardUser {
  id: string;
  roleId?: string;
  role: { canApprove: boolean; canManageUsers: boolean };
}

/** Window large enough for 12 chart months plus revision families that started earlier. */
const LOOKBACK_MONTHS = 18;

async function loadEurRateLookup() {
  // Direct X→EUR rows (written by "TCMB Senkronize") plus X→TRY rows, from
  // which X→EUR is derived when a day has no direct rate.
  const rows = await db.exchangeRate.findMany({
    where: {
      OR: [
        { toCurrency: 'EUR', fromCurrency: { in: ['TRY', 'USD', 'GBP'] } },
        { toCurrency: 'TRY', fromCurrency: { in: ['EUR', 'USD', 'GBP'] } },
      ],
    },
    select: { fromCurrency: true, toCurrency: true, rate: true, fetchedAt: true },
    orderBy: { fetchedAt: 'asc' },
  });
  return makeEurRateLookup(rows.map((r) => ({ ...r, rate: Number(r.rate) })));
}

async function loadDashQuotes(user: DashboardUser, now: Date): Promise<DashQuote[]> {
  const since = new Date(now.getTime());
  since.setUTCMonth(since.getUTCMonth() - LOOKBACK_MONTHS);
  const visibility = quoteVisibilityWhere(user);
  // updatedAt too: a deal created before the window but decided inside it.
  const base: Prisma.QuoteWhereInput = { OR: [{ createdAt: { gte: since } }, { updatedAt: { gte: since } }] };
  const where = Object.keys(visibility).length === 0 ? base : { AND: [base, visibility] };

  const rows = await db.quote.findMany({
    where,
    select: {
      id: true,
      companyId: true,
      quoteNumber: true,
      parentQuoteId: true,
      status: true,
      currency: true,
      grandTotal: true,
      rateSnapshot: true,
      createdAt: true,
      updatedAt: true,
      history: {
        where: { action: 'STATUS_CHANGE' },
        select: { changes: true, createdAt: true },
      },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    companyId: r.companyId,
    quoteNumber: r.quoteNumber,
    parentQuoteId: r.parentQuoteId,
    status: r.status,
    currency: r.currency,
    grandTotal: Number(r.grandTotal),
    rateSnapshot: r.rateSnapshot,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    events: r.history.flatMap((h) => {
      const to = (h.changes as { to?: unknown } | null)?.to;
      return typeof to === 'string' ? [{ to, at: h.createdAt }] : [];
    }),
  }));
}

export interface DashboardSummaryData {
  period: SummaryPeriod;
  /** Activity: quotes SENT in the period (one per revision family). */
  sentCount: number;
  sentAmount: number;
  /** Quotes WON in the period (by win date, one per revision family). */
  wonCount: number;
  wonAmount: number;
  /** Realised profit of the won quotes (rows without a known cost excluded). */
  wonProfit: number;
  wonMargin: number;
  /** Share (0–100) of the won revenue whose cost is unknown. */
  uncostedPct: number;
  /** Quotes counted but left out of the amounts (no known EUR rate). */
  noRateCount: number;
}

const PROFIT_ITEM_SELECT = {
  id: true,
  currency: true,
  exchangeRate: true,
  protectionPct: true,
  items: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      id: true, totalPrice: true, costPrice: true, ekMaliyetDelta: true, listPrice: true,
      quantity: true, itemType: true, parentItemId: true, priceLabel: true, currency: true,
      sectionDiscountPct: true,
    },
  },
} as const;

/**
 * Dashboard summary for a period (client 10.2026): the profit cards are
 * based on quotes WON in the period (realised, by win date); quotes SENT
 * in the period are shown as an activity figure. Amounts in EUR, one per
 * revision family; rows without a known cost are left out of profit/margin
 * instead of counting as 100% profit.
 */
export async function getDashboardSummary(
  user: DashboardUser,
  period: SummaryPeriod = 'month',
): Promise<DashboardSummaryData> {
  const now = new Date();
  const [quotes, eurRate] = await Promise.all([loadDashQuotes(user, now), loadEurRateLookup()]);
  const monthKeys = new Set(lastMonths(now, SUMMARY_PERIOD_MONTHS[period]).map((m) => m.key));
  const round2 = (v: number) => Math.round(v * 100) / 100;
  // A quote sent AND won in the period without a known rate counts once.
  const noRateIds = new Set<string>();

  // Activity: sent
  const sent = sentInPeriod(quotes, monthKeys);
  let sentAmount = 0;
  for (const { quote, at } of sent) {
    const eur = toEur(quote.grandTotal, quote.currency, quote.rateSnapshot, at, eurRate);
    if (eur == null) noRateIds.add(quote.id);
    else sentAmount += eur;
  }

  // Realised: won
  const won = wonInPeriod(familyDecisions(quotes), monthKeys);
  const itemRows = won.length
    ? await db.quote.findMany({ where: { id: { in: won.map((w) => w.quote.id) } }, select: PROFIT_ITEM_SELECT })
    : [];
  const byId = new Map(itemRows.map((r) => [r.id, r]));

  let wonAmount = 0;
  let costedRevenueEur = 0;
  let profitEur = 0;
  let uncostedEur = 0;
  for (const { quote, at } of won) {
    const rate = toEur(1, quote.currency, quote.rateSnapshot, at, eurRate);
    if (rate == null) {
      noRateIds.add(quote.id);
      continue;
    }
    wonAmount += quote.grandTotal * rate;
    const full = byId.get(quote.id);
    if (!full) continue;
    const p = computeQuoteProfit(full);
    const costedRevenue = p.totalRevenue - p.uncostedRevenue;
    costedRevenueEur += costedRevenue * rate;
    profitEur += (costedRevenue - p.totalCost) * rate;
    uncostedEur += p.uncostedRevenue * rate;
  }

  return {
    period,
    sentCount: sent.length,
    sentAmount: round2(sentAmount),
    wonCount: won.length,
    wonAmount: round2(wonAmount),
    wonProfit: round2(profitEur),
    wonMargin: costedRevenueEur > 0 ? round2((profitEur / costedRevenueEur) * 100) : 0,
    uncostedPct: wonAmount > 0 ? round2(Math.min(100, (uncostedEur / wonAmount) * 100)) : 0,
    noRateCount: noRateIds.size,
  };
}

export interface DashboardChartData {
  monthlyRevenue: { month: string; kazanilan: number }[];
  winRate: { month: string; rate: number | null }[];
  pipeline: { name: string; value: number; color: string }[];
}

const STATUS_LABELS: Record<string, string> = {
  TASLAK: 'Taslak', ONAY_BEKLIYOR: 'Onay Bekliyor', DUZENLEME_TALEP_EDILDI: 'Duzenleme Talep Edildi',
  ONAYLANDI: 'Onaylandi', GONDERILDI: 'Gonderildi', TAKIPTE: 'Takipte', REVIZYON: 'Revizyon',
  KAZANILDI: 'Kazanildi', KAYBEDILDI: 'Kaybedildi', IPTAL: 'Iptal',
};
const STATUS_COLORS: Record<string, string> = {
  TASLAK: '#94A3B8', ONAY_BEKLIYOR: '#F59E0B', DUZENLEME_TALEP_EDILDI: '#F43F5E', ONAYLANDI: '#0EA5E9',
  GONDERILDI: '#3B82F6', TAKIPTE: '#8B5CF6', REVIZYON: '#14B8A6', KAZANILDI: '#22C55E',
  KAYBEDILDI: '#EF4444', IPTAL: '#6B7280',
};

export async function getDashboardChartData(user: DashboardUser): Promise<DashboardChartData> {
  const now = new Date();
  const [quotes, eurRate] = await Promise.all([loadDashQuotes(user, now), loadEurRateLookup()]);
  const months = lastMonths(now, 12);
  const decisions = familyDecisions(quotes);

  const won = monthlyWonEur(decisions, months, (q, at) => toEur(q.grandTotal, q.currency, q.rateSnapshot, at, eurRate));
  const rates = monthlyWinRate(decisions, months);

  // Pipeline: current status of quotes created in the last 12 months
  // (unchanged definition — a distribution, not money).
  const firstKey = months[0].key;
  const recent = quotes.filter((q) => istanbulMonthKey(q.createdAt) >= firstKey);
  const pipeline = Object.entries(STATUS_LABELS)
    .map(([status, name]) => ({
      name,
      value: recent.filter((q) => q.status === status).length,
      color: STATUS_COLORS[status] || '#94A3B8',
    }))
    .filter((p) => p.value > 0);

  return {
    monthlyRevenue: months.map((m, i) => ({ month: m.label, kazanilan: won[i] })),
    winRate: months.map((m, i) => ({ month: m.label, rate: rates[i] })),
    pipeline,
  };
}
