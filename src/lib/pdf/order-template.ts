// ---------------------------------------------------------------------------
// Sipariş Teyit Formu (STF) — Customer PDF Template
// Renders the editable STF SNAPSHOT (OrderConfirmation header/footer +
// OrderItem rows), NOT the live quote. Layout mirrors the sample proforma
// (client_notes/stf örnekler/STF-4721-5833.1 …). Sectioned subtotal +
// `*`-child rendering mirrors quote-template.ts.
// ---------------------------------------------------------------------------

export interface OrderHeaderForPdf {
  orderNumber: string;
  customerName: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  customerTaxInfo: string | null;
  projectName: string | null;
  quoteNo: string | null;
  refNo: string | null;
  formDate: Date | null;
  siparisNo: string | null;
  currency: string;
  manufacturers: string | null;
  warranty: string | null;
  deliveryPlace: string | null;
  paymentTerms: string | null;
  vatNote: string | null;
  notes: string | null;
  customerApprovalName: string | null;
  btsResponsibleName: string | null;
}

export interface OrderItemForPdf {
  itemType: string;
  pozNo: string | null;
  code: string | null;
  brand: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  priceLabel: string | null;
  parentItemId: string | null;
  sectionDiscountPct: number | null;
  sectionDiscountLabel: string | null;
}

