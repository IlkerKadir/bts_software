/**
 * Shared helper for computing effective cost price including ek maliyet delta.
 * Lives in its own file (no server-only imports) so it can be used in both
 * client and server code.
 */

/**
 * Compute the effective cost price for an item, including any ek maliyet delta.
 * Returns null only when base cost is null AND there's no delta applied.
 */
export function getEffectiveCostPrice(item: {
  costPrice?: number | string | null | { toString(): string };
  ekMaliyetDelta?: number | string | null | { toString(): string };
}): number | null {
  const base = item.costPrice != null ? Number(item.costPrice) : null;
  const delta = item.ekMaliyetDelta != null ? Number(item.ekMaliyetDelta) : 0;
  if (delta > 0) return (base ?? 0) + delta;
  return base;
}

interface SetChildCostItem {
  costPrice?: number | string | null | { toString(): string };
  ekMaliyetDelta?: number | string | null | { toString(): string };
  quantity?: number | string | null;
}

/**
 * Effective per-set cost for a SET parent, summed from its child rows.
 *
 * A SET parent carries no own `costPrice` — the cost lives in its children — so
 * its own `getEffectiveCostPrice` is null and the Maliyet column would show "-".
 * We sum each child's effective cost × child quantity. Child quantities are
 * stored per ONE set (a child total equals the SET's per-unit price), so this
 * yields the SET's per-unit cost — directly comparable to the SET's unitPrice.
 *
 * Children WITHOUT a cost are skipped (only the ones with a cost are summed).
 * Returns null when NO child has a cost, so the UI shows "-" instead of a
 * misleading 0 (and a 100% margin). Parent and children share the SET's
 * currency, so no conversion is needed here.
 */
export function getSetEffectiveCostPrice(children: SetChildCostItem[]): number | null {
  let sum = 0;
  let anyCost = false;
  for (const child of children) {
    const cost = getEffectiveCostPrice(child);
    if (cost == null) continue;
    sum += cost * (Number(child.quantity) || 0);
    anyCost = true;
  }
  return anyCost ? sum : null;
}
