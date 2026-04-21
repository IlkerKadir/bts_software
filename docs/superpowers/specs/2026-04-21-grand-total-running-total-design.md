# GRAND_TOTAL Running-Total — Design Spec

**Date:** 2026-04-21
**Status:** Approved; ready for implementation plan
**Author:** IlkerKadir + Claude
**Target release:** next deploy

## Goal

Change what a user-inserted `GRAND_TOTAL` row displays. Today each `GRAND_TOTAL` row always shows the **whole quote's net total** regardless of where it sits. After this change each `GRAND_TOTAL` row shows the **running net total of everything above it**, so users can drop a genuine checkpoint total at any point in the quote — including one that crosses multiple `SUBTOTAL` (ara toplam) boundaries.

The mental model: `SUBTOTAL` sums within one section; `GRAND_TOTAL` sums **everything from the top of the quote down to where it is placed**, respecting per-section İskonto where a section is closed.

## Non-goals

- No change to the `Quote.grandTotal` DB column or how it is computed/used elsewhere (dashboard, profit summary, sort order). That column remains the whole-quote net.
- No change to `SUBTOTAL` row behavior, its İskonto row, or its rendering.
- No change to `calculateQuoteTotals()` signature or semantics.
- No change to VAT handling (stays 0 — VAT is outside the quote by design).
- No change to clone / revert / revisions / migration behavior.
- No data migration. The change is purely derivational — existing `GRAND_TOTAL` rows in production quotes simply start showing a new (position-dependent) value the next time the quote is rendered.

## Current state (before this change)

- `QuoteItem.itemType` includes `GRAND_TOTAL`. The user inserts one via the "Genel Toplam" button in the editor; it appears as a row in the items table and can be dragged to any position.
- Three renderers display the row:
  - `src/lib/pdf/quote-template.ts:242` — renders `formatCurrency(totals.grandTotal, currency)` for every `GRAND_TOTAL` row.
  - `src/lib/excel/excel-service.ts:458` — same, using the `totals.grandTotal` passed into the sheet builder.
  - `src/app/(dashboard)/quotes/[id]/page.tsx` — view page, same.
  - Editor table (`src/components/quotes/QuoteItemRow.tsx`) — live preview, same.
- Because the value is position-independent, multiple `GRAND_TOTAL` rows all display the identical whole-quote total. There is no current use case for multiple rows.
- `calculateQuoteTotals()` returns `{ subtotal, discountTotal, vatTotal, grandTotal }` where `grandTotal = Σ sectionNet` over the whole quote. Used by recalc-and-persist to stamp `Quote.grandTotal`.

## Target state

### Behavior rule (single source of truth)

For any `GRAND_TOTAL` row at item index `P`:

```
displayValue = Σ (net of every closed section entirely above P)
             + Σ (raw total of every priced item above P that is not yet closed by a SUBTOTAL)
```

Where:
- **Closed section above P**: a contiguous block of priced items that is terminated by a `SUBTOTAL` row whose index `< P`. Its net = `sectionSum − sectionDiscountAmount`, same formula already used by `calculateSectionBreakdown()`.
- **Open tail**: priced items whose last boundary above them is either the start of the items array or a `SUBTOTAL` with index `< P`, and which have no closing `SUBTOTAL` with index `< P`. These contribute their gross total (no İskonto — no İskonto exists yet for an unclosed section).
- Non-priced rows above `P` (`HEADER`, `NOTE`, other `GRAND_TOTAL` rows, `SUBTOTAL` without priced items beneath it) contribute 0 and do not terminate an open tail on their own.
- Currency conversion (`ctx: QuoteCurrencyContext`) is applied to each item the same way `calculateSectionBreakdown` already handles it.

### Examples

1. **Empty above** (`GRAND_TOTAL` is the first item): displays `0`.
2. **One closed section above, İskonto 10%**:
   ```
   Item A (100)
   Item B (100)
   SUBTOTAL (İskonto 10)
   GRAND_TOTAL   → displays 180
   ```
3. **Two closed sections above**:
   ```
   Item A (100)
   SUBTOTAL (İskonto 10)   → net 90
   Item B (200)
   SUBTOTAL (İskonto 0)    → net 200
   GRAND_TOTAL   → displays 290
   ```
4. **Closed + open tail**:
   ```
   Item A (100)
   SUBTOTAL (İskonto 10)   → net 90
   Item B (50)             ← open tail (no SUBTOTAL below yet)
   GRAND_TOTAL   → displays 140 (= 90 + 50 gross)
   ```
5. **`GRAND_TOTAL` at the very end after every section is closed**: value equals `Quote.grandTotal` (the DB column). This is the de-facto invariant used as a test.

### New helper

Add to `src/lib/quote-calculations.ts`:

