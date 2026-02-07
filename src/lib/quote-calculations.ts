/**
 * Quote calculation utilities
 * Implements the Katsayı (coefficient) pricing model used by BTS
 */

import { db } from './db';

export interface QuoteItem {
  itemType: 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SERVICE';
  quantity: number;
  unitPrice: number;
  discountPct: number;
  vatRate: number;
}

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
  // Filter only priced items (PRODUCT and CUSTOM)
  const productItems = items.filter((item) => item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM');

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

  // Calculate VAT based on each item's VAT rate (applied to discounted amounts)
  let vatTotal = 0;

  for (const item of productItems) {
    const itemTotal = calculateItemTotal({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPct: item.discountPct,
    });
    // Proportional share of overall discount (subtotal already equals sum of item totals)
    const itemShare = subtotal > 0 ? itemTotal / subtotal : 0;
    const itemAfterOverallDiscount = itemTotal - (discountTotal * itemShare);
    vatTotal += itemAfterOverallDiscount * (item.vatRate / 100);
  }

  const grandTotal = netAfterDiscount + vatTotal;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    discountTotal: Math.round(discountTotal * 100) / 100,
    vatTotal: Math.round(vatTotal * 100) / 100,
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
  }>,
  overallDiscountPct: number = 0
): QuoteProfitSummary {
  let itemRevenue = 0;
  let totalCost = 0;

  for (const item of items) {
    // Exclude SERVICE items from profit calculation — their profitability is unknown
    if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM') {
      // totalPrice is pre-VAT (qty * unitPrice * (1 - itemDiscountPct/100))
      itemRevenue += item.totalPrice;
      totalCost += (item.costPrice || 0) * item.quantity;
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

  const quoteItems = items.map(item => ({
    itemType: item.itemType as QuoteItem['itemType'],
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    discountPct: Number(item.discountPct),
    vatRate: Number(item.vatRate),
    totalPrice: Number(item.totalPrice),
    listPrice: Number(item.listPrice),
    katsayi: Number(item.katsayi),
  }));

  const totals = calculateQuoteTotals(quoteItems, Number(quote?.discountPct || 0));

  await db.quote.update({
    where: { id: quoteId },
    data: {
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      vatTotal: totals.vatTotal,
      grandTotal: totals.grandTotal,
    },
  });

  return totals;
}
