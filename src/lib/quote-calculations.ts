/**
 * Quote calculation utilities
 * Implements the Katsayı (coefficient) pricing model used by BTS
 */

import { db } from './db';

export interface QuoteItem {
  itemType: 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SET' | 'SUBTOTAL' | 'GRAND_TOTAL';
  quantity: number;
  unitPrice: number;
  discountPct: number;
  vatRate: number;
  /** When set, the row's price is replaced by a literal label and the
   *  item contributes 0 to the quote totals. */
  priceLabel?: string | null;
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
 * total = quantity × unitPrice × (1 - discountPct/100)
 */
export function calculateItemTotal(params: {
  quantity: number;
  unitPrice: number;
  discountPct: number;
}): number {
  const { quantity, unitPrice, discountPct } = params;
  const subtotal = quantity * unitPrice;
  const discount = subtotal * (discountPct / 100);
  return Math.round((subtotal - discount) * 100) / 100;
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
 * Calculate quote totals including subtotal, discount, VAT, and grand total
 */
export function calculateQuoteTotals(
  items: QuoteItem[],
  overallDiscountPct: number
): QuoteTotals {
  // Filter only priced items (PRODUCT, CUSTOM, and SET). Items with a
  // price label (e.g. "TARAFINIZCA SAĞLANACAKTIR") are excluded because
  // their price is displayed as text instead of a number.
  const productItems = items.filter((item) =>
    (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET')
    && !item.priceLabel
  );

  if (productItems.length === 0) {
    return {
      subtotal: 0,
      discountTotal: 0,
      vatTotal: 0,
      grandTotal: 0,
    };
  }

  // Calculate subtotal (sum of all item totals after item-level discounts)
  const subtotal = productItems.reduce((sum, item) => {
    return sum + calculateItemTotal({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPct: item.discountPct,
    });
  }, 0);

  // Calculate overall discount
  const discountTotal = subtotal * (overallDiscountPct / 100);
  const netAfterDiscount = subtotal - discountTotal;

  // VAT is intentionally NOT added to quote totals. Prices shown in
  // the proforma and Excel export are VAT-exclusive; the client handles
  // VAT outside the quote. The `vatTotal` field is kept at zero purely
  // to preserve the Prisma schema shape without requiring a migration.
  const vatTotal = 0;
  const grandTotal = netAfterDiscount;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountTotal: Math.round(discountTotal * 100) / 100,
    vatTotal,
    grandTotal: Math.round(grandTotal * 100) / 100,
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
    totalPrice: number;
    costPrice?: number | null;
    quantity: number;
    itemType: string;
    parentItemId?: string | null;
    priceLabel?: string | null;
  }>,
  overallDiscountPct: number = 0
): QuoteProfitSummary {
  let itemRevenue = 0;
  let totalCost = 0;

  for (const item of items) {
    if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET') {
      // Price-labeled rows (e.g. "TARAFINIZCA SAĞLANACAKTIR") contribute
      // 0 to both revenue and cost — the label replaces the price and
      // the client does not charge for them.
      if (item.priceLabel) continue;
      // Revenue: only top-level items (SET parent totalPrice includes children)
      if (!item.parentItemId) {
        itemRevenue += item.totalPrice;
      }
      // Cost: all items except SET parents (sub-items carry the actual costs)
      const isSetParent = item.itemType === 'SET' && !item.parentItemId;
      if (!isSetParent) {
        totalCost += (item.costPrice || 0) * item.quantity;
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
  const items = await db.quoteItem.findMany({
    where: { quoteId },
  });

  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    select: { discountPct: true },
  });

  const quoteItems = items
    .filter(item => !item.parentItemId)  // Exclude sub-rows to avoid double-counting
    .map(item => ({
      itemType: item.itemType as QuoteItem['itemType'],
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discountPct: Number(item.discountPct),
      vatRate: Number(item.vatRate),
      totalPrice: Number(item.totalPrice),
      listPrice: Number(item.listPrice),
      katsayi: Number(item.katsayi),
      priceLabel: item.priceLabel,
    }));

  const totals = calculateQuoteTotals(quoteItems, Number(quote?.discountPct || 0));

  await db.quote.update({
    where: { id: quoteId },
    data: {
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      vatTotal: totals.vatTotal,
      grandTotal: totals.grandTotal,
      // Invalidate any cosmetic PDF override — structured data changed so the
      // override would show stale prices. User must re-edit the PDF to get a
      // version that matches the new totals.
      pdfOverrideHtml: null,
      pdfOverrideAt: null,
    },
  });

  return totals;
}
