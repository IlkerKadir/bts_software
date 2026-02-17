export interface QuoteDataForPdf {
  quote: {
    quoteNumber: string;
    subject?: string | null;
    createdAt: Date;
    validUntil?: Date | null;
    currency: string;
    notes?: string | null;
  };
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
  }[];
}

export interface QuoteItemForPdf {
  itemType: 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SERVICE' | 'SUBTOTAL';
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

const currencySymbols: Record<string, string> = {
  EUR: '\u20AC', // €
  USD: '$',
  GBP: '\u00A3', // £
  TRY: '\u20BA', // ₺
};

function formatCurrency(amount: number, currency: string): string {
  const symbol = currencySymbols[currency] || currency;
  return `${symbol}${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function escapeHtml(text: string): string {
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
    case 'Metre': return 'm.';
    case 'Set': return 'Set';
    default: return unit;
  }
}

/**
 * Compute the section sum for a SUBTOTAL row.
 * Sums totalPrice of all priced items (PRODUCT, CUSTOM, SERVICE) between
 * the previous SUBTOTAL (or start of list) and this SUBTOTAL row.
 */
function computeSubtotalSum(items: QuoteItemForPdf[], subtotalIndex: number): number {
  let sum = 0;
  // Walk backwards from the subtotal index to find the section boundary
  for (let i = subtotalIndex - 1; i >= 0; i--) {
    const item = items[i];
    if (item.itemType === 'SUBTOTAL') break; // previous subtotal = section boundary
    if (
      item.itemType === 'PRODUCT' ||
      item.itemType === 'CUSTOM' ||
      item.itemType === 'SERVICE'
    ) {
      sum += item.totalPrice;
    }
  }
  return sum;
}

export function generateQuoteHtml(data: QuoteDataForPdf): string {
  const { quote, company, project, items, totals, commercialTerms } = data;
  const safeTerms = commercialTerms || [];
  const currency = quote.currency;

  let itemNumber = 0;
  const itemRows = items.map((item, index) => {
    if (item.itemType === 'HEADER') {
      return `
        <tr class="header-row">
          <td colspan="8" class="header-cell">${escapeHtml(item.description)}</td>
        </tr>
      `;
    }
    if (item.itemType === 'NOTE') {
      return `
        <tr class="note-row">
          <td colspan="8" class="note-cell">${escapeHtml(item.description)}</td>
        </tr>
      `;
    }
    if (item.itemType === 'SUBTOTAL') {
      const sectionSum = computeSubtotalSum(items, index);
      return `
        <tr class="subtotal-row">
          <td colspan="7" class="subtotal-label">Ara Toplam</td>
          <td class="right subtotal-value">${formatCurrency(sectionSum, currency)}</td>
        </tr>
      `;
    }
    // PRODUCT, CUSTOM, SERVICE - standard priced rows
    itemNumber++;
    return `
      <tr class="product-row">
        <td class="center">${itemNumber}</td>
        <td>${item.code ? escapeHtml(item.code) : ''}</td>
        <td>${item.brand ? escapeHtml(item.brand) : ''}</td>
        <td>${escapeHtml(item.description)}</td>
        <td class="center">${item.quantity} ${unitAbbr(item.unit || 'Adet')}</td>
        <td class="center">${unitAbbr(item.unit || 'Adet')}</td>
        <td class="right">${formatCurrency(item.unitPrice, currency)}</td>
        <td class="right">${formatCurrency(item.totalPrice, currency)}</td>
      </tr>
    `;
  }).join('');

  const categoryLabels: Record<string, string> = {
    payment: 'Odeme Kosullari',
    delivery: 'Teslim Suresi',
    warranty: 'Garanti',
    vat: 'KDV',
    teslim_yeri: 'Teslim Yeri',
  };

  const termsHtml = safeTerms.map(term => `
    <div class="term">
      <strong>${categoryLabels[term.category] || term.category}:</strong> ${escapeHtml(term.content)}
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>Teklif - ${escapeHtml(quote.quoteNumber)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 10pt;
      color: #1a1a1a;
      line-height: 1.4;
    }

    .container {
      padding: 0;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #dc2626;
    }

    .logo {
      font-size: 24pt;
      font-weight: 700;
      color: #dc2626;
    }

    .quote-info {
      text-align: right;
    }

    .quote-number {
      font-size: 14pt;
      font-weight: 600;
      color: #dc2626;
      margin-bottom: 5px;
    }

    .quote-date {
      color: #666;
    }

    .parties {
      display: flex;
      gap: 40px;
      margin-bottom: 30px;
    }

    .party {
      flex: 1;
    }

    .party-label {
      font-size: 8pt;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 5px;
    }

    .party-name {
      font-size: 12pt;
      font-weight: 600;
      margin-bottom: 5px;
    }

    .subject {
      background: #f8f8f8;
      padding: 15px;
      margin-bottom: 20px;
      border-left: 3px solid #dc2626;
    }

    .subject-label {
      font-size: 8pt;
      text-transform: uppercase;
      color: #666;
      margin-bottom: 5px;
    }

    .subject-text {
      font-weight: 500;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }

    th {
      background: #1a1a1a;
      color: white;
      padding: 10px 8px;
      text-align: left;
      font-weight: 500;
      font-size: 9pt;
    }

    td {
      padding: 8px;
      border-bottom: 1px solid #eee;
    }

    .center { text-align: center; }
    .right { text-align: right; }

    .header-row td {
      background: #f3f4f6;
      font-weight: 600;
      padding: 10px 8px;
    }

    .header-cell {
      font-weight: 600;
    }

    .note-row td {
      font-style: italic;
      color: #666;
    }

    .note-cell {
      font-style: italic;
    }

    .subtotal-row td {
      background: #e5e7eb;
      font-weight: 700;
      border-top: 2px solid #9ca3af;
      border-bottom: 2px solid #9ca3af;
      padding: 10px 8px;
    }

    .subtotal-label {
      text-align: right;
      font-weight: 700;
      padding-right: 12px;
    }

    .subtotal-value {
      font-weight: 700;
    }

    .totals {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 30px;
    }

    .totals-table {
      width: 300px;
    }

    .totals-table td {
      padding: 8px 12px;
    }

    .totals-table .label {
      text-align: left;
    }

    .totals-table .value {
      text-align: right;
      font-weight: 500;
    }

    .totals-table .grand-total {
      background: #dc2626;
      color: white;
      font-weight: 700;
      font-size: 12pt;
    }

    .terms {
      margin-bottom: 30px;
    }

    .terms-title {
      font-weight: 600;
      margin-bottom: 10px;
      padding-bottom: 5px;
      border-bottom: 1px solid #eee;
    }

    .term {
      margin-bottom: 8px;
    }

    .notes {
      background: #fffbeb;
      padding: 15px;
      border-left: 3px solid #f59e0b;
    }

    .notes-title {
      font-weight: 600;
      margin-bottom: 5px;
    }

    .validity {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      color: #666;
      font-size: 9pt;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">BTS</div>
      <div class="quote-info">
        <div class="quote-number">${escapeHtml(quote.quoteNumber)}</div>
        <div class="quote-date">Tarih: ${formatDate(quote.createdAt)}</div>
        ${quote.validUntil ? `<div class="quote-date">Gecerlilik: ${formatDate(quote.validUntil)}</div>` : ''}
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <div class="party-label">Musteri</div>
        <div class="party-name">${escapeHtml(company.name)}</div>
        ${company.address ? `<div>${escapeHtml(company.address)}</div>` : ''}
        ${company.taxId ? `<div>VKN: ${escapeHtml(company.taxId)}</div>` : ''}
      </div>
      ${project ? `
        <div class="party">
          <div class="party-label">Proje</div>
          <div class="party-name">${escapeHtml(project.name)}</div>
          ${project.location ? `<div>${escapeHtml(project.location)}</div>` : ''}
        </div>
      ` : ''}
    </div>

    ${quote.subject ? `
      <div class="subject">
        <div class="subject-label">Konu</div>
        <div class="subject-text">${escapeHtml(quote.subject)}</div>
      </div>
    ` : ''}

    <table>
      <thead>
        <tr>
          <th class="center" style="width: 30px">#</th>
          <th style="width: 80px">Kod</th>
          <th style="width: 80px">Marka</th>
          <th>Aciklama</th>
          <th class="center" style="width: 50px">Miktar</th>
          <th class="center" style="width: 50px">Birim</th>
          <th class="right" style="width: 80px">B.Fiyat</th>
          <th class="right" style="width: 100px">Toplam</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <div class="totals">
      <table class="totals-table">
        <tr>
          <td class="label">Ara Toplam</td>
          <td class="value">${formatCurrency(totals.subtotal, currency)}</td>
        </tr>
        ${totals.totalDiscount > 0 ? `
          <tr>
            <td class="label">Iskonto</td>
            <td class="value">-${formatCurrency(totals.totalDiscount, currency)}</td>
          </tr>
        ` : ''}
        <tr>
          <td class="label">KDV</td>
          <td class="value">${formatCurrency(totals.totalVat, currency)}</td>
        </tr>
        <tr class="grand-total">
          <td class="label">Genel Toplam</td>
          <td class="value">${formatCurrency(totals.grandTotal, currency)}</td>
        </tr>
      </table>
    </div>

    ${safeTerms.length > 0 ? `
      <div class="terms">
        <div class="terms-title">Ticari Kosullar</div>
        ${termsHtml}
      </div>
    ` : ''}

    ${quote.notes ? `
      <div class="notes">
        <div class="notes-title">Notlar</div>
        <div>${escapeHtml(quote.notes)}</div>
      </div>
    ` : ''}

    ${quote.validUntil ? `
      <div class="validity">
        Bu teklif ${formatDate(quote.validUntil)} tarihine kadar gecerlidir.
      </div>
    ` : ''}
  </div>
</body>
</html>`;
}
