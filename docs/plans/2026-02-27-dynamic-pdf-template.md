# Dynamic PDF Template Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the static test HTML template into a dynamic quote-template.ts that renders from quote editor data, with montaj sub-item rendering, service description templates, and new fields.

**Architecture:** Reuse existing CommercialTermTemplate + QuoteCommercialTerm pattern for new categories (DAHIL_OLMAYAN, MUH_ACIKLAMA). Add `description` field to Quote, `highlight` boolean to commercial term models. Rewrite generateQuoteHtml() using the proven test-template.html structure with two service rendering modes.

**Tech Stack:** Prisma (schema + migrations), Next.js API routes, React (editor components), Puppeteer (PDF generation), Jest (testing)

---

### Task 1: Database Migration — Add new fields

**Files:**
- Modify: `prisma/schema.prisma:193-238` (Quote model)
- Modify: `prisma/schema.prisma:323-330` (QuoteCommercialTerm model)
- Modify: `prisma/schema.prisma:310-321` (CommercialTermTemplate model)
- Create: `prisma/migrations/<timestamp>_add_description_and_highlight/migration.sql`

**Step 1: Add fields to Prisma schema**

In `prisma/schema.prisma`, Quote model (after line 201 `subject`):
```prisma
  description  String?
```

In QuoteCommercialTerm model (after line 329 `sortOrder`):
```prisma
  highlight    Boolean  @default(false)
```

In CommercialTermTemplate model (after line 316 `sortOrder`):
```prisma
  highlight    Boolean  @default(false)
```

**Step 2: Generate and run migration**

Run: `npx prisma migrate dev --name add_description_and_highlight`
Expected: Migration created and applied successfully

**Step 3: Verify schema**

Run: `npx prisma generate`
Expected: Prisma Client generated successfully

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add description field to Quote, highlight to commercial terms"
```

---

### Task 2: Seed default MUH_ACIKLAMA and DAHIL_OLMAYAN templates

**Files:**
- Create: `scripts/seed-service-templates.ts`

**Step 1: Create seed script**

```typescript
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  // MUH_ACIKLAMA — müh.devreye alma description template
  const muhTemplates = [
    {
      category: 'MUH_ACIKLAMA',
      name: 'Müh. Devreye Alma Açıklama',
      value: 'Mühendislik, Test ve Devreye Alma Çalışmaları',
      isDefault: true,
      sortOrder: 0,
    },
    {
      category: 'MUH_ACIKLAMA',
      name: 'Müh. Devreye Alma Detay',
      value: 'Tarafınızca kablolaması tamamlanan sistemin, sahada program testlerinin yapılıp sistemin devreye alınması, İşletme elemanlarına 1 kereye mahsus 1 gün eğitim verilmesi dahildir.',
      isDefault: true,
      sortOrder: 1,
    },
    {
      category: 'MUH_ACIKLAMA',
      name: 'Müh. Hizmet Kalemleri',
      value: [
        'Sistem Nokta Konfigürasyonu ve Kontrol Senaryolarının Kesinleştirilmesi',
        'Saha Kontrol Panelleri İç Kablo Bağlantılarının Yapılması',
        'Yangın senaryosu dikkate alınarak yangın alarm kontrol panelleri programlamasının hazırlanması',
        'Sahada Yangın Alarm Sistemi Program Testlerinin Yapılıp Sistemin Devreye Alınması için gerekli olacak hizmet bedelleri',
      ].join('\n'),
      isDefault: true,
      sortOrder: 2,
    },
  ];

  // DAHIL_OLMAYAN — excluded services template
  const dahilOlmayanTemplates = [
    {
      category: 'DAHIL_OLMAYAN',
      name: 'Dahil Olmayan Hizmetler',
      value: 'Cihaz Montajları, Kablolama, Borulama, Fiber Ek İşçiliği, İşçilik, Kazı, kanal vb. inşai işler, 3 parti kişi veya firmaların sahada yapacakları denetlemeler, kontroler, tester ve araştırmalar, sahada yapılacak çalışma izinleri, sözleşme giderleri, İSG giderleri, yükselitci ekipmanlar, damga vergisi teklif kapsamımız haricindedir.',
      isDefault: true,
      sortOrder: 0,
    },
  ];

  for (const t of [...muhTemplates, ...dahilOlmayanTemplates]) {
    await db.commercialTermTemplate.upsert({
      where: { id: `seed-${t.category}-${t.sortOrder}` },
      create: { id: `seed-${t.category}-${t.sortOrder}`, ...t },
      update: t,
    });
  }

  console.log('Service templates seeded');
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
```

**Step 2: Run seed script**

Run: `npx tsx scripts/seed-service-templates.ts`
Expected: "Service templates seeded"

**Step 3: Commit**

```bash
git add scripts/seed-service-templates.ts
git commit -m "feat: seed MUH_ACIKLAMA and DAHIL_OLMAYAN default templates"
```

---

### Task 3: Update Quote API routes — accept description field

**Files:**
- Modify: `src/app/api/quotes/route.ts:184-201` (POST — create)
- Modify: `src/app/api/quotes/[id]/route.ts:132-150` (PUT — update)

**Step 1: Update POST route to accept description**

In `src/app/api/quotes/route.ts`, in the `db.quote.create` data block (around line 189, after `subject`):
```typescript
      subject: body.subject || null,
      description: body.description || null,
