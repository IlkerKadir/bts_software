/**
 * Seed the admin-editable settings catalog (quote defaults + price labels +
 * canManageSettings backfill). Idempotent — safe to re-run on any environment.
 *
 * Run with: npm run seed:admin   (or: npx tsx scripts/seed-admin-settings.ts)
 *
 * Seeds:
 *  - `SystemSetting` row `quote_defaults` with DEFAULT_QUOTE_DEFAULTS (units,
 *    defaultVatRate, currencies). Skipped if the row already exists so admin
 *    edits are never clobbered.
 *  - `PriceLabelOption` rows for the two stock phrases. Uses a deterministic
 *    `id` so re-running is a no-op.
 *  - Backfills `Role.canManageSettings` on any role that already has
 *    `canManageUsers=true` (matches the migration comment in
 *    20260412210000_add_can_manage_settings).
 */
import { PrismaClient } from '@prisma/client';
import { DEFAULT_QUOTE_DEFAULTS } from '../src/lib/validations/quote-defaults';

const prisma = new PrismaClient();

const QUOTE_DEFAULTS_KEY = 'quote_defaults';

const PRICE_LABELS = [
  { id: 'seed_tarafinizca', label: 'TARAFINIZCA SAĞLANACAKTIR', sortOrder: 0 },
  { id: 'seed_dahildir', label: 'FİYATA DAHİLDİR', sortOrder: 1 },
];

async function main() {
  console.log('🌱 Seeding admin settings…');

  // 1) quote_defaults SystemSetting row — only insert if missing.
  const existing = await prisma.systemSetting.findUnique({
    where: { key: QUOTE_DEFAULTS_KEY },
  });
  if (existing) {
    console.log(`  • quote_defaults row already exists — skipping`);
  } else {
    await prisma.systemSetting.create({
      data: {
        key: QUOTE_DEFAULTS_KEY,
        value: DEFAULT_QUOTE_DEFAULTS,
      },
    });
    console.log(`  ✔ quote_defaults row created with defaults`);
  }

  // 2) PriceLabelOption rows — upsert by id.
  for (const opt of PRICE_LABELS) {
    await prisma.priceLabelOption.upsert({
      where: { id: opt.id },
      update: {},
      create: {
        id: opt.id,
        label: opt.label,
        sortOrder: opt.sortOrder,
        isActive: true,
      },
    });
  }
  console.log(`  ✔ ${PRICE_LABELS.length} price label options ensured`);

  // 3) Backfill canManageSettings on existing admin roles.
  const result = await prisma.role.updateMany({
    where: { canManageUsers: true, canManageSettings: false },
    data: { canManageSettings: true },
  });
  if (result.count > 0) {
    console.log(`  ✔ backfilled canManageSettings on ${result.count} role(s)`);
  } else {
    console.log(`  • no roles needed canManageSettings backfill`);
  }

  console.log('✅ Admin settings seed complete');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
