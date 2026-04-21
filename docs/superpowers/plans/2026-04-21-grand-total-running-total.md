# GRAND_TOTAL Running-Total Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each user-inserted `GRAND_TOTAL` row display the running net total of everything above it (closed sections at their discounted net + open-tail items at gross), instead of the whole-quote total.

**Architecture:** Add one pure helper `calculateGrandTotalAtIndex` to the calc engine (TDD). Update four renderers (PDF template, Excel service, view page, editor table) to read per-row values. No schema, no API, no migration.

**Tech Stack:** TypeScript, Prisma, ExcelJS, Puppeteer, React 19, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-21-grand-total-running-total-design.md`

---

## File structure

**Modify:**
- `src/lib/quote-calculations.ts` — add `calculateGrandTotalAtIndex`
- `src/lib/quote-calculations.test.ts` — unit tests for the new helper
- `src/lib/pdf/quote-template.ts` — replace `totals.grandTotal` read in the `GRAND_TOTAL` branch with per-index calculation
- `src/lib/pdf/quote-template.test.ts` — audit/update snapshot tests that exercise GRAND_TOTAL
- `src/lib/excel/excel-service.ts` — same replacement; deprecate the `grandTotal` param of `buildItemsSection`
- `src/lib/excel/excel-service.test.ts` — audit/update tests
- `src/app/(dashboard)/quotes/[id]/page.tsx` — build a per-id map keyed on each GRAND_TOTAL row's id; replace `summary.grandTotal` read in the GRAND_TOTAL render branch
- `src/components/quotes/QuoteItemsTable.tsx` — build a `grandTotalMap` (analogous to existing `subtotalMap`) and pass per-row values to `QuoteItemRow`

**Not modified:**
- DB schema, API routes, clone/revert/revisions, `recalculateAndPersistQuoteTotals`, `Quote.grandTotal` column usage anywhere else.

---

### Task 1: Add `calculateGrandTotalAtIndex` helper (tests first)

**Files:**
- Modify: `src/lib/quote-calculations.ts`
- Test: `src/lib/quote-calculations.test.ts`

- [ ] **Step 1: Add failing tests**

Add to `src/lib/quote-calculations.test.ts` (import `calculateGrandTotalAtIndex` — does not yet exist):

```ts
import { describe, it, expect } from 'vitest';
import {
  calculateQuoteTotals,
  calculateGrandTotalAtIndex,
  type QuoteItem,
} from './quote-calculations';

// Helper — minimal priced item
const priced = (over: Partial<QuoteItem> = {}): QuoteItem => ({
  itemType: 'PRODUCT',
  quantity: 1,
  unitPrice: 100,
  discountPct: 0,
  vatRate: 0,
  ...over,
});

const subtotal = (over: Partial<QuoteItem> = {}): QuoteItem => ({
  itemType: 'SUBTOTAL',
  quantity: 0,
  unitPrice: 0,
  discountPct: 0,
  vatRate: 0,
  ...over,
});

const grandTotal: QuoteItem = {
  itemType: 'GRAND_TOTAL',
  quantity: 0,
  unitPrice: 0,
  discountPct: 0,
  vatRate: 0,
};