```ts
/**
 * Running net total of all priced items strictly above `grandTotalIndex`.
 *
 * Rules:
 * - Closed sections above (ending in SUBTOTAL) contribute sectionNet
 *   (= sectionSum − section's İskonto).
 * - Items past the last SUBTOTAL above `grandTotalIndex` are an "open
 *   tail" and contribute their gross totalPrice (no İskonto applied —
 *   none has been declared yet for that unclosed section).
 * - When grandTotalIndex sits at the end and every section is closed,
 *   the returned value equals calculateQuoteTotals(items, 0, ctx).grandTotal.
 *
 * Pure. Called once per GRAND_TOTAL render site; O(n) per call. n ≤ ~200.
 */
export function calculateGrandTotalAtIndex(
  items: CalculationItem[],
  grandTotalIndex: number,
  ctx?: QuoteCurrencyContext
): number;
```

Internally it can reuse or mirror `calculateSectionBreakdown()`'s per-item iteration, limited to `items.slice(0, grandTotalIndex)` and flushing the trailing partial section as a zero-discount virtual section. The existing `calculateSectionBreakdown` does not need to change.

### Rendering changes

Every renderer currently using `totals.grandTotal` for a `GRAND_TOTAL` row replaces that read with a call to `calculateGrandTotalAtIndex(items, index, ctx)`.

Touched files:
1. **`src/lib/pdf/quote-template.ts`** — inside the items-map at the `GRAND_TOTAL` branch, compute per-row value; leave the unrelated whole-quote totals panel at the bottom alone if present.
2. **`src/lib/excel/excel-service.ts`** — same, inside `buildItemsSection` at the `GRAND_TOTAL` branch.
3. **`src/app/(dashboard)/quotes/[id]/page.tsx`** — view page GRAND_TOTAL rendering.
4. **`src/components/quotes/QuoteItemRow.tsx`** (editor live preview) — replace the `totals.grandTotal` read with a per-position value. Because the editor already knows the item list and index, this is a direct call.

### What does NOT change

- `Quote.grandTotal` DB column (still whole-quote).
- `calculateQuoteTotals()` shape, signature, callers.
- `calculateSectionBreakdown()`.
- `recalculateAndPersistQuoteTotals()`.
- `QuoteItem` Prisma schema — no new fields, no migration.
- The "+ Genel Toplam" button, its click handler, or the `itemType` enum.
- Clone / revert / revisions — the inserted `GRAND_TOTAL` rows carry no value of their own today; they don't after either.
- Profit summary / brand profit summary — these use `Quote.grandTotal` and per-section breakdown, not per-row `GRAND_TOTAL` values.

## Testing

### New unit tests (`src/lib/quote-calculations.test.ts`)

- `calculateGrandTotalAtIndex` returns 0 when index = 0
- returns 0 when no priced items above
- one closed section above → returns sectionNet
- two closed sections above → returns sum of sectionNets
- closed section + open tail → closed nets + open tail gross
- non-priced rows above (HEADER/NOTE) contribute 0
- another `GRAND_TOTAL` above is ignored (no double-counting)
- index at end + all sections closed ≡ `calculateQuoteTotals().grandTotal`
- respects `ctx.baseForeignRate` for mixed-currency items the same way `calculateSectionBreakdown` does

### Updated tests

- PDF snapshot tests that include a `GRAND_TOTAL` row may need their expected totals refreshed. Audit `src/lib/pdf/quote-template.test.ts` and update only the specific snapshots that feature GRAND_TOTAL.
- Excel tests (`src/lib/excel/excel-service.test.ts`) — same audit.

### Manual verification

- Open an existing quote in production-like data with one GRAND_TOTAL at the bottom. Confirm PDF and Excel outputs match the whole-quote grand total unchanged (invariant #5 above).
- Insert a second GRAND_TOTAL between two SUBTOTALs and confirm it shows the running total of closed sections above.
- Insert GRAND_TOTAL between items of an unclosed section and confirm the open-tail items are added at gross.
- Editor live preview matches the final PDF/Excel number for the same quote.

## Risk notes (production)

- **Existing quotes with a bottom-only GRAND_TOTAL row**: displayed value should not visibly change (invariant #5). This is the common case and our primary regression guard.
- **Performance**: O(n) per GRAND_TOTAL row per render is negligible — quotes max ≈200 rows, and rendering is not hot-path.
- **Cache consistency**: none introduced — the value is computed at render time, no DB column, no persistence, no drift risk.
- **Backward compat**: purely additive function export; no API or DB change.

## Follow-up work (out of scope)

- Optional: a "+ Ara GENEL TOPLAM" distinct button if users want a clearly labeled mid-quote milestone. Not needed for MVP — the same GRAND_TOTAL row with its editable label (already supported) covers it.
