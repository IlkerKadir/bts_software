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
