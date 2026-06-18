# STF (Sipariş Teyit Formu) — Phase 1: Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a won (KAZANILDI) quote into an editable Sipariş Teyit Formu: snapshot the quote's header/line-items/footer into the order, number it `STF-6000`+, edit every field, and update the Siparişler list columns.

**Architecture:** Extend the existing `OrderConfirmation` model (additive columns + new `OrderItem` snapshot table + self-relation for future revisions). Pure, unit-tested helpers do the numbering, footer-default mapping, and quote→STF snapshot. The existing `POST /api/orders` is extended to build the snapshot in its existing serializable + P2002-retry transaction. A new `PUT /api/orders/[id]` persists edits (STF only — never the quote). The order detail page becomes an editable STF form; the Siparişler list gains Proje Adı / Teklif Adı / Yıl and drops Teslim Tarihi.

**Tech Stack:** Next.js 16 App Router, Prisma + Postgres 16, Zod, Vitest, React (client components), Tailwind. Turkish UI strings.

**Spec:** `docs/superpowers/specs/2026-06-18-stf-siparis-teyit-formu-design.md`

**Conventions (match this repo):**
- Migrations are **hand-authored** (local DB has dev drift). Apply with `psql`, record with `prisma migrate resolve --applied`, then `prisma generate`. Postgres bin: `/opt/homebrew/opt/postgresql@16/bin`. Local DB URL: `postgresql://ilkerkadirozturk@localhost:5432/btsteklif`.
- **Verify TypeScript with `rm -f tsconfig.tsbuildinfo && npx tsc --noEmit`** — incremental cache gives false "clean". Pre-existing errors live only in `src/**/*.test.ts` Prisma-mock files and `.next/`; your source files must add zero new errors.
- Tests: `npx vitest run <path>`. Full suite baseline is **620 passing**.
- Commit after each task. Branch: `feature/client-notes-jun2026` (continue on it).

---

## File Structure

- **Create** `prisma/migrations/20260618000000_add_stf_fields/migration.sql` — additive schema.
- **Modify** `prisma/schema.prisma` — `OrderConfirmation` fields + self-relation; new `OrderItem` model; back-relations on `Quote`/`Company`/`User`.
- **Create** `src/lib/stf/stf-number.ts` (+ `.test.ts`) — `nextStfNumber(existingNumbers)`.
- **Create** `src/lib/stf/stf-footer-defaults.ts` (+ `.test.ts`) — map commercial terms → footer fields.
- **Create** `src/lib/stf/stf-snapshot.ts` (+ `.test.ts`) — build STF header + `OrderItem[]` create-data from a quote.
- **Create** `src/lib/validations/stf.ts` — Zod schema for the editable STF (header + footer + items).
- **Modify** `src/app/api/orders/route.ts` — POST uses the snapshot builder + `nextStfNumber`.
- **Create** `src/app/api/orders/[id]/items/route.ts` — not needed; items saved via the STF PUT (see Task 8).
- **Modify** `src/app/api/orders/[id]/route.ts` — GET returns items + new fields; add `PUT` to persist edits.
- **Create** `src/components/orders/StfEditor.tsx` — the editable STF form (client component).
- **Modify** `src/app/(dashboard)/orders/[id]/page.tsx` — render `StfEditor`.
- **Modify** `src/app/(dashboard)/quotes/[id]/page.tsx` — "STF Oluştur" button on KAZANILDI quotes.
- **Modify** `src/app/(dashboard)/orders/page.tsx` — list columns: + Proje Adı, + Teklif Adı, + Yıl, − Teslim Tarihi.

---

## Task 1: Additive schema — OrderConfirmation fields + OrderItem table

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260618000000_add_stf_fields/migration.sql`

- [ ] **Step 1: Extend `OrderConfirmation` in `prisma/schema.prisma`**

Replace the existing `model OrderConfirmation { ... }` block with (keeps all existing columns, adds the new ones + relations):

```prisma
model OrderConfirmation {
  id            String      @id @default(cuid())
  orderNumber   String      @unique
  quoteId       String
  quote         Quote       @relation(fields: [quoteId], references: [id])
  companyId     String
  company       Company     @relation(fields: [companyId], references: [id], onDelete: Restrict)
  status        OrderStatus @default(HAZIRLANIYOR)
  notes         String?
  deliveryDate  DateTime?
  createdById   String
  createdBy     User        @relation("OrderCreatedBy", fields: [createdById], references: [id])
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  // ── Revision chain (STF-####-R#) ──
  parentOrderId String?
  parentOrder   OrderConfirmation?  @relation("OrderRevisions", fields: [parentOrderId], references: [id])
  revisions     OrderConfirmation[] @relation("OrderRevisions")
  revisionNo    Int                 @default(0)

  // ── Snapshotted, editable header (all nullable) ──
  customerName     String?
  customerAddress  String?
  customerPhone    String?
  customerTaxInfo  String?
  projectName      String?
  quoteNo          String?
  refNo            String?
  formDate         DateTime?
  siparisNo        String?
  currency         String    @default("TRY")
  discountTotal    Decimal   @default(0) @db.Decimal(12, 2)
  grandTotal       Decimal   @default(0) @db.Decimal(12, 2)

  // ── Footer blocks (editable text) ──
  manufacturers        String?
  warranty             String?
  deliveryPlace        String?
  paymentTerms         String?
  vatNote              String?
  customerApprovalName String?
  btsResponsibleName   String?

  items         OrderItem[]

  @@index([quoteId])
  @@index([companyId])
  @@index([parentOrderId])
}

