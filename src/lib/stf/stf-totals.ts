/**
 * Order-level totals for an STF, computed from its line items so the stored
 * grandTotal/discountTotal never go stale after hand edits. Mirrors the
 * section-discount math in quote-template.ts: priced rows are PRODUCT/CUSTOM/SET
 * that are not priceLabel'd and not SET children (parentItemId set); each
 * SUBTOTAL applies its sectionDiscountPct to that section's open tail.
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

/**
 * Running grand total of all priced rows strictly BEFORE `index`, applying each
 * SUBTOTAL's section discount along the way. Used to render a GRAND_TOTAL
 * ("GENEL TOPLAM") marker row at its position — mirrors quote-template's
 * computeGrandTotalAtIndex but on the STF item shape (children excluded, since
 * a SET parent's totalPrice already carries them).
 */
export function computeStfGrandTotalAtIndex(items: StfTotalsItem[], index: number): number {
  if (index <= 0) return 0;
  let runningNet = 0;
  let openTail = 0;
  for (let i = 0; i < index; i++) {
    const it = items[i];
    if (it.itemType === 'SUBTOTAL') {
      const pct = Number(it.sectionDiscountPct ?? 0);
      const disc = pct > 0 ? round2(openTail * (pct / 100)) : 0;
      runningNet = round2(runningNet + openTail - disc);
      openTail = 0;
      continue;
    }
    if (isPriced(it)) openTail += Number(it.totalPrice) || 0;
  }
  return round2(runningNet + openTail);
}
