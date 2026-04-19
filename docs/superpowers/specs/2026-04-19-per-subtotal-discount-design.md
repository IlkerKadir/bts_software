# Per-Subtotal Discounts — Design Spec

**Date:** 2026-04-19
**Status:** Approved; ready for implementation plan
**Author:** IlkerKadir + Claude
**Target release:** next deploy

## Goal

Replace the current single quote-level discount — `Quote.discountPct` applied either to the whole quote or to one chosen subtotal via `Quote.discountScopeSubtotalId` — with per-SUBTOTAL discounts where each SUBTOTAL row carries its own discount %. The client needs to apply different discounts to different sections of the same quote (e.g. 5% on Section 1, 0% on Section 2, 3% on Section 3).

## Non-goals

- No VAT pipeline. Prices exclude VAT; the quote totals are VAT-exclusive by design.
- No nested-section discounts. Sections are flat, defined by SUBTOTAL markers as they are today.
- No cross-quote discount defaults / templates.
- Not changing item-level `QuoteItem.discountPct` behavior (per-item line discount stays as-is).
- Not changing SET-currency or FX-protection mechanics.

## Current state (before this change)

- `Quote.discountPct Decimal(5,2)` + `Quote.discountTotal Decimal(12,2)` + `Quote.discountScopeSubtotalId String?` (nullable FK-free pointer).
- `discountScopeSubtotalId = null` → discount applied to whole subtotal (legacy).
- `discountScopeSubtotalId = <subtotalItemId>` → discount applied only to the section ending at that SUBTOTAL row. Section = items from the previous SUBTOTAL (exclusive) or index 0, up to this SUBTOTAL (exclusive).
- Discount base excludes price-labeled rows.
- Item-level `QuoteItem.discountPct` is applied before the section discount.
- UI: single `%` input + a subtotal-selector dropdown sitting below the items table.

## Target state

### Data model

- **New column:** `QuoteItem.sectionDiscountPct Decimal?(5,2)`.
  - Only meaningful when `itemType = SUBTOTAL`.
  - Null or 0 → no discount on that section.
  - Validated range 0–100.
  - Non-SUBTOTAL rows are normalized to null on write (no error, silent coerce).
- **Kept for one release, stop writing:** `Quote.discountPct`, `Quote.discountTotal`, `Quote.discountScopeSubtotalId`.
  - They become dead fields. The new engine ignores them entirely.
  - Dropped in a follow-up PR after ~1–2 weeks of stable production use (see _Follow-up work_ below).

### Calculation engine (`src/lib/quote-calculations.ts`)

For each SUBTOTAL row in the ordered item list:

1. Walk backward to find the section start (previous SUBTOTAL row + 1, or index 0).
2. `sectionSum` = sum of priced items (PRODUCT/CUSTOM/SET) in that slice, excluding price-labeled rows and sub-items under a SET-parent. Currency conversion uses the existing `QuoteCurrencyContext` (TRY SET under EUR quote → convert via non-protected base rate, etc.).
3. `sectionDiscountAmount = sectionSum * (sectionDiscountPct / 100)` (0 when null/0).
4. `sectionNet = sectionSum - sectionDiscountAmount`.

Top-level totals:

- `Quote.subtotal` = Σ `sectionSum` + `orphanSum` (pre-discount total).
- `Quote.discountTotal` = Σ `sectionDiscountAmount` (kept as a column for reporting).
- `Quote.grandTotal` = Σ `sectionNet` + `orphanSum`.

**Orphan items** — priced items that sit above the first SUBTOTAL or below the last SUBTOTAL (not part of any section) contribute to `orphanSum` at full price. No discount is applied to orphans. This preserves the current scoped-discount behavior.

**Zero-SUBTOTAL quote** — no SUBTOTAL rows means no place to apply a discount. `grandTotal = orphanSum` (every priced item is an orphan). User must add a SUBTOTAL row to apply a discount.

### API changes

- **`src/lib/validations/quote.ts`** — add `sectionDiscountPct: z.number().min(0).max(100).nullish()` to `quoteItemSchema`.
- **`src/app/api/quotes/[id]/items/route.ts`**
  - POST: accept `sectionDiscountPct`. If item is not SUBTOTAL, coerce to null. Persist on the row.
  - PUT (batch): same treatment in the preflight normalizer.
- **`src/app/api/quotes/[id]/route.ts`** (PATCH)
  - Remove reads/writes of `discountPct` and `discountScopeSubtotalId`.
  - Always recompute `subtotal`, `discountTotal`, `grandTotal` from the new engine after any mutation.
- **Clone / revert / revisions** (`src/app/api/quotes/[id]/clone/route.ts`, `revert/route.ts`, `revisions/route.ts`) — preserve `sectionDiscountPct` when copying/restoring SUBTOTAL rows.
- Remove UI-level discount fields from the generic quote PATCH shape. (Old field shapes may still arrive in-flight from a stale client — silently ignore.)

