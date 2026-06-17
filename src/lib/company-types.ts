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