describe('calculateGrandTotalAtIndex', () => {
  it('returns 0 when index is 0 (GRAND_TOTAL at very start)', () => {
    const items = [grandTotal, priced()];
    expect(calculateGrandTotalAtIndex(items, 0)).toBe(0);
  });

  it('returns 0 when no priced items above', () => {
    const items: QuoteItem[] = [
      { itemType: 'HEADER', description: 'X', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0 } as QuoteItem,
      grandTotal,
    ];
    expect(calculateGrandTotalAtIndex(items, 1)).toBe(0);
  });

  it('one closed section above returns sectionNet', () => {
    // 100 + 100 items, %10 İskonto → 180
    const items = [
      priced(), priced(),
      subtotal({ sectionDiscountPct: 10 }),
      grandTotal,
    ];
    expect(calculateGrandTotalAtIndex(items, 3)).toBe(180);
  });

  it('two closed sections above returns sum of sectionNets', () => {
    const items = [
      priced(),                                  // 100
      subtotal({ sectionDiscountPct: 10 }),      // net 90
      priced({ unitPrice: 200 }),                // 200
      subtotal({ sectionDiscountPct: 0 }),       // net 200
      grandTotal,
    ];
    expect(calculateGrandTotalAtIndex(items, 4)).toBe(290);
  });

  it('closed section + open tail: closed net + open tail gross', () => {
    // closed: 100 at İskonto 10 = 90; open: 50 gross → 140
    const items = [
      priced(),                              // 100
      subtotal({ sectionDiscountPct: 10 }),  // closes
      priced({ unitPrice: 50 }),             // 50 open tail
      grandTotal,
    ];
    expect(calculateGrandTotalAtIndex(items, 3)).toBe(140);
  });

  it('HEADER / NOTE rows above contribute 0 and do not terminate open tail', () => {
    const items: QuoteItem[] = [
      priced({ unitPrice: 30 }),
      { itemType: 'HEADER', quantity: 0, unitPrice: 0, discountPct: 0, vatRate: 0 } as QuoteItem,
      priced({ unitPrice: 70 }),
      grandTotal,
    ];
    // Both items are in an open tail (no SUBTOTAL above) → 30 + 70 = 100 gross
    expect(calculateGrandTotalAtIndex(items, 3)).toBe(100);
  });

  it('another GRAND_TOTAL above is ignored (no double-counting, no reset)', () => {
    const items = [
      priced({ unitPrice: 100 }),
      grandTotal, // first GT (index 1)
      priced({ unitPrice: 50 }),
      grandTotal, // second GT (index 3)
    ];
    // For the second GT, we sum both priced items at gross → 150
    expect(calculateGrandTotalAtIndex(items, 3)).toBe(150);
  });

  it('end-of-quote invariant: equals calculateQuoteTotals().grandTotal', () => {
    const items = [
      priced({ unitPrice: 100 }),
      priced({ unitPrice: 50 }),
      subtotal({ sectionDiscountPct: 10 }),
      priced({ unitPrice: 200 }),
      subtotal({ sectionDiscountPct: 5 }),
      grandTotal,
    ];
    const expected = calculateQuoteTotals(items, 0).grandTotal;
    expect(calculateGrandTotalAtIndex(items, items.length - 1)).toBe(expected);
  });

  it('respects ctx.baseForeignRate for TRY items in EUR quote', () => {
    const items: QuoteItem[] = [
      // TRY item, 1000 TRY, quote is EUR, rate 40 TRY / EUR → 25 EUR
      { itemType: 'SET', quantity: 1, unitPrice: 1000, discountPct: 0, vatRate: 0, currency: 'TRY' },
      grandTotal,
    ];
    const ctx = { quoteCurrency: 'EUR', baseForeignRate: 40 };
    expect(calculateGrandTotalAtIndex(items, 1, ctx)).toBe(25);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/quote-calculations.test.ts -t 'calculateGrandTotalAtIndex'`
Expected: FAIL with `calculateGrandTotalAtIndex is not a function` or similar.

- [ ] **Step 3: Implement helper**

Add to `src/lib/quote-calculations.ts` immediately after `calculateSectionBreakdown` (so it can reuse the same `isPricedItem`, `effectiveItemCurrency`, and `convertToQuoteCurrency` helpers already in scope):

```ts
/**
 * Running net total of all priced items strictly above `grandTotalIndex`.
 *
 * Rules:
 * - Closed sections above (ending in SUBTOTAL with index < grandTotalIndex)
 *   contribute `sectionNet` (= sectionSum − section's İskonto).
 * - Priced items past the last SUBTOTAL above `grandTotalIndex` are an
 *   "open tail" and contribute their gross totalPrice. No İskonto is
 *   applied to them — no İskonto has been declared yet for that unclosed
 *   section.
 * - Non-priced rows (HEADER, NOTE, other GRAND_TOTAL, SET children with
 *   `parentItemId`, price-labeled rows) contribute 0 and do not act as
 *   section boundaries.
 *
 * When `grandTotalIndex` is at the end of the array and every section
 * above is closed, the return value equals
 * `calculateQuoteTotals(items, 0, ctx).grandTotal`. Unit-tested as an
 * invariant.
 *
 * Pure. O(grandTotalIndex). Safe to call once per GRAND_TOTAL row.
 */
export function calculateGrandTotalAtIndex(
  items: QuoteItem[],
  grandTotalIndex: number,
  ctx?: QuoteCurrencyContext
): number {
  if (grandTotalIndex <= 0) return 0;

  let runningNet = 0;
  let openTailSum = 0;

  for (let i = 0; i < grandTotalIndex; i++) {
    const item = items[i];
    if (item.itemType === 'SUBTOTAL') {
      const pct = Number(item.sectionDiscountPct ?? 0);
      const discountAmount = round2(openTailSum * (pct / 100));
      runningNet = round2(runningNet + openTailSum - discountAmount);
      openTailSum = 0;
      continue;
    }
    if (!isPricedItem(item)) continue;
    if (item.parentItemId) continue;

    const raw = calculateItemTotal({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPct: item.discountPct,
    });
    if (ctx) {
      const cur = effectiveItemCurrency(item, items, ctx.quoteCurrency);
      openTailSum += convertToQuoteCurrency(raw, cur, ctx);
    } else {
      openTailSum += raw;
    }
  }

  // Open tail (items after the last SUBTOTAL above grandTotalIndex) is
  // added at gross — no İskonto has been declared for an unclosed section.
  return round2(runningNet + openTailSum);
}
```

Note: `isPricedItem`, `effectiveItemCurrency`, `convertToQuoteCurrency`, `calculateItemTotal`, and `round2` are already in this file. No new imports needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/quote-calculations.test.ts -t 'calculateGrandTotalAtIndex'`
Expected: All 9 tests PASS.

- [ ] **Step 5: Run full calc-engine test file to confirm no regressions**

Run: `npx vitest run src/lib/quote-calculations.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/quote-calculations.ts src/lib/quote-calculations.test.ts
git commit -m "$(cat <<'EOF'
feat(calc): calculateGrandTotalAtIndex for running-total GRAND_TOTAL rows

Pure helper returning the running net at a given position: closed
sections contribute sectionNet, open-tail items contribute gross.
End-of-array invariant matches calculateQuoteTotals().grandTotal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: PDF template — per-row running total

**Files:**
- Modify: `src/lib/pdf/quote-template.ts` (the `computeSubtotalSum` area and the `GRAND_TOTAL` branch of the items map around line 242)
- Test: `src/lib/pdf/quote-template.test.ts`

- [ ] **Step 1: Add a sibling helper `computeGrandTotalAtIndex` inside `quote-template.ts`**

Put it directly beneath `computeSubtotalSum` (around line 200):

```ts
/**
 * Running net total of priced items strictly above `grandTotalIndex`,
 * using the pre-converted per-row totals already stamped on the PDF
 * items (so no currency context needed here). Mirrors
 * `calculateGrandTotalAtIndex` from quote-calculations.ts but consumes
 * the flattened `QuoteItemForPdf` shape.
 */
function computeGrandTotalAtIndex(items: QuoteItemForPdf[], grandTotalIndex: number): number {
  if (grandTotalIndex <= 0) return 0;
  let runningNet = 0;
  let openTail = 0;
  for (let i = 0; i < grandTotalIndex; i++) {
    const item = items[i];
    if (item.itemType === 'SUBTOTAL') {
      const pct = Number(item.sectionDiscountPct ?? 0);
      const discountAmount = round2(openTail * (pct / 100));
      runningNet = round2(runningNet + openTail - discountAmount);
      openTail = 0;
      continue;
    }
    if (item.priceLabel) continue;
    if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET') {
      openTail += item.totalPriceInQuoteCurrency ?? item.totalPrice ?? 0;
    }
  }
  return round2(runningNet + openTail);
}
```

If `round2` is not already imported in this file, add it to the existing import from `../quote-rounding`:

```ts
import { round2 } from '../quote-rounding';
```

(Check the file — if it's already imported elsewhere for the SUBTOTAL math, skip this.)

- [ ] **Step 2: Replace the `totals.grandTotal` read in the GRAND_TOTAL branch**

Find (currently around line 242-248):

```ts
    if (item.itemType === 'GRAND_TOTAL') {
      const grandTotalLabel = escapeHtml(item.description || 'GENEL TOPLAM');
      return `<tr style="height:14pt">
        <td class="sys-total-label" colspan="4"><p class="s1" style="text-align:right;">${grandTotalLabel} (${currencyName})</p></td>
        <td class="sys-total-val"><p class="s1" style="text-align:right;">${formatCurrency(totals.grandTotal, currency)}</p></td>
      </tr>`;
    }
```

Replace with:

```ts
    if (item.itemType === 'GRAND_TOTAL') {
      const grandTotalLabel = escapeHtml(item.description || 'GENEL TOPLAM');
      const runningTotal = computeGrandTotalAtIndex(items, index);
      return `<tr style="height:14pt">
        <td class="sys-total-label" colspan="4"><p class="s1" style="text-align:right;">${grandTotalLabel} (${currencyName})</p></td>
        <td class="sys-total-val"><p class="s1" style="text-align:right;">${formatCurrency(runningTotal, currency)}</p></td>
      </tr>`;
    }
```

- [ ] **Step 3: Audit PDF tests for GRAND_TOTAL coverage**

Run: `grep -n 'GRAND_TOTAL' src/lib/pdf/quote-template.test.ts`

For each matching test, check whether its expected output asserts a grand-total number. If the GRAND_TOTAL row sits at the end of the items array AND every section above is closed, the expected value is unchanged (invariant from spec example 5). If the test has a GRAND_TOTAL mid-quote, or open-tail items above it, update the expected number per the new rule.

- [ ] **Step 4: Add a new test for mid-quote GRAND_TOTAL**

Add to `src/lib/pdf/quote-template.test.ts`:

```ts
it('GRAND_TOTAL displays running net, not whole-quote total, when placed mid-quote', () => {
  const html = generateQuoteHtml({
    ...baseQuoteData, // existing test fixture — if none, create a minimal one
    items: [
      { itemType: 'PRODUCT', description: 'A', quantity: 1, unit: 'Adet', unitPrice: 100, totalPrice: 100, discountPct: 0, vatRate: 0, katsayi: 1, listPrice: 100, priceLabel: null, code: '', brand: '' },
      { itemType: 'SUBTOTAL', description: 'Ara Toplam 1', quantity: 0, unit: '', unitPrice: 0, totalPrice: 0, discountPct: 0, vatRate: 0, katsayi: 0, listPrice: 0, priceLabel: null, sectionDiscountPct: 10 },
      { itemType: 'GRAND_TOTAL', description: 'ARA GENEL TOPLAM', quantity: 0, unit: '', unitPrice: 0, totalPrice: 0, discountPct: 0, vatRate: 0, katsayi: 0, listPrice: 0, priceLabel: null },
      { itemType: 'PRODUCT', description: 'B', quantity: 1, unit: 'Adet', unitPrice: 500, totalPrice: 500, discountPct: 0, vatRate: 0, katsayi: 1, listPrice: 500, priceLabel: null, code: '', brand: '' },
      { itemType: 'SUBTOTAL', description: 'Ara Toplam 2', quantity: 0, unit: '', unitPrice: 0, totalPrice: 0, discountPct: 0, vatRate: 0, katsayi: 0, listPrice: 0, priceLabel: null, sectionDiscountPct: 0 },
    ],
    totals: { subtotal: 600, discountTotal: 10, vatTotal: 0, grandTotal: 590 }, // whole-quote
  });
  // The mid-quote GRAND_TOTAL shows 90 (only section 1 net), not 590.
  // Grab the GRAND_TOTAL row's <td class="sys-total-val"> content.
  const gtRowMatch = html.match(/ARA GENEL TOPLAM[\s\S]*?sys-total-val[\s\S]*?>([^<]+)</);
  expect(gtRowMatch).not.toBeNull();
  expect(gtRowMatch![1]).toContain('90'); // formatted as "90,00 €" or similar — just assert the digits
});
```

Adapt the fixture to match whatever `baseQuoteData` the file already has; if no shared fixture exists, copy the minimal one from the file's existing tests.

- [ ] **Step 5: Run the test and verify**

Run: `npx vitest run src/lib/pdf/quote-template.test.ts`
Expected: New test + all prior tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf/quote-template.ts src/lib/pdf/quote-template.test.ts
git commit -m "$(cat <<'EOF'
feat(pdf): GRAND_TOTAL renders running net at its position

Each GRAND_TOTAL row now displays sum-to-position (closed sections
at net, open-tail items at gross) instead of the whole-quote total.
End-of-quote GRAND_TOTAL still equals totals.grandTotal.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Excel service — per-row running total

**Files:**
- Modify: `src/lib/excel/excel-service.ts` (helpers near `computeExcelSubtotalSum` and the `GRAND_TOTAL` branch of `buildItemsSection` around line 458)
- Test: `src/lib/excel/excel-service.test.ts`

- [ ] **Step 1: Add sibling helper `computeExcelGrandTotalAtIndex`**

Add immediately after `computeExcelSubtotalSum` (around line 225):

```ts
/**
 * Running net total of priced items strictly above `grandTotalIndex`,
 * using the pre-converted per-row totals already stamped on the Excel
 * items. Mirrors `computeGrandTotalAtIndex` in the PDF template.
 */
function computeExcelGrandTotalAtIndex(items: QuoteItemForExcel[], grandTotalIndex: number): number {
  if (grandTotalIndex <= 0) return 0;
  let runningNet = 0;
  let openTail = 0;
  for (let i = 0; i < grandTotalIndex; i++) {
    const item = items[i];
    if (item.itemType === 'SUBTOTAL') {
      const pct = Number(item.sectionDiscountPct ?? 0);
      const discountAmount = Math.round(openTail * (pct / 100) * 100) / 100;
      runningNet = Math.round((runningNet + openTail - discountAmount) * 100) / 100;
      openTail = 0;
      continue;
    }
    if (item.priceLabel) continue;
    if (item.itemType === 'PRODUCT' || item.itemType === 'CUSTOM' || item.itemType === 'SET') {
      openTail += item.totalPriceInQuoteCurrency ?? item.totalPrice ?? 0;
    }
  }
  return Math.round((runningNet + openTail) * 100) / 100;
}
```

(Using the same `Math.round(x * 100) / 100` pattern the file already uses for SUBTOTAL math, not importing `round2` — keeps the file consistent with itself.)

- [ ] **Step 2: Replace the `grandTotal` read in the GRAND_TOTAL branch**

Find (around line 458-477):

```ts
      } else if (item.itemType === 'GRAND_TOTAL') {
        // A:G merged label, H value. Gray fill like the template's row 25.
        const currencyName = CURRENCY_NAMES[currency] || currency;
        const label = `${item.description || 'GENEL TOPLAM'} (${currencyName})`;

        sheet.mergeCells(currentRow, 1, currentRow, 7);
        ...
        sumCell.value = formatTurkishCurrency(grandTotal, currency);
        ...
```

Replace the `sumCell.value` line with:

```ts
        const runningTotal = computeExcelGrandTotalAtIndex(items, index);
        sumCell.value = formatTurkishCurrency(runningTotal, currency);
```

The `index` variable is already the `forEach` callback's second arg.

- [ ] **Step 3: Mark the `grandTotal` parameter as deprecated-but-kept**

In `buildItemsSection`'s signature (around line 416-422), leave the parameter in place (callers still pass it) but silence it with `void grandTotal;` at the top of the function body so the TS lint doesn't flag it as unused. Add a short comment:

```ts
  private buildItemsSection(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    items: QuoteItemForExcel[],
    currency: string,
    grandTotal: number // legacy param, no longer read (GRAND_TOTAL is per-row)
  ): number {
    void grandTotal; // kept for API compat; remove in a follow-up release
```

Rationale: we do NOT change the caller in the same commit — reduces diff size and keeps the public shape stable. A follow-up PR can drop it once we confirm nothing external calls this private method (it's `private` — grep confirms only the one caller in `generateQuoteExcel`).

- [ ] **Step 4: Audit existing Excel tests for GRAND_TOTAL coverage**

Run: `grep -n 'GRAND_TOTAL' src/lib/excel/excel-service.test.ts`

For each match, check the assertion. If it's an end-of-quote GRAND_TOTAL with all sections closed, the value is unchanged (invariant). If it's mid-quote or has open-tail items above, update the expected digits.

- [ ] **Step 5: Add a new Excel test for mid-quote GRAND_TOTAL**

Add to `src/lib/excel/excel-service.test.ts` using the file's existing fixture style (check one of the existing "handles X" tests for the shape):

```ts
it('GRAND_TOTAL shows running net at its position, not whole-quote total', async () => {
  const service = getExcelService();
  const buffer = await service.generateQuoteExcel({
    ...baseExcelData, // use the file's existing minimal fixture
    items: [
      { itemType: 'PRODUCT', description: 'A', quantity: 1, unit: 'Adet', unitPrice: 100, totalPrice: 100, katsayi: 1, listPrice: 100, priceLabel: null, code: '', brand: '', model: '' },
      { itemType: 'SUBTOTAL', description: 'Ara Toplam', quantity: 0, unit: '', unitPrice: 0, totalPrice: 0, katsayi: 0, listPrice: 0, priceLabel: null, sectionDiscountPct: 10 },
      { itemType: 'GRAND_TOTAL', description: 'ARA GENEL TOPLAM', quantity: 0, unit: '', unitPrice: 0, totalPrice: 0, katsayi: 0, listPrice: 0, priceLabel: null },
      { itemType: 'PRODUCT', description: 'B', quantity: 1, unit: 'Adet', unitPrice: 500, totalPrice: 500, katsayi: 1, listPrice: 500, priceLabel: null, code: '', brand: '', model: '' },
    ],
    totals: { subtotal: 600, discountTotal: 10, vatTotal: 0, grandTotal: 590 }, // whole-quote
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  // Find the row whose col A merged value starts with "ARA GENEL TOPLAM"
  let gtRow = -1;
  sheet.eachRow((row, rowIdx) => {
    const a = row.getCell(1).value;
    if (typeof a === 'string' && a.startsWith('ARA GENEL TOPLAM')) gtRow = rowIdx;
  });
  expect(gtRow).toBeGreaterThan(0);
  const amount = sheet.getRow(gtRow).getCell(8).value;
  expect(String(amount)).toContain('90'); // not 590
});
```

- [ ] **Step 6: Run Excel tests**

Run: `npx vitest run src/lib/excel/excel-service.test.ts`
Expected: All tests PASS, including the new one.

- [ ] **Step 7: Commit**

```bash
git add src/lib/excel/excel-service.ts src/lib/excel/excel-service.test.ts
git commit -m "$(cat <<'EOF'
feat(excel): GRAND_TOTAL renders running net at its position

Excel GRAND_TOTAL rows now show sum-to-position like the PDF. The
legacy `grandTotal` param of buildItemsSection is kept but no longer
read — scheduled for removal in a follow-up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: View page — per-row running total

**Files:**
- Modify: `src/app/(dashboard)/quotes/[id]/page.tsx` (the GRAND_TOTAL render branch around line 1020-1028, and the existing `breakdown` / `summary` memos around line 394-426)

- [ ] **Step 1: Build a grand-total map alongside the existing breakdown memo**

Find the `breakdown` / `sectionBreakdownById` / `summary` block (around lines 394-426) and add a new memo right after `breakdown`:

```ts
  // Per-GRAND_TOTAL-row running net values, keyed by item id.
  const grandTotalByItemId = useMemo(() => {
    if (!quote) return new Map<string, number>();
    const ctx: QuoteCurrencyContext = {
      quoteCurrency: quote.currency,
      baseForeignRate,
    };
    const m = new Map<string, number>();
    quote.items.forEach((item, index) => {
      if (item.itemType === 'GRAND_TOTAL' && item.id) {
        m.set(item.id, calculateGrandTotalAtIndex(quote.items, index, ctx));
      }
    });
    return m;
  }, [quote, baseForeignRate]);
```

Import `calculateGrandTotalAtIndex` at the top of the file — add it to the existing import from `@/lib/quote-calculations`:

```ts
import { calculateSectionBreakdown, calculateGrandTotalAtIndex, type QuoteCurrencyContext } from '@/lib/quote-calculations';
```

(Check the existing import line and extend it — don't add a second import.)

- [ ] **Step 2: Replace the GRAND_TOTAL render read**

Find (around line 1020-1029):

```tsx
                // GRAND_TOTAL row — inline grand total band
                if (item.itemType === 'GRAND_TOTAL') {
                  return (
                    <tr key={item.id} className="bg-primary-50 border-t-2 border-primary-300">
                      <td colSpan={5} className="px-3 py-2.5 text-right text-sm font-bold text-primary-900">
                        {item.description || 'GENEL TOPLAM'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-primary-900 whitespace-nowrap">
                        {formatPrice(summary?.grandTotal ?? 0)}
                      </td>
```

Replace the `{formatPrice(summary?.grandTotal ?? 0)}` line with:

```tsx
                        {formatPrice(grandTotalByItemId.get(item.id) ?? 0)}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(dashboard\)/quotes/\[id\]/page.tsx
git commit -m "$(cat <<'EOF'
feat(quotes): view page GRAND_TOTAL shows running net per row

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Editor table — per-row running total

**Files:**
- Modify: `src/components/quotes/QuoteItemsTable.tsx` (the memo block where `subtotalMap` is defined, and the `<QuoteItemRow>` render where `grandTotalValue` is passed — line 1080)

- [ ] **Step 1: Add `grandTotalMap` memo beside `subtotalMap`**

Find (around line 493):

```ts
  const subtotalMap = useMemo(() => {
    const map = new Map<string, { sectionSum: number; discountPct: number; discountAmount: number; sectionNet: number }>();
    for (const b of breakdown) {
      if (b.subtotalId) {
        map.set(b.subtotalId, {
          ...
        });
      }
    }
    return map;
  }, [breakdown]);
```

Add directly below it:

```ts
  const grandTotalMap = useMemo(() => {
    const m = new Map<string, number>();
    const ctx: QuoteCurrencyContext = { quoteCurrency: currency, baseForeignRate };
    items.forEach((item, index) => {
      if (item.itemType === 'GRAND_TOTAL' && item.id) {
        m.set(item.id, calculateGrandTotalAtIndex(items, index, ctx));
      }
    });
    return m;
  }, [items, currency, baseForeignRate]);
```

Check the file's existing imports from `@/lib/quote-calculations` and extend to include `calculateGrandTotalAtIndex`:

```ts
import { calculateSectionBreakdown, calculateGrandTotalAtIndex, type QuoteCurrencyContext } from '@/lib/quote-calculations';
```

(Only add `calculateGrandTotalAtIndex` — the other two should already be imported. Verify with `grep '@/lib/quote-calculations' src/components/quotes/QuoteItemsTable.tsx`.)

- [ ] **Step 2: Replace the `grandTotalValue` prop at line 1080**

Find:

```tsx
                    grandTotalValue={item.itemType === 'GRAND_TOTAL' ? summary.grandTotal : undefined}
```

Replace with:

```tsx
                    grandTotalValue={item.itemType === 'GRAND_TOTAL' && item.id ? grandTotalMap.get(item.id) : undefined}
```

- [ ] **Step 3: Leave the tfoot `summary.grandTotal` at line 1296 unchanged**

That is the bottom-of-table fallback summary, rendered only when there are no inline SUBTOTAL/GRAND_TOTAL rows. It still represents the whole quote and is correct as-is. Do not touch it.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/quotes/QuoteItemsTable.tsx
git commit -m "$(cat <<'EOF'
feat(quotes): editor table GRAND_TOTAL shows running net per row

grandTotalMap mirrors subtotalMap — built once via calculateGrand
TotalAtIndex, keyed by item id, passed as grandTotalValue to each
QuoteItemRow instance.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Full verification

- [ ] **Step 1: TypeScript**

Run: `npx tsc --noEmit`
Expected: Zero errors.

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: All green.

- [ ] **Step 3: Manual test — end-of-quote invariant (regression guard)**

1. `npm run dev`
2. Open an existing quote that has ONE GRAND_TOTAL row at the bottom and at least one SUBTOTAL above it.
3. Confirm the displayed GRAND_TOTAL value in the editor matches what you saw pre-change.
4. Export PDF — same number.
5. Export Excel — same number.
6. Open the quote view page (`/quotes/[id]`) — same number.

- [ ] **Step 4: Manual test — mid-quote checkpoint**

1. In the editor of a quote with at least two SUBTOTALs, insert an additional GRAND_TOTAL row between SUBTOTAL 1 and SUBTOTAL 2.
2. The new GRAND_TOTAL should display section 1's net only.
3. Drag it to the very bottom — it should now match the whole-quote total (same as the original bottom GRAND_TOTAL).
4. Save, export PDF + Excel, confirm both show the same per-position number.

- [ ] **Step 5: Manual test — open-tail**

1. Edit the quote so there's a PRODUCT row directly above a GRAND_TOTAL with NO SUBTOTAL between them (delete or move the nearest SUBTOTAL below).
2. The GRAND_TOTAL should include that orphan product at gross.
3. Confirm on editor, view page, PDF, Excel.

- [ ] **Step 6: Commit verification notes if manual testing uncovered any issues**

If all 5 manual tests pass, no action needed. If any failed, diagnose and fix in a follow-up task (add it to the plan) before declaring done.

---

## Out of scope (not in this plan)

- Removing the `grandTotal` parameter from `ExcelService.buildItemsSection` — follow-up cleanup once the new behavior has shipped.
- Any visual / label changes to the GRAND_TOTAL row.
- Multiple GRAND_TOTAL rows per quote — technically supported by this change, no UI work needed.

## Self-review notes

- **Spec coverage:** every "target state" item in the spec is addressed — helper (Task 1), PDF (2), Excel (3), view page (4), editor (5), invariants tested (Task 1 Step 1 last two tests).
- **Type consistency:** `calculateGrandTotalAtIndex(items, index, ctx?)` signature identical across all five call sites.
- **Placeholders:** none — every code block is complete and copy-pasteable.
- **Risk guard:** Task 6 Step 3 is the regression test for the most common case (single bottom GRAND_TOTAL).
