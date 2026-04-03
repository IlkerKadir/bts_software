import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

// ==================== Interfaces ====================

/**
 * Quote item for Excel export.
 * Includes customer-facing columns AND internal pricing columns (katsayı, listPrice).
 * The Excel groups them under "TEKLİF SATIŞ FİYATLARI" and "TEKLİF HAZIRLAMA".
 */
export interface QuoteItemForExcel {
  itemType: 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SET' | 'SUBTOTAL';
  description: string;
  quantity?: number;
  unit?: string | null;
  unitPrice?: number;
  totalPrice?: number;
  katsayi?: number;
  listPrice?: number;
}

export interface CommercialTermForExcel {
  category: string;
  value: string;
  sortOrder: number;
  highlight?: boolean;
}

export interface NoteForExcel {
  text: string;
  sortOrder: number;
  highlight?: boolean;
}

export interface QuoteDataForExcel {
  quoteNumber: string;
  refNo?: string | null;
  subject?: string | null;
  description?: string | null;
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

const TOTAL_COLUMNS = 8;

/**
 * 8-column layout matching the client-requested order:
 * Poz No | Açıklama | Miktar | Birim | Birim Fiyat | Toplam Fiyat | Katsayı | Liste Fiyatı
 *
 * Columns 1-6: "TEKLİF SATIŞ FİYATLARI"  (customer-facing)
 * Columns 7-8: "TEKLİF HAZIRLAMA"          (internal pricing)
 */
const COLUMN_CONFIG = [
  { key: 'pozNo', header: 'POZ NO', width: 8 },
  { key: 'aciklama', header: 'AÇIKLAMA', width: 48 },
  { key: 'miktar', header: 'MİKTAR', width: 10 },
  { key: 'birim', header: 'BİRİM', width: 8 },
  { key: 'birimFiyat', header: 'BİRİM FİYAT', width: 15 },
  { key: 'toplamFiyat', header: 'TOPLAM FİYAT', width: 16 },
  { key: 'katsayi', header: 'KATSAYI', width: 10 },
  { key: 'listeFiyati', header: 'LİSTE FİYATI', width: 15 },
];

const COLORS = {
  SECTION_GREEN: 'FFC6E0B4',
  WHITE: 'FFFFFFFF',
  BLACK: 'FF000000',
  LIGHT_BLUE: 'FFD6E4F0',   // Group header: TEKLİF SATIŞ FİYATLARI
  LIGHT_ORANGE: 'FFFCE4D6',  // Group header: TEKLİF HAZIRLAMA
  HEADER_GRAY: 'FFF2F2F2',   // Column header row background
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '\u20AC', // €
  USD: '$',
  GBP: '\u00A3', // £
  TRY: '\u20BA', // ₺
};

const CURRENCY_NAMES: Record<string, string> = {
  EUR: 'EURO',
  USD: 'USD',
  GBP: 'GBP',
  TRY: 'TRY',
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

/**
 * Category keys in display order for commercial terms.
 * DAHIL_OLMAYAN is rendered ABOVE the TİCARİ ŞARTLAR heading (same as PDF).
 * NOTLAR is rendered as numbered items at the bottom.
 */
const COMMERCIAL_TERM_CATEGORIES = [
  { key: 'DAHIL_OLMAYAN', label: 'Dahil Olmayan Hizmetler:' },
  { key: 'uretici_firmalar', label: 'ÜRETİCİ FİRMALAR' },
  { key: 'onaylar', label: 'ONAYLAR' },
  { key: 'garanti', label: 'GARANTİ' },
  { key: 'teslim_yeri', label: 'TESLİM YERİ' },
  { key: 'odeme', label: 'ÖDEME' },
  { key: 'kdv', label: 'KDV' },
  { key: 'teslimat', label: 'TESLİMAT' },
  { key: 'opsiyon', label: 'OPSİYON' },
  { key: 'NOTLAR', label: 'NOTLAR' },
];

// ==================== Helpers ====================

function blackBoxBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: COLORS.BLACK } },
    left: { style: 'thin', color: { argb: COLORS.BLACK } },
    bottom: { style: 'thin', color: { argb: COLORS.BLACK } },
    right: { style: 'thin', color: { argb: COLORS.BLACK } },
  };
}

function noBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: undefined },
    left: { style: undefined },
    bottom: { style: undefined },
    right: { style: undefined },
  };
}

function unitAbbr(unit: string): string {
  switch (unit) {
    case 'Adet': return 'Ad.';
    case 'Metre': return 'mt.';
    case 'Set': return 'Set';
    default: return unit;
  }
}

/**
 * Format a number using Turkish locale: dot for thousands, comma for decimals.
 * Appends the currency symbol after the number (matching PDF).
 */
function formatTurkishCurrency(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  const formatted = amount.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${symbol}`;
}

/**
 * Compute the section sum for a SUBTOTAL row.
 * Sums totalPrice of all priced items (PRODUCT, CUSTOM, SET) between
 * the previous SUBTOTAL (or start of list) and this SUBTOTAL row.
 */
function computeExcelSubtotalSum(items: QuoteItemForExcel[], subtotalIndex: number): number {
  let sum = 0;
  for (let i = subtotalIndex - 1; i >= 0; i--) {
    const item = items[i];
    if (item.itemType === 'SUBTOTAL') break;
    if (
      item.itemType === 'PRODUCT' ||
      item.itemType === 'CUSTOM' ||
      item.itemType === 'SET'
    ) {
      sum += item.totalPrice ?? 0;
    }
  }
  return sum;
}

// ==================== ExcelService ====================

export class ExcelService {
  /**
   * Add BTS logo to the A1:B4 merged area (small logo, not full banner).
   * Full banner images don't render well in Excel — they float over cells
   * and don't scale properly for printing. Logo + text is more reliable.
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
      console.warn('Excel export: Failed to load logo, continuing without it.', err);
    }
  }

  /**
   * Build BTS company header (rows 1-4) as fallback text when no image.
   */
  private buildCompanyHeaderText(sheet: ExcelJS.Worksheet, companyInfo: CompanyInfo): void {
    // Merge logo area A1:B4 with border
    sheet.mergeCells('A1:B4');
    const logoCell = sheet.getCell('A1');
    logoCell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };

    // Row 1: Company name (C1:H1)
    sheet.mergeCells('C1:H1');
    const nameCell = sheet.getCell('C1');
    nameCell.value = companyInfo.name;
    nameCell.font = { bold: true, size: 10 };
    nameCell.alignment = { vertical: 'middle' };
    nameCell.border = { top: { style: 'thin' }, right: { style: 'thin' } };

    // Row 2: Address (C2:H2)
    sheet.mergeCells('C2:H2');
    const addrCell = sheet.getCell('C2');
    addrCell.value = companyInfo.address;
    addrCell.font = { size: 8, color: { argb: 'FF666666' } };
    addrCell.alignment = { vertical: 'middle', wrapText: true };
    addrCell.border = { right: { style: 'thin' } };

    // Row 3: Phone/Fax (C3:H3)
    sheet.mergeCells('C3:H3');
    const phoneCell = sheet.getCell('C3');
    phoneCell.value = companyInfo.phone;
    phoneCell.font = { size: 8, color: { argb: 'FF666666' } };
    phoneCell.alignment = { vertical: 'middle' };
    phoneCell.border = { right: { style: 'thin' } };

    // Row 4: Email/Web + Ticaret Sicil (C4:H4)
    sheet.mergeCells('C4:H4');
    const contactCell = sheet.getCell('C4');
    contactCell.value = `${companyInfo.contact}   ${companyInfo.ticaret}`;
    contactCell.font = { size: 8, color: { argb: 'FF666666' } };
    contactCell.alignment = { vertical: 'middle' };
    contactCell.border = { bottom: { style: 'thin' }, right: { style: 'thin' } };
  }

  /**
   * Build customer info block (rows 6-10) matching PDF layout.
   * Left: company name (bold), address, project, subject, description (A-F)
   * Right: PROFORMA FATURA centered, then Tarih/Ref.No/Teklif No with borders (G-H)
   */
  private buildCustomerBlock(sheet: ExcelJS.Worksheet, data: QuoteDataForExcel): void {
    // --- LEFT SIDE: Customer info (A6:F10) ---
    // Row 6: Company name (bold)
    sheet.mergeCells('A6:F6');
    const companyCell = sheet.getCell('A6');
    companyCell.value = data.company.name;
    companyCell.font = { bold: true, size: 9 };
    companyCell.alignment = { vertical: 'middle' };
    companyCell.border = { left: blackBoxBorder().left, top: blackBoxBorder().top, right: blackBoxBorder().right };

    // Row 7: Address
    sheet.mergeCells('A7:F7');
    const addrCell = sheet.getCell('A7');
    addrCell.value = data.company.address || '';
    addrCell.font = { size: 8 };
    addrCell.alignment = { vertical: 'middle', wrapText: true };
    addrCell.border = { left: blackBoxBorder().left, right: blackBoxBorder().right };

    // Row 8: Project name
    sheet.mergeCells('A8:F8');
    const projectCell = sheet.getCell('A8');
    projectCell.value = data.project || '';
    projectCell.font = { bold: true, size: 8 };
    projectCell.alignment = { vertical: 'middle' };
    projectCell.border = { left: blackBoxBorder().left, right: blackBoxBorder().right };

    // Row 9: Subject
    sheet.mergeCells('A9:F9');
    const subjCell = sheet.getCell('A9');
    subjCell.value = data.subject || '';
    subjCell.font = { bold: true, size: 8 };
    subjCell.alignment = { vertical: 'middle' };
    subjCell.border = { left: blackBoxBorder().left, right: blackBoxBorder().right };

    // Row 10: Description
    sheet.mergeCells('A10:F10');
    const descCell = sheet.getCell('A10');
    descCell.value = data.description || '';
    descCell.font = { bold: true, size: 8 };
    descCell.alignment = { vertical: 'middle' };
    descCell.border = { left: blackBoxBorder().left, bottom: blackBoxBorder().bottom, right: blackBoxBorder().right };

    // --- RIGHT SIDE: PROFORMA FATURA + date/ref/quote (G6:H10) ---
    // Row 6-7: PROFORMA FATURA centered
    sheet.mergeCells('G6:H7');
    const proformaCell = sheet.getCell('G6');
    proformaCell.value = 'PROFORMA FATURA';
    proformaCell.font = { bold: true, size: 12 };
    proformaCell.alignment = { horizontal: 'center', vertical: 'middle' };
    proformaCell.border = {
      top: blackBoxBorder().top,
      left: blackBoxBorder().left,
      right: blackBoxBorder().right,
      bottom: blackBoxBorder().bottom,
    };

    // Row 8: Tarih
    sheet.getCell('G8').value = 'Tarih';
    sheet.getCell('G8').font = { bold: true, size: 8 };
    sheet.getCell('G8').border = blackBoxBorder();
    sheet.getCell('G8').alignment = { vertical: 'middle' };
    sheet.getCell('H8').value = data.date;
    sheet.getCell('H8').font = { size: 8 };
    sheet.getCell('H8').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell('H8').border = blackBoxBorder();

    // Row 9: Ref.No
    sheet.getCell('G9').value = 'Ref.No';
    sheet.getCell('G9').font = { bold: true, size: 8 };
    sheet.getCell('G9').border = blackBoxBorder();
    sheet.getCell('G9').alignment = { vertical: 'middle' };
    sheet.getCell('H9').value = data.refNo || '';
    sheet.getCell('H9').font = { size: 8 };
    sheet.getCell('H9').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell('H9').border = blackBoxBorder();

    // Row 10: Teklif No
    sheet.getCell('G10').value = 'Teklif No';
    sheet.getCell('G10').font = { bold: true, size: 8 };
    sheet.getCell('G10').border = blackBoxBorder();
    sheet.getCell('G10').alignment = { vertical: 'middle' };
    sheet.getCell('H10').value = data.quoteNumber;
    sheet.getCell('H10').font = { size: 8 };
    sheet.getCell('H10').alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell('H10').border = blackBoxBorder();
  }

  /**
   * Build group header row + column headers row for the product table.
   *
   * Row `groupRow`: Two merged group headers
   *   - Columns 1-6: "TEKLİF SATIŞ FİYATLARI" (light blue)
   *   - Columns 7-8: "TEKLİF HAZIRLAMA" (light orange)
   *
   * Row `headerRow` (groupRow + 1): Individual column headers with borders.
   *
   * Returns the header row number (where column names are).
   */
  private buildTableHeader(sheet: ExcelJS.Worksheet, groupRow: number): number {
    const headerRow = groupRow + 1;

    // --- Group header row ---
    // "TEKLİF SATIŞ FİYATLARI" spanning columns 1-6 (Poz No through Toplam Fiyat)
    sheet.mergeCells(groupRow, 1, groupRow, 6);
    const salesGroupCell = sheet.getCell(groupRow, 1);
    salesGroupCell.value = 'TEKLİF SATIŞ FİYATLARI';
    salesGroupCell.font = { bold: true, size: 9 };
    salesGroupCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.LIGHT_BLUE },
    };
    salesGroupCell.alignment = { horizontal: 'center', vertical: 'middle' };
    salesGroupCell.border = blackBoxBorder();

    // "TEKLİF HAZIRLAMA" spanning columns 7-8 (Katsayı, Liste Fiyatı)
    sheet.mergeCells(groupRow, 7, groupRow, 8);
    const prepGroupCell = sheet.getCell(groupRow, 7);
    prepGroupCell.value = 'TEKLİF HAZIRLAMA';
    prepGroupCell.font = { bold: true, size: 9 };
    prepGroupCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.LIGHT_ORANGE },
    };
    prepGroupCell.alignment = { horizontal: 'center', vertical: 'middle' };
    prepGroupCell.border = blackBoxBorder();

    sheet.getRow(groupRow).height = 18;

    // --- Column header row ---
    COLUMN_CONFIG.forEach((col, index) => {
      const cell = sheet.getCell(headerRow, index + 1);
      cell.value = col.header;
      cell.font = { bold: true, size: 8 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.HEADER_GRAY },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = blackBoxBorder();
    });
    sheet.getRow(headerRow).height = 20;

    return headerRow;
  }

  /**
   * Build items rows in the product table matching PDF format.
   * 8 columns: Poz No | Açıklama | Miktar | Birim | Birim Fiyat | Toplam Fiyat | Katsayı | Liste Fiyatı
   *
   * - HEADER: green background (#C6E0B4), centered description, no borders
   * - PRODUCT / CUSTOM / SET: sequential POZ NO, no borders, Turkish currency format
   * - NOTE: "NOT:" in POZ NO column, description merged across remaining columns
   * - SUBTOTAL: "Ara Toplam" right-aligned with value in Toplam Fiyat column
   *
   * Returns the next row after all items.
   */
  private buildItemsSection(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    items: QuoteItemForExcel[],
    currency: string
  ): number {
    let currentRow = startRow;
    let pozCounter = 0;

    items.forEach((item, index) => {
      if (item.itemType === 'HEADER') {
        // Section header - green background, no borders (matching PDF #C6E0B4)
        for (let col = 1; col <= TOTAL_COLUMNS; col++) {
          const cell = sheet.getCell(currentRow, col);
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: COLORS.SECTION_GREEN },
          };
          cell.border = noBorder();
        }
        // Description centered in column B
        sheet.getCell(currentRow, 2).value = item.description;
        sheet.getCell(currentRow, 2).font = { bold: true, size: 8 };
        sheet.getCell(currentRow, 2).alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (item.itemType === 'NOTE') {
        // Note row - "NOT:" in POZ NO column, description in merged remaining cols
        const pozCell = sheet.getCell(currentRow, 1);
        pozCell.value = 'NOT:';
        pozCell.font = { bold: true, size: 7 };
        pozCell.alignment = { horizontal: 'center', vertical: 'middle' };
        pozCell.border = noBorder();

        sheet.mergeCells(currentRow, 2, currentRow, TOTAL_COLUMNS);
        const descCell = sheet.getCell(currentRow, 2);
        descCell.value = item.description;
        descCell.font = { size: 7 };
        descCell.alignment = { wrapText: true, vertical: 'top' };
        descCell.border = noBorder();

        // Auto row height for long notes
        const lineCount = Math.ceil(item.description.length / 80);
        if (lineCount > 1) {
          sheet.getRow(currentRow).height = Math.max(15, lineCount * 15);
        }
      } else if (item.itemType === 'SUBTOTAL') {
        // SUBTOTAL row - "Ara Toplam" right-aligned with computed section sum
        const sectionSum = computeExcelSubtotalSum(items, index);

        // Merge columns A-E (Poz No through Birim Fiyat) for the label
        sheet.mergeCells(currentRow, 1, currentRow, 5);
        const labelCell = sheet.getCell(currentRow, 1);
        labelCell.value = item.description || 'Ara Toplam';
        labelCell.font = { bold: true, size: 8 };
        labelCell.alignment = { horizontal: 'right', vertical: 'middle' };
        labelCell.border = noBorder();

        // Column 6 (Toplam Fiyat): section sum value
        const sumCell = sheet.getCell(currentRow, 6);
        sumCell.value = formatTurkishCurrency(sectionSum, currency);
        sumCell.font = { bold: true, size: 8 };
        sumCell.alignment = { horizontal: 'right', vertical: 'middle' };
        sumCell.border = noBorder();

        // Columns 7-8 empty for subtotal rows
        for (let col = 7; col <= TOTAL_COLUMNS; col++) {
          sheet.getCell(currentRow, col).border = noBorder();
        }
      } else {
        // PRODUCT, CUSTOM, SET - standard data row, no borders
        pozCounter++;

        // Column 1: POZ NO
        const pozCell = sheet.getCell(currentRow, 1);
        pozCell.value = pozCounter;
        pozCell.font = { bold: true, size: 7 };
        pozCell.alignment = { horizontal: 'center', vertical: 'middle' };
        pozCell.border = noBorder();

        // Column 2: AÇIKLAMA
        const descCell = sheet.getCell(currentRow, 2);
        descCell.value = item.description;
        descCell.font = { size: 7 };
        descCell.alignment = { wrapText: true, vertical: 'middle' };
        descCell.border = noBorder();

        // Column 3: MİKTAR (number only)
        const qtyCell = sheet.getCell(currentRow, 3);
        qtyCell.value = item.quantity ?? 0;
        qtyCell.font = { size: 7 };
        qtyCell.alignment = { horizontal: 'center', vertical: 'middle' };
        qtyCell.border = noBorder();

        // Column 4: BİRİM (unit abbreviation)
        const unit = item.unit || 'Adet';
        const unitCell = sheet.getCell(currentRow, 4);
        unitCell.value = unitAbbr(unit);
        unitCell.font = { size: 7 };
        unitCell.alignment = { horizontal: 'center', vertical: 'middle' };
        unitCell.border = noBorder();

        // Column 5: BİRİM FİYAT (Turkish currency format)
        const unitPriceCell = sheet.getCell(currentRow, 5);
        unitPriceCell.value = formatTurkishCurrency(item.unitPrice ?? 0, currency);
        unitPriceCell.font = { size: 7 };
        unitPriceCell.alignment = { horizontal: 'right', vertical: 'middle' };
        unitPriceCell.border = noBorder();

        // Column 6: TOPLAM FİYAT (Turkish currency format)
        const totalCell = sheet.getCell(currentRow, 6);
        totalCell.value = formatTurkishCurrency(item.totalPrice ?? 0, currency);
        totalCell.font = { size: 7 };
        totalCell.alignment = { horizontal: 'right', vertical: 'middle' };
        totalCell.border = noBorder();

        // Column 7: KATSAYI
        const katsayiCell = sheet.getCell(currentRow, 7);
        if (item.itemType === 'SET') {
          // SET rows show "-" for katsayı (per client request)
          katsayiCell.value = '-';
        } else {
          katsayiCell.value = item.katsayi != null ? Number(item.katsayi.toFixed(3)) : '-';
        }
        katsayiCell.font = { size: 7 };
        katsayiCell.alignment = { horizontal: 'center', vertical: 'middle' };
        katsayiCell.border = noBorder();

        // Column 8: LİSTE FİYATI (Turkish currency format)
        const listPriceCell = sheet.getCell(currentRow, 8);
        if (item.itemType === 'SET') {
          // SET rows show "-" for liste fiyatı (per client request)
          listPriceCell.value = '-';
        } else {
          listPriceCell.value = item.listPrice != null
            ? formatTurkishCurrency(item.listPrice, currency)
            : '-';
        }
        listPriceCell.font = { size: 7 };
        listPriceCell.alignment = { horizontal: 'right', vertical: 'middle' };
        listPriceCell.border = noBorder();

        // Auto row height for long descriptions
        const lineCount = Math.ceil(item.description.length / 60);
        if (lineCount > 1) {
          sheet.getRow(currentRow).height = Math.max(15, lineCount * 15);
        }
      }

      currentRow++;
    });

    return currentRow;
  }

  /**
   * Build system grand total row matching PDF format.
   * Label: "SİSTEM GENEL TOPLAMI (CURRENCY)" with black borders.
   * Merged across columns 1-5, value in column 6, columns 7-8 empty.
   */
  private buildTotalsSection(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    totals: QuoteDataForExcel['totals'],
    currency: string
  ): number {
    let currentRow = startRow + 1; // one blank row

    const currencyName = CURRENCY_NAMES[currency] || currency;

    // SİSTEM GENEL TOPLAMI (CURRENCY) - merged cols 1-5 for label, col 6 for value
    sheet.mergeCells(currentRow, 1, currentRow, 5);
    const labelCell = sheet.getCell(currentRow, 1);
    labelCell.value = `SİSTEM GENEL TOPLAMI (${currencyName})`;
    labelCell.font = { bold: true, size: 9 };
    labelCell.alignment = { horizontal: 'right', vertical: 'middle' };
    labelCell.border = blackBoxBorder();

    const valueCell = sheet.getCell(currentRow, 6);
    valueCell.value = formatTurkishCurrency(totals.grandTotal, currency);
    valueCell.font = { bold: true, size: 9 };
    valueCell.alignment = { horizontal: 'right', vertical: 'middle' };
    valueCell.border = blackBoxBorder();

    // Columns 7-8: empty but with border for consistency
    for (let col = 7; col <= TOTAL_COLUMNS; col++) {
      const cell = sheet.getCell(currentRow, col);
      cell.border = blackBoxBorder();
    }

    currentRow++;

    return currentRow;
  }

  /**
   * Build commercial terms and NOTLAR sections matching PDF structure.
   * DAHIL_OLMAYAN renders ABOVE the "TİCARİ ŞARTLAR" heading.
   * uretici_firmalar: each term on its own line.
   * onaylar: all terms comma-joined on a single line.
   * NOTLAR: numbered items at the bottom.
   */
  private buildCommercialTermsSection(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    commercialTerms: CommercialTermForExcel[],
    notes?: NoteForExcel[]
  ): number {
    let currentRow = startRow + 1; // gap

    // Group terms by category
    const termsByCategory = new Map<string, CommercialTermForExcel[]>();
    commercialTerms.forEach((term) => {
      const existing = termsByCategory.get(term.category) || [];
      existing.push(term);
      termsByCategory.set(term.category, existing);
    });

    // 1) DAHIL_OLMAYAN — rendered ABOVE the TİCARİ ŞARTLAR heading
    const dahilOlmayan = termsByCategory.get('DAHIL_OLMAYAN');
    if (dahilOlmayan && dahilOlmayan.length > 0) {
      sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
      const titleCell = sheet.getCell(currentRow, 1);
      titleCell.value = 'Dahil Olmayan Hizmetler:';
      titleCell.font = { bold: true, size: 9 };
      titleCell.alignment = { vertical: 'middle' };
      currentRow++;

      dahilOlmayan
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .forEach((term) => {
          sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
          const valCell = sheet.getCell(currentRow, 1);
          valCell.value = `    ${term.value}`;
          valCell.font = { size: 8 };
          valCell.alignment = { wrapText: true, vertical: 'top' };
          currentRow++;
        });
    }

    // 2) Determine if we have standard commercial terms to show
    const standardCatKeys = ['uretici_firmalar', 'onaylar', 'garanti', 'teslim_yeri', 'odeme', 'kdv', 'teslimat', 'opsiyon'];
    const hasStandardTerms = standardCatKeys.some((key) => termsByCategory.has(key));

    if (hasStandardTerms) {
      // TİCARİ ŞARTLAR heading
      sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
      const headerCell = sheet.getCell(currentRow, 1);
      headerCell.value = 'TİCARİ ŞARTLAR';
      headerCell.font = { bold: true, size: 9 };
      headerCell.alignment = { vertical: 'middle' };
      currentRow++;
    }

    // 3) Render each category in defined order (skip DAHIL_OLMAYAN and NOTLAR here)
    for (const { key, label } of COMMERCIAL_TERM_CATEGORIES) {
      if (key === 'DAHIL_OLMAYAN' || key === 'NOTLAR') continue;

      const terms = termsByCategory.get(key);
      if (!terms || terms.length === 0) continue;

      // Category title row - bold
      sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
      const titleCell = sheet.getCell(currentRow, 1);
      titleCell.value = `    ${label}`;
      titleCell.font = { bold: true, size: 8 };
      titleCell.alignment = { vertical: 'middle' };
      currentRow++;

      if (key === 'onaylar') {
        // onaylar: ALL terms comma-joined on a single line
        const joined = terms
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((t) => t.value)
          .join(', ');
        sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
        const valCell = sheet.getCell(currentRow, 1);
        valCell.value = `    ${joined}`;
        valCell.font = { size: 8 };
        valCell.alignment = { wrapText: true, vertical: 'top' };
        currentRow++;
      } else if (key === 'uretici_firmalar') {
        // uretici_firmalar: parse JSON brand→systems map, render as "BRAND - SYSTEM1, SYSTEM2" per line
        terms
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .forEach((term) => {
            let lines: string[] = [];
            try {
              const parsed = JSON.parse(term.value) as Record<string, string[]>;
              for (const [brand, systems] of Object.entries(parsed)) {
                lines.push(systems.length > 0 ? `${brand} - ${systems.join(', ')}` : brand);
              }
            } catch {
              lines = [term.value];
            }
            for (const line of lines) {
              sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
              const valCell = sheet.getCell(currentRow, 1);
              valCell.value = `    ${line}`;
              valCell.font = { size: 8 };
              valCell.alignment = { wrapText: true, vertical: 'top' };
              currentRow++;
            }
          });
      } else {
        // Single-value categories: each value as a row
        terms
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .forEach((term) => {
            sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
            const valCell = sheet.getCell(currentRow, 1);
            valCell.value = `    ${term.value}`;
            valCell.font = { size: 8 };
            valCell.alignment = { wrapText: true, vertical: 'top' };

            const lineCount = Math.ceil(term.value.length / 100);
            if (lineCount > 1) {
              sheet.getRow(currentRow).height = Math.max(15, lineCount * 15);
            }
            currentRow++;
          });
      }
    }

    // 4) NOTLAR — merge from commercial terms NOTLAR category and legacy notes
    const notlarFromTerms = termsByCategory.get('NOTLAR') || [];
    const allNotes: { text: string; highlight: boolean; sortOrder: number }[] = [];

    notlarFromTerms.forEach((entry, idx) => {
      allNotes.push({
        text: entry.value,
        highlight: entry.highlight ?? false,
        sortOrder: entry.sortOrder ?? idx + 1,
      });
    });

    // Legacy notes (from the separate notes array — only add if not already included via terms)
    if (notes && notes.length > 0 && notlarFromTerms.length === 0) {
      for (const note of notes) {
        allNotes.push({
          text: note.text,
          highlight: note.highlight ?? false,
          sortOrder: note.sortOrder,
        });
      }
    }

    if (allNotes.length > 0) {
      const sorted = [...allNotes].sort((a, b) => a.sortOrder - b.sortOrder);

      // NOTLAR heading
      sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
      const notlarHeader = sheet.getCell(currentRow, 1);
      notlarHeader.value = '    NOTLAR';
      notlarHeader.font = { bold: true, size: 9 };
      notlarHeader.alignment = { vertical: 'middle' };
      currentRow++;

      // Numbered notes
      sorted.forEach((note, i) => {
        // Number in column A
        const numCell = sheet.getCell(currentRow, 1);
        numCell.value = i + 1;
        numCell.alignment = { horizontal: 'right', vertical: 'top' };
        numCell.font = { bold: true, size: 8 };

        if (note.highlight) {
          numCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFF00' },
          };
        }

        // Note text merged B:E
        sheet.mergeCells(currentRow, 2, currentRow, TOTAL_COLUMNS);
        const noteCell = sheet.getCell(currentRow, 2);
        noteCell.value = note.text;
        noteCell.font = { size: 8 };
        noteCell.alignment = { wrapText: true, vertical: 'top' };

        if (note.highlight) {
          noteCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFF00' },
          };
        }

        const lineCount = Math.ceil(note.text.length / 90);
        if (lineCount > 1) {
          sheet.getRow(currentRow).height = Math.max(15, lineCount * 15);
        }
        currentRow++;
      });
    }

    return currentRow;
  }

  /**
   * Generate the complete proforma fatura Excel file matching PDF format.
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

    // --- Section 1: Header Image / Company Info (rows 1-4) ---
    // Always write the company text (for fallback / accessibility).
    // If a header image exists, it floats on top of the text cells.
    this.buildCompanyHeaderText(sheet, resolvedCompanyInfo);
    await this.addLogo(workbook, sheet);

    // --- Section 2: Customer Block (rows 6-10) ---
    this.buildCustomerBlock(sheet, data);

    // --- Section 3: Product Table ---
    // Row 12: group headers (TEKLİF SATIŞ FİYATLARI / TEKLİF HAZIRLAMA)
    // Row 13: column headers (POZ NO, AÇIKLAMA, etc.)
    const groupHeaderRow = 12;
    const tableHeaderRow = this.buildTableHeader(sheet, groupHeaderRow);

    const dataStartRow = tableHeaderRow + 1;
    const itemsEndRow = this.buildItemsSection(sheet, dataStartRow, data.items, data.currency);

    // --- Section 4: System Grand Total ---
    const totalsEndRow = this.buildTotalsSection(sheet, itemsEndRow, data.totals, data.currency);

    // --- Section 5: Commercial Terms + NOTLAR ---
    if (
      (data.commercialTerms && data.commercialTerms.length > 0) ||
      (data.notes && data.notes.length > 0)
    ) {
      this.buildCommercialTermsSection(
        sheet,
        totalsEndRow,
        data.commercialTerms || [],
        data.notes
      );
    }

    // --- Print Setup (A4 portrait matching PDF) ---
    sheet.pageSetup.orientation = 'portrait';
    sheet.pageSetup.paperSize = 9; // A4
    sheet.pageSetup.fitToPage = true;
    sheet.pageSetup.fitToWidth = 1;
    sheet.pageSetup.fitToHeight = 0;
    // Margins in inches: PDF uses 5mm top, 10mm right, 15mm bottom, 10mm left
    // 1 inch = 25.4 mm
    sheet.pageSetup.margins = {
      left: 10 / 25.4,   // 10mm
      right: 10 / 25.4,  // 10mm
      top: 5 / 25.4,     // 5mm
      bottom: 15 / 25.4, // 15mm
      header: 0,
      footer: 0,
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
