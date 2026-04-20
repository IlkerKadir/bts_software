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
    description: 'TYCO ZETTLER SİSTEMİ',
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
        katsayi: 1.2,
        listPrice: 71.25,
      },
      {
        itemType: 'SET',
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
        katsayi: 1.0,
        listPrice: 5,
      },
    ],
    totals: {
      subtotal: 5275,
      totalVat: 1055,
      grandTotal: 6330,
    },
    commercialTerms: [
      { category: 'odeme', value: '30 gun vadeli', sortOrder: 0 },
      { category: 'garanti', value: '2 yil garanti', sortOrder: 1 },
      { category: 'teslim_yeri', value: 'Ankara', sortOrder: 2 },
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

    it('creates workbook with Proforma Fatura sheet', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      expect(workbook.worksheets.length).toBeGreaterThan(0);
      const sheet = workbook.getWorksheet('Proforma Fatura');
      expect(sheet).toBeDefined();
    });

    // --- Customer Block ---

    it('includes PROFORMA FATURA text', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'PROFORMA FATURA')).toBe(true);
    });

    it('includes company name', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'ABC Insaat')).toBe(true);
    });

    it('includes company address', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'Ankara Caddesi')).toBe(true);
    });

    it('includes quote number', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'BTS-2026-0001')).toBe(true);
    });

    it('includes date', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, '15.01.2026')).toBe(true);
    });

    it('does NOT show project name in customer info block (matches PDF)', async () => {
      // The PDF info box shows: name, address, subject, description — no project.
      // Project name is tracked on the quote but not rendered on the proforma.
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'Merkez Ofis')).toBe(false);
    });

    it('includes description in customer info block', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'TYCO ZETTLER')).toBe(true);
    });

    // --- 8-Column Table Header ---

    it('has 8-column header (POZ NO / KOD / MARKA / MODEL / AÇIKLAMA / MİKTAR / BİRİM FİYAT / TOPLAM FİYAT)', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      // Column header is at row 7 (row 1 banner, rows 2-6 customer block:
      // name, address, subject, description spanning 2 rows).
      const headerRow = sheet.getRow(7);
      const expectedHeaders = ['POZ NO', 'KOD', 'MARKA', 'MODEL', 'AÇIKLAMA', 'MİKTAR', 'BİRİM FİYAT', 'TOPLAM FİYAT'];

      const actualHeaders: string[] = [];
      headerRow.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.value) actualHeaders.push(cell.value.toString());
      });

      expectedHeaders.forEach(header => {
        expect(actualHeaders).toContain(header);
      });
      expect(actualHeaders.length).toBe(8);
    });

    it('does NOT include internal KATSAYI / LİSTE FİYATI columns or group headers', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'KATSAYI')).toBe(false);
      expect(sheetContains(sheet, 'LİSTE FİYATI')).toBe(false);
      expect(sheetContains(sheet, 'TEKLİF SATIŞ FİYATLARI')).toBe(false);
      expect(sheetContains(sheet, 'TEKLİF HAZIRLAMA')).toBe(false);
    });

    // --- Items Section ---

    it('includes HEADER items rendered in bold across B:E', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      // HEADER section marker text lands in the sheet.
      expect(sheetContains(sheet, 'Algilama Ekipmanlari')).toBe(true);

      // First data row is row 8 (row 1 banner, rows 2-6 customer block,
      // row 7 column headers). The HEADER item is mockQuoteData.items[0]
      // and renders as a B:E merged band — column A is left empty,
      // column B holds the label in bold.
      const headerItemCell = sheet.getCell(8, 2);
      expect(headerItemCell.value).toBe('Algilama Ekipmanlari');
      expect((headerItemCell.font as ExcelJS.Font)?.bold).toBe(true);
    });

    it('includes PRODUCT items with description', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'Duman Dedektoru')).toBe(true);
    });

    it('includes SET items', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'Montaj Hizmeti')).toBe(true);
    });

    it('includes CUSTOM items', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'Ozel Kablo')).toBe(true);
    });

    it('includes NOTE items with NOT: prefix', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'NOT:')).toBe(true);
      expect(sheetContains(sheet, 'Kurulum dahildir')).toBe(true);
    });

    it('assigns sequential POZ NO to data rows', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      // Data starts at row 8 (row 1 banner, rows 2-6 customer block,
      // row 7 column headers).
      // Row 8:  HEADER    — no POZ
      // Row 9:  PRODUCT   — POZ 1
      // Row 10: SET       — POZ 2
      // Row 11: NOTE      — no POZ
      // Row 12: CUSTOM    — POZ 3
      expect(sheet.getCell(9, 1).value).toBe(1);  // First PRODUCT
      expect(sheet.getCell(10, 1).value).toBe(2); // SET
      expect(sheet.getCell(12, 1).value).toBe(3); // CUSTOM
    });

    it('uses Turkish currency format for prices', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      // Prices should be formatted as Turkish locale strings with currency symbol
      // e.g., "4.275,00 €" for totalPrice 4275 EUR
      expect(sheetContains(sheet, '4.275,00')).toBe(true);
    });

    // --- Totals Section ---
    // The auto-appended "SİSTEM GENEL TOPLAMI" row was removed — totals
    // now only appear when the user explicitly adds a GRAND_TOTAL item.

    it('does NOT auto-append a grand total row', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'SİSTEM GENEL TOPLAMI')).toBe(false);
    });

    it('renders a GRAND_TOTAL item when present in items', async () => {
      const service = new ExcelService();
      const dataWithTotal: QuoteDataForExcel = {
        ...mockQuoteData,
        items: [
          ...mockQuoteData.items,
          { itemType: 'GRAND_TOTAL', description: 'GENEL TOPLAM' },
        ],
      };
      const buffer = await service.generateQuoteExcel(dataWithTotal);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'GENEL TOPLAM')).toBe(true);
      // Grand total from mockQuoteData (6330 before VAT removal, now whatever
      // calculateQuoteTotals returns). We just check the sheet includes a
      // Turkish-formatted number, not the specific value.
      expect(sheetContains(sheet, '6.330,00')).toBe(true);
    });

    // --- Commercial Terms ---

    it('includes TİCARİ ŞARTLAR section with Turkish characters', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'TİCARİ ŞARTLAR')).toBe(true);
    });

    it('includes commercial term values', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, '30 gun vadeli')).toBe(true);
      expect(sheetContains(sheet, '2 yil garanti')).toBe(true);
      expect(sheetContains(sheet, 'Ankara')).toBe(true);
    });

    it('includes commercial term category labels with Turkish characters', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'ÖDEME')).toBe(true);
      expect(sheetContains(sheet, 'GARANTİ')).toBe(true);
      expect(sheetContains(sheet, 'TESLİM YERİ')).toBe(true);
    });

    it('renders DAHIL_OLMAYAN above TİCARİ ŞARTLAR heading', async () => {
      const service = new ExcelService();
      const dataWithDahil: QuoteDataForExcel = {
        ...mockQuoteData,
        commercialTerms: [
          { category: 'DAHIL_OLMAYAN', value: 'Kablolama dahil degildir.', sortOrder: 0 },
          { category: 'garanti', value: '2 yil', sortOrder: 1 },
        ],
      };
      const buffer = await service.generateQuoteExcel(dataWithDahil);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'Dahil Olmayan Hizmetler:')).toBe(true);
      expect(sheetContains(sheet, 'Kablolama dahil degildir.')).toBe(true);
      expect(sheetContains(sheet, 'TİCARİ ŞARTLAR')).toBe(true);

      // DAHIL_OLMAYAN should come before TİCARİ ŞARTLAR
      let dahilRow = 0;
      let ticariRow = 0;
      sheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          if (cell.value?.toString().includes('Dahil Olmayan Hizmetler:')) dahilRow = rowNumber;
          if (cell.value?.toString().includes('TİCARİ ŞARTLAR')) ticariRow = rowNumber;
        });
      });
      expect(dahilRow).toBeLessThan(ticariRow);
    });

    it('renders uretici_firmalar with each term on its own line', async () => {
      const service = new ExcelService();
      const dataWithUretici: QuoteDataForExcel = {
        ...mockQuoteData,
        commercialTerms: [
          { category: 'uretici_firmalar', value: 'TYCO - Yangin Algilama', sortOrder: 0 },
          { category: 'uretici_firmalar', value: 'NOTIFIER - Yangin Ihbar', sortOrder: 1 },
        ],
      };
      const buffer = await service.generateQuoteExcel(dataWithUretici);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'ÜRETİCİ FİRMALAR')).toBe(true);
      expect(sheetContains(sheet, 'TYCO - Yangin Algilama')).toBe(true);
      expect(sheetContains(sheet, 'NOTIFIER - Yangin Ihbar')).toBe(true);
    });

    it('renders onaylar comma-joined on a single line', async () => {
      const service = new ExcelService();
      const dataWithOnaylar: QuoteDataForExcel = {
        ...mockQuoteData,
        commercialTerms: [
          { category: 'onaylar', value: 'VDS onayli', sortOrder: 0 },
          { category: 'onaylar', value: 'FM onayli', sortOrder: 1 },
          { category: 'onaylar', value: 'CE onayli', sortOrder: 2 },
        ],
      };
      const buffer = await service.generateQuoteExcel(dataWithOnaylar);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'ONAYLAR')).toBe(true);
      expect(sheetContains(sheet, 'VDS onayli, FM onayli, CE onayli')).toBe(true);
    });

    // --- Notes Section ---

    it('includes NOTLAR section in commercial terms area', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'NOTLAR')).toBe(true);
    });

    it('includes note content', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'Tum fiyatlar KDV haric')).toBe(true);
      expect(sheetContains(sheet, 'Teslim suresi siparis')).toBe(true);
    });

    it('renders NOTLAR from commercialTerms category', async () => {
      const service = new ExcelService();
      const dataWithNotlarTerms: QuoteDataForExcel = {
        ...mockQuoteData,
        commercialTerms: [
          { category: 'garanti', value: '2 yil', sortOrder: 0 },
          { category: 'NOTLAR', value: 'Montaj dahildir.', sortOrder: 1 },
          { category: 'NOTLAR', value: 'Fiyatlar KDV haricdir.', sortOrder: 2, highlight: true },
        ],
        notes: [],
      };
      const buffer = await service.generateQuoteExcel(dataWithNotlarTerms);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'NOTLAR')).toBe(true);
      expect(sheetContains(sheet, 'Montaj dahildir.')).toBe(true);
      expect(sheetContains(sheet, 'Fiyatlar KDV haricdir.')).toBe(true);
    });

    it('renders highlighted notes with yellow background', async () => {
      const service = new ExcelService();
      const dataWithHighlight: QuoteDataForExcel = {
        ...mockQuoteData,
        notes: [
          { text: 'Highlighted note', sortOrder: 0, highlight: true },
          { text: 'Normal note', sortOrder: 1, highlight: false },
        ],
        commercialTerms: [],
      };
      const buffer = await service.generateQuoteExcel(dataWithHighlight);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'Highlighted note')).toBe(true);
      expect(sheetContains(sheet, 'Normal note')).toBe(true);

      // Find the highlighted note row and check for yellow fill
      let highlightedRow: number | null = null;
      sheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          if (cell.value?.toString().includes('Highlighted note')) {
            highlightedRow = rowNumber;
          }
        });
      });

      expect(highlightedRow).not.toBeNull();
      if (highlightedRow) {
        const fillColor = (sheet.getCell(highlightedRow, 2).fill as ExcelJS.FillPattern)?.fgColor?.argb;
        expect(fillColor).toBe('FFFFFF00');
      }
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
        description: null,
        commercialTerms: undefined,
        notes: undefined,
      };
      const buffer = await service.generateQuoteExcel(minimalData);

      expect(buffer).toBeInstanceOf(Buffer);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

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

    it('handles SET items the same as PRODUCT items in the table', async () => {
      const service = new ExcelService();
      const serviceOnlyData: QuoteDataForExcel = {
        ...mockQuoteData,
        items: [
          {
            itemType: 'SET',
            description: 'Muhendislik Hizmeti',
            quantity: 5,
            unitPrice: 200,
            totalPrice: 1000,
          },
        ],
      };
      const buffer = await service.generateQuoteExcel(serviceOnlyData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      // SET item should appear at row 8 (row 1 banner, rows 2-6
      // customer block, row 7 column headers). With the 8-column
      // layout: A=POZ, B/C/D=KOD/MARKA/MODEL (empty here), E=AÇIKLAMA,
      // F=MİKTAR, G=BİRİM FİYAT, H=TOPLAM.
      expect(sheet.getCell(8, 1).value).toBe(1); // POZ NO = 1
      expect(sheet.getCell(8, 5).value).toBe('Muhendislik Hizmeti');
      // Combined miktar cell, e.g. "5 ad."
      expect(String(sheet.getCell(8, 6).value).toLowerCase()).toContain('5');
      expect(String(sheet.getCell(8, 6).value).toLowerCase()).toContain('ad.');
      expect(String(sheet.getCell(8, 7).value)).toContain('200');
      expect(String(sheet.getCell(8, 8).value)).toContain('1.000');
    });

    // --- Print Setup ---

    it('sets portrait orientation (matching PDF)', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheet.pageSetup.orientation).toBe('portrait');
    });

    it('sets fit to page width', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheet.pageSetup.fitToWidth).toBe(1);
    });

    it('uses PDF-matching margins', async () => {
      const service = new ExcelService();
      const buffer = await service.generateQuoteExcel(mockQuoteData);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      // Margins should approximate PDF's 5mm/10mm/15mm/10mm
      const margins = sheet.pageSetup.margins!;
      expect(margins.top).toBeCloseTo(5 / 25.4, 2);
      expect(margins.left).toBeCloseTo(10 / 25.4, 2);
      expect(margins.right).toBeCloseTo(10 / 25.4, 2);
      expect(margins.bottom).toBeCloseTo(15 / 25.4, 2);
    });

    // --- Currency formatting ---

    it('renders TRY currency symbol on item rows', async () => {
      const service = new ExcelService();
      const dataWithTry: QuoteDataForExcel = {
        ...mockQuoteData,
        currency: 'TRY',
      };
      const buffer = await service.generateQuoteExcel(dataWithTry);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, '\u20BA')).toBe(true); // ₺ symbol
    });

    it('renders USD currency symbol on item rows', async () => {
      const service = new ExcelService();
      const dataWithUsd: QuoteDataForExcel = {
        ...mockQuoteData,
        currency: 'USD',
      };
      const buffer = await service.generateQuoteExcel(dataWithUsd);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, '$')).toBe(true);
    });

    // --- SUBTOTAL items ---

    it('renders SUBTOTAL items with section sum in Turkish currency format', async () => {
      const service = new ExcelService();
      const dataWithSubtotal: QuoteDataForExcel = {
        ...mockQuoteData,
        items: [
          { itemType: 'PRODUCT', description: 'Item A', quantity: 10, unitPrice: 100, totalPrice: 1000 },
          { itemType: 'PRODUCT', description: 'Item B', quantity: 5, unitPrice: 200, totalPrice: 1000 },
          { itemType: 'SUBTOTAL', description: '' },
        ],
      };
      const buffer = await service.generateQuoteExcel(dataWithSubtotal);

      const workbook = await loadWorkbook(buffer);
      const sheet = workbook.getWorksheet('Proforma Fatura')!;

      expect(sheetContains(sheet, 'Ara Toplam')).toBe(true);
      // Section sum should be 2000.00 formatted as Turkish
      expect(sheetContains(sheet, '2.000,00')).toBe(true);
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