```

**Step 2: Update PUT route to accept description**

In `src/app/api/quotes/[id]/route.ts`, in the updateData block (around line 142, after `subject`):
```typescript
    if (body.subject !== undefined) updateData.subject = body.subject;
    if (body.description !== undefined) updateData.description = body.description;
```

**Step 3: Update GET route to return description**

Verify the GET route at `src/app/api/quotes/[id]/route.ts` already returns all Quote fields (Prisma `findUnique` returns all scalar fields by default). No change needed.

**Step 4: Commit**

```bash
git add src/app/api/quotes/route.ts src/app/api/quotes/[id]/route.ts
git commit -m "feat: accept description field in quote create/update API"
```

---

### Task 4: Update Quote Editor — add description to HeaderFields

**Files:**
- Modify: `src/app/(dashboard)/quotes/[id]/edit/QuoteEditor.tsx:56-67` (HeaderFields interface)
- Modify: `src/app/(dashboard)/quotes/[id]/edit/QuoteEditor.tsx:179-190` (state init)
- Modify: `src/app/(dashboard)/quotes/[id]/edit/QuoteEditor.tsx:359-376` (save function)
- Modify: `src/components/quotes/QuoteEditorHeader.tsx:43-72` (props interface)

**Step 1: Add description to HeaderFields interface**

In `QuoteEditor.tsx`, HeaderFields interface (line ~60, after `subject`):
```typescript
  description: string;
```

**Step 2: Initialize description in state**

In the headerFields initialization (line ~181), add:
```typescript
  description: quote.description || '',
```

**Step 3: Include description in save payload**

In handleSave function (line ~365), add after `subject`:
```typescript
        description: headerFields.description,
