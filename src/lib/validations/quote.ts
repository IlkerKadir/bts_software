import { z } from 'zod';

export const quoteStatusEnum = z.enum([
  'TASLAK',
  'ONAY_BEKLIYOR',
  'ONAYLANDI',
  'GONDERILDI',
  'TAKIPTE',
  'REVIZYON',
  'KAZANILDI',
  'KAYBEDILDI',
  'IPTAL',
]);

export const currencyEnum = z.enum(['EUR', 'USD', 'GBP', 'TRY']);

export const quoteItemTypeEnum = z.enum(['PRODUCT', 'HEADER', 'NOTE', 'CUSTOM', 'SERVICE', 'SUBTOTAL']);

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
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().min(0, 'Quantity must be non-negative').default(1),
  unit: z.string().default('Adet'),
  listPrice: z.number().min(0, 'List price must be non-negative').default(0),
  katsayi: z.number().positive('Katsayi must be positive').default(1),
  discountPct: z.number().min(0).max(100, 'Discount cannot exceed 100%').default(0),
  vatRate: z.number().min(0).max(100).default(20),
  notes: z.string().nullish(),
});

export const quoteItemUpdateSchema = quoteItemSchema.extend({
  id: z.string().min(1, 'Item ID is required'),
  sortOrder: z.number().int().optional(),
  isManualPrice: z.boolean().optional(),
  unitPrice: z.number().optional(),
  totalPrice: z.number().optional(),
  parentItemId: z.string().nullish(),
});

export const bulkQuoteItemUpdateSchema = z.object({
  items: z.array(quoteItemUpdateSchema).min(1, 'At least one item is required'),
});

export const quoteStatusLabels: Record<string, string> = {
  TASLAK: 'Taslak',
  ONAY_BEKLIYOR: 'Onay Bekliyor',
  ONAYLANDI: 'Onaylandı',
  GONDERILDI: 'Gönderildi',
  TAKIPTE: 'Takipte',
  REVIZYON: 'Revizyon',
  KAZANILDI: 'Kazanıldı',
  KAYBEDILDI: 'Kaybedildi',
  IPTAL: 'İptal',
};
