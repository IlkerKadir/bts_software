import { z } from 'zod';

export const companySchema = z.object({
  name: z.string().min(1, 'Firma adı gereklidir'),
  type: z.enum(['CLIENT', 'PARTNER'], {
    errorMap: () => ({ message: 'Firma tipi geçersiz' }),
  }),
  address: z.string().optional().nullable(),
  taxNumber: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email('Geçersiz e-posta adresi').optional().nullable().or(z.literal('')),
  contacts: z.array(z.object({
    name: z.string(),
    title: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
  })).optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export type CompanyInput = z.infer<typeof companySchema>;

export const companyQuerySchema = z.object({
  search: z.string().optional(),
  type: z.enum(['CLIENT', 'PARTNER']).optional(),
  isActive: z.string().transform(val => val === 'true').optional(),
  page: z.string().transform(Number).optional().default('1'),
  limit: z.string().transform(Number).optional().default('20'),
});
