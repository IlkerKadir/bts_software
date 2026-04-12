'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { AppSettings } from '@/lib/settings/types';
import { DEFAULT_QUOTE_DEFAULTS } from '@/lib/validations/quote-defaults';

const SettingsContext = createContext<AppSettings | null>(null);

interface Props {
  initial: AppSettings;
  children: ReactNode;
}

/**
 * Wraps the dashboard tree with pre-loaded admin settings. The initial
 * value is fetched server-side in `loadAppSettings()` and passed down
 * as a prop, so client components using `useSettings()` read synchronously
 * with no loading state.
 *
 * Re-fetches happen on full navigation (Next.js re-runs the server
 * layout). Admins saving settings then picking a refresh path is out
 * of scope for v1; stale reads clear on the next full reload.
 */
export function SettingsProvider({ initial, children }: Props) {
  return (
    <SettingsContext.Provider value={initial}>
      {children}
    </SettingsContext.Provider>
  );
}

/**
 * Read the admin-editable settings. Returns the fallback defaults if
 * called outside the provider (e.g. a test that doesn't wrap in
 * SettingsProvider — we prefer degraded UX over a hard crash).
 */
export function useSettings(): AppSettings {
  const ctx = useContext(SettingsContext);
  if (ctx) return ctx;
  // Fallback for tests / stories rendered outside the provider.
  return { quoteDefaults: DEFAULT_QUOTE_DEFAULTS, priceLabels: [] };
}
