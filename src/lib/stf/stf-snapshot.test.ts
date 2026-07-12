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
    { id: 'q1', itemType: 'HEADER', sortOrder: 1, code: null, brand: null, model: null, description: 'TRAFO 1', quantity: 0, unit: 'Adet', unitPrice: 0, totalPrice: 0, priceLabel: null, parentItemId: null, discountPct: 0, sectionDiscountPct: null, sectionDiscountLabel: null },
    { id: 'q2', itemType: 'PRODUCT', sortOrder: 2, code: 'MKII-OP', brand: 'Fyreye', model: 'MKII', description: 'Optik Dedektör', quantity: 1, unit: 'Adet', unitPrice: 31.4, totalPrice: 31.4, priceLabel: null, parentItemId: null, discountPct: 0, sectionDiscountPct: null, sectionDiscountLabel: null },
    { id: 'q3', itemType: 'CUSTOM', sortOrder: 3, code: null, brand: null, model: null, description: 'Montaj', quantity: 1, unit: 'Adet', unitPrice: 0, totalPrice: 0, priceLabel: 'tarafınızca sağlanacaktır', parentItemId: null, discountPct: 0, sectionDiscountPct: null, sectionDiscountLabel: null },
  ],
  commercialTerms: [{ category: 'odeme', value: '30 gün' }],
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
          { id: 'q1', itemType: 'PRODUCT', sortOrder: 0, code: null, brand: null, model: null,
            description: 'P', quantity: 1, unit: 'Adet', unitPrice: 100, totalPrice: 100,
            priceLabel: null, parentItemId: null, discountPct: 0,
            sectionDiscountPct: null, sectionDiscountLabel: null },
          { id: 'q2', itemType: 'SUBTOTAL', sortOrder: 1, code: null, brand: null, model: null,
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

  it('seats SET children right behind their parent even when quote sortOrder scatters them (STF 6003)', () => {
    const base = { code: null, brand: null, model: null, quantity: 1, unit: 'Adet',
      unitPrice: 0, totalPrice: 0, priceLabel: null, discountPct: 0,
      sectionDiscountPct: null, sectionDiscountLabel: null };
    const { items } = buildStfSnapshot(
      {
        quoteNumber: 'SA0002', refNo: null, currency: 'EUR',
        discountTotal: 0, grandTotal: 100,
        company: { name: 'X', address: null, phone: null, taxNumber: null },
        project: null, commercialTerms: [],
        items: [
          { ...base, id: 'p26', itemType: 'PRODUCT', sortOrder: 26, description: 'Standart Dedektör Tabanı' },
          // children carry sortOrders adjacent to poz 26, far from their parent (set39)
          { ...base, id: 'c1', itemType: 'PRODUCT', sortOrder: 27, parentItemId: 'set39', description: 'Test ve Devreye Alma Hizmeti' },
          { ...base, id: 'c2', itemType: 'PRODUCT', sortOrder: 28, parentItemId: 'set39', description: 'Süpervizyon Hizmeti' },
          { ...base, id: 'p38', itemType: 'PRODUCT', sortOrder: 38, description: 'Başka Ürün' },
          { ...base, id: 'set39', itemType: 'SET', sortOrder: 39, description: 'Montaj Süpervizörlüğü, Müh., Test ve Devreye Alma' },
        ].map((it) => ({ parentItemId: null, ...it })),
      },
      new Date('2026-06-18T00:00:00Z')
    );
    expect(items.map((i) => i.description)).toEqual([
      'Standart Dedektör Tabanı',
      'Başka Ürün',
      'Montaj Süpervizörlüğü, Müh., Test ve Devreye Alma',
      'Test ve Devreye Alma Hizmeti',
      'Süpervizyon Hizmeti',
    ]);
    // canonical renumbering + children keep the "*" contract (no poz)
    expect(items.map((i) => i.sortOrder)).toEqual([1, 2, 3, 4, 5]);
    expect(items.map((i) => i.pozNo)).toEqual(['1', '2', '3', null, null]);
  });

  it('converts a TRY-priced SET total into the STF currency at snapshot time', () => {
    const base = { code: null, brand: null, model: null, quantity: 1, unit: 'Adet',
      unitPrice: 0, totalPrice: 0, priceLabel: null, parentItemId: null, discountPct: 0,
      sectionDiscountPct: null, sectionDiscountLabel: null };
    const { items } = buildStfSnapshot(
      {
        quoteNumber: 'SA0004', refNo: null, currency: 'EUR',
        // protected rate 48 with 6.7% protection → base rate 45
        exchangeRate: 48.0, protectionPct: 6.666666666666667,
        discountTotal: 0, grandTotal: 0,
        company: { name: 'X', address: null, phone: null, taxNumber: null },
        project: null, commercialTerms: [],
        items: [
          { ...base, id: 'p1', itemType: 'PRODUCT', sortOrder: 1, description: 'EUR ürün', unitPrice: 100, totalPrice: 100 },
          { ...base, id: 's1', itemType: 'SET', sortOrder: 2, description: 'TL Set', currency: 'TRY', unitPrice: 9000, totalPrice: 9000 },
        ],
      },
      new Date('2026-07-12T00:00:00Z')
    );
    const eurRow = items.find((i) => i.description === 'EUR ürün')!;
    const tlSet = items.find((i) => i.description === 'TL Set')!;
    expect(eurRow.currency).toBeNull();
    expect(eurRow.totalPriceInOrderCurrency).toBeNull(); // already in STF currency
    expect(tlSet.currency).toBe('TRY');
    expect(tlSet.totalPrice).toBe(9000); // face value kept for display (₺)
    expect(tlSet.totalPriceInOrderCurrency).toBe(200); // 9000 / 45 base rate
  });

  it('keeps a child with an unknown parent at its flat position (defensive)', () => {
    const base = { code: null, brand: null, model: null, quantity: 1, unit: 'Adet',
      unitPrice: 0, totalPrice: 0, priceLabel: null, discountPct: 0,
      sectionDiscountPct: null, sectionDiscountLabel: null };
    const { items } = buildStfSnapshot(
      {
        quoteNumber: 'SA0003', refNo: null, currency: 'EUR',
        discountTotal: 0, grandTotal: 0,
        company: { name: 'X', address: null, phone: null, taxNumber: null },
        project: null, commercialTerms: [],
        items: [
          { ...base, id: 'a', itemType: 'PRODUCT', sortOrder: 1, parentItemId: null, description: 'A' },
          { ...base, id: 'orphan', itemType: 'PRODUCT', sortOrder: 2, parentItemId: 'missing', description: 'Orphan' },
          { ...base, id: 'b', itemType: 'PRODUCT', sortOrder: 3, parentItemId: null, description: 'B' },
        ],
      },
      new Date('2026-06-18T00:00:00Z')
    );
    expect(items.map((i) => i.description)).toEqual(['A', 'Orphan', 'B']);
    // The dangling parent ref is STRIPPED: renderers hide parentItemId rows
    // (PDF skips SET children entirely), so an orphan must become a normal
    // standalone row — with its own poz — or it would vanish from the PDF.
    const orphan = items.find((i) => i.description === 'Orphan')!;
    expect(orphan.parentItemId).toBeNull();
    expect(orphan.pozNo).toBe('2');
  });
});
