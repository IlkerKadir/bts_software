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

/**
 * Sum the priced items that belong to the section ending at the given
 * SUBTOTAL item. A "section" is the slice of items from the previous
 * SUBTOTAL (exclusive) up to — but not including — the target SUBTOTAL.
 * Walks the caller-supplied ORDER of `items`, so the caller is
 * responsible for passing them sorted by `sortOrder`.
 *
 * Returns `null` when the target id either isn't in the list or isn't
 * actually a SUBTOTAL row. Callers interpret `null` as "auto-heal to
 * whole-quote discount".
 */
function sumSectionForSubtotal(
  items: QuoteItem[],
  subtotalId: string,
  ctx?: QuoteCurrencyContext
): number | null {
  const targetIdx = items.findIndex(
    (i) => i.id === subtotalId && i.itemType === 'SUBTOTAL'
  );
  if (targetIdx === -1) return null;

  // Walk backward to find the start of this section — the slot after
  // the previous SUBTOTAL, or 0 if none.
  let startIdx = 0;
  for (let j = targetIdx - 1; j >= 0; j--) {
    if (items[j].itemType === 'SUBTOTAL') {
      startIdx = j + 1;
      break;
    }
  }

  let sum = 0;
  for (let j = startIdx; j < targetIdx; j++) {
    const item = items[j];
    if (isPricedItem(item)) {
      const raw = calculateItemTotal({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPct: item.discountPct,
      });
      if (ctx) {
        const cur = effectiveItemCurrency(item, items, ctx.quoteCurrency);
        sum += convertToQuoteCurrency(raw, cur, ctx);
      } else {
        sum += raw;
      }
    }
  }
  return sum;
}

/**
 * Calculate quote totals including subtotal, discount, VAT, and grand total.
 *
 * When `discountScopeSubtotalId` is null/undefined the discount is
 * applied to the entire subtotal (legacy behavior). When set, it is
 * applied only to the sum of priced items in that SUBTOTAL's section;
 * items outside the section contribute to `subtotal` at full price.
 * If the id points at a missing or non-SUBTOTAL item, the scope is
 * silently treated as "whole quote" so stale pointers self-heal.
 *
 * The caller should pass `items` in `sortOrder` order when using a
 * scoped discount — the section walk relies on positional order.
 */
