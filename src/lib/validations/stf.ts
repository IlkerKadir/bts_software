import { z } from 'zod';

const nullableStr = z.string().nullish().transform((v) => (v && v.trim() !== '' ? v : null));

export const stfItemSchema = z.object({
  id: z.string().optional(),
  sortOrder: z.number(),
  itemType: z.enum(['PRODUCT', 'HEADER', 'NOTE', 'SUBTOTAL', 'GRAND_TOTAL', 'SET', 'CUSTOM']),
  pozNo: nullableStr,
  code: nullableStr,
  brand: nullableStr,
  model: nullableStr,
  description: z.string().default(''),
  quantity: z.coerce.number().default(0),
  unit: z.string().default('Adet'),
  unitPrice: z.coerce.number().default(0),
  totalPrice: z.coerce.number().default(0),
  priceLabel: nullableStr,
  parentItemId: nullableStr,
  discountPct: z.coerce.number().default(0),
  sectionNote: nullableStr,
  sectionDiscountPct: z.coerce.number().nullish().transform((v) => (v == null ? null : v)),
  sectionDiscountLabel: nullableStr,
});

export const stfUpdateSchema = z.object({
  customerName: nullableStr,
  customerAddress: nullableStr,
  customerPhone: nullableStr,
  customerTaxInfo: nullableStr,
  projectName: nullableStr,
  quoteNo: nullableStr,
  refNo: nullableStr,
  formDate: z.string().nullish(),
  siparisNo: nullableStr,
  currency: z.string().default('TRY'),
  discountTotal: z.coerce.number().default(0),
  grandTotal: z.coerce.number().default(0),
  manufacturers: nullableStr,
  warranty: nullableStr,
  deliveryPlace: nullableStr,
  deliveryTime: nullableStr,
  paymentTerms: nullableStr,
  vatNote: nullableStr,
  notes: nullableStr,
  customerApprovalName: nullableStr,
  btsResponsibleName: nullableStr,
  items: z.array(stfItemSchema),
});

export type StfUpdateInput = z.infer<typeof stfUpdateSchema>;