model OrderItem {
  id           String        @id @default(cuid())
  orderId      String
  order        OrderConfirmation @relation(fields: [orderId], references: [id], onDelete: Cascade)
  sortOrder    Int
  itemType     QuoteItemType @default(PRODUCT)
  pozNo        String?
  code         String?
  brand        String?
  model        String?
  description  String        @default("")
  quantity     Decimal       @default(0) @db.Decimal(12, 2)
  unit         String        @default("Adet")
  unitPrice    Decimal       @default(0) @db.Decimal(12, 2)
  totalPrice   Decimal       @default(0) @db.Decimal(12, 2)
  priceLabel   String?
  parentItemId String?
  discountPct  Decimal       @default(0) @db.Decimal(5, 2)
  sectionNote  String?
  createdAt    DateTime      @default(now())

  @@index([orderId])
}
```

Add the back-relation lines to the existing models (find each `model` block and add the one line):
- In `model Quote { ... }`: already has `orderConfirmations OrderConfirmation[]` — leave as is.
- `model Company` already has `orderConfirmations OrderConfirmation[]` — leave as is.
- `OrderItem` needs no back-relation elsewhere.

- [ ] **Step 2: Write the migration SQL**

Create `prisma/migrations/20260618000000_add_stf_fields/migration.sql`:

```sql
-- STF (Sipariş Teyit Formu) — additive. No existing column changes type/nullability.

-- OrderConfirmation: revision chain
ALTER TABLE "OrderConfirmation" ADD COLUMN "parentOrderId" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "revisionNo" INTEGER NOT NULL DEFAULT 0;

-- OrderConfirmation: snapshot header
ALTER TABLE "OrderConfirmation" ADD COLUMN "customerName" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "customerAddress" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "customerPhone" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "customerTaxInfo" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "projectName" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "quoteNo" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "refNo" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "formDate" TIMESTAMP(3);
ALTER TABLE "OrderConfirmation" ADD COLUMN "siparisNo" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'TRY';
ALTER TABLE "OrderConfirmation" ADD COLUMN "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "OrderConfirmation" ADD COLUMN "grandTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- OrderConfirmation: footer blocks
ALTER TABLE "OrderConfirmation" ADD COLUMN "manufacturers" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "warranty" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "deliveryPlace" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "paymentTerms" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "vatNote" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "customerApprovalName" TEXT;
ALTER TABLE "OrderConfirmation" ADD COLUMN "btsResponsibleName" TEXT;

-- OrderItem
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "itemType" "QuoteItemType" NOT NULL DEFAULT 'PRODUCT',
    "pozNo" TEXT,
    "code" TEXT,
    "brand" TEXT,
    "model" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'Adet',
    "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "priceLabel" TEXT,
    "parentItemId" TEXT,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderConfirmation_parentOrderId_idx" ON "OrderConfirmation"("parentOrderId");

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OrderConfirmation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderConfirmation" ADD CONSTRAINT "OrderConfirmation_parentOrderId_fkey" FOREIGN KEY ("parentOrderId") REFERENCES "OrderConfirmation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 3: Apply locally, record, regenerate**

```bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
psql "postgresql://ilkerkadirozturk@localhost:5432/btsteklif" -v ON_ERROR_STOP=1 -f prisma/migrations/20260618000000_add_stf_fields/migration.sql
npx prisma migrate resolve --applied 20260618000000_add_stf_fields
npx prisma generate
```
Expected: all `ALTER TABLE`/`CREATE TABLE` succeed; "Migration ... marked as applied"; client regenerated.

- [ ] **Step 4: Verify schema in DB**

```bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
psql "postgresql://ilkerkadirozturk@localhost:5432/btsteklif" -t -c "SELECT to_regclass('public.\"OrderItem\"'); SELECT count(*) FROM information_schema.columns WHERE table_name='OrderConfirmation' AND column_name IN ('quoteNo','refNo','siparisNo','manufacturers','revisionNo');"
```
Expected: `OrderItem` non-null; count = 5.

- [ ] **Step 5: Typecheck + commit**

```bash
rm -f tsconfig.tsbuildinfo && npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "\.next/" | grep -iv "\.test\.ts" || echo "no new errors"
git add prisma/schema.prisma prisma/migrations/20260618000000_add_stf_fields
git commit -m "STF (1/9): additive schema — OrderConfirmation fields + OrderItem"
```
Expected: "no new errors".

---

## Task 2: STF numbering helper

**Files:**
- Create: `src/lib/stf/stf-number.ts`
- Test: `src/lib/stf/stf-number.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/stf/stf-number.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { nextStfNumber } from './stf-number';

describe('nextStfNumber', () => {
  it('starts at STF-6000 when there are no STFs', () => {
    expect(nextStfNumber([])).toBe('STF-6000');
  });

  it('ignores legacy SIP-* numbers', () => {
    expect(nextStfNumber(['SIP-2026-0001', 'SIP-2026-0002'])).toBe('STF-6000');
  });

  it('increments from the highest base STF number', () => {
    expect(nextStfNumber(['STF-6000', 'STF-6001'])).toBe('STF-6002');
  });

  it('ignores revision suffixes when computing the next base number', () => {
    expect(nextStfNumber(['STF-6000', 'STF-6000-R1', 'STF-6001'])).toBe('STF-6002');
  });

  it('handles unsorted input', () => {
    expect(nextStfNumber(['STF-6005', 'STF-6001'])).toBe('STF-6006');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/stf/stf-number.test.ts`
Expected: FAIL ("nextStfNumber is not a function" / module not found).

- [ ] **Step 3: Write the implementation**