```

**Step 4: Add description to QuoteEditorHeader props and UI**

In `QuoteEditorHeader.tsx`, add `description` prop, `onDescriptionChange` handler, and a text input below the subject field.

**Step 5: Commit**

```bash
git add src/app/(dashboard)/quotes/[id]/edit/QuoteEditor.tsx src/components/quotes/QuoteEditorHeader.tsx
git commit -m "feat: add description field to quote editor header"
```

---

### Task 5: Update commercial terms — highlight toggle for NOTLAR

**Files:**
- Modify: Commercial terms editor component (where NOTLAR are edited per-quote)
- Modify: `src/app/api/settings/commercial-terms/route.ts` (accept highlight in templates)

**Step 1: Update settings API to accept highlight**

In `src/app/api/settings/commercial-terms/route.ts`, in the create/update handler, include `highlight` boolean field from request body.

**Step 2: Update per-quote commercial terms to accept highlight**

Ensure the quote commercial terms API (`/api/quotes/[id]/terms` or inline in the editor) passes `highlight` when saving NOTLAR entries.

**Step 3: Add highlight toggle in NOTLAR editor UI**

Add a small highlight icon/checkbox next to each NOTLAR entry in the quote editor. When toggled, sets `highlight: true` on that entry.

**Step 4: Commit**

```bash
git add src/app/api/settings/commercial-terms/ src/components/quotes/
git commit -m "feat: add highlight toggle for NOTLAR entries"
```

---

### Task 6: Write failing tests for generateQuoteHtml

**Files:**
- Modify: `src/lib/pdf/quote-template.test.ts`

**Step 1: Write test for Mode B (no montaj) — basic structure**

```typescript
describe('generateQuoteHtml - dynamic template', () => {
  const basePdfData: QuoteDataForPdf = {
    quote: {
      quoteNumber: 'SA0056-YAS',
      refNo: '219AC',
      subject: 'KANCA İDARİ BİNA & ÜRETİM ALANI',
      createdAt: new Date('2026-01-29'),
      currency: 'USD',
      language: 'TR',
    },
    company: { name: 'KANCA EL ALETLERİ DÖV.ÇEL. ve MAK.SAN.A.Ş.', address: 'Tosb Org. San' },
    items: [
      { itemType: 'HEADER', description: 'İDARİ BİNA', quantity: 0, unitPrice: 0, discountPct: 0, totalPrice: 0, vatRate: 0 },
      { itemType: 'PRODUCT', description: 'Test Product', quantity: 1, unit: 'Adet', unitPrice: 100, discountPct: 0, totalPrice: 100, vatRate: 20 },
    ],
    totals: { subtotal: 100, totalDiscount: 0, totalVat: 20, grandTotal: 120 },
    commercialTerms: [{ category: 'GARANTI', content: '2 yıl garanti' }],
    notes: [{ text: 'Test note', sortOrder: 1, highlight: false }],
    montajItems: [],
    muhDescription: [],
    dahilOlmayan: '',
  };

  it('renders description field in header', () => {
    const data = { ...basePdfData, description: 'TYCO ZETTLER SİSTEMİ' };
    const html = generateQuoteHtml(data);
    expect(html).toContain('TYCO ZETTLER SİSTEMİ');
  });

  it('renders info box with colspan=3 and colspan=2', () => {
    const html = generateQuoteHtml(basePdfData);
    expect(html).toContain('colspan="3"');
    expect(html).toContain('colspan="2"');
  });

  it('renders commercial terms inside main table', () => {
    const html = generateQuoteHtml(basePdfData);
    // Terms should be in tbody, not separate table
    expect(html).not.toContain('class="terms-tbl"');
    expect(html).toContain('GARANTİ');
  });

  it('renders highlighted note with yellow background', () => {
    const data = {
      ...basePdfData,
      notes: [{ text: 'Important note', sortOrder: 1, highlight: true }],
    };
    const html = generateQuoteHtml(data);
    expect(html).toContain('highlight-yellow');
  });

  it('renders price cells with nowrap', () => {
    const html = generateQuoteHtml(basePdfData);
    expect(html).toContain('white-space');
  });
});
```

**Step 2: Write test for Mode A (with montaj)**

```typescript
describe('generateQuoteHtml - montaj mode', () => {
  it('renders montaj sub-items without POZ numbers', () => {
    const data = {
      ...basePdfData,
      montajItems: [
        { itemType: 'PRODUCT' as const, description: 'Dedektör Montajı', quantity: 640, unit: 'Adet', unitPrice: 14.40, discountPct: 0, totalPrice: 9216, vatRate: 20 },
      ],
    };
    const html = generateQuoteHtml(data);
    expect(html).toContain('Dedektör Montajı');
    expect(html).toContain('Ekipman Montaj Fiyatları');
    expect(html).toContain('MONTAJ');
    expect(html).toContain('TOPLAMI');
  });

  it('renders müh devreye alma as 1 Set when montaj present', () => {
    const data = {
      ...basePdfData,
      items: [
        ...basePdfData.items,
        { itemType: 'SERVICE' as const, description: 'Montaj Süpervizörlüğü, Mühendislik, Test ve Devreye Alma Çalışmaları', quantity: 1, unit: 'Set', unitPrice: 7810, discountPct: 0, totalPrice: 7810, vatRate: 20 },
      ],
      montajItems: [
        { itemType: 'PRODUCT' as const, description: 'Panel Montajı', quantity: 1, unit: 'Adet', unitPrice: 42.40, discountPct: 0, totalPrice: 42.40, vatRate: 20 },
      ],
    };
    const html = generateQuoteHtml(data);
    expect(html).toContain('1 Set');
    expect(html).toContain('7.810');
  });
});
```

**Step 3: Write test for Mode B (without montaj, with müh description)**

```typescript
describe('generateQuoteHtml - müh description mode', () => {
  it('renders müh description text from settings', () => {
    const data = {
      ...basePdfData,
      items: [
        ...basePdfData.items,
        { itemType: 'SERVICE' as const, description: 'Müh. Devreye Alma', quantity: 1, unit: 'Set', unitPrice: 3978, discountPct: 0, totalPrice: 3978, vatRate: 20 },
      ],
      muhDescription: ['Sistem Nokta Konfigürasyonu', 'Saha Kontrol Panelleri'],
      dahilOlmayan: 'Cihaz Montajları, Kablolama teklif kapsamımız haricindedir.',
    };
    const html = generateQuoteHtml(data);
    expect(html).toContain('Sistem Nokta Konfigürasyonu');
    expect(html).toContain('Dahil Olmayan Hizmetler');
    expect(html).toContain('Cihaz Montajları');
  });
});
```

**Step 4: Run tests to verify they fail**

Run: `npx jest src/lib/pdf/quote-template.test.ts --no-coverage`
Expected: FAIL (new tests fail because generateQuoteHtml doesn't support new interface yet)

**Step 5: Commit**

```bash
git add src/lib/pdf/quote-template.test.ts
git commit -m "test: add failing tests for dynamic PDF template"
```

---

### Task 7: Rewrite generateQuoteHtml — interfaces and CSS

**Files:**
- Modify: `src/lib/pdf/quote-template.ts:9-60` (interfaces)
- Modify: `src/lib/pdf/quote-template.ts:92-96` (BORDER constants)
- Modify: `src/lib/pdf/quote-template.ts:268-341` (CSS section)

**Step 1: Update QuoteDataForPdf interface**

Add after line 45 (`logoBase64`):
```typescript
  description?: string | null;
  montajItems: QuoteItemForPdf[];
  muhDescription: string[];
  dahilOlmayan: string;
