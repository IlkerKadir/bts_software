import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

// ==================== Interfaces ====================

/**
 * Customer-facing quote item - NO internal pricing columns
 */
export interface QuoteItemForExcel {
  itemType: 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SERVICE';
  description: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
}

export interface CommercialTermForExcel {
  category: string;
  value: string;
  sortOrder: number;
}

export interface NoteForExcel {
  text: string;
  sortOrder: number;
}

export interface QuoteDataForExcel {
  quoteNumber: string;
  refNo?: string | null;
  subject?: string | null;
  date: string;
  validUntil?: string | null;
  currency: string;
  company: {
    name: string;
    address?: string | null;
  };
  project?: string | null;
  systemBrand?: string | null;
  items: QuoteItemForExcel[];
  totals: {
    subtotal: number;
    totalVat: number;
    grandTotal: number;
  };
  commercialTerms?: CommercialTermForExcel[];
  notes?: NoteForExcel[];
}

// ==================== Template Constants ====================

const TOTAL_COLUMNS = 5;

const COLUMN_CONFIG = [
  { key: 'pozNo', header: 'POZ NO', width: 8 },
  { key: 'aciklama', header: 'ACIKLAMA', width: 55 },
  { key: 'miktar', header: 'MIKTAR', width: 12 },
  { key: 'birimFiyat', header: 'BIRIM FIYAT', width: 15 },
  { key: 'toplamFiyat', header: 'TOPLAM FIYAT', width: 18 },
];

const COLORS = {
  BTS_RED: 'FFE31E24',
  DARK_HEADER: 'FF1F3864',
  LIGHT_GRAY: 'FFF3F4F6',
  SECTION_GRAY: 'FFD9D9D9',
  BORDER_GRAY: 'FFE5E7EB',
  PROFORMA_ORANGE: 'FFFFE0B2',
  WHITE: 'FFFFFFFF',
  BLACK: 'FF000000',
  TEXT_GRAY: 'FF666666',
};

export interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  contact: string;
  ticaret: string;
}

const BTS_COMPANY_DEFAULT: CompanyInfo = {
  name: 'BTS YANGIN GUVENLIK YAPI TEKNOLOJILERI LTD. STI.',
  address: 'Resitpasa Mah. Katar Cad. Ari 4 Teknokent No:2/2 Ic Kapi No: B-2/205 Sariyer / ISTANBUL',
  phone: 'Tel: 0212 285 60 55  Fax: 0212 285 97 50',
  contact: 'info@btsyangin.com  www.btsyangin.com',
  ticaret: 'Ticaret Sicil No: 776705',
};

const COMMERCIAL_TERM_CATEGORIES = [
  { key: 'URETICI', label: 'URETICI FIRMALAR' },
  { key: 'ONAY', label: 'ONAYLAR' },
  { key: 'GARANTI', label: 'GARANTI' },
  { key: 'TESLIM_YERI', label: 'TESLIM YERI' },
  { key: 'ODEME', label: 'ODEME' },
  { key: 'KDV', label: 'KDV' },
  { key: 'TESLIMAT', label: 'TESLIMAT' },
  { key: 'OPSIYON', label: 'OPSIYON' },
];

// ==================== Helpers ====================

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
    left: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
    bottom: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
    right: { style: 'thin', color: { argb: COLORS.BORDER_GRAY } },
  };
}

function boxBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' },
  };
}

// ==================== ExcelService ====================

export class ExcelService {
  /**
   * Add BTS logo to A1:B4 merged area
   */
  private async addLogo(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet): Promise<void> {
    try {
      const possiblePaths = [
        path.join(process.cwd(), 'public', 'btslogo.png'),
        path.join(process.cwd(), 'btslogo.png'),
      ];

      for (const logoPath of possiblePaths) {
        if (fs.existsSync(logoPath)) {
          const imageId = workbook.addImage({
            filename: logoPath,
            extension: 'png',
          });

          sheet.addImage(imageId, {
            tl: { col: 0, row: 0 },
            ext: { width: 160, height: 70 },
          });
          return;
        }
      }
    } catch (err) {
      // Logo not found or failed to load, continue without it
      console.warn('Excel export: Failed to load BTS logo, continuing without it.', err);
    }
  }

