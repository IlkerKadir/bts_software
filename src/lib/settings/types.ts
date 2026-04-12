import type { QuoteDefaults } from '@/lib/validations/quote-defaults';

/**
 * The shape preloaded at the dashboard layout boundary and passed
 * through `SettingsProvider` → `useSettings()`. Read-only at runtime
 * — admins save via the settings pages, then a full navigation
 * refresh brings the new values in.
 */
export interface AppSettings {
  quoteDefaults: QuoteDefaults;
  priceLabels: ReadonlyArray<{ id: string; label: string }>;
}