`src/lib/stf/stf-number.ts`:
```typescript
/**
 * STF numbering: base numbers start at 6000 and increment (STF-6000, STF-6001, …).
 * Revision suffixes (STF-6001-R1) are NOT part of the base sequence.
 * Legacy SIP-* order numbers are ignored.
 */
const STF_BASE_START = 6000;

export function nextStfNumber(existingNumbers: string[]): string {
  let maxSeq = STF_BASE_START - 1;
  for (const n of existingNumbers) {
    const m = /^STF-(\d+)$/.exec(n.trim()); // base numbers only (no -R#)
    if (m) {
      const seq = parseInt(m[1], 10);
      if (seq > maxSeq) maxSeq = seq;
    }
  }
  return `STF-${maxSeq + 1}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/stf/stf-number.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stf/stf-number.ts src/lib/stf/stf-number.test.ts
git commit -m "STF (2/9): nextStfNumber helper"
```

---

## Task 3: Footer-defaults mapper (commercial terms → footer fields)

**Files:**
- Create: `src/lib/stf/stf-footer-defaults.ts`
- Test: `src/lib/stf/stf-footer-defaults.test.ts`

Commercial-term categories in this repo are: `payment`, `delivery`, `warranty`, `vat`, `teslim_yeri` (see `CommercialTermTemplate`). Map them to STF footer fields. When multiple terms share a category, join their values with newlines.

- [ ] **Step 1: Write the failing test**

`src/lib/stf/stf-footer-defaults.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { footerDefaultsFromTerms } from './stf-footer-defaults';

