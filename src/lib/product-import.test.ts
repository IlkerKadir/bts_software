import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseProductExcel } from './product-import';

async function sheetToBuffer(headers: string[], rows: (string | number)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Ürünler');
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

describe('parseProductExcel — Turkish name handling', () => {
  it('maps ÜRÜN ADI to nameTr when there is no language or Turkish column (legacy behavior)', async () => {
    const buf = await sheetToBuffer(
      ['ÜRÜN KODU', 'ÜRÜN ADI', 'İNGİLİZCE AÇIKLAMA', 'LİSTE FİYATI', 'PARA BİRİMİ'],
      [['P-1', 'Duman Dedektörü', 'Smoke Detector', 100, 'EUR']],
    );
    const [p] = await parseProductExcel(buf);
    expect(p.code).toBe('P-1');
    expect(p.nameTr).toBe('Duman Dedektörü');
    expect(p.nameEn).toBe('Smoke Detector');
  });

  it('lets an explicit TÜRKÇE AÇIKLAMA column win for nameTr', async () => {
    const buf = await sheetToBuffer(
      ['ÜRÜN KODU', 'ÜRÜN ADI', 'TÜRKÇE AÇIKLAMA', 'LİSTE FİYATI'],
      [['P-2', 'Generic name', 'Optik Duman Dedektörü', 50]],
    );
    const [p] = await parseProductExcel(buf);
    expect(p.nameTr).toBe('Optik Duman Dedektörü');
  });

  it('also recognizes a TÜRKÇE ADI header', async () => {
    const buf = await sheetToBuffer(
      ['ÜRÜN KODU', 'ÜRÜN ADI', 'TÜRKÇE ADI', 'LİSTE FİYATI'],
      [['P-3', 'Name', 'Türkçe İsim', 10]],
    );
    const [p] = await parseProductExcel(buf);
    expect(p.nameTr).toBe('Türkçe İsim');
  });

  it('falls back to ÜRÜN ADI when the Turkish column exists but the cell is empty', async () => {
    const buf = await sheetToBuffer(
      ['ÜRÜN KODU', 'ÜRÜN ADI', 'TÜRKÇE AÇIKLAMA', 'LİSTE FİYATI'],
      [['P-4', 'Buton', '', 10]],
    );
    const [p] = await parseProductExcel(buf);
    expect(p.nameTr).toBe('Buton');
  });
});
