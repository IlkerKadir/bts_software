import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

// ==================== Interfaces ====================

/**
 * Quote item for Excel export. Mirrors the 5-column PDF layout: the
 * katsayi/listPrice fields are accepted for backwards compatibility but
 * are not rendered in the customer-facing spreadsheet.
 */
export interface QuoteItemForExcel {
  itemType: 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SET' | 'SUBTOTAL' | 'GRAND_TOTAL';
  description: string;
  quantity?: number;
  unit?: string | null;
  unitPrice?: number;
  totalPrice?: number;
  katsayi?: number;
  listPrice?: number;
  /** Replaces MIKTAR + BIRIM + TOPLAM columns with a merged cell showing
   *  this literal text. */
  priceLabel?: string | null;
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

export interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  contact: string;
  ticaret: string;
}

// ==================== Template Constants ====================

const TOTAL_COLUMNS = 5;

/**
 * 5-column layout matching the PDF:
 * POZ NO | AÇIKLAMA | MİKTAR | BİRİM FİYAT | TOPLAM FİYAT
 *
 * Widths are character units, tuned to roughly match the PDF's percentage
 * widths (8.7% / 57.2% / 9.5% / 11.5% / 13.1%) at A4 portrait.
 */
const COLUMN_CONFIG = [
  { key: 'pozNo',       header: 'POZ NO',       width: 8 },
  { key: 'aciklama',    header: 'AÇIKLAMA',     width: 52 },
  { key: 'miktar',      header: 'MİKTAR',       width: 9 },
  { key: 'birimFiyat',  header: 'BİRİM FİYAT',  width: 11 },
  { key: 'toplamFiyat', header: 'TOPLAM FİYAT', width: 13 },
];

const FONT_FAMILY = 'Arial';
const BASE_FONT_SIZE = 8;

const COLORS = {
  SECTION_GREEN: 'FFC6E0B4',
  BLACK: 'FF000000',
  YELLOW: 'FFFFFF00',
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '\u20AC',
  USD: '$',
  GBP: '\u00A3',
  TRY: '\u20BA',
};

const CURRENCY_NAMES: Record<string, string> = {
  EUR: 'EURO',
  USD: 'USD',
  GBP: 'GBP',
  TRY: 'TRY',
};

/** Ordered list of commercial term categories, matching the PDF. */
const COMMERCIAL_TERM_CATEGORIES = [
  { key: 'DAHIL_OLMAYAN',     label: 'Dahil Olmayan Hizmetler:' },
  { key: 'uretici_firmalar',  label: 'ÜRETİCİ FİRMALAR' },
  { key: 'onaylar',           label: 'ONAYLAR' },
  { key: 'garanti',           label: 'GARANTİ' },
  { key: 'teslim_yeri',       label: 'TESLİM YERİ' },
  { key: 'odeme',             label: 'ÖDEME' },
  { key: 'kdv',                label: 'KDV' },
  { key: 'teslimat',          label: 'TESLİMAT' },
  { key: 'opsiyon',           label: 'OPSİYON' },
  { key: 'NOTLAR',            label: 'NOTLAR' },
];

// ==================== Helpers ====================

function blackBoxBorder(): Partial<ExcelJS.Borders> {
  return {
    top:    { style: 'thin', color: { argb: COLORS.BLACK } },
    left:   { style: 'thin', color: { argb: COLORS.BLACK } },
    bottom: { style: 'thin', color: { argb: COLORS.BLACK } },
    right:  { style: 'thin', color: { argb: COLORS.BLACK } },
  };
}

function unitAbbr(unit: string): string {
  switch (unit) {
    case 'Adet':  return 'Ad.';
    case 'Metre': return 'mt.';
    case 'Set':   return 'Set';
    default:      return unit;
  }
}

