// ---------------------------------------------------------------------------
// Siparis Teyit Formu (Order Confirmation) PDF Template
// Generates HTML for Puppeteer PDF export.
// Simpler format than the proforma invoice — focuses on order number,
// company info, linked quote reference, item list, totals, delivery date,
// payment terms, and notes.
// ---------------------------------------------------------------------------

export interface OrderDataForPdf {
  order: {
    orderNumber: string;
    status: string;
    notes?: string | null;
    deliveryDate?: Date | null;
    createdAt: Date;
  };
  quote: {
    quoteNumber: string;
    refNo?: string | null;
    subject?: string | null;
    currency: string;
    grandTotal: number;
  };
  company: {
    name: string;
    address?: string | null;
    taxNumber?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  project?: {
    name: string;
  } | null;
  items: OrderItemForPdf[];
  commercialTerms: {
    category: string;
    value: string;
  }[];
  headerBase64?: string;
  logoBase64?: string;
}

export interface OrderItemForPdf {
  itemType: string;
  code?: string | null;
  brand?: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '\u20AC',
  USD: '$',
  GBP: '\u00A3',
  TRY: '\u20BA',
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  HAZIRLANIYOR: 'Hazirlanıyor',
  ONAYLANDI: 'Onaylandı',
  GONDERILDI: 'Gonderildi',
  TAMAMLANDI: 'Tamamlandı',
  IPTAL: 'Iptal',
};

const COMMERCIAL_TERM_LABELS: Record<string, string> = {
  URETICI: 'Uretici Firmalar',
  ONAY: 'Onaylar',
  GARANTI: 'Garanti',
  TESLIM_YERI: 'Teslim Yeri',
  ODEME: 'Odeme',
  KDV: 'KDV',
  TESLIMAT: 'Teslimat',
  OPSIYON: 'Opsiyon',
  NOTLAR: 'Notlar',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number, currency: string): string {
  const formatted = amount.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  return `${formatted} ${symbol}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

function unitAbbr(unit: string): string {
  switch (unit) {
    case 'Adet': return 'Ad.';
    case 'Metre': return 'mt.';
    case 'Set': return 'Set';
    default: return unit;
  }
}

// ---------------------------------------------------------------------------
// Main HTML generator
// ---------------------------------------------------------------------------

export function generateOrderHtml(data: OrderDataForPdf): string {
  const { order, quote, company, project, items, commercialTerms, headerBase64, logoBase64 } = data;
  const currency = quote.currency;

  // ---------- Header image ----------
  const headerImgSrc = headerBase64 || logoBase64;
  const headerImgHtml = headerImgSrc
    ? `<img src="${headerImgSrc}" style="width:100%;height:auto;display:block;" alt="BTS">`
    : '<p style="font-size:14pt;font-weight:bold;color:#cc0000;padding:10pt;">BTS YANGIN</p>';

  // ---------- Build item rows ----------
  let itemNumber = 0;
  const itemRows = items.map((item) => {
    if (item.itemType === 'HEADER') {
      return `<tr class="section-hdr">
        <td><p><br></p></td>
        <td colspan="4"><p class="s1" style="text-align:center;">${escapeHtml(item.description)}</p></td>
      </tr>`;
    }

    if (item.itemType === 'NOTE') {
      return `<tr>
        <td><p class="s1" style="text-align:center;">NOT:</p></td>
        <td colspan="4"><p class="s2" style="padding-left:1pt;">${escapeHtml(item.description)}</p></td>
      </tr>`;
    }

    if (item.itemType === 'SUBTOTAL') {
      return ''; // Skip subtotals in order form
    }

    // PRODUCT, CUSTOM, SET -- numbered rows
    itemNumber++;
    const qtyStr = `${item.quantity} ${unitAbbr(item.unit)}`;

    return `<tr>
      <td><p class="s1" style="text-align:center;">${itemNumber}</p></td>
      <td><p class="s2" style="padding-left:1pt;line-height:108%;">${escapeHtml(item.description)}${item.brand ? ` <span style="color:#666;">(${escapeHtml(item.brand)})</span>` : ''}</p></td>
      <td><p class="s2" style="text-align:right;padding-right:10pt;">${qtyStr}</p></td>
      <td><p class="s2" style="text-align:right;padding-right:14pt;">${formatCurrency(item.unitPrice, currency)}</p></td>
      <td><p class="s2" style="text-align:right;">${formatCurrency(item.totalPrice, currency)}</p></td>
    </tr>`;
  }).join('\n');

  // ---------- Commercial terms rows ----------
  const termsByCategory = new Map<string, string[]>();
  for (const term of commercialTerms) {
    const existing = termsByCategory.get(term.category) || [];
    existing.push(term.value);
    termsByCategory.set(term.category, existing);
  }

  let termsHtml = '';
  if (commercialTerms.length > 0) {
    termsHtml += `<tr class="terms-row"><td colspan="5"><p class="s3" style="padding-top:8pt;">TİCARİ ŞARTLAR</p></td></tr>\n`;
    for (const [catKey, values] of Array.from(termsByCategory.entries())) {
      const label = COMMERCIAL_TERM_LABELS[catKey] || catKey;
      termsHtml += `<tr class="terms-row"><td colspan="5"><p class="s3" style="padding-left:20pt;">${escapeHtml(label)}</p></td></tr>\n`;
      for (const val of values) {
        termsHtml += `<tr class="terms-row"><td colspan="5"><p class="s4" style="padding-left:20pt;line-height:110%;">${escapeHtml(val)}</p></td></tr>\n`;
      }
    }
  }

  // ---------- Notes ----------
  let notesHtml = '';
  if (order.notes) {
    notesHtml = `<tr class="terms-row"><td colspan="5"><p class="s3" style="padding-top:8pt;">NOTLAR</p></td></tr>
    <tr class="terms-row"><td colspan="5"><p class="s4" style="padding-left:20pt;line-height:110%;white-space:pre-wrap;">${escapeHtml(order.notes)}</p></td></tr>`;
  }

  // ---------- Company info ----------
  let companyHtml = `<p class="s1">${escapeHtml(company.name)}</p>`;
  if (company.address) {
    companyHtml += `<p class="s2">${escapeHtml(company.address)}</p>`;
  }
  if (company.taxNumber) {
    companyHtml += `<p class="s2">Vergi No: ${escapeHtml(company.taxNumber)}</p>`;
  }
  if (company.phone) {
    companyHtml += `<p class="s2">Tel: ${escapeHtml(company.phone)}</p>`;
  }
  if (company.email) {
    companyHtml += `<p class="s2">E-posta: ${escapeHtml(company.email)}</p>`;
  }
  if (project) {
    companyHtml += `<p class="s1" style="padding-top:6pt;">Proje: ${escapeHtml(project.name)}</p>`;
  }
  if (quote.subject) {
    companyHtml += `<p class="s1" style="padding-top:1pt;">Konu: ${escapeHtml(quote.subject)}</p>`;
  }

  // ---------- Right-side info rows ----------
  let rightRows = '';
  rightRows += `<tr><td class="info-label"><p class="s1">Tarih</p></td><td class="info-val"><p class="s1">: ${formatDate(order.createdAt)}</p></td></tr>`;
  rightRows += `<tr><td class="info-label"><p class="s1">Siparis No</p></td><td class="info-val"><p class="s1">: ${escapeHtml(order.orderNumber)}</p></td></tr>`;
  rightRows += `<tr><td class="info-label"><p class="s1">Teklif No</p></td><td class="info-val"><p class="s1">: ${escapeHtml(quote.quoteNumber)}</p></td></tr>`;
  if (quote.refNo) {
    rightRows += `<tr><td class="info-label"><p class="s1">Ref. No</p></td><td class="info-val"><p class="s1">: ${escapeHtml(quote.refNo)}</p></td></tr>`;
  }
  if (order.deliveryDate) {
    rightRows += `<tr><td class="info-label"><p class="s1">Teslim Tarihi</p></td><td class="info-val"><p class="s1">: ${formatDate(order.deliveryDate)}</p></td></tr>`;
  }

  // ---------- Full HTML ----------
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>SİPARİŞ TEYİT FORMU - ${escapeHtml(order.orderNumber)}</title>
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
.info-label { padding: 2pt 2pt 1pt 8pt; border: none; }
.info-val { padding: 2pt 2pt 1pt 2pt; border: none; }

/* Column header cells */
.col-hdr {
  border: 1.2pt solid black;
  padding: 3pt 2pt;
  background: white;
}

/* Item rows */
table.main tbody td {
  border-left: 0.25pt solid black;
  border-right: 0.25pt solid black;
  border-bottom: 0.25pt solid black;
  padding: 3pt 4pt;
  vertical-align: top;
}
table.main tbody td:nth-child(4),
table.main tbody td:nth-child(5) {
  white-space: nowrap;
}

/* Section header (green) */
.section-hdr td {
  background-color: #C6E0B4;
  border-left: 0.25pt solid black !important;
  border-right: 0.25pt solid black !important;
  border-bottom: 0.25pt solid black !important;
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

/* Commercial terms rows */
.terms-row td {
  border: none !important;
  padding: 1pt 2pt;
  vertical-align: top;
}
.last-row td {
  border-bottom: none !important;
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

    <!-- Row 2: Client info box -->
    <tr>
      <td colspan="3" class="info-left" style="border:1.2pt solid black; border-right:1.2pt solid black; vertical-align:top; padding:2pt 4pt 4pt 8pt;">
        ${companyHtml}
      </td>
      <td colspan="2" class="info-right" style="border:1.2pt solid black; border-left:none; vertical-align:top; padding:0;">
        <p class="s1" style="text-align:center; padding:6pt 0 6pt 0; border-bottom:1.2pt solid black;">SİPARİŞ TEYİT FORMU</p>
        <table cellspacing="0" style="width:100%; border-collapse:collapse;">
          ${rightRows}
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
    ${itemRows}

    <!-- Grand Total -->
    <tr style="height:12pt">
      <td class="sys-total-label" colspan="4"><p class="s1" style="text-align:right;">GENEL TOPLAM (${CURRENCY_SYMBOLS[currency] || currency})</p></td>
      <td class="sys-total-val"><p class="s1" style="text-align:right;">${formatCurrency(quote.grandTotal, currency)}</p></td>
    </tr>

${termsHtml}

${notesHtml}

  </tbody>
</table>

</body>
</html>`;
}
