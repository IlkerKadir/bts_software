import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { generateStfExcel, type StfExcelData } from './stf-excel';

const data: StfExcelData = {
  order: {
    orderNumber: 'STF-6000', customerName: 'DURAN DOĞAN A.Ş', customerAddress: 'Hadımköy İSTANBUL',
    customerPhone: null, customerTaxInfo: 'BÜYÜK MÜKELLEFLER / 315', projectName: 'ANA FABRİKA',
    quoteNo: 'SA0001', refNo: '316A', formDate: new Date('2025-08-06T00:00:00Z'), siparisNo: null,
    currency: 'EUR', manufacturers: 'GLT ZETA\nBTS', warranty: 'Üretici garantisi.',
    deliveryPlace: 'İstanbul depo.', deliveryTime: '8-10 hafta.', paymentTerms: '30 gün.',
    vatNote: 'KDV dahil değildir.', notes: 'Bir bütün halinde geçerlidir.',
    freeNote: 'Serbest kalem satırı.',
    customerApprovalName: 'İLKER ÇETİN', btsResponsibleName: 'ÖZNUR SAYIN',
  },
  items: [
    { itemType: 'HEADER', pozNo: null, description: 'TRAFO 1', brand: null, code: null, model: null, quantity: 0, unit: 'Adet', unitPrice: 0, totalPrice: 0, priceLabel: null, parentItemId: null, sectionDiscountPct: null, sectionDiscountLabel: null },
    { itemType: 'PRODUCT', pozNo: '1', description: 'Fyreye MKII Dedektör', brand: 'GLT', code: 'MKII-OP', model: 'MKII-OP', quantity: 1, unit: 'Adet', unitPrice: 31.4, totalPrice: 31.4, priceLabel: null, parentItemId: null, sectionDiscountPct: null, sectionDiscountLabel: null },
    { itemType: 'PRODUCT', pozNo: null, description: 'Soket', brand: 'GLT', code: 'MKII-CB', model: 'MKII-CB', quantity: 1, unit: 'Adet', unitPrice: 4.57, totalPrice: 4.57, priceLabel: null, parentItemId: 'p1', sectionDiscountPct: null, sectionDiscountLabel: null },
    { itemType: 'SUBTOTAL', pozNo: null, description: 'TRAFO-1 SİSTEM', brand: null, code: null, model: null, quantity: 0, unit: 'Adet', unitPrice: 0, totalPrice: 0, priceLabel: null, parentItemId: null, sectionDiscountPct: 30, sectionDiscountLabel: 'FİRMANIZA ÖZEL İNDİRİM' },
  ],
};

async function load(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  const texts: string[] = [];
  ws.eachRow((row) => row.eachCell((c) => {
    let v: any = c.value;
    if (v && typeof v === 'object' && 'richText' in v) v = v.richText.map((t: any) => t.text).join('');
    if (v != null && v !== '') texts.push(String(v));
  }));
  return texts.join(' | ');
}

describe('generateStfExcel', () => {
  it('renders header, sectioned items, subtotal and footer', async () => {
    const buf = await generateStfExcel(data);
    expect(buf.length).toBeGreaterThan(1000);
    const all = await load(buf);
    expect(all).toContain('DURAN DOĞAN A.Ş');
    expect(all).toContain('Serbest kalem satırı.'); // free-form row between items and footer
    expect(all).toContain('STF-6000');
    expect(all).toContain('316A');           // teklif/ref combined
    expect(all).toContain('TRAFO 1');         // section header
    expect(all).toContain('*');               // child poz marker
    expect(all).toContain('FİRMANIZA ÖZEL İNDİRİM');
    expect(all).toContain('ÜRETİCİ FİRMALAR');
    expect(all).toContain('TESLİMAT');
    expect(all).toContain('MÜŞTERİ ONAYI');
    expect(all).toContain('İLKER ÇETİN');
  });

  it('excludes SET children from the section subtotal (parent already rolled up)', async () => {
    const buf = await generateStfExcel(data);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    // gross = 31.40 (child 4.57 excluded) → 30% → net 21.98. Assert a 21.98 numeric cell exists.
    let found = false;
    ws.eachRow((row) => row.eachCell((c) => {
      const n = typeof c.value === 'number' ? c.value : Number(c.value);
      if (Math.abs(n - 21.98) < 0.001) found = true;
    }));
    expect(found).toBe(true);
  });
});
