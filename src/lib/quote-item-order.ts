/**
 * Ordering helpers for quote line items.
 *
 * Quote items render in `sortOrder` order (the list API sorts by it), so any
 * positional insert must renumber the affected rows and persist them.
 */
export interface OrderableItem {
  id: string;
  sortOrder: number;
}

/**
 * Insert `newItem` immediately before the row with id `beforeId`, then renumber
 * every row's `sortOrder` sequentially from 1. When `beforeId` is null or not
 * found, the item is appended. Inputs are not mutated.
 */
export function insertItemBefore<T extends OrderableItem>(
  items: T[],
  newItem: T,
  beforeId: string | null
): T[] {
  const idx = beforeId == null ? -1 : items.findIndex((i) => i.id === beforeId);
  const at = idx < 0 ? items.length : idx;
  const next = [...items.slice(0, at), newItem, ...items.slice(at)];
  return next.map((it, i) => ({ ...it, sortOrder: i + 1 }));
}
