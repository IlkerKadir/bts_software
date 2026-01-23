import { describe, it, expect } from 'vitest';
import { generateQuoteHtml, QuoteDataForPdf } from './quote-template';

describe('Quote PDF Template', () => {
  const mockQuoteData: QuoteDataForPdf = {
    quote: {
      quoteNumber: 'BTS-2026-0001',
      subject: 'Yangin Algilama Sistemi',
      createdAt: new Date('2026-01-15'),
      validUntil: new Date('2026-02-15'),
      currency: 'EUR',
      notes: 'Montaj dahildir.',
    },
    company: {
      name: 'ABC Insaat A.S.',
      address: 'Istanbul, Turkiye',
      taxId: '1234567890',
    },
    project: {
      name: 'Merkez Ofis Binasi',
      location: 'Maslak, Istanbul',
    },
    items: [
      {
        itemType: 'HEADER',
        description: 'Algilama Ekipmanlari',
        quantity: 0,
        unit: '',
        unitPrice: 0,
        discountPct: 0,
        totalPrice: 0,
        vatRate: 0,
      },
      {
        itemType: 'PRODUCT',
        code: 'SD-001',
        brand: 'Siemens',
        description: 'Duman Dedektoru',
        quantity: 50,
        unit: 'Adet',
        unitPrice: 85.50,
        discountPct: 10,
        totalPrice: 3847.50,
        vatRate: 20,
      },
      {
        itemType: 'NOTE',
        description: 'Kurulum dahildir',
        quantity: 0,
        unit: '',
        unitPrice: 0,
        discountPct: 0,
        totalPrice: 0,
        vatRate: 0,
      },
    ],
    totals: {
      subtotal: 3847.50,
      totalDiscount: 427.50,
      totalVat: 769.50,
      grandTotal: 4617.00,
    },
    commercialTerms: [
      { category: 'payment', content: 'Siparis ile %50, teslimde %50' },
      { category: 'delivery', content: '4-6 hafta' },
    ],
  };

  describe('generateQuoteHtml', () => {
    it('generates valid HTML with quote number', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('BTS-2026-0001');
      expect(html).toContain('<!DOCTYPE html>');
    });

    it('includes company information', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('ABC Insaat A.S.');
      expect(html).toContain('1234567890');
    });

    it('includes project information', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('Merkez Ofis Binasi');
      expect(html).toContain('Maslak, Istanbul');
    });

    it('renders product items with pricing', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('Duman Dedektoru');
      expect(html).toContain('Siemens');
      expect(html).toContain('50');
    });

    it('renders header items', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('Algilama Ekipmanlari');
    });

    it('renders note items', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('Kurulum dahildir');
    });

    it('includes totals section', () => {
      const html = generateQuoteHtml(mockQuoteData);

      // grandTotal formatted in Turkish locale (4.617,00 or similar)
      expect(html).toContain('4.617');
    });

    it('includes commercial terms', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('Siparis ile %50');
      expect(html).toContain('4-6 hafta');
    });

    it('formats dates in Turkish locale', () => {
      const html = generateQuoteHtml(mockQuoteData);

      // Turkish date format: 15.01.2026
      expect(html).toContain('15.01.2026');
    });

    it('formats currency correctly for EUR', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('\u20AC'); // Euro symbol
    });

    it('formats currency correctly for TRY', () => {
      const dataWithTry = {
        ...mockQuoteData,
        quote: { ...mockQuoteData.quote, currency: 'TRY' },
      };
      const html = generateQuoteHtml(dataWithTry);

      expect(html).toContain('\u20BA'); // Turkish Lira symbol
    });

    it('handles missing optional fields gracefully', () => {
      const minimalData: QuoteDataForPdf = {
        quote: {
          quoteNumber: 'BTS-2026-0002',
          subject: null,
          createdAt: new Date('2026-01-20'),
          validUntil: null,
          currency: 'EUR',
          notes: null,
        },
        company: {
          name: 'Test Company',
          address: null,
          taxId: null,
        },
        project: null,
        items: [],
        totals: {
          subtotal: 0,
          totalDiscount: 0,
          totalVat: 0,
          grandTotal: 0,
        },
        commercialTerms: [],
      };

      const html = generateQuoteHtml(minimalData);

      expect(html).toContain('BTS-2026-0002');
      expect(html).toContain('Test Company');
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('null');
    });

    it('escapes HTML special characters', () => {
      const dataWithSpecialChars: QuoteDataForPdf = {
        ...mockQuoteData,
        company: {
          ...mockQuoteData.company,
          name: 'Test <Company> & "Sons"',
        },
      };

      const html = generateQuoteHtml(dataWithSpecialChars);

      expect(html).not.toContain('<Company>');
      expect(html).toContain('&lt;Company&gt;');
      expect(html).toContain('&amp;');
    });
  });
});
