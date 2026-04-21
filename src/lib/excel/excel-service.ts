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
  /** Product code column (B). Empty string for rows without one. */
  code?: string | null;
  /** Brand column (C). Empty string for rows without one. */
  brand?: string | null;
  /** Model column (D). Empty string for rows without one. */
  model?: string | null;
  quantity?: number;
  unit?: string | null;
  unitPrice?: number;
  totalPrice?: number;
  katsayi?: number;
  listPrice?: number;
  /** Replaces MIKTAR + BIRIM + TOPLAM columns with a merged cell showing
   *  this literal text. */
  priceLabel?: string | null;
  /** Optional per-SET currency override. When set on a top-level SET
   *  row, the MIKTAR/BİRİM/TOPLAM cells render in that currency. */
  currency?: string | null;
  /** Row total converted to quote currency for SUBTOTAL aggregation. */
  totalPriceInQuoteCurrency?: number;
  /** Per-section discount percentage (0–100). When > 0 a three-row
   *  block is rendered: gross SUBTOTAL → İskonto line → NET SUBTOTAL. */
  sectionDiscountPct?: number | null;
  /** Optional custom label for the İskonto line. Falls back to "İskonto". */
  sectionDiscountLabel?: string | null;
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

/**
 * Kept on the exported API for route compatibility — the manual
 * template no longer uses a separate BTS company info block, but the
 * route passes it for backwards compat.
 */
export interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  contact: string;
  ticaret: string;
}

// ==================== Template Constants ====================

const TOTAL_COLUMNS = 8;

/**
 * Column widths. POZ NO stays narrow. KOD/MARKA/MODEL get moderate
 * widths sized for typical product codes. AÇIKLAMA takes the remaining
 * space. MIKTAR/BIRIM FIYAT/TOPLAM FIYAT preserve their original widths.
 *   A  POZ NO       7.33
 *   B  KOD          14.00
 *   C  MARKA        14.00
 *   D  MODEL        14.00
 *   E  AÇIKLAMA    40.00
 *   F  MİKTAR       8.50
 *   G  BİRİM FİYAT 10.66
 *   H  TOPLAM      11.33
 */
const COLUMN_WIDTHS = [7.33, 14, 14, 14, 40, 8.5, 10.66, 11.33];

const TABLE_HEADERS = ['POZ NO', 'KOD', 'MARKA', 'MODEL', 'AÇIKLAMA', 'MİKTAR', 'BİRİM FİYAT', 'TOPLAM FİYAT'];

const FONT_FAMILY = 'Arial';
const BASE_FONT_SIZE = 8;

const COLORS = {
  /** Light gray used on PROFORMA FATURA panel, column headers, subtotal
   *  and grand-total rows. Matches the user's reference template. */
  HEADER_GRAY: 'FFE7E6E6',
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

/** Ordered list of commercial-term category keys in the order they
 *  appear in the reference template. `DAHIL_OLMAYAN` and `NOTLAR` are
 *  handled separately. */
const COMMERCIAL_TERM_CATEGORIES: { key: string; label: string }[] = [
  { key: 'uretici_firmalar', label: 'ÜRETİCİ FİRMALAR' },
  { key: 'onaylar',          label: 'ONAYLAR' },
  { key: 'garanti',          label: 'GARANTİ' },
  { key: 'teslim_yeri',      label: 'TESLİM YERİ' },
  { key: 'odeme',            label: 'ÖDEME' },
  { key: 'kdv',              label: 'KDV' },
  { key: 'teslimat',         label: 'TESLİMAT' },
  { key: 'opsiyon',          label: 'OPSİYON' },
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

function grayFill(): ExcelJS.Fill {
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.HEADER_GRAY },
  };
}

/**
 * Apply a thin black border AND a fill to every cell of a merged range.
 * ExcelJS doesn't propagate border/fill to the hidden cells of a merge,
 * so the visible outline only renders if every cell has them.
 */
function styleMergedRange(
  sheet: ExcelJS.Worksheet,
  row: number,
  colStart: number,
  colEnd: number,
  fill?: ExcelJS.Fill
) {
  for (let c = colStart; c <= colEnd; c++) {
    const cell = sheet.getCell(row, c);
    cell.border = blackBoxBorder();
    if (fill) cell.fill = fill;
  }
}

