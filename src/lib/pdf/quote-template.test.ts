import { describe, it, expect } from 'vitest';
import { generateQuoteHtml, QuoteDataForPdf, formatCurrency, escapeHtml } from './quote-template';

describe('Quote PDF Template — Proforma Fatura', () => {
  const mockQuoteData: QuoteDataForPdf = {
    quote: {
      quoteNumber: 'SA0065-SON',
      refNo: 'REF-2026-001',
      subject: 'Yangin Algilama Sistemi',
      createdAt: new Date('2026-01-15'),
      validUntil: new Date('2026-02-15'),
      currency: 'EUR',
      language: 'TR',
      notes: null,
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
      {
        itemType: 'PRODUCT',
        code: 'FP-002',
        brand: 'Siemens',
        description: 'Yangin Paneli',
        quantity: 0,
        unit: 'Adet',
        unitPrice: 1200,
        discountPct: 0,
        totalPrice: 0,
        vatRate: 20,
      },
      {
        itemType: 'SUBTOTAL',
        description: '',
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
      { category: 'odeme', content: 'Siparis ile %50, teslimde %50' },
      { category: 'teslimat', content: '4-6 hafta' },
      { category: 'garanti', content: '2 yil' },
    ],
    notes: [
      { text: 'Montaj dahildir.', sortOrder: 1, highlight: false },
      { text: 'Fiyatlar KDV haricdir.', sortOrder: 2, highlight: false },
    ],
    headerBase64: 'data:image/png;base64,TESTHEADERDATA',
  };

  describe('generateQuoteHtml', () => {
    it('generates valid HTML with PROFORMA FATURA title for TR language', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('PROFORMA FATURA');
      expect(html).toContain('SA0065-SON');
    });

    it('generates PROFORMA INVOICE title for EN language', () => {
      const dataEN = {
        ...mockQuoteData,
        quote: { ...mockQuoteData.quote, language: 'EN' },
      };
      const html = generateQuoteHtml(dataEN);

      expect(html).toContain('PROFORMA INVOICE');
      expect(html).not.toContain('PROFORMA FATURA');
    });

    it('has 5-column table (POZ NO, AÇIKLAMA, MİKTAR, BİRİM FİYAT, TOPLAM FİYAT)', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('POZ NO');
      expect(html).toContain('AÇIKLAMA');
      expect(html).toContain('MİKTAR');
      expect(html).toContain('BİRİM FİYAT');
      expect(html).toContain('TOPLAM FİYAT');
    });

    it('uses 6.5pt font for main content', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('font-size:6.5pt');
    });

    it('uses 7.2pt font for commercial terms', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('font-size:7.2pt');
    });

    it('includes refNo in client info box', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('Ref.No');
      expect(html).toContain('REF-2026-001');
    });

    it('omits refNo row when not provided', () => {
      const dataNoRef = {
        ...mockQuoteData,
        quote: { ...mockQuoteData.quote, refNo: null },
      };
      const html = generateQuoteHtml(dataNoRef);

      expect(html).not.toContain('Ref.No');
    });

    it('renders currency with symbol AFTER number', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('3.847,50 \u20AC');
    });

    it('renders HEADER items with green background (#C6E0B4)', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('#C6E0B4');
      expect(html).toContain('Algilama Ekipmanlari');
    });

    it('renders NOTE items with "NOT:" label in bold', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('NOT:');
      expect(html).toContain('Kurulum dahildir');
    });

    it('renders OPSİYONEL for quantity=0 items without sequential number', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('OPSİYONEL');
    });

    it('computes SUBTOTAL section sums', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('Ara Toplam');
      expect(html).toContain('3.847,50');
    });

    it('renders system total label with currency name and 1.2pt borders', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('SİSTEM GENEL TOPLAMI (EURO)');
      expect(html).toContain('4.617,00');
      expect(html).toContain('sys-total-label');
      expect(html).toContain('sys-total-val');
    });

    it('renders SET items as regular rows with POZ number', () => {
      const dataWithSet: QuoteDataForPdf = {
        ...mockQuoteData,
        items: [
          ...mockQuoteData.items,
          {
            itemType: 'SET',
            description: 'Montaj Set',
            quantity: 1,
            unit: 'Set',
            unitPrice: 5000,
            discountPct: 0,
            totalPrice: 5000,
            vatRate: 20,
          },
        ],
      };
      const html = generateQuoteHtml(dataWithSet);

      expect(html).toContain('Montaj Set');
      expect(html).toContain('SİSTEM GENEL TOPLAMI (EURO)');
    });

    it('renders commercial terms inside main table (no separate terms-tbl)', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('TİCARİ ŞARTLAR');
      expect(html).toContain('GARANTİ');
      expect(html).toContain('ÖDEME');
      expect(html).toContain('TESLİMAT');
      expect(html).not.toContain('terms-tbl');

      const garantiPos = html.indexOf('GARANTİ');
      const odemePos = html.indexOf('ÖDEME');
      const teslimatPos = html.indexOf('TESLİMAT');
      expect(garantiPos).toBeLessThan(odemePos);
      expect(odemePos).toBeLessThan(teslimatPos);
    });

    it('renders NOTLAR inside main table (no separate notes-tbl)', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('NOTLAR');
      expect(html).toContain('Montaj dahildir.');
      expect(html).toContain('Fiyatlar KDV haricdir.');
      expect(html).not.toContain('notes-tbl');
    });

    it('renders NOTES header for EN language', () => {
      const dataEN = {
        ...mockQuoteData,
        quote: { ...mockQuoteData.quote, language: 'EN' },
      };
      const html = generateQuoteHtml(dataEN);

      expect(html).toContain('NOTES');
    });

    it('renders header banner image when headerBase64 provided', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('<img src="data:image/png;base64,TESTHEADERDATA"');
      expect(html).toContain('hdr-img-cell');
    });

    it('falls back to logo when only logoBase64 provided', () => {
      const dataWithLogo = { ...mockQuoteData, headerBase64: undefined, logoBase64: 'data:image/png;base64,LOGODATA' };
      const html = generateQuoteHtml(dataWithLogo);

      expect(html).toContain('LOGODATA');
    });

    it('falls back to text when no images provided', () => {
      const dataNoImages = { ...mockQuoteData, headerBase64: undefined, logoBase64: undefined };
      const html = generateQuoteHtml(dataNoImages);

      expect(html).toContain('BTS YANGIN');
    });

    it('uses thead structure for page repetition', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('<thead>');
      expect(html).toContain('</thead>');
      expect(html).toContain('<tbody>');
      expect(html).toContain('table-header-group');
    });

    it('uses 1.2pt solid borders for header and system total', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('1.2pt solid black');
      expect(html).toContain('col-hdr');
    });

    it('item rows have no borders (matches client PDF format)', () => {
      const html = generateQuoteHtml(mockQuoteData);

      // Item rows should use border: none, only header/total rows have borders
      expect(html).toContain('border: none');
    });

    it('includes company information in client info box', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('ABC Insaat A.S.');
      expect(html).toContain('Istanbul, Turkiye');
    });

    it('includes project information', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('Merkez Ofis Binasi');
    });

    it('formats dates in Turkish locale', () => {
      const html = generateQuoteHtml(mockQuoteData);

      expect(html).toContain('15.01.2026');
    });

    it('formats currency correctly for TRY', () => {
      const dataWithTry = {
        ...mockQuoteData,
        quote: { ...mockQuoteData.quote, currency: 'TRY' },
      };
      const html = generateQuoteHtml(dataWithTry);

      expect(html).toContain('\u20BA');
      expect(html).toContain('SİSTEM GENEL TOPLAMI (TRY)');
    });

    it('handles missing optional fields gracefully', () => {
      const minimalData: QuoteDataForPdf = {
        quote: {
          quoteNumber: 'BTS-2026-0002',
          refNo: null,
          subject: null,
          createdAt: new Date('2026-01-20'),
          validUntil: null,
          currency: 'EUR',
          language: 'TR',
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
        notes: [],
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

    // ── New dynamic template tests ──────────────────────────────────

    it('renders info box with colspan=3 and colspan=2', () => {
      const html = generateQuoteHtml(mockQuoteData);
      expect(html).toContain('colspan="3"');
      expect(html).toContain('colspan="2"');
    });

    it('renders column widths 8.7/57.2/9.5/11.5/13.1', () => {
      const html = generateQuoteHtml(mockQuoteData);
      expect(html).toContain('8.7%');
      expect(html).toContain('57.2%');
      expect(html).toContain('9.5%');
      expect(html).toContain('11.5%');
      expect(html).toContain('13.1%');
    });

    it('renders price cells with nowrap', () => {
      const html = generateQuoteHtml(mockQuoteData);
      expect(html).toContain('white-space');
      expect(html).toContain('nowrap');
    });

    it('renders description field in header', () => {
      const data: QuoteDataForPdf = {
        ...mockQuoteData,
        description: 'TYCO ZETTLER SİSTEMİ',
      };
      const html = generateQuoteHtml(data);
      expect(html).toContain('TYCO ZETTLER SİSTEMİ');
    });

    it('omits description when not provided', () => {
      const html = generateQuoteHtml(mockQuoteData);
      // Should not have an empty description line
      expect(html).not.toContain('undefined');
    });

    it('renders highlighted note with yellow background', () => {
      const data: QuoteDataForPdf = {
        ...mockQuoteData,
        notes: [{ text: 'Important note', sortOrder: 1, highlight: true }],
      };
      const html = generateQuoteHtml(data);
      expect(html).toContain('highlight-yellow');
    });

    it('does not apply highlight-yellow class on note cells when not highlighted', () => {
      const html = generateQuoteHtml(mockQuoteData);
      // The CSS class definition exists in stylesheet, but should not appear on any td element
      expect(html).not.toContain('class="highlight-yellow"');
    });

    // ── Multi-value category tests ──────────────────────────────────

    it('renders DAHIL_OLMAYAN above TİCARİ ŞARTLAR heading', () => {
      const data: QuoteDataForPdf = {
        ...mockQuoteData,
        commercialTerms: [
          { category: 'DAHIL_OLMAYAN', content: 'Kablolama dahil degildir.' },
          { category: 'garanti', content: '2 yil' },
        ],
      };
      const html = generateQuoteHtml(data);

      expect(html).toContain('Dahil Olmayan Hizmetler:');
      expect(html).toContain('Kablolama dahil degildir.');
      expect(html).toContain('TİCARİ ŞARTLAR');

      // DAHIL_OLMAYAN should come before TİCARİ ŞARTLAR
      const dahilPos = html.indexOf('Dahil Olmayan Hizmetler:');
      const ticariPos = html.indexOf('TİCARİ ŞARTLAR');
      expect(dahilPos).toBeLessThan(ticariPos);
    });

    it('renders uretici_firmalar with each term on its own line', () => {
      const data: QuoteDataForPdf = {
        ...mockQuoteData,
        commercialTerms: [
          { category: 'uretici_firmalar', content: 'TYCO- Yangin Algilama Sistemi' },
          { category: 'uretici_firmalar', content: 'NOTIFIER- Yangin Ihbar Sistemi' },
        ],
      };
      const html = generateQuoteHtml(data);

      expect(html).toContain('ÜRETİCİ FİRMALAR');
      expect(html).toContain('TYCO- Yangin Algilama Sistemi');
      expect(html).toContain('NOTIFIER- Yangin Ihbar Sistemi');
    });

    it('renders onaylar comma-joined on a single line', () => {
      const data: QuoteDataForPdf = {
        ...mockQuoteData,
        commercialTerms: [
          { category: 'onaylar', content: 'VDS onayli' },
          { category: 'onaylar', content: 'FM onayli' },
          { category: 'onaylar', content: 'CE onayli' },
        ],
      };
      const html = generateQuoteHtml(data);

      expect(html).toContain('ONAYLAR');
      expect(html).toContain('VDS onayli, FM onayli, CE onayli');
    });

    it('renders NOTLAR from commercialTerms as numbered items', () => {
      const data: QuoteDataForPdf = {
        ...mockQuoteData,
        commercialTerms: [
          { category: 'garanti', content: '2 yil' },
          { category: 'NOTLAR', content: 'Montaj dahildir.' },
          { category: 'NOTLAR', content: 'Fiyatlar KDV haricdir.', highlight: true },
        ],
        notes: [],
      };
      const html = generateQuoteHtml(data);

      expect(html).toContain('NOTLAR');
      expect(html).toContain('Montaj dahildir.');
      expect(html).toContain('Fiyatlar KDV haricdir.');
      expect(html).toContain('highlight-yellow');
    });

    it('renders highlight on NOTLAR terms from commercialTerms', () => {
      const data: QuoteDataForPdf = {
        ...mockQuoteData,
        commercialTerms: [
          { category: 'NOTLAR', content: 'Highlighted note', highlight: true },
          { category: 'NOTLAR', content: 'Normal note', highlight: false },
        ],
        notes: [],
      };
      const html = generateQuoteHtml(data);

      // The highlighted note cell should have the highlight-yellow class
      expect(html).toContain('class="highlight-yellow"');
      expect(html).toContain('Highlighted note');
      expect(html).toContain('Normal note');
    });
  });

  describe('formatCurrency', () => {
    it('formats EUR with symbol after number', () => {
      expect(formatCurrency(1234.56, 'EUR')).toBe('1.234,56 \u20AC');
    });

    it('formats USD with symbol after number', () => {
      expect(formatCurrency(1234.56, 'USD')).toBe('1.234,56 $');
    });

    it('formats TRY with symbol after number', () => {
      expect(formatCurrency(1234.56, 'TRY')).toBe('1.234,56 \u20BA');
    });

    it('formats zero correctly', () => {
      expect(formatCurrency(0, 'EUR')).toBe('0,00 \u20AC');
    });
  });

  describe('escapeHtml', () => {
    it('escapes angle brackets', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('escapes ampersand', () => {
      expect(escapeHtml('A & B')).toBe('A &amp; B');
    });

    it('escapes quotes', () => {
      expect(escapeHtml('"test"')).toBe('&quot;test&quot;');
    });
  });
});
