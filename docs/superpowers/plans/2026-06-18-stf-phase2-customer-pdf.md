# STF Phase 2 — Customer PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `GET /api/orders/[id]/export/pdf` render the customer-facing Sipariş Teyit Formu from the **STF snapshot** (the editable `OrderItem` rows + `OrderConfirmation` snapshot header/footer), faithfully matching the sample proforma layout (`client_notes/stf örnekler/STF-4721-5833.1 - DURAN DOĞAN ….pdf`).

**Architecture:** Today the order PDF reads the *live quote* (`order.quote.items`, `order.quote.grandTotal`) — wrong for STF, which is an independent hand-edited snapshot. Phase 2 (1) adds two additive section-discount columns to `OrderItem` so per-section "FİRMANIZA ÖZEL İNDİRİM" can render, (2) carries them through snapshot → POST → validation → PUT (everything stays editable), (3) recomputes the order's stored `grandTotal`/`discountTotal` server-side on save so totals never go stale, (4) rewrites `order-template.ts` to the full sectioned layout — mirroring the *proven* sectioned-subtotal / `*`-child / footer rendering already in `quote-template.ts` — and (5) makes `StfEditor` render rows type-aware (HEADER / NOTE / SUBTOTAL vs PRODUCT) so users can edit section discounts.

**Tech Stack:** Next.js 16 App Router, Prisma + Postgres 16, Puppeteer (via `getPdfService()`), Vitest, TypeScript, Zod.