### Editor UI (`src/components/quotes/QuoteItemsTable.tsx` + QuoteEditor.tsx)

- **Above each SUBTOTAL row with `sectionDiscountPct > 0`:** render an İskonto row.
  - Label: `İskonto (%{pct})`
  - Amount: `-{sectionDiscountAmount}` in the section's currency
  - Right-click / click-to-edit: opens the % input inline
- **On each SUBTOTAL row with no discount:** show a small "+ İskonto" button in the label cell. Click → discount % input appears, user enters value, enter/blur saves via the items PUT.
- **SUBTOTAL row value** = section net (post-discount) — this is the number that flows into the grand total.
- **Remove** the old bottom-of-table discount `%` input + subtotal-scope dropdown.
- Keep: all existing SET-currency, FX-protection, price-label, item-reorder behavior.

### View page (`src/app/(dashboard)/quotes/[id]/page.tsx`)

- Same rendering as the editor, read-only: İskonto row above SUBTOTAL rows (when >0), SUBTOTAL row shows net.
- Remove the old discount line in the totals footer.
- Currency formatting unchanged (SET overrides still respected).

### PDF (`src/lib/pdf/quote-template.ts`) + Excel (`src/lib/excel/excel-service.ts`)

- Render the İskonto row in the same position as the editor — one row above the SUBTOTAL, only when `sectionDiscountPct > 0`.
- SUBTOTAL row value = net.
- Remove the old footer "İskonto" line if the template has one.
- Assemblers (`src/lib/pdf/assemble-quote-data.ts`, `src/app/api/quotes/[id]/export/pdf/route.ts`, `src/app/api/quotes/[id]/export/excel/route.ts`) pass `sectionDiscountPct` through as part of each SUBTOTAL item's row data.

## Data migration

One-shot script: `scripts/migrate-per-subtotal-discount.ts`, run once on production **after** `prisma migrate deploy`.

**Behavior per quote with `discountPct > 0`:**

| Case | Old state | Migration action |
|------|-----------|------------------|
| 1 | `discountScopeSubtotalId` set to a valid SUBTOTAL | Copy `discountPct` onto that SUBTOTAL row's new `sectionDiscountPct`. |
| 2 | `discountScopeSubtotalId = null` (whole-quote legacy) | Copy `discountPct` onto **every** SUBTOTAL row in the quote (A.2 — closest preservation of old "discount on everything" intent). |
| 3 | `discountPct = 0` | Skip. |

**Verification inside the script:**

- For every mutated quote, recompute the new grand total and assert it's within ±0.02 of the old grand total.
- Log every migration: `{quoteId, quoteNumber, case, oldDiscountPct, oldScope, affectedSubtotalIds, oldGrandTotal, newGrandTotal}`.
- Flag mismatches but do not abort — write them to a `.json` report file for manual follow-up.
- Transactional: all updates for a single quote happen in one transaction.

**Running it:**

```bash
npx prisma migrate deploy
npx tsx scripts/migrate-per-subtotal-discount.ts
```

Script is idempotent (re-runnable): skips quotes where `sectionDiscountPct` is already set on any SUBTOTAL.

## Test strategy (tests written before implementation)

### Calculation engine — `src/lib/quote-calculations.test.ts`

**Existing scoped-discount tests** (lines 246–332 in the current file — names like "applies the discount only to the targeted section when scope is set", "scopes to the second section correctly", "falls back to whole-quote discount when scope id is missing", etc.) are rewritten to exercise the new per-SUBTOTAL model. The old test intent is preserved where it still makes sense; tests that tested pure legacy behavior (null-scope whole-quote) are removed.

New test cases:

1. Single SUBTOTAL, 5% discount → sectionNet = sectionSum × 0.95.
2. Two SUBTOTALs with different discounts (5% and 10%) → grand total is sum of both nets.
3. Two SUBTOTALs, one at 0%, one at 5% → only the 5% section is discounted.
4. Section containing a price-labeled row → label row excluded from discount base (regression).
5. Orphan priced items above the first SUBTOTAL → not discounted, still in grand total.
6. Quote with zero SUBTOTAL rows → no discount applied, grand total = Σ (all priced items).
7. Item-level `QuoteItem.discountPct` on an item inside a discounted section → both discounts stack correctly (item-level applied first, then section).
8. Currency mix: EUR quote with a TRY-priced SET inside a EUR SUBTOTAL → section discount applied to the converted sum.
9. Empty section (SUBTOTAL with no priced items before it since the prior SUBTOTAL) → sectionSum = 0, sectionDiscountAmount = 0.
10. Rounding: 33.33% of 100 → section discount rounds to 2 decimals, grand total consistent.

