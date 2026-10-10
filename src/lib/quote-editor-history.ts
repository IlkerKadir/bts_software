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
 * ids. Returns the SAME array when nothing changed.
 */
export function remapTempIds<T extends HistoryRow>(rows: T[], map: ReadonlyMap<string, string>): T[] {
  if (map.size === 0) return rows;
  let changed = false;
  const next = rows.map((row) => {
    const id = map.get(row.id);
    const parent = row.parentItemId ? map.get(row.parentItemId) : undefined;
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