  /**
   * Build BTS company header (rows 1-4)
   * Logo on left (A1:B4), company info on right (C1:E4)
   */
  private buildCompanyHeader(sheet: ExcelJS.Worksheet, companyInfo: CompanyInfo): void {
    // Merge logo area A1:B4
    sheet.mergeCells('A1:B4');

    // Row 1: Company name (C1:E1)
    sheet.mergeCells('C1:E1');
    const nameCell = sheet.getCell('C1');
    nameCell.value = companyInfo.name;
    nameCell.font = { bold: true, size: 11 };
    nameCell.alignment = { vertical: 'middle' };

    // Row 2: Address (C2:E2)
    sheet.mergeCells('C2:E2');
    const addrCell = sheet.getCell('C2');
    addrCell.value = companyInfo.address;
    addrCell.font = { size: 9, color: { argb: COLORS.TEXT_GRAY } };
    addrCell.alignment = { vertical: 'middle', wrapText: true };

    // Row 3: Phone/Fax (C3:E3)
    sheet.mergeCells('C3:E3');
    const phoneCell = sheet.getCell('C3');
    phoneCell.value = companyInfo.phone;
    phoneCell.font = { size: 9, color: { argb: COLORS.TEXT_GRAY } };
    phoneCell.alignment = { vertical: 'middle' };

    // Row 4: Email/Web + Ticaret Sicil (C4:E4)
    sheet.mergeCells('C4:E4');
    const contactCell = sheet.getCell('C4');
    contactCell.value = `${companyInfo.contact}   ${companyInfo.ticaret}`;
    contactCell.font = { size: 9, color: { argb: COLORS.TEXT_GRAY } };
    contactCell.alignment = { vertical: 'middle' };

    // BTS Red accent line under header row 4
    for (let col = 1; col <= TOTAL_COLUMNS; col++) {
      sheet.getCell(4, col).border = {
        bottom: { style: 'medium', color: { argb: COLORS.BTS_RED } },
      };
    }
  }

