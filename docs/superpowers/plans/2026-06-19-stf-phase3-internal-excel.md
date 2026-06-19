# STF Phase 3 — Internal Excel Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add `GET /api/orders/[id]/export/excel` so an STF can be downloaded as a `.xlsx` matching the sample STF Excel's **visible** layout — the same content as the customer PDF: a header info box, a 5-column item table (Poz No · Ürün Adı · Miktar · Birim Fiyat · Toplam Fiyat) with section headers / `*` children / three-row section-subtotal blocks, the footer blocks, and the signature row.

**Architecture:** A new self-contained builder `src/lib/excel/stf-excel.ts` (exceljs) renders the STF **snapshot** (`OrderConfirmation` header/footer columns + `OrderItem` rows) to a workbook, mirroring the styling conventions of the existing quote Excel (`src/lib/excel/excel-service.ts`) — banner image, merged header box, black-box borders, Turkish currency. A new export route mirrors the PDF export route (auth, snapshot load, buffer download). A new "Excel İndir" button sits next to "PDF Indir" on the STF detail page. **No schema change, no cost data** — the sample's hidden MARKA/MODEL/ÜRÜN KODU and "SATIN ALMA TALEP BİLGİLERİ" purchasing columns are intentionally excluded (owner decision: only the 5 visible columns).

**Tech Stack:** Next.js 16 App Router, exceljs, sharp (banner framing), Vitest, TypeScript. Prisma snapshot already in place from Phases 1–2.

**Standing constraints:**
- 🚨 Subagents: do NOT run `git checkout`/`switch`/`stash`/`reset`/`restore`. Stay on `feature/client-notes-jun2026`. Only `git add`/`git commit`.
- ⚠️ TYPECHECK BASELINE: `rm -f tsconfig.tsbuildinfo && npx tsc --noEmit` reports **11 pre-existing errors, all in `.test.ts` files** (route.test/clone/revert/middleware). Bar: ZERO new errors and ZERO in non-test `src/`. Verify with `… | grep "error TS" | grep -v "\.test\.ts"` → empty.
- Reuse the snapshot↔currency conventions: Prisma `Decimal` → `Number(...)`, nullable `sectionDiscountPct` → `=== null ? null : Number(...)`.
- Section sums EXCLUDE SET children (`parentItemId` set) — a SET parent's `totalPrice` already carries the rolled-up children total (authoritative `quote-calculations.ts`; verified vs live data). This MUST match `order-template.ts`/`stf-totals.ts`.

**Baseline:** 655 tests pass on `feature/client-notes-jun2026`.

---

## File Structure

- **Create** `src/lib/excel/stf-excel.ts` — `StfExcelData` interface + `generateStfExcel(data): Promise<Buffer>`.
- **Create** `src/lib/excel/stf-excel.test.ts` — round-trips the buffer with exceljs and asserts header/items/subtotal/footer cells.
- **Create** `src/app/api/orders/[id]/export/excel/route.ts` — mirrors the PDF export route.
- **Modify** `src/app/(dashboard)/orders/[id]/page.tsx` — add an "Excel İndir" button + `handleExportExcel`.

---

## Task 1: STF Excel builder

**Files:** Create `src/lib/excel/stf-excel.ts` + `src/lib/excel/stf-excel.test.ts`.

**Reference (read first):** `src/lib/excel/excel-service.ts` — reuse its patterns for `addBanner` (sharp-framed banner anchored across the column range), black-box borders, `mergeCells`, fonts (Arial), and `formatTurkishCurrency`. `src/lib/pdf/order-template.ts` — the exact STF layout this mirrors (header labels, section/`*`/subtotal logic, footer blocks, signature). Sample target: `client_notes/stf örnekler/STF-4721-5833.1 - DURAN DOĞAN ….xlsx` (visible columns only).

