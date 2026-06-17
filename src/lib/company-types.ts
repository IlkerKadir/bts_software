/**
 * Single source of truth for firma tipi (CompanyType) values and their
 * Turkish labels. CLIENT / PARTNER are the original two; the rest were added
 * per the client's June 2026 request (kept additive — no existing data changed).
 */
export const COMPANY_TYPES = [
  'CLIENT',
  'PARTNER',
  'MUTEAHHIT',
  'SON_KULLANICI',
  'SOZLESMELI_BAYI',
  'ENTEGRATOR',
  'DANISMAN',
  'PROJE_FIRMASI',
  'DISTRIBUTOR',
  'URETICI',
] as const;

export type CompanyTypeValue = (typeof COMPANY_TYPES)[number];

export const COMPANY_TYPE_LABELS: Record<CompanyTypeValue, string> = {
  CLIENT: 'Müşteri',
  PARTNER: 'İş Ortağı',
  MUTEAHHIT: 'Müteahhit',
  SON_KULLANICI: 'Son Kullanıcı',
  SOZLESMELI_BAYI: 'Sözleşmeli Bayi',
  ENTEGRATOR: 'Entegratör',
  DANISMAN: 'Danışman',
  PROJE_FIRMASI: 'Proje Firması',
  DISTRIBUTOR: 'Distribütör',
  URETICI: 'Üretici',
};

/** {value,label} list for dropdowns, in display order. */
export const COMPANY_TYPE_OPTIONS = COMPANY_TYPES.map((value) => ({
  value,
  label: COMPANY_TYPE_LABELS[value],
}));

/** Turkish label for a type value, falling back to the raw value. */
export function companyTypeLabel(type: string): string {
  return COMPANY_TYPE_LABELS[type as CompanyTypeValue] ?? type;
}

/**
 * Normalize a free-text type string (from Excel import) to a CompanyType.
 * Accepts the enum value (CLIENT, MUTEAHHIT, ...), the Turkish label
 * (Müşteri, Müteahhit, ...), and legacy ASCII aliases for the original two.
 * Returns null when nothing matches.
 */
export function normalizeCompanyType(raw: string): CompanyTypeValue | null {
  // Plain (non-locale) upper-case applied symmetrically to input and labels.
  // Avoids the Turkish tr-TR quirk where ASCII "i" → "İ" (which would stop a
  // lowercase enum value like "distributor" from matching "DISTRIBUTOR").
  const upper = raw.trim().toUpperCase();

  const asEnum = COMPANY_TYPES.find((t) => t === upper);
  if (asEnum) return asEnum;

  const byLabel = COMPANY_TYPES.find(
    (t) => COMPANY_TYPE_LABELS[t].toUpperCase() === upper
  );
  if (byLabel) return byLabel;

  // Legacy ASCII aliases for the original two types.
  if (['MUSTERI', 'MÜŞTERI', 'MÜSTERI'].includes(upper)) return 'CLIENT';
  if (['IS ORTAGI', 'İŞ ORTAĞI', 'İŞ ORTAGI', 'IS ORTAĞI'].includes(upper)) return 'PARTNER';

  return null;
}