### Migration script — `scripts/migrate-per-subtotal-discount.test.ts`

1. Quote with scoped old discount → new `sectionDiscountPct` on correct SUBTOTAL, old fields untouched.
2. Quote with null-scope legacy whole-quote discount + three SUBTOTALs → all three SUBTOTALs get the same `sectionDiscountPct`.
3. Quote with zero discount → no changes.
4. Re-run the script twice → second run is a no-op (idempotency).
5. Mismatch detection: given a carefully crafted "grand total doesn't match" fixture, the mismatch is logged (not thrown).

### API integration — `src/app/api/quotes/[id]/items/route.test.ts`

1. PUT a SUBTOTAL row with `sectionDiscountPct = 5` → persists, quote totals recompute.
2. POST a non-SUBTOTAL item with `sectionDiscountPct = 5` → coerced to null, no error.
3. PUT with batch including one SUBTOTAL row and a change to `sectionDiscountPct` → persisted.

### Other routes

- Clone: `sectionDiscountPct` copied to cloned SUBTOTAL.
- Revert: same.
- Revisions: same when a version is created from a current quote.

## Rollout order

To keep risk low and rollback easy, ship in this order on a single branch:

1. **Tests first** — all new tests above, failing. Commit.
2. **Schema + Prisma migration** — add `QuoteItem.sectionDiscountPct`. No data touched yet. Commit.
3. **Calculation engine** — implement new math. Tests in (1) start passing. Commit.
4. **Migration script + its tests**. Commit.
5. **API routes** — update item POST/PUT, quote PATCH, clone/revert/revisions. Commit.
6. **Editor UI** — new İskonto row + "+ İskonto" button, remove old bottom discount control. Commit.
7. **View page + PDF + Excel** — parity of the new rendering across all three surfaces. Commit.
8. **Full verification** — `npx tsc --noEmit` (zero new errors), `npm test` (all green), manual smoke pass in dev.
9. **Sub-agent code review** — per project rule, both code-reviewer and spec-reviewer agents run before merge.
10. **Deploy to production** — `prisma migrate deploy`, then `npx tsx scripts/migrate-per-subtotal-discount.ts`. Inspect the migration log + any mismatches.
11. **Smoke test a real quote** in the prod UI: open a multi-section quote that had a discount before, confirm the discount is on the right SUBTOTAL with correct %, and the grand total is unchanged from pre-deploy.

## Verification checklist (manual, post-deploy)

- [ ] Open the quote the client most recently discounted. Discount sits on the correct SUBTOTAL. Grand total matches the pre-deploy value (±0.02).
- [ ] Create a fresh quote, add two SUBTOTALs, apply 5% on one and 0% on the other. İskonto row appears only on the discounted one. Grand total reflects the difference.
- [ ] PDF export: İskonto row appears above the discounted SUBTOTAL, SUBTOTAL shows net.
- [ ] Excel export: same.
- [ ] Clone that quote. Discounts preserved.
- [ ] Approve the cloned quote, revert it, check discounts survive the revert.
- [ ] Quote with a TRY-priced SET inside a EUR SUBTOTAL with a 5% discount → discount applied on the converted sum.
- [ ] Quote with no SUBTOTAL rows → "+ İskonto" button does not appear; discount is not possible.

## Follow-up work (do not forget)

**~1–2 weeks after deploy**, once we're confident the new model is stable, ship a small follow-up PR:

1. New Prisma migration: `DROP COLUMN` on `Quote.discountPct`, `Quote.discountTotal`, `Quote.discountScopeSubtotalId`.
2. Remove the three fields from `prisma/schema.prisma`.
3. Grep the codebase for any remaining references (should be zero) and remove.
4. Run tests, type check, deploy.

This is tracked here to avoid leaving the schema in a confusing "dead fields" state indefinitely.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Migration script produces grand totals that drift from pre-deploy values | ±0.02 assertion per quote, mismatches logged (not thrown) and reviewed manually before closing the release |
| New engine has a rounding bug that differs from the old engine on existing quotes | Test case #10 covers rounding; migration script's assert catches real-world cases |
| A stale client PATCHes with the old `discountPct` / `discountScopeSubtotalId` fields after deploy | New PATCH handler does not destructure or persist those fields (no 400 error, no write). Zod schema drops them so they're simply not passed through. |
| Old columns getting written to accidentally | Remove from all `db.quote.update()` / `create()` calls; grep to confirm |
| Rollback need post-deploy | Option 1 chosen — old columns + old values still present; a code-only revert still has data to work with |

## Out of scope (may come later)

- A "global" quote-level discount layered on top of per-section discounts (no one asked for it; YAGNI).
- UI to copy a discount % across all SUBTOTALs at once.
- Discount presets / templates.
- Negative discounts (surcharges).
