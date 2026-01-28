import { describe, it, expect } from 'vitest';
import { quoteQuerySchema, createQuoteSchema, quoteItemSchema } from './quote';

describe('Quote Validation Schemas', () => {
  describe('quoteQuerySchema', () => {
    it('accepts valid query with all fields', () => {
      const result = quoteQuerySchema.safeParse({
        search: 'test',
        companyId: 'company-123',
        status: 'TASLAK',
        page: '2',
        limit: '10',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(10);
      }
    });

    it('provides default values for page and limit', () => {
      const result = quoteQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });

    it('rejects invalid status', () => {
      const result = quoteQuerySchema.safeParse({
        status: 'INVALID_STATUS',
      });
      expect(result.success).toBe(false);
    });

    it('accepts all valid statuses', () => {
      const validStatuses = [
        'TASLAK',
        'ONAY_BEKLIYOR',
        'ONAYLANDI',
        'GONDERILDI',
        'TAKIPTE',
        'REVIZYON',
        'KAZANILDI',
        'KAYBEDILDI',
        'IPTAL',
      ];

      for (const status of validStatuses) {
        const result = quoteQuerySchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('createQuoteSchema', () => {
    it('accepts valid quote data', () => {
      const result = createQuoteSchema.safeParse({
        companyId: 'company-123',
        currency: 'EUR',
      });
      expect(result.success).toBe(true);
    });

    it('requires companyId', () => {
      const result = createQuoteSchema.safeParse({
        currency: 'EUR',
      });
      expect(result.success).toBe(false);
    });

    it('defaults currency to EUR', () => {
      const result = createQuoteSchema.safeParse({
        companyId: 'company-123',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe('EUR');
      }
    });

    it('defaults validityDays to 30', () => {
      const result = createQuoteSchema.safeParse({
        companyId: 'company-123',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.validityDays).toBe(30);
      }
    });

    it('accepts optional fields', () => {
      const result = createQuoteSchema.safeParse({
        companyId: 'company-123',
        projectId: 'project-456',
        subject: 'Fire alarm system',
        currency: 'USD',
        validityDays: 45,
        notes: 'Test notes',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.projectId).toBe('project-456');
        expect(result.data.subject).toBe('Fire alarm system');
        expect(result.data.validityDays).toBe(45);
      }
    });

    it('rejects invalid currency', () => {
      const result = createQuoteSchema.safeParse({
        companyId: 'company-123',
        currency: 'INVALID',
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid currencies', () => {
      const validCurrencies = ['EUR', 'USD', 'GBP', 'TRY'];
      for (const currency of validCurrencies) {
        const result = createQuoteSchema.safeParse({
          companyId: 'company-123',
          currency,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('quoteItemSchema', () => {
    it('accepts valid product item', () => {
      const result = quoteItemSchema.safeParse({
        itemType: 'PRODUCT',
        productId: 'product-123',
        description: 'Smoke Detector',
        quantity: 10,
        listPrice: 85.50,
        katsayi: 1.25,
        vatRate: 20,
      });
      expect(result.success).toBe(true);
    });

    it('accepts header item without prices', () => {
      const result = quoteItemSchema.safeParse({
        itemType: 'HEADER',
        description: 'Detection Equipment',
      });
      expect(result.success).toBe(true);
    });

    it('accepts note item', () => {
      const result = quoteItemSchema.safeParse({
        itemType: 'NOTE',
        description: 'Installation included',
      });
      expect(result.success).toBe(true);
    });

    it('requires description', () => {
      const result = quoteItemSchema.safeParse({
        itemType: 'PRODUCT',
        quantity: 10,
      });
      expect(result.success).toBe(false);
    });

    it('defaults quantity to 1', () => {
      const result = quoteItemSchema.safeParse({
        itemType: 'PRODUCT',
        description: 'Test',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantity).toBe(1);
      }
    });

    it('defaults katsayi to 1', () => {
      const result = quoteItemSchema.safeParse({
        itemType: 'PRODUCT',
        description: 'Test',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.katsayi).toBe(1);
      }
    });

    it('defaults discountPct to 0', () => {
      const result = quoteItemSchema.safeParse({
        itemType: 'PRODUCT',
        description: 'Test',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.discountPct).toBe(0);
      }
    });

    it('defaults vatRate to 20', () => {
      const result = quoteItemSchema.safeParse({
        itemType: 'PRODUCT',
        description: 'Test',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.vatRate).toBe(20);
      }
    });

    it('rejects negative quantity', () => {
      const result = quoteItemSchema.safeParse({
        itemType: 'PRODUCT',
        description: 'Test',
        quantity: -5,
      });
      expect(result.success).toBe(false);
    });

    it('rejects negative list price', () => {
      const result = quoteItemSchema.safeParse({
        itemType: 'PRODUCT',
        description: 'Test',
        listPrice: -100,
      });
      expect(result.success).toBe(false);
    });

    it('rejects discount over 100%', () => {
      const result = quoteItemSchema.safeParse({
        itemType: 'PRODUCT',
        description: 'Test',
        discountPct: 150,
      });
      expect(result.success).toBe(false);
    });
  });
});
