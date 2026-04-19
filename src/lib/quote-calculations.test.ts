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

    it('discount comes from each SUBTOTAL row, not from the second argument', () => {
      const items: QuoteItem[] = [
        { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 20 },
        { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 10 },
      ];
      const result = calculateQuoteTotals(items, 999);
      expect(result.subtotal).toBe(1000);
      expect(result.discountTotal).toBe(100);
    });

    it('always reports vatTotal as 0 (VAT is not computed in quote totals)', () => {
      const items: QuoteItem[] = [
        { itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 20 },
      ];
      const result = calculateQuoteTotals(items, 10);
      expect(result.vatTotal).toBe(0);
    });

    it('calculates grand total as net-after-discount (no VAT added)', () => {
      const items: QuoteItem[] = [
        { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 20 },
        { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 10 },
      ];
      const result = calculateQuoteTotals(items, 0);
      // Subtotal: 1000, Discount: 100, Grand = Net: 900
      expect(result.grandTotal).toBe(900);
    });

    it('ignores individual item VAT rates in the grand total', () => {
      const items: QuoteItem[] = [
        { itemType: 'PRODUCT', quantity: 1, unitPrice: 100, discountPct: 0, vatRate: 20 },
        { itemType: 'PRODUCT', quantity: 1, unitPrice: 100, discountPct: 0, vatRate: 10 },
      ];
      const result = calculateQuoteTotals(items, 0);
      // Two items at 100 each => subtotal 200, grand total 200 (no VAT)
      expect(result.vatTotal).toBe(0);
      expect(result.grandTotal).toBe(200);
    });

    it('applies item-level discounts before overall discount (no VAT)', () => {
      const items: QuoteItem[] = [
        { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 10, vatRate: 20 },
        { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 5 },
      ];
      const result = calculateQuoteTotals(items, 0);
      // Item total after 10% item discount: 900
      // Subtotal: 900, Section 5% discount: 45, Net/Grand: 855
      expect(result.subtotal).toBe(900);
      expect(result.discountTotal).toBe(45);
      expect(result.vatTotal).toBe(0);
      expect(result.grandTotal).toBe(855);
    });

    it('returns zeros for empty items array', () => {
      const result = calculateQuoteTotals([], 0);
      expect(result.subtotal).toBe(0);
      expect(result.discountTotal).toBe(0);
      expect(result.vatTotal).toBe(0);
      expect(result.grandTotal).toBe(0);
    });

    it('includes SET items in subtotal and grandTotal (no VAT)', () => {
      const items: QuoteItem[] = [
        { itemType: 'PRODUCT', quantity: 2, unitPrice: 100, discountPct: 0, vatRate: 20 },
        { itemType: 'SET', quantity: 1, unitPrice: 500, discountPct: 0, vatRate: 20 },
      ];
      const result = calculateQuoteTotals(items, 0);
      // PRODUCT: 2*100 = 200, SET: 1*500 = 500 => subtotal = 700
      expect(result.subtotal).toBe(700);
      expect(result.vatTotal).toBe(0);
      expect(result.grandTotal).toBe(700);
    });

    it('applies overall discount to SET items along with other items (no VAT)', () => {
      const items: QuoteItem[] = [
        { id: 'p1', itemType: 'PRODUCT', quantity: 1, unitPrice: 1000, discountPct: 0, vatRate: 20 },
        { id: 'set1', itemType: 'SET', quantity: 1, unitPrice: 500, discountPct: 10, vatRate: 20 },
        { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 10 },
      ];
      const result = calculateQuoteTotals(items, 0); // 10% section discount
      // PRODUCT: 1*1000 = 1000, SET: 1*500*(1-0.10) = 450 => subtotal = 1450
      expect(result.subtotal).toBe(1450);
      // Section 10% discount: 145
      expect(result.discountTotal).toBe(145);
      // Net/Grand: 1305 (VAT skipped)
      expect(result.vatTotal).toBe(0);
      expect(result.grandTotal).toBe(1305);
    });

    it('calculates correctly when only SET items are present (no VAT)', () => {
      const items: QuoteItem[] = [
        { itemType: 'SET', quantity: 1, unitPrice: 2000, discountPct: 0, vatRate: 20 },
      ];
      const result = calculateQuoteTotals(items, 0);
      expect(result.subtotal).toBe(2000);
      expect(result.vatTotal).toBe(0);
      expect(result.grandTotal).toBe(2000);
    });

    // ─── Per-SUBTOTAL discounts (sectionDiscountPct) ─────────────
    describe('with per-subtotal discounts', () => {
      it('applies a single section discount: section net = gross × (1 - pct/100)', () => {
        const items: QuoteItem[] = [
          { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 5 },
        ];
        const result = calculateQuoteTotals(items, 0);
        expect(result.subtotal).toBe(1000);
        expect(result.discountTotal).toBe(50);
        expect(result.grandTotal).toBe(950);
      });

      it('applies different discounts to different sections independently', () => {
        const items: QuoteItem[] = [
          { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 5 },
          { id: 'p2', itemType: 'PRODUCT', quantity: 5, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'sub-b', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 10 },
        ];
        const result = calculateQuoteTotals(items, 0);
        expect(result.subtotal).toBe(1500);
        expect(result.discountTotal).toBe(100);
        expect(result.grandTotal).toBe(1400);
      });

      it('section with zero or null discount contributes gross to the grand total', () => {
        const items: QuoteItem[] = [
          { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 0 },
          { id: 'p2', itemType: 'PRODUCT', quantity: 5, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'sub-b', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0 },
        ];
        const result = calculateQuoteTotals(items, 0);
        expect(result.discountTotal).toBe(0);
        expect(result.grandTotal).toBe(1500);
      });

      it('price-labeled rows are excluded from the section discount base', () => {
        const items: QuoteItem[] = [
          { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'p2', itemType: 'PRODUCT', quantity: 1, unitPrice: 9999, discountPct: 0, vatRate: 0, priceLabel: 'TARAFINIZCA SAĞLANACAKTIR' },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 10 },
        ];
        const result = calculateQuoteTotals(items, 0);
        expect(result.subtotal).toBe(1000);
        expect(result.discountTotal).toBe(100);
        expect(result.grandTotal).toBe(900);
      });

      it('orphan priced items above the first SUBTOTAL are absorbed into the first section', () => {
        const items: QuoteItem[] = [
          { id: 'orphan', itemType: 'PRODUCT', quantity: 1, unitPrice: 200, discountPct: 0, vatRate: 0 },
          { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 10 },
        ];
        const result = calculateQuoteTotals(items, 0);
        expect(result.subtotal).toBe(1200);
        expect(result.discountTotal).toBe(120);
        expect(result.grandTotal).toBe(1080);
      });

      it('priced items BELOW the last SUBTOTAL are orphans (NOT discounted)', () => {
        const items: QuoteItem[] = [
          { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 10 },
          { id: 'orphan', itemType: 'PRODUCT', quantity: 1, unitPrice: 500, discountPct: 0, vatRate: 0 },
        ];
        const result = calculateQuoteTotals(items, 0);
        expect(result.subtotal).toBe(1500);
        expect(result.discountTotal).toBe(100);
        expect(result.grandTotal).toBe(1400);
      });

      it('quote with zero SUBTOTAL rows applies no discount (grand = subtotal)', () => {
        const items: QuoteItem[] = [
          { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'p2', itemType: 'PRODUCT', quantity: 5, unitPrice: 100, discountPct: 0, vatRate: 0 },
        ];
        const result = calculateQuoteTotals(items, 0);
        expect(result.subtotal).toBe(1500);
        expect(result.discountTotal).toBe(0);
        expect(result.grandTotal).toBe(1500);
      });

      it('item-level discount stacks with section discount (item first, then section)', () => {
        const items: QuoteItem[] = [
          { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 20, vatRate: 0 },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 10 },
        ];
        const result = calculateQuoteTotals(items, 0);
        expect(result.subtotal).toBe(800);
        expect(result.discountTotal).toBe(80);
        expect(result.grandTotal).toBe(720);
      });

      it('TRY set inside a EUR section applies section discount on the converted sum', () => {
        const ctx = { quoteCurrency: 'EUR', baseForeignRate: 50 };
        const items: QuoteItem[] = [
          { id: 'p1', itemType: 'PRODUCT', quantity: 1, unitPrice: 400, discountPct: 0, vatRate: 0 },
          { id: 'set1', itemType: 'SET', quantity: 1, unitPrice: 5000, discountPct: 0, vatRate: 0, currency: 'TRY' },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 20 },
        ];
        const result = calculateQuoteTotals(items, 0, ctx);
        expect(result.subtotal).toBe(500);
        expect(result.discountTotal).toBe(100);
        expect(result.grandTotal).toBe(400);
      });

      it('empty section (SUBTOTAL with no items before it since the previous SUBTOTAL) computes 0 discount', () => {
        const items: QuoteItem[] = [
          { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 5 },
          { id: 'sub-b', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 99 },
        ];
        const result = calculateQuoteTotals(items, 0);
        expect(result.subtotal).toBe(1000);
        expect(result.discountTotal).toBe(50);
        expect(result.grandTotal).toBe(950);
      });

      it('rounding: section discount rounded to 2 decimals, consistent with grand total', () => {
        const items: QuoteItem[] = [
          { id: 'p1', itemType: 'PRODUCT', quantity: 1, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 33.33 },
        ];
        const result = calculateQuoteTotals(items, 0);
        expect(result.discountTotal).toBe(33.33);
        expect(result.grandTotal).toBe(66.67);
      });
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

    it('applies per-section discount to revenue (items inside a discounted section are discounted)', () => {
      const items = [
        { id: 'p1', totalPrice: 1000, costPrice: 600, quantity: 1, itemType: 'PRODUCT' },
        { id: 'sub-a', totalPrice: 0, costPrice: null, quantity: 0, itemType: 'SUBTOTAL', sectionDiscountPct: 10 },
      ];
      const result = calculateQuoteProfitSummary(items);
      expect(result.totalRevenue).toBe(900);
      expect(result.totalCost).toBe(600);
      expect(result.totalProfit).toBe(300);
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

  describe('Mixed-currency SETs (set currency)', () => {
    // All tests here use the same quote setup: EUR quote, base EUR/TRY
    // rate of 50 (protected rate 52.5 at 5% protection). A TRY-priced
    // SET therefore contributes TRY/50 = EUR to the grand total, with
    // NO protection uplift applied to that contribution.
    const ctx = { quoteCurrency: 'EUR', baseForeignRate: 50 };

    it('TRY set in EUR quote converts at base rate (no protection)', () => {
      const items: QuoteItem[] = [
        // EUR product: 1 × 400 = 400 EUR
        { id: 'p1', itemType: 'PRODUCT', quantity: 1, unitPrice: 400, discountPct: 0, vatRate: 20 },
        // TRY set: 1 × 5000 TRY = 100 EUR at rate 50
        { id: 'set1', itemType: 'SET', quantity: 1, unitPrice: 5000, discountPct: 0, vatRate: 20, currency: 'TRY' },
      ];
      const result = calculateQuoteTotals(items, 0, null, ctx);
      // subtotal = 400 EUR + 100 EUR (converted from 5000 TRY) = 500
      expect(result.subtotal).toBe(500);
      expect(result.grandTotal).toBe(500);
    });

    it('set matching quote currency is NOT converted', () => {
      const items: QuoteItem[] = [
        { id: 'p1', itemType: 'PRODUCT', quantity: 1, unitPrice: 400, discountPct: 0, vatRate: 20 },
        // EUR set (matches quote): stays at face value
        { id: 'set1', itemType: 'SET', quantity: 1, unitPrice: 200, discountPct: 0, vatRate: 20, currency: 'EUR' },
      ];
      const result = calculateQuoteTotals(items, 0, null, ctx);
      expect(result.subtotal).toBe(600);
    });

    it('null currency inherits quote currency (no conversion)', () => {
      const items: QuoteItem[] = [
        // Legacy set with no override — treated as EUR
        { id: 'set1', itemType: 'SET', quantity: 1, unitPrice: 300, discountPct: 0, vatRate: 20 },
      ];
      const result = calculateQuoteTotals(items, 0, null, ctx);
      expect(result.subtotal).toBe(300);
    });

    it('per-section discount applies on the converted subtotal', () => {
      const items: QuoteItem[] = [
        { id: 'p1', itemType: 'PRODUCT', quantity: 1, unitPrice: 400, discountPct: 0, vatRate: 0 },
        { id: 'set1', itemType: 'SET', quantity: 1, unitPrice: 5000, discountPct: 0, vatRate: 0, currency: 'TRY' },
        { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 10 },
      ];
      const result = calculateQuoteTotals(items, 0, ctx);
      expect(result.subtotal).toBe(500);
      expect(result.discountTotal).toBe(50);
      expect(result.grandTotal).toBe(450);
    });

    it('legacy single-currency path (no ctx) still honors section discount', () => {
      const items: QuoteItem[] = [
        { id: 'p1', itemType: 'PRODUCT', quantity: 1, unitPrice: 1000, discountPct: 0, vatRate: 0 },
        { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 5 },
      ];
      const result = calculateQuoteTotals(items, 0);
      expect(result.grandTotal).toBe(950);
    });

    it('TRY-quote baseline: ctx with baseForeignRate=1 behaves as identity', () => {
      const tryCtx = { quoteCurrency: 'TRY', baseForeignRate: 1 };
      const items: QuoteItem[] = [
        { id: 'p1', itemType: 'PRODUCT', quantity: 1, unitPrice: 1000, discountPct: 0, vatRate: 20 },
        { id: 'set1', itemType: 'SET', quantity: 1, unitPrice: 500, discountPct: 0, vatRate: 20, currency: 'TRY' },
      ];
      const result = calculateQuoteTotals(items, 0, null, tryCtx);
      expect(result.subtotal).toBe(1500);
    });

    it('legacy single-currency path: no ctx argument behaves unchanged', () => {
      const items: QuoteItem[] = [
        // `currency` on the item is ignored without ctx — older callers
        // don't know about mixed currency, and their totals must not
        // suddenly shift.
        { id: 'set1', itemType: 'SET', quantity: 1, unitPrice: 5000, discountPct: 0, vatRate: 20, currency: 'TRY' },
      ];
      const result = calculateQuoteTotals(items, 0);
      expect(result.subtotal).toBe(5000);
    });

    it('profit summary: TRY set children have their cost converted to quote currency', () => {
      // 100 EUR revenue + 5000 TRY set revenue (=100 EUR at rate 50)
      // Costs: 60 EUR product + 2500 TRY child of the set (=50 EUR converted)
      const items = [
        { id: 'p1', totalPrice: 100, costPrice: 60, quantity: 1, itemType: 'PRODUCT', parentItemId: null, currency: null },
        { id: 'set1', totalPrice: 5000, costPrice: null, quantity: 1, itemType: 'SET', parentItemId: null, currency: 'TRY' },
        { id: 'child1', totalPrice: 2500, costPrice: 2500, quantity: 1, itemType: 'PRODUCT', parentItemId: 'set1', currency: null },
      ];
      const result = calculateQuoteProfitSummary(items, 0, ctx);
      // Revenue: 100 + (5000/50) = 200 EUR
      // Cost: 60 + (2500/50) = 110 EUR (child inherits parent's TRY currency)
      expect(result.totalRevenue).toBe(200);
      expect(result.totalCost).toBe(110);
      expect(result.totalProfit).toBe(90);
    });
  });
});
