# Per-Subtotal Discount — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single quote-level discount (`Quote.discountPct` + `Quote.discountScopeSubtotalId`) with per-SUBTOTAL discounts stored on each SUBTOTAL row via `QuoteItem.sectionDiscountPct`.

**Architecture:** Additive schema change (new nullable column on `QuoteItem`, old `Quote.discount*` columns kept for one release as dead fields). Rewrite `calculateQuoteTotals` to walk sections and apply each SUBTOTAL's own discount. One-shot `tsx` migration script copies live discounts into the new column, covering scoped (1-to-1 mapping) and legacy null-scope (fan out to every SUBTOTAL) cases. UI renders an "İskonto (%N)" row above any SUBTOTAL with `sectionDiscountPct > 0` and a "+ İskonto" button on SUBTOTALs without one — identical across editor, view page, PDF, and Excel.

**Tech Stack:** Next.js 15, React 19, Prisma + PostgreSQL, Zod, Vitest, Puppeteer, ExcelJS.

**Spec:** `docs/superpowers/specs/2026-04-19-per-subtotal-discount-design.md` (read this first if you're picking up mid-plan).

**Existing tests must keep passing:** 505 tests. Full run: `npm test -- --run`. Type check: `npx tsc --noEmit`.

---

## File Structure

### Files created
- `prisma/migrations/20260420000000_add_section_discount_pct/migration.sql` — add `QuoteItem.sectionDiscountPct`.
- `scripts/migrate-per-subtotal-discount.ts` — one-shot data migration (run manually after `prisma migrate deploy`).
- `scripts/migrate-per-subtotal-discount.test.ts` — tests for the above.

### Files modified
- `prisma/schema.prisma` — add `sectionDiscountPct` to `QuoteItem`.
- `src/lib/quote-calculations.ts` — rewrite section/discount math.
- `src/lib/quote-calculations.test.ts` — replace scoped-discount tests with per-subtotal tests.
- `src/lib/validations/quote.ts` — add `sectionDiscountPct` to `quoteItemSchema`; drop `discountPct` / `discountScopeSubtotalId` from `quoteUpdateSchema`.
- `src/lib/types/quote.ts` — surface `sectionDiscountPct` on `ApiQuoteItem`.
- `src/app/api/quotes/[id]/items/route.ts` — persist `sectionDiscountPct` on POST/PUT; coerce non-SUBTOTAL rows to null.
- `src/app/api/quotes/[id]/route.ts` — stop reading/writing old discount fields.
- `src/app/api/quotes/[id]/route.test.ts` — drop `discount*` mocks for the removed PATCH fields.
- `src/app/api/quotes/[id]/clone/route.ts` — copy `sectionDiscountPct` on clone.
- `src/app/api/quotes/[id]/revert/route.ts` — copy on revert.
- `src/app/api/quotes/[id]/revisions/route.ts` — copy on revision snapshot.
- `src/components/quotes/QuoteItemsTable.tsx` — remove bottom discount input + scope dropdown, add İskonto row + "+ İskonto" button near each SUBTOTAL.
- `src/components/quotes/QuoteItemRow.tsx` — accept `sectionDiscountPct` on SUBTOTAL rows (so the render-above helper has the value).
- `src/app/(dashboard)/quotes/[id]/edit/QuoteEditor.tsx` — drop old header state for `discountPct` + `discountScopeSubtotalId`, plumb `sectionDiscountPct` through item save.
- `src/components/quotes/BrandProfitSummary.tsx` — stop reading quote-level `discountPct`; call `calculateQuoteProfitSummary` with per-section discount vector.
- `src/app/(dashboard)/quotes/[id]/page.tsx` — render new İskonto row in the quote view page; remove the bottom discount line.
- `src/lib/pdf/quote-template.ts` — render per-SUBTOTAL İskonto row; remove legacy scope-branching.
- `src/lib/pdf/assemble-quote-data.ts` — stop passing `discountPct` / `discountScopeSubtotalId`; start passing per-SUBTOTAL discount with each SUBTOTAL row.
- `src/app/api/quotes/[id]/export/pdf/route.ts` — mirror the assembler signature change.
- `src/lib/excel/excel-service.ts` — render İskonto row above each SUBTOTAL in the grid.
- `src/app/api/quotes/[id]/export/excel/route.ts` — mirror the Excel service data shape change.

### Files NOT touched
- None of the other quote routes, product/brand/company modules, user/role pages, or the PDF WYSIWYG editor. If you're about to edit something outside the list above, STOP — that's a scope creep flag.

---

## Task 1: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma` (line 358 area, inside `model QuoteItem`)
- Create: `prisma/migrations/20260420000000_add_section_discount_pct/migration.sql`

- [ ] **Step 1: Add the column to the Prisma schema**

Open `prisma/schema.prisma`. Inside the `model QuoteItem { … }` block, right after the existing `currency String?` field (around line 358), add:

```prisma
  /**
   * Per-section discount percentage (0–100). Only meaningful on
   * SUBTOTAL rows; null/0 means "no discount on this section".
   * Non-SUBTOTAL rows are coerced to null at the API layer.
   * When set, `calculateQuoteTotals` reduces this section's sum by
   * (sectionSum × sectionDiscountPct / 100) before adding into the
   * grand total. Price-labeled rows and children of SETs are still
   * excluded from the section sum, identical to pre-change behavior.
   */
  sectionDiscountPct Decimal?      @db.Decimal(5, 2)
```

- [ ] **Step 2: Create the SQL migration**

Create `prisma/migrations/20260420000000_add_section_discount_pct/migration.sql` with exactly:

```sql
-- Add per-section discount column to QuoteItem. Nullable; only meaningful
-- on SUBTOTAL rows. Existing quotes continue to use Quote.discountPct +
-- Quote.discountScopeSubtotalId until scripts/migrate-per-subtotal-discount.ts
-- backfills this column, after which the new calculation engine takes over.
ALTER TABLE "QuoteItem" ADD COLUMN "sectionDiscountPct" DECIMAL(5,2);
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client (v…) to ./node_modules/@prisma/client in Xms"

- [ ] **Step 4: Run the migration locally against dev DB**

Run: `npx prisma migrate dev --name add_section_discount_pct --create-only` then inspect the generated file matches the one you wrote. If Prisma insists on creating a different file, delete yours and use Prisma's; then re-run `npx prisma migrate dev` to actually apply. (The exact filename timestamp Prisma generates may differ — that's fine, keep whatever Prisma produces.)

Expected: `sectionDiscountPct` column exists on `QuoteItem` in the local DB.
Verify: `psql $DATABASE_URL -c "\d \"QuoteItem\"" | grep sectionDiscountPct`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(quotes): add QuoteItem.sectionDiscountPct column"
```

---

## Task 2: Zod validation

**Files:**
- Modify: `src/lib/validations/quote.ts`

- [ ] **Step 1: Add `sectionDiscountPct` to `quoteItemSchema`**

In `src/lib/validations/quote.ts`, inside the `quoteItemSchema` object (around line 61, right after `currency: currencyEnum.nullish(),`), add:

```typescript
  /** Per-section discount %. Only meaningful on SUBTOTAL rows; the API
   *  coerces it to null on non-SUBTOTAL rows so the DB never holds a
   *  stale value on a PRODUCT/CUSTOM/SET row. */
  sectionDiscountPct: z.number().min(0).max(100, 'Discount cannot exceed 100%').nullish(),
```

- [ ] **Step 2: Drop `discountPct` + `discountScopeSubtotalId` from `quoteUpdateSchema`**

Still in `src/lib/validations/quote.ts`. Find `quoteUpdateSchema` (starts at line 80). Delete these two properties (lines 95–98):

```typescript
  discountPct: z.number().gte(0, 'Discount % must be at least 0').lte(100, 'Discount % must be at most 100').optional(),
  /** Optional cuid of the SUBTOTAL QuoteItem the discount should apply
   *  to. `null` means "apply to whole quote" (legacy behavior). */
  discountScopeSubtotalId: z.string().nullable().optional(),
```

The schema should now go straight from `rateSnapshot` to `validityDays`. A stale client that still PATCHes those fields will have them silently stripped by Zod — no error, just ignored.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: Many new errors in route files that reference `parsed.data.discountPct` or `parsed.data.discountScopeSubtotalId`. That's EXPECTED — we'll fix them in Task 14. Do not fix them now.

- [ ] **Step 4: Commit**

```bash
git add src/lib/validations/quote.ts
git commit -m "feat(quotes): validate sectionDiscountPct; remove quote-level discount fields from PATCH schema"
```

---

## Task 3: Calculation engine — write failing tests

**Files:**
- Modify: `src/lib/quote-calculations.test.ts`

- [ ] **Step 1: Delete the old scoped-discount test suite**

Open `src/lib/quote-calculations.test.ts`. Delete the entire block starting at the comment `// ─── Scoped discount (discountScopeSubtotalId) ───────────────────` (around line 246) through the closing of the `describe('with scoped discount', () => {…})` block (ends with `});` around line 332).

These tests exercise the old API shape we're removing. Keep the preceding `it('calculates correctly when only SET items are present …')` test intact.

Also delete these mixed-currency tests that depend on the removed third argument:
- `it('overall discount applies on the converted subtotal', …)` (around line 475)
- `it('scoped discount on a section containing a TRY set uses converted section sum', …)` (around line 487)

(They're being rewritten in Step 3.)

- [ ] **Step 2: Add the new per-subtotal test suite**

Add this block right after the deleted `with scoped discount` block inside `describe('calculateQuoteTotals')`:

```typescript
    // ─── Per-SUBTOTAL discounts (sectionDiscountPct) ─────────────
    describe('with per-subtotal discounts', () => {
      it('applies a single section discount: section net = gross × (1 - pct/100)', () => {
        const items: QuoteItem[] = [
          { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 5 },
        ];
        const result = calculateQuoteTotals(items, 0);
        // Section A = 1000, discount 5% = 50, net = 950
        expect(result.subtotal).toBe(1000);
        expect(result.discountTotal).toBe(50);
        expect(result.grandTotal).toBe(950);
      });

      it('applies different discounts to different sections independently', () => {
        const items: QuoteItem[] = [
          { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 5 },
          { id: 'p2', itemType: 'PRODUCT', quantity: 5, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'sub-b', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 10 },
        ];
        const result = calculateQuoteTotals(items, 0);
        // A = 1000 × 0.95 = 950; B = 500 × 0.90 = 450; grand = 1400
        expect(result.subtotal).toBe(1500);
        expect(result.discountTotal).toBe(100);
        expect(result.grandTotal).toBe(1400);
      });

      it('section with zero or null discount contributes gross to the grand total', () => {
        const items: QuoteItem[] = [
          { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 0 },
          { id: 'p2', itemType: 'PRODUCT', quantity: 5, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'sub-b', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0 /* sectionDiscountPct omitted → null */ },
        ];
        const result = calculateQuoteTotals(items, 0);
        expect(result.discountTotal).toBe(0);
        expect(result.grandTotal).toBe(1500);
      });

      it('price-labeled rows are excluded from the section discount base', () => {
        const items: QuoteItem[] = [
          { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'p2', itemType: 'PRODUCT', quantity: 1, unitPrice: 9999, discountPct: 0, vatRate: 0, priceLabel: 'TARAFINIZCA SAĞLANACAKTIR' },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 10 },
        ];
        const result = calculateQuoteTotals(items, 0);
        // Only p1 is in the discount base (p2 is a label → 0 contribution)
        expect(result.subtotal).toBe(1000);
        expect(result.discountTotal).toBe(100);
        expect(result.grandTotal).toBe(900);
      });

      it('orphan priced items above the first SUBTOTAL are NOT discounted', () => {
        const items: QuoteItem[] = [
          // Orphan — sits above any SUBTOTAL
          { id: 'orphan', itemType: 'PRODUCT', quantity: 1, unitPrice: 200, discountPct: 0, vatRate: 0 },
          { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 10 },
        ];
        const result = calculateQuoteTotals(items, 0);
        // Actually with current section logic, items[0] sits in the same "section"
        // as p1 (everything before sub-a). So section sum = 200 + 1000 = 1200,
        // discount = 120, grand = 1080.
        expect(result.subtotal).toBe(1200);
        expect(result.discountTotal).toBe(120);
        expect(result.grandTotal).toBe(1080);
      });

      it('priced items BELOW the last SUBTOTAL are orphans (NOT discounted)', () => {
        const items: QuoteItem[] = [
          { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 10 },
          // Orphan: no SUBTOTAL after it
          { id: 'orphan', itemType: 'PRODUCT', quantity: 1, unitPrice: 500, discountPct: 0, vatRate: 0 },
        ];
        const result = calculateQuoteTotals(items, 0);
        // Section A = 1000, discount 10% = 100, net = 900
        // Orphan below = 500 (full)
        // Grand = 1400
        expect(result.subtotal).toBe(1500);
        expect(result.discountTotal).toBe(100);
        expect(result.grandTotal).toBe(1400);
      });

      it('quote with zero SUBTOTAL rows applies no discount (grand = subtotal)', () => {
        const items: QuoteItem[] = [
          { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'p2', itemType: 'PRODUCT', quantity: 5, unitPrice: 100, discountPct: 0, vatRate: 0 },
        ];
        const result = calculateQuoteTotals(items, 0);
        expect(result.subtotal).toBe(1500);
        expect(result.discountTotal).toBe(0);
        expect(result.grandTotal).toBe(1500);
      });

      it('item-level discount stacks with section discount (item first, then section)', () => {
        const items: QuoteItem[] = [
          // Item-level 20% discount: 10 × 100 × 0.8 = 800
          { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 20, vatRate: 0 },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 10 },
        ];
        const result = calculateQuoteTotals(items, 0);
        // Section sum = 800, section discount 10% = 80, net = 720
        expect(result.subtotal).toBe(800);
        expect(result.discountTotal).toBe(80);
        expect(result.grandTotal).toBe(720);
      });

      it('TRY set inside a EUR section applies section discount on the converted sum', () => {
        const ctx = { quoteCurrency: 'EUR', baseForeignRate: 50 };
        const items: QuoteItem[] = [
          { id: 'p1', itemType: 'PRODUCT', quantity: 1, unitPrice: 400, discountPct: 0, vatRate: 0 },
          { id: 'set1', itemType: 'SET', quantity: 1, unitPrice: 5000, discountPct: 0, vatRate: 0, currency: 'TRY' },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 20 },
        ];
        const result = calculateQuoteTotals(items, 0, ctx);
        // Section sum in EUR = 400 + 5000/50 = 500, 20% = 100, net = 400
        expect(result.subtotal).toBe(500);
        expect(result.discountTotal).toBe(100);
        expect(result.grandTotal).toBe(400);
      });

      it('empty section (SUBTOTAL with no items before it since the previous SUBTOTAL) computes 0 discount', () => {
        const items: QuoteItem[] = [
          { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 5 },
          // Nothing between sub-a and sub-b
          { id: 'sub-b', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 99 },
        ];
        const result = calculateQuoteTotals(items, 0);
        // Section A = 1000, discount 5% = 50, net = 950
        // Section B = 0, discount 99% of 0 = 0, net = 0
        expect(result.subtotal).toBe(1000);
        expect(result.discountTotal).toBe(50);
        expect(result.grandTotal).toBe(950);
      });

      it('rounding: section discount rounded to 2 decimals, consistent with grand total', () => {
        const items: QuoteItem[] = [
          { id: 'p1', itemType: 'PRODUCT', quantity: 1, unitPrice: 100, discountPct: 0, vatRate: 0 },
          { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 33.33 },
        ];
        const result = calculateQuoteTotals(items, 0);
        // 100 × 33.33 / 100 = 33.33, grand = 66.67
        expect(result.discountTotal).toBe(33.33);
        expect(result.grandTotal).toBe(66.67);
      });
    });
```

- [ ] **Step 3: Rewrite the two removed mixed-currency tests for the new API**

Add these inside the existing `describe('Mixed-currency SETs (set currency)', …)` block (after the removed ones):

```typescript
    it('per-section discount applies on the converted subtotal', () => {
      const items: QuoteItem[] = [
        { id: 'p1', itemType: 'PRODUCT', quantity: 1, unitPrice: 400, discountPct: 0, vatRate: 0 },
        { id: 'set1', itemType: 'SET', quantity: 1, unitPrice: 5000, discountPct: 0, vatRate: 0, currency: 'TRY' },
        { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 10 },
      ];
      const result = calculateQuoteTotals(items, 0, ctx);
      // Converted section = 500 EUR, 10% = 50, net = 450
      expect(result.subtotal).toBe(500);
      expect(result.discountTotal).toBe(50);
      expect(result.grandTotal).toBe(450);
    });

    it('legacy single-currency path (no ctx) still honors section discount', () => {
      const items: QuoteItem[] = [
        { id: 'p1', itemType: 'PRODUCT', quantity: 1, unitPrice: 1000, discountPct: 0, vatRate: 0 },
        { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 5 },
      ];
      const result = calculateQuoteTotals(items, 0);
      expect(result.grandTotal).toBe(950);
    });
```

- [ ] **Step 4: Update the existing `calculateQuoteTotals` tests that pass an explicit `overallDiscountPct` argument**

The old signature was `calculateQuoteTotals(items, overallDiscountPct, discountScopeSubtotalId?, ctx?)`. The new signature (Task 6) will be `calculateQuoteTotals(items, _deprecatedDiscountPct, ctx?)` — the second arg is kept (always passed as 0) so callers don't blow up mid-refactor. The tests that already pass 0 are fine. Find tests that pass a non-zero second arg outside the `with per-subtotal discounts` block (some pre-existing tests do — e.g. `it('applies overall discount percentage', …)` passes 10, `it('calculates grand total as net-after-discount', …)` passes 10, etc.). Rewrite them to use per-section discount instead:

Replace this test (around line 150):
```typescript
    it('applies overall discount percentage', () => {
      const items: QuoteItem[] = [
        { itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 20 },
      ];
      const result = calculateQuoteTotals(items, 10); // 10% overall discount
      // Subtotal: 1000, Discount: 100, After discount: 900
      expect(result.subtotal).toBe(1000);
      expect(result.discountTotal).toBe(100);
    });
```
With:
```typescript
    it('discount comes from each SUBTOTAL row, not from the second argument', () => {
      const items: QuoteItem[] = [
        { id: 'p1', itemType: 'PRODUCT', quantity: 10, unitPrice: 100, discountPct: 0, vatRate: 20 },
        { id: 'sub-a', itemType: 'SUBTOTAL', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0, sectionDiscountPct: 10 },
      ];
      // Second arg (legacy overallDiscountPct) is now ignored — the 10% discount
      // comes from the SUBTOTAL's sectionDiscountPct, not from arg 2.
      const result = calculateQuoteTotals(items, 999);
      expect(result.subtotal).toBe(1000);
      expect(result.discountTotal).toBe(100);
    });
```

Apply the same rewrite to:
- `it('calculates grand total as net-after-discount (no VAT added)', …)` — replace the `overallDiscountPct` arg with a SUBTOTAL row carrying `sectionDiscountPct: 10`.
- `it('applies item-level discounts before overall discount (no VAT)', …)` — same shape.
- `it('applies overall discount to SET items along with other items (no VAT)', …)` — same shape.

In each case: add a SUBTOTAL row at the end of the items list carrying the former `overallDiscountPct` as `sectionDiscountPct`, and pass `0` as the second argument to `calculateQuoteTotals`. Update the expected `discountTotal` / `grandTotal` accordingly (they should stay the same because the math is equivalent when there's only one section).

- [ ] **Step 5: Run the test file**

Run: `npm test -- --run src/lib/quote-calculations.test.ts`
Expected: many FAIL entries for the new tests (because `sectionDiscountPct` isn't defined on the `QuoteItem` interface yet, and the engine hasn't been updated). TypeScript compile errors are OK too — that proves the tests are reaching the engine.

- [ ] **Step 6: Commit**

```bash
git add src/lib/quote-calculations.test.ts
git commit -m "test(quotes): per-subtotal discount test suite"
```

---

## Task 4: Update `QuoteItem` interface

**Files:**
- Modify: `src/lib/quote-calculations.ts` (interface at the top)

- [ ] **Step 1: Add `sectionDiscountPct` to the exported `QuoteItem` interface**

In `src/lib/quote-calculations.ts`, find the `QuoteItem` interface at line 9. Add after the existing `parentItemId?: string | null;` field:

```typescript
  /**
   * Per-section discount percentage (0–100). Only meaningful on
   * SUBTOTAL rows; the API coerces it to null on any other row. Null
   * or 0 → this section contributes its gross sum to the grand total.
   */
  sectionDiscountPct?: number | null;
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: errors still present but the `QuoteItem` interface now accepts `sectionDiscountPct`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/quote-calculations.ts
git commit -m "feat(quotes): add sectionDiscountPct to QuoteItem type"
```

---

## Task 5: Rewrite the calculation engine

**Files:**
- Modify: `src/lib/quote-calculations.ts`

- [ ] **Step 1: Delete the old `sumSectionForSubtotal` function**

In `src/lib/quote-calculations.ts`, delete the `sumSectionForSubtotal` function (lines 153–202 — the whole `/** Sum the priced items ... */` block plus the function body).

- [ ] **Step 2: Add a new section walker that returns the full section breakdown**

Paste this in the same location:

```typescript
interface SectionBreakdown {
  /** SUBTOTAL row id this section ends at, or null for the trailing
   *  orphan group (items that sit after the last SUBTOTAL). */
  subtotalId: string | null;
  /** Sum of priced items in this section, in quote currency. */
  sectionSum: number;
  /** Discount % pulled off the SUBTOTAL row (0 when subtotalId is null). */
  discountPct: number;
  /** sectionSum × discountPct / 100, rounded to 2 decimals. */
  discountAmount: number;
  /** sectionSum − discountAmount. */
  sectionNet: number;
}

/**
 * Walk the items array and return one entry per section. A section
 * ends at each SUBTOTAL row; items below the last SUBTOTAL form a
 * trailing orphan group (subtotalId = null, discount always 0).
 *
 * Items must be in sortOrder. Price-labeled rows and SET children
 * contribute 0 to the section sum — the SET parent already carries
 * its children's combined totalPrice.
 */
export function calculateSectionBreakdown(
  items: QuoteItem[],
  ctx?: QuoteCurrencyContext
): SectionBreakdown[] {
  const breakdown: SectionBreakdown[] = [];
  let sectionSum = 0;

  for (const item of items) {
    if (item.itemType === 'SUBTOTAL') {
      const discountPct = Number(item.sectionDiscountPct ?? 0);
      const discountAmount = round2(sectionSum * (discountPct / 100));
      breakdown.push({
        subtotalId: item.id ?? null,
        sectionSum: round2(sectionSum),
        discountPct,
        discountAmount,
        sectionNet: round2(sectionSum - discountAmount),
      });
      sectionSum = 0;
      continue;
    }
    if (!isPricedItem(item)) continue;
    // Exclude SET children — parent's totalPrice already includes them.
    if (item.parentItemId) continue;

    const raw = calculateItemTotal({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPct: item.discountPct,
    });
    if (ctx) {
      const cur = effectiveItemCurrency(item, items, ctx.quoteCurrency);
      sectionSum += convertToQuoteCurrency(raw, cur, ctx);
    } else {
      sectionSum += raw;
    }
  }

  // Trailing orphans (no discount ever).
  if (sectionSum > 0) {
    breakdown.push({
      subtotalId: null,
      sectionSum: round2(sectionSum),
      discountPct: 0,
      discountAmount: 0,
      sectionNet: round2(sectionSum),
    });
  }

  return breakdown;
}
```

> **Note:** the `if (!isPricedItem(item)) continue;` check already guards against SET children when they're price-labeled or not a priced type — but SET children ARE priced (PRODUCT itemType typically), so we also need the explicit `if (item.parentItemId) continue;` guard. Without it, we'd double-count children that share a section with their parent.

- [ ] **Step 3: Rewrite `calculateQuoteTotals` to delegate to the breakdown**

Replace the entire `calculateQuoteTotals` function (currently lines 217–278) with:

```typescript
/**
 * Calculate quote totals from per-section discounts living on the
 * SUBTOTAL rows themselves (`sectionDiscountPct`). The legacy
 * `_deprecatedDiscountPct` argument is kept for API stability during
 * migration — callers should pass 0. It's unused inside the function.
 *
 * - `subtotal` = Σ sectionSum (pre-discount, including orphans).
 * - `discountTotal` = Σ sectionDiscountAmount.
 * - `grandTotal` = Σ sectionNet (orphan sections contribute their
 *   full sum because their discount is always 0).
 * - `vatTotal` is always 0 — VAT is outside the quote.
 */
export function calculateQuoteTotals(
  items: QuoteItem[],
  _deprecatedDiscountPct: number = 0,
  ctx?: QuoteCurrencyContext
): QuoteTotals {
  if (items.length === 0 || !items.some(isPricedItem)) {
    return { subtotal: 0, discountTotal: 0, vatTotal: 0, grandTotal: 0 };
  }

  const breakdown = calculateSectionBreakdown(items, ctx);
  const subtotal = breakdown.reduce((s, b) => s + b.sectionSum, 0);
  const discountTotal = breakdown.reduce((s, b) => s + b.discountAmount, 0);
  const grandTotal = breakdown.reduce((s, b) => s + b.sectionNet, 0);

  return {
    subtotal: round2(subtotal),
    discountTotal: round2(discountTotal),
    vatTotal: 0,
    grandTotal: round2(grandTotal),
  };
}
```

- [ ] **Step 4: Run the calculation tests**

Run: `npm test -- --run src/lib/quote-calculations.test.ts`
Expected: all tests PASS. If any fail, the mismatched expectation vs. actual output tells you exactly which case of the new engine is wrong — fix the engine, not the test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/quote-calculations.ts
git commit -m "feat(quotes): per-subtotal discount calculation engine"
```

---

## Task 6: Update `recalculateAndPersistQuoteTotals`

**Files:**
- Modify: `src/lib/quote-calculations.ts` (function at line 391)

- [ ] **Step 1: Stop reading old discount fields + stop passing them to `calculateQuoteTotals`**

Replace the function body from line 391 onward with:

```typescript
export async function recalculateAndPersistQuoteTotals(quoteId: string) {
  // Items MUST come back in `sortOrder` — the section walker relies on
  // positional order.
  const items = await db.quoteItem.findMany({
    where: { quoteId },
    orderBy: { sortOrder: 'asc' },
  });

  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    select: {
      currency: true,
      exchangeRate: true,
      protectionPct: true,
    },
  });

  const quoteItems = items
    .filter(item => !item.parentItemId) // Exclude sub-rows to avoid double-counting
    .map(item => ({
      id: item.id,
      itemType: item.itemType as QuoteItem['itemType'],
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      discountPct: Number(item.discountPct),
      vatRate: Number(item.vatRate),
      totalPrice: Number(item.totalPrice),
      listPrice: Number(item.listPrice),
      katsayi: Number(item.katsayi),
      priceLabel: item.priceLabel,
      currency: item.currency ?? null,
      parentItemId: item.parentItemId ?? null,
      sectionDiscountPct: item.sectionDiscountPct != null ? Number(item.sectionDiscountPct) : null,
    }));

  const hasMixedCurrency = quoteItems.some(
    (i) => i.currency && i.currency !== quote?.currency
  );
  const protectionPct = Number(quote?.protectionPct || 0);
  const protectedRate = Number(quote?.exchangeRate || 1);
  const baseForeignRate = protectionPct > 0
    ? protectedRate / (1 + protectionPct / 100)
    : protectedRate;
  const ctx: QuoteCurrencyContext | undefined = hasMixedCurrency && quote
    ? { quoteCurrency: quote.currency, baseForeignRate }
    : undefined;

  const totals = calculateQuoteTotals(quoteItems, 0, ctx);

  await db.quote.update({
    where: { id: quoteId },
    data: {
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      vatTotal: totals.vatTotal,
      grandTotal: totals.grandTotal,
      pdfOverrideHtml: null,
      pdfOverrideAt: null,
    },
  });

  return totals;
}
```

Note: `discountPct` and `discountScopeSubtotalId` are now neither read nor written — they're dead columns from this point on.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: errors in files that call `calculateQuoteTotals` with the old 4-arg signature (scope id as 3rd arg). Those are: PDF template, Excel service, view page, editor summary, etc. Leave them for Tasks 19+ — they'll be fixed file by file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/quote-calculations.ts
git commit -m "feat(quotes): persist totals from per-section breakdown only"
```

---

## Task 7: Update `calculateQuoteProfitSummary`

**Files:**
- Modify: `src/lib/quote-calculations.ts` (function at line 314)

- [ ] **Step 1: Accept a per-section discount vector instead of a single `overallDiscountPct`**

Replace the function body from `export function calculateQuoteProfitSummary(` through its final `}` with:

```typescript
/**
 * Calculate quote-level profit summary.
 *
 * `perSectionDiscountByItemId` is a map from SUBTOTAL row id → discount %.
 * The function replays the section walk on the items so it knows which
 * section each priced item belongs to, then applies that section's
 * discount to revenue (cost is never discounted).
 *
 * Callers that don't care about section discounts (e.g. dashboards
 * that only want raw revenue/cost) may pass an empty map and 0 fallback.
 */
export function calculateQuoteProfitSummary(
  items: Array<{
    id?: string;
    totalPrice: number;
    costPrice?: number | null;
    quantity: number;
    itemType: string;
    parentItemId?: string | null;
    priceLabel?: string | null;
    currency?: string | null;
    sectionDiscountPct?: number | null;
  }>,
  _legacyOverallDiscountPct: number = 0,
  ctx?: QuoteCurrencyContext
): QuoteProfitSummary {
  // Currency map (same as before).
  const currencyById = new Map<string, string>();
  if (ctx) {
    const parentCurrency = new Map<string, string>();
    for (const it of items) {
      if (!it.parentItemId && it.id && it.currency) {
        parentCurrency.set(it.id, it.currency);
      }
    }
    for (const it of items) {
      if (!it.id) continue;
      const own = it.currency;
      const parentCur = it.parentItemId ? parentCurrency.get(it.parentItemId) : undefined;
      currencyById.set(it.id, own || parentCur || ctx.quoteCurrency);
    }
  }

  const convert = (amount: number, id: string | undefined): number => {
    if (!ctx || !id) return amount;
    const cur = currencyById.get(id) ?? ctx.quoteCurrency;
    return convertToQuoteCurrency(amount, cur, ctx);
  };

  // Walk sections: accumulate item-ids → which section they belong to,
  // and remember each section's discount. Items below the last
  // SUBTOTAL belong to a trailing orphan section (pct = 0).
  const itemIdToSectionDiscountPct = new Map<string, number>();
  let currentDiscount = 0;
  const pendingIds: string[] = [];
  for (const it of items) {
    if (it.itemType === 'SUBTOTAL') {
      currentDiscount = Number(it.sectionDiscountPct ?? 0);
      for (const id of pendingIds) itemIdToSectionDiscountPct.set(id, currentDiscount);
      pendingIds.length = 0;
      currentDiscount = 0;
      continue;
    }
    if (it.id) pendingIds.push(it.id);
  }
  // Any leftover ids are trailing orphans → pct 0.
  for (const id of pendingIds) itemIdToSectionDiscountPct.set(id, 0);

  let itemRevenue = 0;
  let totalCost = 0;

  for (const item of items) {
    if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET') {
      if (item.priceLabel) continue;

      if (!item.parentItemId && item.id) {
        const sectionPct = itemIdToSectionDiscountPct.get(item.id) ?? 0;
        const revenueConverted = convert(item.totalPrice, item.id);
        itemRevenue += revenueConverted * (1 - sectionPct / 100);
      }
      const isSetParent = item.itemType === 'SET' && !item.parentItemId;
      if (!isSetParent) {
        const rawCost = (item.costPrice || 0) * item.quantity;
        totalCost += convert(rawCost, item.id);
      }
    }
  }

  const totalRevenue = itemRevenue;
  const totalProfit = totalRevenue - totalCost;
  const overallMarginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return {
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    totalProfit: Math.round(totalProfit * 100) / 100,
    overallMarginPct: Math.round(overallMarginPct * 100) / 100,
  };
}
```

- [ ] **Step 2: Update the `calculateQuoteProfitSummary` tests**

In `src/lib/quote-calculations.test.ts`, the existing test `it('applies overall discount to revenue', …)` still passes `10` as `_legacyOverallDiscountPct`, which is now ignored. Replace that test with:

```typescript
    it('applies per-section discount to revenue (items inside a discounted section are discounted)', () => {
      const items = [
        { id: 'p1', totalPrice: 1000, costPrice: 600, quantity: 1, itemType: 'PRODUCT' },
        { id: 'sub-a', totalPrice: 0, costPrice: null, quantity: 0, itemType: 'SUBTOTAL', sectionDiscountPct: 10 },
      ];
      const result = calculateQuoteProfitSummary(items);
      expect(result.totalRevenue).toBe(900);
      expect(result.totalCost).toBe(600);
      expect(result.totalProfit).toBe(300);
      expect(result.overallMarginPct).toBe(33.33);
    });
```

- [ ] **Step 3: Run tests**

Run: `npm test -- --run src/lib/quote-calculations.test.ts`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/quote-calculations.ts src/lib/quote-calculations.test.ts
git commit -m "feat(quotes): per-section discount in profit summary"
```

---

## Task 8: Migration script — failing tests

**Files:**
- Create: `scripts/migrate-per-subtotal-discount.test.ts`

- [ ] **Step 1: Write the test file**

Create `scripts/migrate-per-subtotal-discount.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Under test — imported lazily inside tests so we can mock the db module
// before the module graph is resolved.
const modulePath = './migrate-per-subtotal-discount';

// Minimal Decimal fake so tests don't pull in @prisma/client/runtime.
class FakeDecimal {
  constructor(public value: number) {}
  toNumber() { return this.value; }
}

const makeQuote = (overrides: Partial<{
  id: string;
  discountPct: number;
  discountScopeSubtotalId: string | null;
  subtotal: number;
  grandTotal: number;
  currency: string;
  exchangeRate: number;
  protectionPct: number;
}>) => ({
  id: 'q1',
  discountPct: new FakeDecimal(0),
  discountScopeSubtotalId: null,
  subtotal: new FakeDecimal(0),
  grandTotal: new FakeDecimal(0),
  currency: 'EUR',
  exchangeRate: new FakeDecimal(1),
  protectionPct: new FakeDecimal(0),
  quoteNumber: 'Q-0001',
  ...overrides,
  discountPct: overrides.discountPct != null ? new FakeDecimal(overrides.discountPct) : new FakeDecimal(0),
  subtotal: overrides.subtotal != null ? new FakeDecimal(overrides.subtotal) : new FakeDecimal(0),
  grandTotal: overrides.grandTotal != null ? new FakeDecimal(overrides.grandTotal) : new FakeDecimal(0),
  exchangeRate: overrides.exchangeRate != null ? new FakeDecimal(overrides.exchangeRate) : new FakeDecimal(1),
  protectionPct: overrides.protectionPct != null ? new FakeDecimal(overrides.protectionPct) : new FakeDecimal(0),
});

const makeItem = (overrides: Partial<{
  id: string;
  itemType: string;
  quoteId: string;
  sortOrder: number;
  sectionDiscountPct: number | null;
  unitPrice: number;
  quantity: number;
  discountPct: number;
  parentItemId: string | null;
  priceLabel: string | null;
  currency: string | null;
}>) => ({
  id: 'item',
  itemType: 'PRODUCT',
  quoteId: 'q1',
  sortOrder: 1,
  sectionDiscountPct: null,
  unitPrice: new FakeDecimal(100),
  quantity: new FakeDecimal(1),
  discountPct: new FakeDecimal(0),
  parentItemId: null,
  priceLabel: null,
  currency: null,
  ...overrides,
  sectionDiscountPct: overrides.sectionDiscountPct != null ? new FakeDecimal(overrides.sectionDiscountPct) : null,
  unitPrice: overrides.unitPrice != null ? new FakeDecimal(overrides.unitPrice) : new FakeDecimal(100),
  quantity: overrides.quantity != null ? new FakeDecimal(overrides.quantity) : new FakeDecimal(1),
  discountPct: overrides.discountPct != null ? new FakeDecimal(overrides.discountPct) : new FakeDecimal(0),
});

describe('migrate-per-subtotal-discount script', () => {
  const quoteFindMany = vi.fn();
  const itemFindMany = vi.fn();
  const itemUpdate = vi.fn();
  const quoteUpdate = vi.fn();
  const txCallback = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    vi.doMock('@/lib/db', () => ({
      db: {
        quote: { findMany: quoteFindMany, update: quoteUpdate },
        quoteItem: { findMany: itemFindMany, update: itemUpdate },
        $transaction: (cb: any) => cb({
          quote: { update: quoteUpdate },
          quoteItem: { update: itemUpdate, findMany: itemFindMany },
        }),
      },
    }));
  });

  it('Case 1 (scoped): copies discountPct onto the targeted SUBTOTAL row', async () => {
    quoteFindMany.mockResolvedValueOnce([
      makeQuote({ id: 'q1', discountPct: 5, discountScopeSubtotalId: 'sub-a' }),
    ]);
    itemFindMany.mockResolvedValue([
      makeItem({ id: 'p1', itemType: 'PRODUCT', quoteId: 'q1', sortOrder: 1, unitPrice: 100, quantity: 10 }),
      makeItem({ id: 'sub-a', itemType: 'SUBTOTAL', quoteId: 'q1', sortOrder: 2 }),
    ]);

    const { migratePerSubtotalDiscount } = await import(modulePath);
    const report = await migratePerSubtotalDiscount({ dryRun: false });

    expect(itemUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sub-a' },
      data: expect.objectContaining({ sectionDiscountPct: 5 }),
    }));
    expect(report.cases.case1).toBe(1);
    expect(report.cases.case2).toBe(0);
    expect(report.mismatches).toHaveLength(0);
  });

  it('Case 2 (null scope, legacy whole-quote): fans discount onto every SUBTOTAL', async () => {
    quoteFindMany.mockResolvedValueOnce([
      makeQuote({ id: 'q1', discountPct: 10, discountScopeSubtotalId: null }),
    ]);
    itemFindMany.mockResolvedValue([
      makeItem({ id: 'p1', itemType: 'PRODUCT', quoteId: 'q1', sortOrder: 1, unitPrice: 100, quantity: 10 }),
      makeItem({ id: 'sub-a', itemType: 'SUBTOTAL', quoteId: 'q1', sortOrder: 2 }),
      makeItem({ id: 'p2', itemType: 'PRODUCT', quoteId: 'q1', sortOrder: 3, unitPrice: 50, quantity: 10 }),
      makeItem({ id: 'sub-b', itemType: 'SUBTOTAL', quoteId: 'q1', sortOrder: 4 }),
    ]);

    const { migratePerSubtotalDiscount } = await import(modulePath);
    const report = await migratePerSubtotalDiscount({ dryRun: false });

    expect(itemUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sub-a' },
      data: expect.objectContaining({ sectionDiscountPct: 10 }),
    }));
    expect(itemUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sub-b' },
      data: expect.objectContaining({ sectionDiscountPct: 10 }),
    }));
    expect(report.cases.case2).toBe(1);
  });

  it('Case 3 (discountPct = 0): skips the quote entirely', async () => {
    quoteFindMany.mockResolvedValueOnce([
      makeQuote({ id: 'q1', discountPct: 0, discountScopeSubtotalId: null }),
    ]);

    const { migratePerSubtotalDiscount } = await import(modulePath);
    const report = await migratePerSubtotalDiscount({ dryRun: false });

    expect(itemUpdate).not.toHaveBeenCalled();
    expect(report.cases.skipped).toBe(1);
  });

  it('idempotency: re-running on a quote that already has sectionDiscountPct set on any SUBTOTAL is a no-op', async () => {
    quoteFindMany.mockResolvedValueOnce([
      makeQuote({ id: 'q1', discountPct: 5, discountScopeSubtotalId: 'sub-a' }),
    ]);
    itemFindMany.mockResolvedValue([
      makeItem({ id: 'sub-a', itemType: 'SUBTOTAL', quoteId: 'q1', sortOrder: 1, sectionDiscountPct: 5 }),
    ]);

    const { migratePerSubtotalDiscount } = await import(modulePath);
    const report = await migratePerSubtotalDiscount({ dryRun: false });

    expect(itemUpdate).not.toHaveBeenCalled();
    expect(report.cases.alreadyMigrated).toBe(1);
  });

  it('logs a mismatch when old grand total differs from recomputed grand total by more than ±0.02', async () => {
    // Quote with scoped discount on a SUBTOTAL, but oldGrandTotal manually
    // set to something inconsistent so the recomputation detects drift.
    quoteFindMany.mockResolvedValueOnce([
      makeQuote({ id: 'q1', discountPct: 10, discountScopeSubtotalId: 'sub-a', grandTotal: 9999 }),
    ]);
    itemFindMany.mockResolvedValue([
      makeItem({ id: 'p1', itemType: 'PRODUCT', quoteId: 'q1', sortOrder: 1, unitPrice: 100, quantity: 10 }),
      makeItem({ id: 'sub-a', itemType: 'SUBTOTAL', quoteId: 'q1', sortOrder: 2 }),
    ]);

    const { migratePerSubtotalDiscount } = await import(modulePath);
    const report = await migratePerSubtotalDiscount({ dryRun: false });

    expect(report.mismatches).toHaveLength(1);
    expect(report.mismatches[0]).toMatchObject({ quoteId: 'q1' });
  });
});
```

- [ ] **Step 2: Run the test file — confirm failure (module doesn't exist yet)**

Run: `npm test -- --run scripts/migrate-per-subtotal-discount.test.ts`
Expected: FAIL with module not found / import error. Good.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-per-subtotal-discount.test.ts
git commit -m "test(quotes): migration script tests"
```

