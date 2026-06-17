/**
 * Manager-mode (cost-based) profit aggregation for the quote analysis screen.
 *
 * Extracted from BrandProfitSummary so the margin math is unit-testable.
 *
 * Two things this fixes/adds vs. the old inline logic (B6):
 *  1. Cross-brand SET mis-attribution. A SET parent's full revenue is
 *     attributed to the parent's brand, but its children carry the real
 *     costs. The old code attributed each child's cost to the CHILD's own
 *     brand, so a SET grouping children of different brands produced a
 *     brand row with revenue-but-no-cost (inflated margin) and other rows
 *     with cost-but-no-revenue (phantom losses). We now attribute a SET
 *     child's cost to its PARENT SET's brand, so revenue and cost line up.
 *  2. A per-set breakdown (sale / cost / profit / margin) so each Set's
 *     own profitability is visible — the client's explicit request.
 *
 * Grand totals (revenue, cost, profit) are unchanged by (1): only the
 * per-brand split moves, never the sums.
 */
import { getEffectiveCostPrice } from '@/lib/ek-maliyet';

export interface ProfitSummaryItem {
  id: string;
  itemType: string;
  brand?: string | null;
  description?: string | null;
  code?: string | null;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  discountPct?: number | string | null;
  costPrice?: number | string | null;
  ekMaliyetDelta?: number | string | null;
  priceLabel?: string | null;
  parentItemId?: string | null;
  currency?: string | null;
  sectionDiscountPct?: number | string | null;
}

export interface BrandCostSummary {
  brand: string;
  itemCount: number;
  totalRevenue: number;
  totalCost: number;
  profit: number;
  margin: number;
}

export interface SetCostSummary {
  id: string;
  name: string;
  totalRevenue: number;
  totalCost: number;
  profit: number;
  margin: number;
}

export interface ManagerProfitSummary {
  brands: BrandCostSummary[];
  sets: SetCostSummary[];
  totals: {
    itemCount: number;
    totalRevenue: number;
    totalCost: number;
    profit: number;
    margin: number;
  };
}

export interface ProfitSummaryContext {
  currency: string;
  exchangeRate?: number;
  protectionPct?: number;
}

const BRAND_FALLBACK = 'Diger';

function num(v: unknown): number {
  return Number(v) || 0;
}

/**
 * Recover the base (non-protected) foreign rate used to convert TRY-priced
 * SETs/costs into the quote currency. Mirrors the server ctx and the
 * QuoteItemsTable summary so all three views agree.
 */
function computeBaseForeignRate(ctx: ProfitSummaryContext): number {
  if (ctx.currency === 'TRY') return 1;
  const r = num(ctx.exchangeRate) || 1;
  const p = num(ctx.protectionPct);
  return p > 0 ? r / (1 + p / 100) : r;
}

/**
 * @param allItems     The full item list — used to build section-discount and
 *                     SET-currency lookups that depend on global ordering.
 * @param visibleItems The items to aggregate (may be a single subtotal section).
 */
