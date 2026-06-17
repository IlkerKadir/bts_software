// ---------------------------------------------------------------------------
// Proforma Fatura PDF Template
// Generates HTML for Puppeteer PDF export matching the company's standard
// proforma invoice format. Reference: SA0065, SA0056 proforma PDFs.
// Architecture: single <table> with <thead> (repeats on every printed page)
// containing header image + client info box + column headers.
// Commercial terms and NOTLAR render inside the main table <tbody>.
// ---------------------------------------------------------------------------

import { round2 } from '../quote-rounding';

export interface QuoteDataForPdf {
  quote: {
    quoteNumber: string;
    refNo?: string | null;
    subject?: string | null;
    /** Date shown to the customer as "Tarih". For approved quotes this
     *  is the approval timestamp; for pre-approval drafts it's the row
     *  creation date. Resolved by `getQuoteDisplayDate`. */
    displayDate: Date;
    validUntil?: Date | null;
    currency: string;
    language: string;
    notes?: string | null;
  };
  description?: string | null;
  company: {
    name: string;
    address?: string | null;
    taxId?: string | null;
  };
  project?: {
    name: string;
    location?: string | null;
  } | null;
  items: QuoteItemForPdf[];
  totals: {
    subtotal: number;
    totalDiscount: number;
    totalVat: number;
    grandTotal: number;
  };
  commercialTerms: {
    category: string;
    content: string;
    highlight?: boolean;
  }[];
  notes: {
    text: string;
    sortOrder: number;
    highlight: boolean;
  }[];
  headerBase64?: string;
  logoBase64?: string;
}

export interface QuoteItemForPdf {
  id?: string;
  itemType: 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SET' | 'SUBTOTAL' | 'GRAND_TOTAL';
  code?: string | null;
  brand?: string | null;
  description: string;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  discountPct: number;
  /** Per-SUBTOTAL section discount percentage (0–100). When > 0, the
   *  template renders a three-row block: gross SUBTOTAL → İskonto line
   *  → NET SUBTOTAL row. */
  sectionDiscountPct?: number | null;
  /** Optional custom label for the İskonto line. Falls back to "İskonto". */
  sectionDiscountLabel?: string | null;
  totalPrice: number;
  vatRate: number;
  /** Optional background color for HEADER items (CSS color value, e.g. '#FF0000') */
  headerColor?: string | null;
  customPozNo?: string | null;
  /** When true, the row is rendered with a yellow background to match the
   *  editor's row highlight (toggle via right-click "Vurgula"). */
  highlight?: boolean | null;
  /** When set, the row's MIKTAR/BIRIM/TOPLAM columns collapse into one
   *  merged cell with this literal label. */
  priceLabel?: string | null;
  /** Optional per-SET currency override. When set on a top-level SET
   *  row, the MIKTAR/BİRİM/TOPLAM cells render in that currency
   *  instead of the quote's. Grand total and subtotal lines still use
   *  the quote currency. */
  currency?: string | null;
  /** Row total already converted to the quote's currency — used only
   *  when the template computes per-section SUBTOTAL sums so a TRY
   *  SET in an EUR quote contributes its EUR-equivalent instead of
   *  its raw TRY face value. When omitted the raw `totalPrice` is
   *  summed (legacy single-currency behavior). */
  totalPriceInQuoteCurrency?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

/**
 * Category keys as stored in the database.
 * Maps DB key -> PDF header label.
 */
const CATEGORY_LABELS: Record<string, string> = {
  DAHIL_OLMAYAN: 'Dahil Olmayan Hizmetler:',
  uretici_firmalar: 'ÜRETİCİ FİRMALAR',
  onaylar: 'ONAYLAR',
  garanti: 'GARANTİ',
  teslim_yeri: 'TESLİM YERİ',
  odeme: 'ÖDEME',
  kdv: 'KDV',
  teslimat: 'TESLİMAT',
  opsiyon: 'OPSİYON',
  NOTLAR: 'NOTLAR',
};

/**
 * Ordered list of commercial term categories rendered under "TİCARİ ŞARTLAR".
 * DAHIL_OLMAYAN is rendered ABOVE the heading; NOTLAR is rendered separately.
 */
const COMMERCIAL_TERM_ORDER = [
  'uretici_firmalar',
  'onaylar',
  'garanti',
  'teslim_yeri',
  'odeme',
  'kdv',
  'teslimat',
  'opsiyon',
];

const SECTION_BG = '#C6E0B4';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatCurrency(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  const formatted = amount.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${symbol}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function escapeHtml(text: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => escapeMap[char]);
}

/**
 * Escape HTML and convert newlines to <br/> so multi-line notes/descriptions
 * keep their line breaks in the PDF (plain HTML collapses "\n" to a space).
 */
export function escapeHtmlMultiline(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, '<br/>');
}