  /**
   * Build customer block (rows 6-10)
   * Left: company info, Right: PROFORMA FATURA + date/ref/quote
   */
  private buildCustomerBlock(sheet: ExcelJS.Worksheet, data: QuoteDataForExcel): void {
    // Row 6: FIRMA CARI label (A6) + company name (B6:C6) | PROFORMA FATURA (D6:E7)
    sheet.getCell('A6').value = 'FIRMA CARI';
    sheet.getCell('A6').font = { bold: true, size: 9, color: { argb: COLORS.TEXT_GRAY } };
    sheet.getCell('A6').alignment = { vertical: 'middle' };

    sheet.mergeCells('B6:C6');
    const companyCell = sheet.getCell('B6');
    companyCell.value = data.company.name;
    companyCell.font = { bold: true, size: 10 };
    companyCell.alignment = { vertical: 'middle' };

    // PROFORMA FATURA badge (D6:E7 merged)
    sheet.mergeCells('D6:E7');
    const proformaCell = sheet.getCell('D6');
    proformaCell.value = 'PROFORMA FATURA';
    proformaCell.font = { bold: true, size: 14 };
    proformaCell.alignment = { horizontal: 'center', vertical: 'middle' };
    proformaCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.PROFORMA_ORANGE },
    };
    proformaCell.border = boxBorder();

    // Row 7: Company address (A7:C7)
    if (data.company.address) {
      sheet.mergeCells('A7:C7');
      const addrCell = sheet.getCell('A7');
      addrCell.value = data.company.address;
      addrCell.font = { size: 9 };
      addrCell.alignment = { vertical: 'middle', wrapText: true };
    }

    // Row 8: Date, Ref.No, Teklif No in right columns
    // Tarih
    sheet.getCell('D8').value = 'Tarih';
    sheet.getCell('D8').font = { bold: true, size: 9 };
    sheet.getCell('D8').border = boxBorder();
    sheet.getCell('E8').value = data.date;
    sheet.getCell('E8').font = { size: 9 };
    sheet.getCell('E8').alignment = { horizontal: 'center' };
    sheet.getCell('E8').border = boxBorder();

    // Ref.No
    sheet.getCell('D9').value = 'Ref.No';
    sheet.getCell('D9').font = { bold: true, size: 9 };
    sheet.getCell('D9').border = boxBorder();
    sheet.getCell('E9').value = data.refNo || '';
    sheet.getCell('E9').font = { size: 9 };
    sheet.getCell('E9').alignment = { horizontal: 'center' };
    sheet.getCell('E9').border = boxBorder();

    // Teklif No
    sheet.getCell('D10').value = 'Teklif No';
    sheet.getCell('D10').font = { bold: true, size: 9 };
    sheet.getCell('D10').border = boxBorder();
    sheet.getCell('E10').value = data.quoteNumber;
    sheet.getCell('E10').font = { size: 9 };
    sheet.getCell('E10').alignment = { horizontal: 'center' };
    sheet.getCell('E10').border = boxBorder();

    // Row 9: PROJE ADI (left side)
    sheet.getCell('A9').value = 'PROJE ADI';
    sheet.getCell('A9').font = { bold: true, size: 9, color: { argb: COLORS.TEXT_GRAY } };
    sheet.getCell('A9').alignment = { vertical: 'middle' };
    sheet.mergeCells('B9:C9');
    sheet.getCell('B9').value = data.project || '';
    sheet.getCell('B9').font = { size: 9 };
    sheet.getCell('B9').alignment = { vertical: 'middle' };

    // Row 10: MARKA VE SISTEM ADI (left side)
    sheet.getCell('A10').value = 'MARKA VE SISTEM ADI';
    sheet.getCell('A10').font = { bold: true, size: 9, color: { argb: COLORS.TEXT_GRAY } };
    sheet.getCell('A10').alignment = { vertical: 'middle' };
    sheet.mergeCells('B10:C10');
    sheet.getCell('B10').value = data.systemBrand || '';
    sheet.getCell('B10').font = { size: 9 };
    sheet.getCell('B10').alignment = { vertical: 'middle' };
  }

  /**
   * Build column headers row for the product table
   * Dark background, white bold text, 5 columns
   */
  private buildTableHeader(sheet: ExcelJS.Worksheet, row: number): void {
    COLUMN_CONFIG.forEach((col, index) => {
      const cell = sheet.getCell(row, index + 1);
      cell.value = col.header;
      cell.font = { bold: true, color: { argb: COLORS.WHITE }, size: 9 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.DARK_HEADER },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = boxBorder();
    });
    sheet.getRow(row).height = 25;
  }

  /**
   * Build items rows in the product table.
   * - HEADER: bold, merged across full width, gray background
   * - PRODUCT / CUSTOM / SERVICE: POZ NO (sequential), description, quantity, unitPrice, totalPrice
   * - NOTE: italic, merged description spanning full width
   *
   * Returns the next row after all items.
   */
  private buildItemsSection(sheet: ExcelJS.Worksheet, startRow: number, items: QuoteItemForExcel[]): number {
    let currentRow = startRow;
    let pozCounter = 0;

    items.forEach((item) => {
      if (item.itemType === 'HEADER') {
        // Section header - merged across all columns, gray background
        sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
        const cell = sheet.getCell(currentRow, 1);
        cell.value = item.description;
        cell.font = { bold: true, size: 10 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.SECTION_GRAY },
        };
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
        cell.border = thinBorder();
      } else if (item.itemType === 'NOTE') {
        // Note row - italic, merged across all columns
        sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
        const cell = sheet.getCell(currentRow, 1);
        cell.value = item.description;
        cell.font = { italic: true, size: 9, color: { argb: COLORS.TEXT_GRAY } };
        cell.alignment = { wrapText: true, vertical: 'top' };
        cell.border = thinBorder();

        // Auto row height for long notes
        const lineCount = Math.ceil(item.description.length / 80);
        if (lineCount > 1) {
          sheet.getRow(currentRow).height = Math.max(15, lineCount * 15);
        }
      } else {
        // PRODUCT, CUSTOM, SERVICE - standard data row
        pozCounter++;

        // Column A: POZ NO
        const pozCell = sheet.getCell(currentRow, 1);
        pozCell.value = pozCounter;
        pozCell.alignment = { horizontal: 'center', vertical: 'middle' };
        pozCell.border = thinBorder();

        // Column B: ACIKLAMA
        const descCell = sheet.getCell(currentRow, 2);
        descCell.value = item.description;
        descCell.alignment = { wrapText: true, vertical: 'middle' };
        descCell.border = thinBorder();

        // Column C: MIKTAR
        const qtyCell = sheet.getCell(currentRow, 3);
        qtyCell.value = item.quantity ?? 0;
        qtyCell.numFmt = '#,##0';
        qtyCell.alignment = { horizontal: 'center', vertical: 'middle' };
        qtyCell.border = thinBorder();

        // Column D: BIRIM FIYAT
        const unitCell = sheet.getCell(currentRow, 4);
        unitCell.value = item.unitPrice ?? 0;
        unitCell.numFmt = '#,##0.00';
        unitCell.alignment = { horizontal: 'right', vertical: 'middle' };
        unitCell.border = thinBorder();

        // Column E: TOPLAM FIYAT
        const totalCell = sheet.getCell(currentRow, 5);
        totalCell.value = item.totalPrice ?? 0;
        totalCell.numFmt = '#,##0.00';
        totalCell.alignment = { horizontal: 'right', vertical: 'middle' };
        totalCell.border = thinBorder();

        // Auto row height for long descriptions
        const lineCount = Math.ceil(item.description.length / 70);
        if (lineCount > 1) {
          sheet.getRow(currentRow).height = Math.max(15, lineCount * 15);
        }
      }

      currentRow++;
    });

    return currentRow;
  }

  /**
   * Build totals section: Subtotal, KDV, GENEL TOPLAM
   * Right-aligned in the last two columns
   */
  private buildTotalsSection(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    totals: QuoteDataForExcel['totals'],
    currency: string
  ): number {
    let currentRow = startRow + 1; // one blank row

    const labelCol = 4; // Column D
    const valueCol = 5; // Column E

    // Ara Toplam (Subtotal)
    const subtotalLabelCell = sheet.getCell(currentRow, labelCol);
    subtotalLabelCell.value = 'Ara Toplam:';
    subtotalLabelCell.font = { bold: true, size: 10 };
    subtotalLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const subtotalValueCell = sheet.getCell(currentRow, valueCol);
    subtotalValueCell.value = totals.subtotal;
    subtotalValueCell.numFmt = '#,##0.00';
    subtotalValueCell.alignment = { horizontal: 'right', vertical: 'middle' };
    subtotalValueCell.border = thinBorder();
    currentRow++;

    // KDV
    const kdvLabelCell = sheet.getCell(currentRow, labelCol);
    kdvLabelCell.value = 'KDV:';
    kdvLabelCell.font = { bold: true, size: 10 };
    kdvLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const kdvValueCell = sheet.getCell(currentRow, valueCol);
    kdvValueCell.value = totals.totalVat;
    kdvValueCell.numFmt = '#,##0.00';
    kdvValueCell.alignment = { horizontal: 'right', vertical: 'middle' };
    kdvValueCell.border = thinBorder();
    currentRow++;

    // GENEL TOPLAM (Grand Total) - highlighted with BTS Red
    const gtLabelCell = sheet.getCell(currentRow, labelCol);
    gtLabelCell.value = 'GENEL TOPLAM:';
    gtLabelCell.font = { bold: true, size: 11 };
    gtLabelCell.alignment = { horizontal: 'right', vertical: 'middle' };

    const gtValueCell = sheet.getCell(currentRow, valueCol);
    gtValueCell.value = totals.grandTotal;
    gtValueCell.numFmt = `#,##0.00 "${currency}"`;
    gtValueCell.font = { bold: true, size: 11, color: { argb: COLORS.WHITE } };
    gtValueCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.BTS_RED },
    };
    gtValueCell.alignment = { horizontal: 'right', vertical: 'middle' };
    gtValueCell.border = {
      top: { style: 'medium' },
      left: { style: 'medium' },
      bottom: { style: 'medium' },
      right: { style: 'medium' },
    };
    currentRow++;

    return currentRow;
  }

  /**
   * Build commercial terms section.
   * TICARI SARTLAR header, then each category with bold title + content rows.
   */
  private buildCommercialTermsSection(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    commercialTerms: CommercialTermForExcel[]
  ): number {
    let currentRow = startRow + 2; // gap

    // TICARI SARTLAR header
    sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
    const headerCell = sheet.getCell(currentRow, 1);
    headerCell.value = 'TICARI SARTLAR';
    headerCell.font = { bold: true, size: 11 };
    headerCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.LIGHT_GRAY },
    };
    headerCell.alignment = { vertical: 'middle' };
    headerCell.border = {
      bottom: { style: 'medium', color: { argb: COLORS.BTS_RED } },
    };
    currentRow++;

    // Group terms by category
    const termsByCategory = new Map<string, CommercialTermForExcel[]>();
    commercialTerms.forEach((term) => {
      const existing = termsByCategory.get(term.category) || [];
      existing.push(term);
      termsByCategory.set(term.category, existing);
    });

    // Render each category in defined order
    COMMERCIAL_TERM_CATEGORIES.forEach(({ key, label }) => {
      const terms = termsByCategory.get(key);
      if (terms && terms.length > 0) {
        // Category title row - bold, merged
        sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
        const titleCell = sheet.getCell(currentRow, 1);
        titleCell.value = label;
        titleCell.font = { bold: true, size: 10 };
        titleCell.alignment = { vertical: 'middle' };
        currentRow++;

        // Each term value
        terms
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .forEach((term) => {
            sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
            const valCell = sheet.getCell(currentRow, 1);
            valCell.value = term.value;
            valCell.font = { size: 9 };
            valCell.alignment = { wrapText: true, vertical: 'top' };

            const lineCount = Math.ceil(term.value.length / 100);
            if (lineCount > 1) {
              sheet.getRow(currentRow).height = Math.max(15, lineCount * 15);
            }
            currentRow++;
          });
      }
    });

    return currentRow;
  }

  /**
   * Build notes section.
   * NOTLAR header, then numbered notes.
   */
  private buildNotesSection(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    notes: NoteForExcel[]
  ): number {
    if (notes.length === 0) return startRow;

    let currentRow = startRow + 1; // gap

    // NOTLAR header
    sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
    const headerCell = sheet.getCell(currentRow, 1);
    headerCell.value = 'NOTLAR';
    headerCell.font = { bold: true, size: 11 };
    headerCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.LIGHT_GRAY },
    };
    headerCell.alignment = { vertical: 'middle' };
    headerCell.border = {
      bottom: { style: 'medium', color: { argb: COLORS.BTS_RED } },
    };
    currentRow++;

    // Numbered notes
    notes
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .forEach((note, index) => {
        // Number in column A
        sheet.getCell(currentRow, 1).value = index + 1;
        sheet.getCell(currentRow, 1).alignment = { horizontal: 'center', vertical: 'top' };
        sheet.getCell(currentRow, 1).font = { bold: true, size: 9 };

        // Note text merged B:E
        sheet.mergeCells(currentRow, 2, currentRow, TOTAL_COLUMNS);
        const noteCell = sheet.getCell(currentRow, 2);
        noteCell.value = note.text;
        noteCell.font = { size: 9 };
        noteCell.alignment = { wrapText: true, vertical: 'top' };

        const lineCount = Math.ceil(note.text.length / 90);
        if (lineCount > 1) {
          sheet.getRow(currentRow).height = Math.max(15, lineCount * 15);
        }
        currentRow++;
      });

    return currentRow;
  }

  /**
   * Generate the complete proforma fatura Excel file.
   * @param data - Quote data for the Excel file
   * @param companyInfo - Optional company info override. Falls back to BTS defaults.
   */
  async generateQuoteExcel(data: QuoteDataForExcel, companyInfo?: CompanyInfo): Promise<Buffer> {
    const resolvedCompanyInfo = companyInfo || BTS_COMPANY_DEFAULT;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BTS Teklif Sistemi';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Teklif');

    // Set column widths
    sheet.columns = COLUMN_CONFIG.map((col) => ({
      key: col.key,
      width: col.width,
    }));

    // Add logo
    await this.addLogo(workbook, sheet);

    // --- Section 1: BTS Company Header (rows 1-4) ---
    this.buildCompanyHeader(sheet, resolvedCompanyInfo);

    // --- Section 2: Customer Block (rows 6-10) ---
    this.buildCustomerBlock(sheet, data);

    // --- Section 3: Product Table ---
    const tableHeaderRow = 12;
    this.buildTableHeader(sheet, tableHeaderRow);

    const dataStartRow = tableHeaderRow + 1;
    const itemsEndRow = this.buildItemsSection(sheet, dataStartRow, data.items);

    // --- Section 4: Totals ---
    const totalsEndRow = this.buildTotalsSection(sheet, itemsEndRow, data.totals, data.currency);

    // --- Section 5: Commercial Terms ---
    let afterTermsRow = totalsEndRow;
    if (data.commercialTerms && data.commercialTerms.length > 0) {
      afterTermsRow = this.buildCommercialTermsSection(sheet, totalsEndRow, data.commercialTerms);
    }

    // --- Section 6: Notes ---
    if (data.notes && data.notes.length > 0) {
      this.buildNotesSection(sheet, afterTermsRow, data.notes);
    }

    // --- Print Setup ---
    sheet.pageSetup.orientation = 'landscape';
    sheet.pageSetup.fitToPage = true;
    sheet.pageSetup.fitToWidth = 1;
    sheet.pageSetup.fitToHeight = 0;
    sheet.pageSetup.margins = {
      left: 0.5,
      right: 0.5,
      top: 0.5,
      bottom: 0.5,
      header: 0.3,
      footer: 0.3,
    };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}

// Singleton
let excelServiceInstance: ExcelService | null = null;

export function getExcelService(): ExcelService {
  if (!excelServiceInstance) {
    excelServiceInstance = new ExcelService();
  }
  return excelServiceInstance;
}
