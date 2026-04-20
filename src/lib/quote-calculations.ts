/**
 * Quote calculation utilities
 * Implements the Katsayı (coefficient) pricing model used by BTS
 */

import { db } from './db';
import { computeRowTotal, round2 } from './quote-rounding';

export interface QuoteItem {
  /** Optional DB id. Only required when using a scoped discount — the
   *  scope calculation walks the ordered items array looking for the
   *  targeted SUBTOTAL by id. Legacy callers that only need the
   *  whole-quote discount can omit this field. */
  id?: string;
  itemType: 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SET' | 'SUBTOTAL' | 'GRAND_TOTAL';
  quantity: number;
  unitPrice: number;
  discountPct: number;
  vatRate: number;
  /** When set, the row's price is replaced by a literal label and the
   *  item contributes 0 to the quote totals. */
  priceLabel?: string | null;
  /** Optional per-SET currency override. Only meaningful on top-level
   *  SET rows. NULL/undefined = use the quote's own currency (legacy
   *  behavior, all existing data). Must be either 'TRY' or the quote's
   *  own currency — enforcement lives at the API validation layer. */
  currency?: string | null;
  /** When present, identifies the parent SET this row sits under. Used
   *  by the mixed-currency conversion helpers to resolve a child's
   *  effective currency by walking up to its parent. */
  parentItemId?: string | null;
  /**
   * Per-section discount percentage (0–100). Only meaningful on
   * SUBTOTAL rows; the API coerces it to null on any other row. Null
   * or 0 → this section contributes its gross sum to the grand total.
   */
  sectionDiscountPct?: number | null;
  /**
   * Optional custom label for the section's İskonto line on PDF/Excel.
   * Null → renderers fall back to "İskonto". Only meaningful on
   * SUBTOTAL rows.
   */
  sectionDiscountLabel?: string | null;
}

/**
 * Quote-level currency context used to convert mixed-currency SET
 * subtotals into the quote's own currency for grand-total math. When
 * `undefined` is passed to the calculation functions, no conversion
 * happens (legacy, single-currency behavior).
 */
export interface QuoteCurrencyContext {
  /** The quote's own currency (e.g. 'EUR', 'USD', 'TRY'). */
  quoteCurrency: string;
  /** Base (non-protected) foreign/TRY rate — how many TRY for 1 unit of
   *  the quote's currency. 1 when the quote is TRY. Derived upstream
   *  from `Quote.exchangeRate / (1 + Quote.protectionPct/100)` so the
   *  protection uplift is NOT applied to TRY-set contributions: a set
   *  priced in TRY has no FX exposure to protect against. */
  baseForeignRate: number;
}

/**
 * Resolve the effective currency of an item. Top-level rows use their
 * own `currency` when set; children look up their parent SET. Falls
 * back to the quote's currency when neither carries an override.
 *
 * `items` should be the same array passed to the totals functions —
 * the lookup walks it positionally, not through the DB.
 */
export function effectiveItemCurrency(
  item: Pick<QuoteItem, 'currency' | 'parentItemId'>,
  items: QuoteItem[],
  quoteCurrency: string
): string {
  if (item.currency) return item.currency;
  if (item.parentItemId) {
    const parent = items.find((i) => i.id === item.parentItemId);
    if (parent?.currency) return parent.currency;
  }
  return quoteCurrency;
}

/**
 * Convert a raw amount from an item's effective currency to the quote
 * currency. Only the TRY-set-in-non-TRY-quote case actually converts;
 * every other combination is either identity or disallowed by API
 * validation (handled as a safe pass-through).
 */
export function convertToQuoteCurrency(
  amount: number,
  fromCurrency: string,
  ctx: QuoteCurrencyContext
): number {
  if (fromCurrency === ctx.quoteCurrency) return amount;
  if (fromCurrency === 'TRY' && ctx.quoteCurrency !== 'TRY') {
    return ctx.baseForeignRate > 0 ? amount / ctx.baseForeignRate : amount;
  }
  // Cross-foreign or foreign-in-TRY-quote aren't allowed by validation
  // (the UI only lets users pick TRY or the quote currency). If one
  // somehow reaches us we pass through raw so the total is visibly off
  // rather than silently wrong.
  return amount;
}

// Re-export for backwards compatibility — lives in ek-maliyet.ts so client code can import it
export { getEffectiveCostPrice } from './ek-maliyet';

