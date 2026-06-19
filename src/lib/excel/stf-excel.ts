import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import sharp from 'sharp';

export interface StfExcelItem {
  itemType: string; pozNo: string | null; code: string | null; brand: string | null; model: string | null;
  description: string; quantity: number; unit: string; unitPrice: number; totalPrice: number;
  priceLabel: string | null; parentItemId: string | null;
  sectionDiscountPct: number | null; sectionDiscountLabel: string | null;
}
export interface StfExcelHeader {
  orderNumber: string; customerName: string | null; customerAddress: string | null; customerPhone: string | null;
  customerTaxInfo: string | null; projectName: string | null; quoteNo: string | null; refNo: string | null;
  formDate: Date | null; siparisNo: string | null; currency: string;
  manufacturers: string | null; warranty: string | null; deliveryPlace: string | null; deliveryTime: string | null;
  paymentTerms: string | null; vatNote: string | null; notes: string | null;
  customerApprovalName: string | null; btsResponsibleName: string | null;
}
export interface StfExcelData { order: StfExcelHeader; items: StfExcelItem[]; }

const FONT = 'Arial';
const COLS = [10, 70, 10, 16, 16]; // Poz / Ürün Adı / Miktar / Birim Fiyat / Toplam
const CURRENCY_SYMBOLS: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', TRY: '₺' };
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function fmtCurrency(n: number, cur: string): string {
  return `${n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${CURRENCY_SYMBOLS[cur] || cur}`;
}
function fmtDate(d: Date): string {
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function unitAbbr(u: string): string {
  return u === 'Adet' ? 'Ad.' : u === 'Metre' ? 'mt.' : u;
}
const thin = (): Partial<ExcelJS.Borders> => ({
  top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
});
// Priced rows for the section sum: PRODUCT/CUSTOM/SET, not priceLabel'd, not a SET child.
const isPriced = (it: StfExcelItem) =>
  !it.priceLabel && !it.parentItemId && ['PRODUCT', 'CUSTOM', 'SET'].includes(it.itemType);
function sectionSum(items: StfExcelItem[], subtotalIdx: number): number {
  let s = 0;
  for (let i = subtotalIdx - 1; i >= 0; i--) {
    if (items[i].itemType === 'SUBTOTAL') break;
    if (isPriced(items[i])) s += Number(items[i].totalPrice) || 0;
  }
  return s;
}

async function addBanner(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet): Promise<void> {
  const totalColPx = COLS.reduce((sum, w) => sum + Math.round(w * 7 + 5), 0);
  const rowHeightPx = 133;
  ws.getRow(1).height = 100;
  const candidates = [
    path.join(process.cwd(), 'public', 'header', 'BTS_teklif_form.png'),
    path.join(process.cwd(), 'pdf', 'header', 'BTS_teklif_form.png'),
    path.join(process.cwd(), 'public', 'btslogo.png'),
  ];
  for (const imgPath of candidates) {
    if (!fs.existsSync(imgPath)) continue;
    try {
      const src = fs.readFileSync(imgPath);
      const meta = await sharp(src).metadata();
      const sourceWidth = meta.width ?? 2481;
      const nativeTargetHeight = Math.round(sourceWidth / (totalColPx / rowHeightPx));
      const borderPx = Math.max(1, Math.round(sourceWidth / totalColPx));
      const framed = await sharp(src)
        .resize(sourceWidth, nativeTargetHeight, { fit: 'fill' })
        .extend({ top: borderPx, bottom: borderPx, left: borderPx, right: borderPx, background: { r: 0, g: 0, b: 0, alpha: 1 } })
        .png().toBuffer();
      const id = wb.addImage({ buffer: framed as unknown as ExcelJS.Buffer, extension: 'png' });
      ws.addImage(id, { tl: { col: 0, row: 0 }, br: { col: COLS.length, row: 1 } } as unknown as ExcelJS.ImageRange);
      return;
    } catch { /* skip on failure */ }
  }
}

export async function generateStfExcel(data: StfExcelData): Promise<Buffer> {
  const { order, items } = data;
  const cur = order.currency;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('STF', { views: [{ showGridLines: false }] });
  COLS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  await addBanner(wb, ws);

  const label = (cell: ExcelJS.Cell, text: string) => {
    cell.value = text; cell.font = { name: FONT, bold: true, size: 8 };
    cell.alignment = { vertical: 'middle', wrapText: true }; cell.border = thin();
  };
  const val = (cell: ExcelJS.Cell, text: string) => {
    cell.value = text; cell.font = { name: FONT, size: 8 };
    cell.alignment = { vertical: 'middle', wrapText: true, indent: 1 }; cell.border = thin();
  };

  // --- Header info box: rows 2..6, A:B left pair, C label, D:E value ---
  const teklifRef = [order.quoteNo, order.refNo].filter(Boolean).join(' / ');
  const left: [string, string][] = [
    ['FİRMA ADI / İLGİLİ KİŞİ', order.customerName || ''],
    ['FİRMA ADRESİ', order.customerAddress || ''],
    ['FİRMA TELEFON', order.customerPhone || ''],
    ['FİRMA V.D./ VERGİ NO', order.customerTaxInfo || ''],
  ];
  const right: [string, string][] = [
    ['TARİH', order.formDate ? fmtDate(order.formDate) : ''],
    ['STF NO', order.orderNumber],
    ['TEKLİF NO / REF NO', teklifRef],
    ['PROJE ADI', order.projectName || ''],
    ['SİPARİŞ NO', order.siparisNo || ''],
  ];
  let r = 2;
  for (let i = 0; i < 5; i++) {
    const row = ws.getRow(r); row.height = 16;
    if (i < 4) { label(ws.getCell(r, 1), left[i][0]); val(ws.getCell(r, 2), left[i][1]); }
    else { ws.getCell(r, 1).border = thin(); ws.getCell(r, 2).border = thin(); }
    label(ws.getCell(r, 3), right[i][0]); val(ws.getCell(r, 4), right[i][1]);
    ws.getCell(r, 5).border = thin();
    ws.mergeCells(r, 4, r, 5);
    r++;
  }
  r++; // blank spacer

  // --- Column header row ---
  const headers = ['Poz No', 'Ürün Adı', 'Miktar', 'Birim Fiyat', 'Toplam Fiyat'];
  const hr = ws.getRow(r);
  headers.forEach((h, i) => {
    const c = ws.getCell(r, i + 1);
    c.value = h; c.font = { name: FONT, bold: true, size: 8 };
    c.alignment = { horizontal: 'center', vertical: 'middle' }; c.border = thin();
  });
  hr.height = 16; r++;

  // --- Item rows ---
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    const row = ws.getRow(r);
    if (it.itemType === 'HEADER') {
      ws.mergeCells(r, 1, r, 5);
      const c = ws.getCell(r, 1);
      c.value = it.description; c.font = { name: FONT, bold: true, size: 8 };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6E0B4' } };
      for (let col = 1; col <= 5; col++) ws.getCell(r, col).border = thin();
      r++; continue;
    }
    if (it.itemType === 'NOTE') {
      ws.getCell(r, 1).value = it.pozNo || 'NOT:';
      ws.mergeCells(r, 2, r, 5);
      ws.getCell(r, 2).value = it.description;
      for (let col = 1; col <= 5; col++) { const c = ws.getCell(r, col); c.font = { name: FONT, size: 8 }; c.border = thin(); c.alignment = { vertical: 'top', wrapText: true }; }
      r++; continue;
    }
    if (it.itemType === 'SUBTOTAL') {
      const gross = sectionSum(items, idx);
      const pct = Number(it.sectionDiscountPct ?? 0);
      const disc = pct > 0 ? round2(gross * (pct / 100)) : 0;
      const net = round2(gross - disc);
      const base = it.description?.trim() ? `${it.description.trim()} ` : '';
      const rows: [string, number][] = pct > 0
        ? [[`${base}GENEL TOPLAM (${cur})`, gross], [`${it.sectionDiscountLabel?.trim() || 'FİRMANIZA ÖZEL İNDİRİM'} (${cur})`, disc], [`${base}NET TOPLAM (${cur})`, net]]
        : [[`${base}GENEL TOPLAM (${cur})`, gross]];
      for (const [lbl, amount] of rows) {
        ws.mergeCells(r, 1, r, 4);
        const lc = ws.getCell(r, 1);
        lc.value = lbl; lc.font = { name: FONT, bold: true, size: 8 };
        lc.alignment = { horizontal: 'right', vertical: 'middle' };
        const vc = ws.getCell(r, 5);
        vc.value = amount; vc.numFmt = '#,##0.00';
        vc.font = { name: FONT, bold: true, size: 8 }; vc.alignment = { horizontal: 'right' };
        for (let col = 1; col <= 5; col++) ws.getCell(r, col).border = thin();
        r++;
      }
      continue;
    }
    // PRODUCT / CUSTOM / SET (+ children show "*")
    const poz = it.parentItemId ? '*' : (it.pozNo || '');
    const cells: (string | number)[] = [
      poz,
      it.code ? `${it.code} ${it.description}` : it.description,
      `${it.quantity} ${unitAbbr(it.unit)}`,
      it.priceLabel ? it.priceLabel : it.unitPrice,
      it.priceLabel ? '' : it.totalPrice,
    ];
    cells.forEach((v, i) => {
      const c = ws.getCell(r, i + 1);
      c.value = v as ExcelJS.CellValue;
      c.font = { name: FONT, size: 8 };
      c.border = thin();
      if (i === 0) c.alignment = { horizontal: 'center', vertical: 'top' };
      else if (i === 1) c.alignment = { vertical: 'top', wrapText: true };
      else c.alignment = { horizontal: 'right', vertical: 'top' };
      if ((i === 3 || i === 4) && typeof v === 'number') c.numFmt = '#,##0.00';
    });
    r++;
  }
  r++; // spacer

  // --- Footer blocks (full-width: label line + value) ---
  const blocks: [string, string | null][] = [
    ['ÜRETİCİ FİRMALAR', order.manufacturers], ['GARANTİ', order.warranty],
    ['TESLİM YERİ', order.deliveryPlace], ['ÖDEME', order.paymentTerms],
    ['KDV', order.vatNote], ['TESLİMAT', order.deliveryTime], ['NOTLAR', order.notes],
  ];
  for (const [lbl, value] of blocks) {
    if (!value || !value.trim()) continue;
    ws.mergeCells(r, 1, r, 5);
    const c = ws.getCell(r, 1);
    c.value = { richText: [
      { text: `${lbl}\n`, font: { name: FONT, bold: true, size: 8 } },
      { text: value, font: { name: FONT, size: 8 } },
    ] };
    c.alignment = { vertical: 'top', wrapText: true };
    for (let col = 1; col <= 5; col++) ws.getCell(r, col).border = thin();
    ws.getRow(r).height = Math.max(24, 12 * (value.split('\n').length + 1));
    r++;
  }

  // --- Signature row ---
  ws.mergeCells(r, 1, r, 2); ws.mergeCells(r, 3, r, 5);
  const sigL = ws.getCell(r, 1), sigR = ws.getCell(r, 3);
  sigL.value = { richText: [{ text: 'MÜŞTERİ ONAYI\n\n', font: { name: FONT, bold: true, size: 8 } }, { text: order.customerApprovalName || '', font: { name: FONT, size: 8 } }] };
  sigR.value = { richText: [{ text: 'BTS SORUMLUSU\n\n', font: { name: FONT, bold: true, size: 8 } }, { text: order.btsResponsibleName || '', font: { name: FONT, size: 8 } }] };
  [sigL, sigR].forEach((c) => { c.alignment = { horizontal: 'center', vertical: 'top', wrapText: true }; });
  for (let col = 1; col <= 5; col++) ws.getCell(r, col).border = thin();
  ws.getRow(r).height = 40;

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
