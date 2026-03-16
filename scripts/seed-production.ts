/**
 * Production seed: creates only the minimum needed to start using the app.
 * - 2 roles: Yönetim (full access) and Satış (limited)
 * - 1 admin user (lceylan)
 *
 * Run with: npx tsx scripts/seed-production.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding production essentials...\n');

  // ── Roles ──
  const yonetim = await prisma.role.upsert({
    where: { name: 'Yonetim' },
    update: {},
    create: {
      name: 'Yonetim',
      canViewCosts: true,
      canApprove: true,
      canExport: true,
      canManageUsers: true,
      canEditProducts: true,
      canDelete: true,
      canOverrideKatsayi: true,
    },
  });
  console.log('✓ Role: Yonetim');

  const satis = await prisma.role.upsert({
    where: { name: 'Satis' },
    update: {},
    create: {
      name: 'Satis',
      canViewCosts: false,
      canApprove: false,
      canExport: true,
      canManageUsers: false,
      canEditProducts: false,
      canDelete: false,
      canOverrideKatsayi: false,
    },
  });
  console.log('✓ Role: Satis');

  // ── Admin User ──
  const passwordHash = await bcrypt.hash('Bts2026!', 12);

  await prisma.user.upsert({
    where: { username: 'lceylan' },
    update: {},
    create: {
      username: 'lceylan',
      passwordHash,
      fullName: 'Levent Ceylan',
      email: 'leventceylan@btsyangin.com.tr',
      roleId: yonetim.id,
      isActive: true,
    },
  });
  console.log('✓ User: lceylan (Yonetim)');

  console.log('\n=== Done ===');
  console.log('Login: lceylan / Bts2026!');
  console.log('You can add more users from Settings > Kullanıcılar');
  console.log('You can import products from Ürünler > Excel\'den Yükle');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
