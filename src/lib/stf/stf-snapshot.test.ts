import { describe, it, expect } from 'vitest';
import { buildStfSnapshot, type QuoteForSnapshot } from './stf-snapshot';

const quote: QuoteForSnapshot = {
  quoteNumber: 'CC0335-YAS',
  refNo: '219C',
  currency: 'EUR',
  discountTotal: 50,
  grandTotal: 3005,
  company: { name: 'Deva A.Ş.', address: 'İstanbul', phone: '0212', taxNumber: '123' },
  project: { name: 'Deva API' },
  items: [
    { itemType: 'HEADER', sortOrder: 1, code: null, brand: null, model: null, description: 'TRAFO 1', quantity: 0, unit: 'Adet', unitPrice: 0, totalPrice: 0, priceLabel: null, parentItemId: null, discountPct: 0, sectionDiscountPct: null, sectionDiscountLabel: null },
    { itemType: 'PRODUCT', sortOrder: 2, code: 'MKII-OP', brand: 'Fyreye', model: 'MKII', description: 'Optik Dedektör', quantity: 1, unit: 'Adet', unitPrice: 31.4, totalPrice: 31.4, priceLabel: null, parentItemId: null, discountPct: 0, sectionDiscountPct: null, sectionDiscountLabel: null },
    { itemType: 'CUSTOM', sortOrder: 3, code: null, brand: null, model: null, description: 'Montaj', quantity: 1, unit: 'Adet', unitPrice: 0, totalPrice: 0, priceLabel: 'tarafınızca sağlanacaktır', parentItemId: null, discountPct: 0, sectionDiscountPct: null, sectionDiscountLabel: null },
  ],
  commercialTerms: [{ category: 'payment', value: '30 gün' }],
};

describe('buildStfSnapshot', () => {
  it('copies header fields, splitting quoteNo and refNo', () => {
    const { header } = buildStfSnapshot(quote, new Date('2026-06-18'));
    expect(header.quoteNo).toBe('CC0335-YAS');
    expect(header.refNo).toBe('219C');
    expect(header.customerName).toBe('Deva A.Ş.');
    expect(header.customerAddress).toBe('İstanbul');
    expect(header.projectName).toBe('Deva API');
    expect(header.currency).toBe('EUR');
    expect(header.grandTotal).toBe(3005);
    expect(header.formDate).toEqual(new Date('2026-06-18'));
    expect(header.paymentTerms).toBe('30 gün');
  });

  it('copies items preserving type/order and assigns poz only to priced rows', () => {
    const { items } = buildStfSnapshot(quote, new Date('2026-06-18'));
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ itemType: 'HEADER', pozNo: null, description: 'TRAFO 1' });
    expect(items[1]).toMatchObject({ itemType: 'PRODUCT', pozNo: '1', code: 'MKII-OP' });
    expect(items[2]).toMatchObject({ itemType: 'CUSTOM', pozNo: '2', priceLabel: 'tarafınızca sağlanacaktır' });
  });

  it('copies sectionDiscountPct/Label onto SUBTOTAL snapshot items', () => {
    const { items } = buildStfSnapshot(
      {
        quoteNumber: 'SA0001', refNo: null, currency: 'EUR',
        discountTotal: 0, grandTotal: 100,
        company: { name: 'X', address: null, phone: null, taxNumber: null },
        project: null,
        commercialTerms: [],
        items: [
          { itemType: 'PRODUCT', sortOrder: 0, code: null, brand: null, model: null,
            description: 'P', quantity: 1, unit: 'Adet', unitPrice: 100, totalPrice: 100,
            priceLabel: null, parentItemId: null, discountPct: 0,
            sectionDiscountPct: null, sectionDiscountLabel: null },
          { itemType: 'SUBTOTAL', sortOrder: 1, code: null, brand: null, model: null,
            description: '', quantity: 0, unit: 'Adet', unitPrice: 0, totalPrice: 0,
            priceLabel: null, parentItemId: null, discountPct: 0,
            sectionDiscountPct: 30, sectionDiscountLabel: 'Firmanıza Özel' },
        ],
      },
      new Date('2026-06-18T00:00:00Z')
    );
    const sub = items.find((i) => i.itemType === 'SUBTOTAL')!;
    expect(sub.sectionDiscountPct).toBe(30);
    expect(sub.sectionDiscountLabel).toBe('Firmanıza Özel');
    expect(items[0].sectionDiscountPct).toBeNull();
  });
});