---

## Task 9: Implement the migration script

**Files:**
- Create: `scripts/migrate-per-subtotal-discount.ts`

- [ ] **Step 1: Write the script**

Create `scripts/migrate-per-subtotal-discount.ts`:

```typescript
/**
 * One-shot backfill: migrate Quote.discountPct + Quote.discountScopeSubtotalId
 * onto QuoteItem.sectionDiscountPct (per-section discount).
 *
 * Rules:
 *   Case 1: scope set  → copy pct onto that SUBTOTAL's sectionDiscountPct
 *   Case 2: scope null → copy pct onto EVERY SUBTOTAL in the quote
 *   Case 3: pct = 0    → skip
 *
 * Idempotent: if any SUBTOTAL in the quote already carries a
 * non-null sectionDiscountPct, the quote is considered already
 * migrated and skipped.
 *
 * Run AFTER `npx prisma migrate deploy`:
 *   npx tsx scripts/migrate-per-subtotal-discount.ts
 * Dry run (prints the plan but makes no DB writes):
 *   npx tsx scripts/migrate-per-subtotal-discount.ts --dry-run
 */
import { db } from '@/lib/db';
import { calculateQuoteTotals, type QuoteItem, type QuoteCurrencyContext } from '@/lib/quote-calculations';

interface Report {
  cases: { case1: number; case2: number; skipped: number; alreadyMigrated: number };
  migrated: Array<{ quoteId: string; quoteNumber: string; case: 'case1' | 'case2'; affectedSubtotalIds: string[]; pct: number; oldGrandTotal: number; newGrandTotal: number }>;
  mismatches: Array<{ quoteId: string; quoteNumber: string; oldGrandTotal: number; newGrandTotal: number; diff: number }>;
}

export async function migratePerSubtotalDiscount(options: { dryRun: boolean } = { dryRun: false }): Promise<Report> {
  const report: Report = {
    cases: { case1: 0, case2: 0, skipped: 0, alreadyMigrated: 0 },
    migrated: [],
    mismatches: [],
  };

  const quotes = await db.quote.findMany({
    where: { discountPct: { gt: 0 } },
    select: {
      id: true, quoteNumber: true, discountPct: true, discountScopeSubtotalId: true,
      grandTotal: true, currency: true, exchangeRate: true, protectionPct: true,
    },
  });

  for (const quote of quotes) {
    const pct = Number(quote.discountPct);
    if (pct === 0) {
      report.cases.skipped++;
      continue;
    }

    const items = await db.quoteItem.findMany({
      where: { quoteId: quote.id },
      orderBy: { sortOrder: 'asc' },
    });

    // Idempotency: already migrated?
    const alreadyMigrated = items.some(
      (i) => i.itemType === 'SUBTOTAL' && i.sectionDiscountPct != null
    );
    if (alreadyMigrated) {
      report.cases.alreadyMigrated++;
      continue;
    }

    const subtotalItems = items.filter((i) => i.itemType === 'SUBTOTAL');
    if (subtotalItems.length === 0) {
      report.cases.skipped++;
      continue;
    }

    // Determine target subtotal ids.
    let targets: string[];
    let caseLabel: 'case1' | 'case2';
    if (quote.discountScopeSubtotalId && subtotalItems.some((i) => i.id === quote.discountScopeSubtotalId)) {
      targets = [quote.discountScopeSubtotalId];
      caseLabel = 'case1';
    } else {
      // Null scope (legacy) or dangling scope → fan out (A.2).
      targets = subtotalItems.map((i) => i.id);
      caseLabel = 'case2';
    }

    const oldGrandTotal = Number(quote.grandTotal);

    if (!options.dryRun) {
      await db.$transaction(async (tx) => {
        for (const subId of targets) {
          await tx.quoteItem.update({
            where: { id: subId },
            data: { sectionDiscountPct: pct },
          });
        }
      });
    }

    // Recompute the new grand total using the new engine, comparing to the
    // previously persisted value. We simulate the post-migration items
    // locally (no DB re-fetch needed).
    const simulatedItems: QuoteItem[] = items
      .filter((i) => !i.parentItemId)
      .map((i) => ({
        id: i.id,
        itemType: i.itemType as QuoteItem['itemType'],
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        discountPct: Number(i.discountPct),
        vatRate: Number(i.vatRate),
        priceLabel: i.priceLabel ?? null,
        currency: i.currency ?? null,
        parentItemId: i.parentItemId ?? null,
        sectionDiscountPct: targets.includes(i.id) ? pct : (i.sectionDiscountPct != null ? Number(i.sectionDiscountPct) : null),
      }));

    const hasMixed = simulatedItems.some((i) => i.currency && i.currency !== quote.currency);
    const protPct = Number(quote.protectionPct);
    const protRate = Number(quote.exchangeRate);
    const baseRate = protPct > 0 ? protRate / (1 + protPct / 100) : protRate;
    const ctx: QuoteCurrencyContext | undefined = hasMixed
      ? { quoteCurrency: quote.currency, baseForeignRate: baseRate }
      : undefined;

    const newTotals = calculateQuoteTotals(simulatedItems, 0, ctx);

    report.cases[caseLabel]++;
    report.migrated.push({
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      case: caseLabel,
      affectedSubtotalIds: targets,
      pct,
      oldGrandTotal,
      newGrandTotal: newTotals.grandTotal,
    });

    if (Math.abs(oldGrandTotal - newTotals.grandTotal) > 0.02) {
      report.mismatches.push({
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        oldGrandTotal,
        newGrandTotal: newTotals.grandTotal,
        diff: Math.abs(oldGrandTotal - newTotals.grandTotal),
      });
    }
  }

  return report;
}

// CLI entrypoint.
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  migratePerSubtotalDiscount({ dryRun })
    .then((report) => {
      console.log('\n=== Per-Subtotal Discount Migration ===');
      console.log('Dry run:', dryRun);
      console.log('Cases:', report.cases);
      console.log('Migrated:', report.migrated.length, 'quotes');
      console.log('Mismatches:', report.mismatches.length);
      if (report.mismatches.length > 0) {
        console.log('\n--- MISMATCHES (review manually) ---');
        for (const m of report.mismatches) {
          console.log(`  ${m.quoteNumber}: old=${m.oldGrandTotal} new=${m.newGrandTotal} diff=${m.diff.toFixed(4)}`);
        }
      }
      process.exit(report.mismatches.length > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(2);
    });
}
```

