import { describe, it, expect } from 'vitest';
import {
  checkQuoteApproval,
  QuoteItemForApproval,
  ApprovalCheckResult,
} from './quote-approval';

describe('Quote Approval Check', () => {
  describe('checkQuoteApproval', () => {
    it('returns approved for small quote with normal terms', () => {
      const items: QuoteItemForApproval[] = [
        { itemType: 'PRODUCT', quantity: 5, listPrice: 100, katsayi: 1.2, discountPct: 10 },
        { itemType: 'PRODUCT', quantity: 10, listPrice: 50, katsayi: 1.1, discountPct: 5 },
      ];

      const result = checkQuoteApproval(items);

      expect(result.needsApproval).toBe(false);
      expect(result.reasons).toEqual([]);
    });

    it('flags high value quotes', () => {
      const items: QuoteItemForApproval[] = [
        { itemType: 'PRODUCT', quantity: 100, listPrice: 1000, katsayi: 1.0, discountPct: 0 },
      ];

      const result = checkQuoteApproval(items);

      expect(result.needsApproval).toBe(true);
      expect(result.reasons).toContain('HIGH_VALUE');
      expect(result.metrics.totalValue).toBe(100000);
    });

    it('flags high discount quotes', () => {
      const items: QuoteItemForApproval[] = [
        { itemType: 'PRODUCT', quantity: 10, listPrice: 100, katsayi: 1.0, discountPct: 30 },
      ];

      const result = checkQuoteApproval(items);

      expect(result.needsApproval).toBe(true);
      expect(result.reasons).toContain('HIGH_DISCOUNT');
      expect(result.metrics.maxDiscountPct).toBe(30);
    });

    it('flags low katsayi quotes', () => {
      const items: QuoteItemForApproval[] = [
        { itemType: 'PRODUCT', quantity: 10, listPrice: 100, katsayi: 0.8, discountPct: 5 },
      ];

      const result = checkQuoteApproval(items);

      expect(result.needsApproval).toBe(true);
      expect(result.reasons).toContain('LOW_KATSAYI');
      expect(result.metrics.minKatsayi).toBe(0.8);
    });

    it('flags multiple issues', () => {
      // Total value: 200 * 500 * 0.8 * 0.65 = 52000 (>50000 = HIGH_VALUE)
      // Discount: 35% (>20% = HIGH_DISCOUNT)
      // Katsayi: 0.8 (<0.9 = LOW_KATSAYI)
      const items: QuoteItemForApproval[] = [
        { itemType: 'PRODUCT', quantity: 200, listPrice: 500, katsayi: 0.8, discountPct: 35 },
      ];

      const result = checkQuoteApproval(items);

      expect(result.needsApproval).toBe(true);
      expect(result.reasons).toContain('HIGH_VALUE');
      expect(result.reasons).toContain('HIGH_DISCOUNT');
      expect(result.reasons).toContain('LOW_KATSAYI');
      expect(result.reasons).toHaveLength(3);
    });

    it('ignores non-product items for approval check', () => {
      const items: QuoteItemForApproval[] = [
        { itemType: 'HEADER', quantity: 0, listPrice: 0, katsayi: 1, discountPct: 0 },
        { itemType: 'PRODUCT', quantity: 5, listPrice: 100, katsayi: 1.2, discountPct: 10 },
        { itemType: 'NOTE', quantity: 0, listPrice: 0, katsayi: 1, discountPct: 0 },
      ];

      const result = checkQuoteApproval(items);

      expect(result.needsApproval).toBe(false);
      // Should only count the product item value
      expect(result.metrics.totalValue).toBe(540); // 5 * 100 * 1.2 * 0.9
    });

    it('respects custom thresholds', () => {
      const items: QuoteItemForApproval[] = [
        { itemType: 'PRODUCT', quantity: 100, listPrice: 100, katsayi: 1.0, discountPct: 15 },
      ];

      // With default thresholds, this would NOT need approval
      const defaultResult = checkQuoteApproval(items);
      expect(defaultResult.needsApproval).toBe(false);

      // With custom lower thresholds, it SHOULD need approval
      const customResult = checkQuoteApproval(items, {
        maxValueWithoutApproval: 5000,
        maxDiscountPctWithoutApproval: 10,
        minKatsayiWithoutApproval: 1.1,
      });
      expect(customResult.needsApproval).toBe(true);
      expect(customResult.reasons).toContain('HIGH_VALUE');
      expect(customResult.reasons).toContain('HIGH_DISCOUNT');
      expect(customResult.reasons).toContain('LOW_KATSAYI');
    });

    it('returns metrics even when no approval needed', () => {
      const items: QuoteItemForApproval[] = [
        { itemType: 'PRODUCT', quantity: 5, listPrice: 100, katsayi: 1.2, discountPct: 10 },
      ];

      const result = checkQuoteApproval(items);

      expect(result.needsApproval).toBe(false);
      expect(result.metrics.totalValue).toBe(540);
      expect(result.metrics.maxDiscountPct).toBe(10);
      expect(result.metrics.minKatsayi).toBe(1.2);
    });

    it('handles empty item list', () => {
      const result = checkQuoteApproval([]);

      expect(result.needsApproval).toBe(false);
      expect(result.reasons).toEqual([]);
      expect(result.metrics.totalValue).toBe(0);
    });

    it('provides localized reason labels in Turkish', () => {
      const items: QuoteItemForApproval[] = [
        { itemType: 'PRODUCT', quantity: 100, listPrice: 1000, katsayi: 1.0, discountPct: 0 },
      ];

      const result = checkQuoteApproval(items);

      expect(result.reasonLabels).toBeDefined();
      expect(result.reasonLabels.length).toBeGreaterThan(0);
      // Turkish label for HIGH_VALUE
      expect(result.reasonLabels[0]).toContain('Teklif tutarı');
    });

    it('provides localized reason labels in English', () => {
      const items: QuoteItemForApproval[] = [
        { itemType: 'PRODUCT', quantity: 100, listPrice: 1000, katsayi: 1.0, discountPct: 0 },
      ];

      const result = checkQuoteApproval(items, undefined, 'en');

      expect(result.reasonLabels).toBeDefined();
      expect(result.reasonLabels.length).toBeGreaterThan(0);
      // English label for HIGH_VALUE
      expect(result.reasonLabels[0]).toContain('exceeds');
    });
  });
});
