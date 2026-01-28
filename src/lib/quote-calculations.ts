/**
 * Quote calculation utilities
 * Implements the Katsayı (coefficient) pricing model used by BTS
 */

export interface QuoteItem {
  itemType: 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM';
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
  return subtotal - discount;
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
  // Filter only product items
  const productItems = items.filter((item) => item.itemType === 'PRODUCT');

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
  const totalBeforeDiscount = productItems.reduce((sum, item) => {
    return sum + calculateItemTotal({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPct: item.discountPct,
    });
  }, 0);

  for (const item of productItems) {
    const itemTotal = calculateItemTotal({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPct: item.discountPct,
    });
    // Proportional share of overall discount
    const itemShare = totalBeforeDiscount > 0 ? itemTotal / totalBeforeDiscount : 0;
    const itemAfterOverallDiscount = itemTotal - (discountTotal * itemShare);
    vatTotal += itemAfterOverallDiscount * (item.vatRate / 100);
  }

  const grandTotal = netAfterDiscount + vatTotal;

  return {
    subtotal,
    discountTotal,
    vatTotal,
    grandTotal,
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
  }>
): QuoteProfitSummary {
  let totalRevenue = 0;
  let totalCost = 0;

  for (const item of items) {
    if (item.itemType === 'PRODUCT' || item.itemType === 'SERVICE' || item.itemType === 'CUSTOM') {
      totalRevenue += item.totalPrice;
      totalCost += (item.costPrice || 0) * item.quantity;
    }
  }

  const totalProfit = totalRevenue - totalCost;
  const overallMarginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    totalProfit: Math.round(totalProfit * 100) / 100,
    overallMarginPct: Math.round(overallMarginPct * 100) / 100,
  };
}
