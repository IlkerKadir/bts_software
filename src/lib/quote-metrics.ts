/**
 * Quote metrics extraction utilities
 * Extracts metrics from quote items for approval rules and statistics
 */

import type { QuoteApprovalInput } from './approval-rules';

export type QuoteItemType = 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM';

export interface QuoteItemForMetrics {
  itemType: QuoteItemType;
  quantity: number;
  listPrice: number;
  katsayi: number;
  discountPct: number;
}

export interface QuoteStats {
  /** Number of PRODUCT items */
  productCount: number;
  /** Total number of all items (including headings and notes) */
  totalItems: number;
  /** Sum of quantities across all PRODUCT items */
  totalQuantity: number;
  /** Average katsayi across PRODUCT items */
  averageKatsayi: number;
  /** Average discount percentage across PRODUCT items */
  averageDiscountPct: number;
}

/**
 * Calculate item total value
 * @param item - Quote item with pricing details
 * @returns Total value of the item after discount
 */
function calculateItemValue(item: QuoteItemForMetrics): number {
  const unitPrice = item.listPrice * item.katsayi;
  const subtotal = item.quantity * unitPrice;
  const discountMultiplier = 1 - item.discountPct / 100;
  return subtotal * discountMultiplier;
}

/**
 * Extract approval-relevant metrics from quote items
 * Only considers PRODUCT items (ignores HEADER, NOTE, and CUSTOM)
 * @param items - Array of quote items
 * @returns Metrics needed for approval rules
 */
export function extractApprovalMetrics(items: QuoteItemForMetrics[]): QuoteApprovalInput {
  const productItems = items.filter((item) => item.itemType === 'PRODUCT');

  if (productItems.length === 0) {
    return {
      totalValue: 0,
      maxDiscountPct: 0,
      minKatsayi: Infinity,
    };
  }

  const totalValue = productItems.reduce((sum, item) => sum + calculateItemValue(item), 0);
  const maxDiscountPct = Math.max(...productItems.map((item) => item.discountPct));
  const minKatsayi = Math.min(...productItems.map((item) => item.katsayi));

  return {
    totalValue,
    maxDiscountPct,
    minKatsayi,
  };
}

/**
 * Get statistics about quote items
 * @param items - Array of quote items
 * @returns Statistics including counts and averages
 */
export function getQuoteStats(items: QuoteItemForMetrics[]): QuoteStats {
  const productItems = items.filter((item) => item.itemType === 'PRODUCT');

  if (productItems.length === 0) {
    return {
      productCount: 0,
      totalItems: items.length,
      totalQuantity: 0,
      averageKatsayi: 0,
      averageDiscountPct: 0,
    };
  }

  const totalQuantity = productItems.reduce((sum, item) => sum + item.quantity, 0);
  const averageKatsayi =
    productItems.reduce((sum, item) => sum + item.katsayi, 0) / productItems.length;
  const averageDiscountPct =
    productItems.reduce((sum, item) => sum + item.discountPct, 0) / productItems.length;

  return {
    productCount: productItems.length,
    totalItems: items.length,
    totalQuantity,
    averageKatsayi,
    averageDiscountPct,
  };
}
