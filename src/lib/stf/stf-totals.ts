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
