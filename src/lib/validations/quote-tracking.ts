import { z } from 'zod';

export const LOST_REASONS = [
  'BUTCE_YETERSIZ',
  'RAKIPTEN_PAHALI',
  'RAKIP_MARKA_TERCIHI',
  'TEKNIK_YETERSIZLIK',
  'PROJE_IPTALI',
  'ODEME_KOSULLARI',
] as const;

export const QUOTE_PRIORITIES = ['A', 'B', 'C', 'D'] as const;

export const INTERACTION_TYPES = [
  'TELEFON',
  'EMAIL',
  'YUZ_YUZE',
  'ONLINE_TOPLANTI',
  'FUAR',
] as const;

/** Turkish labels for the UI / exports. */
export const LOST_REASON_LABELS: Record<(typeof LOST_REASONS)[number], string> = {
  BUTCE_YETERSIZ: 'Bütçe Yetersizliği',
  RAKIPTEN_PAHALI: 'Rakipten Pahalı Kalmak',
  RAKIP_MARKA_TERCIHI: 'Rakip Marka Tercihi',
  TEKNIK_YETERSIZLIK: 'Teknik Şartname / Yetersizlik',
  PROJE_IPTALI: 'Proje İptali',
  ODEME_KOSULLARI: 'Ödeme Koşulları',
};

export const INTERACTION_TYPE_LABELS: Record<(typeof INTERACTION_TYPES)[number], string> = {
  TELEFON: 'Telefon',
  EMAIL: 'E-mail',
  YUZ_YUZE: 'Yüz Yüze Ziyaret',
  ONLINE_TOPLANTI: 'Online Toplantı',
  FUAR: 'Fuar',
};

// Empty string → null helper for optional enum/string/date fields from a form.
const emptyToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), schema.nullable());

/** PUT body: the overwrite-on-save static tracking fields. */
export const quoteTrackingSchema = z.object({
  priority: emptyToNull(z.enum(QUOTE_PRIORITIES)),
  successPct: emptyToNull(z.coerce.number().int().min(0).max(100)),
  expectedOrderDate: emptyToNull(z.string()),
  lostReason: emptyToNull(z.enum(LOST_REASONS)),
  lostCompetitor: emptyToNull(z.string().max(255)),
});

/** POST body: one appended interaction-log entry. */
export const quoteInteractionSchema = z.object({
  type: z.enum(INTERACTION_TYPES),
  note: z.string().min(1, 'İletişim notu gereklidir'),
  interactionDate: z.string().optional().nullable(),
  reminderDate: emptyToNull(z.string()),
});

export type QuoteTrackingInput = z.infer<typeof quoteTrackingSchema>;
export type QuoteInteractionInput = z.infer<typeof quoteInteractionSchema>;