```

Update notes type (line ~40-43):
```typescript
  notes: {
    text: string;
    sortOrder: number;
    highlight: boolean;
  }[];
```

**Step 2: Update BORDER constants**

Change line 92:
```typescript
const BORDER = 'border: 1.2pt solid black;';
const B_TOP = 'border-top: 1.2pt solid black;';
const B_BTM = 'border-bottom: 1.2pt solid black;';
const B_LFT = 'border-left: 1.2pt solid black;';
const B_RGT = 'border-right: 1.2pt solid black;';
```

**Step 3: Rewrite CSS section**

Replace the CSS in the template HTML (lines 268-341) with the CSS from `pdf/test-template.html`:
- Column widths: 8.7/57.2/9.5/11.5/13.1%
- Item borders: 0.25pt solid black
- Cell padding: 3pt 4pt
- Terms font: 7.2pt
- Green: #C6E0B4
- Page margins: 5mm 10mm 15mm 10mm
- Body padding for preview
- white-space: nowrap on price cells
- .highlight-yellow class
- Info box inner cells: border: none
- No separate .terms-tbl or .notes-tbl styles needed

**Step 4: Commit**

```bash
git add src/lib/pdf/quote-template.ts
git commit -m "refactor: update PDF template interfaces, borders, and CSS"
```

---

### Task 8: Rewrite generateQuoteHtml — thead structure

**Files:**
- Modify: `src/lib/pdf/quote-template.ts:350-385` (thead section)

**Step 1: Rewrite thead with colspan=3/colspan=2 info box**

Replace the thead section with the structure from test-template.html:
- Header image row: `<td colspan="5">` with 1.2pt border
- Info box: `<td colspan="3">` (company name, address, project name, description) + `<td colspan="2">` (PROFORMA FATURA, Tarih, Ref.No, Teklif No)
- Column headers: POZ NO, AÇIKLAMA, MİKTAR, BİRİM FİYAT, TOPLAM FİYAT

Use dynamic data:
- `${escapeHtml(data.company.name)}`
- `${data.company.address ? escapeHtml(data.company.address) : ''}`
- `${data.project ? escapeHtml(data.project.name) : ''}`
- `${data.description ? `<p class="s1" style="padding-top:1pt;">${escapeHtml(data.description)}</p>` : ''}`
- `${formatDate(data.quote.createdAt)}`
- `${data.quote.refNo || ''}`
- `${data.quote.quoteNumber}`

**Step 2: Commit**

```bash
git add src/lib/pdf/quote-template.ts
git commit -m "refactor: rewrite thead with aligned info box columns"
```

---

### Task 9: Rewrite generateQuoteHtml — tbody items and system total

**Files:**
- Modify: `src/lib/pdf/quote-template.ts:181-226` (item rendering)
- Modify: `src/lib/pdf/quote-template.ts:387-395` (tbody)

**Step 1: Rewrite item row rendering**

Keep the existing item type logic (HEADER, NOTE, PRODUCT, CUSTOM, SERVICE, SUBTOTAL, OPSİYONEL) but update the HTML output to match test-template.html styling:
- HEADER: green background `#C6E0B4`, centered bold
- PRODUCT/CUSTOM: POZ number, description, quantity+unit, unit price, total price
- NOTE: "NOT:" in POZ, description spanning 4 cols, no prices
- OPSİYONEL (quantity=0): "OPSİYONEL" in POZ, prices shown
- SERVICE items: excluded from main item loop (handled in service section)
- SUBTOTAL: section subtotal row

