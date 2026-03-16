import { PrismaClient, QuoteStatus, ProjectStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding demo data...\n');

  // Get existing data
  const users = await prisma.user.findMany();
  const companies = await prisma.company.findMany();

  // Map users by role for assignment
  const leventCeylan = users.find(u => u.username === 'lceylan')!;
  const cansuCeylan = users.find(u => u.username === 'cceylan')!;
  const muratDemirhan = users.find(u => u.username === 'mdemirhan')!;
  const firatFiliz = users.find(u => u.username === 'ffiliz')!;
  const selaleAcar = users.find(u => u.username === 'sacar')!;

  // Get companies
  const akdenizInsaat = companies.find(c => c.name.includes('Akdeniz'))!;
  const egeYapi = companies.find(c => c.name.includes('Ege'))!;
  const marmaraHolding = companies.find(c => c.name.includes('Marmara'))!;
  const anadoluTaahhut = companies.find(c => c.name.includes('Anadolu'))!;
  const istanbulAvm = companies.find(c => c.name.includes('Alışveriş'))!;
  const ankaraOtel = companies.find(c => c.name.includes('Otel'))!;
  const teknolojiVadisi = companies.find(c => c.name.includes('Teknoloji'))!;

  // Helper to get products by brand (query directly from DB)
  const getProductsByBrand = async (brandName: string, count: number) => {
    return prisma.product.findMany({
      where: { brand: { name: { contains: brandName } } },
      include: { brand: true },
      take: count,
    });
  };

  // Delete existing projects and their quotes (to start fresh with demo data)
  console.log('Cleaning up existing demo data...');
  await prisma.quoteItem.deleteMany({});
  await prisma.quoteCommercialTerm.deleteMany({});
  await prisma.quote.deleteMany({});
  await prisma.project.deleteMany({});

  // ============================================
  // CREATE PROJECTS
  // ============================================
  console.log('\nCreating projects...');

  const project1 = await prisma.project.create({
    data: {
      name: 'Akdeniz Plaza Yangın Algılama Sistemi',
      notes: 'Akdeniz Plaza 25 katlı ofis binası için komple yangın algılama ve alarm sistemi kurulumu. TYCO Zettler adresli sistem. Bütçe: 850.000 EUR',
      clientId: akdenizInsaat.id,
      status: ProjectStatus.DEVAM_EDIYOR,
      estimatedStart: new Date('2025-11-01'),
      estimatedEnd: new Date('2026-06-30'),
    },
  });

  const project2 = await prisma.project.create({
    data: {
      name: 'Marmara AVM Sprinkler Renovasyonu',
      notes: 'Mevcut sprinkler sisteminin modernizasyonu ve genişletilmesi. 45.000 m² alan. Bütçe: 1.200.000 EUR',
      clientId: marmaraHolding.id,
      status: ProjectStatus.DEVAM_EDIYOR,
      estimatedStart: new Date('2025-12-15'),
      estimatedEnd: new Date('2026-08-15'),
    },
  });

  const project3 = await prisma.project.create({
    data: {
      name: 'Ege Rezidans Yangın Güvenlik Paketi',
      notes: 'Lüks rezidans projesi için entegre yangın güvenlik sistemi. 3 blok, toplam 180 daire. Bütçe: 650.000 EUR',
      clientId: egeYapi.id,
      status: ProjectStatus.TEKLIF_ASAMASINDA,
      estimatedStart: new Date('2026-03-01'),
      estimatedEnd: new Date('2026-12-31'),
    },
  });

  const project4 = await prisma.project.create({
    data: {
      name: 'Teknoloji Vadisi Veri Merkezi',
      notes: 'Tier-3 veri merkezi için FM-200 gazlı söndürme ve VESDA erken algılama sistemi. Bütçe: 2.500.000 USD',
      clientId: teknolojiVadisi.id,
      status: ProjectStatus.DEVAM_EDIYOR,
      estimatedStart: new Date('2025-10-01'),
      estimatedEnd: new Date('2026-04-30'),
    },
  });

  const project5 = await prisma.project.create({
    data: {
      name: 'Ankara Grand Otel Renovasyon',
      notes: '5 yıldızlı otel için yangın algılama sistemi yenileme projesi. 320 oda. Bütçe: 420.000 EUR. Proje başarıyla tamamlandı.',
      clientId: ankaraOtel.id,
      status: ProjectStatus.TAMAMLANDI,
      estimatedStart: new Date('2025-06-01'),
      estimatedEnd: new Date('2025-12-31'),
    },
  });

  console.log(`Created ${5} projects`);

  // ============================================
  // CREATE QUOTES
  // ============================================
  console.log('\nCreating quotes...');

  // Get some products for quotes - use actual brand names from database
  const tycoZettlerProducts = await getProductsByBrand('TYCO ZETTLER', 20);
  const tycoNeoProducts = await getProductsByBrand('TYCO NEO', 10);
  const xtralisProducts = await getProductsByBrand('XTRALIS', 10);
  const sensitronProducts = await getProductsByBrand('SENSITRON', 15);
  const gltZetaProducts = await getProductsByBrand('GLT ZETA', 10);
  const bandweaverProducts = await getProductsByBrand('BANDWEAVER', 10);

  console.log(`Products loaded: TYCO ZETTLER(${tycoZettlerProducts.length}), XTRALIS(${xtralisProducts.length}), SENSITRON(${sensitronProducts.length}), GLT ZETA(${gltZetaProducts.length})`);

  // Quote 1: Akdeniz Plaza - Approved, high value
  const quote1 = await prisma.quote.create({
    data: {
      quoteNumber: 'BTS-2026-0004',
      projectId: project1.id,
      companyId: akdenizInsaat.id,
      status: QuoteStatus.ONAYLANDI,
      version: 1,
      subject: 'Akdeniz Plaza Yangın Algılama Sistemi Teklifi',
      currency: 'EUR',
      exchangeRate: 1,
      validUntil: new Date('2026-03-15'),
      discountPct: 5,
      subtotal: 385000,
      discountTotal: 19250,
      vatTotal: 65835,
      grandTotal: 431585,
      notes: 'Proje bazlı özel fiyatlandırma uygulanmıştır.',
      createdById: firatFiliz.id,
      approvedById: leventCeylan.id,
      approvedAt: new Date('2026-01-20'),
    },
  });

  // Add items to quote 1
  let sortOrder = 1;

  // Header
  await prisma.quoteItem.create({
    data: {
      quoteId: quote1.id,
      itemType: 'HEADER',
      sortOrder: sortOrder++,
      description: 'YANGIN ALGILAMA VE ALARM SİSTEMİ',
      quantity: 0,
      unit: '',
      listPrice: 0,
      katsayi: 1,
      unitPrice: 0,
      discountPct: 0,
      vatRate: 20,
      totalPrice: 0,
    },
  });

  // Add TYCO ZETTLER products
  for (const product of tycoZettlerProducts.slice(0, 8)) {
    const quantity = Math.floor(Math.random() * 50) + 10;
    const listPrice = Number(product.listPrice);
    const katsayi = 0.65;
    const unitPrice = listPrice * katsayi;
    const totalPrice = quantity * unitPrice;

    await prisma.quoteItem.create({
      data: {
        quoteId: quote1.id,
        productId: product.id,
        itemType: 'PRODUCT',
        sortOrder: sortOrder++,
        code: product.code,
        brand: product.brand?.name || '',
        description: product.name,
        quantity,
        unit: product.unit,
        listPrice,
        katsayi,
        unitPrice,
        discountPct: 0,
        vatRate: 20,
        totalPrice,
        costPrice: listPrice * 0.4,
      },
    });
  }

  // Add a note
  await prisma.quoteItem.create({
    data: {
      quoteId: quote1.id,
      itemType: 'NOTE',
      sortOrder: sortOrder++,
      description: 'Tüm ekipmanlar UL/FM sertifikalıdır.',
      quantity: 0,
      unit: '',
      listPrice: 0,
      katsayi: 1,
      unitPrice: 0,
      discountPct: 0,
      vatRate: 20,
      totalPrice: 0,
    },
  });

  // Service item
  await prisma.quoteItem.create({
    data: {
      quoteId: quote1.id,
      itemType: 'SET',
      sortOrder: sortOrder++,
      description: 'Montaj ve Devreye Alma Hizmeti',
      quantity: 1,
      unit: 'Adet',
      listPrice: 25000,
      katsayi: 1,
      unitPrice: 25000,
      discountPct: 0,
      vatRate: 20,
      totalPrice: 25000,
      costPrice: 15000,
    },
  });

  // Add commercial terms
  await prisma.quoteCommercialTerm.createMany({
    data: [
      { quoteId: quote1.id, sortOrder: 1, category: 'Döviz', value: 'Fiyatlarımız EUR bazında olup, fatura tarihindeki TCMB döviz satış kuru üzerinden TL\'ye çevrilecektir.' },
      { quoteId: quote1.id, sortOrder: 2, category: 'Ödeme', value: '%30 sipariş, %50 teslimat, %20 devreye alma sonrası' },
      { quoteId: quote1.id, sortOrder: 3, category: 'Teslimat', value: 'Sipariş onayından itibaren 8-10 hafta' },
      { quoteId: quote1.id, sortOrder: 4, category: 'Garanti', value: '2 yıl (malzeme ve işçilik dahil)' },
      { quoteId: quote1.id, sortOrder: 5, category: 'Geçerlilik', value: '30 gün' },
    ],
  });

  // Quote 2: Veri Merkezi - Pending approval, very high value
  const quote2 = await prisma.quote.create({
    data: {
      quoteNumber: 'BTS-2026-0005',
      projectId: project4.id,
      companyId: teknolojiVadisi.id,
      status: QuoteStatus.ONAY_BEKLIYOR,
      version: 2,
      subject: 'Teknoloji Vadisi Veri Merkezi Yangın Güvenlik Sistemi',
      currency: 'USD',
      exchangeRate: 1,
      validUntil: new Date('2026-02-28'),
      discountPct: 8,
      subtotal: 1850000,
      discountTotal: 148000,
      vatTotal: 306360,
      grandTotal: 2008360,
      notes: 'VESDA ve FM-200 sistemleri dahil. Tier-3 uyumlu.',
      createdById: selaleAcar.id,
    },
  });

  sortOrder = 1;

  await prisma.quoteItem.create({
    data: {
      quoteId: quote2.id,
      itemType: 'HEADER',
      sortOrder: sortOrder++,
      description: 'VESDA ERKEN ALGILAMA SİSTEMİ',
      quantity: 0, unit: '', listPrice: 0, katsayi: 1, unitPrice: 0, discountPct: 0, vatRate: 20, totalPrice: 0,
    },
  });

  for (const product of xtralisProducts.slice(0, 5)) {
    const quantity = Math.floor(Math.random() * 20) + 5;
    const listPrice = Number(product.listPrice);
    const katsayi = 0.55;
    const unitPrice = listPrice * katsayi;
    const totalPrice = quantity * unitPrice;

    await prisma.quoteItem.create({
      data: {
        quoteId: quote2.id,
        productId: product.id,
        itemType: 'PRODUCT',
        sortOrder: sortOrder++,
        code: product.code,
        brand: product.brand?.name || '',
        description: product.name,
        quantity,
        unit: product.unit,
        listPrice,
        katsayi,
        unitPrice,
        discountPct: 0,
        vatRate: 20,
        totalPrice,
        costPrice: listPrice * 0.5,
      },
    });
  }

  await prisma.quoteItem.create({
    data: {
      quoteId: quote2.id,
      itemType: 'HEADER',
      sortOrder: sortOrder++,
      description: 'FM-200 GAZLI SÖNDÜRME SİSTEMİ',
      quantity: 0, unit: '', listPrice: 0, katsayi: 1, unitPrice: 0, discountPct: 0, vatRate: 20, totalPrice: 0,
    },
  });

  await prisma.quoteItem.create({
    data: {
      quoteId: quote2.id,
      itemType: 'CUSTOM',
      sortOrder: sortOrder++,
      description: 'FM-200 Söndürme Sistemi Komple (500 m³ koruma alanı)',
      quantity: 4,
      unit: 'Set',
      listPrice: 85000,
      katsayi: 0.75,
      unitPrice: 63750,
      discountPct: 0,
      vatRate: 20,
      totalPrice: 255000,
      costPrice: 45000,
    },
  });

  await prisma.quoteCommercialTerm.createMany({
    data: [
      { quoteId: quote2.id, sortOrder: 1, category: 'Döviz', value: 'Fiyatlar USD bazındadır ve KDV hariçtir.' },
      { quoteId: quote2.id, sortOrder: 2, category: 'Ödeme', value: '%40 sipariş, %40 teslimat, %20 kabul sonrası' },
      { quoteId: quote2.id, sortOrder: 3, category: 'Sertifika', value: 'FM-200 gazı HFC-227ea, EPA ve ASHRAE onaylıdır.' },
      { quoteId: quote2.id, sortOrder: 4, category: 'Bakım', value: 'Yıllık bakım anlaşması ayrıca teklif edilecektir.' },
    ],
  });

  // Quote 3: Ege Rezidans - Draft
  const quote3 = await prisma.quote.create({
    data: {
      quoteNumber: 'BTS-2026-0006',
      projectId: project3.id,
      companyId: egeYapi.id,
      status: QuoteStatus.TASLAK,
      version: 1,
      subject: 'Ege Rezidans Yangın Güvenlik Sistemi Ön Teklifi',
      currency: 'EUR',
      exchangeRate: 1,
      validUntil: new Date('2026-03-30'),
      discountPct: 0,
      subtotal: 125000,
      discountTotal: 0,
      vatTotal: 22500,
      grandTotal: 147500,
      notes: 'Keşif sonrası fiyat güncellenecektir.',
      createdById: firatFiliz.id,
    },
  });

  sortOrder = 1;
  await prisma.quoteItem.create({
    data: {
      quoteId: quote3.id,
      itemType: 'HEADER',
      sortOrder: sortOrder++,
      description: 'ADRESLİ YANGIN ALGILAMA SİSTEMİ',
      quantity: 0, unit: '', listPrice: 0, katsayi: 1, unitPrice: 0, discountPct: 0, vatRate: 18, totalPrice: 0,
    },
  });

  for (const product of gltZetaProducts.slice(0, 6)) {
    const quantity = Math.floor(Math.random() * 100) + 20;
    const listPrice = Number(product.listPrice);
    const katsayi = 0.60;
    const unitPrice = listPrice * katsayi;
    const totalPrice = quantity * unitPrice;

    await prisma.quoteItem.create({
      data: {
        quoteId: quote3.id,
        productId: product.id,
        itemType: 'PRODUCT',
        sortOrder: sortOrder++,
        code: product.code,
        brand: product.brand?.name || '',
        description: product.name,
        quantity,
        unit: product.unit,
        listPrice,
        katsayi,
        unitPrice,
        discountPct: 0,
        vatRate: 18,
        totalPrice,
        costPrice: listPrice * 0.5,
      },
    });
  }

  // Quote 4: AVM Sprinkler - Sent, waiting response
  const quote4 = await prisma.quote.create({
    data: {
      quoteNumber: 'BTS-2026-0007',
      projectId: project2.id,
      companyId: marmaraHolding.id,
      status: QuoteStatus.GONDERILDI,
      version: 1,
      subject: 'Marmara AVM Sprinkler Sistemi Renovasyon Teklifi',
      currency: 'EUR',
      exchangeRate: 1,
      validUntil: new Date('2026-02-15'),
      discountPct: 10,
      subtotal: 480000,
      discountTotal: 48000,
      vatTotal: 77760,
      grandTotal: 509760,
      notes: 'Mevcut sistem analizi yapılmıştır.',
      createdById: selaleAcar.id,
    },
  });

  sortOrder = 1;
  await prisma.quoteItem.create({
    data: {
      quoteId: quote4.id,
      itemType: 'HEADER',
      sortOrder: sortOrder++,
      description: 'SPRİNKLER SİSTEMİ MALZEMELERİ',
      quantity: 0, unit: '', listPrice: 0, katsayi: 1, unitPrice: 0, discountPct: 0, vatRate: 20, totalPrice: 0,
    },
  });

  for (const product of sensitronProducts.slice(0, 10)) {
    const quantity = Math.floor(Math.random() * 500) + 100;
    const listPrice = Number(product.listPrice);
    const katsayi = 0.55;
    const unitPrice = listPrice * katsayi;
    const totalPrice = quantity * unitPrice;

    await prisma.quoteItem.create({
      data: {
        quoteId: quote4.id,
        productId: product.id,
        itemType: 'PRODUCT',
        sortOrder: sortOrder++,
        code: product.code,
        brand: product.brand?.name || '',
        description: product.name,
        quantity,
        unit: product.unit,
        listPrice,
        katsayi,
        unitPrice,
        discountPct: 0,
        vatRate: 20,
        totalPrice,
        costPrice: listPrice * 0.5,
      },
    });
  }

  await prisma.quoteCommercialTerm.createMany({
    data: [
      { quoteId: quote4.id, sortOrder: 1, category: 'Kapsam', value: 'Mevcut sprinkler başlıklarının değişimi dahildir.' },
      { quoteId: quote4.id, sortOrder: 2, category: 'Çalışma', value: 'Çalışmalar AVM çalışma saatleri dışında yapılacaktır.' },
      { quoteId: quote4.id, sortOrder: 3, category: 'Ödeme', value: '%25 avans, %75 iş bitiminde' },
    ],
  });

  // Quote 5: Won project (Ankara Otel)
  const quote5 = await prisma.quote.create({
    data: {
      quoteNumber: 'BTS-2025-0089',
      projectId: project5.id,
      companyId: ankaraOtel.id,
      status: QuoteStatus.KAZANILDI,
      version: 3,
      subject: 'Ankara Grand Otel Yangın Algılama Sistemi Yenileme',
      currency: 'EUR',
      exchangeRate: 1,
      validUntil: new Date('2025-07-30'),
      discountPct: 12,
      subtotal: 380000,
      discountTotal: 45600,
      vatTotal: 60192,
      grandTotal: 394592,
      notes: 'Proje başarıyla tamamlanmıştır.',
      createdById: firatFiliz.id,
      approvedById: leventCeylan.id,
      approvedAt: new Date('2025-06-15'),
    },
  });

  // Quote 6: Lost quote
  const quote6 = await prisma.quote.create({
    data: {
      quoteNumber: 'BTS-2025-0072',
      companyId: istanbulAvm.id,
      status: QuoteStatus.KAYBEDILDI,
      version: 2,
      subject: 'İstanbul AVM Yangın Güvenlik Sistemi',
      currency: 'EUR',
      exchangeRate: 1,
      validUntil: new Date('2025-09-30'),
      discountPct: 15,
      subtotal: 520000,
      discountTotal: 78000,
      vatTotal: 79560,
      grandTotal: 521560,
      notes: 'Rakip firma daha düşük fiyat verdi.',
      createdById: selaleAcar.id,
    },
  });

  // Quote 7: Under revision
  const quote7 = await prisma.quote.create({
    data: {
      quoteNumber: 'BTS-2026-0008',
      companyId: anadoluTaahhut.id,
      status: QuoteStatus.REVIZYON,
      version: 1,
      subject: 'Anadolu İş Merkezi Yangın Sistemi',
      currency: 'EUR',
      exchangeRate: 1,
      validUntil: new Date('2026-02-28'),
      discountPct: 5,
      subtotal: 185000,
      discountTotal: 9250,
      vatTotal: 31635,
      grandTotal: 207385,
      notes: 'Müşteri ek indirim talep etti, revizyon hazırlanıyor.',
      createdById: firatFiliz.id,
    },
  });

  // Quote 8: Tracking (won but in execution)
  const quote8 = await prisma.quote.create({
    data: {
      quoteNumber: 'BTS-2025-0095',
      projectId: project1.id,
      companyId: akdenizInsaat.id,
      status: QuoteStatus.TAKIPTE,
      version: 1,
      subject: 'Akdeniz Plaza Ek Sipariş - B Blok',
      currency: 'EUR',
      exchangeRate: 1,
      validUntil: new Date('2026-01-31'),
      discountPct: 5,
      subtotal: 95000,
      discountTotal: 4750,
      vatTotal: 16245,
      grandTotal: 106495,
      notes: 'Ana proje kapsamında ek sipariş.',
      createdById: firatFiliz.id,
      approvedById: cansuCeylan.id,
      approvedAt: new Date('2025-12-20'),
    },
  });

  console.log('Created 8 quotes with items and commercial terms');

  // ============================================
  // SUMMARY
  // ============================================
  const projectCount = await prisma.project.count();
  const quoteCount = await prisma.quote.count();
  const quoteItemCount = await prisma.quoteItem.count();
  const termCount = await prisma.quoteCommercialTerm.count();

  console.log('\n=== DEMO DATA SEEDING COMPLETE ===');
  console.log(`Projects: ${projectCount}`);
  console.log(`Quotes: ${quoteCount}`);
  console.log(`Quote Items: ${quoteItemCount}`);
  console.log(`Commercial Terms: ${termCount}`);

  // Show quote summary
  const quotes = await prisma.quote.findMany({
    include: { company: true, project: true },
    orderBy: { quoteNumber: 'asc' },
  });

  console.log('\nQuotes Summary:');
  for (const q of quotes) {
    console.log(`  ${q.quoteNumber} | ${q.status.padEnd(15)} | ${q.company.name.substring(0, 25).padEnd(25)} | ${q.currency} ${Number(q.grandTotal).toLocaleString()}`);
  }
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