export interface QuoteTotals {
  subtotal: number;
  discountTotal: number;
  vatTotal: number;
  grandTotal: number;
}

/**
 * Calculate unit price from list price and katsayi coefficient
 * unitPrice = listPrice × katsayi
 */
export function calculateUnitPrice(listPrice: number, katsayi: number): number {
  return listPrice * katsayi;
}

/**
 * Calculate item total with quantity and item-level discount (before VAT)
 * total = quantity × unitPrice × (1 - discountPct/100), rounded to
 * 2 decimals. Delegates to `computeRowTotal` so every caller in the
 * app produces the exact same number from the same inputs.
 */
export function calculateItemTotal(params: {
  quantity: number;
  unitPrice: number;
  discountPct: number;
}): number {
  return computeRowTotal(params);
}

/**
 * Calculate item total including VAT
 * Used for individual item price display
 */
export function calculateItemTotalWithVat(params: {
  quantity: number;
  unitPrice: number;
  discountPct: number;
  vatRate: number;
}): number {
  const { quantity, unitPrice, discountPct, vatRate } = params;
  const afterDiscount = calculateItemTotal({ quantity, unitPrice, discountPct });
  const vatAmount = afterDiscount * (vatRate / 100);
  return afterDiscount + vatAmount;
}

/**
 * Return true if an item contributes to the quote subtotal — i.e.
 * it's a priced PRODUCT / CUSTOM / SET row with no replacement label.
 */