**Step 2: Rewrite system total row**

Match test-template.html: `sys-total-label` with 1.2pt borders spanning 4 cols, `sys-total-val` in col 5.

**Step 3: Commit**

```bash
git add src/lib/pdf/quote-template.ts
git commit -m "refactor: rewrite tbody item rendering with new styling"
```

---

### Task 10: Rewrite generateQuoteHtml — service section

**Files:**
- Modify: `src/lib/pdf/quote-template.ts` (after system total, before commercial terms)

**Step 1: Implement service section detection and rendering**

```typescript
const montajItems = data.montajItems || [];
const hasMontaj = montajItems.length > 0;
const serviceItems = data.items.filter(i => i.itemType === 'SERVICE');
const hasService = serviceItems.length > 0;
```

**Mode A (hasMontaj = true):**
```html
<!-- Header: Ekipman Montaj Fiyatları -->
<tr class="section-hdr"><td colspan="5">Ekipman Montaj Fiyatları</td></tr>

<!-- Montaj sub-items: no POZ, individual rows with pricing -->
${montajItems.map(item => `
  <tr>
    <td></td>
    <td>${item.description}</td>
    <td>${item.quantity} ${unitAbbr(item.unit)}</td>
    <td>${formatCurrency(item.unitPrice, currency)}</td>
    <td>${formatCurrency(item.totalPrice, currency)}</td>
  </tr>
`).join('')}

<!-- SERVICE items (müh devreye alma, nakliye, etc.) -->
${serviceItems.map(item => `
  <tr>
    <td><!-- no POZ --></td>
    <td>${item.description}</td>
    <td>${item.quantity} ${unitAbbr(item.unit)}</td>
    <td>${formatCurrency(item.unitPrice, currency)}</td>
    <td>${formatCurrency(item.totalPrice, currency)}</td>
  </tr>
`).join('')}

<!-- Service total row -->
<tr class="sys-total">
  <td colspan="4">MONTAJ, İŞÇİLİK ve DEVREYE ALMA TOPLAMI (${currencyName})</td>
  <td>${formatCurrency(serviceSectionTotal, currency)}</td>
</tr>
```

**Mode B (hasMontaj = false, hasService = true):**
```html
<!-- Service row: 1 Set -->
${serviceItems.map(item => serviceRowHtml(item)).join('')}

<!-- Müh description from settings -->
${data.muhDescription.length > 0 ? muhDescriptionHtml(data.muhDescription) : ''}

<!-- Dahil Olmayan Hizmetler -->
${data.dahilOlmayan ? dahilOlmayanHtml(data.dahilOlmayan) : ''}
```

**Step 2: Commit**

