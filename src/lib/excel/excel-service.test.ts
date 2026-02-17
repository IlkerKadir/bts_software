import { describe, it, expect } from 'vitest';
import { ExcelService, QuoteDataForExcel } from './excel-service';
import ExcelJS from 'exceljs';

// Helper to load buffer into workbook (handles type compatibility)
async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

// Helper: search entire sheet for a cell value containing text
function sheetContains(sheet: ExcelJS.Worksheet, text: string): boolean {
  let found = false;
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (cell.value?.toString().includes(text)) {
        found = true;
      }
    });
  });
  return found;
}

describe('ExcelService', () => {
  const mockQuoteData: QuoteDataForExcel = {
    quoteNumber: 'BTS-2026-0001',
    refNo: 'REF-001',
    subject: 'Yangin Algilama Sistemi',
    date: '15.01.2026',
    validUntil: '15.02.2026',
    currency: 'EUR',
    company: {
      name: 'ABC Insaat A.S.',
      address: 'Ankara Caddesi No: 123',
    },
    project: 'Merkez Ofis',
    systemBrand: 'ZETA',
    items: [
      {
        itemType: 'HEADER',
        description: 'Algilama Ekipmanlari',
      },
      {
        itemType: 'PRODUCT',
        description: 'Duman Dedektoru',
        quantity: 50,
        unitPrice: 85.5,
        totalPrice: 4275,
      },
      {
        itemType: 'SERVICE',
        description: 'Montaj Hizmeti',
        quantity: 1,
        unitPrice: 500,
        totalPrice: 500,
      },
      {
        itemType: 'NOTE',
        description: 'Kurulum dahildir',
      },
      {
        itemType: 'CUSTOM',
        description: 'Ozel Kablo',
        quantity: 100,
        unitPrice: 5,
        totalPrice: 500,
      },
    ],
    totals: {
      subtotal: 5275,
      totalVat: 1055,
      grandTotal: 6330,
    },
    commercialTerms: [
      { category: 'ODEME', value: '30 gun vadeli', sortOrder: 0 },
      { category: 'GARANTI', value: '2 yil garanti', sortOrder: 1 },
      { category: 'TESLIM_YERI', value: 'Ankara', sortOrder: 2 },
    ],
    notes: [
      { text: 'Tum fiyatlar KDV haric', sortOrder: 0 },
      { text: 'Teslim suresi siparis sonrasi 4-6 haftadir', sortOrder: 1 },
    ],
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

      const workbook = await loadWorkbook(buffer);
      expect(workbook.worksheets.length).toBeGreaterThan(0);
      const sheet = workbook.getWorksheet('Teklif');
      expect(sheet).toBeDefined();
    });

    // --- BTS Company Header ---

    it('includes BTS company name in header', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'BTS YANGIN')).toBe(true);
    });

    it('includes BTS address in header', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'Resitpasa')).toBe(true);
    });

    it('includes BTS contact info in header', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'info@btsyangin.com')).toBe(true);
    });

    it('includes Ticaret Sicil No', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, '776705')).toBe(true);
    });

    // --- Customer Block ---

    it('includes PROFORMA FATURA text', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'PROFORMA FATURA')).toBe(true);
    });

    it('includes company name', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'ABC Insaat')).toBe(true);
    });

    it('includes company address', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'Ankara Caddesi')).toBe(true);
    });

    it('includes quote number', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'BTS-2026-0001')).toBe(true);
    });

    it('includes date', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, '15.01.2026')).toBe(true);
    });

    it('includes project name', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'Merkez Ofis')).toBe(true);
    });

    it('includes system brand', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'ZETA')).toBe(true);
    });

    // --- 5-Column Table Header ---

    it('has 5-column header structure', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      // Table header is at row 12
      const headerRow = sheet.getRow(12);
      const expectedHeaders = ['POZ NO', 'ACIKLAMA', 'MIKTAR', 'BIRIM FIYAT', 'TOPLAM FIYAT'];

      const actualHeaders: string[] = [];
      headerRow.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.value) {
          actualHeaders.push(cell.value.toString());
        }
      });

      expectedHeaders.forEach(header => {
        expect(actualHeaders).toContain(header);
      });
      expect(actualHeaders.length).toBe(5);
    });

    it('does NOT include internal columns', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      // These internal columns must never appear
      const forbiddenHeaders = ['BS', 'SS', 'KKOD', 'MARKA', 'MODEL', 'KATSAYI', 'LISTE', 'MKTR', 'PBRM'];
      const headerRow = sheet.getRow(12);
      const actualHeaders: string[] = [];
      headerRow.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.value) actualHeaders.push(cell.value.toString());
      });

      forbiddenHeaders.forEach(header => {
        expect(actualHeaders).not.toContain(header);
      });
    });

    // --- Items Section ---

    it('includes HEADER items as section separators', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'Algilama Ekipmanlari')).toBe(true);
    });

    it('includes PRODUCT items with description', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'Duman Dedektoru')).toBe(true);
    });

    it('includes SERVICE items', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'Montaj Hizmeti')).toBe(true);
    });

    it('includes CUSTOM items', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'Ozel Kablo')).toBe(true);
    });

    it('includes NOTE items', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'Kurulum dahildir')).toBe(true);
    });

    it('assigns sequential POZ NO to data rows', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      // Data starts at row 13 (header at 12, first item is HEADER so no POZ)
      // Row 13: HEADER (no POZ)
      // Row 14: PRODUCT => POZ 1
      // Row 15: SERVICE => POZ 2
      // Row 16: NOTE (no POZ)
      // Row 17: CUSTOM => POZ 3
      expect(sheet.getCell(14, 1).value).toBe(1); // First PRODUCT
      expect(sheet.getCell(15, 1).value).toBe(2); // SERVICE
      expect(sheet.getCell(17, 1).value).toBe(3); // CUSTOM
    });

    // --- Totals Section ---

    it('includes Ara Toplam label', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'Ara Toplam')).toBe(true);
    });

    it('includes KDV label', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'KDV')).toBe(true);
    });

    it('includes GENEL TOPLAM label and value', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'GENEL TOPLAM')).toBe(true);

      // Check grand total value exists
      let foundGrandTotal = false;
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (cell.value === 6330 || cell.value?.toString().includes('6330')) {
            foundGrandTotal = true;
          }
        });
      });
      expect(foundGrandTotal).toBe(true);
    });

    it('includes subtotal value', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      let foundSubtotal = false;
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (cell.value === 5275) {
            foundSubtotal = true;
          }
        });
      });
      expect(foundSubtotal).toBe(true);
    });

    // --- Commercial Terms ---

    it('includes TICARI SARTLAR section', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'TICARI SARTLAR')).toBe(true);
    });

    it('includes commercial term values', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, '30 gun vadeli')).toBe(true);
      expect(sheetContains(sheet, '2 yil garanti')).toBe(true);
      expect(sheetContains(sheet, 'Ankara')).toBe(true);
    });

    it('includes commercial term category labels', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'ODEME')).toBe(true);
      expect(sheetContains(sheet, 'GARANTI')).toBe(true);
      expect(sheetContains(sheet, 'TESLIM YERI')).toBe(true);
    });

    // --- Notes Section ---

    it('includes NOTLAR section header', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'NOTLAR')).toBe(true);
    });

    it('includes note content', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'Tum fiyatlar KDV haric')).toBe(true);
      expect(sheetContains(sheet, 'Teslim suresi siparis')).toBe(true);
    });

    // --- Edge Cases ---

    it('works without commercial terms', async () => {
      const service = new ExcelService();
      const dataWithoutTerms = { ...mockQuoteData, commercialTerms: undefined };
      const buffer = await service.generateQuoteExcel(dataWithoutTerms);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('works without notes', async () => {
      const service = new ExcelService();
      const dataWithoutNotes = { ...mockQuoteData, notes: undefined };
      const buffer = await service.generateQuoteExcel(dataWithoutNotes);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('works with minimal company data', async () => {
      const service = new ExcelService();
      const minimalData: QuoteDataForExcel = {
        ...mockQuoteData,
        company: {
          name: 'Simple Company',
          address: null,
        },
        project: null,
        systemBrand: null,
        refNo: null,
        commercialTerms: undefined,
        notes: undefined,
      };
      const buffer = await service.generateQuoteExcel(minimalData);

      expect(buffer).toBeInstanceOf(Buffer);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheetContains(sheet, 'Simple Company')).toBe(true);
    });

    it('works with empty items list', async () => {
      const service = new ExcelService();
      const emptyData: QuoteDataForExcel = {
        ...mockQuoteData,
        items: [],
      };
      const buffer = await service.generateQuoteExcel(emptyData);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('handles SERVICE items the same as PRODUCT items in the table', async () => {
      const service = new ExcelService();
      const serviceOnlyData: QuoteDataForExcel = {
        ...mockQuoteData,
        items: [
          {
            itemType: 'SERVICE',
            description: 'Muhendislik Hizmeti',
            quantity: 5,
            unitPrice: 200,
            totalPrice: 1000,
          },
        ],
      };
      const buffer = await service.generateQuoteExcel(serviceOnlyData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      // SERVICE item should appear at row 13 (first data row after header at 12)
      expect(sheet.getCell(13, 1).value).toBe(1); // POZ NO = 1
      expect(sheet.getCell(13, 2).value).toBe('Muhendislik Hizmeti');
      expect(sheet.getCell(13, 3).value).toBe('5 Ad.'); // quantity with unit abbreviation
      expect(sheet.getCell(13, 4).value).toBe(200);
      expect(sheet.getCell(13, 5).value).toBe(1000);
    });

    // --- Print Setup ---

    it('sets landscape orientation', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheet.pageSetup.orientation).toBe('landscape');
    });

    it('sets fit to page width', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Teklif')!;

      expect(sheet.pageSetup.fitToWidth).toBe(1);
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
