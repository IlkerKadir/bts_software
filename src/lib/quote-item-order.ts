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

/**
 * sortOrder for a row added after every existing row. A count-based
 * `items.length + 1` collides with an existing row once rows were deleted
 * (or legacy numbers overlap), and two rows with the same sortOrder come
 * back in an arbitrary order on the next load (client 13.10 — "kopyalanan
 * serbest kalem bir satır kayıyor").
 */
export function nextSortOrder(items: readonly { sortOrder: number }[]): number {
  let max = 0;
  for (const it of items) {
    const n = Number(it.sortOrder);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return Math.max(Math.floor(max), items.length) + 1;
}

/**
 * Renumber rows 1..n in the order the editor shows them: each top-level row
 * followed by its children (array order). Saving these values makes the
 * stored order exactly the shown order and removes ties left by older
 * inserts. Rows whose parent is missing are kept, placed last. Unchanged
 * rows keep their object identity; the input is not mutated.
 */
export function renumberByDisplayOrder<T extends OrderableItem & { parentItemId?: string | null }>(
  items: readonly T[]
): T[] {
  const ids = new Set(items.map((i) => i.id));
  const childrenOf = new Map<string, T[]>();
  for (const it of items) {
    if (it.parentItemId && ids.has(it.parentItemId)) {
      const list = childrenOf.get(it.parentItemId) ?? [];
      list.push(it);
      childrenOf.set(it.parentItemId, list);
    }
  }
  const ordered: T[] = [];
  const placed = new Set<string>();
  const place = (it: T) => {
    if (placed.has(it.id)) return;
    placed.add(it.id);
    ordered.push(it);
    for (const child of childrenOf.get(it.id) ?? []) place(child);
  };
  for (const it of items) if (!it.parentItemId) place(it);
  for (const it of items) place(it); // orphans (and anything not reached) last
  return ordered.map((it, i) => (it.sortOrder === i + 1 ? it : { ...it, sortOrder: i + 1 }));
}
