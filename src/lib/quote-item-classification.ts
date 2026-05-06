/**
 * Classification helpers for quote items, shared between:
 *
 *  - `recalcItemPrices` in `QuoteEditor.tsx` (which decides what to
 *    actually recompute when rates or currency change)
 *  - `RateUpdateDialog` (which previews "how many items will be
 *    affected" before the user commits)
 *
 * Keeping a single predicate avoids the classic drift where the
 * preview dialog says "5 items affected" but `recalcItemPrices`
 * only touches 4 because one of its skip conditions disagreed.
 */

export interface ClassificationInput {
  itemType: string;
  parentItemId?: string | null;
  isManualPrice?: boolean;
  priceLabel?: string | null;
  productCurrency?: string | null;
  productListPrice?: number | string | null;
  productCostPrice?: number | string | null;
}

/**
 * Narrowed shape after `isRateSensitiveRow` returns true. The
 * critical narrowing is that `productCurrency` and
 * `productListPrice` are guaranteed non-null — callers (specifically
 * `recalcItemPrices`) rely on this to avoid redundant null checks.
 */
export type RateSensitiveRow<T extends ClassificationInput> = T & {
  productCurrency: string;
  productListPrice: number | string;
};

/**
 * Returns true when the row is one that `recalcItemPrices` will
 * actually touch during a rate change. False for structural rows,
 * SET parents (rolled up from children), manual-priced rows,
 * price-labeled rows (e.g. "TARAFINIZCA SAĞLANACAKTIR"), and
 * free-form items that have no product reference to derive from.
 *
 * Exactly mirrors the inline skip conditions in `recalcItemPrices`.
 * If those conditions change, update this predicate first and let
 * the editor import from here.
 *
 * Declared as a TypeScript type guard so callers get non-null
 * narrowing on `productCurrency` / `productListPrice` after a true
 * branch.
 */
export function isRateSensitiveRow<T extends ClassificationInput>(
  item: T
): item is RateSensitiveRow<T> {
  // Structural rows have no price.
  if (
    item.itemType === 'HEADER' ||
    item.itemType === 'NOTE' ||
    item.itemType === 'SUBTOTAL' ||
    item.itemType === 'GRAND_TOTAL'
  ) {
    return false;
  }
  // SET parents are rolled up from children, not recomputed directly.
  if (item.itemType === 'SET' && !item.parentItemId) return false;
  // Price-labeled rows replace the price with a literal string —
  // currency math doesn't apply.
  if (item.priceLabel) return false;
  // Manual-priced rows are user commitments, not rate-derived.
  if (item.isManualPrice) return false;
  // Need a productCurrency and at least one numeric source to derive
  // against. Insurance / service products often have listPrice=0 but
  // a real costPrice — those still need to recompute their cost on a
  // currency change. Only when BOTH list and cost are absent do we
  // bail. The recompute math handles listPrice=0 cleanly (0 × rate =
  // 0), so no special-casing is needed in callers.
  const listPrice = item.productListPrice == null ? null : Number(item.productListPrice);
  const costPrice = item.productCostPrice == null ? null : Number(item.productCostPrice);
  if (!item.productCurrency || listPrice == null) return false;
  if (listPrice === 0 && costPrice == null) return false;
  return true;
}

/** True for SET parents — rolled up from children after child recalc. */
export function isSetParentRow(item: ClassificationInput): boolean {
  return item.itemType === 'SET' && !item.parentItemId;
}

/**
 * True for rows that are "user commitments" — their displayed price
 * is whatever the user typed or locked, and rate updates must NOT
 * silently rewrite them. Used by the preview dialog's ⚠ bucket.
 *
 * Structural rows and price-labeled rows are excluded from BOTH
 * sides of the bucket (they're not interesting in the preview).
 */
export function isManualCommitmentRow(item: ClassificationInput): boolean {
  if (
    item.itemType === 'HEADER' ||
    item.itemType === 'NOTE' ||
    item.itemType === 'SUBTOTAL' ||
    item.itemType === 'GRAND_TOTAL'
  ) {
    return false;
  }
  if (item.priceLabel) return false;
  if (item.itemType === 'SET' && !item.parentItemId) return false;
  if (item.isManualPrice) return true;
  // Free-form row with no catalog reference — also a commitment.
  // Mirror of isRateSensitiveRow: an insurance/service item with
  // listPrice=0 but a non-null costPrice IS rate-sensitive (its cost
  // updates on currency change), so it shouldn't be classified as a
  // manual commitment.
  const listPrice = item.productListPrice == null ? null : Number(item.productListPrice);
  const costPrice = item.productCostPrice == null ? null : Number(item.productCostPrice);
  if (!item.productCurrency || listPrice == null) return true;
  if (listPrice === 0 && costPrice == null) return true;
  return false;
}