describe('footerDefaultsFromTerms', () => {
  it('maps known categories to footer fields', () => {
    const r = footerDefaultsFromTerms([
      { category: 'payment', value: '30 gün' },
      { category: 'delivery', value: 'BTS depo' },
      { category: 'warranty', value: '2 yıl' },
      { category: 'vat', value: 'KDV dahil değildir' },
      { category: 'teslim_yeri', value: 'İstanbul' },
    ]);
    expect(r.paymentTerms).toBe('30 gün');
    expect(r.warranty).toBe('2 yıl');
    expect(r.vatNote).toBe('KDV dahil değildir');
    // teslim_yeri preferred over delivery for deliveryPlace
    expect(r.deliveryPlace).toBe('İstanbul');
  });

  it('falls back to delivery when teslim_yeri is absent', () => {
    const r = footerDefaultsFromTerms([{ category: 'delivery', value: 'BTS depo' }]);
    expect(r.deliveryPlace).toBe('BTS depo');
  });

  it('joins multiple terms in the same category with newlines', () => {
    const r = footerDefaultsFromTerms([
      { category: 'payment', value: 'A' },
      { category: 'payment', value: 'B' },
    ]);
    expect(r.paymentTerms).toBe('A\nB');
  });

  it('returns all-null for empty input', () => {
    expect(footerDefaultsFromTerms([])).toEqual({
      paymentTerms: null, deliveryPlace: null, warranty: null, vatNote: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/stf/stf-footer-defaults.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

`src/lib/stf/stf-footer-defaults.ts`:
```typescript
export interface TermLike {
  category: string;
  value: string;
}

export interface FooterDefaults {
  paymentTerms: string | null;
  deliveryPlace: string | null;
  warranty: string | null;
  vatNote: string | null;
}

function join(terms: TermLike[], category: string): string | null {
  const vals = terms.filter((t) => t.category === category).map((t) => t.value);
  return vals.length ? vals.join('\n') : null;
}

/**
 * Derive STF footer defaults from a quote's commercial terms.
 * deliveryPlace prefers the `teslim_yeri` category, falling back to `delivery`.
 */
export function footerDefaultsFromTerms(terms: TermLike[]): FooterDefaults {
  return {
    paymentTerms: join(terms, 'payment'),
    deliveryPlace: join(terms, 'teslim_yeri') ?? join(terms, 'delivery'),
    warranty: join(terms, 'warranty'),
    vatNote: join(terms, 'vat'),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/stf/stf-footer-defaults.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stf/stf-footer-defaults.ts src/lib/stf/stf-footer-defaults.test.ts
git commit -m "STF (3/9): footer-defaults from commercial terms"
```

---

## Task 4: Snapshot builder (quote → STF header + OrderItem create-data)

**Files:**
- Create: `src/lib/stf/stf-snapshot.ts`
- Test: `src/lib/stf/stf-snapshot.test.ts`

This is a pure mapping function: given a quote (with company, project, items, commercialTerms) it returns `{ header, items }` where `header` is the `OrderConfirmation` create-data subset and `items` is `OrderItem` create-data (without `orderId`, set by the route). Poz numbers: only PRODUCT/SET/CUSTOM rows get a sequential poz; HEADER/NOTE/SUBTOTAL/GRAND_TOTAL get `pozNo: null`.

- [ ] **Step 1: Write the failing test**

`src/lib/stf/stf-snapshot.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildStfSnapshot, type QuoteForSnapshot } from './stf-snapshot';

const quote: QuoteForSnapshot = {
  quoteNumber: 'CC0335-YAS',
  refNo: '219C',
  currency: 'EUR',
  discountTotal: 50,
  grandTotal: 3005,
  company: { name: 'Deva A.Ş.', address: 'İstanbul', phone: '0212', taxNumber: '123' },
  project: { name: 'Deva API' },
  items: [
    { itemType: 'HEADER', sortOrder: 1, code: null, brand: null, model: null, description: 'TRAFO 1', quantity: 0, unit: 'Adet', unitPrice: 0, totalPrice: 0, priceLabel: null, parentItemId: null, discountPct: 0 },
    { itemType: 'PRODUCT', sortOrder: 2, code: 'MKII-OP', brand: 'Fyreye', model: 'MKII', description: 'Optik Dedektör', quantity: 1, unit: 'Adet', unitPrice: 31.4, totalPrice: 31.4, priceLabel: null, parentItemId: null, discountPct: 0 },
    { itemType: 'CUSTOM', sortOrder: 3, code: null, brand: null, model: null, description: 'Montaj', quantity: 1, unit: 'Adet', unitPrice: 0, totalPrice: 0, priceLabel: 'tarafınızca sağlanacaktır', parentItemId: null, discountPct: 0 },
  ],
  commercialTerms: [{ category: 'payment', value: '30 gün' }],
};

describe('buildStfSnapshot', () => {
  it('copies header fields, splitting quoteNo and refNo', () => {
    const { header } = buildStfSnapshot(quote, new Date('2026-06-18'));
    expect(header.quoteNo).toBe('CC0335-YAS');
    expect(header.refNo).toBe('219C');
    expect(header.customerName).toBe('Deva A.Ş.');
    expect(header.customerAddress).toBe('İstanbul');
    expect(header.projectName).toBe('Deva API');
    expect(header.currency).toBe('EUR');
    expect(header.grandTotal).toBe(3005);
    expect(header.formDate).toEqual(new Date('2026-06-18'));
    expect(header.paymentTerms).toBe('30 gün'); // footer default applied
  });

  it('copies items preserving type/order and assigns poz only to priced rows', () => {
    const { items } = buildStfSnapshot(quote, new Date('2026-06-18'));
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ itemType: 'HEADER', pozNo: null, description: 'TRAFO 1' });
    expect(items[1]).toMatchObject({ itemType: 'PRODUCT', pozNo: '1', code: 'MKII-OP' });
    expect(items[2]).toMatchObject({ itemType: 'CUSTOM', pozNo: '2', priceLabel: 'tarafınızca sağlanacaktır' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/stf/stf-snapshot.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

`src/lib/stf/stf-snapshot.ts`:
```typescript
import { footerDefaultsFromTerms, type TermLike } from './stf-footer-defaults';

export interface QuoteItemForSnapshot {
  itemType: string;
  sortOrder: number;
  code: string | null;
  brand: string | null;
  model: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  priceLabel: string | null;
  parentItemId: string | null;
  discountPct: number;
}

export interface QuoteForSnapshot {
  quoteNumber: string;
  refNo: string | null;
  currency: string;
  discountTotal: number;
  grandTotal: number;
  company: { name: string; address: string | null; phone: string | null; taxNumber: string | null };
  project: { name: string } | null;
  items: QuoteItemForSnapshot[];
  commercialTerms: TermLike[];
}

const POZ_TYPES = new Set(['PRODUCT', 'SET', 'CUSTOM']);

export interface StfHeader {
  customerName: string;
  customerAddress: string | null;
  customerPhone: string | null;
  customerTaxInfo: string | null;
  projectName: string | null;
  quoteNo: string;
  refNo: string | null;
  formDate: Date;
  currency: string;
  discountTotal: number;
  grandTotal: number;
  paymentTerms: string | null;
  deliveryPlace: string | null;
  warranty: string | null;
  vatNote: string | null;
}

export interface StfItem {
  sortOrder: number;
  itemType: string;
  pozNo: string | null;
  code: string | null;
  brand: string | null;
  model: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  priceLabel: string | null;
  parentItemId: string | null;
  discountPct: number;
}

export function buildStfSnapshot(
  quote: QuoteForSnapshot,
  formDate: Date
): { header: StfHeader; items: StfItem[] } {
  const footer = footerDefaultsFromTerms(quote.commercialTerms);

  const header: StfHeader = {
    customerName: quote.company.name,
    customerAddress: quote.company.address,
    customerPhone: quote.company.phone,
    customerTaxInfo: quote.company.taxNumber,
    projectName: quote.project?.name ?? null,
    quoteNo: quote.quoteNumber,
    refNo: quote.refNo,
    formDate,
    currency: quote.currency,
    discountTotal: quote.discountTotal,
    grandTotal: quote.grandTotal,
    ...footer,
  };

  let poz = 0;
  const items: StfItem[] = quote.items
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((it) => {
      // Only top-level priced rows get a poz number.
      const getsPoz = POZ_TYPES.has(it.itemType) && !it.parentItemId;
      if (getsPoz) poz += 1;
      return {
        sortOrder: it.sortOrder,
        itemType: it.itemType,
        pozNo: getsPoz ? String(poz) : null,
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
      };
    });

  return { header, items };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/stf/stf-snapshot.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/stf/stf-snapshot.ts src/lib/stf/stf-snapshot.test.ts
git commit -m "STF (4/9): quote→STF snapshot builder"
```

---

## Task 5: Extend POST /api/orders to snapshot a quote into an STF

**Files:**
- Modify: `src/app/api/orders/route.ts`

The route already loads the quote, checks `KAZANILDI`, and runs a serializable + P2002-retry transaction that dedups and creates the order. We change three things: (a) load the quote with the fields the snapshot needs; (b) number with `nextStfNumber`; (c) create the order with the snapshot header + nested `OrderItem` rows.

- [ ] **Step 1: Add imports at the top of `src/app/api/orders/route.ts`**

```typescript
import { nextStfNumber } from '@/lib/stf/stf-number';
import { buildStfSnapshot } from '@/lib/stf/stf-snapshot';
```

- [ ] **Step 2: Replace `getNextOrderNumber` usage with STF numbering**

Find the `getNextOrderNumber` function and replace its body so it returns the STF number from existing numbers:

```typescript
async function getNextOrderNumber(tx: Prisma.TransactionClient): Promise<string> {
  const all = await tx.orderConfirmation.findMany({ select: { orderNumber: true } });
  return nextStfNumber(all.map((o) => o.orderNumber));
}
```

- [ ] **Step 3: Expand the quote load (immutable check) to include snapshot data**

Replace the `db.quote.findUnique({ where: { id: quoteId }, select: { id, companyId, quoteNumber, status } })` call with:

```typescript
const quote = await db.quote.findUnique({
  where: { id: quoteId },
  include: {
    company: { select: { name: true, address: true, phone: true, taxNumber: true } },
    project: { select: { name: true } },
    items: { orderBy: { sortOrder: 'asc' } },
    commercialTerms: { select: { category: true, value: true } },
  },
});
```
(Keep the existing `if (!quote)` 404 and the `quote.status !== 'KAZANILDI'` 400 checks immediately after.)

- [ ] **Step 4: Build the snapshot and create the order with nested items**

Inside the transaction, replace the `tx.orderConfirmation.create({ data: { orderNumber, quoteId, companyId, status, notes, deliveryDate, createdById }, include: {...} })` call with:

```typescript
const orderNumber = await getNextOrderNumber(tx);
const { header, items } = buildStfSnapshot(
  {
    quoteNumber: quote.quoteNumber,
    refNo: quote.refNo,
    currency: quote.currency,
    discountTotal: Number(quote.discountTotal),
    grandTotal: Number(quote.grandTotal),
    company: quote.company,
    project: quote.project,
    items: quote.items.map((i) => ({
      itemType: i.itemType,
      sortOrder: i.sortOrder,
      code: i.code,
      brand: i.brand,
      model: i.model,
      description: i.description,
      quantity: Number(i.quantity),
      unit: i.unit,
      unitPrice: Number(i.unitPrice),
      totalPrice: Number(i.totalPrice),
      priceLabel: i.priceLabel,
      parentItemId: i.parentItemId,
      discountPct: Number(i.discountPct),
    })),
    commercialTerms: quote.commercialTerms,
  },
  new Date()
);

return tx.orderConfirmation.create({
  data: {
    orderNumber,
    quoteId: quote.id,
    companyId: quote.companyId,
    status: 'HAZIRLANIYOR',
    notes: notes || null,
    deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
    createdById: user.id,
    ...header,
    items: { create: items },
  },
  include: {
    company: { select: { id: true, name: true } },
    createdBy: { select: { id: true, fullName: true } },
  },
});
```

Note: `companyId` still comes from `quote.companyId` — keep that field on the quote `include` by adding `companyId` is already a scalar returned by default. (Prisma returns all scalars; `companyId` is present.)

- [ ] **Step 5: Typecheck**

Run: `rm -f tsconfig.tsbuildinfo && npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "\.next/" | grep -iv "\.test\.ts" || echo "no new errors"`
Expected: "no new errors".

- [ ] **Step 6: Run the existing order route tests (they mock Prisma — confirm still green or update mocks)**

Run: `npx vitest run src/app/api/orders/route.test.ts`
Expected: if failures are only due to the new `findMany`/nested-create mock expectations, update the test's Prisma mock to provide `orderConfirmation.findMany` returning `[]` and `quote.findUnique` returning the included shape. Keep assertions on a successful create. If the suite is heavily mock-coupled, adjust minimally so it passes.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/orders/route.ts src/app/api/orders/route.test.ts
git commit -m "STF (5/9): POST /api/orders snapshots a won quote into an STF"
```

---

## Task 6: "STF Oluştur" button on KAZANILDI quote detail

**Files:**
- Modify: `src/app/(dashboard)/quotes/[id]/page.tsx`

- [ ] **Step 1: Add a handler near the other action handlers (e.g. after `handleExportExcel`)**

```typescript
const [isCreatingStf, setIsCreatingStf] = useState(false);
const handleCreateStf = async () => {
  setIsCreatingStf(true);
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quoteId: id }),
    });
    const data = await res.json().catch(() => null);
    if (res.status === 409 && data?.orderId) {
      // Already exists — open it.
      router.push(`/orders/${data.orderId}`);
      return;
    }
    if (!res.ok) throw new Error(data?.error || 'STF oluşturulamadı');
    router.push(`/orders/${data.order.id}`);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'STF oluşturulurken bir hata oluştu');
  } finally {
    setIsCreatingStf(false);
  }
};
```

- [ ] **Step 2: Ensure the DUPLICATE branch returns `orderId`**

In `src/app/api/orders/route.ts`, find the `DUPLICATE_ORDER` catch branch (returns 409). Change the dedup throw to include the existing id and return it. Where the transaction does the dedup `findFirst`, capture and rethrow:
```typescript
if (existingOrder) {
  throw new Error('DUPLICATE_ORDER:' + existingOrder.id);
}
```
and in the catch:
```typescript
if (error instanceof Error && error.message.startsWith('DUPLICATE_ORDER')) {
  const existingId = error.message.split(':')[1] || null;
  return NextResponse.json(
    { error: 'Bu teklif için zaten bir STF var', orderId: existingId },
    { status: 409 }
  );
}
```

- [ ] **Step 3: Render the button (only when status === 'KAZANILDI')**

In the header action row (near the "Revizyon Oluştur" / Kopyala buttons), add:
```tsx
{quote.status === 'KAZANILDI' && (
  <Button variant="secondary" onClick={handleCreateStf} isLoading={isCreatingStf}>
    <ShoppingCart className="w-4 h-4" />
    STF Oluştur
  </Button>
)}
```
(`ShoppingCart` is already imported in this file.)

- [ ] **Step 4: Typecheck + manual smoke**

Run: `rm -f tsconfig.tsbuildinfo && npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "\.next/" | grep -iv "\.test\.ts" || echo "no new errors"`
Expected: "no new errors". Then in the browser, open a KAZANILDI quote, click STF Oluştur → redirected to `/orders/<id>`; clicking again on the same quote → redirected to the same STF (409 path).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(dashboard)/quotes/[id]/page.tsx" src/app/api/orders/route.ts
git commit -m "STF (6/9): STF Oluştur button on won quotes"
```

---

## Task 7: GET + PUT /api/orders/[id] — return items + persist edits

**Files:**
- Modify: `src/app/api/orders/[id]/route.ts`
- Create: `src/lib/validations/stf.ts`

- [ ] **Step 1: Zod schema for the editable STF**

`src/lib/validations/stf.ts`:
```typescript
import { z } from 'zod';

const nullableStr = z.string().nullish().transform((v) => (v && v.trim() !== '' ? v : null));

export const stfItemSchema = z.object({
  id: z.string().optional(),
  sortOrder: z.number(),
  itemType: z.enum(['PRODUCT', 'HEADER', 'NOTE', 'SUBTOTAL', 'GRAND_TOTAL', 'SET', 'CUSTOM']),
  pozNo: nullableStr,
  code: nullableStr,
  brand: nullableStr,
  model: nullableStr,
  description: z.string().default(''),
  quantity: z.coerce.number().default(0),
  unit: z.string().default('Adet'),
  unitPrice: z.coerce.number().default(0),
  totalPrice: z.coerce.number().default(0),
  priceLabel: nullableStr,
  parentItemId: nullableStr,
  discountPct: z.coerce.number().default(0),
  sectionNote: nullableStr,
});

export const stfUpdateSchema = z.object({
  customerName: nullableStr,
  customerAddress: nullableStr,
  customerPhone: nullableStr,
  customerTaxInfo: nullableStr,
  projectName: nullableStr,
  quoteNo: nullableStr,
  refNo: nullableStr,
  formDate: z.string().nullish(),
  siparisNo: nullableStr,
  currency: z.string().default('TRY'),
  discountTotal: z.coerce.number().default(0),
  grandTotal: z.coerce.number().default(0),
  manufacturers: nullableStr,
  warranty: nullableStr,
  deliveryPlace: nullableStr,
  paymentTerms: nullableStr,
  vatNote: nullableStr,
  notes: nullableStr,
  customerApprovalName: nullableStr,
  btsResponsibleName: nullableStr,
  status: z.enum(['HAZIRLANIYOR', 'ONAYLANDI', 'GONDERILDI', 'TAMAMLANDI', 'IPTAL']).optional(),
  items: z.array(stfItemSchema),
});

export type StfUpdateInput = z.infer<typeof stfUpdateSchema>;
```

- [ ] **Step 2: Extend GET in `src/app/api/orders/[id]/route.ts` to include items**

Find the `db.orderConfirmation.findUnique(...)` in GET and add `items: { orderBy: { sortOrder: 'asc' } }` to its `include`, alongside the existing `quote`/`company`/`createdBy` includes. Also include `quote: { select: { id, quoteNumber, subject, project: { select: { name } } } }` if not already, so the editor can show context.

- [ ] **Step 3: Add the PUT handler**

Append to `src/app/api/orders/[id]/route.ts`:
```typescript
import { stfUpdateSchema } from '@/lib/validations/stf';
import type { ZodError } from 'zod';

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const data = stfUpdateSchema.parse(body);

    const existing = await db.orderConfirmation.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: 'STF bulunamadı' }, { status: 404 });

    const { items, formDate, status, ...header } = data;

    // Replace items wholesale (simplest correct approach for a snapshot form):
    // delete existing, re-create from payload in one transaction with the header update.
    const order = await db.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      return tx.orderConfirmation.update({
        where: { id },
        data: {
          ...header,
          formDate: formDate ? new Date(formDate) : null,
          ...(status ? { status } : {}),
          items: {
            create: items.map((it) => ({
              sortOrder: it.sortOrder,
              itemType: it.itemType,
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
            })),
          },
        },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Geçersiz veri', details: (error as ZodError).issues }, { status: 400 });
    }
    console.error('STF PUT error:', error);
    return NextResponse.json({ error: 'STF kaydedilirken bir hata oluştu' }, { status: 500 });
  }
}
```
(Confirm `NextRequest`, `RouteParams`, `getSession`, `db` are already imported in this file; add any missing import.)

- [ ] **Step 4: Typecheck**

Run: `rm -f tsconfig.tsbuildinfo && npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "\.next/" | grep -iv "\.test\.ts" || echo "no new errors"`
Expected: "no new errors".

- [ ] **Step 5: Commit**

```bash
git add src/app/api/orders/[id]/route.ts src/lib/validations/stf.ts
git commit -m "STF (7/9): GET items + PUT to persist STF edits"
```

---

## Task 8: Editable STF screen (`StfEditor`)

**Files:**
- Create: `src/components/orders/StfEditor.tsx`
- Modify: `src/app/(dashboard)/orders/[id]/page.tsx`

The editor is a client component that receives the STF id, fetches `GET /api/orders/[id]`, holds header/footer/items in state, and PUTs on save. Keep it focused: header card (inputs), items table (editable rows; `totalPrice` auto = `quantity * unitPrice` unless a `priceLabel` is set), footer card (textareas), Save button. Reuse `Input`, `Select`, `Button` from `@/components/ui` and `escapeHtmlMultiline` is not needed here (PDF is Phase 2).

- [ ] **Step 1: Create `src/components/orders/StfEditor.tsx`**

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button, Input } from '@/components/ui';

interface StfItem {
  id?: string;
  sortOrder: number;
  itemType: string;
  pozNo: string | null;
  code: string | null;
  brand: string | null;
  model: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  priceLabel: string | null;
  parentItemId: string | null;
  discountPct: number;
  sectionNote: string | null;
}

interface StfData {
  id: string;
  orderNumber: string;
  customerName: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  customerTaxInfo: string | null;
  projectName: string | null;
  quoteNo: string | null;
  refNo: string | null;
  formDate: string | null;
  siparisNo: string | null;
  currency: string;
  discountTotal: number;
  grandTotal: number;
  manufacturers: string | null;
  warranty: string | null;
  deliveryPlace: string | null;
  paymentTerms: string | null;
  vatNote: string | null;
  notes: string | null;
  customerApprovalName: string | null;
  btsResponsibleName: string | null;
  status: string;
  items: StfItem[];
}

const HEADER_FIELDS: { key: keyof StfData; label: string }[] = [
  { key: 'customerName', label: 'Firma Adı / İlgili Kişi' },
  { key: 'customerAddress', label: 'Firma Adresi' },
  { key: 'customerPhone', label: 'Firma Telefon' },
  { key: 'customerTaxInfo', label: 'V.D. / Vergi No' },
  { key: 'projectName', label: 'Proje Adı' },
  { key: 'quoteNo', label: 'Teklif No' },
  { key: 'refNo', label: 'Ref No' },
  { key: 'siparisNo', label: 'Sipariş No' },
];

const FOOTER_FIELDS: [keyof StfData, string][] = [
  ['manufacturers', 'Üretici Firmalar'],
  ['warranty', 'Garanti'],
  ['deliveryPlace', 'Teslim Yeri'],
  ['paymentTerms', 'Ödeme'],
  ['vatNote', 'KDV'],
  ['notes', 'Notlar'],
  ['customerApprovalName', 'Müşteri Onayı'],
  ['btsResponsibleName', 'BTS Sorumlusu'],
];

export function StfEditor({ stfId }: { stfId: string }) {
  const [stf, setStf] = useState<StfData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const fetchStf = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${stfId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'STF yüklenemedi');
      setStf({ ...data.order, items: data.order.items ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata');
    } finally {
      setIsLoading(false);
    }
  }, [stfId]);

  useEffect(() => { fetchStf(); }, [fetchStf]);

  const setField = (key: keyof StfData, value: string) =>
    setStf((p) => (p ? { ...p, [key]: value } : p));

  const setItem = (idx: number, patch: Partial<StfItem>) =>
    setStf((p) => {
      if (!p) return p;
      const items = p.items.map((it, i) => {
        if (i !== idx) return it;
        const next = { ...it, ...patch };
        if (!next.priceLabel) next.totalPrice = Number(next.quantity) * Number(next.unitPrice);
        return next;
      });
      return { ...p, items };
    });

  const handleSave = async () => {
    if (!stf) return;
    setIsSaving(true); setError(''); setSaved(false);
    try {
      const res = await fetch(`/api/orders/${stfId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stf),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kaydedilemedi');
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <div className="p-6 text-sm text-primary-500">Yükleniyor...</div>;
  if (!stf) return <div className="p-6 text-sm text-red-600">{error || 'STF bulunamadı'}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-primary-900">{stf.orderNumber}</h1>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-700">Kaydedildi ✓</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
          <Button onClick={handleSave} isLoading={isSaving}>Kaydet</Button>
        </div>
      </div>

      {/* Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-primary-200 p-4">
        {HEADER_FIELDS.map((f) => (
          <Input
            key={f.key as string}
            label={f.label}
            value={(stf[f.key] as string | null) ?? ''}
            onChange={(e) => setField(f.key, e.target.value)}
          />
        ))}
        <Input
          label="Tarih"
          type="date"
          value={stf.formDate ? stf.formDate.split('T')[0] : ''}
          onChange={(e) => setField('formDate', e.target.value)}
        />
        <Input label="Para Birimi" value={stf.currency} onChange={(e) => setField('currency', e.target.value)} />
      </div>

      {/* Items */}
      <div className="rounded-lg border border-primary-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-primary-50 text-xs uppercase text-primary-600">
            <tr>
              <th className="px-2 py-2 text-left">Poz</th>
              <th className="px-2 py-2 text-left">Ürün Adı</th>
              <th className="px-2 py-2 text-right">Miktar</th>
              <th className="px-2 py-2 text-left">Birim</th>
              <th className="px-2 py-2 text-right">Birim Fiyat</th>
              <th className="px-2 py-2 text-right">Toplam</th>
              <th className="px-2 py-2 text-left">Satın Alma Notu</th>
            </tr>
          </thead>
          <tbody>
            {stf.items.map((it, idx) => (
              <tr key={it.id ?? idx} className="border-t border-primary-100">
                <td className="px-2 py-1">{it.pozNo ?? ''}</td>
                <td className="px-2 py-1">
                  <input className="w-full bg-transparent" value={it.description}
                    onChange={(e) => setItem(idx, { description: e.target.value })} />
                </td>
                <td className="px-2 py-1 text-right">
                  <input className="w-16 bg-transparent text-right" type="number" value={it.quantity}
                    onChange={(e) => setItem(idx, { quantity: Number(e.target.value) })} />
                </td>
                <td className="px-2 py-1">
                  <input className="w-16 bg-transparent" value={it.unit}
                    onChange={(e) => setItem(idx, { unit: e.target.value })} />
                </td>
                <td className="px-2 py-1 text-right">
                  <input className="w-24 bg-transparent text-right" type="number" value={it.unitPrice}
                    onChange={(e) => setItem(idx, { unitPrice: Number(e.target.value) })} />
                </td>
                <td className="px-2 py-1 text-right tabular-nums">
                  {it.priceLabel ? it.priceLabel : Number(it.totalPrice).toFixed(2)}
                </td>
                <td className="px-2 py-1">
                  <input className="w-full bg-transparent" value={it.sectionNote ?? ''}
                    onChange={(e) => setItem(idx, { sectionNote: e.target.value })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer blocks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-primary-200 p-4">
        {FOOTER_FIELDS.map(([key, label]) => (
          <div key={key as string} className="space-y-1">
            <label className="text-xs font-medium text-primary-700">{label}</label>
            <textarea
              rows={2}
              className="w-full px-2 py-1 border border-primary-300 rounded text-sm"
              value={(stf[key] as string | null) ?? ''}
              onChange={(e) => setField(key, e.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
```

Note: `notes` is an existing scalar column on `OrderConfirmation`, so the GET include returns it by default; it is already in `StfData` above and in `stfUpdateSchema` (Task 7), so the Notlar textarea round-trips.

- [ ] **Step 2: Render it in the order detail page**

Replace the body of `src/app/(dashboard)/orders/[id]/page.tsx` so it renders the editor. Minimal version:
```tsx
'use client';
import { use } from 'react';
import { StfEditor } from '@/components/orders/StfEditor';

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <div className="p-4"><StfEditor stfId={id} /></div>;
}
```
(If the existing page has layout/breadcrumb wrappers worth keeping, keep them and swap only the inner content for `<StfEditor stfId={id} />`.)

- [ ] **Step 3: Typecheck + smoke test**

Run: `rm -f tsconfig.tsbuildinfo && npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "\.next/" | grep -iv "\.test\.ts" || echo "no new errors"`
Expected: "no new errors". Then in the browser: create an STF from a won quote, edit a field + an item qty (watch Toplam update), Save → reload → values persisted.

- [ ] **Step 4: Commit**

```bash
git add src/components/orders/StfEditor.tsx "src/app/(dashboard)/orders/[id]/page.tsx" src/lib/validations/stf.ts
git commit -m "STF (8/9): editable STF detail screen"
```

---

## Task 9: Siparişler list columns (+ Proje Adı, Teklif Adı, Yıl; − Teslim Tarihi)

**Files:**
- Modify: `src/app/(dashboard)/orders/page.tsx`
- Modify: `src/app/api/orders/route.ts` (GET include needs project + subject)

- [ ] **Step 1: Ensure the list GET returns project name + quote subject**

In `src/app/api/orders/route.ts` GET `findMany`, expand the `quote` include to:
```typescript
quote: { select: { id: true, quoteNumber: true, subject: true, project: { select: { name: true } } } },
```
(Keep `company` and `createdBy` includes.)

- [ ] **Step 2: Update the table header in `src/app/(dashboard)/orders/page.tsx`**

Replace the `<thead>` columns so the order is: Sipariş No, Firma, **Proje Adı**, **Teklif Adı**, Tutar, Durum, **Tarih**, **Yıl**, İşlemler. Remove the `<th>Teslim Tarihi</th>`. Example header cells to add (place Proje Adı + Teklif Adı after Firma):
```tsx
<th>Proje Adı</th>
<th>Teklif Adı</th>
```
and after the Tarih column:
```tsx
<th>Yıl</th>
```

- [ ] **Step 3: Update the table body row cells to match**

For each order row, render (after the Firma cell):
```tsx
<td className="text-xs text-primary-600">{order.quote?.project?.name || (order.projectName ?? '-')}</td>
<td className="text-xs text-primary-600">{order.quote?.subject || '-'}</td>
```
Remove the Teslim Tarihi `<td>` (the one rendering `order.deliveryDate`). After the Tarih cell add:
```tsx
<td className="text-xs tabular-nums">{new Date(order.formDate ?? order.createdAt).getFullYear()}</td>
```
Adjust the empty-state `colSpan` to the new column count (count the `<th>`s).

- [ ] **Step 4: Typecheck + smoke**

Run: `rm -f tsconfig.tsbuildinfo && npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "\.next/" | grep -iv "\.test\.ts" || echo "no new errors"`
Expected: "no new errors". Browser: Siparişler list shows Proje Adı / Teklif Adı / Yıl, no Teslim Tarihi.

- [ ] **Step 5: Full suite + commit**

```bash
npx vitest run 2>&1 | tail -3
git add "src/app/(dashboard)/orders/page.tsx" src/app/api/orders/route.ts
git commit -m "STF (9/9): Siparişler list columns (Proje/Teklif Adı/Yıl, drop Teslim Tarihi)"
```
Expected: suite green (baseline 620 + new STF helper tests).

---

## Done criteria (Phase 1)

- A KAZANILDI quote shows "STF Oluştur" → creates `STF-6000`+ with a full snapshot (header + items + footer defaults).
- The STF detail screen edits every field; Save persists to the STF only (quote untouched).
- Siparişler list shows Proje Adı / Teklif Adı / Yıl and no Teslim Tarihi.
- Migration is additive; existing `SIP-*` orders untouched; full suite green; no new source type errors.

**Next phases (separate plans):** Phase 2 PDF output (`order-template.ts`), Phase 3 internal Excel export, Phase 4 revisions (Revizyon Oluştur + R# numbering + version panel).