function unitAbbr(unit: string): string {
  switch (unit) {
    case 'Adet':  return 'ad.';
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
    if (item.priceLabel) continue;
    if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET') {
      // Prefer the pre-converted quote-currency total when present
      // (mixed-currency quotes); fall back to raw totalPrice for pure
      // single-currency quotes where the two are identical.
      sum += item.totalPriceInQuoteCurrency ?? item.totalPrice ?? 0;
    }
  }
  return sum;
}

/**
 * Running net total of priced items strictly above `grandTotalIndex`,
 * using the pre-converted per-row totals already stamped on the Excel
 * items. Mirrors `computeGrandTotalAtIndex` in the PDF template (same
 * algorithm, same shape).
 */
function computeExcelGrandTotalAtIndex(items: QuoteItemForExcel[], grandTotalIndex: number): number {
  if (grandTotalIndex <= 0) return 0;
  let runningNet = 0;
  let openTail = 0;
  for (let i = 0; i < grandTotalIndex; i++) {
    const item = items[i];
    if (item.itemType === 'SUBTOTAL') {
      const pct = Number(item.sectionDiscountPct ?? 0);
      const discountAmount = Math.round(openTail * (pct / 100) * 100) / 100;
      runningNet = Math.round((runningNet + openTail - discountAmount) * 100) / 100;
      openTail = 0;
      continue;
    }
    if (item.priceLabel) continue;
    if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET') {
      openTail += item.totalPriceInQuoteCurrency ?? item.totalPrice ?? 0;
    }
  }
  return Math.round((runningNet + openTail) * 100) / 100;
}

// ==================== ExcelService ====================

