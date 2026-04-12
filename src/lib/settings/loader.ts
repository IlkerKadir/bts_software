import 'server-only';
import { db } from '@/lib/db';
import { quoteDefaultsSchema, DEFAULT_QUOTE_DEFAULTS } from '@/lib/validations/quote-defaults';
import type { AppSettings } from './types';

const QUOTE_DEFAULTS_KEY = 'quote_defaults';

/**
 * Load all admin-editable settings in parallel for the dashboard shell.
 * Falls back to sane defaults if a row is missing or the JSON fails
 * validation — the page never blocks on a bad settings row.
 */
export async function loadAppSettings(): Promise<AppSettings> {
  const [row, priceLabels] = await Promise.all([
    db.systemSetting.findUnique({ where: { key: QUOTE_DEFAULTS_KEY } }),
    db.priceLabelOption.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: { id: true, label: true },
    }),
  ]);

  let quoteDefaults = DEFAULT_QUOTE_DEFAULTS;
  if (row) {
    const parsed = quoteDefaultsSchema.safeParse(row.value);
    if (parsed.success) {
      quoteDefaults = parsed.data;
    } else {
      // Bad admin save should not block the dashboard — log and use defaults.
      console.warn('[settings] quote_defaults row failed validation', parsed.error.flatten());
    }
  }

  return { quoteDefaults, priceLabels };
}
