import { describe, it, expect } from 'vitest';
import {
  calculateUnitPrice,
  calculateItemTotal,
  calculateItemTotalWithVat,
  calculateQuoteTotals,
  calculateItemProfit,
  calculateQuoteProfitSummary,
  type QuoteItem,
} from './quote-calculations';

describe('Quote Calculations', () => {
  describe('calculateUnitPrice', () => {
    it('multiplies list price by katsayi coefficient', () => {
      const result = calculateUnitPrice(100, 1.25);
      expect(result).toBe(125);
    });

    it('returns list price when katsayi is 1', () => {
      const result = calculateUnitPrice(85.50, 1);
      expect(result).toBe(85.50);
    });

    it('handles decimal katsayi values', () => {
      const result = calculateUnitPrice(100, 1.375);
      expect(result).toBe(137.5);
    });

    it('handles zero list price', () => {
      const result = calculateUnitPrice(0, 1.5);
      expect(result).toBe(0);
    });
  });

  describe('calculateItemTotal', () => {
    it('calculates total without discount', () => {
      const result = calculateItemTotal({
        quantity: 10,
        unitPrice: 50,
        discountPct: 0,
      });
      expect(result).toBe(500);
    });

    it('applies discount percentage correctly', () => {
      const result = calculateItemTotal({
        quantity: 10,
        unitPrice: 100,
        discountPct: 10,
      });
      // 10 * 100 = 1000, 10% discount = 100, total = 900
      expect(result).toBe(900);
    });

    it('handles decimal quantities', () => {
      const result = calculateItemTotal({
        quantity: 2.5,
        unitPrice: 40,
        discountPct: 0,
      });
      expect(result).toBe(100);
    });

    it('handles 100% discount', () => {
      const result = calculateItemTotal({
        quantity: 10,
        unitPrice: 100,
        discountPct: 100,
      });
      expect(result).toBe(0);
    });
  });

  describe('calculateItemTotalWithVat', () => {
    it('calculates total including VAT', () => {
      const result = calculateItemTotalWithVat({
        quantity: 10,
        unitPrice: 100,
        discountPct: 0,
        vatRate: 20,
      });
      // 10 * 100 = 1000, VAT 20% = 200, total = 1200
      expect(result).toBe(1200);
    });

    it('applies discount before VAT calculation', () => {
      const result = calculateItemTotalWithVat({
        quantity: 10,
        unitPrice: 100,
        discountPct: 10,
        vatRate: 20,
      });
      // 10 * 100 = 1000, 10% discount = 100, after discount = 900
      // VAT 20% of 900 = 180, total = 1080
      expect(result).toBe(1080);
    });

    it('handles zero VAT rate', () => {
      const result = calculateItemTotalWithVat({
        quantity: 5,
        unitPrice: 50,
        discountPct: 0,
        vatRate: 0,
      });
      expect(result).toBe(250);
    });

    it('handles different VAT rates', () => {
      // Standard 20% VAT
      const result20 = calculateItemTotalWithVat({
        quantity: 1,
        unitPrice: 100,
        discountPct: 0,
        vatRate: 20,
      });
      expect(result20).toBe(120);

      // Reduced 10% VAT
      const result10 = calculateItemTotalWithVat({
        quantity: 1,
        unitPrice: 100,
        discountPct: 0,
        vatRate: 10,
      });
      expect(result10).toBe(110);
    });
  });

  describe('calculateQuoteTotals', () => {
    it('calculates subtotal from all product items', () => {
      const items: QuoteItem[] = [
        { itemType: 'PRODUCT', quantity: 2, unitPrice: 100, discountPct: 0, vatRate: 20 },
        { itemType: 'PRODUCT', quantity: 3, unitPrice: 50, discountPct: 0, vatRate: 20 },
      ];
      const result = calculateQuoteTotals(items, 0);
      // 2*100 + 3*50 = 200 + 150 = 350
      expect(result.subtotal).toBe(350);
    });

    it('excludes HEADER and NOTE items from calculation', () => {
      const items: QuoteItem[] = [
        { itemType: 'HEADER', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0 },
        { itemType: 'PRODUCT', quantity: 2, unitPrice: 100, discountPct: 0, vatRate: 20 },
        { itemType: 'NOTE', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0 },
      ];
      const result = calculateQuoteTotals(items, 0);
      expect(result.subtotal).toBe(200);
    });

    it('applies overall discount percentage', () => {
      const items: QuoteItem[] = [
        { itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 20 },
      ];
      const result = calculateQuoteTotals(items, 10); // 10% overall discount
      // Subtotal: 1000, Discount: 100, After discount: 900
      expect(result.subtotal).toBe(1000);
      expect(result.discountTotal).toBe(100);
    });

    it('calculates VAT on discounted amount', () => {
      const items: QuoteItem[] = [
        { itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 20 },
      ];
      const result = calculateQuoteTotals(items, 10);
      // After discount: 900, VAT 20%: 180
      expect(result.vatTotal).toBe(180);
    });

    it('calculates grand total correctly', () => {
      const items: QuoteItem[] = [
        { itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 20 },
      ];
      const result = calculateQuoteTotals(items, 10);
      // Subtotal: 1000, Discount: 100, Net: 900, VAT: 180, Grand: 1080
      expect(result.grandTotal).toBe(1080);
    });

    it('handles items with different VAT rates', () => {
      const items: QuoteItem[] = [
        { itemType: 'PRODUCT', quantity: 1, unitPrice: 100, discountPct: 0, vatRate: 20 },
        { itemType: 'PRODUCT', quantity: 1, unitPrice: 100, discountPct: 0, vatRate: 10 },
      ];
      const result = calculateQuoteTotals(items, 0);
      // Item 1: 100 + 20 VAT = 120
      // Item 2: 100 + 10 VAT = 110
      // Total VAT: 30, Grand Total: 230
      expect(result.vatTotal).toBe(30);
      expect(result.grandTotal).toBe(230);
    });

    it('applies item-level discounts before overall discount', () => {
      const items: QuoteItem[] = [
        { itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 10, vatRate: 20 },
      ];
      const result = calculateQuoteTotals(items, 5);
      // Item total after 10% item discount: 900
      // Subtotal: 900
      // Overall 5% discount: 45
      // Net: 855
      // VAT 20%: 171
      // Grand: 1026
      expect(result.subtotal).toBe(900);
      expect(result.discountTotal).toBe(45);
      expect(result.vatTotal).toBe(171);
      expect(result.grandTotal).toBe(1026);
    });

    it('returns zeros for empty items array', () => {
      const result = calculateQuoteTotals([], 0);
      expect(result.subtotal).toBe(0);
      expect(result.discountTotal).toBe(0);
      expect(result.vatTotal).toBe(0);
      expect(result.grandTotal).toBe(0);
    });

    it('includes SET items in subtotal, VAT, and grandTotal', () => {
      const items: QuoteItem[] = [
        { itemType: 'PRODUCT', quantity: 2, unitPrice: 100, discountPct: 0, vatRate: 20 },
        { itemType: 'SET', quantity: 1, unitPrice: 500, discountPct: 0, vatRate: 20 },
      ];
      const result = calculateQuoteTotals(items, 0);
      // PRODUCT: 2*100 = 200, SET: 1*500 = 500 => subtotal = 700
      expect(result.subtotal).toBe(700);
      // VAT 20% of 700 = 140
      expect(result.vatTotal).toBe(140);
      // Grand: 700 + 140 = 840
      expect(result.grandTotal).toBe(840);
    });

    it('applies overall discount to SET items along with other items', () => {
      const items: QuoteItem[] = [
        { itemType: 'PRODUCT', quantity: 1, unitPrice: 1000, discountPct: 0, vatRate: 20 },
        { itemType: 'SET', quantity: 1, unitPrice: 500, discountPct: 10, vatRate: 20 },
      ];
      const result = calculateQuoteTotals(items, 10); // 10% overall discount
      // PRODUCT: 1*1000 = 1000, SET: 1*500*(1-0.10) = 450 => subtotal = 1450
      expect(result.subtotal).toBe(1450);
      // Overall 10% discount: 145
      expect(result.discountTotal).toBe(145);
      // Net: 1305, VAT 20%: 261, Grand: 1566
      expect(result.vatTotal).toBe(261);
      expect(result.grandTotal).toBe(1566);
    });

    it('calculates correctly when only SET items are present', () => {
      const items: QuoteItem[] = [
        { itemType: 'SET', quantity: 1, unitPrice: 2000, discountPct: 0, vatRate: 20 },
      ];
      const result = calculateQuoteTotals(items, 0);
      expect(result.subtotal).toBe(2000);
      expect(result.vatTotal).toBe(400);
      expect(result.grandTotal).toBe(2400);
    });
  });

  describe('calculateItemProfit', () => {
    it('calculates profit for a standard item', () => {
      const result = calculateItemProfit(1000, 600, 1);
      expect(result.cost).toBe(600);
      expect(result.revenue).toBe(1000);
      expect(result.profit).toBe(400);
      expect(result.marginPct).toBe(40);
    });

    it('handles multiple quantity', () => {
      const result = calculateItemProfit(500, 30, 10);
      expect(result.cost).toBe(300);
      expect(result.revenue).toBe(500);
      expect(result.profit).toBe(200);
      expect(result.marginPct).toBe(40);
    });

    it('handles null costPrice', () => {
      const result = calculateItemProfit(1000, null, 1);
      expect(result.cost).toBe(0);
      expect(result.profit).toBe(1000);
      expect(result.marginPct).toBe(100);
    });

    it('handles zero revenue', () => {
      const result = calculateItemProfit(0, 100, 1);
      expect(result.marginPct).toBe(0);
    });

    it('handles negative profit (loss)', () => {
      const result = calculateItemProfit(100, 150, 1);
      expect(result.profit).toBe(-50);
      expect(result.marginPct).toBe(-50);
    });
  });

  describe('calculateQuoteProfitSummary', () => {
    it('includes SET items in both revenue and cost', () => {
      const items = [
        { totalPrice: 1000, costPrice: 600, quantity: 1, itemType: 'PRODUCT' },
        { totalPrice: 500, costPrice: 300, quantity: 1, itemType: 'PRODUCT' },
        { totalPrice: 200, costPrice: null, quantity: 1, itemType: 'SET' },
      ];
      const result = calculateQuoteProfitSummary(items);
      // revenue = 1000 + 500 + 200 = 1700
      // cost = 600 + 300 + 0 = 900
      expect(result.totalRevenue).toBe(1700);
      expect(result.totalCost).toBe(900);
      expect(result.totalProfit).toBe(800);
      expect(result.overallMarginPct).toBe(47.06);
    });

    it('SET parent contributes revenue but not cost; sub-items contribute cost', () => {
      const items = [
        { totalPrice: 1000, costPrice: 600, quantity: 1, itemType: 'PRODUCT', parentItemId: null },
        { totalPrice: 300, costPrice: null, quantity: 1, itemType: 'SET', parentItemId: null },  // SET parent — revenue only
        { totalPrice: 150, costPrice: 50, quantity: 1, itemType: 'PRODUCT', parentItemId: 'set1' }, // sub-item — cost only
        { totalPrice: 150, costPrice: 50, quantity: 1, itemType: 'PRODUCT', parentItemId: 'set1' }, // sub-item — cost only
      ];
      const result = calculateQuoteProfitSummary(items);
      // Revenue: 1000 (PRODUCT) + 300 (SET parent) = 1300 (sub-items excluded from revenue)
      // Cost: 600 (PRODUCT) + 50 + 50 (sub-items) = 700 (SET parent excluded from cost)
      expect(result.totalRevenue).toBe(1300);
      expect(result.totalCost).toBe(700);
      expect(result.totalProfit).toBe(600);
    });

    it('applies overall discount to revenue', () => {
      const items = [
        { totalPrice: 1000, costPrice: 600, quantity: 1, itemType: 'PRODUCT' },
      ];
      const result = calculateQuoteProfitSummary(items, 10); // 10% overall discount
      // Revenue after 10% discount: 1000 * 0.9 = 900
      expect(result.totalRevenue).toBe(900);
      expect(result.totalCost).toBe(600);
      expect(result.totalProfit).toBe(300);
      // 300 / 900 * 100 = 33.33
      expect(result.overallMarginPct).toBe(33.33);
    });

    it('excludes HEADER and NOTE items from calculations', () => {
      const items = [
        { totalPrice: 1000, costPrice: 600, quantity: 1, itemType: 'PRODUCT' },
        { totalPrice: 0, costPrice: null, quantity: 1, itemType: 'HEADER' },
        { totalPrice: 0, costPrice: null, quantity: 1, itemType: 'NOTE' },
      ];
      const result = calculateQuoteProfitSummary(items);
      expect(result.totalRevenue).toBe(1000);
      expect(result.totalCost).toBe(600);
      expect(result.totalProfit).toBe(400);
    });

    it('handles empty items array', () => {
      const result = calculateQuoteProfitSummary([]);
      expect(result.totalRevenue).toBe(0);
      expect(result.totalCost).toBe(0);
      expect(result.totalProfit).toBe(0);
      expect(result.overallMarginPct).toBe(0);
    });
  });
});