function isPricedItem(item: QuoteItem): boolean {
  return (
    (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET') &&
    !item.priceLabel
  );
}

export interface SectionBreakdown {
  /** SUBTOTAL row id this section ends at, or null for the trailing
   *  orphan group (items that sit after the last SUBTOTAL). */
  subtotalId: string | null;
  /** Sum of priced items in this section, in quote currency. */
  sectionSum: number;
  /** Discount % pulled off the SUBTOTAL row (0 when subtotalId is null). */
  discountPct: number;
  /** Custom discount-line label pulled off the SUBTOTAL row; null when
   *  there's no discount or the SUBTOTAL didn't specify a custom label.
   *  Renderers fall back to "İskonto" on null. */
  discountLabel: string | null;
  /** sectionSum × discountPct / 100, rounded to 2 decimals. */
  discountAmount: number;
  /** sectionSum − discountAmount. */
  sectionNet: number;
}

/**
 * Walk the items array and return one entry per section. A section
 * ends at each SUBTOTAL row; items below the last SUBTOTAL form a
 * trailing orphan group (subtotalId = null, discount always 0).
 *
 * Items must be in sortOrder. Price-labeled rows and SET children
 * contribute 0 to the section sum — the SET parent already carries
 * its children's combined totalPrice.
 */
export function calculateSectionBreakdown(
  items: QuoteItem[],
  ctx?: QuoteCurrencyContext
): SectionBreakdown[] {
  const breakdown: SectionBreakdown[] = [];
  let sectionSum = 0;

  for (const item of items) {
    if (item.itemType === 'SUBTOTAL') {
      const discountPct = Number(item.sectionDiscountPct ?? 0);
      const discountAmount = round2(sectionSum * (discountPct / 100));
      breakdown.push({
        subtotalId: item.id ?? null,
        sectionSum: round2(sectionSum),
        discountPct,
        discountLabel: item.sectionDiscountLabel ?? null,
        discountAmount,
        sectionNet: round2(sectionSum - discountAmount),
      });
      sectionSum = 0;
      continue;
    }
    if (!isPricedItem(item)) continue;
    // Exclude SET children — parent's totalPrice already includes them.
    if (item.parentItemId) continue;

    const raw = calculateItemTotal({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPct: item.discountPct,
    });
    if (ctx) {
      const cur = effectiveItemCurrency(item, items, ctx.quoteCurrency);
      sectionSum += convertToQuoteCurrency(raw, cur, ctx);
    } else {
      sectionSum += raw;
    }
  }

  // Trailing orphans (no discount ever).
  if (sectionSum > 0) {
    breakdown.push({
      subtotalId: null,
      sectionSum: round2(sectionSum),
      discountPct: 0,
      discountLabel: null,
      discountAmount: 0,
      sectionNet: round2(sectionSum),
    });
  }

  return breakdown;
}

/**
 * Calculate quote totals from per-section discounts living on the
 * SUBTOTAL rows themselves (`sectionDiscountPct`). The legacy
 * `_deprecatedDiscountPct` argument is kept for API stability during
 * migration — callers should pass 0. It's unused inside the function.
 *
 * - `subtotal` = Σ sectionSum (pre-discount, including orphans).
 * - `discountTotal` = Σ sectionDiscountAmount.
 * - `grandTotal` = Σ sectionNet (orphan sections contribute their
 *   full sum because their discount is always 0).
 * - `vatTotal` is always 0 — VAT is outside the quote.
 *
 * For backward compatibility the function also accepts the old 4-arg
 * call pattern `(items, pct, null, ctx)` where the 3rd arg was a
 * discountScopeSubtotalId. When the 3rd arg is null/string and the
 * 4th arg is a QuoteCurrencyContext, the 4th arg is used as the
 * currency context.
 */
/**
 * Calculate quote totals from per-section discounts living on the
 * SUBTOTAL rows themselves (`sectionDiscountPct`). The legacy
 * `_deprecatedDiscountPct` argument is kept for API stability during
 * migration — callers should pass 0. It's unused inside the function.
 *
 * - `subtotal` = Σ sectionSum (pre-discount, including orphans).
 * - `discountTotal` = Σ sectionDiscountAmount.
 * - `grandTotal` = Σ sectionNet (orphan sections contribute their
 *   full sum because their discount is always 0).
 * - `vatTotal` is always 0 — VAT is outside the quote.
 */
export function calculateQuoteTotals(
  items: QuoteItem[],
  _deprecatedDiscountPct: number = 0,
  ctx?: QuoteCurrencyContext
): QuoteTotals {
  if (items.length === 0 || !items.some(isPricedItem)) {
    return { subtotal: 0, discountTotal: 0, vatTotal: 0, grandTotal: 0 };
  }

  const breakdown = calculateSectionBreakdown(items, ctx);
  const subtotal = breakdown.reduce((s, b) => s + b.sectionSum, 0);
  const discountTotal = breakdown.reduce((s, b) => s + b.discountAmount, 0);
  const grandTotal = breakdown.reduce((s, b) => s + b.sectionNet, 0);

  return {
    subtotal: round2(subtotal),
    discountTotal: round2(discountTotal),
    vatTotal: 0,
    grandTotal: round2(grandTotal),
  };
}

// --- Profit / Cost Calculation ---

export interface ItemProfitResult {
  cost: number;
  revenue: number;
  profit: number;
  marginPct: number;
}

export function calculateItemProfit(
  totalPrice: number,
  costPrice: number | null | undefined,
  quantity: number
): ItemProfitResult {
  const revenue = totalPrice;
  const cost = (costPrice || 0) * quantity;
  const profit = revenue - cost;
  const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;

  return {
    cost: Math.round(cost * 100) / 100,
    revenue: Math.round(revenue * 100) / 100,
    profit: Math.round(profit * 100) / 100,
    marginPct: Math.round(marginPct * 100) / 100,
  };
}

export interface QuoteProfitSummary {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  overallMarginPct: number;
}

/**
 * Calculate quote-level profit summary.
 *
 * Per-section discounts live on SUBTOTAL rows via `sectionDiscountPct`.
 * The function walks the items once to build an item-id → section-pct
 * map, then applies that section's discount to revenue (cost is never
 * discounted). Items below the last SUBTOTAL form a trailing orphan
 * group with pct = 0.
 *
 * `_legacyOverallDiscountPct` is kept in the signature for source
 * compatibility with pre-migration callers. It's ignored.
 */
export function calculateQuoteProfitSummary(
  items: Array<{
    id?: string;
    totalPrice: number;
    costPrice?: number | null;
    quantity: number;
    itemType: string;
    parentItemId?: string | null;
    priceLabel?: string | null;
    currency?: string | null;
    sectionDiscountPct?: number | null;
  }>,
  _legacyOverallDiscountPct: number = 0,
  ctx?: QuoteCurrencyContext
): QuoteProfitSummary {
  // Currency map — unchanged from prior version.
  const currencyById = new Map<string, string>();
  if (ctx) {
    const parentCurrency = new Map<string, string>();
    for (const it of items) {
      if (!it.parentItemId && it.id && it.currency) {
        parentCurrency.set(it.id, it.currency);
      }
    }
    for (const it of items) {
      if (!it.id) continue;
      const own = it.currency;
      const parentCur = it.parentItemId ? parentCurrency.get(it.parentItemId) : undefined;
      currencyById.set(it.id, own || parentCur || ctx.quoteCurrency);
    }
  }

  const convert = (amount: number, id: string | undefined): number => {
    if (!ctx || !id) return amount;
    const cur = currencyById.get(id) ?? ctx.quoteCurrency;
    return convertToQuoteCurrency(amount, cur, ctx);
  };

  // Walk sections: accumulate item-ids → which section they belong to,
  // and remember each section's discount. Items below the last
  // SUBTOTAL belong to a trailing orphan section (pct = 0).
  //
  // Id-less items (test fixtures / legacy shapes) are intentionally
  // skipped here: they can never be mapped to a section, so their
  // revenue lookup below falls through to 0% discount — which is the
  // conservative right answer (better to show 0 than to apply a
  // random section's discount to an unidentifiable row).
  const itemIdToSectionDiscountPct = new Map<string, number>();
  const pendingIds: string[] = [];
  for (const it of items) {
    if (it.itemType === 'SUBTOTAL') {
      const sectionPct = Number(it.sectionDiscountPct ?? 0);
      for (const id of pendingIds) itemIdToSectionDiscountPct.set(id, sectionPct);
      pendingIds.length = 0;
      continue;
    }
    if (it.id) pendingIds.push(it.id);
  }
  // Leftover ids are trailing orphans → pct 0.
  for (const id of pendingIds) itemIdToSectionDiscountPct.set(id, 0);

  let itemRevenue = 0;
  let totalCost = 0;

  for (const item of items) {
    if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET') {
      if (item.priceLabel) continue;

      if (!item.parentItemId) {
        const sectionPct = item.id ? (itemIdToSectionDiscountPct.get(item.id) ?? 0) : 0;
        const revenueConverted = convert(item.totalPrice, item.id);
        itemRevenue += revenueConverted * (1 - sectionPct / 100);
      }
      const isSetParent = item.itemType === 'SET' && !item.parentItemId;
      if (!isSetParent) {
        const rawCost = (item.costPrice || 0) * item.quantity;
        totalCost += convert(rawCost, item.id);
      }
    }
  }

  const totalRevenue = itemRevenue;
  const totalProfit = totalRevenue - totalCost;
  const overallMarginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    totalProfit: Math.round(totalProfit * 100) / 100,
    overallMarginPct: Math.round(overallMarginPct * 100) / 100,
  };
}