```bash
git add src/lib/pdf/quote-template.ts
git commit -m "feat: implement service section rendering (Mode A and B)"
```

---

### Task 11: Rewrite generateQuoteHtml — commercial terms and notes inside tbody

**Files:**
- Modify: `src/lib/pdf/quote-template.ts:410-463` (buildCommercialTermsHtml, buildNotesHtml)

**Step 1: Rewrite commercial terms as tbody rows**

Remove separate `<table class="terms-tbl">`. Instead return `<tr>` rows with `class="terms-row"` and `colspan="5"`:

```typescript
function buildCommercialTermsRows(terms: {category: string; content: string}[], isTR: boolean): string {
  if (!terms.length) return '';
  const grouped = groupByCategory(terms);
  let rows = `<tr class="terms-row"><td colspan="5"><p class="s3" style="padding-left:1pt;padding-top:8pt;">${isTR ? 'TİCARİ ŞARTLAR' : 'COMMERCIAL TERMS'}</p></td></tr>`;
  for (const [cat, items] of Object.entries(grouped)) {
    rows += `<tr class="terms-row"><td colspan="5"><p class="s3" style="padding-left:40pt;">${categoryLabel(cat, isTR)}</p></td></tr>`;
    for (const item of items) {
      rows += `<tr class="terms-row"><td colspan="5"><p class="s4" style="padding-left:40pt;line-height:110%;">${escapeHtml(item.content)}</p></td></tr>`;
    }
  }
  return rows;
}
```

**Step 2: Rewrite notes as tbody rows with highlight support**

```typescript
function buildNotesRows(notes: {text: string; sortOrder: number; highlight: boolean}[], isTR: boolean): string {
  if (!notes.length) return '';
  const sorted = [...notes].sort((a, b) => a.sortOrder - b.sortOrder);
  let rows = `<tr class="terms-row"><td colspan="5"><p class="s3" style="padding-left:40pt;padding-top:6pt;">${isTR ? 'NOTLAR' : 'NOTES'}</p></td></tr>`;
  sorted.forEach((note, i) => {
    const hlClass = note.highlight ? ' highlight-yellow' : '';
    const isLast = i === sorted.length - 1;
    rows += `<tr class="notes-row${isLast ? ' last-row' : ''}">`;
    rows += `<td style="text-align:right;padding-right:6pt;"${hlClass ? ` class="${hlClass.trim()}"` : ''}><p class="s1">${i + 1}</p></td>`;
    rows += `<td colspan="4"${hlClass ? ` class="${hlClass.trim()}"` : ''}><p class="s2" style="line-height:108%;">${escapeHtml(note.text)}</p></td>`;
    rows += '</tr>';
  });
  return rows;
}
```

**Step 3: Integrate into main template**

In the template HTML, after the service section, inside `</tbody>`:
```typescript
${buildCommercialTermsRows(data.commercialTerms, isTR)}
${buildNotesRows(data.notes, isTR)}
```

Remove the old separate table rendering after `</table>`.

**Step 4: Commit**

```bash
git add src/lib/pdf/quote-template.ts
git commit -m "refactor: move commercial terms and notes inside main table tbody"
```

---

### Task 12: Run tests and fix

**Step 1: Run all template tests**

Run: `npx jest src/lib/pdf/quote-template.test.ts --no-coverage`
Expected: All tests pass

**Step 2: Fix any failures**

Iterate until all tests pass.

**Step 3: Commit**

```bash
git add src/lib/pdf/quote-template.ts src/lib/pdf/quote-template.test.ts
git commit -m "test: all PDF template tests passing"
```

---

### Task 13: Update PDF export route — include montaj items and service descriptions

**Files:**
- Modify: `src/app/api/quotes/[id]/export/pdf/route.ts:35-129`

**Step 1: Update database query to include montaj sub-items**

Change the items query to NOT filter out items with `serviceMeta.montajParentId`. Instead, separate them after fetch:

```typescript
const allItems = quote.items;
const topLevelItems = allItems.filter(i => !i.parentItemId);
const montajItems = topLevelItems.filter(i => {
  const meta = i.serviceMeta as any;
  return meta?.montajParentId;
});
const materialItems = topLevelItems.filter(i => {
  const meta = i.serviceMeta as any;
  return !meta?.montajParentId;
});
```

