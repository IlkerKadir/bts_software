import { z } from 'zod';

export const projectSchema = z.object({
  name: z.string().min(1, 'Proje adı gereklidir'),
  clientId: z.string().optional().nullable(),
  status: z.enum(['TEKLIF_ASAMASINDA', 'ONAYLANDI', 'DEVAM_EDIYOR', 'TAMAMLANDI', 'IPTAL'], {
    message: 'Geçersiz proje durumu',
  }),
  estimatedStart: z.string().optional().nullable(),
  estimatedEnd: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export type ProjectInput = z.infer<typeof projectSchema>;

export const projectQuerySchema = z.object({
  search: z.string().optional(),
  clientId: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
});
