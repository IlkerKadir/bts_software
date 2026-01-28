import { z } from 'zod';

export const createRoleSchema = z.object({
  name: z.string()
    .min(2, 'Rol adı en az 2 karakter olmalıdır')
    .max(50, 'Rol adı en fazla 50 karakter olabilir'),
  canViewCosts: z.boolean().optional().default(false),
  canApprove: z.boolean().optional().default(false),
  canExport: z.boolean().optional().default(true),
  canManageUsers: z.boolean().optional().default(false),
  canEditProducts: z.boolean().optional().default(false),
  canDelete: z.boolean().optional().default(false),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string()
    .min(2, 'Rol adı en az 2 karakter olmalıdır')
    .max(50, 'Rol adı en fazla 50 karakter olabilir')
    .optional(),
  canViewCosts: z.boolean().optional(),
  canApprove: z.boolean().optional(),
  canExport: z.boolean().optional(),
  canManageUsers: z.boolean().optional(),
  canEditProducts: z.boolean().optional(),
  canDelete: z.boolean().optional(),
});

export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const roleQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
});
