import { describe, it, expect } from 'vitest';
import { ExcelService, QuoteDataForExcel } from './excel-service';
import ExcelJS from 'exceljs';

describe('ExcelService', () => {
  const mockQuoteData: QuoteDataForExcel = {
    quoteNumber: 'BTS-2026-0001',
    subject: 'Yangin Algilama Sistemi',
    date: '15.01.2026',
    validUntil: '15.02.2026',
    currency: 'EUR',
    company: 'ABC Insaat A.S.',
    project: 'Merkez Ofis',
    items: [
      {
        itemType: 'HEADER',
        description: 'Algilama Ekipmanlari',
      },
      {
        itemType: 'PRODUCT',
        code: 'SD-001',
        brand: 'Siemens',
        description: 'Duman Dedektoru',
        quantity: 50,
        unit: 'Adet',
        listPrice: 95,
        katsayi: 0.9,
        unitPrice: 85.5,
        discountPct: 10,
        totalPrice: 3847.5,
        vatRate: 20,
      },
      {
        itemType: 'NOTE',
        description: 'Kurulum dahildir',
      },
    ],
    totals: {
      subtotal: 3847.5,
      totalVat: 769.5,
      grandTotal: 4617,
    },
  };

  describe('generateQuoteExcel', () => {
    it('generates valid Excel buffer', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('creates workbook with Teklif sheet', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      // Read the buffer back to verify content
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      expect(workbook.worksheets.length).toBeGreaterThan(0);
      const sheet = workbook.getWorksheet('Teklif');
      expect(sheet).toBeDefined();
    });

    it('includes quote header information', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      // Check that quote number is in the sheet
      let foundQuoteNumber = false;
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (cell.value?.toString().includes('BTS-2026-0001')) {
            foundQuoteNumber = true;
          }
        });
      });
      expect(foundQuoteNumber).toBe(true);
    });

    it('includes company name', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      let foundCompany = false;
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (cell.value?.toString().includes('ABC Insaat')) {
            foundCompany = true;
          }
        });
      });
      expect(foundCompany).toBe(true);
    });

    it('includes product item data', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      let foundProduct = false;
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (cell.value?.toString().includes('Duman Dedektoru')) {
            foundProduct = true;
          }
        });
      });
      expect(foundProduct).toBe(true);
    });

    it('includes header items', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      let foundHeader = false;
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (cell.value?.toString().includes('Algilama Ekipmanlari')) {
            foundHeader = true;
          }
        });
      });
      expect(foundHeader).toBe(true);
    });

    it('includes totals', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      let foundGrandTotal = false;
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          // Check for grand total value (4617)
          if (cell.value === 4617 || cell.value?.toString().includes('4617')) {
            foundGrandTotal = true;
          }
        });
      });
      expect(foundGrandTotal).toBe(true);
    });
  });

  describe('singleton pattern', () => {
    it('returns same instance via getExcelService', async () => {
      const { getExcelService } = await import('./excel-service');
      const instance1 = getExcelService();
      const instance2 = getExcelService();

      expect(instance1).toBe(instance2);
    });
  });
});
