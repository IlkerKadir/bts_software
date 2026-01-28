import { z } from 'zod';

export const createUserSchema = z.object({
  username: z.string()
    .min(3, 'Kullanıcı adı en az 3 karakter olmalıdır')
    .max(50, 'Kullanıcı adı en fazla 50 karakter olabilir')
    .regex(/^[a-zA-Z0-9_]+$/, 'Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir'),
  password: z.string()
    .min(6, 'Şifre en az 6 karakter olmalıdır')
    .max(100, 'Şifre en fazla 100 karakter olabilir'),
  fullName: z.string()
    .min(2, 'Ad soyad en az 2 karakter olmalıdır')
    .max(100, 'Ad soyad en fazla 100 karakter olabilir'),
  email: z.string().email('Geçersiz e-posta adresi').optional().nullable().or(z.literal('')),
  roleId: z.string().min(1, 'Rol seçimi gereklidir'),
  isActive: z.boolean().optional().default(true),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  username: z.string()
    .min(3, 'Kullanıcı adı en az 3 karakter olmalıdır')
    .max(50, 'Kullanıcı adı en fazla 50 karakter olabilir')
    .regex(/^[a-zA-Z0-9_]+$/, 'Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir')
    .optional(),
  password: z.string()
    .min(6, 'Şifre en az 6 karakter olmalıdır')
    .max(100, 'Şifre en fazla 100 karakter olabilir')
    .optional(),
  fullName: z.string()
    .min(2, 'Ad soyad en az 2 karakter olmalıdır')
    .max(100, 'Ad soyad en fazla 100 karakter olabilir')
    .optional(),
  email: z.string().email('Geçersiz e-posta adresi').optional().nullable().or(z.literal('')),
  roleId: z.string().min(1, 'Rol seçimi gereklidir').optional(),
  isActive: z.boolean().optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userQuerySchema = z.object({
  search: z.string().optional(),
  roleId: z.string().optional(),
  isActive: z.string().transform(val => val === 'true').optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
});
