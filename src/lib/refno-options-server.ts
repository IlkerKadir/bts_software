import 'server-only';

import { db } from '@/lib/db';
import {
  DEFAULT_REFNO_OPTIONS,
  SETTING_KEY,
  type RefNoOptionGroups,
} from '@/lib/refno-options';

/** Server-side: load admin overrides from SystemSetting, fall back to defaults.
 *  Lives here (with `server-only` at the top) so the client bundle for
 *  RefNoBuilderModal can import the constants/types from
 *  `refno-options.ts` without dragging in Prisma. */
export async function loadRefNoOptions(): Promise<RefNoOptionGroups> {
  const row = await db.systemSetting.findUnique({ where: { key: SETTING_KEY } });
  if (!row) return DEFAULT_REFNO_OPTIONS;
  const stored = row.value as Partial<RefNoOptionGroups> | null;
  if (!stored || typeof stored !== 'object') return DEFAULT_REFNO_OPTIONS;
  return {
    a: Array.isArray(stored.a) && stored.a.length > 0 ? stored.a : DEFAULT_REFNO_OPTIONS.a,
    b: Array.isArray(stored.b) && stored.b.length > 0 ? stored.b : DEFAULT_REFNO_OPTIONS.b,
    c: Array.isArray(stored.c) && stored.c.length > 0 ? stored.c : DEFAULT_REFNO_OPTIONS.c,
    d: Array.isArray(stored.d) && stored.d.length > 0 ? stored.d : DEFAULT_REFNO_OPTIONS.d,
  };
}
