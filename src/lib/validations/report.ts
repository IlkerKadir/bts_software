import { z } from 'zod';
import { QuoteStatus } from '@prisma/client';

export const reportQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.nativeEnum(QuoteStatus).optional(),
  companyId: z.string().optional(),
  createdById: z.string().optional(),
  currency: z.string().optional(),
  groupBy: z.enum(['status', 'company', 'user', 'month']).optional(),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;
