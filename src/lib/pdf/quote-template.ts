// ---------------------------------------------------------------------------
// Proforma Fatura PDF Template
// Generates HTML for Puppeteer PDF export matching the company's standard
// proforma invoice format. Reference: SA0065, SA0056 proforma PDFs.
// Architecture: single <table> with <thead> (repeats on every printed page)
// containing header image + client info box + column headers.
// Commercial terms and NOTLAR render inside the main table <tbody>.
// ---------------------------------------------------------------------------

export interface QuoteDataForPdf {
  quote: {
    quoteNumber: string;
    refNo?: string | null;
    subject?: string | null;
    createdAt: Date;
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
  itemType: 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SET' | 'SUBTOTAL';
  code?: string | null;
  brand?: string | null;
  description: string;
  quantity: number;
  unit?: string | null;
  unitPrice: number;
  discountPct: number;
  totalPrice: number;
  vatRate: number;
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
    if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET') {
      sum += item.totalPrice;
    }
  }
  return sum;
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
  let itemNumber = 0;
  const itemRows = items.map((item, index) => {
    if (item.itemType === 'HEADER') {
      return `<tr class="section-hdr" style="height:13pt">
        <td><p><br></p></td>
        <td><p class="s1" style="text-align:center;">${escapeHtml(item.description)}</p></td>
        <td><p><br></p></td>
        <td><p><br></p></td>
        <td><p><br></p></td>
      </tr>`;
    }

    if (item.itemType === 'NOTE') {
      return `<tr style="height:15pt">
        <td><p class="s1" style="text-align:center;">NOT:</p></td>
        <td colspan="4"><p class="s2" style="padding-left:1pt;">${escapeHtml(item.description)}</p></td>
      </tr>`;
    }

    if (item.itemType === 'SUBTOTAL') {
      const sectionSum = computeSubtotalSum(items, index);
      return `<tr style="height:13pt">
        <td><p><br></p></td>
        <td><p class="s1" style="text-align:right;padding-right:8pt;">Ara Toplam</p></td>
        <td><p><br></p></td>
        <td><p><br></p></td>
        <td><p class="s1" style="text-align:right;">${formatCurrency(sectionSum, currency)}</p></td>
      </tr>`;
    }

    // PRODUCT, CUSTOM — numbered rows
    const isOptional = item.quantity === 0;
    if (!isOptional) itemNumber++;
    const pozText = isOptional ? 'OPSİYONEL' : `${itemNumber}`;
    const qtyStr = `${item.quantity} ${unitAbbr(item.unit || 'Adet')}`;

    return `<tr>
      <td><p class="s1" style="text-align:center;">${pozText}</p></td>
      <td><p class="s2" style="padding-left:1pt;line-height:108%;">${escapeHtml(item.description)}</p></td>
      <td><p class="s2" style="text-align:right;padding-right:10pt;">${qtyStr}</p></td>
      <td><p class="s2" style="text-align:right;padding-right:14pt;">${formatCurrency(item.unitPrice, currency)}</p></td>
      <td><p class="s2" style="text-align:right;">${formatCurrency(item.totalPrice, currency)}</p></td>
    </tr>`;
  }).join('\n');

  // ---------- System total ----------
  const systemTotalLabel = isTR
    ? `SİSTEM GENEL TOPLAMI (${currencyName})`
    : `SYSTEM GRAND TOTAL (${currencyName})`;

  // ---------- Commercial terms + NOTLAR (inside main table) ----------
  const termsRows = buildCommercialTermsRows(safeTerms, safeNotes, isTR);

  // ---------- Info box left content ----------
  let leftContent = `<p class="s1">${escapeHtml(company.name)}</p>`;
  if (company.address) {
    leftContent += `<p class="s2">${escapeHtml(company.address)}</p>`;
  }
  if (project) {
    leftContent += `<p class="s1" style="padding-top:6pt;">${escapeHtml(project.name)}</p>`;
  }
  if (quote.subject) {
    leftContent += `<p class="s1" style="padding-top:1pt;">${escapeHtml(quote.subject)}</p>`;
  }
  if (data.description) {
    leftContent += `<p class="s1" style="padding-top:1pt;">${escapeHtml(data.description)}</p>`;
  }

  // ---------- Info box right content ----------
  let rightDetailRows = '';
  rightDetailRows += `<tr><td style="padding:2pt 2pt 1pt 8pt; border:none;"><p class="s1">${dateLabel}</p></td><td style="padding:2pt 2pt 1pt 2pt; border:none;"><p class="s1">: ${formatDate(quote.createdAt)}</p></td></tr>`;
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
body { font-family: Arial, sans-serif; color: black; padding: 5mm 10mm 15mm 10mm; }