export function computeManagerProfitSummary(
  allItems: ProfitSummaryItem[],
  visibleItems: ProfitSummaryItem[],
  ctx: ProfitSummaryContext
): ManagerProfitSummary {
  const baseForeignRate = computeBaseForeignRate(ctx);
  const quoteCurrency = ctx.currency;

  // SET currency overrides (top-level SETs only), for child cost conversion.
  const setCurrencyByParentId = new Map<string, string>();
  const itemsById = new Map<string, ProfitSummaryItem>();
  for (const it of allItems) {
    itemsById.set(it.id, it);
    if (it.itemType === 'SET' && !it.parentItemId && it.currency) {
      setCurrencyByParentId.set(it.id, it.currency);
    }
  }

  // Section discount % per item id, by global SUBTOTAL boundaries.
  const sectionPctById = new Map<string, number>();
  const pending: string[] = [];
  for (const it of allItems) {
    if (it.itemType === 'SUBTOTAL') {
      const pct = num(it.sectionDiscountPct);
      for (const id of pending) sectionPctById.set(id, pct);
      pending.length = 0;
      continue;
    }
    pending.push(it.id);
  }
  for (const id of pending) sectionPctById.set(id, 0);

  const convert = (item: ProfitSummaryItem, amount: number): number => {
    const effCur =
      item.currency ||
      (item.parentItemId ? setCurrencyByParentId.get(item.parentItemId) : undefined) ||
      quoteCurrency;
    if (effCur === 'TRY' && quoteCurrency !== 'TRY' && baseForeignRate > 0) {
      return amount / baseForeignRate;
    }
    return amount;
  };

  const rowRevenue = (item: ProfitSummaryItem): number => {
    const qty = num(item.quantity);
    const up = num(item.unitPrice);
    const disc = num(item.discountPct);
    const sectionPct = sectionPctById.get(item.id) ?? 0;
    return qty * up * (1 - disc / 100) * (1 - sectionPct / 100);
  };

  const rowCost = (item: ProfitSummaryItem): number | null => {
    const qty = num(item.quantity);
    const effectiveCost = getEffectiveCostPrice(item);
    if (effectiveCost == null) return null;
    return effectiveCost * qty;
  };

  const grouped: Record<string, { revenue: number; cost: number; count: number }> = {};
  const ensureBrand = (key: string) => {
    if (!grouped[key]) grouped[key] = { revenue: 0, cost: 0, count: 0 };
    return grouped[key];
  };

  for (const item of visibleItems) {
    if (
      item.itemType === 'HEADER' ||
      item.itemType === 'NOTE' ||
      item.itemType === 'SUBTOTAL' ||
      item.itemType === 'GRAND_TOTAL'
    ) {
      continue;
    }
    if (item.priceLabel) continue;

    const isTopLevelPriced =
      !item.parentItemId &&
      (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET');
    const isSetParent = item.itemType === 'SET' && !item.parentItemId;

    // Revenue: only top-level priced rows; attributed to the row's own brand.
    if (isTopLevelPriced) {
      const bucket = ensureBrand(item.brand || BRAND_FALLBACK);
      bucket.revenue += convert(item, rowRevenue(item));
      bucket.count += 1;
    }

    // Cost: every priced row except the SET parent (its children hold the
    // cost). A SET child's cost is attributed to its PARENT SET's brand so
    // it lands in the same bucket as the SET's revenue.
    if (!isSetParent) {
      const cost = rowCost(item);
      if (cost != null) {
        const parent = item.parentItemId ? itemsById.get(item.parentItemId) : undefined;
        const costBrand =
          parent && parent.itemType === 'SET'
            ? parent.brand || BRAND_FALLBACK
            : item.brand || BRAND_FALLBACK;
        ensureBrand(costBrand).cost += convert(item, cost);
      }
    }
  }

  const brands: BrandCostSummary[] = Object.entries(grouped)
    .map(([brand, d]) => {
      const profit = d.revenue - d.cost;
      const margin = d.revenue > 0 ? (profit / d.revenue) * 100 : 0;
      return {
        brand,
        itemCount: d.count,
        totalRevenue: d.revenue,
        totalCost: d.cost,
        profit,
        margin,
      };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  // Per-set breakdown: each SET parent's revenue vs. the summed cost of its
  // (visible) children.
  const sets: SetCostSummary[] = [];
  for (const item of visibleItems) {
    if (item.itemType !== 'SET' || item.parentItemId) continue;
    const revenue = convert(item, rowRevenue(item));
    let cost = 0;
    for (const child of visibleItems) {
      if (child.parentItemId !== item.id) continue;
      if (child.priceLabel) continue;
      const c = rowCost(child);
      if (c != null) cost += convert(child, c);
    }
    const profit = revenue - cost;
    sets.push({
      id: item.id,
      name: item.description || item.code || 'Set',
      totalRevenue: revenue,
      totalCost: cost,
      profit,
      margin: revenue > 0 ? (profit / revenue) * 100 : 0,
    });
  }

  const totalRevenue = brands.reduce((s, b) => s + b.totalRevenue, 0);
  const totalCost = brands.reduce((s, b) => s + b.totalCost, 0);
  const totalProfit = totalRevenue - totalCost;
  const totalItems = brands.reduce((s, b) => s + b.itemCount, 0);

  return {
    brands,
    sets,
    totals: {
      itemCount: totalItems,
      totalRevenue,
      totalCost,
      profit: totalProfit,
      margin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0,
    },
  };
}
