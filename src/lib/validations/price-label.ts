import { z } from 'zod';

export const priceLabelCreateSchema = z.object({
  label: z.string()
    .min(1, 'Etiket metni zorunludur')
    .max(200, 'Etiket metni en fazla 200 karakter olabilir'),
  sortOrder: z.number().int().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

export const priceLabelUpdateSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export type PriceLabelCreateInput = z.infer<typeof priceLabelCreateSchema>;
export type PriceLabelUpdateInput = z.infer<typeof priceLabelUpdateSchema>;