export function calculateQuoteTotals(
  items: QuoteItem[],
  overallDiscountPct: number,
  discountScopeSubtotalId?: string | null,
  ctx?: QuoteCurrencyContext
): QuoteTotals {
  const productItems = items.filter(isPricedItem);

  if (productItems.length === 0) {
    return {
      subtotal: 0,
      discountTotal: 0,
      vatTotal: 0,
      grandTotal: 0,
    };
  }

  // Subtotal is always the full sum, regardless of scope — scoping only
  // changes which portion gets the discount applied. When a currency
  // context is supplied, each item is converted to the quote's currency
  // before summing (a TRY-priced SET in an EUR quote contributes its
  // EUR-equivalent at the base, non-protected rate).
  const subtotal = productItems.reduce((sum, item) => {
    const raw = calculateItemTotal({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPct: item.discountPct,
    });
    if (ctx) {
      const cur = effectiveItemCurrency(item, items, ctx.quoteCurrency);
      return sum + convertToQuoteCurrency(raw, cur, ctx);
    }
    return sum + raw;
  }, 0);

  // Determine the base that the discount percent multiplies.
  let discountBase = subtotal;
  if (discountScopeSubtotalId) {
    const sectionSum = sumSectionForSubtotal(items, discountScopeSubtotalId, ctx);
    if (sectionSum !== null) {
      discountBase = sectionSum;
    }
    // sectionSum === null → auto-heal: fall through to whole-quote base.
  }

  const discountTotal = discountBase * (overallDiscountPct / 100);
  const netAfterDiscount = subtotal - discountTotal;

  // VAT is intentionally NOT added to quote totals. Prices shown in
  // the proforma and Excel export are VAT-exclusive; the client handles
  // VAT outside the quote. The `vatTotal` field is kept at zero purely
  // to preserve the Prisma schema shape without requiring a migration.
  const vatTotal = 0;
  const grandTotal = netAfterDiscount;

  return {
    subtotal: round2(subtotal),
    discountTotal: round2(discountTotal),
    vatTotal,
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
  }>,
  overallDiscountPct: number = 0,
  ctx?: QuoteCurrencyContext
): QuoteProfitSummary {
  let itemRevenue = 0;
  let totalCost = 0;

  // Pre-resolve each item's effective currency once so children of a
  // mixed-currency SET find their parent's currency in O(1) inside the
  // loop. Without a ctx this map stays empty and everything flows
  // through unchanged (legacy single-currency path).
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

  for (const item of items) {
    if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET') {
      // Price-labeled rows (e.g. "TARAFINIZCA SAĞLANACAKTIR") contribute
      // 0 to both revenue and cost — the label replaces the price and
      // the client does not charge for them.
      if (item.priceLabel) continue;
      // Revenue: only top-level items (SET parent totalPrice includes children)
      if (!item.parentItemId) {
        itemRevenue += convert(item.totalPrice, item.id);
      }
      // Cost: all items except SET parents (sub-items carry the actual costs)
      const isSetParent = item.itemType === 'SET' && !item.parentItemId;
      if (!isSetParent) {
        const rawCost = (item.costPrice || 0) * item.quantity;
        totalCost += convert(rawCost, item.id);
      }
    }
  }

  // Apply overall quote discount to revenue
  const totalRevenue = itemRevenue * (1 - overallDiscountPct / 100);
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
  // Items MUST come back in `sortOrder` — the scoped-discount section
  // walk relies on positional order to find the slice between
  // adjacent SUBTOTAL rows.
  const items = await db.quoteItem.findMany({
    where: { quoteId },
    orderBy: { sortOrder: 'asc' },
  });

  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    select: {
      discountPct: true,
      discountScopeSubtotalId: true,
      currency: true,
      exchangeRate: true,
      protectionPct: true,
    },
  });

  const quoteItems = items
    .filter(item => !item.parentItemId)  // Exclude sub-rows to avoid double-counting
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
    }));

  // Auto-heal a dangling discount scope: if the referenced id is no
  // longer a SUBTOTAL in this quote, treat the scope as cleared and
  // persist the null so the UI doesn't keep rendering a ghost.
  const rawScopeId = quote?.discountScopeSubtotalId ?? null;
  const scopeValid =
    !!rawScopeId &&
    quoteItems.some(
      (i) => i.id === rawScopeId && i.itemType === 'SUBTOTAL'
    );
  const resolvedScopeId = scopeValid ? rawScopeId : null;

  // Build a currency context only when the quote actually contains a
  // SET with a non-null currency override. Avoids introducing any
  // numerical drift for the 100% of existing quotes that are
  // single-currency — they take the ctx=undefined path through the
  // calculation and sum identically to before.
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

  const totals = calculateQuoteTotals(
    quoteItems,
    Number(quote?.discountPct || 0),
    resolvedScopeId,
    ctx
  );

  await db.quote.update({
    where: { id: quoteId },
    data: {
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      vatTotal: totals.vatTotal,
      grandTotal: totals.grandTotal,
      // If the referenced SUBTOTAL disappeared since the last save,
      // clear the dangling pointer here so subsequent reads get the
      // auto-healed null instead of the stale cuid.
      ...(rawScopeId && !scopeValid ? { discountScopeSubtotalId: null } : {}),
      // Invalidate any cosmetic PDF override — structured data changed so the
      // override would show stale prices. User must re-edit the PDF to get a
      // version that matches the new totals.
      pdfOverrideHtml: null,
      pdfOverrideAt: null,
    },
  });

  return totals;
}
