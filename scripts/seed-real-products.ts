/**
 * Seed real product database from real_database.xlsx
 * Clears existing quotes, quote-related data, and products, then seeds fresh products.
 * Keeps users, companies, projects, roles intact.
 *
 * Run with: npx tsx scripts/seed-real-products.ts
 */
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

// Currency normalization
function normalizeCurrency(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (upper === 'EURO' || upper === 'EUR') return 'EUR';
  if (upper === 'TL' || upper === 'TRY' || upper === 'TÜRK LİRASI') return 'TRY';
  if (upper === 'USD') return 'USD';
  if (upper === 'GBP') return 'GBP';
  return 'EUR'; // fallback
}

// Unit normalization
function normalizeUnit(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (lower === 'ad.' || lower === 'ad' || lower === 'adet') return 'Adet';
  if (lower === 'm.' || lower === 'm' || lower === 'metre') return 'Metre';
  if (lower === 'set' || lower === 'set.') return 'Set';
  if (lower === 'kişi/gün' || lower === 'kisi/gun') return 'Kişi/Gün';
  return 'Adet'; // fallback
}

async function main() {
  // Read Excel
  const wb = XLSX.readFile('real_database.xlsx');
  const ws = wb.Sheets['MARKALAR'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];

  // Header: MARKA, KATEGORİ, MODEL, KISA KOD, ÜRÜN KODU, AÇIKLAMA, BİRİM, LİSTE FİYATI, MALİYET FİYATI, PARA BİRİMİ, İNGİLİZCE AÇIKLAMA
  const dataRows = rows.slice(1).filter(row => (row as string[])[0] !== '');
  console.log(`Found ${dataRows.length} products in Excel`);

  // ── Step 1: Clear quote-related data ──
  console.log('\nClearing quote-related data...');

  // Delete in dependency order
  await prisma.quoteEkMaliyet.deleteMany();
  console.log('  - QuoteEkMaliyet cleared');

  await prisma.quoteHistory.deleteMany();
  console.log('  - QuoteHistory cleared');

  await prisma.quoteDocument.deleteMany();
  console.log('  - QuoteDocument cleared');

  await prisma.quoteCommercialTerm.deleteMany();
  console.log('  - QuoteCommercialTerm cleared');

  await prisma.quoteItem.deleteMany();
  console.log('  - QuoteItem cleared');

  await prisma.priceHistory.deleteMany();
  console.log('  - PriceHistory cleared');

  await prisma.orderConfirmation.deleteMany();
  console.log('  - OrderConfirmation cleared');

  await prisma.notification.deleteMany();
  console.log('  - Notification cleared');

  await prisma.quote.deleteMany();
  console.log('  - Quote cleared');

  // ── Step 2: Clear products ──
  console.log('\nClearing products...');
  await prisma.brandDiscount.deleteMany();
  await prisma.product.deleteMany();
  await prisma.productBrand.deleteMany();
  await prisma.productCategory.deleteMany();
  console.log('  - Products, brands, categories cleared');

  // ── Step 3: Create brands and categories ──
  console.log('\nCreating brands and categories...');

  const brandSet = new Set<string>();
  const categorySet = new Set<string>();
  for (const row of dataRows) {
    const r = row as string[];
    if (r[0]) brandSet.add(r[0].trim());
    if (r[1]) categorySet.add(r[1].trim());
  }

  // Create brands
  const brandMap = new Map<string, string>(); // name -> id
  let brandOrder = 0;
  for (const name of [...brandSet].sort()) {
    const brand = await prisma.productBrand.create({
      data: { name, sortOrder: brandOrder++ },
    });
    brandMap.set(name, brand.id);
  }
  console.log(`  - ${brandMap.size} brands created`);

  // Create categories
  const categoryMap = new Map<string, string>(); // name -> id
  let catOrder = 0;
  for (const name of [...categorySet].sort()) {
    const cat = await prisma.productCategory.create({
      data: { name, sortOrder: catOrder++ },
    });
    categoryMap.set(name, cat.id);
  }
  console.log(`  - ${categoryMap.size} categories created`);

  // ── Step 4: Create products ──
  console.log('\nCreating products...');

  const codesSeen = new Set<string>();
  let created = 0;
  let skipped = 0;

  for (const row of dataRows) {
    const r = row as (string | number)[];
    const brand = String(r[0]).trim();
    const category = String(r[1]).trim();
    const model = String(r[2]).trim() || null;
    const shortCode = String(r[3]).trim() || null;
    let code = String(r[4]).trim();
    const description = String(r[5]).trim();
    const unit = normalizeUnit(String(r[6]));
    const listPrice = typeof r[7] === 'number' ? r[7] : parseFloat(String(r[7])) || 0;
    const costPrice = typeof r[8] === 'number' ? r[8] : (String(r[8]).trim() ? parseFloat(String(r[8])) : null);
    const currency = normalizeCurrency(String(r[9]));
    const nameEn = String(r[10]).trim() || null;

    // Skip rows without code
    if (!code) {
      // Generate a code from brand + model if possible
      if (model) {
        code = model;
      } else {
        skipped++;
        continue;
      }
    }

    // Handle duplicate codes by appending suffix
    let uniqueCode = code;
    let suffix = 2;
    while (codesSeen.has(uniqueCode)) {
      uniqueCode = `${code}-${suffix}`;
      suffix++;
    }
    codesSeen.add(uniqueCode);

    const brandId = brandMap.get(brand) || null;
    const categoryId = categoryMap.get(category) || null;

    try {
      await prisma.product.create({
        data: {
          code: uniqueCode,
          shortCode,
          brandId,
          categoryId,
          model,
          name: description || model || uniqueCode,
          nameTr: null,
          nameEn,
          unit,
          listPrice,
          costPrice,
          currency,
          isActive: true,
        },
      });
      created++;
    } catch (err) {
      console.error(`  Error creating product ${uniqueCode}:`, err);
      skipped++;
    }
  }

  console.log(`\n  - ${created} products created`);
  if (skipped > 0) console.log(`  - ${skipped} products skipped`);

  // ── Summary ──
  console.log('\n=== SUMMARY ===');
  const brandCount = await prisma.productBrand.count();
  const catCount = await prisma.productCategory.count();
  const prodCount = await prisma.product.count();
  const userCount = await prisma.user.count();
  const companyCount = await prisma.company.count();
  const projectCount = await prisma.project.count();
  const quoteCount = await prisma.quote.count();

  console.log(`Brands: ${brandCount}`);
  console.log(`Categories: ${catCount}`);
  console.log(`Products: ${prodCount}`);
  console.log(`Users: ${userCount} (preserved)`);
  console.log(`Companies: ${companyCount} (preserved)`);
  console.log(`Projects: ${projectCount} (preserved)`);
  console.log(`Quotes: ${quoteCount} (cleared)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
