import { z } from 'zod';

export const quoteQuerySchema = z.object({
  search: z.string().optional(),
  companyId: z.string().optional(),
  projectId: z.string().optional(),
  status: z.enum([
    'TASLAK',
    'ONAY_BEKLIYOR',
    'ONAYLANDI',
    'GONDERILDI',
    'TAKIPTE',
    'REVIZYON',
    'KAZANILDI',
    'KAYBEDILDI',
    'IPTAL',
  ]).optional(),
  createdById: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
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