function unitAbbr(unit: string): string {
  switch (unit) {
    case 'Adet': return 'Ad.';
    case 'Metre': return 'mt.';
    case 'Set': return 'Set';
    default: return unit;
  }
}

function computeSubtotalSum(items: QuoteItemForPdf[], subtotalIndex: number): number {
  let sum = 0;
  for (let i = subtotalIndex - 1; i >= 0; i--) {
    const item = items[i];
    if (item.itemType === 'SUBTOTAL') break;
    // Price-labeled items (e.g. "TARAFINIZCA SAĞLANACAKTIR") contribute 0.
    if (item.priceLabel) continue;
    if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET') {
      // Prefer the pre-converted quote-currency total when supplied
      // (mixed-currency quotes); fall back to raw totalPrice for pure
      // single-currency quotes where the two are identical.
      sum += item.totalPriceInQuoteCurrency ?? item.totalPrice;
    }
  }
  return sum;
}

/**
 * Running net total of priced items strictly above `grandTotalIndex`,
 * using the pre-converted per-row totals already stamped on the PDF
 * items (so no currency context needed here). Mirrors
 * `calculateGrandTotalAtIndex` from quote-calculations.ts but consumes
 * the flattened `QuoteItemForPdf` shape.
 */
function computeGrandTotalAtIndex(items: QuoteItemForPdf[], grandTotalIndex: number): number {
  if (grandTotalIndex <= 0) return 0;
  let runningNet = 0;
  let openTail = 0;
  for (let i = 0; i < grandTotalIndex; i++) {
    const item = items[i];
    if (item.itemType === 'SUBTOTAL') {
      const pct = Number(item.sectionDiscountPct ?? 0);
      const discountAmount = round2(openTail * (pct / 100));
      runningNet = round2(runningNet + openTail - discountAmount);
      openTail = 0;
      continue;
    }
    if (item.priceLabel) continue;
    if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET') {
      openTail += item.totalPriceInQuoteCurrency ?? item.totalPrice ?? 0;
    }
  }
  return round2(runningNet + openTail);
}

// ---------------------------------------------------------------------------
// Main HTML generator
// ---------------------------------------------------------------------------

