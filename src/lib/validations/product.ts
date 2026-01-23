import { z } from 'zod';

export const productSchema = z.object({
  code: z.string().min(1, 'Ürün kodu gereklidir'),
  shortCode: z.string().optional().nullable(),
  brandId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  name: z.string().min(1, 'Ürün adı gereklidir'),
  nameTr: z.string().optional().nullable(),
  unit: z.string().optional().default('Adet'),
  listPrice: z.number().min(0, 'Liste fiyatı 0 veya daha büyük olmalıdır'),
  costPrice: z.number().min(0).optional().nullable(),
  currency: z.enum(['EUR', 'USD', 'GBP', 'TRY']).default('EUR'),
  supplier: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export type ProductInput = z.infer<typeof productSchema>;

export const productQuerySchema = z.object({
  search: z.string().optional(),
  brandId: z.string().optional(),
  categoryId: z.string().optional(),
  currency: z.string().optional(),
  isActive: z.string().transform(val => val === 'true').optional(),
  page: z.string().transform(Number).optional().default('1'),
  limit: z.string().transform(Number).optional().default('20'),
});