**Standing constraints (carry from the whole batch):**
- All DB changes **additive only** — new nullable columns. No type/nullability change to existing columns. This is a ~3-month-live production app.
- Migration applied to the local dev DB via `psql -f` then recorded with `prisma migrate resolve --applied` (NEVER `prisma migrate dev` — it would reset the drifted local DB), then `npx prisma generate`.
- `tsc --noEmit` gives a false "clean" from the incremental cache — every typecheck does `rm -f tsconfig.tsbuildinfo && npx tsc --noEmit`.
- 🚨 **Subagents: do NOT run `git checkout`/`switch`/`stash`/`reset`/`restore`** — a reviewer reverted the tree to `main` in Phase 1. Stay on `feature/client-notes-jun2026`.
- After the migration + `prisma generate`, the running `next dev` holds a stale Prisma client — the user must restart it before browser smoke-testing (note it, don't try to restart it yourself).

**Baseline:** 632 tests pass on `feature/client-notes-jun2026` (HEAD `c23c0cf`).

---

## File Structure

- **Modify** `prisma/schema.prisma` — add `sectionDiscountPct`, `sectionDiscountLabel` to `model OrderItem`.
- **Create** `prisma/migrations/20260618010000_add_order_item_section_discount/migration.sql` — additive ALTER TABLE.
- **Modify** `src/lib/stf/stf-snapshot.ts` (+ `stf-snapshot.test.ts`) — copy the two fields into the snapshot.
- **Modify** `src/app/api/orders/route.ts` — load + pass the two fields in POST.
- **Modify** `src/lib/validations/stf.ts` — accept the two fields on `stfItemSchema`.
- **Create** `src/lib/stf/stf-totals.ts` (+ `stf-totals.test.ts`) — pure `computeStfTotals(items)` → `{ grandTotal, discountTotal }`, reused by PUT and (optionally) the template.
- **Modify** `src/app/api/orders/[id]/route.ts` — PUT persists the two fields + recomputes order totals.
- **Rewrite** `src/lib/pdf/order-template.ts` (+ `order-template.test.ts`) — full sectioned customer layout from the snapshot.
- **Modify** `src/app/api/orders/[id]/export/pdf/route.ts` — feed snapshot data (order rows + snapshot header/footer), not the live quote.
- **Modify** `src/components/orders/StfEditor.tsx` — type-aware row rendering + editable section discount on SUBTOTAL rows; show recomputed totals.

---

## Task 1: Additive migration — section-discount columns on OrderItem

**Files:**
- Modify: `prisma/schema.prisma` (`model OrderItem`, after `discountPct`)
- Create: `prisma/migrations/20260618010000_add_order_item_section_discount/migration.sql`

- [ ] **Step 1: Add the two fields to the Prisma model**

In `prisma/schema.prisma`, inside `model OrderItem`, immediately after the `discountPct Decimal @default(0) @db.Decimal(5, 2)` line, add:

```prisma
  /// Snapshot of the source QuoteItem.sectionDiscountPct. Only meaningful on
  /// SUBTOTAL rows; null/0 = no per-section discount. Hand-editable on the STF.
  sectionDiscountPct   Decimal? @db.Decimal(5, 2)
  /// Snapshot of QuoteItem.sectionDiscountLabel. Custom label for the section
  /// discount line (default "İskonto"). Only meaningful on SUBTOTAL rows.
  sectionDiscountLabel String?
```

- [ ] **Step 2: Write the migration SQL**

Create `prisma/migrations/20260618010000_add_order_item_section_discount/migration.sql`:

```sql
-- STF Phase 2 — additive. Per-section discount snapshot on OrderItem.
-- Only meaningful on SUBTOTAL rows; nullable, no default needed.
ALTER TABLE "OrderItem" ADD COLUMN "sectionDiscountPct" DECIMAL(5,2);
ALTER TABLE "OrderItem" ADD COLUMN "sectionDiscountLabel" TEXT;
```

- [ ] **Step 3: Apply to the local dev DB**

Run (read `DATABASE_URL` from `.env`):

```bash
psql "$DATABASE_URL" -f prisma/migrations/20260618010000_add_order_item_section_discount/migration.sql
```

Expected: `ALTER TABLE` printed twice, no error. (If columns already exist from a prior attempt, that's fine — note it and continue.)

- [ ] **Step 4: Record as applied + regenerate client**

```bash
npx prisma migrate resolve --applied 20260618010000_add_order_item_section_discount
npx prisma generate
```

Expected: "migration … marked as applied", then "Generated Prisma Client".

- [ ] **Step 5: Verify typecheck still clean**

```bash
rm -f tsconfig.tsbuildinfo && npx tsc --noEmit
```

Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260618010000_add_order_item_section_discount
git commit -m "STF P2 (1): additive OrderItem section-discount columns"
```

---

## Task 2: Carry section-discount fields through the snapshot

**Files:**
- Modify: `src/lib/stf/stf-snapshot.ts`
- Test: `src/lib/stf/stf-snapshot.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/stf/stf-snapshot.test.ts` (inside the existing describe block; mirror the existing fixture shape — add the new fields to one SUBTOTAL item in the input):

```ts
it('copies sectionDiscountPct/Label onto SUBTOTAL snapshot items', () => {
  const { items } = buildStfSnapshot(
    {
      quoteNumber: 'SA0001', refNo: null, currency: 'EUR',
      discountTotal: 0, grandTotal: 100,
      company: { name: 'X', address: null, phone: null, taxNumber: null },
      project: null,
      commercialTerms: [],
      items: [
        { itemType: 'PRODUCT', sortOrder: 0, code: null, brand: null, model: null,
          description: 'P', quantity: 1, unit: 'Adet', unitPrice: 100, totalPrice: 100,
          priceLabel: null, parentItemId: null, discountPct: 0,
          sectionDiscountPct: null, sectionDiscountLabel: null },
        { itemType: 'SUBTOTAL', sortOrder: 1, code: null, brand: null, model: null,
          description: '', quantity: 0, unit: 'Adet', unitPrice: 0, totalPrice: 0,
          priceLabel: null, parentItemId: null, discountPct: 0,
          sectionDiscountPct: 30, sectionDiscountLabel: 'Firmanıza Özel' },
      ],
    },
    new Date('2026-06-18T00:00:00Z')
  );
  const sub = items.find((i) => i.itemType === 'SUBTOTAL')!;
  expect(sub.sectionDiscountPct).toBe(30);
  expect(sub.sectionDiscountLabel).toBe('Firmanıza Özel');
  // Non-SUBTOTAL rows keep null.
  expect(items[0].sectionDiscountPct).toBeNull();
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/lib/stf/stf-snapshot.test.ts`
Expected: FAIL (TS error: `sectionDiscountPct` not on `QuoteItemForSnapshot`/`StfItem`, or `undefined`).

- [ ] **Step 3: Extend the interfaces**

In `src/lib/stf/stf-snapshot.ts`, add to `interface QuoteItemForSnapshot` (after `discountPct: number;`):

```ts
  sectionDiscountPct: number | null;
  sectionDiscountLabel: string | null;
```

Add the same two lines to `interface StfItem` (after `discountPct: number;`).

- [ ] **Step 4: Map them in `buildStfSnapshot`**

In the `.map((it) => { … return { … } })` item builder, add after `discountPct: it.discountPct,`:

```ts
        sectionDiscountPct: it.sectionDiscountPct,
        sectionDiscountLabel: it.sectionDiscountLabel,
```

- [ ] **Step 5: Run the test — verify pass**

Run: `npx vitest run src/lib/stf/stf-snapshot.test.ts`
Expected: PASS (all tests in file).

- [ ] **Step 6: Commit**

```bash
git add src/lib/stf/stf-snapshot.ts src/lib/stf/stf-snapshot.test.ts
git commit -m "STF P2 (2): snapshot carries section-discount fields"
```

---

## Task 3: POST route loads + passes section-discount fields

**Files:**
- Modify: `src/app/api/orders/route.ts`
- Test: `src/app/api/orders/route.test.ts` (extend the existing snapshot test if it asserts on item fields; otherwise no new test — Task 2 covers the mapping)

- [ ] **Step 1: Include the fields when reading the quote**

The POST handler reads `quote.items` with `items: { orderBy: { sortOrder: 'asc' } }` (no `select`, so all columns load) — `sectionDiscountPct`/`sectionDiscountLabel` are already available on each item. No include change needed.

- [ ] **Step 2: Pass them into `buildStfSnapshot`**

In `src/app/api/orders/route.ts`, in the `items: quote.items.map((i) => ({ … }))` argument to `buildStfSnapshot`, add after `discountPct: Number(i.discountPct),`:

```ts
                  sectionDiscountPct: i.sectionDiscountPct === null ? null : Number(i.sectionDiscountPct),
                  sectionDiscountLabel: i.sectionDiscountLabel,
```

- [ ] **Step 3: Persist them in the nested create**

The order create uses `items: { create: items.map((it) => ({ ...it, itemType: it.itemType as QuoteItemType })) }`. Because the spread includes every `StfItem` field, the two new fields flow through automatically once Task 2 added them to `StfItem`. Confirm by reading the create block — no change needed beyond Task 2.

- [ ] **Step 4: Typecheck**

```bash
rm -f tsconfig.tsbuildinfo && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Run the orders route tests**

Run: `npx vitest run src/app/api/orders/route.test.ts`
Expected: PASS (existing tests still green).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/orders/route.ts src/app/api/orders/route.test.ts
git commit -m "STF P2 (3): POST snapshots section-discount fields"
```

---

## Task 4: Validation schema accepts section-discount fields

**Files:**
- Modify: `src/lib/validations/stf.ts`

- [ ] **Step 1: Add the fields to `stfItemSchema`**

In `src/lib/validations/stf.ts`, add to the `stfItemSchema` object (after `sectionNote: nullableStr,`):

```ts
  sectionDiscountPct: z.coerce.number().nullish().transform((v) => (v == null ? null : v)),
  sectionDiscountLabel: nullableStr,
```

- [ ] **Step 2: Typecheck**

```bash
rm -f tsconfig.tsbuildinfo && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/validations/stf.ts
git commit -m "STF P2 (4): stfItemSchema accepts section-discount fields"
```

---

## Task 5: Pure totals helper + PUT persists fields and recomputes order totals

**Files:**
- Create: `src/lib/stf/stf-totals.ts`
- Test: `src/lib/stf/stf-totals.test.ts`
- Modify: `src/app/api/orders/[id]/route.ts`

**Background:** The section-subtotal math must match `quote-template.ts`'s `computeSubtotalSum` / `computeGrandTotalAtIndex` (read `src/lib/pdf/quote-template.ts:198-241` for the reference): walk items, accumulate priced rows (PRODUCT/CUSTOM/SET, skipping `priceLabel` rows and SET children), and at each SUBTOTAL apply `sectionDiscountPct` to that section's open tail. `grandTotal` = sum of net section totals (+ any open tail after the last SUBTOTAL). `discountTotal` = sum of per-section discount amounts.

- [ ] **Step 1: Write the failing test**

Create `src/lib/stf/stf-totals.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeStfTotals } from './stf-totals';

const base = {
  pozNo: null, code: null, brand: null, model: null, unit: 'Adet',
  quantity: 1, sortOrder: 0, sectionDiscountLabel: null,
};

describe('computeStfTotals', () => {
  it('sums priced rows with no sections or discounts', () => {
    const r = computeStfTotals([
      { ...base, itemType: 'PRODUCT', description: 'A', unitPrice: 100, totalPrice: 100, priceLabel: null, parentItemId: null, discountPct: 0, sectionDiscountPct: null },
      { ...base, itemType: 'PRODUCT', description: 'B', unitPrice: 50, totalPrice: 50, priceLabel: null, parentItemId: null, discountPct: 0, sectionDiscountPct: null },
    ]);
    expect(r.grandTotal).toBe(150);
    expect(r.discountTotal).toBe(0);
  });

  it('applies per-section discount at SUBTOTAL and accumulates net across sections', () => {
    const r = computeStfTotals([
      { ...base, itemType: 'PRODUCT', description: 'A', totalPrice: 100, priceLabel: null, parentItemId: null, discountPct: 0, sectionDiscountPct: null },
      { ...base, itemType: 'SUBTOTAL', description: '', totalPrice: 0, priceLabel: null, parentItemId: null, discountPct: 0, sectionDiscountPct: 30 }, // -30
      { ...base, itemType: 'PRODUCT', description: 'B', totalPrice: 200, priceLabel: null, parentItemId: null, discountPct: 0, sectionDiscountPct: null },
      { ...base, itemType: 'SUBTOTAL', description: '', totalPrice: 0, priceLabel: null, parentItemId: null, discountPct: 0, sectionDiscountPct: 10 }, // -20
    ]);
    expect(r.discountTotal).toBe(50);   // 30 + 20
    expect(r.grandTotal).toBe(250);     // 70 + 180
  });

  it('excludes priceLabel rows and SET children from the section sum', () => {
    const r = computeStfTotals([
      { ...base, itemType: 'SET', description: 'Set', totalPrice: 400, priceLabel: null, parentItemId: null, discountPct: 0, sectionDiscountPct: null },
      { ...base, itemType: 'PRODUCT', description: 'child', totalPrice: 999, priceLabel: null, parentItemId: 'set1', discountPct: 0, sectionDiscountPct: null },
      { ...base, itemType: 'PRODUCT', description: 'incl', totalPrice: 0, priceLabel: 'dahildir', parentItemId: null, discountPct: 0, sectionDiscountPct: null },
    ]);
    expect(r.grandTotal).toBe(400);
    expect(r.discountTotal).toBe(0);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/lib/stf/stf-totals.test.ts`
Expected: FAIL ("Cannot find module './stf-totals'").

- [ ] **Step 3: Implement the helper**

Create `src/lib/stf/stf-totals.ts`:

```ts
/**
 * Order-level totals for an STF, computed from its line items so the stored
 * grandTotal/discountTotal never go stale after hand edits. Mirrors the
 * section-discount math in quote-template.ts (computeSubtotalSum /
 * computeGrandTotalAtIndex): priced rows are PRODUCT/CUSTOM/SET that are not
 * priceLabel'd and not SET children (parentItemId set); each SUBTOTAL applies
 * its sectionDiscountPct to that section's open tail.
 */
export interface StfTotalsItem {
  itemType: string;
  totalPrice: number;
  priceLabel: string | null;
  parentItemId: string | null;
  sectionDiscountPct: number | null;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const isPriced = (it: StfTotalsItem) =>
  !it.priceLabel &&
  !it.parentItemId &&
  (it.itemType === 'PRODUCT' || it.itemType === 'CUSTOM' || it.itemType === 'SET');

export function computeStfTotals(
  items: StfTotalsItem[]
): { grandTotal: number; discountTotal: number } {
  let grandTotal = 0;
  let discountTotal = 0;
  let openTail = 0;

  for (const it of items) {
    if (it.itemType === 'SUBTOTAL') {
      const pct = Number(it.sectionDiscountPct ?? 0);
      const disc = pct > 0 ? round2(openTail * (pct / 100)) : 0;
      grandTotal = round2(grandTotal + openTail - disc);
      discountTotal = round2(discountTotal + disc);
      openTail = 0;
      continue;
    }
    if (isPriced(it)) openTail += Number(it.totalPrice) || 0;
  }
  return { grandTotal: round2(grandTotal + openTail), discountTotal };
}
```

- [ ] **Step 4: Run the test — verify pass**

Run: `npx vitest run src/lib/stf/stf-totals.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into PUT**

In `src/app/api/orders/[id]/route.ts`, import at top:

```ts
import { computeStfTotals } from '@/lib/stf/stf-totals';
```

In the `PUT` handler, after `const { items, formDate, ...header } = data;`, compute totals:

```ts
    const { grandTotal, discountTotal } = computeStfTotals(
      items.map((it) => ({
        itemType: it.itemType,
        totalPrice: it.totalPrice,
        priceLabel: it.priceLabel,
        parentItemId: it.parentItemId,
        sectionDiscountPct: it.sectionDiscountPct,
      }))
    );
```

In the `tx.orderConfirmation.update` `data`, replace the `...header,` totals by overriding after the spread — change the `data` object so it reads:

```ts
        data: {
          ...header,
          formDate: formDate ? new Date(formDate) : null,
          grandTotal,
          discountTotal,
          items: {
            create: items.map((it) => ({
              sortOrder: it.sortOrder,
              itemType: it.itemType as QuoteItemType,
              pozNo: it.pozNo,
              code: it.code,
              brand: it.brand,
              model: it.model,
              description: it.description,
              quantity: it.quantity,
              unit: it.unit,
              unitPrice: it.unitPrice,
              totalPrice: it.totalPrice,
              priceLabel: it.priceLabel,
              parentItemId: it.parentItemId,
              discountPct: it.discountPct,
              sectionNote: it.sectionNote,
              sectionDiscountPct: it.sectionDiscountPct,
              sectionDiscountLabel: it.sectionDiscountLabel,
            })),
          },
        },
```

(`grandTotal`/`discountTotal` come from the schema as numbers too, but the spread's values are the client-sent ones; the explicit `grandTotal`/`discountTotal` keys after `...header` override them with the server-recomputed values.)

- [ ] **Step 6: Typecheck + full suite**

```bash
rm -f tsconfig.tsbuildinfo && npx tsc --noEmit
npx vitest run
```

Expected: typecheck clean; suite green (was 632; now +snapshot test +totals tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/stf/stf-totals.ts src/lib/stf/stf-totals.test.ts "src/app/api/orders/[id]/route.ts"
git commit -m "STF P2 (5): recompute order totals + persist section-discount on PUT"
```

---

## Task 6: Rewrite the customer PDF template

**Files:**
- Rewrite: `src/lib/pdf/order-template.ts`
- Test: `src/lib/pdf/order-template.test.ts`

**Reference:** Read `src/lib/pdf/quote-template.ts` fully before starting — this template **mirrors its proven structure** (header image row, info box, `computeSubtotalSum`, three-row SUBTOTAL block, `escapeHtmlMultiline`, CSS classes `s1`–`s4`, `.section-hdr`, `.sys-total-label`/`.sys-total-val`). Target layout: `client_notes/stf örnekler/STF-4721-5833.1 - DURAN DOĞAN ….pdf` (3 pages). Differences from `quote-template`: STF header labels (FİRMA ADI / İLGİLİ KİŞİ, FİRMA ADRESİ, FİRMA TELEFON, FİRMA V.D./VERGİ NO on the left; TARİH, STF NO, TEKLİF NO / REF NO, PROJE ADI, SİPARİŞ NO on the right), `*` for child rows, and the footer label table + signature row.

**Data model:** The template consumes the STF snapshot, NOT the quote.

- [ ] **Step 1: Write the failing test**

Create `src/lib/pdf/order-template.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateOrderHtml, type OrderDataForPdf } from './order-template';

const data: OrderDataForPdf = {
  order: {
    orderNumber: 'STF-6000',
    customerName: 'DURAN DOĞAN BASIM VE AMBALAJ SAN.A.Ş',
    customerAddress: 'Hadımköy Mah. ... İSTANBUL',
    customerPhone: null,
    customerTaxInfo: 'BÜYÜK MÜKELLEFLER / 315 007 0 414',
    projectName: 'DURAN DOĞAN - ANA FABRİKA',
    quoteNo: 'SA0001',
    refNo: '316A',
    formDate: new Date('2025-08-06T00:00:00Z'),
    siparisNo: null,
    currency: 'EUR',
    manufacturers: 'GLT ZETA\nTYCO ZETTLER\nBTS',
    warranty: 'Üretici garantisi altındadır.',
    deliveryPlace: 'İstanbul Şantiye Depo teslimidir.',
    paymentTerms: '30 gün içinde peşin banka havalesi.',
    vatNote: 'Fiyatlarımıza KDV dahil değildir.',
    notes: 'Teklifimiz bir bütün halinde geçerlidir.',
    customerApprovalName: 'İLKER ÇETİN',
    btsResponsibleName: 'ÖZNUR SAYIN',
  },
  items: [
    { itemType: 'HEADER', pozNo: null, description: 'TRAFO 1', brand: null, code: null, quantity: 0, unit: 'Adet', unitPrice: 0, totalPrice: 0, priceLabel: null, parentItemId: null, sectionDiscountPct: null, sectionDiscountLabel: null },
    { itemType: 'PRODUCT', pozNo: '1', description: 'Fyreye MKII Optik Duman Dedektörü', brand: null, code: 'MKII-OP', quantity: 1, unit: 'Adet', unitPrice: 31.4, totalPrice: 31.4, priceLabel: null, parentItemId: null, sectionDiscountPct: null, sectionDiscountLabel: null },
    { itemType: 'PRODUCT', pozNo: null, description: 'Fyreye MKII Standart Dedektör Soketi', brand: null, code: 'MKII-CB', quantity: 1, unit: 'Adet', unitPrice: 4.57, totalPrice: 4.57, priceLabel: null, parentItemId: 'p1', sectionDiscountPct: null, sectionDiscountLabel: null },
    { itemType: 'SUBTOTAL', pozNo: null, description: 'TRAFO-1 SİSTEM', brand: null, code: null, quantity: 0, unit: 'Adet', unitPrice: 0, totalPrice: 0, priceLabel: null, parentItemId: null, sectionDiscountPct: 30, sectionDiscountLabel: 'FİRMANIZA ÖZEL İNDİRİM' },
  ],
};

describe('generateOrderHtml (STF customer PDF)', () => {
  const html = generateOrderHtml(data);

  it('renders the STF header fields', () => {
    expect(html).toContain('SİPARİŞ TEYİT FORMU');
    expect(html).toContain('DURAN DOĞAN BASIM VE AMBALAJ SAN.A.Ş');
    expect(html).toContain('STF-6000');
    expect(html).toContain('316A');
    expect(html).toContain('DURAN DOĞAN - ANA FABRİKA');
  });

  it('renders a section header row and a poz number', () => {
    expect(html).toContain('TRAFO 1');
    expect(html).toMatch(/>1<\/p>/); // poz 1
  });

  it('renders child rows with * instead of a poz number', () => {
    // The child (parentItemId set, pozNo null) shows "*"
    expect(html).toContain('>*</p>');
  });

  it('renders a three-row section subtotal block with the discount label', () => {
    expect(html).toContain('FİRMANIZA ÖZEL İNDİRİM');
    // gross 36.40 minus 30% (10.92) -> net 25.48 appears
    expect(html).toContain('25,48');
  });

  it('renders footer blocks and signature names', () => {
    expect(html).toContain('ÜRETİCİ FİRMALAR');
    expect(html).toContain('GARANTİ');
    expect(html).toContain('MÜŞTERİ ONAYI');
    expect(html).toContain('İLKER ÇETİN');
    expect(html).toContain('ÖZNUR SAYIN');
  });

  it('escapes multi-line footer text with <br/>', () => {
    expect(html).toContain('GLT ZETA<br/>TYCO ZETTLER<br/>BTS');
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run src/lib/pdf/order-template.test.ts`
Expected: FAIL (interface shape mismatch — old `OrderDataForPdf` requires `quote`/`company`).

- [ ] **Step 3: Rewrite `order-template.ts`**

Replace the entire file with the snapshot-driven template below. It keeps the proven helpers (`formatCurrency`, `formatDate`, `escapeHtml`, `escapeHtmlMultiline`, `unitAbbr`, `round2`, `computeSubtotalSum`) and CSS from `quote-template.ts`, adapted to the STF header/footer.

```ts
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

const isPriced = (it: OrderItemForPdf) =>
  !it.priceLabel && !it.parentItemId &&
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
```

- [ ] **Step 4: Run the template test — verify pass**

Run: `npx vitest run src/lib/pdf/order-template.test.ts`
Expected: PASS (6/6). (If the `25,48` assertion fails, check the round2 math: 36.40 gross → 30% = 10.92 → net 25.48.)

- [ ] **Step 5: Typecheck**

```bash
rm -f tsconfig.tsbuildinfo && npx tsc --noEmit
```

Expected: clean (the PDF export route will still typecheck against the OLD interface — Task 7 fixes it; if tsc errors here on `route.ts`, that's expected and resolved in Task 7. Run tsc again at the end of Task 7).

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/order-template.ts src/lib/pdf/order-template.test.ts
git commit -m "STF P2 (6): rewrite customer PDF template from STF snapshot"
```

---

## Task 7: PDF export route feeds the snapshot

**Files:**
- Modify: `src/app/api/orders/[id]/export/pdf/route.ts`

- [ ] **Step 1: Load order with its snapshot items (drop the live-quote includes)**

Replace the `db.orderConfirmation.findUnique` call so it loads the order's own `items` and the snapshot header/footer columns (already on `order`):

```ts
    const order = await db.orderConfirmation.findUnique({
      where: { id },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
```

- [ ] **Step 2: Map snapshot → `OrderDataForPdf`**

Replace the `pdfData` block with:

```ts
    const pdfData: OrderDataForPdf = {
      order: {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerAddress: order.customerAddress,
        customerPhone: order.customerPhone,
        customerTaxInfo: order.customerTaxInfo,
        projectName: order.projectName,
        quoteNo: order.quoteNo,
        refNo: order.refNo,
        formDate: order.formDate,
        siparisNo: order.siparisNo,
        currency: order.currency,
        manufacturers: order.manufacturers,
        warranty: order.warranty,
        deliveryPlace: order.deliveryPlace,
        paymentTerms: order.paymentTerms,
        vatNote: order.vatNote,
        notes: order.notes,
        customerApprovalName: order.customerApprovalName,
        btsResponsibleName: order.btsResponsibleName,
      },
      items: order.items.map((it) => ({
        itemType: it.itemType,
        pozNo: it.pozNo,
        code: it.code,
        brand: it.brand,
        description: it.description,
        quantity: Number(it.quantity),
        unit: it.unit,
        unitPrice: Number(it.unitPrice),
        totalPrice: Number(it.totalPrice),
        priceLabel: it.priceLabel,
        parentItemId: it.parentItemId,
        sectionDiscountPct: it.sectionDiscountPct === null ? null : Number(it.sectionDiscountPct),
        sectionDiscountLabel: it.sectionDiscountLabel,
      })),
      headerBase64,
      logoBase64,
    };
```

Keep the existing auth check (creator OR `canExport`), the `loadImageBase64` header/logo loading, and the PDF response untouched. Remove the now-unused `OrderItemForPdf` import line if present (the import is `generateOrderHtml, OrderDataForPdf`).

- [ ] **Step 3: Typecheck**

```bash
rm -f tsconfig.tsbuildinfo && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Full suite**

Run: `npx vitest run`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/orders/[id]/export/pdf/route.ts"
git commit -m "STF P2 (7): PDF export route renders from STF snapshot"
```

---

## Task 8: Type-aware StfEditor rows + editable section discount

**Files:**
- Modify: `src/components/orders/StfEditor.tsx`

**Goal:** The editor currently renders every row as an editable PRODUCT row. Make it type-aware so users see/edit the structure that the PDF renders: HEADER = full-width section title input; NOTE = full-width note text input; SUBTOTAL = section-discount label + percentage inputs; PRODUCT/SET/CUSTOM = the existing product row (child rows show `*`). Also surface the recomputed grand total read-only.

- [ ] **Step 1: Add the two fields to the local `StfItem` type**

In `StfEditor.tsx`, add to `interface StfItem` (after `sectionNote: string | null;`):

```ts
  sectionDiscountPct: number | null;
  sectionDiscountLabel: string | null;
```

- [ ] **Step 2: Render rows by type**

Replace the single `<tr>` inside `stf.items.map(...)` with a type-aware switch. Keep the existing product-row markup for PRODUCT/SET/CUSTOM, and render the child poz as `*`:

```tsx
            {stf.items.map((it, idx) => {
              if (it.itemType === 'HEADER') {
                return (
                  <tr key={it.id ?? idx} className="border-t border-primary-100 bg-green-50">
                    <td className="px-2 py-1"></td>
                    <td className="px-2 py-1" colSpan={6}>
                      <input className="w-full bg-transparent font-semibold uppercase" value={it.description}
                        onChange={(e) => setItem(idx, { description: e.target.value })} />
                    </td>
                  </tr>
                );
              }
              if (it.itemType === 'NOTE') {
                return (
                  <tr key={it.id ?? idx} className="border-t border-primary-100">
                    <td className="px-2 py-1 text-center text-xs text-primary-500">{it.pozNo || 'NOT:'}</td>
                    <td className="px-2 py-1" colSpan={6}>
                      <input className="w-full bg-transparent italic" value={it.description}
                        onChange={(e) => setItem(idx, { description: e.target.value })} />
                    </td>
                  </tr>
                );
              }
              if (it.itemType === 'SUBTOTAL') {
                return (
                  <tr key={it.id ?? idx} className="border-t border-primary-200 bg-primary-50">
                    <td className="px-2 py-1 text-xs font-medium text-primary-600" colSpan={2}>
                      Ara Toplam / İndirim
                    </td>
                    <td className="px-2 py-1" colSpan={2}>
                      <input className="w-full bg-transparent text-xs" placeholder="İndirim etiketi"
                        value={it.sectionDiscountLabel ?? ''}
                        onChange={(e) => setItem(idx, { sectionDiscountLabel: e.target.value })} />
                    </td>
                    <td className="px-2 py-1 text-right" colSpan={3}>
                      <input className="w-16 bg-transparent text-right" type="number" placeholder="%"
                        value={it.sectionDiscountPct ?? ''}
                        onChange={(e) => setItem(idx, {
                          sectionDiscountPct: e.target.value === '' ? null : parseNum(e.target.value, it.sectionDiscountPct ?? 0),
                        })} />
                      <span className="ml-1 text-xs text-primary-500">% indirim</span>
                    </td>
                  </tr>
                );
              }
              // PRODUCT / SET / CUSTOM
              return (
                <tr key={it.id ?? idx} className="border-t border-primary-100">
                  <td className="px-2 py-1">{it.parentItemId ? '*' : (it.pozNo ?? '')}</td>
                  <td className="px-2 py-1">
                    <input className="w-full bg-transparent" value={it.description}
                      onChange={(e) => setItem(idx, { description: e.target.value })} />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <input className="w-16 bg-transparent text-right" type="number" value={it.quantity}
                      onChange={(e) => setItem(idx, { quantity: parseNum(e.target.value, it.quantity) })} />
                  </td>
                  <td className="px-2 py-1">
                    <input className="w-16 bg-transparent" value={it.unit}
                      onChange={(e) => setItem(idx, { unit: e.target.value })} />
                  </td>
                  <td className="px-2 py-1 text-right">
                    <input className="w-24 bg-transparent text-right" type="number" value={it.unitPrice}
                      onChange={(e) => setItem(idx, { unitPrice: parseNum(e.target.value, it.unitPrice) })} />
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {it.priceLabel ? it.priceLabel : Number(it.totalPrice).toFixed(2)}
                  </td>
                  <td className="px-2 py-1">
                    <input className="w-full bg-transparent" value={it.sectionNote ?? ''}
                      onChange={(e) => setItem(idx, { sectionNote: e.target.value })} />
                  </td>
                </tr>
              );
            })}
```

- [ ] **Step 3: Show the stored grand total read-only**

After the items table `</div>`, add a totals strip:

```tsx
      <div className="flex justify-end gap-6 text-sm">
        <span className="text-primary-600">İndirim: <b className="tabular-nums">{Number(stf.discountTotal).toFixed(2)}</b></span>
        <span className="text-primary-900">Genel Toplam: <b className="tabular-nums">{Number(stf.grandTotal).toFixed(2)} {stf.currency}</b></span>
      </div>
```

(These reflect the server-recomputed values returned by PUT; they refresh after Kaydet.)

- [ ] **Step 4: Typecheck**

```bash
rm -f tsconfig.tsbuildinfo && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/orders/StfEditor.tsx
git commit -m "STF P2 (8): type-aware editor rows + editable section discount"
```

---

## Final verification (controller, after all tasks)

- [ ] `rm -f tsconfig.tsbuildinfo && npx tsc --noEmit` — clean.
- [ ] `npx vitest run` — full suite green (≥ 632 + new tests).
- [ ] **Remind the user to restart `next dev`** (stale Prisma client after the migration), then browser smoke-test on quote **SA0001** (already KAZANILDI locally): STF Oluştur → edit a section discount → Kaydet → "PDF İndir" → confirm the PDF shows the header table, sectioned items with `*` children, the three-row FİRMANIZA ÖZEL İNDİRİM block, footer blocks, and the MÜŞTERİ ONAYI / BTS SORUMLUSU signature row.
- [ ] Dispatch a final integration code review (spec §6 fidelity + the live-system additive-only constraint).
- [ ] Update spec §8b (mark Phase 2 done; note Phase 3 Excel + Phase 4 revisions remain) and the `project_client_notes_jun2026` memory.

---

## Self-Review (against spec §6)

- **Header table** (firma adı/ilgili kişi, adres, telefon, V.D./vergi no | tarih, STF no, teklif no/ref no, proje adı, sipariş no) → Task 6 info box. ✓
- **Line items** (Poz No / Ürün Adı / Miktar / Birim Fiyat / Toplam Fiyat) → Task 6 column headers + rows. ✓
- **Section subtotals + per-section FİRMANIZA ÖZEL İNDİRİM + net** (Duran Doğan shape) → Task 6 SUBTOTAL three-row block; data via Tasks 1–5. ✓
- **ÜRETİCİ FİRMALAR / GARANTİ / TESLİM YERİ / ÖDEME / KDV / NOTLAR blocks** → Task 6 footer table. ✓ (TESLİMAT from the sample has no dedicated snapshot column; folded into NOTLAR/Teslim Yeri — acceptable, fields are hand-editable. Note for Phase 3/4 if a dedicated TESLİMAT field is wanted.)
- **MÜŞTERİ ONAYI / BTS SORUMLUSU signature row** → Task 6 `.sig` row. ✓
- **`escapeHtmlMultiline` for multi-line footer** → used in footer + multi-line item descriptions. ✓
- **Carried follow-ups:** order totals recompute → Task 5; type-aware rows → Task 8. ✓
- **Type consistency:** `OrderItemForPdf` (template) vs `OrderHeaderForPdf` (template) vs `StfItem` (snapshot/editor) — the export route (Task 7) maps Prisma `Decimal` via `Number(...)` and `=== null ? null : Number(...)` for the nullable section-discount, matching the template's `number | null`. ✓