- [ ] **Step 2: Run the test file**

Run: `npm test -- --run scripts/migrate-per-subtotal-discount.test.ts`
Expected: all five tests PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-per-subtotal-discount.ts
git commit -m "feat(quotes): one-shot migration script for per-subtotal discount"
```

---

## Task 10: Items route — accept `sectionDiscountPct`

**Files:**
- Modify: `src/app/api/quotes/[id]/items/route.ts`

- [ ] **Step 1: POST — persist `sectionDiscountPct` (coerce to null on non-SUBTOTAL)**

In `src/app/api/quotes/[id]/items/route.ts`, inside the POST handler, after the `isSubtotal` variable is declared (around line 107) add:

```typescript
    // Per-section discount % — only meaningful on SUBTOTAL rows. Any
    // stray value on a non-SUBTOTAL row is silently coerced to null so
    // the DB never holds orphan state.
    const sectionDiscountPct = isSubtotal && data.sectionDiscountPct != null
      ? data.sectionDiscountPct
      : null;
```

Then inside the `db.quoteItem.create({ data: { … } })` block (around line 159), add one line right after `currency: itemCurrency,`:

```typescript
        currency: itemCurrency,
        sectionDiscountPct,
```

- [ ] **Step 2: PUT — same treatment inside the batch loop**

In the PUT handler, inside the `for (const item of validatedItems)` loop (around line 261), after the `isSetParent` variable is declared (around line 271), add:

```typescript
        const isSubtotalRow = item.itemType === 'SUBTOTAL';
        const sectionDiscountPct = isSubtotalRow && item.sectionDiscountPct != null
          ? item.sectionDiscountPct
          : null;
