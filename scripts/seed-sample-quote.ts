import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seeds a single sample quote that demonstrates ALL new item types:
 * - PRODUCT items with different units
 * - HEADER sections
 * - NOTE items
 * - SUBTOTAL rows (section-based)
 * - CUSTOM items (montaj/installation)
 * - SERVICE parent (SET) with sub-rows
 * - SERVICE individual (Kişi/Gün)
 *
 * Does NOT delete any existing data.
 */
async function main() {
  console.log('Creating sample quote with all item types...\n');

  // Get existing references
  const user = await prisma.user.findFirst({ where: { username: 'lceylan' } });
  if (!user) throw new Error('User lceylan not found. Run prisma/seed.ts first.');

  const company = await prisma.company.findFirst({ where: { name: { contains: 'Akdeniz' } } });
  if (!company) throw new Error('Company Akdeniz not found. Run prisma/seed.ts first.');

  const project = await prisma.project.findFirst({ where: { name: { contains: 'Akdeniz' } } });

  // Get some real products for realistic data
  const products = await prisma.product.findMany({
    include: { brand: true },
    take: 6,
  });

  // Find next quote number
  const lastQuote = await prisma.quote.findFirst({ orderBy: { quoteNumber: 'desc' } });
  const nextNum = lastQuote
    ? String(parseInt(lastQuote.quoteNumber.replace(/\D/g, '')) + 1).padStart(4, '0')
    : '0100';
  const quoteNumber = `BTS-2026-${nextNum}`;

  // Create the quote
  const quote = await prisma.quote.create({
    data: {
      quoteNumber,
      companyId: company.id,
      projectId: project?.id ?? null,
      subject: 'Örnek Teklif - Tüm Kalem Tipleri Demo',
      currency: 'EUR',
      exchangeRate: 37.50,
      protectionPct: 3,
      createdById: user.id,
      status: 'TASLAK',
      language: 'TR',
      validityDays: 30,
    },
  });

  console.log(`Quote created: ${quoteNumber} (${quote.id})`);

  let sortOrder = 0;

  // ─────────────────────────────────────────────────────
  // SECTION 1: Sistem Malzeme (Products)
  // ─────────────────────────────────────────────────────

  // HEADER
  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'HEADER', sortOrder: ++sortOrder,
      description: 'Yangın Algılama Sistem Malzemeleri',
    },
  });

  // PRODUCT items with different units
  const p0 = products[0];
  const p1 = products[1];
  const p2 = products[2];

  if (p0) {
    await prisma.quoteItem.create({
      data: {
        quoteId: quote.id, itemType: 'PRODUCT', sortOrder: ++sortOrder,
        productId: p0.id,
        code: p0.code, brand: p0.brand?.name ?? null, model: p0.model,
        description: p0.description || 'Optik Duman Dedektörü',
        quantity: 120, unit: 'Adet',
        listPrice: 26.90, katsayi: 1, unitPrice: 26.90,
        discountPct: 0, vatRate: 20,
        totalPrice: 3228.00,
        costPrice: 18.50,
      },
    });
  }

  if (p1) {
    await prisma.quoteItem.create({
      data: {
        quoteId: quote.id, itemType: 'PRODUCT', sortOrder: ++sortOrder,
        productId: p1.id,
        code: p1.code, brand: p1.brand?.name ?? null, model: p1.model,
        description: p1.description || 'Yangın Alarm Paneli',
        quantity: 1, unit: 'Adet',
        listPrice: 894.00, katsayi: 1, unitPrice: 894.00,
        discountPct: 0, vatRate: 20,
        totalPrice: 894.00,
        costPrice: 620.00,
      },
    });
  }

  if (p2) {
    await prisma.quoteItem.create({
      data: {
        quoteId: quote.id, itemType: 'PRODUCT', sortOrder: ++sortOrder,
        productId: p2.id,
        code: p2.code, brand: p2.brand?.name ?? null, model: p2.model,
        description: p2.description || 'Yangın Alarm Sireni',
        quantity: 15, unit: 'Adet',
        listPrice: 45.00, katsayi: 1, unitPrice: 45.00,
        discountPct: 0, vatRate: 20,
        totalPrice: 675.00,
        costPrice: 30.00,
      },
    });
  }

  // NOTE
  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'NOTE', sortOrder: ++sortOrder,
      description: 'Sistem malzemeleri EN 54 standardına uygun olup, CE belgeli ürünlerdir.',
    },
  });

  // ★ SUBTOTAL for section 1
  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'SUBTOTAL', sortOrder: ++sortOrder,
      description: 'Ara Toplam',
      quantity: 0, unitPrice: 0, totalPrice: 0,
    },
  });

  // ─────────────────────────────────────────────────────
  // SECTION 2: Kablaj (Cable products in metres)
  // ─────────────────────────────────────────────────────

  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'HEADER', sortOrder: ++sortOrder,
      description: 'Kablaj ve Boru Hatları',
    },
  });

  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'CUSTOM', sortOrder: ++sortOrder,
      description: 'JE-H(St)H FE180 1x2x0.8mm Yangın Kablosu',
      quantity: 3500, unit: 'Metre',
      listPrice: 0, katsayi: 1, unitPrice: 1.85,
      totalPrice: 6475.00, isManualPrice: true,
      costPrice: 1.20, brand: 'TAŞERON',
    },
  });

  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'CUSTOM', sortOrder: ++sortOrder,
      description: '20mm Galvaniz Boru',
      quantity: 850, unit: 'Metre',
      listPrice: 0, katsayi: 1, unitPrice: 3.50,
      totalPrice: 2975.00, isManualPrice: true,
      costPrice: 2.30, brand: 'TAŞERON',
    },
  });

  // ★ SUBTOTAL for section 2
  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'SUBTOTAL', sortOrder: ++sortOrder,
      description: 'Ara Toplam',
      quantity: 0, unitPrice: 0, totalPrice: 0,
    },
  });

  // ─────────────────────────────────────────────────────
  // SECTION 3: Montaj ve İşçilik (Installation per-item)
  // ─────────────────────────────────────────────────────

  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'HEADER', sortOrder: ++sortOrder,
      description: 'Montaj ve İşçilik',
    },
  });

  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'CUSTOM', sortOrder: ++sortOrder,
      description: 'Dedektör Montajı (tavan montaj, kablo çekimi dahil)',
      quantity: 120, unit: 'Adet',
      listPrice: 0, katsayi: 1, unitPrice: 14.40,
      totalPrice: 1728.00, isManualPrice: true,
      costPrice: 9.80, brand: 'TAŞERON',
    },
  });

  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'CUSTOM', sortOrder: ++sortOrder,
      description: 'Panel Montajı ve Programlama',
      quantity: 1, unit: 'Adet',
      listPrice: 0, katsayi: 1, unitPrice: 450.00,
      totalPrice: 450.00, isManualPrice: true,
      costPrice: 300.00, brand: 'TAŞERON',
    },
  });

  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'CUSTOM', sortOrder: ++sortOrder,
      description: 'Kablo Çekimi ve Boru Döşeme İşçiliği',
      quantity: 3500, unit: 'Metre',
      listPrice: 0, katsayi: 1, unitPrice: 2.10,
      totalPrice: 7350.00, isManualPrice: true,
      costPrice: 1.45, brand: 'TAŞERON',
    },
  });

  // ★ SUBTOTAL for section 3
  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'SUBTOTAL', sortOrder: ++sortOrder,
      description: 'Ara Toplam',
      quantity: 0, unitPrice: 0, totalPrice: 0,
    },
  });

  // ─────────────────────────────────────────────────────
  // SECTION 4: Mühendislik, Test ve Devreye Alma (SET)
  // ─────────────────────────────────────────────────────

  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'HEADER', sortOrder: ++sortOrder,
      description: 'Montaj Süpervizörlüğü, Mühendislik, Test ve Devreye Alma Çalışmaları',
    },
  });

  // SET parent — visible to customer as "1 Set | 7,810 EUR"
  const setParent = await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'SET', sortOrder: ++sortOrder,
      description: 'Montaj Süpervizörlüğü, Mühendislik, Test ve Devreye Alma Çalışmaları',
      quantity: 1, unit: 'Set',
      listPrice: 0, katsayi: 1, unitPrice: 7810.00,
      totalPrice: 7810.00, isManualPrice: true, vatRate: 20,
      costPrice: 5200.00,
      serviceMeta: {
        type: 'SET',
        note: 'Toplam maliyet alt satırlardan hesaplanır',
      },
    },
  });

  // Sub-row 1: Süpervizyon (internal only — NOT shown to customer)
  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'SET', sortOrder: ++sortOrder,
      parentItemId: setParent.id,
      description: 'Süpervizyon Hizmeti (ŞD 750km)',
      quantity: 7, unit: 'Kişi/Gün',
      listPrice: 0, katsayi: 1, unitPrice: 580.00,
      totalPrice: 4060.00, isManualPrice: true, vatRate: 0,
      costPrice: 380.00,
      serviceMeta: {
        teamSize: 1,
        days: 7,
        locationType: 'sehir_disi',
        distanceKm: 750,
      },
    },
  });

  // Sub-row 2: Test ve Devreye Alma (internal only)
  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'SET', sortOrder: ++sortOrder,
      parentItemId: setParent.id,
      description: 'Test ve Devreye Alma Hizmeti (ŞD 750km)',
      quantity: 5, unit: 'Kişi/Gün',
      listPrice: 0, katsayi: 1, unitPrice: 750.00,
      totalPrice: 3750.00, isManualPrice: true, vatRate: 0,
      costPrice: 490.00,
      serviceMeta: {
        teamSize: 2,
        days: 5,
        locationType: 'sehir_disi',
        distanceKm: 750,
      },
    },
  });

  // NOTE after service section
  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'NOTE', sortOrder: ++sortOrder,
      description: 'Konaklama ve yemek giderleri tarafımıza aittir. Ulaşım müşteri tarafından karşılanacaktır.',
    },
  });

  // ★ SUBTOTAL for section 4
  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'SUBTOTAL', sortOrder: ++sortOrder,
      description: 'Ara Toplam',
      quantity: 0, unitPrice: 0, totalPrice: 0,
    },
  });

  // ─────────────────────────────────────────────────────
  // SECTION 5: Grafik İzleme (SET with sub-row)
  // ─────────────────────────────────────────────────────

  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'HEADER', sortOrder: ++sortOrder,
      description: 'Grafik İzleme Yazılım Çalışmaları',
    },
  });

  const grafikParent = await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'SET', sortOrder: ++sortOrder,
      description: 'Grafik İzleme Yazılım Çalışmaları',
      quantity: 1, unit: 'Set',
      listPrice: 0, katsayi: 1, unitPrice: 2400.00,
      totalPrice: 2400.00, isManualPrice: true, vatRate: 20,
      costPrice: 1600.00,
    },
  });

  // Sub-row: Ofis test (internal only)
  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'SET', sortOrder: ++sortOrder,
      parentItemId: grafikParent.id,
      description: 'Test ve Devreye Alma Hizmeti (Ofis)',
      quantity: 3, unit: 'Kişi/Gün',
      listPrice: 0, katsayi: 1, unitPrice: 450.00,
      totalPrice: 1350.00, isManualPrice: true, vatRate: 0,
      costPrice: 300.00,
    },
  });

  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'NOTE', sortOrder: ++sortOrder,
      description: 'Çalışma yapılması için mimari projelerde mahal bilgilerinin tamamı sağlanmış olmalı, zone bilgisinin harita üzerinde işaretli olarak iletilmesi, zone isimleri iletilmesi gereklidir.',
    },
  });

  // ★ SUBTOTAL for section 5
  await prisma.quoteItem.create({
    data: {
      quoteId: quote.id, itemType: 'SUBTOTAL', sortOrder: ++sortOrder,
      description: 'Ara Toplam',
      quantity: 0, unitPrice: 0, totalPrice: 0,
    },
  });

  console.log(`\n✓ Created ${sortOrder} items across 5 sections`);
  console.log(`  - PRODUCT items (Adet unit)`);
  console.log(`  - CUSTOM items (Metre + Adet units, TAŞERON brand)`);
  console.log(`  - HEADER sections (5 section headers)`);
  console.log(`  - NOTE items (3 notes)`);
  console.log(`  - SUBTOTAL rows (5 section subtotals)`);
  console.log(`  - SERVICE SET parent + 2 sub-rows (Mühendislik)`);
  console.log(`  - SERVICE SET parent + 1 sub-row (Grafik İzleme)`);
  console.log(`\nOpen the quote editor at: /quotes/${quote.id}/edit`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