/** Format a number using Turkish locale with currency symbol after. */
function formatTurkishCurrency(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  const formatted = amount.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${symbol}`;
}

/** Sum priced items between the previous SUBTOTAL row and this SUBTOTAL row. */
function computeExcelSubtotalSum(items: QuoteItemForExcel[], subtotalIndex: number): number {
  let sum = 0;
  for (let i = subtotalIndex - 1; i >= 0; i--) {
    const item = items[i];
    if (item.itemType === 'SUBTOTAL') break;
    // Price-labeled items (e.g. "TARAFINIZCA SAĞLANACAKTIR") contribute 0.
    if (item.priceLabel) continue;
    if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET') {
      sum += item.totalPrice ?? 0;
    }
  }
  return sum;
}

// ==================== ExcelService ====================

export class ExcelService {
  /**
   * Embed the full BTS banner image across the top of the sheet. This is
   * the same `BTS_teklif_form.png` the PDF template uses — a wide image
   * with the BTS logo, contact info, and 25-year badge.
   *
   * Microsoft Excel draws cell borders *below* embedded images, so a cell
   * border around the merged A1:E1 range would be invisible under the
   * banner. Instead we bake a black frame directly into the image buffer
   * with `sharp().extend()`, then anchor the framed image to A1:E1 with
   * integer coordinates. The frame always renders because it's part of
   * the image's pixels.
   */
  private async addBanner(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet): Promise<void> {
    // Approximate pixel width of the full A–E column range. Excel's column
    // width uses the default font's max-digit-width (Calibri 11pt ≈ 7 px)
    // plus 5 px padding per column.
    const totalColPx = COLUMN_CONFIG.reduce((sum, col) => sum + Math.round(col.width * 7 + 5), 0);
    const rowHeightPx = 133;              // ≈ 100 pt, matches banner's natural aspect
    sheet.getRow(1).height = 100;

    const candidates = [
      path.join(process.cwd(), 'public', 'header', 'BTS_teklif_form.png'),
      path.join(process.cwd(), 'pdf', 'header', 'BTS_teklif_form.png'),
      path.join(process.cwd(), 'public', 'btslogo.png'),
    ];
    for (const imgPath of candidates) {
      if (!fs.existsSync(imgPath)) continue;
      try {
        // Keep the image at the source's native resolution so print-quality
        // export (Excel→PDF) stays sharp. We only need to reshape the
        // aspect ratio so it matches the cell range (preventing the
        // aspect-lock from letterboxing). Width stays at the source's
        // native width; height is recomputed to match the target aspect.
        const sourceBuffer = fs.readFileSync(imgPath);
        const meta = await sharp(sourceBuffer).metadata();
        const sourceWidth = meta.width ?? 2481;
        const targetAspect = totalColPx / rowHeightPx;   // e.g. 676/133 ≈ 5.083
        const nativeTargetHeight = Math.round(sourceWidth / targetAspect);

        // Border is sized so it renders at ≈1 px after Excel scales the
        // image down to `totalColPx` wide (i.e. matches the `thin` border
        // used by the customer block below).
        const scaleFactor = totalColPx / sourceWidth;
        const borderPx = Math.max(1, Math.round(1 / scaleFactor));

        const framedBuffer = await sharp(sourceBuffer)
          .resize(sourceWidth, nativeTargetHeight, { fit: 'fill' })
          .extend({
            top: borderPx,
            bottom: borderPx,
            left: borderPx,
            right: borderPx,
            background: { r: 0, g: 0, b: 0, alpha: 1 },
          })
          .png()
          .toBuffer();

        const imageId = workbook.addImage({
          buffer: framedBuffer as unknown as ExcelJS.Buffer,
          extension: 'png',
        });
        // Range anchor A1:E1. Because the image has been pre-scaled to
        // exactly match the cell range aspect ratio, the aspect-lock
        // Excel adds (noChangeAspect="1") is a no-op — the image fits
        // precisely with no shrinkage.
        sheet.addImage(imageId, {
          tl: { col: 0, row: 0 },
          br: { col: TOTAL_COLUMNS, row: 1 },
        } as unknown as ExcelJS.ImageRange);
        return;
      } catch (err) {
        console.warn('Excel export: failed to load banner image', err);
      }
    }
  }

  /**
   * Customer info block, directly below the banner. Matches the PDF's thead
   * row 2: a bordered box with the company/subject/description on the left
   * (cols 1-3) and the PROFORMA FATURA panel on the right (cols 4-5).
   *
   * Layout is 4 rows tall (one row each for: name, address, subject,
   * description). On the right, PROFORMA FATURA is a single row followed
   * by Tarih / Ref.No / Teklif No rows.
   */
  private buildCustomerBlock(sheet: ExcelJS.Worksheet, data: QuoteDataForExcel, startRow: number): number {
    // Compact row heights matching the PDF's tight line spacing
    for (let r = startRow; r <= startRow + 3; r++) {
      sheet.getRow(r).height = 14;
    }

    // --- LEFT SIDE (A:C) ---
    const leftRows = [
      { value: data.company.name,       bold: true,  wrap: false },
      { value: data.company.address || '', bold: false, wrap: true  },
      { value: data.subject || '',       bold: true,  wrap: false },
      { value: data.description || '',   bold: true,  wrap: false },
    ];
    leftRows.forEach((r, i) => {
      const row = startRow + i;
      sheet.mergeCells(row, 1, row, 3);
      const cell = sheet.getCell(row, 1);
      cell.value = r.value;
      cell.font = { name: FONT_FAMILY, bold: r.bold, size: BASE_FONT_SIZE };
      cell.alignment = { vertical: 'middle', wrapText: r.wrap, indent: 1 };
      cell.border = {
        left:   blackBoxBorder().left,
        right:  blackBoxBorder().right,
        top:    i === 0 ? blackBoxBorder().top : undefined,
        bottom: i === leftRows.length - 1 ? blackBoxBorder().bottom : undefined,
      };
    });

    // --- RIGHT SIDE (D:E) ---
    // Row 0: PROFORMA FATURA (single row, larger bold text)
    sheet.mergeCells(startRow, 4, startRow, 5);
    const proforma = sheet.getCell(startRow, 4);
    proforma.value = 'PROFORMA FATURA';
    proforma.font = { name: FONT_FAMILY, bold: true, size: 11 };
    proforma.alignment = { horizontal: 'center', vertical: 'middle' };
    proforma.border = {
      top:    blackBoxBorder().top,
      left:   blackBoxBorder().left,
      right:  blackBoxBorder().right,
      bottom: blackBoxBorder().bottom,
    };

    // Rows 1-3: Tarih / Ref.No / Teklif No
    const detailRows = [
      { row: startRow + 1, label: 'Tarih',    value: data.date },
      { row: startRow + 2, label: 'Ref.No',   value: data.refNo || '' },
      { row: startRow + 3, label: 'Teklif No', value: data.quoteNumber },
    ];
    const lastDetailRow = startRow + 3;
    for (const { row, label, value } of detailRows) {
      const l = sheet.getCell(row, 4);
      l.value = label;
      l.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
      l.alignment = { vertical: 'middle', indent: 1 };
      l.border = {
        left:   blackBoxBorder().left,
        bottom: row === lastDetailRow ? blackBoxBorder().bottom : undefined,
      };

      const v = sheet.getCell(row, 5);
      v.value = `: ${value}`;
      v.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
      v.alignment = { vertical: 'middle' };
      v.border = {
        right:  blackBoxBorder().right,
        bottom: row === lastDetailRow ? blackBoxBorder().bottom : undefined,
      };
    }

    return startRow + 4; // next free row
  }

  /**
   * Column header row: POZ NO | AÇIKLAMA | MİKTAR | BİRİM FİYAT | TOPLAM FİYAT
   * Each header cell gets a black border, matching the PDF.
   */
  private buildTableHeader(sheet: ExcelJS.Worksheet, headerRow: number): number {
    COLUMN_CONFIG.forEach((col, index) => {
      const cell = sheet.getCell(headerRow, index + 1);
      cell.value = col.header;
      cell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = blackBoxBorder();
    });
    sheet.getRow(headerRow).height = 18;
    return headerRow;
  }

  /**
   * Item rows. 5 columns — POZ NO, AÇIKLAMA, MİKTAR (combined "1 Ad."),
   * BİRİM FİYAT, TOPLAM FİYAT. HEADER rows have a green background,
   * NOTE rows prefix with "NOT:", SUBTOTAL rows right-align their label.
   */
  private buildItemsSection(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    items: QuoteItemForExcel[],
    currency: string,
    grandTotal: number
  ): number {
    let currentRow = startRow;
    let pozCounter = 0;

    items.forEach((item, index) => {
      if (item.itemType === 'HEADER') {
        for (let col = 1; col <= TOTAL_COLUMNS; col++) {
          sheet.getCell(currentRow, col).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: COLORS.SECTION_GREEN },
          };
        }
        sheet.mergeCells(currentRow, 2, currentRow, TOTAL_COLUMNS);
        const descCell = sheet.getCell(currentRow, 2);
        descCell.value = item.description;
        descCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
        descCell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else if (item.itemType === 'NOTE') {
        const pozCell = sheet.getCell(currentRow, 1);
        pozCell.value = 'NOT:';
        pozCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
        pozCell.alignment = { horizontal: 'center', vertical: 'middle' };

        sheet.mergeCells(currentRow, 2, currentRow, TOTAL_COLUMNS);
        const descCell = sheet.getCell(currentRow, 2);
        descCell.value = item.description;
        descCell.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
        descCell.alignment = { wrapText: true, vertical: 'top' };

        const lineCount = Math.ceil(item.description.length / 80);
        if (lineCount > 1) sheet.getRow(currentRow).height = Math.max(15, lineCount * 15);
      } else if (item.itemType === 'GRAND_TOTAL') {
        // Spacer row before the grand total card (mirrors the PDF
        // template's 6pt spacer above `.sys-total-label`).
        sheet.getRow(currentRow).height = 6;
        currentRow++;

        sheet.mergeCells(currentRow, 1, currentRow, 4);
        const labelCell = sheet.getCell(currentRow, 1);
        labelCell.value = item.description || 'GENEL TOPLAM';
        labelCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE + 1 };
        labelCell.alignment = { horizontal: 'right', vertical: 'middle' };
        labelCell.border = blackBoxBorder();

        const sumCell = sheet.getCell(currentRow, 5);
        sumCell.value = formatTurkishCurrency(grandTotal, currency);
        sumCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE + 1 };
        sumCell.alignment = { horizontal: 'right', vertical: 'middle' };
        sumCell.border = blackBoxBorder();

        for (let col = 2; col <= 4; col++) {
          sheet.getCell(currentRow, col).border = blackBoxBorder();
        }

        currentRow++;
        sheet.getRow(currentRow).height = 6;
      } else if (item.itemType === 'SUBTOTAL') {
        const sectionSum = computeExcelSubtotalSum(items, index);

        // Small spacer row before the subtotal card, matching the PDF's
        // <tr style="height:4pt"> spacer above `.sys-total-label`.
        sheet.getRow(currentRow).height = 6;
        currentRow++;

        sheet.mergeCells(currentRow, 1, currentRow, 4);
        const labelCell = sheet.getCell(currentRow, 1);
        labelCell.value = item.description || 'Ara Toplam';
        labelCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
        labelCell.alignment = { horizontal: 'right', vertical: 'middle' };
        labelCell.border = blackBoxBorder();

        const sumCell = sheet.getCell(currentRow, 5);
        sumCell.value = formatTurkishCurrency(sectionSum, currency);
        sumCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
        sumCell.alignment = { horizontal: 'right', vertical: 'middle' };
        sumCell.border = blackBoxBorder();

        // ExcelJS needs the border on every cell in a merged range for the
        // outer box to render continuously.
        for (let col = 2; col <= 4; col++) {
          sheet.getCell(currentRow, col).border = blackBoxBorder();
        }

        // Spacer row after the subtotal card (matches the PDF's trailing
        // <tr style="height:4pt"> below the `.sys-total-label` row).
        currentRow++;
        sheet.getRow(currentRow).height = 6;
      } else {
        // PRODUCT / CUSTOM / SET
        pozCounter++;

        const pozCell = sheet.getCell(currentRow, 1);
        pozCell.value = pozCounter;
        pozCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
        pozCell.alignment = { horizontal: 'center', vertical: 'middle' };

        const descCell = sheet.getCell(currentRow, 2);
        descCell.value = item.description;
        descCell.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
        descCell.alignment = { wrapText: true, vertical: 'middle' };

        if (item.priceLabel) {
          // Merge MIKTAR + BIRIM FIYAT + TOPLAM FIYAT into one cell and
          // fill with the label text — matches the PDF behavior.
          sheet.mergeCells(currentRow, 3, currentRow, 5);
          const labelCell = sheet.getCell(currentRow, 3);
          labelCell.value = item.priceLabel;
          labelCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
          labelCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        } else {
          // Combined "1 Ad." style cell like the PDF
          const qty = item.quantity ?? 0;
          const unit = unitAbbr(item.unit || 'Adet');
          const qtyCell = sheet.getCell(currentRow, 3);
          qtyCell.value = `${qty} ${unit}`;
          qtyCell.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
          qtyCell.alignment = { horizontal: 'right', vertical: 'middle' };

          const unitPriceCell = sheet.getCell(currentRow, 4);
          unitPriceCell.value = formatTurkishCurrency(item.unitPrice ?? 0, currency);
          unitPriceCell.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
          unitPriceCell.alignment = { horizontal: 'right', vertical: 'middle' };

          const totalCell = sheet.getCell(currentRow, 5);
          totalCell.value = formatTurkishCurrency(item.totalPrice ?? 0, currency);
          totalCell.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
          totalCell.alignment = { horizontal: 'right', vertical: 'middle' };
        }

        // AÇIKLAMA column is ~52 char units wide. Arial 8pt fits roughly
        // 90 chars per wrapped line in that width. Undershoot the divisor
        // slightly (85) so we avoid truncation without wasting vertical space.
        const lineCount = Math.ceil(item.description.length / 85);
        if (lineCount > 1) sheet.getRow(currentRow).height = 13 * lineCount;
        else sheet.getRow(currentRow).height = 14;
      }

      currentRow++;
    });

    return currentRow;
  }

  /**
   * SİSTEM GENEL TOPLAMI (CURRENCY) row — merged label cols 1-4, value col 5,
   * with a black box border.
   */
  private buildTotalsSection(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    totals: QuoteDataForExcel['totals'],
    currency: string
  ): number {
    let currentRow = startRow + 1; // gap row

    const currencyName = CURRENCY_NAMES[currency] || currency;

    sheet.mergeCells(currentRow, 1, currentRow, 4);
    const labelCell = sheet.getCell(currentRow, 1);
    labelCell.value = `SİSTEM GENEL TOPLAMI (${currencyName})`;
    labelCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
    labelCell.alignment = { horizontal: 'right', vertical: 'middle' };
    labelCell.border = blackBoxBorder();

    const valueCell = sheet.getCell(currentRow, 5);
    valueCell.value = formatTurkishCurrency(totals.grandTotal, currency);
    valueCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
    valueCell.alignment = { horizontal: 'right', vertical: 'middle' };
    valueCell.border = blackBoxBorder();

    // The merged-cells border fix: ExcelJS doesn't apply the outer border
    // around merged cells unless every cell in the merge range has one.
    for (let col = 2; col <= 4; col++) {
      sheet.getCell(currentRow, col).border = blackBoxBorder();
    }

    return currentRow + 1;
  }

  /**
   * Commercial terms + NOTLAR. Layout mirrors the PDF: DAHIL_OLMAYAN
   * renders above the TİCARİ ŞARTLAR heading, each category then renders
   * below. NOTLAR are numbered at the bottom.
   */
  private buildCommercialTermsSection(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    commercialTerms: CommercialTermForExcel[],
    notes?: NoteForExcel[]
  ): number {
    let currentRow = startRow + 1;

    const termsByCategory = new Map<string, CommercialTermForExcel[]>();
    commercialTerms.forEach((term) => {
      const existing = termsByCategory.get(term.category) || [];
      existing.push(term);
      termsByCategory.set(term.category, existing);
    });

    // 1) DAHIL_OLMAYAN — above TİCARİ ŞARTLAR
    const dahilOlmayan = termsByCategory.get('DAHIL_OLMAYAN');
    if (dahilOlmayan && dahilOlmayan.length > 0) {
      sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
      const t = sheet.getCell(currentRow, 1);
      t.value = 'Dahil Olmayan Hizmetler:';
      t.font = { name: FONT_FAMILY, bold: true, size: 9 };
      t.alignment = { vertical: 'middle' };
      currentRow++;

      dahilOlmayan
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .forEach((term) => {
          sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
          const v = sheet.getCell(currentRow, 1);
          v.value = `    ${term.value}`;
          v.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
          v.alignment = { wrapText: true, vertical: 'top' };
          currentRow++;
        });
    }

    // 2) TİCARİ ŞARTLAR heading (only if there are standard terms)
    const standardCatKeys = ['uretici_firmalar', 'onaylar', 'garanti', 'teslim_yeri', 'odeme', 'kdv', 'teslimat', 'opsiyon'];
    const hasStandardTerms = standardCatKeys.some((key) => termsByCategory.has(key));
    if (hasStandardTerms) {
      sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
      const h = sheet.getCell(currentRow, 1);
      h.value = 'TİCARİ ŞARTLAR';
      h.font = { name: FONT_FAMILY, bold: true, size: 9 };
      h.alignment = { vertical: 'middle' };
      currentRow++;
    }

    // 3) Render each category in defined order
    for (const { key, label } of COMMERCIAL_TERM_CATEGORIES) {
      if (key === 'DAHIL_OLMAYAN' || key === 'NOTLAR') continue;
      const terms = termsByCategory.get(key);
      if (!terms || terms.length === 0) continue;

      sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
      const t = sheet.getCell(currentRow, 1);
      t.value = `    ${label}`;
      t.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
      t.alignment = { vertical: 'middle' };
      currentRow++;

      if (key === 'onaylar') {
        const joined = terms
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((x) => x.value)
          .join(', ');
        sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
        const v = sheet.getCell(currentRow, 1);
        v.value = `    ${joined}`;
        v.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
        v.alignment = { wrapText: true, vertical: 'top' };
        currentRow++;
      } else if (key === 'uretici_firmalar') {
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
              const v = sheet.getCell(currentRow, 1);
              v.value = `    ${line}`;
              v.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
              v.alignment = { wrapText: true, vertical: 'top' };
              currentRow++;
            }
          });
      } else {
        terms
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .forEach((term) => {
            sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
            const v = sheet.getCell(currentRow, 1);
            v.value = `    ${term.value}`;
            v.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
            v.alignment = { wrapText: true, vertical: 'top' };

            const lineCount = Math.ceil(term.value.length / 100);
            if (lineCount > 1) sheet.getRow(currentRow).height = Math.max(15, lineCount * 15);
            currentRow++;
          });
      }
    }

    // 4) NOTLAR — merge NOTLAR terms with legacy notes array
    const notlarFromTerms = termsByCategory.get('NOTLAR') || [];
    const allNotes: { text: string; highlight: boolean; sortOrder: number }[] = [];

    notlarFromTerms.forEach((entry, idx) => {
      allNotes.push({
        text: entry.value,
        highlight: entry.highlight ?? false,
        sortOrder: entry.sortOrder ?? idx + 1,
      });
    });

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

      sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
      const h = sheet.getCell(currentRow, 1);
      h.value = '    NOTLAR';
      h.font = { name: FONT_FAMILY, bold: true, size: 9 };
      h.alignment = { vertical: 'middle' };
      currentRow++;

      sorted.forEach((note, i) => {
        const numCell = sheet.getCell(currentRow, 1);
        numCell.value = i + 1;
        numCell.alignment = { horizontal: 'right', vertical: 'top' };
        numCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
        if (note.highlight) {
          numCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.YELLOW } };
        }

        sheet.mergeCells(currentRow, 2, currentRow, TOTAL_COLUMNS);
        const noteCell = sheet.getCell(currentRow, 2);
        noteCell.value = note.text;
        noteCell.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
        noteCell.alignment = { wrapText: true, vertical: 'top' };
        if (note.highlight) {
          noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.YELLOW } };
        }

        const lineCount = Math.ceil(note.text.length / 90);
        if (lineCount > 1) sheet.getRow(currentRow).height = Math.max(15, lineCount * 15);
        currentRow++;
      });
    }

    return currentRow;
  }

  /**
   * Generate the complete proforma fatura Excel file matching the PDF format.
   *
   * Row layout:
   *   Row  1:    BTS banner image (full table width)
   *   Rows 2-5:  Customer info block (4 rows)
   *   Row  6:    Column header row (POZ NO, AÇIKLAMA, MİKTAR, BİRİM FİYAT, TOPLAM FİYAT)
   *   Row  7+:   Item rows
   *              System grand total
   *              Commercial terms + NOTLAR
   */
  async generateQuoteExcel(data: QuoteDataForExcel, _companyInfo?: CompanyInfo): Promise<Buffer> {
    void _companyInfo; // kept for API compatibility — no longer used

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BTS Teklif Sistemi';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Teklif');

    // Column widths
    sheet.columns = COLUMN_CONFIG.map((col) => ({
      key: col.key,
      width: col.width,
    }));

    // Section 1: Banner image (row 1)
    await this.addBanner(workbook, sheet);

    // Section 2: Customer info block (rows 2-5)
    const customerEndRow = this.buildCustomerBlock(sheet, data, 2);

    // Section 3: Column headers (row 6) + items. The grand total is no
    // longer auto-appended — users add a GRAND_TOTAL item to the quote
    // explicitly, and `buildItemsSection` renders it inline when it
    // encounters one. `buildTotalsSection` is kept on the class for
    // possible future use but is intentionally not called here.
    const tableHeaderRow = this.buildTableHeader(sheet, customerEndRow);
    const itemsEndRow = this.buildItemsSection(
      sheet,
      tableHeaderRow + 1,
      data.items,
      data.currency,
      data.totals.grandTotal
    );

    // Section 4: Commercial terms + NOTLAR
    if (
      (data.commercialTerms && data.commercialTerms.length > 0) ||
      (data.notes && data.notes.length > 0)
    ) {
      this.buildCommercialTermsSection(
        sheet,
        itemsEndRow,
        data.commercialTerms || [],
        data.notes
      );
    }

    // Print setup: A4 portrait, fit to one page wide
    sheet.pageSetup.orientation = 'portrait';
    sheet.pageSetup.paperSize = 9; // A4
    sheet.pageSetup.fitToPage = true;
    sheet.pageSetup.fitToWidth = 1;
    sheet.pageSetup.fitToHeight = 0;
    sheet.pageSetup.margins = {
      left:   10 / 25.4,
      right:  10 / 25.4,
      top:     5 / 25.4,
      bottom: 15 / 25.4,
      header: 0,
      footer: 0,
    };

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