.s1 { font-family:Arial,sans-serif; font-weight:bold; font-size:6.5pt; color:black; }
.s2 { font-family:Arial,sans-serif; font-weight:normal; font-size:6.5pt; color:black; }
.s3 { font-family:Arial,sans-serif; font-weight:bold; font-size:7.2pt; color:black; }
.s4 { font-family:Arial,sans-serif; font-weight:normal; font-size:7.2pt; color:black; }

p { font-family:Arial,sans-serif; font-weight:normal; font-size:6.5pt; color:black; margin:0; }

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
.notes-row td {
  border: none !important;
  padding: 2pt 2pt;
  vertical-align: top;
}
.last-row td {
  border-bottom: none !important;
}

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
      <td colspan="3" class="info-left" style="border:1.2pt solid black; border-right:1.2pt solid black; vertical-align:top; padding:2pt 4pt 4pt 8pt;">
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
    <!-- System Total -->
    <tr style="height:12pt">
      <td class="sys-total-label" colspan="4"><p class="s1" style="text-align:right;">${systemTotalLabel}</p></td>
      <td class="sys-total-val"><p class="s1" style="text-align:right;">${formatCurrency(totals.grandTotal, currency)}</p></td>
    </tr>

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
    rows += `    <tr class="terms-row"><td colspan="5"><p class="s3" style="padding-left:1pt;padding-top:8pt;">${escapeHtml(label)}</p></td></tr>\n`;
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
    rows += `    <tr class="terms-row"><td colspan="5"><p class="s3" style="padding-left:1pt;padding-top:8pt;">${isTR ? 'TİCARİ ŞARTLAR' : 'COMMERCIAL TERMS'}</p></td></tr>\n`;
  }

  // 3) Render each category in defined order
  for (const catKey of COMMERCIAL_TERM_ORDER) {
    const values = termsByCategory.get(catKey);
    if (!values || values.length === 0) continue;

    const label = CATEGORY_LABELS[catKey] || catKey.toUpperCase();
    rows += `    <tr class="terms-row"><td colspan="5"><p class="s3" style="padding-left:40pt;">${escapeHtml(label)}</p></td></tr>\n`;

    if (catKey === 'onaylar') {
      // onaylar: ALL terms comma-joined on a single line
      const joined = values.map((v) => v.content).join(', ');
      rows += `    <tr class="terms-row"><td colspan="5"><p class="s4" style="padding-left:40pt;line-height:110%;">${escapeHtml(joined)}</p></td></tr>\n`;
    } else if (catKey === 'uretici_firmalar') {
      // uretici_firmalar: each term on its own line
      for (const entry of values) {
        rows += `    <tr class="terms-row"><td colspan="5"><p class="s4" style="padding-left:40pt;line-height:110%;">${escapeHtml(entry.content)}</p></td></tr>\n`;
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
    rows += `    <tr class="terms-row"><td colspan="5"><p class="s3" style="padding-left:40pt;">${escapeHtml(catKey)}</p></td></tr>\n`;
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

    rows += `    <tr class="terms-row"><td colspan="5"><p class="s3" style="padding-left:40pt;padding-top:6pt;">${title}</p></td></tr>\n`;

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
