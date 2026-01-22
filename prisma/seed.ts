import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create roles
  const adminRole = await prisma.role.upsert({
    where: { name: 'Yönetici' },
    update: {},
    create: {
      name: 'Yönetici',
      canViewCosts: true,
      canApprove: true,
      canExport: true,
      canManageUsers: true,
      canEditProducts: true,
      canDelete: true,
    },
  });

  const managerRole = await prisma.role.upsert({
    where: { name: 'Satış Müdürü' },
    update: {},
    create: {
      name: 'Satış Müdürü',
      canViewCosts: true,
      canApprove: true,
      canExport: true,
      canManageUsers: false,
      canEditProducts: false,
      canDelete: false,
    },
  });

  const salesRole = await prisma.role.upsert({
    where: { name: 'Satış Temsilcisi' },
    update: {},
    create: {
      name: 'Satış Temsilcisi',
      canViewCosts: false,
      canApprove: false,
      canExport: true,
      canManageUsers: false,
      canEditProducts: false,
      canDelete: false,
    },
  });

  console.log('✅ Roles created');

  // Create admin user
  const passwordHash = await bcrypt.hash('admin123', 12);

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      passwordHash,
      fullName: 'Sistem Yöneticisi',
      email: 'admin@bts.com',
      roleId: adminRole.id,
      isActive: true,
    },
  });

  console.log('✅ Admin user created (username: admin, password: admin123)');

  // Create sample brands
  const brands = ['ZETA', 'XTRALIS', 'NOTIFIER', 'HOCHIKI'];
  for (const name of brands) {
    await prisma.productBrand.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder: brands.indexOf(name) },
    });
  }

  console.log('✅ Brands created');

  // Create sample categories
  const categories = [
    'Dedektörler',
    'Modüller',
    'Paneller',
    'Sirenler',
    'VESDA Sistemleri',
    'Güç Kaynakları',
    'Aksesuarlar',
  ];
  for (const name of categories) {
    await prisma.productCategory.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder: categories.indexOf(name) },
    });
  }

  console.log('✅ Categories created');

  // Create commercial term templates
  const terms = [
    { category: 'payment', name: 'Peşin', value: 'Peşin ödeme', isDefault: true },
    { category: 'payment', name: 'Banka Havalesi', value: 'Banka havalesi ile 30 gün vadeli', isDefault: false },
    { category: 'payment', name: 'Çek', value: 'Çek ile 60 gün vadeli', isDefault: false },
    { category: 'delivery', name: '2-4 Hafta', value: 'Sipariş sonrası 2-4 hafta', isDefault: true },
    { category: 'delivery', name: '4-6 Hafta', value: 'Sipariş sonrası 4-6 hafta', isDefault: false },
    { category: 'delivery', name: '6-8 Hafta', value: 'Sipariş sonrası 6-8 hafta', isDefault: false },
    { category: 'warranty', name: '1 Yıl', value: '1 yıl garanti', isDefault: false },
    { category: 'warranty', name: '2 Yıl', value: '2 yıl garanti', isDefault: true },
    { category: 'teslim_yeri', name: 'Şantiye', value: 'Şantiyeye teslim', isDefault: true },
    { category: 'teslim_yeri', name: 'Depo', value: 'Depomuzdan teslim', isDefault: false },
    { category: 'vat', name: '%20 KDV', value: 'Fiyatlara KDV dahil değildir (%20)', isDefault: true },
    { category: 'vat', name: '%10 KDV', value: 'Fiyatlara KDV dahil değildir (%10)', isDefault: false },
  ];

  for (const term of terms) {
    await prisma.commercialTermTemplate.upsert({
      where: { category_name: { category: term.category, name: term.name } },
      update: {},
      create: {
        ...term,
        sortOrder: terms.filter((t) => t.category === term.category).indexOf(term),
      },
    });
  }

  console.log('✅ Commercial term templates created');

  // Create sample exchange rates
  const rates = [
    { from: 'EUR', to: 'TRY', rate: 36.85 },
    { from: 'USD', to: 'TRY', rate: 35.50 },
    { from: 'GBP', to: 'TRY', rate: 44.20 },
    { from: 'EUR', to: 'USD', rate: 1.08 },
    { from: 'EUR', to: 'GBP', rate: 0.83 },
    { from: 'USD', to: 'GBP', rate: 0.77 },
  ];

  for (const rate of rates) {
    await prisma.exchangeRate.create({
      data: {
        fromCurrency: rate.from,
        toCurrency: rate.to,
        rate: rate.rate,
        source: 'MANUAL',
        isManual: true,
      },
    });
  }

  console.log('✅ Exchange rates created');

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
