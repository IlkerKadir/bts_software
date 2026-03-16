/**
 * Seed Mühendislik service products into the Product table.
 * Does NOT remove any existing records — uses upsert on unique code.
 *
 * Run: npx tsx scripts/seed-muh-products.ts
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

// Daily rates from ServiceSetPrice (days=1)
const DAILY_RATES: Record<string, Record<number, number>> = {
  '1': { 0: 8500, 50: 8675, 75: 9625, 150: 10150, 200: 10500, 250: 10850, 500: 14850, 750: 16600, 1000: 18350, 1250: 20100 },
  '2': { 50: 15550, 75: 16925, 150: 17450, 200: 17800, 250: 18150, 500: 24400, 750: 26150, 1000: 27900, 1250: 29650 },
};

interface ServiceProduct {
  code: string;
  shortCode: string;
  name: string;
  distanceKm: number;
  personCount: number;
  type: 'SUP' | 'TDA' | 'HEADER';
}

// Build the product list — unique combinations only
const products: ServiceProduct[] = [];

const distances = [
  { km: 50, label: 'İstanbul', codeLabel: 'IST' },
  { km: 75, label: 'Şehir Dışı 75km', codeLabel: '75' },
  { km: 150, label: 'Şehir Dışı 150km', codeLabel: '150' },
  { km: 200, label: 'Şehir Dışı 200km', codeLabel: '200' },
  { km: 250, label: 'Şehir Dışı 250km', codeLabel: '250' },
  { km: 500, label: 'Şehir Dışı 500km', codeLabel: '500' },
  { km: 750, label: 'Şehir Dışı 750km', codeLabel: '750' },
  { km: 1000, label: 'Şehir Dışı 1000km', codeLabel: '1000' },
  { km: 1250, label: 'Şehir Dışı 1250km', codeLabel: '1250' },
];

// Süpervizyon Hizmeti — 1 Kişi & 2 Kişi
for (const personCount of [1, 2]) {
  for (const d of distances) {
    products.push({
      code: `BTS-SUP-${d.codeLabel}-${personCount}K`,
      shortCode: d.codeLabel === 'IST' ? 'BTS-SUP-İST' : 'BTS-SHZ-Şİ',
      name: `Süpervizyon Hizmeti (${d.label}) ${personCount} Kişi`,
      distanceKm: d.km,
      personCount,
      type: 'SUP',
    });
  }
}

// Test ve Devreye Alma Hizmeti — Ofis (1 Kişi only) + distances
products.push({
  code: 'BTS-TDA-OFS-1K',
  shortCode: 'BTS-SUP-İST',
  name: 'Test ve Devreye Alma Hizmeti (Ofis) 1 Kişi',
  distanceKm: 0,
  personCount: 1,
  type: 'TDA',
});

for (const personCount of [1, 2]) {
  for (const d of distances) {
    products.push({
      code: `BTS-TDA-${d.codeLabel}-${personCount}K`,
      shortCode: d.codeLabel === 'IST' ? 'BTS-SUP-İST' : 'BTS-SHZ-Şİ',
      name: `Test ve Devreye Alma Hizmeti (${d.label}) ${personCount} Kişi`,
      distanceKm: d.km,
      personCount,
      type: 'TDA',
    });
  }
}

// Header product
products.push({
  code: 'BTS-MS.MH.T.v.DA',
  shortCode: 'BTS-MS.MH.T.v.DA',
  name: 'Montaj Süpervizörlüğü, Mühendislik, Test ve Devreye Alma Çalışmaları',
  distanceKm: 0,
  personCount: 0,
  type: 'HEADER',
});

async function main() {
  console.log(`Seeding ${products.length} mühendislik service products...`);

  // Ensure "Mühendislik" category exists
  const category = await db.productCategory.upsert({
    where: { name: 'Mühendislik' },
    update: {},
    create: { name: 'Mühendislik', sortOrder: 10 },
  });
  console.log(`Category: ${category.name} (${category.id})`);

  // Find BTS brand
  const brand = await db.productBrand.findFirst({ where: { name: 'BTS' } });
  if (!brand) {
    console.error('BTS brand not found! Please create it first.');
    process.exit(1);
  }
  console.log(`Brand: ${brand.name} (${brand.id})`);

  let created = 0;
  let updated = 0;

  for (const p of products) {
    // Look up daily rate for pricing
    const rateKey = String(p.personCount);
    const dailyRate = DAILY_RATES[rateKey]?.[p.distanceKm] ?? 0;

    const data = {
      shortCode: p.shortCode,
      brandId: brand.id,
      categoryId: category.id,
      name: p.name,
      nameTr: p.name,
      pricingType: 'LIST_PRICE' as const,
      unit: p.type === 'HEADER' ? 'Adet' : 'Kişi/Gün',
      listPrice: dailyRate,
      costPrice: null,
      currency: 'TRY',
      isActive: true,
    };

    const existing = await db.product.findUnique({ where: { code: p.code } });

    if (existing) {
      await db.product.update({ where: { code: p.code }, data });
      updated++;
    } else {
      await db.product.create({ data: { ...data, code: p.code } });
      created++;
    }

    console.log(`  ${existing ? 'Updated' : 'Created'}: ${p.code} — ${p.name} (₺${dailyRate})`);
  }

  console.log(`\nDone! Created: ${created}, Updated: ${updated}, Total: ${products.length}`);
}

main()
  .catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