export interface OrderDataForPdf {
  order: OrderHeaderForPdf;
  items: OrderItemForPdf[];
  headerBase64?: string;
  logoBase64?: string;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€', USD: '$', GBP: '£', TRY: '₺',
};
const CURRENCY_NAMES: Record<string, string> = {
  EUR: 'EURO', USD: 'USD', GBP: 'GBP', TRY: 'TL',
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function formatCurrency(amount: number, currency: string): string {
  const formatted = amount.toLocaleString('tr-TR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return `${formatted} ${CURRENCY_SYMBOLS[currency] || currency}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

function escapeHtmlMultiline(text: string): string {
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

// Section-sum rule: EXCLUDE SET children (parentItemId set). This is the
// authoritative app-wide convention — see quote-calculations.ts
// (recalculateAndPersistQuoteTotals filters `!parentItemId` "to avoid
// double-counting"): a SET parent's totalPrice ALREADY carries the combined
// total of its children. Verified against live data (a SET parent's
// totalPrice equals the exact sum of its children's totals). Children still
// RENDER below the parent as informational "*" lines, but counting both the
// parent and the children would double the section total and diverge from the
// order's stored grandTotal (stf-totals.ts) and the source quote. We also skip
// SUBTOTAL boundaries and priceLabel'd rows (e.g. "TARAFINIZCA SAĞLANACAKTIR",
// which contribute 0).
const isPriced = (it: OrderItemForPdf) =>
  !it.priceLabel &&
  !it.parentItemId &&
  (it.itemType === 'PRODUCT' || it.itemType === 'CUSTOM' || it.itemType === 'SET');

/** Sum of priced rows since the previous SUBTOTAL (mirrors quote-template). */
function computeSubtotalSum(items: OrderItemForPdf[], subtotalIndex: number): number {
  let sum = 0;
  for (let i = subtotalIndex - 1; i >= 0; i--) {
    const it = items[i];
    if (it.itemType === 'SUBTOTAL') break;
    if (isPriced(it)) sum += Number(it.totalPrice) || 0;
  }
  return sum;
}

export function generateOrderHtml(data: OrderDataForPdf): string {
  const { order, items, headerBase64, logoBase64 } = data;
  const currency = order.currency;
  const currencyName = CURRENCY_NAMES[currency] || currency;

  // ---------- Header image ----------
  const headerImgSrc = headerBase64 || logoBase64;
  const headerImgHtml = headerImgSrc
    ? `<img src="${headerImgSrc}" style="width:100%;height:auto;display:block;" alt="BTS">`
    : '<p style="font-size:14pt;font-weight:bold;color:#cc0000;padding:10pt;">BTS YANGIN</p>';

  // ---------- Item rows ----------
  const itemRows = items.map((item, index) => {
    if (item.itemType === 'HEADER') {
      return `<tr class="section-hdr" style="page-break-after:avoid; break-after:avoid;">
        <td><p><br></p></td>
        <td colspan="4"><p class="s1" style="text-align:center;">${escapeHtml(item.description)}</p></td>
      </tr>`;
    }

    if (item.itemType === 'NOTE') {
      const pozLabel = item.pozNo || 'NOT:';
      return `<tr>
        <td><p class="s1" style="text-align:center;">${escapeHtml(pozLabel)}</p></td>
        <td colspan="4"><p class="s2" style="padding-left:1pt;">${escapeHtmlMultiline(item.description)}</p></td>
      </tr>`;
    }

    if (item.itemType === 'SUBTOTAL') {
      const gross = computeSubtotalSum(items, index);
      const pct = Number(item.sectionDiscountPct ?? 0);
      const discAmt = pct > 0 ? round2(gross * (pct / 100)) : 0;
      const net = round2(gross - discAmt);
      const sysLabel = item.description?.trim()
        ? `${escapeHtml(item.description.trim())} GENEL TOPLAM`
        : 'GENEL TOPLAM';
      const discLabel = escapeHtml(item.sectionDiscountLabel?.trim() || 'FİRMANIZA ÖZEL İNDİRİM');
      const netLabel = item.description?.trim()
        ? `${escapeHtml(item.description.trim())} NET TOPLAM`
        : 'NET TOPLAM';

      if (pct > 0) {
        return `<tr style="height:12pt">
          <td class="sys-total-label" colspan="4"><p class="s1" style="text-align:right;">${sysLabel} (${currencyName})</p></td>
          <td class="sys-total-val"><p class="s1" style="text-align:right;">${formatCurrency(gross, currency)}</p></td>
        </tr>
        <tr style="height:12pt">
          <td class="sys-total-label" colspan="4"><p class="s1" style="text-align:right;">${discLabel} (${currencyName})</p></td>
          <td class="sys-total-val"><p class="s1" style="text-align:right;">${formatCurrency(discAmt, currency)}</p></td>
        </tr>
        <tr style="height:12pt">
          <td class="sys-total-label" colspan="4"><p class="s1" style="text-align:right;">${netLabel} (${currencyName})</p></td>
          <td class="sys-total-val"><p class="s1" style="text-align:right;">${formatCurrency(net, currency)}</p></td>
        </tr>`;
      }
      return `<tr style="height:12pt">
        <td class="sys-total-label" colspan="4"><p class="s1" style="text-align:right;">${sysLabel} (${currencyName})</p></td>
        <td class="sys-total-val"><p class="s1" style="text-align:right;">${formatCurrency(gross, currency)}</p></td>
      </tr>`;
    }

    // PRODUCT / CUSTOM / SET — and SET children (parentItemId set) get "*"
    const pozCell = item.parentItemId ? '*' : (item.pozNo || '');
    const priceCol = item.priceLabel
      ? `<td colspan="2"><p class="s2" style="text-align:center;">${escapeHtml(item.priceLabel)}</p></td>`
      : `<td><p class="s2" style="text-align:right;padding-right:14pt;">${formatCurrency(item.unitPrice, currency)}</p></td>
         <td><p class="s2" style="text-align:right;">${formatCurrency(item.totalPrice, currency)}</p></td>`;
    const qtyStr = `${item.quantity} ${unitAbbr(item.unit)}`;
    const codePrefix = item.code ? `<b>${escapeHtml(item.code)}</b> ` : '';

    return `<tr>
      <td><p class="s1" style="text-align:center;">${escapeHtml(pozCell)}</p></td>
      <td><p class="s2" style="padding-left:1pt;line-height:108%;">${codePrefix}${escapeHtmlMultiline(item.description)}</p></td>
      <td><p class="s2" style="text-align:right;padding-right:10pt;">${qtyStr}</p></td>
      ${priceCol}
    </tr>`;
  }).join('\n');

  // ---------- Header info box ----------
  const fmtDate = order.formDate ? formatDate(order.formDate) : '';
  const teklifRef = [order.quoteNo, order.refNo].filter(Boolean).join(' / ');

  // ---------- Footer label table ----------
  const footerRow = (label: string, value: string | null) =>
    value && value.trim()
      ? `<tr>
          <td class="ft-label"><p class="s3">${label}</p></td>
          <td class="ft-val"><p class="s4" style="line-height:118%;">${escapeHtmlMultiline(value)}</p></td>
        </tr>`
      : '';

  const footerTable = [
    footerRow('ÜRETİCİ FİRMALAR', order.manufacturers),
    footerRow('GARANTİ', order.warranty),
    footerRow('TESLİM YERİ', order.deliveryPlace),
    footerRow('ÖDEME', order.paymentTerms),
    footerRow('KDV', order.vatNote),
    footerRow('NOTLAR', order.notes),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>SİPARİŞ TEYİT FORMU - ${escapeHtml(order.orderNumber)}</title>
<style>
@page { size: A4 portrait; margin: 5mm 10mm 15mm 10mm; }
* { margin:0; padding:0; text-indent:0; }
body { font-family: Arial, sans-serif; color: black; padding: 5mm 10mm 15mm 10mm; }

.s1 { font-weight:bold; font-size:6.5pt; color:black; }
.s2 { font-weight:normal; font-size:6.5pt; color:black; }
.s3 { font-weight:bold; font-size:7pt; color:black; }
.s4 { font-weight:normal; font-size:7pt; color:black; }
p { font-size:6.5pt; color:black; margin:0; }

table.main { width:100%; border-collapse:collapse; }
thead { display: table-header-group; }
col.c1 { width: 8.7%; } col.c2 { width: 57.2%; } col.c3 { width: 9.5%; }
col.c4 { width: 11.5%; } col.c5 { width: 13.1%; }

.hdr-img-cell { border: 1.2pt solid black; padding: 0; }
.hdr-img-cell img { width:100%; height:auto; display:block; }

.info-label { border: 1.2pt solid black; padding: 3pt 4pt; vertical-align: middle; }
.info-val   { border: 1.2pt solid black; padding: 3pt 4pt; vertical-align: middle; }

.col-hdr { border: 1.2pt solid black; padding: 3pt 2pt; background: white; }

table.main tbody td {
  border-left: 0.25pt solid black; border-right: 0.25pt solid black;
  border-bottom: 0.25pt solid black; padding: 3pt 4pt; vertical-align: top;
}
table.main tbody td:nth-child(4), table.main tbody td:nth-child(5) { white-space: nowrap; }

.section-hdr td {
  background-color: #C6E0B4;
  border-left: 0.25pt solid black !important; border-right: 0.25pt solid black !important;
  border-bottom: 0.25pt solid black !important;
}
.sys-total-label { border: 1.2pt solid black !important; padding: 3pt 6pt 3pt 2pt; }
.sys-total-val   { border: 1.2pt solid black !important; padding: 3pt 2pt; }

/* Footer label table */
table.footer { width:100%; border-collapse:collapse; margin-top:6pt; }
table.footer td { border: 0.75pt solid black; padding: 3pt 5pt; vertical-align: top; }
.ft-label { width: 18%; }
.sig td { border: 0.75pt solid black; padding: 8pt 5pt 14pt 5pt; text-align:center; }
</style>
</head>
<body>

<table class="main">
  <colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"><col class="c5"></colgroup>
  <thead>
    <tr><td colspan="5" class="hdr-img-cell">${headerImgHtml}</td></tr>

    <!-- Header info box: left labels/values + right labels/values -->
    <tr>
      <td class="info-label"><p class="s1">FİRMA ADI / İLGİLİ KİŞİ</p></td>
      <td class="info-val"><p class="s2">${escapeHtml(order.customerName || '')}</p></td>
      <td class="info-label"><p class="s1">TARİH</p></td>
      <td class="info-val" colspan="2"><p class="s2">${fmtDate}</p></td>
    </tr>
    <tr>
      <td class="info-label"><p class="s1">FİRMA ADRESİ</p></td>
      <td class="info-val"><p class="s2">${escapeHtmlMultiline(order.customerAddress || '')}</p></td>
      <td class="info-label"><p class="s1">STF NO</p></td>
      <td class="info-val" colspan="2"><p class="s2">${escapeHtml(order.orderNumber)}</p></td>
    </tr>
    <tr>
      <td class="info-label"><p class="s1">FİRMA TELEFON</p></td>
      <td class="info-val"><p class="s2">${escapeHtml(order.customerPhone || '')}</p></td>
      <td class="info-label"><p class="s1">TEKLİF NO / REF NO</p></td>
      <td class="info-val" colspan="2"><p class="s2">${escapeHtml(teklifRef)}</p></td>
    </tr>
    <tr>
      <td class="info-label"><p class="s1">FİRMA V.D./ VERGİ NO</p></td>
      <td class="info-val"><p class="s2">${escapeHtml(order.customerTaxInfo || '')}</p></td>
      <td class="info-label"><p class="s1">PROJE ADI</p></td>
      <td class="info-val" colspan="2"><p class="s2">${escapeHtml(order.projectName || '')}</p></td>
    </tr>
    <tr>
      <td class="info-label" colspan="2"><p class="s1" style="text-align:center;">SİPARİŞ TEYİT FORMU</p></td>
      <td class="info-label"><p class="s1">SİPARİŞ NO</p></td>
      <td class="info-val" colspan="2"><p class="s2">${escapeHtml(order.siparisNo || '')}</p></td>
    </tr>

    <tr style="height:14pt">
      <td class="col-hdr"><p class="s1" style="text-align:center;">Poz No</p></td>
      <td class="col-hdr"><p class="s1" style="text-align:center;">Ürün Adı</p></td>
      <td class="col-hdr"><p class="s1" style="text-align:center;">Miktar</p></td>
      <td class="col-hdr"><p class="s1" style="text-align:center;">Birim Fiyat</p></td>
      <td class="col-hdr"><p class="s1" style="text-align:center;">Toplam Fiyat</p></td>
    </tr>
  </thead>
  <tbody>
    ${itemRows}
  </tbody>
</table>

<table class="footer">
  ${footerTable}
  <tr class="sig">
    <td style="width:50%;"><p class="s1">MÜŞTERİ ONAYI</p><br><p class="s2">${escapeHtml(order.customerApprovalName || '')}</p></td>
    <td><p class="s1">BTS SORUMLUSU</p><br><p class="s2">${escapeHtml(order.btsResponsibleName || '')}</p></td>
  </tr>
</table>

</body>
</html>`;
}