**Step 2: Fetch MUH_ACIKLAMA from settings**

```typescript
const muhTemplates = await db.commercialTermTemplate.findMany({
  where: { category: 'MUH_ACIKLAMA' },
  orderBy: { sortOrder: 'asc' },
});
const muhDescription = muhTemplates.map(t => t.value);
```

**Step 3: Fetch DAHIL_OLMAYAN from per-quote terms**

```typescript
const dahilOlmayanTerms = quote.commercialTerms.filter(t => t.category === 'DAHIL_OLMAYAN');
const dahilOlmayan = dahilOlmayanTerms.map(t => t.value).join('\n');
```

**Step 4: Update pdfData construction**

Add to the pdfData object:
```typescript
description: quote.description,
montajItems: montajItems.map(mapItemForPdf),
muhDescription,
dahilOlmayan,
```

Update notes mapping to include highlight:
```typescript
notes: notlarTerms.map(t => ({
  text: t.value,
  sortOrder: Number(t.sortOrder),
  highlight: t.highlight,
})),
```

**Step 5: Commit**

```bash
git add src/app/api/quotes/[id]/export/pdf/route.ts
git commit -m "feat: include montaj items, müh description, and dahil olmayan in PDF export"
```

---

### Task 14: Update PDF export route test

**Files:**
- Modify: `src/app/api/quotes/[id]/export/pdf/route.test.ts`

**Step 1: Add test for montaj items included in export**

Test that items with `serviceMeta.montajParentId` are passed as `montajItems` (not filtered out).

**Step 2: Add test for müh description fetched from settings**

Test that `MUH_ACIKLAMA` templates are fetched and passed as `muhDescription`.

**Step 3: Add test for dahil olmayan from per-quote terms**

Test that `DAHIL_OLMAYAN` terms are passed as `dahilOlmayan`.

**Step 4: Add test for description field passed through**

Test that `quote.description` is included in pdfData.

**Step 5: Run tests**

Run: `npx jest src/app/api/quotes/[id]/export/pdf/route.test.ts --no-coverage`
Expected: All pass

**Step 6: Commit**

```bash
git add src/app/api/quotes/[id]/export/pdf/route.test.ts
git commit -m "test: PDF export route includes montaj, müh description, dahil olmayan"
```

---

### Task 15: Visual regression — generate PDF and compare

**Step 1: Start dev server and generate a test PDF**

Create a test script or use existing quote data to generate a PDF with the new template.

**Step 2: Compare with test-template.html reference**

Open the generated PDF alongside `pdf/test-template.html` and verify:
- Header layout matches (info box aligned with columns)
- Borders match (1.2pt headers, 0.25pt items, black)
- Padding and spacing correct
- Commercial terms and notes inside main table
- Price cells don't wrap
- Service section renders correctly

**Step 3: Fix any visual discrepancies**

Iterate on CSS/HTML until output matches the test template.

**Step 4: Commit**

```bash
git add src/lib/pdf/quote-template.ts
git commit -m "fix: visual alignment of dynamic PDF template"
```

---

### Task 16: Add DAHIL_OLMAYAN to quote editor commercial terms section

**Files:**
- Modify: Quote editor commercial terms section component

**Step 1: Add DAHIL_OLMAYAN as a new category in the commercial terms editor**

Ensure `DAHIL_OLMAYAN` category entries:
- Are copied from default templates when creating a new quote
- Can be edited per-quote in the same UI as other commercial terms
- Show under a "Dahil Olmayan Hizmetler" section heading

**Step 2: Commit**

```bash
git add src/components/quotes/ src/app/(dashboard)/quotes/
git commit -m "feat: add DAHIL_OLMAYAN to quote commercial terms editor"
```

---

### Task 17: Final integration test

**Step 1: Run full test suite**

Run: `npx jest --no-coverage`
Expected: All tests pass

**Step 2: Manual E2E test**

1. Create a new quote in the editor
2. Add items, set description field
3. Add commercial terms and NOTLAR with highlight
4. Export PDF
5. Verify PDF matches expected layout

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete dynamic PDF template with service sections"
```