export function generateQuoteHtml(data: QuoteDataForPdf): string {
  const { quote, company, project, items, totals, commercialTerms, notes, headerBase64, logoBase64 } = data;
  const safeTerms = commercialTerms || [];
  const safeNotes = notes || [];
  const currency = quote.currency;
  const lang = quote.language || 'TR';
  const isTR = lang === 'TR';
  const currencyName = CURRENCY_NAMES[currency] || currency;

  const proformaTitle = isTR ? 'PROFORMA FATURA' : 'PROFORMA INVOICE';
  const dateLabel = isTR ? 'Tarih' : 'Date';
  const refLabel = 'Ref.No';
  const quoteLabel = isTR ? 'Teklif No' : 'Quote No';

  // ---------- Header image ----------
  const headerImgSrc = headerBase64 || logoBase64;
  const headerImgHtml = headerImgSrc
    ? `<img src="${headerImgSrc}" style="width:100%;height:auto;display:block;" alt="BTS">`
    : '<p style="font-size:14pt;font-weight:bold;color:#cc0000;padding:10pt;">BTS YANGIN</p>';

  // ---------- Build item rows ----------
  // When `highlight` is set on an item, the editor renders a yellow row
  // background; we inject the same color into the PDF as an inline style
  // so the customer-facing PDF matches what the salesperson saw.
  const HIGHLIGHT_BG = '#FFF9C4';
  const highlightStyle = (item: QuoteItemForPdf) =>
    item.highlight ? `background-color:${HIGHLIGHT_BG};` : '';

  let itemNumber = 0;
  const itemRows = items.map((item, index) => {
    if (item.itemType === 'HEADER') {
      return `<tr style="height:13pt; page-break-after:avoid; break-after:avoid;${highlightStyle(item)}">
        <td><p><br></p></td>
        <td colspan="4"><p class="s1" style="padding-left:1pt; color:black;">${escapeHtml(item.description)}</p></td>
      </tr>`;
    }

    if (item.itemType === 'NOTE') {
      const pozLabel = item.customPozNo || 'NOT:';
      return `<tr style="height:15pt;${highlightStyle(item)}">
        <td><p class="s1" style="text-align:center;">${escapeHtml(pozLabel)}</p></td>
        <td colspan="4"><p class="s2" style="padding-left:1pt;">${escapeHtmlMultiline(item.description)}</p></td>
      </tr>`;
    }

    if (item.itemType === 'GRAND_TOTAL') {
      const grandTotalLabel = escapeHtml(item.description || 'GENEL TOPLAM');
      const runningTotal = computeGrandTotalAtIndex(items, index);
      return `<tr style="height:14pt">
        <td class="sys-total-label" colspan="4"><p class="s1" style="text-align:right;">${grandTotalLabel} (${currencyName})</p></td>
        <td class="sys-total-val"><p class="s1" style="text-align:right;">${formatCurrency(runningTotal, currency)}</p></td>
      </tr>`;
    }

    if (item.itemType === 'SUBTOTAL') {
      const sectionSum = computeSubtotalSum(items, index);
      const pct = Number(item.sectionDiscountPct ?? 0);
      const discAmt = pct > 0 ? round2(sectionSum * (pct / 100)) : 0;
      const net = sectionSum - discAmt;
      const subtotalLabel = escapeHtml(item.description || 'Ara Toplam');
      const discountLabel = escapeHtml(item.sectionDiscountLabel?.trim() || 'İskonto');
      let subtotalRows = `<tr><td colspan="5" style="height:4pt; border:none; padding:0;"></td></tr>`;
      if (pct > 0) {
        // Three-row layout: gross SUBTOTAL → İskonto line → NET SUBTOTAL
        subtotalRows += `
      <tr style="height:12pt">
        <td class="sys-total-label" colspan="4"><p class="s1" style="text-align:right;">${subtotalLabel} (${currencyName})</p></td>
        <td class="sys-total-val"><p class="s1" style="text-align:right;">${formatCurrency(sectionSum, currency)}</p></td>
      </tr>
      <tr style="height:12pt" class="discount-row">
        <td class="sys-total-label discount-label" colspan="4"><p class="s1" style="text-align:right;">${discountLabel} (%${pct}) (${currencyName})</p></td>
        <td class="sys-total-val discount-amount"><p class="s1" style="text-align:right;">- ${formatCurrency(discAmt, currency)}</p></td>
      </tr>
      <tr style="height:12pt">
        <td class="sys-total-label" colspan="4"><p class="s1" style="text-align:right;">NET ${subtotalLabel} (${currencyName})</p></td>
        <td class="sys-total-val"><p class="s1" style="text-align:right;">${formatCurrency(net, currency)}</p></td>
      </tr>`;
      } else {
        // No discount: single SUBTOTAL row at gross (which equals net).
        subtotalRows += `
      <tr style="height:12pt">
        <td class="sys-total-label" colspan="4"><p class="s1" style="text-align:right;">${subtotalLabel} (${currencyName})</p></td>
        <td class="sys-total-val"><p class="s1" style="text-align:right;">${formatCurrency(sectionSum, currency)}</p></td>
      </tr>`;
      }
      // Omit the trailing 4pt spacer if the next row is a GRAND_TOTAL,
      // so the grand total sits flush against the subtotal card.
      const nextIsGrandTotal = items[index + 1]?.itemType === 'GRAND_TOTAL';
      if (!nextIsGrandTotal) {
        subtotalRows += `<tr><td colspan="5" style="height:4pt; border:none; padding:0;"></td></tr>`;
      }
      return subtotalRows;
    }

    // PRODUCT, CUSTOM — numbered rows
    let pozText: string;
    if (item.customPozNo) {
      pozText = item.customPozNo;
      const num = parseInt(item.customPozNo, 10);
      if (!isNaN(num) && String(num) === item.customPozNo) {
        itemNumber = num;
      }
    } else {
      itemNumber++;
      pozText = `${itemNumber}`;
    }

    // Format with Turkish thousand separators and drop trailing
    // zero decimals so integer quantities read as "40.000" not
    // "40.000,00". `white-space:nowrap` on the cell below keeps the
    // number + unit on a single line even when the column is tight —
    // the auto table layout will expand c3 slightly if it truly has
    // to, stealing width from the description (which wraps).
    const qtyFormatted = new Intl.NumberFormat('tr-TR', {
      maximumFractionDigits: 2,
    }).format(item.quantity);
    const qtyStr = `${qtyFormatted} ${unitAbbr(item.unit || 'Adet')}`;

    // When the item has a priceLabel, keep the MIKTAR column showing
    // the quantity and only merge BIRIM FIYAT + TOPLAM FIYAT into a
    // single cell for the label — client needs the adet info even on
    // "TARAFINIZCA SAĞLANACAKTIR" / "FİYATA DAHİLDİR" rows.
    if (item.priceLabel) {
      return `<tr style="${highlightStyle(item)}">
      <td><p class="s1" style="text-align:center;">${pozText}</p></td>
      <td><p class="s2" style="padding-left:1pt;line-height:108%;">${escapeHtmlMultiline(item.description)}</p></td>
      <td><p class="s2" style="text-align:right;padding-right:10pt;white-space:nowrap;">${qtyStr}</p></td>
      <td colspan="2"><p class="s1" style="text-align:center;padding:0 4pt;">${escapeHtml(item.priceLabel)}</p></td>
    </tr>`;
    }

    // Per-SET currency override: the row's MIKTAR/BİRİM/TOPLAM cells
    // render in the SET's own currency if it set one, otherwise the
    // quote currency. Subtotals and the grand total further below still
    // use the quote currency — conversion already happened in
    // recalculateAndPersistQuoteTotals before persisting.
    const rowCurrency = (item.itemType === 'SET' && item.currency) ? item.currency : currency;

    return `<tr style="${highlightStyle(item)}">
      <td><p class="s1" style="text-align:center;">${pozText}</p></td>
      <td><p class="s2" style="padding-left:1pt;line-height:108%;">${escapeHtmlMultiline(item.description)}</p></td>
      <td><p class="s2" style="text-align:right;padding-right:10pt;white-space:nowrap;">${qtyStr}</p></td>
      <td><p class="s2" style="text-align:right;padding-right:14pt;white-space:nowrap;">${formatCurrency(item.unitPrice, rowCurrency)}</p></td>
      <td><p class="s2" style="text-align:right;white-space:nowrap;">${formatCurrency(item.totalPrice, rowCurrency)}</p></td>
    </tr>`;
  }).join('\n');

  // ---------- Commercial terms + NOTLAR (inside main table) ----------
  const termsRows = buildCommercialTermsRows(safeTerms, safeNotes, isTR);

  // ---------- Info box left content ----------
  let leftContent = `<p class="s1">${escapeHtml(company.name)}</p>`;
  if (company.address) {
    leftContent += `<p class="s2">${escapeHtml(company.address)}</p>`;
  }
  if (quote.subject) {
    leftContent += `<p class="s1" style="padding-top:8pt;">${escapeHtml(quote.subject)}</p>`;
  }
  if (data.description) {
    leftContent += `<p class="s1" style="padding-top:1pt;">${escapeHtml(data.description)}</p>`;
  }

  // ---------- Info box right content ----------
  let rightDetailRows = '';
  rightDetailRows += `<tr><td style="padding:2pt 2pt 1pt 8pt; border:none;"><p class="s1">${dateLabel}</p></td><td style="padding:2pt 2pt 1pt 2pt; border:none;"><p class="s1">: ${formatDate(quote.displayDate)}</p></td></tr>`;
  if (quote.refNo) {
    rightDetailRows += `<tr><td style="padding:1pt 2pt 1pt 8pt; border:none;"><p class="s1">${refLabel}</p></td><td style="padding:1pt 2pt 1pt 2pt; border:none;"><p class="s1">: ${escapeHtml(quote.refNo)}</p></td></tr>`;
  }
  rightDetailRows += `<tr><td style="padding:1pt 2pt 2pt 8pt; border:none;"><p class="s1">${quoteLabel}</p></td><td style="padding:1pt 2pt 2pt 2pt; border:none;"><p class="s1">: ${escapeHtml(quote.quoteNumber)}</p></td></tr>`;

  // ---------- Full HTML ----------
  return `<!DOCTYPE html>
<html lang="${isTR ? 'tr' : 'en'}">
<head>
<meta charset="UTF-8">
<title>${proformaTitle} - ${escapeHtml(quote.quoteNumber)}</title>
<style>
@page { size: A4 portrait; margin: 5mm 10mm 15mm 10mm; }
* { margin:0; padding:0; text-indent:0; }
/* Font: Arial (client requirement), fallbacks Liberation Sans then
   Noto Sans. Local Mac has Arial preinstalled under
   /System/Library/Fonts/Supplemental; prod Docker has the Arial TTFs
   COPY'd in from fonts/arial/ via the Dockerfile. Liberation Sans is
   kept as the first fallback because it is metric-compatible with
   Arial (same character widths, same wrapping) — if the Arial COPY
   ever fails to land in the image, layouts still match Arial. Noto
   Sans is the final fallback for rare glyphs the first two do not
   carry (most importantly the Turkish Lira sign U+20BA).
   Sizes 6.5pt/7.2pt are tuned for the dense 5-column table layout.
   Client mentioned "10 punto" but that refers to the original Word
   template; at 10pt the table columns overflow on A4. If 10pt is
   truly needed, column widths and page margins must be revisited. */
body { font-family: Arial, "Liberation Sans", "Noto Sans", sans-serif; color: black; padding: 5mm 10mm 15mm 10mm; }

.s1 { font-family:Arial,"Liberation Sans","Noto Sans",sans-serif; font-weight:bold; font-size:8pt; color:black; }
.s2 { font-family:Arial,"Liberation Sans","Noto Sans",sans-serif; font-weight:normal; font-size:8pt; color:black; }
.s3 { font-family:Arial,"Liberation Sans","Noto Sans",sans-serif; font-weight:bold; font-size:9pt; color:black; }
.s4 { font-family:Arial,"Liberation Sans","Noto Sans",sans-serif; font-weight:normal; font-size:9pt; color:black; }

p { font-family:Arial,"Liberation Sans","Noto Sans",sans-serif; font-weight:normal; font-size:8pt; color:black; margin:0; }

table.main { width:100%; border-collapse:collapse; }
thead { display: table-header-group; }

/* Column widths */
col.c1 { width: 8.7%; }
col.c2 { width: 57.2%; }
col.c3 { width: 9.5%; }
col.c4 { width: 11.5%; }
col.c5 { width: 13.1%; }

/* Header image row */
.hdr-img-cell {
  border: 1.2pt solid black;
  padding: 0;
}
.hdr-img-cell img { width:100%; height:auto; display:block; }

/* Client info box cells */
.info-left, .info-right { border: 1.2pt solid black; }
.info-right table td { border: none; }

/* Column header cells */
.col-hdr {
  border: 1.2pt solid black;
  padding: 3pt 2pt;
  background: white;
}

/* Item rows — no borders (matches client's PDF format) */
table.main tbody td {
  border: none;
  padding: 3pt 4pt;
  vertical-align: top;
}
/* Prevent price text wrapping */
table.main tbody td:nth-child(4),
table.main tbody td:nth-child(5) {
  white-space: nowrap;
}

/* Section header (green) */
.section-hdr td {
  background-color: ${SECTION_BG};
  border: none !important;
}

/* System total row */
.sys-total-label {
  border: 1.2pt solid black !important;
  padding: 3pt 6pt 3pt 2pt;
}
.sys-total-val {
  border: 1.2pt solid black !important;
  padding: 3pt 2pt;
}

/* Commercial terms & NOTLAR rows (inside main table) */
.terms-row td {
  border: none !important;
  padding: 1pt 2pt;
  vertical-align: top;
}
/* Keep section headings together with their first content row — prevents
   a heading from being stranded at the bottom of a page while content
   flows to the next page */
.terms-heading {
  page-break-after: avoid;
  break-after: avoid;
}
.terms-row {
  page-break-inside: avoid;
  break-inside: avoid;
}
.notes-row td {
  border: none !important;
  padding: 2pt 2pt;
  vertical-align: top;
}
.last-row td {
  border-bottom: none !important;
}

/* Per-section İskonto row */
.discount-row td { padding: 4px 8px; }
.discount-label { text-align: right; color: #555; }
.discount-amount { text-align: right; white-space: nowrap; }

/* Yellow highlight */
.highlight-yellow {
  background-color: #FFFF00;
}
</style>
</head>
<body>

<table class="main">
  <colgroup>
    <col class="c1"><col class="c2"><col class="c3"><col class="c4"><col class="c5">
  </colgroup>

  <thead>
    <!-- Row 1: Header banner image -->
    <tr>
      <td colspan="5" class="hdr-img-cell">${headerImgHtml}</td>
    </tr>

    <!-- Row 2: Client info box (colspan=3 left + colspan=2 right) -->
    <tr>
      <td colspan="3" class="info-left" style="border:1.2pt solid black; border-right:1.2pt solid black; vertical-align:top; padding:4pt 4pt 4pt 8pt; text-align:left;">
        ${leftContent}
      </td>
      <td colspan="2" class="info-right" style="border:1.2pt solid black; border-left:none; vertical-align:top; padding:0;">
        <p class="s1" style="text-align:center; padding:6pt 0 6pt 0; border-bottom:1.2pt solid black;">${proformaTitle}</p>
        <table cellspacing="0" style="width:100%; border-collapse:collapse;">
          ${rightDetailRows}
        </table>
      </td>
    </tr>

    <!-- Column headers -->
    <tr style="height:14pt">
      <td class="col-hdr"><p class="s1" style="text-align:center;">POZ NO</p></td>
      <td class="col-hdr"><p class="s1" style="text-align:center;">AÇIKLAMA</p></td>
      <td class="col-hdr"><p class="s1" style="text-align:center;">MİKTAR</p></td>
      <td class="col-hdr"><p class="s1" style="text-align:center;">BİRİM FİYAT</p></td>
      <td class="col-hdr"><p class="s1" style="text-align:center;">TOPLAM FİYAT</p></td>
    </tr>
  </thead>

  <tbody>
    <tr><td colspan="5" style="height:6pt; border:none; padding:0;"></td></tr>
    ${itemRows}

    <tr><td colspan="5" style="height:6pt; border:none; padding:0;"></td></tr>

${termsRows}

  </tbody>
</table>

</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Commercial terms builder (inside main table tbody)
// Handles both multi-value and single-value categories with correct rendering.
// DAHIL_OLMAYAN renders ABOVE the "TİCARİ ŞARTLAR" heading.
// NOTLAR renders as numbered items at the bottom with highlight support.
// ---------------------------------------------------------------------------

function buildCommercialTermsRows(
  terms: { category: string; content: string; highlight?: boolean }[],
  legacyNotes: { text: string; sortOrder: number; highlight: boolean }[],
  isTR: boolean
): string {
  if ((!terms || terms.length === 0) && (!legacyNotes || legacyNotes.length === 0)) return '';

  // Group all terms by category
  const termsByCategory = new Map<string, { content: string; highlight?: boolean }[]>();
  for (const term of terms) {
    const existing = termsByCategory.get(term.category) || [];
    existing.push({ content: term.content, highlight: term.highlight });
    termsByCategory.set(term.category, existing);
  }

  let rows = '';

  // 1) DAHIL_OLMAYAN — rendered ABOVE the TİCARİ ŞARTLAR heading
  const dahilOlmayan = termsByCategory.get('DAHIL_OLMAYAN');
  if (dahilOlmayan && dahilOlmayan.length > 0) {
    const label = CATEGORY_LABELS['DAHIL_OLMAYAN'] || 'Dahil Olmayan Hizmetler:';
    rows += `    <tr class="terms-row terms-heading"><td colspan="5"><p class="s3" style="padding-left:1pt;padding-top:8pt;">${escapeHtml(label)}</p></td></tr>\n`;
    for (const entry of dahilOlmayan) {
      rows += `    <tr class="terms-row"><td colspan="5"><p class="s4" style="padding-left:40pt;line-height:110%;">${escapeHtml(entry.content)}</p></td></tr>\n`;
    }
  }

  // 2) TİCARİ ŞARTLAR heading
  // Check if there are any terms in the standard commercial term categories
  const hasStandardTerms = COMMERCIAL_TERM_ORDER.some((key) => termsByCategory.has(key));
  // Also check for unknown categories (not DAHIL_OLMAYAN, not NOTLAR, not in COMMERCIAL_TERM_ORDER)
  const knownKeys = new Set([...COMMERCIAL_TERM_ORDER, 'DAHIL_OLMAYAN', 'NOTLAR']);
  const unknownCats = Array.from(termsByCategory.keys()).filter((k) => !knownKeys.has(k));
  const hasAnyCommercialTerms = hasStandardTerms || unknownCats.length > 0;

  if (hasAnyCommercialTerms) {
    rows += `    <tr class="terms-row terms-heading"><td colspan="5"><p class="s3" style="padding-left:1pt;padding-top:8pt;">${isTR ? 'TİCARİ ŞARTLAR' : 'COMMERCIAL TERMS'}</p></td></tr>\n`;
  }

  // 3) Render each category in defined order
  for (const catKey of COMMERCIAL_TERM_ORDER) {
    const values = termsByCategory.get(catKey);
    if (!values || values.length === 0) continue;

    const label = CATEGORY_LABELS[catKey] || catKey.toUpperCase();
    rows += `    <tr class="terms-row terms-heading"><td colspan="5"><p class="s3" style="padding-left:40pt;">${escapeHtml(label)}</p></td></tr>\n`;

    if (catKey === 'onaylar') {
      // onaylar: ALL terms comma-joined on a single line
      const joined = values.map((v) => v.content).join(', ');
      rows += `    <tr class="terms-row"><td colspan="5"><p class="s4" style="padding-left:40pt;line-height:110%;">${escapeHtml(joined)}</p></td></tr>\n`;
    } else if (catKey === 'uretici_firmalar') {
      // uretici_firmalar: parse JSON brand→systems map, render as "BRAND - SYSTEM1, SYSTEM2" per line
      for (const entry of values) {
        try {
          const parsed = JSON.parse(entry.content) as Record<string, string[]>;
          for (const [brand, systems] of Object.entries(parsed)) {
            const line = systems.length > 0 ? `${brand} - ${systems.join(', ')}` : brand;
            rows += `    <tr class="terms-row"><td colspan="5"><p class="s4" style="padding-left:40pt;line-height:110%;">${escapeHtml(line)}</p></td></tr>\n`;
          }
        } catch {
          // Not JSON — render as plain text
          rows += `    <tr class="terms-row"><td colspan="5"><p class="s4" style="padding-left:40pt;line-height:110%;">${escapeHtml(entry.content)}</p></td></tr>\n`;
        }
      }
    } else {
      // All other single-value categories: each value as a paragraph
      for (const entry of values) {
        rows += `    <tr class="terms-row"><td colspan="5"><p class="s4" style="padding-left:40pt;line-height:110%;">${escapeHtml(entry.content)}</p></td></tr>\n`;
      }
    }
  }

  // 4) Any terms with categories not in the predefined list
  for (const catKey of unknownCats) {
    const values = termsByCategory.get(catKey)!;
    rows += `    <tr class="terms-row terms-heading"><td colspan="5"><p class="s3" style="padding-left:40pt;">${escapeHtml(catKey)}</p></td></tr>\n`;
    for (const entry of values) {
      rows += `    <tr class="terms-row"><td colspan="5"><p class="s4" style="padding-left:40pt;line-height:110%;">${escapeHtml(entry.content)}</p></td></tr>\n`;
    }
  }

  // 5) NOTLAR — numbered items with highlight support
  // Merge NOTLAR from commercial terms AND from legacy notes array
  const notlarFromTerms = termsByCategory.get('NOTLAR') || [];
  const allNotes: { text: string; highlight: boolean; sortOrder: number }[] = [];

  // Notes from commercial terms (NOTLAR category)
  notlarFromTerms.forEach((entry, idx) => {
    allNotes.push({
      text: entry.content,
      highlight: entry.highlight ?? false,
      sortOrder: idx + 1,
    });
  });

  // Legacy notes (from the separate notes array — only add if not already included via terms)
  if (legacyNotes && legacyNotes.length > 0 && notlarFromTerms.length === 0) {
    for (const note of legacyNotes) {
      allNotes.push({
        text: note.text,
        highlight: note.highlight,
        sortOrder: note.sortOrder,
      });
    }
  }

  if (allNotes.length > 0) {
    const sorted = [...allNotes].sort((a, b) => a.sortOrder - b.sortOrder);
    const title = isTR ? 'NOTLAR' : 'NOTES';

    rows += `    <tr class="terms-row terms-heading"><td colspan="5"><p class="s3" style="padding-left:40pt;padding-top:6pt;">${title}</p></td></tr>\n`;

    sorted.forEach((note, i) => {
      const hlClass = note.highlight ? ' highlight-yellow' : '';
      const isLast = i === sorted.length - 1;
      rows += `    <tr class="notes-row${isLast ? ' last-row' : ''}">`;
      rows += `<td style="text-align:right;padding-right:6pt;"${hlClass ? ` class="${hlClass.trim()}"` : ''}><p class="s1">${i + 1}</p></td>`;
      rows += `<td colspan="4"${hlClass ? ` class="${hlClass.trim()}"` : ''}><p class="s2" style="line-height:108%;">${escapeHtml(note.text)}</p></td>`;
      rows += '</tr>\n';
    });
  }

  return rows;
}
