import { z } from 'zod';

export const quoteStatusEnum = z.enum([
  'TASLAK',
  'ONAY_BEKLIYOR',
  'DUZENLEME_TALEP_EDILDI',
  'ONAYLANDI',
  'GONDERILDI',
  'TAKIPTE',
  'REVIZYON',
  'KAZANILDI',
  'KAYBEDILDI',
  'IPTAL',
]);

export const currencyEnum = z.enum(['EUR', 'USD', 'GBP', 'TRY']);

export const quoteItemTypeEnum = z.enum(['PRODUCT', 'HEADER', 'NOTE', 'CUSTOM', 'SET', 'SUBTOTAL', 'GRAND_TOTAL']);

export const quoteQuerySchema = z.object({
  search: z.string().optional(),
  companyId: z.string().optional(),
  projectId: z.string().optional(),
  status: quoteStatusEnum.optional(),
  createdById: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
});

export const createQuoteSchema = z.object({
  companyId: z.string().min(1, 'Company ID is required'),
  projectId: z.string().optional(),
  subject: z.string().optional(),
  description: z.string().optional(),
  currency: currencyEnum.default('EUR'),
  validityDays: z.number().int().positive().default(30),
  notes: z.string().optional(),
});

export const quoteItemSchema = z.object({
  itemType: quoteItemTypeEnum,
  productId: z.string().nullish(),
  parentItemId: z.string().nullish(),
  code: z.string().nullish(),
  brand: z.string().nullish(),
  model: z.string().nullish(),
  description: z.string().min(1, 'Açıklama boş olamaz'),
  quantity: z.number().min(0, 'Miktar negatif olamaz').default(1),
  unit: z.string().default('Adet'),
  listPrice: z.number().min(0, 'Liste fiyatı negatif olamaz').default(0),
  katsayi: z.number().positive('Katsayı 0 veya negatif olamaz').default(1),
  discountPct: z.number().min(0, 'İskonto negatif olamaz').max(100, 'İskonto %100 üzerinde olamaz').default(0),
  vatRate: z.number().min(0).max(100).default(20),
  notes: z.string().nullish(),
  priceLabel: z.string().nullish(),
  costPrice: z.number().nullish(),
  /** Conversion factor (rate × (1 + protectionPct/100)) the editor
   *  computed at item-add time. Used by the server only when the
   *  client did NOT supply a costPrice (non-canViewCosts users) — the
   *  server multiplies the master Product.costPrice by this factor to
   *  reproduce the same converted cost a manager's editor would have
   *  written. canViewCosts users send costPrice directly, in which
   *  case this field is ignored. Optional for backward compatibility
   *  with older clients (server falls back to listPrice ratio). */
  costConversionFactor: z.number().positive().nullish(),
  ekMaliyetDelta: z.number().nullish(),
  /** Optional per-SET currency override. Only accepted on top-level SET
   *  rows. Semantic enforcement (value must match quote currency or be
   *  'TRY') is done at the route level where we know the parent quote. */
  currency: currencyEnum.nullish(),
  /** Per-section discount %. Only meaningful on SUBTOTAL rows; the API
   *  coerces it to null on non-SUBTOTAL rows so the DB never holds a
   *  stale value on a PRODUCT/CUSTOM/SET row. */
  sectionDiscountPct: z.number().min(0, 'İskonto negatif olamaz').max(100, 'İskonto %100 üzerinde olamaz').nullish(),
  /** Optional custom label for the section's İskonto line on PDF/Excel.
   *  Null → renderers fall back to "İskonto". Only meaningful on
   *  SUBTOTAL rows; coerced to null on other rows. */
  sectionDiscountLabel: z.string().max(50).nullish(),
});

export const quoteItemUpdateSchema = quoteItemSchema.extend({
  id: z.string().min(1, 'Item ID is required'),
  sortOrder: z.number().int().optional(),
  isManualPrice: z.boolean().optional(),
  unitPrice: z.number().optional(),
  totalPrice: z.number().optional(),
  parentItemId: z.string().nullish(),
  costPrice: z.number().nullish(),
  serviceMeta: z.any().nullish(),
});

export const bulkQuoteItemUpdateSchema = z.object({
  items: z.array(quoteItemUpdateSchema).min(1, 'At least one item is required'),
});

export const languageEnum = z.enum(['TR', 'EN']);

export const quoteUpdateSchema = z.object({
  companyId: z.string().optional(),
  projectId: z.string().nullable().optional(),
  quoteNumber: z.string().max(50).optional(),
  refNo: z.string().max(50).nullable().optional(),
  subject: z.string().optional(),
  description: z.string().nullable().optional(),
  currency: currencyEnum.optional(),
  exchangeRate: z.number().gt(0, 'Exchange rate must be greater than 0').lte(1000, 'Exchange rate must be at most 1000').optional(),
  protectionPct: z.number().gte(0, 'Protection % must be at least 0').lte(100, 'Protection % must be at most 100').optional(),
  protectionMap: z.any().optional(),
  /** Frozen rate matrix at last explicit rating. Passed from the
   *  client when the user applies new rates via the exchange-rate
   *  modal; persisted as-is. Shape: `{ from: { to: rate } }`. */
  rateSnapshot: z.record(z.string(), z.record(z.string(), z.number())).nullable().optional(),
  validityDays: z.number().gt(0, 'Validity days must be greater than 0').lte(365, 'Validity days must be at most 365').optional(),
  notes: z.string().nullable().optional(),
  language: languageEnum.optional(),
});

export const quoteStatusLabels: Record<string, string> = {
  TASLAK: 'Taslak',
  ONAY_BEKLIYOR: 'Onay Bekliyor',
  DUZENLEME_TALEP_EDILDI: 'Düzenleme Talep Edildi',
  ONAYLANDI: 'Onaylandı',
  GONDERILDI: 'Gönderildi',
  TAKIPTE: 'Takipte',
  REVIZYON: 'Revizyon',
  KAZANILDI: 'Kazanıldı',
  KAYBEDILDI: 'Kaybedildi',
  IPTAL: 'İptal',
};