// --- Recalculate & Persist Quote Totals ---

export async function recalculateAndPersistQuoteTotals(quoteId: string) {
  // Items MUST come back in `sortOrder` — the section walker relies on
  // positional order.
  const items = await db.quoteItem.findMany({
    where: { quoteId },
    orderBy: { sortOrder: 'asc' },
  });

  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    select: {
      currency: true,
      exchangeRate: true,
      protectionPct: true,
    },
  });

  const quoteItems = items
    .filter(item => !item.parentItemId) // Exclude sub-rows to avoid double-counting
    .map(item => ({
      id: item.id,
      itemType: item.itemType as QuoteItem['itemType'],
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discountPct: Number(item.discountPct),
      vatRate: Number(item.vatRate),
      totalPrice: Number(item.totalPrice),
      listPrice: Number(item.listPrice),
      katsayi: Number(item.katsayi),
      priceLabel: item.priceLabel,
      currency: item.currency ?? null,
      parentItemId: item.parentItemId ?? null,
      sectionDiscountPct: item.sectionDiscountPct != null ? Number(item.sectionDiscountPct) : null,
      sectionDiscountLabel: item.sectionDiscountLabel ?? null,
    }));

  const hasMixedCurrency = quoteItems.some(
    (i) => i.currency && i.currency !== quote?.currency
  );
  const protectionPct = Number(quote?.protectionPct || 0);
  const protectedRate = Number(quote?.exchangeRate || 1);
  const baseForeignRate = protectionPct > 0
    ? protectedRate / (1 + protectionPct / 100)
    : protectedRate;
  const ctx: QuoteCurrencyContext | undefined = hasMixedCurrency && quote
    ? { quoteCurrency: quote.currency, baseForeignRate }
    : undefined;

  const totals = calculateQuoteTotals(quoteItems, 0, ctx);

  await db.quote.update({
    where: { id: quoteId },
    data: {
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      vatTotal: totals.vatTotal,
      grandTotal: totals.grandTotal,
      pdfOverrideHtml: null,
      pdfOverrideAt: null,
    },
  });

  return totals;
}