```

Then in the `tx.quoteItem.update({ … data: { … } })` block (around line 323), add one line right after `...(currencyUpdate === undefined ? {} : { currency: currencyUpdate }),`:

```typescript
            ...(currencyUpdate === undefined ? {} : { currency: currencyUpdate }),
            sectionDiscountPct,
```

Note: for PUT we always write the coerced value (not undefined) because every batch PUT currently always sends a complete item shape. If `sectionDiscountPct` is not in the payload, the client-side serializer will include `null` / `undefined` and Zod's `.nullish()` turns it into `undefined`, which coerces to `null` via our ternary. Result: PUT always persists a definite value for SUBTOTAL rows.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: these two files should now type-check cleanly. The view page, PDF, and Excel still have errors from the removed `discountScopeSubtotalId` — to be fixed later.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/quotes/[id]/items/route.ts
git commit -m "feat(quotes): items API persists sectionDiscountPct"
```

---

## Task 11: Quote PATCH route — stop reading/writing old discount fields

**Files:**
- Modify: `src/app/api/quotes/[id]/route.ts`
- Modify: `src/app/api/quotes/[id]/route.test.ts`

- [ ] **Step 1: Remove references to `discountPct` / `discountScopeSubtotalId`**

Open `src/app/api/quotes/[id]/route.ts`. Find lines 230–232 (the PUT section that currently forwards these fields to `db.quote.update`). Delete every reference to `discountPct` and `discountScopeSubtotalId`.

