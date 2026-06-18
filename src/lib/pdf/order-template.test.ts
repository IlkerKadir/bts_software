import { describe, it, expect } from 'vitest';
import { generateOrderHtml, type OrderDataForPdf } from './order-template';

const data: OrderDataForPdf = {
  order: {
    orderNumber: 'STF-6000',
    customerName: 'DURAN DOĞAN BASIM VE AMBALAJ SAN.A.Ş',
    customerAddress: 'Hadımköy Mah. ... İSTANBUL',
    customerPhone: null,
    customerTaxInfo: 'BÜYÜK MÜKELLEFLER / 315 007 0 414',
    projectName: 'DURAN DOĞAN - ANA FABRİKA',
    quoteNo: 'SA0001',
    refNo: '316A',
    formDate: new Date('2025-08-06T00:00:00Z'),
    siparisNo: null,
    currency: 'EUR',
    manufacturers: 'GLT ZETA\nTYCO ZETTLER\nBTS',
    warranty: 'Üretici garantisi altındadır.',
    deliveryPlace: 'İstanbul Şantiye Depo teslimidir.',
    paymentTerms: '30 gün içinde peşin banka havalesi.',
    vatNote: 'Fiyatlarımıza KDV dahil değildir.',
    notes: 'Teklifimiz bir bütün halinde geçerlidir.',
    customerApprovalName: 'İLKER ÇETİN',
    btsResponsibleName: 'ÖZNUR SAYIN',
  },
  items: [
    { itemType: 'HEADER', pozNo: null, description: 'TRAFO 1', brand: null, code: null, quantity: 0, unit: 'Adet', unitPrice: 0, totalPrice: 0, priceLabel: null, parentItemId: null, sectionDiscountPct: null, sectionDiscountLabel: null },
    { itemType: 'PRODUCT', pozNo: '1', description: 'Fyreye MKII Optik Duman Dedektörü', brand: null, code: 'MKII-OP', quantity: 1, unit: 'Adet', unitPrice: 31.4, totalPrice: 31.4, priceLabel: null, parentItemId: null, sectionDiscountPct: null, sectionDiscountLabel: null },
    { itemType: 'PRODUCT', pozNo: null, description: 'Fyreye MKII Standart Dedektör Soketi', brand: null, code: 'MKII-CB', quantity: 1, unit: 'Adet', unitPrice: 4.57, totalPrice: 4.57, priceLabel: null, parentItemId: 'p1', sectionDiscountPct: null, sectionDiscountLabel: null },
    { itemType: 'SUBTOTAL', pozNo: null, description: 'TRAFO-1 SİSTEM', brand: null, code: null, quantity: 0, unit: 'Adet', unitPrice: 0, totalPrice: 0, priceLabel: null, parentItemId: null, sectionDiscountPct: 30, sectionDiscountLabel: 'FİRMANIZA ÖZEL İNDİRİM' },
  ],
};

describe('generateOrderHtml (STF customer PDF)', () => {
  const html = generateOrderHtml(data);
  it('renders the STF header fields', () => {
    expect(html).toContain('SİPARİŞ TEYİT FORMU');
    expect(html).toContain('DURAN DOĞAN BASIM VE AMBALAJ SAN.A.Ş');
    expect(html).toContain('STF-6000');
    expect(html).toContain('316A');
    expect(html).toContain('DURAN DOĞAN - ANA FABRİKA');
  });
  it('renders a section header row and a poz number', () => {
    expect(html).toContain('TRAFO 1');
    expect(html).toMatch(/>1<\/p>/);
  });
  it('renders child rows with * instead of a poz number', () => {
    expect(html).toContain('>*</p>');
  });
  it('renders a three-row section subtotal block with the discount label', () => {
    expect(html).toContain('FİRMANIZA ÖZEL İNDİRİM');
    // Child-inclusion decision (documented in order-template.ts computeSubtotalSum):
    // the customer PDF sums ALL non-priceLabel'd PRODUCT/CUSTOM/SET line totals in
    // the section, INCLUDING SET children (parentItemId set), matching the sample
    // proforma where every printed line total contributes to the section gross.
    // gross = 31.40 + 4.57 = 35.97 → 30% disc = 10.79 → net = 35.97 × 0.70 = 25.179
    // formatCurrency rounds to 2dp → "25,18".
    expect(html).toContain('25,18');
  });
  it('renders footer blocks and signature names', () => {
    expect(html).toContain('ÜRETİCİ FİRMALAR');
    expect(html).toContain('GARANTİ');
    expect(html).toContain('MÜŞTERİ ONAYI');
    expect(html).toContain('İLKER ÇETİN');
    expect(html).toContain('ÖZNUR SAYIN');
  });
  it('escapes multi-line footer text with <br/>', () => {
    expect(html).toContain('GLT ZETA<br/>TYCO ZETTLER<br/>BTS');
  });
});