export class ExcelService {
  /**
   * Embed the BTS banner image across row 1 (spanning A:E). This is the
   * same `BTS_teklif_form.png` the PDF template uses — a wide image
   * with the BTS logo, contact info, and 25-year badge.
   *
   * Excel draws cell borders *behind* embedded images, so a cell border
   * around a merged A1:E1 range would be hidden under the banner.
   * Instead we bake a 1-px black frame directly into the image buffer
   * with `sharp().extend()`, then anchor the framed image to the row's
   * full width with integer coordinates. The frame always renders
   * because it's part of the image's pixels.
   *
   * If the image file can't be found (e.g. running without the
   * `public/header` assets), we silently skip — the file still exports
   * with row 1 left blank as a top margin.
   */
  private async addBanner(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet): Promise<void> {
    // Approximate pixel width of the full A–E column range. Excel's
    // column width uses the default font's max-digit-width
    // (Calibri 11pt ≈ 7 px) plus 5 px padding per column.
    const totalColPx = COLUMN_WIDTHS.reduce((sum, w) => sum + Math.round(w * 7 + 5), 0);
    const rowHeightPx = 133; // ≈ 100 pt, matches banner's natural aspect
    sheet.getRow(1).height = 100;

    const candidates = [
      path.join(process.cwd(), 'public', 'header', 'BTS_teklif_form.png'),
      path.join(process.cwd(), 'pdf', 'header', 'BTS_teklif_form.png'),
      path.join(process.cwd(), 'public', 'btslogo.png'),
    ];
    for (const imgPath of candidates) {
      if (!fs.existsSync(imgPath)) continue;
      try {
        // Keep the image at the source's native resolution so
        // print-quality (Excel→PDF) stays sharp. We reshape the aspect
        // ratio to match the cell range so Excel's aspect-lock doesn't
        // letterbox the image.
        const sourceBuffer = fs.readFileSync(imgPath);
        const meta = await sharp(sourceBuffer).metadata();
        const sourceWidth = meta.width ?? 2481;
        const targetAspect = totalColPx / rowHeightPx;
        const nativeTargetHeight = Math.round(sourceWidth / targetAspect);

        // Border sized so it renders at ≈1 px after Excel scales the
        // image down to `totalColPx` wide — matches the `thin` border
        // used by the customer block below it.
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
   * Rows 2-6 of the reference template: the customer/proforma info
   * block.
   *
   *   Row 2:  A2:C2 company.name     | D2:E3 "PROFORMA FATURA"
   *   Row 3:  A3:C3 company.address  |   (merged with D2)
   *   Row 4:  A4:C4 subject          | D4 "Tarih"     E4 ": <date>"
   *   Row 5:  A5:C6 description      | D5 "Ref.No"    E5 ": <refNo>"
   *   Row 6:    (merged with A5)     | D6 "Teklif No" E6 ": <quoteNumber>"
   */
  private buildCustomerBlock(sheet: ExcelJS.Worksheet, data: QuoteDataForExcel): number {
    const START = 2;

    // Row heights — fixed at 12pt to match the template's tight spacing.
    for (let r = START; r <= START + 4; r++) {
      sheet.getRow(r).height = 12;
    }

    // --- LEFT SIDE (A:F) ---
    // With the 8-column table, the left-side company block spans A:F
    // (6 cols) and the right-side info panel sits in G:H (2 cols).
    // Row 2: company name
    sheet.mergeCells(START, 1, START, 6);
    const nameCell = sheet.getCell(START, 1);
    nameCell.value = data.company.name;
    nameCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
    nameCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    styleMergedRange(sheet, START, 1, 6);

    // Row 3: company address
    sheet.mergeCells(START + 1, 1, START + 1, 6);
    const addrCell = sheet.getCell(START + 1, 1);
    addrCell.value = data.company.address || '';
    addrCell.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
    addrCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
    styleMergedRange(sheet, START + 1, 1, 6);

    // Row 4: subject (single row)
    sheet.mergeCells(START + 2, 1, START + 2, 6);
    const subjCell = sheet.getCell(START + 2, 1);
    subjCell.value = data.subject || '';
    subjCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
    subjCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    styleMergedRange(sheet, START + 2, 1, 6);

    // Rows 5-6: description (spans 2 rows for longer text)
    sheet.mergeCells(START + 3, 1, START + 4, 6);
    const descCell = sheet.getCell(START + 3, 1);
    descCell.value = data.description || '';
    descCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
    descCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
    for (let r = START + 3; r <= START + 4; r++) {
      styleMergedRange(sheet, r, 1, 6);
    }

    // --- RIGHT SIDE (G:H) ---
    // G2:H3 "PROFORMA FATURA" (gray fill, centered, spans 2 rows)
    sheet.mergeCells(START, 7, START + 1, 8);
    const proforma = sheet.getCell(START, 7);
    proforma.value = 'PROFORMA FATURA';
    proforma.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
    proforma.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    for (let r = START; r <= START + 1; r++) {
      styleMergedRange(sheet, r, 7, 8, grayFill());
    }

    // Rows 4-6: Tarih / Ref.No / Teklif No
    const detailRows = [
      { row: START + 2, label: 'Tarih',     value: data.date },
      { row: START + 3, label: 'Ref.No',    value: data.refNo || '' },
      { row: START + 4, label: 'Teklif No', value: data.quoteNumber },
    ];
    for (const { row, label, value } of detailRows) {
      const l = sheet.getCell(row, 7);
      l.value = label;
      l.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
      l.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      l.border = blackBoxBorder();

      const v = sheet.getCell(row, 8);
      v.value = `: ${value}`;
      v.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
      v.alignment = { horizontal: 'left', vertical: 'middle' };
      v.border = blackBoxBorder();
    }

    return START + 5; // next free row (= 7)
  }

  /**
   * Row 7 of the template: the items table column headers. Gray fill
   * matching the PROFORMA FATURA panel, bold, centered, bordered.
   */
  private buildTableHeader(sheet: ExcelJS.Worksheet, row: number): void {
    sheet.getRow(row).height = 18;
    TABLE_HEADERS.forEach((label, idx) => {
      const cell = sheet.getCell(row, idx + 1);
      cell.value = label;
      cell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = blackBoxBorder();
      cell.fill = grayFill();
    });
  }

  /**
   * Item rows, rendered starting at `startRow`. Mirrors the template:
   * numbered PRODUCT/CUSTOM/SET rows, bold HEADER bands (B:E merged,
   * no column A), merged C:E price-label rows, and gray-filled
   * SUBTOTAL / GRAND_TOTAL summary rows.
   */
  private buildItemsSection(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    items: QuoteItemForExcel[],
    currency: string,
    grandTotal: number
  ): number {
    void grandTotal; // kept for API compat; no longer read — GRAND_TOTAL is now per-row
    let currentRow = startRow;
    let pozCounter = 0;

    items.forEach((item, index) => {
      if (item.itemType === 'HEADER') {
        // Bold section band — B:E merged, column A is left empty so
        // the section marker lines up flush with the description column.
        sheet.mergeCells(currentRow, 2, currentRow, TOTAL_COLUMNS);
        const cell = sheet.getCell(currentRow, 2);
        cell.value = item.description;
        cell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
        cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        styleMergedRange(sheet, currentRow, 2, TOTAL_COLUMNS);

        // Give column A a border too so the row visually connects to
        // the framed items table above.
        sheet.getCell(currentRow, 1).border = blackBoxBorder();
        sheet.getRow(currentRow).height = 15;
      } else if (item.itemType === 'NOTE') {
        // NOT: marker in column A, note text in B:E merged
        const pozCell = sheet.getCell(currentRow, 1);
        pozCell.value = 'NOT:';
        pozCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
        pozCell.alignment = { horizontal: 'center', vertical: 'middle' };
        pozCell.border = blackBoxBorder();

        sheet.mergeCells(currentRow, 2, currentRow, TOTAL_COLUMNS);
        const descCell = sheet.getCell(currentRow, 2);
        descCell.value = item.description;
        descCell.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
        descCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true, indent: 1 };
        styleMergedRange(sheet, currentRow, 2, TOTAL_COLUMNS);

        const lineCount = Math.max(1, Math.ceil(item.description.length / 85));
        sheet.getRow(currentRow).height = 12 * lineCount + 2;
      } else if (item.itemType === 'GRAND_TOTAL') {
        // A:G merged label, H value. Gray fill like the template's row 25.
        const currencyName = CURRENCY_NAMES[currency] || currency;
        const label = `${item.description || 'GENEL TOPLAM'} (${currencyName})`;

        sheet.mergeCells(currentRow, 1, currentRow, 7);
        const labelCell = sheet.getCell(currentRow, 1);
        labelCell.value = label;
        labelCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
        labelCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
        styleMergedRange(sheet, currentRow, 1, 7, grayFill());

        const sumCell = sheet.getCell(currentRow, 8);
        const runningTotal = computeExcelGrandTotalAtIndex(items, index);
        sumCell.value = formatTurkishCurrency(runningTotal, currency);
        sumCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
        sumCell.alignment = { horizontal: 'right', vertical: 'middle' };
        sumCell.border = blackBoxBorder();
        sumCell.fill = grayFill();

        sheet.getRow(currentRow).height = 16;
      } else if (item.itemType === 'SUBTOTAL') {
        const sectionSum = computeExcelSubtotalSum(items, index);
        const pct = Number(item.sectionDiscountPct ?? 0);
        const discAmt = pct > 0 ? Math.round(sectionSum * (pct / 100) * 100) / 100 : 0;
        const net = sectionSum - discAmt;
        const currencyName = CURRENCY_NAMES[currency] || currency;
        const baseLabel = item.description || 'Ara Toplam';
        const customDiscountLabel = item.sectionDiscountLabel?.trim() || 'İskonto';

        // Row 1 — gross SUBTOTAL (always emitted). Label A:G, value H.
        sheet.mergeCells(currentRow, 1, currentRow, 7);
        const labelCell = sheet.getCell(currentRow, 1);
        labelCell.value = `${baseLabel} (${currencyName})`;
        labelCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
        labelCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
        styleMergedRange(sheet, currentRow, 1, 7, grayFill());

        const sumCell = sheet.getCell(currentRow, 8);
        sumCell.value = formatTurkishCurrency(sectionSum, currency);
        sumCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
        sumCell.alignment = { horizontal: 'right', vertical: 'middle' };
        sumCell.border = blackBoxBorder();
        sumCell.fill = grayFill();
        sheet.getRow(currentRow).height = 16;

        if (pct > 0) {
          // Row 2 — İskonto line.
          currentRow++;
          sheet.mergeCells(currentRow, 1, currentRow, 7);
          const discLabelCell = sheet.getCell(currentRow, 1);
          discLabelCell.value = `${customDiscountLabel} (%${pct})`;
          discLabelCell.font = { name: FONT_FAMILY, italic: true, size: BASE_FONT_SIZE, color: { argb: 'FFDC2626' } };
          discLabelCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
          styleMergedRange(sheet, currentRow, 1, 7, grayFill());

          const discAmtCell = sheet.getCell(currentRow, 8);
          discAmtCell.value = -discAmt;
          discAmtCell.numFmt = '#,##0.00';
          discAmtCell.font = { name: FONT_FAMILY, italic: true, size: BASE_FONT_SIZE, color: { argb: 'FFDC2626' } };
          discAmtCell.alignment = { horizontal: 'right', vertical: 'middle' };
          discAmtCell.border = blackBoxBorder();
          discAmtCell.fill = grayFill();
          sheet.getRow(currentRow).height = 16;

          // Row 3 — NET SUBTOTAL.
          currentRow++;
          sheet.mergeCells(currentRow, 1, currentRow, 7);
          const netLabelCell = sheet.getCell(currentRow, 1);
          netLabelCell.value = `NET ${baseLabel} (${currencyName})`;
          netLabelCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
          netLabelCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
          styleMergedRange(sheet, currentRow, 1, 7, grayFill());

          const netSumCell = sheet.getCell(currentRow, 8);
          netSumCell.value = formatTurkishCurrency(net, currency);
          netSumCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
          netSumCell.alignment = { horizontal: 'right', vertical: 'middle' };
          netSumCell.border = blackBoxBorder();
          netSumCell.fill = grayFill();
          sheet.getRow(currentRow).height = 16;
        }
      } else {
        // PRODUCT / CUSTOM / SET
        pozCounter++;

        const pozCell = sheet.getCell(currentRow, 1);
        pozCell.value = pozCounter;
        pozCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
        pozCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        pozCell.border = blackBoxBorder();

        // KOD (B), MARKA (C), MODEL (D) — empty for CUSTOM rows that
        // have none. All three use the same left-aligned, wrapped style.
        const metaCells: Array<{ col: number; value: string }> = [
          { col: 2, value: item.code ?? '' },
          { col: 3, value: item.brand ?? '' },
          { col: 4, value: item.model ?? '' },
        ];
        for (const { col, value } of metaCells) {
          const c = sheet.getCell(currentRow, col);
          c.value = value;
          c.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
          c.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
          c.border = blackBoxBorder();
        }

        const descCell = sheet.getCell(currentRow, 5);
        descCell.value = item.description;
        descCell.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
        descCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
        descCell.border = blackBoxBorder();

        if (item.priceLabel) {
          // Keep MIKTAR (col F) with the quantity; merge only BIRIM
          // FIYAT + TOPLAM FIYAT (G:H) for the literal label text.
          // Client still needs the "adet" information on rows like
          // "TARAFINIZCA SAĞLANACAKTIR" / "FİYATA DAHİLDİR".
          const qty = item.quantity ?? 0;
          const unit = unitAbbr(item.unit || 'Adet');
          const qtyCell = sheet.getCell(currentRow, 6);
          qtyCell.value = `${qty} ${unit}`;
          qtyCell.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
          qtyCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          qtyCell.border = blackBoxBorder();

          sheet.mergeCells(currentRow, 7, currentRow, 8);
          const labelCell = sheet.getCell(currentRow, 7);
          labelCell.value = item.priceLabel;
          labelCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
          labelCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          styleMergedRange(sheet, currentRow, 7, 8);
        } else {
          const qty = item.quantity ?? 0;
          const unit = unitAbbr(item.unit || 'Adet');
          const qtyCell = sheet.getCell(currentRow, 6);
          qtyCell.value = `${qty} ${unit}`;
          qtyCell.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
          qtyCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          qtyCell.border = blackBoxBorder();

          // Per-SET currency override: the row's MIKTAR/BİRİM/TOPLAM
          // cells render in the SET's own currency when set, otherwise
          // the quote's currency. Subtotals/grand total below use the
          // quote currency.
          const rowCurrency = (item.itemType === 'SET' && item.currency) ? item.currency : currency;
          const unitPriceCell = sheet.getCell(currentRow, 7);
          unitPriceCell.value = formatTurkishCurrency(item.unitPrice ?? 0, rowCurrency);
          unitPriceCell.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
          unitPriceCell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
          unitPriceCell.border = blackBoxBorder();

          const totalCell = sheet.getCell(currentRow, 8);
          totalCell.value = formatTurkishCurrency(item.totalPrice ?? 0, rowCurrency);
          totalCell.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
          totalCell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
          totalCell.border = blackBoxBorder();
        }

        // Roughly fit long descriptions into a taller row. Column E
        // (AÇIKLAMA) at width ~40 holds about 65 chars per line.
        const lineCount = Math.max(1, Math.ceil(item.description.length / 65));
        sheet.getRow(currentRow).height = lineCount > 1 ? 13 * lineCount : 14;
      }

      currentRow++;
    });

    return currentRow;
  }

  /**
   * Everything below the items table: the `Dahil Olmayan Hizmetler:`
   * block, then `TİCARİ ŞARTLAR` with its categories, then `NOTLAR`.
   * Mirrors rows 27-57 of the reference template.
   *
   * Note: these rows are text-only; no borders, no fill.
   */
  private buildCommercialTermsSection(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    commercialTerms: CommercialTermForExcel[],
    notes?: NoteForExcel[]
  ): number {
    let currentRow = startRow + 1; // blank spacer row

    const termsByCategory = new Map<string, CommercialTermForExcel[]>();
    commercialTerms.forEach((term) => {
      const existing = termsByCategory.get(term.category) || [];
      existing.push(term);
      termsByCategory.set(term.category, existing);
    });

    // ---- 1) Dahil Olmayan Hizmetler ----
    const dahilOlmayan = termsByCategory.get('DAHIL_OLMAYAN');
    if (dahilOlmayan && dahilOlmayan.length > 0) {
      // Title row, A:E merged
      sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
      const t = sheet.getCell(currentRow, 1);
      t.value = 'Dahil Olmayan Hizmetler:';
      t.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
      t.alignment = { horizontal: 'left', vertical: 'middle' };
      sheet.getRow(currentRow).height = 14;
      currentRow++;

      // Content rows, B:E merged (column A stays empty)
      dahilOlmayan
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .forEach((term) => {
          sheet.mergeCells(currentRow, 2, currentRow, TOTAL_COLUMNS);
          const v = sheet.getCell(currentRow, 2);
          v.value = term.value;
          v.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
          v.alignment = { horizontal: 'left', vertical: 'top', wrapText: true, indent: 1 };
          const lineCount = Math.max(3, Math.ceil(term.value.length / 110));
          sheet.getRow(currentRow).height = 11 * lineCount + 2;
          currentRow++;
        });

      currentRow++; // spacer
    }

    // ---- 2) TİCARİ ŞARTLAR block (only if any standard category present) ----
    const hasStandardTerms = COMMERCIAL_TERM_CATEGORIES.some(({ key }) =>
      termsByCategory.has(key)
    );
    if (hasStandardTerms) {
      // Title row, A:E merged
      sheet.mergeCells(currentRow, 1, currentRow, TOTAL_COLUMNS);
      const h = sheet.getCell(currentRow, 1);
      h.value = 'TİCARİ ŞARTLAR';
      h.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
      h.alignment = { horizontal: 'left', vertical: 'middle' };
      sheet.getRow(currentRow).height = 15;
      currentRow++;

      for (const { key, label } of COMMERCIAL_TERM_CATEGORIES) {
        const terms = termsByCategory.get(key);
        if (!terms || terms.length === 0) continue;

        // Category header row, B:E merged, bold
        sheet.mergeCells(currentRow, 2, currentRow, TOTAL_COLUMNS);
        const t = sheet.getCell(currentRow, 2);
        t.value = label;
        t.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
        t.alignment = { horizontal: 'left', vertical: 'middle' };
        sheet.getRow(currentRow).height = 14;
        currentRow++;

        // Content rows, B:E merged, plain, indent 1
        const sortedTerms = [...terms].sort((a, b) => a.sortOrder - b.sortOrder);

        if (key === 'onaylar') {
          // Single comma-joined line (matches PDF behavior)
          const joined = sortedTerms.map((x) => x.value).join(', ');
          sheet.mergeCells(currentRow, 2, currentRow, TOTAL_COLUMNS);
          const v = sheet.getCell(currentRow, 2);
          v.value = joined;
          v.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
          v.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
          sheet.getRow(currentRow).height = 12;
          currentRow++;
        } else if (key === 'uretici_firmalar') {
          // Brand→systems lines, one per brand
          for (const term of sortedTerms) {
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
              sheet.mergeCells(currentRow, 2, currentRow, TOTAL_COLUMNS);
              const v = sheet.getCell(currentRow, 2);
              v.value = line;
              v.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
              v.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
              sheet.getRow(currentRow).height = 12;
              currentRow++;
            }
          }
        } else {
          // Plain text categories (garanti, teslim_yeri, odeme, kdv,
          // teslimat, opsiyon) — one row per entry
          for (const term of sortedTerms) {
            sheet.mergeCells(currentRow, 2, currentRow, TOTAL_COLUMNS);
            const v = sheet.getCell(currentRow, 2);
            v.value = term.value;
            v.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
            v.alignment = { horizontal: 'left', vertical: 'top', wrapText: true, indent: 1 };
            const lineCount = Math.max(1, Math.ceil(term.value.length / 110));
            sheet.getRow(currentRow).height = 12 * lineCount + 2;
            currentRow++;
          }
        }
      }
    }

    // ---- 3) NOTLAR ----
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

      // Title row, B:E merged (column A reserved for the note index)
      sheet.mergeCells(currentRow, 2, currentRow, TOTAL_COLUMNS);
      const h = sheet.getCell(currentRow, 2);
      h.value = 'NOTLAR';
      h.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
      h.alignment = { horizontal: 'left', vertical: 'middle' };
      sheet.getRow(currentRow).height = 15;
      currentRow++;

      sorted.forEach((note, i) => {
        const numCell = sheet.getCell(currentRow, 1);
        numCell.value = i + 1;
        numCell.alignment = { horizontal: 'center', vertical: 'top' };
        numCell.font = { name: FONT_FAMILY, bold: true, size: BASE_FONT_SIZE };
        if (note.highlight) numCell.fill = {
          type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.YELLOW },
        };

        sheet.mergeCells(currentRow, 2, currentRow, TOTAL_COLUMNS);
        const noteCell = sheet.getCell(currentRow, 2);
        noteCell.value = note.text;
        noteCell.font = { name: FONT_FAMILY, size: BASE_FONT_SIZE };
        noteCell.alignment = { horizontal: 'left', vertical: 'top', wrapText: true, indent: 1 };
        if (note.highlight) noteCell.fill = {
          type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.YELLOW },
        };

        const lineCount = Math.max(1, Math.ceil(note.text.length / 110));
        sheet.getRow(currentRow).height = 12 * lineCount + 2;
        currentRow++;
      });
    }

    return currentRow;
  }

  /**
   * Entry point used by the export route. Produces a workbook that
   * mirrors the user-authored reference template
   * `proforma_fatura.xlsx`, with the BTS banner image added on top:
   *
   *   Row 1:      BTS banner image (spans A:E)
   *   Rows 2-6:   Customer / proforma info block
   *   Row 7:      Items table column headers
   *   Rows 8..N:  Item rows (HEADER / NOTE / PRODUCT / SUBTOTAL / GRAND_TOTAL)
   *   Rows N+2..: Dahil Olmayan Hizmetler + TİCARİ ŞARTLAR + NOTLAR
   */
  async generateQuoteExcel(data: QuoteDataForExcel, _companyInfo?: CompanyInfo): Promise<Buffer> {
    void _companyInfo; // kept for API compatibility

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BTS Teklif Sistemi';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Proforma Fatura');

    // Column widths from the reference template
    COLUMN_WIDTHS.forEach((width, idx) => {
      sheet.getColumn(idx + 1).width = width;
    });

    // Row 1: BTS banner image spanning A:E. Falls back to a blank
    // top-margin row if the image file isn't found.
    await this.addBanner(workbook, sheet);

    // Rows 2-6: customer info block
    const afterCustomer = this.buildCustomerBlock(sheet, data);

    // Row 7: items table header
    this.buildTableHeader(sheet, afterCustomer);

    // Rows 8+: items
    const afterItems = this.buildItemsSection(
      sheet,
      afterCustomer + 1,
      data.items,
      data.currency,
      data.totals.grandTotal
    );

    // Terms + notes (text-only, no borders)
    if (
      (data.commercialTerms && data.commercialTerms.length > 0) ||
      (data.notes && data.notes.length > 0)
    ) {
      this.buildCommercialTermsSection(
        sheet,
        afterItems,
        data.commercialTerms || [],
        data.notes
      );
    }

    // Print setup: A4 portrait, fit to one page wide, centered
    // horizontally so the table isn't flushed left when the column
    // total is narrower than the A4 printable area.
    sheet.pageSetup.orientation = 'portrait';
    sheet.pageSetup.paperSize = 9; // A4
    sheet.pageSetup.fitToPage = true;
    sheet.pageSetup.fitToWidth = 1;
    sheet.pageSetup.fitToHeight = 0;
    sheet.pageSetup.horizontalCentered = true;
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