**Worksheet layout (sheet name "STF"):**
- 5 columns: A=Poz No, B=Ürün Adı, C=Miktar, D=Birim Fiyat, E=Toplam Fiyat. Widths ≈ `[10, 70, 10, 16, 16]`.
- Row 1: banner image across A:E (reuse the `addBanner` sharp-framing approach; if no asset, leave row 1 blank — height ≈ 100).
- Header info box (rows 2–6), a 2-side block like the PDF: left label/value pairs `FİRMA ADI / İLGİLİ KİŞİ`, `FİRMA ADRESİ`, `FİRMA TELEFON`, `FİRMA V.D./ VERGİ NO`; right label/value pairs `TARİH`, `STF NO`, `TEKLİF NO / REF NO`, `PROJE ADI`, `SİPARİŞ NO`. Use merged cells + black-box borders. `TEKLİF NO / REF NO` value = `[quoteNo, refNo].filter(Boolean).join(' / ')`. TARİH = formatted `formDate`.
- Column header row: `Poz No | Ürün Adı | Miktar | Birim Fiyat | Toplam Fiyat` (bold, bordered, centered).
- Item rows (see loop below).
- Footer blocks: full-width rows, each = a bold label line then the value (mirrors the PDF's current full-width footer): `ÜRETİCİ FİRMALAR, GARANTİ, TESLİM YERİ, ÖDEME, KDV, TESLİMAT, NOTLAR` — skip any null/empty. Multi-line values keep line breaks (`alignment.wrapText = true`).
- Signature row: two cells `MÜŞTERİ ONAYI` (+ `customerApprovalName` beneath) | `BTS SORUMLUSU` (+ `btsResponsibleName`).

- [ ] **Step 1: Write the failing test** — create `src/lib/excel/stf-excel.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { generateStfExcel, type StfExcelData } from './stf-excel';

const data: StfExcelData = {
  order: {
    orderNumber: 'STF-6000', customerName: 'DURAN DOĞAN A.Ş', customerAddress: 'Hadımköy İSTANBUL',
    customerPhone: null, customerTaxInfo: 'BÜYÜK MÜKELLEFLER / 315', projectName: 'ANA FABRİKA',
    quoteNo: 'SA0001', refNo: '316A', formDate: new Date('2025-08-06T00:00:00Z'), siparisNo: null,
    currency: 'EUR', manufacturers: 'GLT ZETA\nBTS', warranty: 'Üretici garantisi.',
    deliveryPlace: 'İstanbul depo.', deliveryTime: '8-10 hafta.', paymentTerms: '30 gün.',
    vatNote: 'KDV dahil değildir.', notes: 'Bir bütün halinde geçerlidir.',
    customerApprovalName: 'İLKER ÇETİN', btsResponsibleName: 'ÖZNUR SAYIN',
  },
  items: [
    { itemType: 'HEADER', pozNo: null, description: 'TRAFO 1', brand: null, code: null, model: null, quantity: 0, unit: 'Adet', unitPrice: 0, totalPrice: 0, priceLabel: null, parentItemId: null, sectionDiscountPct: null, sectionDiscountLabel: null },
    { itemType: 'PRODUCT', pozNo: '1', description: 'Fyreye MKII Dedektör', brand: 'GLT', code: 'MKII-OP', model: 'MKII-OP', quantity: 1, unit: 'Adet', unitPrice: 31.4, totalPrice: 31.4, priceLabel: null, parentItemId: null, sectionDiscountPct: null, sectionDiscountLabel: null },
    { itemType: 'PRODUCT', pozNo: null, description: 'Soket', brand: 'GLT', code: 'MKII-CB', model: 'MKII-CB', quantity: 1, unit: 'Adet', unitPrice: 4.57, totalPrice: 4.57, priceLabel: null, parentItemId: 'p1', sectionDiscountPct: null, sectionDiscountLabel: null },
    { itemType: 'SUBTOTAL', pozNo: null, description: 'TRAFO-1 SİSTEM', brand: null, code: null, model: null, quantity: 0, unit: 'Adet', unitPrice: 0, totalPrice: 0, priceLabel: null, parentItemId: null, sectionDiscountPct: 30, sectionDiscountLabel: 'FİRMANIZA ÖZEL İNDİRİM' },
  ],
};

async function load(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  const texts: string[] = [];
  ws.eachRow((row) => row.eachCell((c) => {
    let v: any = c.value;
    if (v && typeof v === 'object' && 'richText' in v) v = v.richText.map((t: any) => t.text).join('');
    if (v != null && v !== '') texts.push(String(v));
  }));
  return texts.join(' | ');
}

describe('generateStfExcel', () => {
  it('renders header, sectioned items, subtotal and footer', async () => {
    const buf = await generateStfExcel(data);
    expect(buf.length).toBeGreaterThan(1000);
    const all = await load(buf);
    expect(all).toContain('DURAN DOĞAN A.Ş');
    expect(all).toContain('STF-6000');
    expect(all).toContain('316A');           // teklif/ref combined
    expect(all).toContain('TRAFO 1');         // section header
    expect(all).toContain('*');               // child poz marker
    expect(all).toContain('FİRMANIZA ÖZEL İNDİRİM');
    expect(all).toContain('ÜRETİCİ FİRMALAR');
    expect(all).toContain('TESLİMAT');
    expect(all).toContain('MÜŞTERİ ONAYI');
    expect(all).toContain('İLKER ÇETİN');
  });

  it('excludes SET children from the section subtotal (parent already rolled up)', async () => {
    const buf = await generateStfExcel(data);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    // gross = 31.40 (child 4.57 excluded) → 30% → net 21.98. Assert a 21.98 numeric cell exists.
    let found = false;
    ws.eachRow((row) => row.eachCell((c) => {
      const n = typeof c.value === 'number' ? c.value : Number(c.value);
      if (Math.abs(n - 21.98) < 0.001) found = true;
    }));
    expect(found).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — verify it fails** — `npx vitest run src/lib/excel/stf-excel.test.ts` (FAIL: module missing).

- [ ] **Step 3: Implement `src/lib/excel/stf-excel.ts`.** Self-contained (does not modify the quote ExcelService). Structure:

```ts
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
```

- [ ] **Step 4: Run the test — verify pass** — `npx vitest run src/lib/excel/stf-excel.test.ts` (both tests pass). If the 21.98 numeric assertion fails, confirm `vc.value = amount` writes a number (not a string) for the NET TOPLAM row.

- [ ] **Step 5: Verify no new non-test tsc errors** (`… | grep "error TS" | grep -v "\.test\.ts"` → empty) and commit:

```bash
git add src/lib/excel/stf-excel.ts src/lib/excel/stf-excel.test.ts
git commit -m "STF P3 (1): internal Excel builder (5-col snapshot layout)"
```

---

## Task 2: Excel export route

**Files:** Create `src/app/api/orders/[id]/export/excel/route.ts`.

**Reference:** `src/app/api/orders/[id]/export/pdf/route.ts` — copy its auth + snapshot-load + mapping verbatim, swap the generator + content type.

- [ ] **Step 1: Implement the route**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { generateStfExcel, StfExcelData } from '@/lib/excel/stf-excel';

interface RouteParams { params: Promise<{ id: string }>; }

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const order = await db.orderConfirmation.findUnique({
      where: { id },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!order) return NextResponse.json({ error: 'Siparis bulunamadi' }, { status: 404 });

    // Same export gate as the PDF: creator OR canExport.
    if (order.createdById !== user.id && !user.role.canExport) {
      return NextResponse.json({ error: 'Bu siparisi disa aktarma yetkiniz bulunmamaktadir' }, { status: 403 });
    }

    const excelData: StfExcelData = {
      order: {
        orderNumber: order.orderNumber, customerName: order.customerName, customerAddress: order.customerAddress,
        customerPhone: order.customerPhone, customerTaxInfo: order.customerTaxInfo, projectName: order.projectName,
        quoteNo: order.quoteNo, refNo: order.refNo, formDate: order.formDate, siparisNo: order.siparisNo,
        currency: order.currency, manufacturers: order.manufacturers, warranty: order.warranty,
        deliveryPlace: order.deliveryPlace, deliveryTime: order.deliveryTime, paymentTerms: order.paymentTerms,
        vatNote: order.vatNote, notes: order.notes, customerApprovalName: order.customerApprovalName,
        btsResponsibleName: order.btsResponsibleName,
      },
      items: order.items.map((it) => ({
        itemType: it.itemType, pozNo: it.pozNo, code: it.code, brand: it.brand, model: it.model,
        description: it.description, quantity: Number(it.quantity), unit: it.unit,
        unitPrice: Number(it.unitPrice), totalPrice: Number(it.totalPrice), priceLabel: it.priceLabel,
        parentItemId: it.parentItemId,
        sectionDiscountPct: it.sectionDiscountPct === null ? null : Number(it.sectionDiscountPct),
        sectionDiscountLabel: it.sectionDiscountLabel,
      })),
    };

    const buffer = await generateStfExcel(excelData);
    const filename = `${order.orderNumber}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Order Excel export error:', error);
    return NextResponse.json({ error: 'Excel olusturulurken bir hata olustu' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify** — non-test tsc grep empty; full suite `npx vitest run` green (655 + Task 1's 2 tests = 657).

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/orders/[id]/export/excel/route.ts"
git commit -m "STF P3 (2): Excel export route (creator OR canExport)"
```

---

## Task 3: "Excel İndir" button on the STF detail page

**Files:** Modify `src/app/(dashboard)/orders/[id]/page.tsx`.

- [ ] **Step 1: Add export-excel state + handler.** Near the existing `isExportingPdf` state add `const [isExportingExcel, setIsExportingExcel] = useState(false);`. Add a handler mirroring `handleExportPdf` but hitting `/api/orders/${id}/export/excel`, downloading as `${order.orderNumber}.xlsx`:

```tsx
  const handleExportExcel = async () => {
    if (isExportingExcel) return;
    setIsExportingExcel(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${id}/export/excel`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Excel olusturulamadi');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = order ? `${order.orderNumber}.xlsx` : 'siparis-teyit.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Excel olusturulurken bir hata olustu');
    } finally {
      setIsExportingExcel(false);
    }
  };
```

- [ ] **Step 2: Add the button** immediately after the "PDF Indir" `<Button>` (before "Teklifi Gor"):

```tsx
          <Button
            variant="secondary"
            onClick={handleExportExcel}
            disabled={isExportingExcel}
          >
            {isExportingExcel ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Excel Indir
          </Button>
```

(`Loader2`, `Download`, `Button` are already imported in this file.)

- [ ] **Step 3: Verify** — non-test tsc grep empty.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/orders/[id]/page.tsx"
git commit -m "STF P3 (3): Excel Indir button on the STF detail page"
```

---

## Final verification (controller, after all tasks)

- [ ] `rm -f tsconfig.tsbuildinfo && npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "\.test\.ts"` → empty.
- [ ] `npx vitest run` → green (657).
- [ ] Browser smoke-test on STF-6003/SA0001: "Excel Indir" downloads a `.xlsx` that opens cleanly with the banner, header box (firma/STF no/teklif-ref/proje/sipariş), the 5-column sectioned item table (`*` children, three-row FİRMANIZA ÖZEL İNDİRİM block), full-width footer blocks, and the signature row. Numbers are real numeric cells (right-aligned, 2dp).
- [ ] Dispatch a final integration review (spec §6 Excel fidelity + the "5 visible columns only" owner decision + totals consistency with PDF).
- [ ] Update spec §6/§8 (mark Phase 3 done; Phase 4 revisions remain) + the `project_client_notes_jun2026` memory.

## Self-Review (against the owner decision + sample)

- **5 visible columns only** (Poz No / Ürün Adı / Miktar / Birim Fiyat / Toplam Fiyat) — no MARKA/MODEL/ÜRÜN KODU, no purchasing/cost columns. ✓ (matches the owner's screenshot)
- **Header box** (firma adı/adres/telefon/V.D. | tarih/STF no/teklif-ref no/proje/sipariş no) ✓
- **Sections / `*` children / three-row subtotal block** mirror the PDF; section sum excludes SET children (consistent with `order-template.ts`/`stf-totals.ts`). ✓
- **Footer blocks** full-width (üretici/garanti/teslim/ödeme/kdv/teslimat/notlar) + signature row ✓
- **Auth**: creator OR canExport (same as PDF export). ✓
- **No schema change, no cost data.** ✓
- **Type consistency:** `StfExcelItem`/`StfExcelHeader` mirror the export route's `Number(...)` conversions and nullable `sectionDiscountPct`. ✓
