import { z } from 'zod';

/**
 * Shape of the `quote_defaults` SystemSetting row. Small fixed-arity
 * knobs that live together in one JSON blob so admins don't need three
 * separate tables.
 */
export const quoteDefaultsSchema = z.object({
  units: z.array(z.string().min(1).max(50)).min(1, 'En az bir birim gerekli'),
  defaultVatRate: z.number().min(0).max(100),
  currencies: z.array(
    z.object({
      code: z.enum(['EUR', 'USD', 'GBP', 'TRY']),
      symbol: z.string().min(1).max(5),
      label: z.string().min(1).max(50),
    })
  ).min(1, 'En az bir para birimi gerekli'),
});

export type QuoteDefaults = z.infer<typeof quoteDefaultsSchema>;

/** Hardcoded fallback used if the SystemSetting row is missing. */
export const DEFAULT_QUOTE_DEFAULTS: QuoteDefaults = {
  units: ['Adet', 'Metre', 'Set', 'Kişi/Gün'],
  defaultVatRate: 20,
  currencies: [
    { code: 'EUR', symbol: '€', label: 'Euro' },
    { code: 'USD', symbol: '$', label: 'Dolar' },
    { code: 'GBP', symbol: '£', label: 'Sterlin' },
    { code: 'TRY', symbol: '₺', label: 'Türk Lirası' },
  ],
};
