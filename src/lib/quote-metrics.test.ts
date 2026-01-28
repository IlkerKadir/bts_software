import { describe, it, expect } from 'vitest';
import {
  extractApprovalMetrics,
  getQuoteStats,
  QuoteItemForMetrics,
} from './quote-metrics';

describe('Quote Metrics', () => {
  describe('extractApprovalMetrics', () => {
    it('extracts metrics from single item', () => {
      const items: QuoteItemForMetrics[] = [
        {
          itemType: 'PRODUCT',
          quantity: 10,
          listPrice: 100,
          katsayi: 1.2,
          discountPct: 15,
        },
      ];

      const metrics = extractApprovalMetrics(items);

      expect(metrics.totalValue).toBe(1020); // 10 * 100 * 1.2 * (1 - 0.15) = 1020
      expect(metrics.maxDiscountPct).toBe(15);
      expect(metrics.minKatsayi).toBe(1.2);
    });

    it('extracts metrics from multiple items', () => {
      const items: QuoteItemForMetrics[] = [
        { itemType: 'PRODUCT', quantity: 5, listPrice: 200, katsayi: 1.0, discountPct: 10 },
        { itemType: 'PRODUCT', quantity: 10, listPrice: 100, katsayi: 0.85, discountPct: 25 },
        { itemType: 'PRODUCT', quantity: 2, listPrice: 500, katsayi: 1.5, discountPct: 5 },
      ];

      const metrics = extractApprovalMetrics(items);

      // Item 1: 5 * 200 * 1.0 * 0.90 = 900
      // Item 2: 10 * 100 * 0.85 * 0.75 = 637.50
      // Item 3: 2 * 500 * 1.5 * 0.95 = 1425
      // Total: 2962.50
      expect(metrics.totalValue).toBeCloseTo(2962.5, 2);
      expect(metrics.maxDiscountPct).toBe(25); // highest discount
      expect(metrics.minKatsayi).toBe(0.85); // lowest katsayi
    });

    it('ignores HEADER items', () => {
      const items: QuoteItemForMetrics[] = [
        { itemType: 'HEADER', quantity: 0, listPrice: 0, katsayi: 1, discountPct: 0 },
        { itemType: 'PRODUCT', quantity: 5, listPrice: 100, katsayi: 1.2, discountPct: 10 },
      ];

      const metrics = extractApprovalMetrics(items);

      // Only product: 5 * 100 * 1.2 * 0.90 = 540
      expect(metrics.totalValue).toBe(540);
      expect(metrics.maxDiscountPct).toBe(10);
      expect(metrics.minKatsayi).toBe(1.2);
    });

    it('ignores NOTE items', () => {
      const items: QuoteItemForMetrics[] = [
        { itemType: 'NOTE', quantity: 0, listPrice: 0, katsayi: 1, discountPct: 0 },
        { itemType: 'PRODUCT', quantity: 3, listPrice: 50, katsayi: 1.1, discountPct: 5 },
      ];

      const metrics = extractApprovalMetrics(items);

      // Only product: 3 * 50 * 1.1 * 0.95 = 156.75
      expect(metrics.totalValue).toBeCloseTo(156.75, 2);
      expect(metrics.maxDiscountPct).toBe(5);
      expect(metrics.minKatsayi).toBe(1.1);
    });

    it('returns zero values for empty items array', () => {
      const metrics = extractApprovalMetrics([]);

      expect(metrics.totalValue).toBe(0);
      expect(metrics.maxDiscountPct).toBe(0);
      expect(metrics.minKatsayi).toBe(Infinity);
    });

    it('returns zero values when only non-product items exist', () => {
      const items: QuoteItemForMetrics[] = [
        { itemType: 'HEADER', quantity: 0, listPrice: 0, katsayi: 1, discountPct: 0 },
        { itemType: 'NOTE', quantity: 0, listPrice: 0, katsayi: 1, discountPct: 0 },
      ];

      const metrics = extractApprovalMetrics(items);

      expect(metrics.totalValue).toBe(0);
      expect(metrics.maxDiscountPct).toBe(0);
      expect(metrics.minKatsayi).toBe(Infinity);
    });

    it('handles items with zero quantity', () => {
      const items: QuoteItemForMetrics[] = [
        { itemType: 'PRODUCT', quantity: 0, listPrice: 100, katsayi: 1.0, discountPct: 50 },
        { itemType: 'PRODUCT', quantity: 5, listPrice: 100, katsayi: 1.2, discountPct: 10 },
      ];

      const metrics = extractApprovalMetrics(items);

      // Only second item contributes to value: 5 * 100 * 1.2 * 0.90 = 540
      expect(metrics.totalValue).toBe(540);
      // But max discount still considers all products
      expect(metrics.maxDiscountPct).toBe(50);
      expect(metrics.minKatsayi).toBe(1.0);
    });

    it('handles 100% discount', () => {
      const items: QuoteItemForMetrics[] = [
        { itemType: 'PRODUCT', quantity: 5, listPrice: 100, katsayi: 1.0, discountPct: 100 },
      ];

      const metrics = extractApprovalMetrics(items);

      expect(metrics.totalValue).toBe(0); // 100% discount = free
      expect(metrics.maxDiscountPct).toBe(100);
      expect(metrics.minKatsayi).toBe(1.0);
    });
  });

  describe('getQuoteStats', () => {
    it('calculates statistics for items', () => {
      const items: QuoteItemForMetrics[] = [
        { itemType: 'PRODUCT', quantity: 5, listPrice: 100, katsayi: 1.0, discountPct: 10 },
        { itemType: 'PRODUCT', quantity: 10, listPrice: 200, katsayi: 1.2, discountPct: 20 },
        { itemType: 'HEADER', quantity: 0, listPrice: 0, katsayi: 1, discountPct: 0 },
      ];

      const stats = getQuoteStats(items);

      expect(stats.productCount).toBe(2);
      expect(stats.totalItems).toBe(3);
      expect(stats.totalQuantity).toBe(15);
      expect(stats.averageKatsayi).toBeCloseTo(1.1, 2); // (1.0 + 1.2) / 2
      expect(stats.averageDiscountPct).toBeCloseTo(15, 2); // (10 + 20) / 2
    });

    it('returns zero averages for empty items', () => {
      const stats = getQuoteStats([]);

      expect(stats.productCount).toBe(0);
      expect(stats.totalItems).toBe(0);
      expect(stats.totalQuantity).toBe(0);
      expect(stats.averageKatsayi).toBe(0);
      expect(stats.averageDiscountPct).toBe(0);
    });

    it('counts different item types correctly', () => {
      const items: QuoteItemForMetrics[] = [
        { itemType: 'HEADER', quantity: 0, listPrice: 0, katsayi: 1, discountPct: 0 },
        { itemType: 'PRODUCT', quantity: 5, listPrice: 100, katsayi: 1.0, discountPct: 10 },
        { itemType: 'NOTE', quantity: 0, listPrice: 0, katsayi: 1, discountPct: 0 },
        { itemType: 'PRODUCT', quantity: 3, listPrice: 50, katsayi: 1.5, discountPct: 5 },
      ];

      const stats = getQuoteStats(items);

      expect(stats.productCount).toBe(2);
      expect(stats.totalItems).toBe(4);
    });

    it('excludes non-products from quantity total', () => {
      const items: QuoteItemForMetrics[] = [
        { itemType: 'HEADER', quantity: 0, listPrice: 0, katsayi: 1, discountPct: 0 },
        { itemType: 'PRODUCT', quantity: 10, listPrice: 100, katsayi: 1.0, discountPct: 0 },
        { itemType: 'NOTE', quantity: 0, listPrice: 0, katsayi: 1, discountPct: 0 },
      ];

      const stats = getQuoteStats(items);

      expect(stats.totalQuantity).toBe(10);
    });
  });
});