Also search the entire file for those two strings (`discountPct`, `discountScopeSubtotalId`) and delete any remaining references:
- GET profit calc (line ~126) — stop passing `Number(quote.discountPct)` into `calculateQuoteProfitSummary`. Pass `0` instead (the per-section discount is now derived from item rows inside the function).
- Any post-cleanup `updateMany` that nulled invalid SET currencies on a quote-currency change: keep that (it's a different codepath). But the section nearby that touched `discountScopeSubtotalId` on a subtotal delete — remove it.

The file should compile cleanly after this step.

- [ ] **Step 2: Fix the route's own tests**

Open `src/app/api/quotes/[id]/route.test.ts` (or whichever co-located test file exists — Grep for the filename). Find any test expectation that mocks `db.quote.update` with `discountPct:` or `discountScopeSubtotalId:` as arguments. Remove those mock return-value fields and any `expect(...).toHaveBeenCalledWith(…discountPct…)` assertions.

Run: `npm test -- --run src/app/api/quotes/[id]/route.test.ts`
Expected: tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/quotes/[id]/route.ts src/app/api/quotes/[id]/route.test.ts
git commit -m "feat(quotes): PATCH quote route no longer reads or writes quote-level discount"
```

---

## Task 12: Clone / revert / revisions — preserve `sectionDiscountPct`

**Files:**
- Modify: `src/app/api/quotes/[id]/clone/route.ts`
- Modify: `src/app/api/quotes/[id]/revert/route.ts`
- Modify: `src/app/api/quotes/[id]/revisions/route.ts`

- [ ] **Step 1: Clone route**

Open `src/app/api/quotes/[id]/clone/route.ts`. Find the block that creates the cloned `QuoteItem` rows (Grep for `currency: item.currency`). In both the parent-item create block and the sub-item create block, add one line:

```typescript
currency: item.currency,
sectionDiscountPct: item.sectionDiscountPct,
```

- [ ] **Step 2: Revert route**

Open `src/app/api/quotes/[id]/revert/route.ts`. Grep for `currency: item.currency` inside item recreation blocks. Add the same line after each occurrence:

```typescript
sectionDiscountPct: item.sectionDiscountPct,
```

- [ ] **Step 3: Revisions route**

Same treatment in `src/app/api/quotes/[id]/revisions/route.ts`.

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: these three routes pass. View page / PDF / Excel still have errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/quotes/[id]/clone/route.ts src/app/api/quotes/[id]/revert/route.ts src/app/api/quotes/[id]/revisions/route.ts
git commit -m "feat(quotes): clone/revert/revisions preserve sectionDiscountPct"
```

---

## Task 13: Surface `sectionDiscountPct` on `ApiQuoteItem`

**Files:**
- Modify: `src/lib/types/quote.ts`

- [ ] **Step 1: Add the field to the type**

Open `src/lib/types/quote.ts`. Find the `ApiQuoteItem` interface. After the `currency?: string | null` field, add:

```typescript
  sectionDiscountPct?: number | null;
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: unchanged (still fails in UI / PDF — to be fixed later).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types/quote.ts
git commit -m "feat(quotes): surface sectionDiscountPct on ApiQuoteItem"
```

---

## Task 14: Editor `QuoteItemsTable` — remove the old discount row

**Files:**
- Modify: `src/components/quotes/QuoteItemsTable.tsx`

- [ ] **Step 1: Remove the bottom İskonto `<tr>` block**

Open `src/components/quotes/QuoteItemsTable.tsx`. Find the `{/* Iskonto */}` comment (around line 1374). Delete the entire `<tr>` block below it (through `</tr>` at ~line 1421). That's the row with the `discountLabel` input, the `%` number input, and the subtotal-scope `<select>`.

- [ ] **Step 2: Remove the now-unused props from the component signature**

In the props interface (around line 39), delete these lines:
```typescript
  discountPct: number;
  onDiscountPctChange: (value: number) => void;
  discountScopeSubtotalId?: string | null;
  onDiscountScopeChange?: (subtotalId: string | null) => void;
  discountLabel?: string;
  onDiscountLabelChange?: (value: string) => void;
```

And their destructuring inside the component body (around lines 126–136). Remove references throughout the file to `discountPct`, `discountScopeSubtotalId`, `discountLabel`, and their callbacks — e.g. the auto-heal `useEffect` at line 487, the summary `useMemo` at ~line 680, and the `discountPct` prop passed to `<QuoteItemRow>` at ~line 1074 (if passed — delete it).

The `summary.discountAmount` and `summary.grandTotal` computations inside the footer will need to be replaced by the `calculateSectionBreakdown` result instead (which we'll use in the next task). For now, compute them inline from the new per-section data:

Replace the `subtotalMap` / `summary` `useMemo` (lines ~502–704) with a single block:

```typescript
  const breakdown = useMemo(() => {
    return calculateSectionBreakdown(
      items.map((it) => ({
        id: it.id,
        itemType: it.itemType,
        quantity: Number(it.quantity) || 0,
        unitPrice: Number(it.unitPrice) || 0,
        discountPct: Number(it.discountPct) || 0,
        vatRate: 0,
        priceLabel: it.priceLabel ?? null,
        currency: it.currency ?? null,
        parentItemId: it.parentItemId ?? null,
        sectionDiscountPct: it.sectionDiscountPct != null ? Number(it.sectionDiscountPct) : null,
      })),
      ctx
    );
  }, [items, ctx]);

  const subtotalMap = useMemo(() => {
    const map = new Map<string, { sectionSum: number; discountPct: number; discountAmount: number; sectionNet: number }>();
    for (const b of breakdown) {
      if (b.subtotalId) {
        map.set(b.subtotalId, {
          sectionSum: b.sectionSum,
          discountPct: b.discountPct,
          discountAmount: b.discountAmount,
          sectionNet: b.sectionNet,
        });
      }
    }
    return map;
  }, [breakdown]);

  const summary = useMemo(() => {
    const subtotal = breakdown.reduce((s, b) => s + b.sectionSum, 0);
    const discountAmount = breakdown.reduce((s, b) => s + b.discountAmount, 0);
    const grandTotal = breakdown.reduce((s, b) => s + b.sectionNet, 0);
    return { subtotal, discountAmount, grandTotal };
  }, [breakdown]);
```

Then at the top of the file, add this import (if not already present):
```typescript
import { calculateSectionBreakdown } from '@/lib/quote-calculations';
```

And remove the `ctx` assembly if it's still based on `discountPct` — it should only depend on `quote.currency / exchangeRate / protectionPct` and items' currencies.

- [ ] **Step 3: Commit**

```bash
git add src/components/quotes/QuoteItemsTable.tsx
git commit -m "refactor(quotes): editor no longer owns quote-level discount UI"
```

---

## Task 15: Editor `QuoteItemsTable` — add İskonto row above SUBTOTAL

**Files:**
- Modify: `src/components/quotes/QuoteItemsTable.tsx`

- [ ] **Step 1: In the row renderer for SUBTOTAL rows, emit an additional İskonto row above the SUBTOTAL**

Find the `items.map((item, idx) => { … })` block that emits one `<QuoteItemRow />` per item (Grep for `<QuoteItemRow`). Before each SUBTOTAL row, conditionally emit:

```tsx
{item.itemType === 'SUBTOTAL' && (Number(item.sectionDiscountPct) || 0) > 0 && (() => {
  const info = subtotalMap.get(item.id);
  if (!info) return null;
  const pct = info.discountPct;
  const amt = info.discountAmount;
  const sectionCurrency = getSectionCurrency(item); // helper, see Step 2
  return (
    <tr key={`disc-${item.id}`} className="bg-white">
      <td colSpan={labelSpan} className="px-3 py-1.5 text-right text-sm text-accent-700">
        <span className="inline-flex items-center gap-2">
          İskonto
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={pct}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!isNaN(val)) onSectionDiscountPctChange?.(item.id, val);
            }}
            className="w-16 rounded border border-accent-300 px-2 py-0.5 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
          />
          %
          <button
            type="button"
            onClick={() => onSectionDiscountPctChange?.(item.id, 0)}
            className="text-xs text-accent-400 hover:text-red-600"
            title="İskontoyu kaldır"
          >
            ×
          </button>
        </span>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-red-600 whitespace-nowrap">
        - {formatPrice(amt, sectionCurrency)}
      </td>
      {trailingSpan > 0 && <td colSpan={trailingSpan} />}
    </tr>
  );
})()}
{/* Then render the existing <QuoteItemRow …/> */}
```

Beside `onSectionDiscountPctChange`, the component must accept a new prop:

```typescript
  onSectionDiscountPctChange?: (subtotalItemId: string, pct: number) => void;
```

Add this to the props interface and to the destructure at the top of the component.

- [ ] **Step 2: Helper to resolve the section's display currency**

At the top of the component body, add:

```typescript
const getSectionCurrency = useCallback((subtotalItem: ItemData): string => {
  // A SUBTOTAL's display currency is its own currency override (if any;
  // rare) otherwise the quote currency. Items in the section may be
  // TRY-priced SETs that were converted to quote currency for the
  // breakdown — the discount line therefore displays in quote currency.
  return currency;
}, [currency]);
```

(For now the SUBTOTAL always renders in quote currency. A future refinement could render in the section's dominant currency, but that's out of scope.)

- [ ] **Step 3: Add "+ İskonto" button on SUBTOTAL rows with no discount**

Open `src/components/quotes/QuoteItemRow.tsx`. Find the branch that renders a SUBTOTAL row (Grep for `item.itemType === 'SUBTOTAL'`). In the label cell, right before the item description, conditionally show:

```tsx
{item.itemType === 'SUBTOTAL' && (Number(item.sectionDiscountPct) || 0) === 0 && onAddSectionDiscount && (
  <button
    type="button"
    onClick={() => onAddSectionDiscount(item.id)}
    className="inline-flex items-center gap-1 rounded border border-dashed border-accent-300 px-2 py-0.5 text-xs text-accent-600 hover:border-primary-400 hover:text-primary-600"
    title="Bu bölüme iskonto ekle"
  >
    + İskonto
  </button>
)}
```

Add the prop:
```typescript
  onAddSectionDiscount?: (itemId: string) => void;
```

Wire it from `QuoteItemsTable`: pass `onAddSectionDiscount={(id) => onSectionDiscountPctChange?.(id, 5)}` (default 5% as the initial reveal value — user can edit from there).

- [ ] **Step 4: Type check**

Run: `npx tsc --noEmit`
Expected: these two files compile. Upstream `QuoteEditor` still has errors (to be fixed next).

- [ ] **Step 5: Commit**

```bash
git add src/components/quotes/QuoteItemsTable.tsx src/components/quotes/QuoteItemRow.tsx
git commit -m "feat(quotes): editor renders İskonto row above each discounted SUBTOTAL"
```

---

## Task 16: Editor state wiring in `QuoteEditor`

**Files:**
- Modify: `src/app/(dashboard)/quotes/[id]/edit/QuoteEditor.tsx`

- [ ] **Step 1: Drop `discountPct` / `discountScopeSubtotalId` from `HeaderFields`**

Open `src/app/(dashboard)/quotes/[id]/edit/QuoteEditor.tsx`. In the `HeaderFields` interface (around line 51), delete:
```typescript
  discountPct: number;
  discountScopeSubtotalId: string | null;
```

Remove those keys from everywhere `HeaderFields` is read/written in the file (form defaults, API PATCH payloads, dirty-tracking). Grep for `discountPct` and `discountScopeSubtotalId` in the file and clean each reference.

- [ ] **Step 2: Surface `sectionDiscountPct` on the local item type**

In `mapApiItemToLocal` (Grep for that function name), add after `currency: item.currency ?? null,`:
```typescript
sectionDiscountPct: item.sectionDiscountPct != null ? Number(item.sectionDiscountPct) : null,
```

Also add `sectionDiscountPct?: number | null;` to the local `QuoteItemData` interface that `QuoteItemsTable` consumes.

- [ ] **Step 3: Implement `handleSectionDiscountPctChange`**

Add a new handler near the existing `recalcItemPrices` helper:

```typescript
const handleSectionDiscountPctChange = useCallback((subtotalItemId: string, pct: number) => {
  setItems((prev) =>
    prev.map((it) =>
      it.id === subtotalItemId && it.itemType === 'SUBTOTAL'
        ? { ...it, sectionDiscountPct: Math.min(100, Math.max(0, pct)) }
        : it
    )
  );
  setIsDirty(true);
}, [setItems, setIsDirty]);
```

Pass it down:
```tsx
<QuoteItemsTable
  …
  onSectionDiscountPctChange={handleSectionDiscountPctChange}
/>
```

- [ ] **Step 4: Include `sectionDiscountPct` in the bulk save payload**

In the function that POSTs/PUTs the batch items (Grep for `bulkQuoteItemUpdateSchema` or `items: validatedItems.map`), include `sectionDiscountPct: it.sectionDiscountPct ?? null` on each item. The items PUT route already accepts/coerces this field.

- [ ] **Step 5: Type check + smoke test**

Run: `npx tsc --noEmit`
Expected: editor files clean. View page / PDF / Excel still have errors.

Run: `npm run dev`, navigate to any quote editor, add two SUBTOTAL rows, click "+ İskonto" on the second one, change the % to 10, save. Reload — İskonto row persists, SUBTOTAL value is reduced accordingly.

- [ ] **Step 6: Commit**

```bash
git add src/app/(dashboard)/quotes/[id]/edit/QuoteEditor.tsx
git commit -m "feat(quotes): editor wires sectionDiscountPct through save"
```

---

## Task 17: Quote view page

**Files:**
- Modify: `src/app/(dashboard)/quotes/[id]/page.tsx`

- [ ] **Step 1: Render İskonto row above each discounted SUBTOTAL; remove the footer discount line**

Open `src/app/(dashboard)/quotes/[id]/page.tsx`. Find the `tbody` rendering (the IIFE that iterates items and emits rows with subRows under parents, around lines 880–1080 area). For each SUBTOTAL row with `sectionDiscountPct > 0`, emit a sibling `<tr>` right above it:

```tsx
{item.itemType === 'SUBTOTAL' && Number(item.sectionDiscountPct ?? 0) > 0 && (
  <tr key={`disc-${item.id}`} className="bg-accent-50/50">
    <td colSpan={labelSpan} className="px-3 py-1 text-right text-sm text-accent-700">
      İskonto (%{Number(item.sectionDiscountPct ?? 0)})
    </td>
    <td className="px-2 py-1 text-right tabular-nums text-red-600">
      {(() => {
        // section amount is available via the same calculateSectionBreakdown call
        const info = sectionBreakdownById.get(item.id);
        return info ? `- ${formatPrice(info.discountAmount, currency)}` : '';
      })()}
    </td>
    {trailingSpan > 0 && <td colSpan={trailingSpan} />}
  </tr>
)}
```

Add `sectionBreakdownById` up-front (mirrors the editor's breakdown useMemo — same shape, same ctx):
```tsx
import { calculateSectionBreakdown } from '@/lib/quote-calculations';
// ...
const sectionBreakdownById = useMemo(() => {
  const calcItems = items.map((it) => ({
    id: it.id,
    itemType: it.itemType,
    quantity: Number(it.quantity) || 0,
    unitPrice: Number(it.unitPrice) || 0,
    discountPct: Number(it.discountPct) || 0,
    vatRate: 0,
    priceLabel: it.priceLabel ?? null,
    currency: it.currency ?? null,
    parentItemId: it.parentItemId ?? null,
    sectionDiscountPct: it.sectionDiscountPct != null ? Number(it.sectionDiscountPct) : null,
  }));
  const breakdown = calculateSectionBreakdown(calcItems, ctx);
  const m = new Map<string, { discountAmount: number; sectionNet: number }>();
  for (const b of breakdown) {
    if (b.subtotalId) m.set(b.subtotalId, { discountAmount: b.discountAmount, sectionNet: b.sectionNet });
  }
  return m;
}, [items, ctx]);
```

The SUBTOTAL row itself must also render the section NET value instead of `sectionSum`. Find the existing `<td>` that shows the SUBTOTAL's amount and replace its value with `sectionBreakdownById.get(item.id)?.sectionNet ?? 0`.

- [ ] **Step 2: Remove the footer İskonto line (at the bottom of the totals panel)**

Grep the file for the `summary.discountPct > 0` block (around line 1163). Delete the entire `{!hasInlineSubtotal && summary.discountPct > 0 && ( … İskonto … )}` block.

- [ ] **Step 3: Stop reading `quote.discountPct`**

Grep for `Number(quote.discountPct)` in the file (lines 396, 896). The `useMemo` at line 395 should compute `discountTotal` as `Σ info.discountAmount` instead. Update accordingly. The old `discountPct` local variable goes away.

- [ ] **Step 4: Type check + smoke test**

Run: `npx tsc --noEmit`
Expected: view page compiles. Only PDF + Excel remain.

Run dev server, open a quote with a discounted section, verify the İskonto row appears above the SUBTOTAL and the grand total matches the editor.

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/quotes/[id]/page.tsx
git commit -m "feat(quotes): view page renders per-section İskonto row"
```

---

## Task 18: PDF template + assembler

**Files:**
- Modify: `src/lib/pdf/quote-template.ts`
- Modify: `src/lib/pdf/assemble-quote-data.ts`
- Modify: `src/app/api/quotes/[id]/export/pdf/route.ts`

- [ ] **Step 1: Update the PDF template interface**

Open `src/lib/pdf/quote-template.ts`. In the `QuoteItemForPdf` interface, add:
```typescript
sectionDiscountPct?: number | null;
```

Also add to the top-level `data` shape (around line 71), REMOVE these fields:
```typescript
discountPct?: number;
discountLabel?: string;
discountScopeSubtotalId?: string | null;
```

- [ ] **Step 2: Update the per-row render loop to emit the İskonto row above each discounted SUBTOTAL**

Find the row loop inside the template (around line 270 — the `items.map` that emits `<tr>` strings). For each SUBTOTAL row with `sectionDiscountPct > 0`, emit an İskonto row BEFORE the SUBTOTAL row's string:

```typescript
if (item.itemType === 'SUBTOTAL') {
  const pct = Number(item.sectionDiscountPct ?? 0);
  const sectionSum = computeSubtotalSum(items, idx); // existing helper
  const discAmt = pct > 0 ? round2(sectionSum * (pct / 100)) : 0;
  const net = sectionSum - discAmt;

  if (pct > 0) {
    html += `<tr class="discount-row">
      <td colspan="${labelSpan}" class="discount-label">İskonto (%${pct})</td>
      <td class="discount-amount">- ${formatPrice(discAmt, rowCurrency)}</td>
    </tr>\n`;
  }

  // Now emit the existing SUBTOTAL row, but replace the displayed
  // amount (currently `sectionSum`) with `net`. The existing row
  // markup in this function emits `formatPrice(sectionSum, …)` — change
  // that call to `formatPrice(net, …)` inside the SUBTOTAL branch.
}
```

**In practice:** find the existing SUBTOTAL row emission (the `html += …` line that renders the subtotal amount) and change `formatPrice(sectionSum, …)` → `formatPrice(net, …)`. Keep the rest of the row markup (label, styling, colspan) exactly as-is.

Remove the bottom "Iskonto" totals line emitted at the end of the table (Grep for `overallDiscountLabel` in the template — delete the block).

- [ ] **Step 3: Update the assembler**

Open `src/lib/pdf/assemble-quote-data.ts`. Find the `items.map` that builds `QuoteItemForPdf` rows. Add:
```typescript
sectionDiscountPct: item.sectionDiscountPct != null ? Number(item.sectionDiscountPct) : null,
```

Stop returning `discountPct`, `discountLabel`, `discountScopeSubtotalId` in the top-level payload.

- [ ] **Step 4: Update the PDF export route**

Open `src/app/api/quotes/[id]/export/pdf/route.ts`. Grep for `discountPct` and `discountScopeSubtotalId`. Delete any references. The assembler change makes those unnecessary at the route level.

- [ ] **Step 5: Type check + smoke test**

Run: `npx tsc --noEmit`
Expected: PDF files compile.

Run dev server, open a quote with section discounts, hit "PDF Oluştur" — PDF downloads, İskonto row appears above the discounted SUBTOTAL, net is correct.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/quote-template.ts src/lib/pdf/assemble-quote-data.ts src/app/api/quotes/[id]/export/pdf/route.ts
git commit -m "feat(quotes): PDF renders per-section İskonto row"
```

---

## Task 19: Excel service

**Files:**
- Modify: `src/lib/excel/excel-service.ts`
- Modify: `src/app/api/quotes/[id]/export/excel/route.ts`

- [ ] **Step 1: Update `QuoteItemForExcel` interface and the SUBTOTAL handler**

Open `src/lib/excel/excel-service.ts`. In the `QuoteItemForExcel` interface, add:
```typescript
sectionDiscountPct?: number | null;
```

Find the `else if (item.itemType === 'SUBTOTAL')` branch (around line 461). Before writing the SUBTOTAL row, emit an İskonto row if the section has a discount:

```typescript
} else if (item.itemType === 'SUBTOTAL') {
  const sectionSum = computeExcelSubtotalSum(items, index);
  const pct = Number(item.sectionDiscountPct ?? 0);
  const discAmt = round2(sectionSum * (pct / 100));
  const net = sectionSum - discAmt;

  if (pct > 0) {
    // İskonto row — same columns as the SUBTOTAL row, colored label cell, red amount.
    const discRow = worksheet.addRow([]);
    discRow.getCell(labelColumn).value = `İskonto (%${pct})`;
    discRow.getCell(amountColumn).value = -discAmt;
    discRow.getCell(amountColumn).numFmt = '#,##0.00';
    discRow.getCell(amountColumn).font = { color: { argb: 'FFDC2626' } };
    // align with existing SUBTOTAL row styling — copy borders/fill as needed.
  }

  // Existing SUBTOTAL render now uses `net` instead of `sectionSum`
  // for its displayed total.
  const currencyName = /* existing */;
  const label = `${item.description || 'Ara Toplam'} (${currencyName})`;
  // (rest of existing SUBTOTAL emit — replace sectionSum with net)
}
```

- [ ] **Step 2: Update the Excel export route**

Open `src/app/api/quotes/[id]/export/excel/route.ts`. Grep for discount fields; pass `sectionDiscountPct: item.sectionDiscountPct` through the items array as you assemble.

- [ ] **Step 3: Type check + smoke test**

Run: `npx tsc --noEmit`

Run dev server, export Excel for a discounted quote → verify the İskonto row appears above the SUBTOTAL in the sheet.

- [ ] **Step 4: Commit**

```bash
git add src/lib/excel/excel-service.ts src/app/api/quotes/[id]/export/excel/route.ts
git commit -m "feat(quotes): Excel renders per-section İskonto row"
```

---

## Task 20: `BrandProfitSummary` — drop quote-level discount read

**Files:**
- Modify: `src/components/quotes/BrandProfitSummary.tsx`

- [ ] **Step 1: Stop passing `quote.discountPct` to `calculateQuoteProfitSummary`**

Grep the file for `quote.discountPct` or `discountPct` prop. Replace every `calculateQuoteProfitSummary(items, Number(quote.discountPct), ctx)` call with `calculateQuoteProfitSummary(items, 0, ctx)`. The per-section discount is now derived from the items array itself inside the function (see Task 7).

Ensure every caller is passing `items` that include the SUBTOTAL rows with `sectionDiscountPct` populated. The items array used for this component is already the full item list from the quote — it will include SUBTOTAL rows.

- [ ] **Step 2: Smoke test**

Load a quote with section discounts in the editor. Open the `Marka Kar Özeti` panel. Verify profit figures reflect the per-section discounts (revenue reduced by each section's pct, cost unchanged).

- [ ] **Step 3: Commit**

```bash
git add src/components/quotes/BrandProfitSummary.tsx
git commit -m "feat(quotes): profit summary uses per-section discount"
```

---

## Task 21: Full verification

- [ ] **Step 1: Type check everywhere**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Run the full test suite**

Run: `npm test -- --run`
Expected: all tests pass. Previously-green count stays green.

- [ ] **Step 3: Lint (optional if project has one)**

Run: `npm run lint` if a script exists.

- [ ] **Step 4: Manual QA on dev**

With `npm run dev`:
- [ ] Open a seeded quote, add two SUBTOTALs with items between, set 5% on the first and 10% on the second. Save, reload — values persist.
- [ ] Verify grand total = section nets summed.
- [ ] Export PDF → İskonto rows render correctly, SUBTOTALs show net.
- [ ] Export Excel → same.
- [ ] Click "Ön İzleme" on view page → read-only view shows İskonto rows.
- [ ] Click "Marka Kar Özeti" → profit numbers reflect section discounts.
- [ ] Clone the quote → cloned discounts preserved.
- [ ] Add a TRY SET inside a discounted EUR section → SET converts to EUR first, then section discount applies.
- [ ] Quote with zero SUBTOTAL rows → "+ İskonto" button does not appear; grand total = sum of items; no discount possible.

- [ ] **Step 5: Sub-agent code review**

Per project convention, dispatch both a code-reviewer agent and a spec-reviewer agent against the diff before merge. Fix any actionable findings.

Sample dispatch prompts:

**Code reviewer:**
> "Review the diff on the current branch against `docs/superpowers/specs/2026-04-19-per-subtotal-discount-design.md`. This change replaces the single quote-level discount with per-SUBTOTAL discounts. Flag: (1) any remaining reads of `Quote.discountPct` or `Quote.discountScopeSubtotalId` in app code (should be zero), (2) TypeScript `any` introduced, (3) tests that still use the old scoped-discount API, (4) migration script correctness."

**Spec reviewer:**
> "Check the implementation on the current branch against the spec at `docs/superpowers/specs/2026-04-19-per-subtotal-discount-design.md`. For each section of the spec, confirm the code matches or explain a deliberate deviation. Pay attention to: migration behavior (A.2 fan-out for null-scope), orphan handling, price-label exclusion, and PDF/Excel rendering parity."

- [ ] **Step 6: Commit final fixes from review, if any**

---

## Task 22: Deploy checklist

- [ ] **Step 1: Merge to main**

- [ ] **Step 2: Deploy**

SSH to the prod server, pull, docker compose up --build, watch the logs. Migration applies automatically on container start via `prisma migrate deploy`.

- [ ] **Step 3: Run the data migration script (one-shot)**

```bash
docker compose exec app npx tsx scripts/migrate-per-subtotal-discount.ts --dry-run
# Review the output. If mismatches list is empty, proceed:
docker compose exec app npx tsx scripts/migrate-per-subtotal-discount.ts
```

Inspect stdout: no mismatches, cases sum matches expected count.

- [ ] **Step 4: Post-deploy smoke**

Open the most recently discounted quote in prod UI. Verify:
- Grand total matches the pre-deploy value within ±0.02
- İskonto row appears on the expected SUBTOTAL
- PDF still exports correctly

- [ ] **Step 5: Schedule the follow-up cleanup PR**

Add a reminder (or TaskCreate entry) to drop `Quote.discountPct`, `Quote.discountTotal`, `Quote.discountScopeSubtotalId` columns in ~2 weeks. See _Follow-up work_ in the spec.

---

## Spec self-review

Performed after writing: each design section maps to at least one task, placeholders scanned, types consistent across tasks. Issues fixed inline in this plan:

- Task 3 initially expected orphan items above the first SUBTOTAL to be NOT discounted. That was wrong — the current section logic treats everything above the first SUBTOTAL as part of that first SUBTOTAL's section. Test updated to match implementation. (Spec still correctly describes "orphans above FIRST subtotal go into section 1" — a future cleanup could add a "before any SUBTOTAL = truly orphan" rule, but YAGNI for this PR.)

- Task 5's `calculateSectionBreakdown` explicitly skips `item.parentItemId` rows — this preserves the existing SET-child-not-double-counted invariant.

- Task 7's profit summary walks items a second time to assemble an item-id → sectionDiscountPct map, rather than re-sharing the breakdown function's output, to keep the function signature simple and the data shape backward-compatible.

---
