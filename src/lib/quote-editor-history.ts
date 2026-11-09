/**
 * Pure helpers that keep the quote editor's undo history consistent with
 * the server (client 10.2026 — "Geri al" broke saving).
 *
 * Optimistic inserts create rows with a temporary UUID id that is swapped
 * for the server's cuid once the POST returns — but only in the LIVE
 * items array. Undo snapshots taken while the POST was in flight keep the
 * temp id forever; restoring one used to block every later save. These
 * helpers remap / scrub ids inside snapshots, and compute which server
 * rows the user removed (deletes are deferred to the save).
 */
export interface HistoryRow {
  id: string;
  parentItemId?: string | null;
}

/** Server ids are Prisma cuids (no dashes); temp ids are UUIDs (dashes). */
export function isTempId(id: string): boolean {
  return id.includes('-');
}

/**
 * Rewrite temp ids (and children's parentItemId) to their resolved server
 * ids. Follows chains (a re-created row can be deleted and re-created
 * again: original → s1 → temp → s2), so older undo steps always land on
 * the current row. Returns the SAME array when nothing changed.
 */
export function remapTempIds<T extends HistoryRow>(rows: T[], map: ReadonlyMap<string, string>): T[] {
  if (map.size === 0) return rows;
  const resolve = (id: string): string | undefined => {
    let cur = id;
    for (let step = 0; step < 32; step++) {
      const next = map.get(cur);
      if (next === undefined || next === cur) break;
      cur = next;
    }
    return cur === id ? undefined : cur;
  };
  let changed = false;
  const next = rows.map((row) => {
    const id = resolve(row.id);
    const parent = row.parentItemId ? resolve(row.parentItemId) : undefined;
    if (!id && !parent) return row;
    changed = true;
    return { ...row, ...(id ? { id } : {}), ...(parent ? { parentItemId: parent } : {}) };
  });
  return changed ? next : rows;
}

/**
 * Drop the given ids and their children. Returns the SAME array when
 * nothing was removed.
 */
export function scrubIds<T extends HistoryRow>(rows: T[], ids: ReadonlySet<string>): T[] {
  if (ids.size === 0) return rows;
  const next = rows.filter(
    (row) => !ids.has(row.id) && !(row.parentItemId && ids.has(row.parentItemId)),
  );
  return next.length === rows.length ? rows : next;
}

/**
 * Server rows this editor knows about that are no longer in its state —
 * the user deleted them (or undid their insertion). Only ids this client
 * has seen are ever deleted, so rows another session added are safe.
 */
export function computeDeletedIds(knownServerIds: ReadonlySet<string>, rows: HistoryRow[]): string[] {
  const present = new Set(rows.map((r) => r.id));
  return Array.from(knownServerIds).filter((id) => !present.has(id));
}

/**
 * "Geri Al" across a save (client 06.11): rows of an undo snapshot that a
 * save already deleted on the server (id neither temp nor known) get a new
 * temp id, and their children are re-pointed to it, so they can be
 * re-created like inserts. With `revivable`, only those ids come back —
 * any other missing row (deleted by another session) is dropped together
 * with its children. Returns the rows (the same array when nothing is
 * missing) and new temp id → original id for every revived row.
 */
export function reviveGhostRows<T extends HistoryRow>(
  rows: T[],
  knownServerIds: ReadonlySet<string>,
  newId: () => string,
  revivable?: ReadonlySet<string>
): { rows: T[]; revived: Map<string, string> } {
  const missing = (row: T) => !isTempId(row.id) && !knownServerIds.has(row.id);
  const dropped = new Set<string>();
  for (const row of rows) {
    if (missing(row) && revivable && !revivable.has(row.id)) dropped.add(row.id);
  }
  for (const row of rows) {
    if (row.parentItemId && dropped.has(row.parentItemId)) dropped.add(row.id);
  }
  const tempOf = new Map<string, string>();
  for (const row of rows) {
    if (missing(row) && !dropped.has(row.id)) tempOf.set(row.id, newId());
  }
  const revived = new Map<string, string>();
  if (tempOf.size === 0 && dropped.size === 0) return { rows, revived };
  for (const [original, temp] of tempOf) revived.set(temp, original);
  const next: T[] = [];
  for (const row of rows) {
    if (dropped.has(row.id)) continue;
    const id = tempOf.get(row.id);
    const parent = row.parentItemId ? tempOf.get(row.parentItemId) : undefined;
    next.push(!id && !parent ? row : { ...row, ...(id ? { id } : {}), ...(parent ? { parentItemId: parent } : {}) });
  }
  return { rows: next, revived };
}
