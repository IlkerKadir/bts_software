import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create roles
  const yonetimRole = await prisma.role.upsert({
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

  const satisRole = await prisma.role.upsert({
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

  console.log('✅ Roles created');

  // Create BTS users
  const defaultPassword = await bcrypt.hash('1111', 12);

  const btsUsers = [
    { username: 'lceylan', fullName: 'Levent Ceylan', email: 'levent@btsyangin.com', roleId: yonetimRole.id },
    { username: 'cceylan', fullName: 'Cansu Ceylan', email: 'cansu@btsyangin.com', roleId: yonetimRole.id },
    { username: 'mdemirhan', fullName: 'Murat Demirhan', email: 'murat@btsyangin.com', roleId: yonetimRole.id },
    { username: 'ffiliz', fullName: 'Firat Filiz', email: 'firat@btsyangin.com', roleId: satisRole.id },
    { username: 'sacar', fullName: 'Selale Acar', email: 'selale@btsyangin.com', roleId: satisRole.id },
  ];

  for (const user of btsUsers) {
    await prisma.user.upsert({
      where: { username: user.username },
      update: {},
      create: {
        username: user.username,
        passwordHash: defaultPassword,
        fullName: user.fullName,
        email: user.email,
        roleId: user.roleId,
        isActive: true,
      },
    });
  }

  console.log('✅ BTS users created (5 users, default password: 1111)');

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

  // Seed BrandDiscount defaults
  const brandDefaults = [
    { brandName: 'ZETA', coefficient: 1.0 },
    { brandName: 'XTRALIS', coefficient: 1.0 },
    { brandName: 'NOTIFIER', coefficient: 1.0 },
    { brandName: 'HOCHIKI', coefficient: 1.0 },
  ];

  for (const bd of brandDefaults) {
    const brand = await prisma.productBrand.findUnique({ where: { name: bd.brandName } });
    if (brand) {
      await prisma.brandDiscount.upsert({
        where: { brandId: brand.id },
        update: { coefficient: bd.coefficient },
        create: {
          brandId: brand.id,
          coefficient: bd.coefficient,
        },
      });
    }
  }

  console.log('✅ Brand discount defaults created');

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
    // Uretici Firmalar
    { category: 'uretici_firmalar', name: 'Tyco / Johnson Controls', value: 'Tyco / Johnson Controls', isDefault: false },
    { category: 'uretici_firmalar', name: 'Notifier / Honeywell', value: 'Notifier / Honeywell', isDefault: false },
    { category: 'uretici_firmalar', name: 'Hochiki', value: 'Hochiki', isDefault: false },
    { category: 'uretici_firmalar', name: 'Xtralis / Honeywell', value: 'Xtralis / Honeywell', isDefault: false },
    // Onaylar
    { category: 'onaylar', name: 'VDS', value: 'VDS onaylı', isDefault: false },
    { category: 'onaylar', name: 'FM', value: 'FM onaylı', isDefault: false },
    { category: 'onaylar', name: 'UL/ULC', value: 'UL/ULC onaylı', isDefault: false },
    { category: 'onaylar', name: 'CE', value: 'CE onaylı', isDefault: false },
    { category: 'onaylar', name: 'LPCB', value: 'LPCB onaylı', isDefault: false },
    // Garanti
    { category: 'garanti', name: '1 Yil', value: 'Teklif kapsamindaki tum urunler 1 yil garantilidir.', isDefault: false },
    { category: 'garanti', name: '2 Yil', value: 'Teklif kapsamindaki tum urunler 2 yil garantilidir.', isDefault: true },
    // Teslim Yeri
    { category: 'teslim_yeri', name: 'Santiye Teslim', value: 'Malzemeler santiyeye teslim edilecektir.', isDefault: true },
    { category: 'teslim_yeri', name: 'Depo Teslim', value: 'Malzemeler depomuzdan teslim edilecektir.', isDefault: false },
    // Odeme
    { category: 'odeme', name: 'Pesin', value: 'Pesin odeme', isDefault: false },
    { category: 'odeme', name: '30 Gun Vadeli', value: 'Fatura tarihinden itibaren 30 gun vadeli banka havalesi', isDefault: true },
    { category: 'odeme', name: '60 Gun Vadeli', value: 'Fatura tarihinden itibaren 60 gun vadeli banka havalesi', isDefault: false },
    { category: 'odeme', name: 'Cek', value: 'Fatura tarihinden itibaren 60 gun vadeli cek', isDefault: false },
    // KDV
    { category: 'kdv', name: '%20 KDV', value: 'Fiyatlara KDV dahil degildir. KDV orani %20 olarak uygulanacaktir.', isDefault: true },
    { category: 'kdv', name: '%10 KDV', value: 'Fiyatlara KDV dahil degildir. KDV orani %10 olarak uygulanacaktir.', isDefault: false },
    // Teslimat
    { category: 'teslimat', name: '2-4 Hafta', value: 'Siparis onayindan itibaren 2-4 hafta', isDefault: true },
    { category: 'teslimat', name: '4-6 Hafta', value: 'Siparis onayindan itibaren 4-6 hafta', isDefault: false },
    { category: 'teslimat', name: '6-8 Hafta', value: 'Siparis onayindan itibaren 6-8 hafta', isDefault: false },
    { category: 'teslimat', name: '8-12 Hafta', value: 'Siparis onayindan itibaren 8-12 hafta', isDefault: false },
    // Opsiyon
    { category: 'opsiyon', name: '15 Gun', value: 'Bu teklif 15 gun gecerlidir.', isDefault: false },
    { category: 'opsiyon', name: '30 Gun', value: 'Bu teklif 30 gun gecerlidir.', isDefault: true },
    { category: 'opsiyon', name: '60 Gun', value: 'Bu teklif 60 gun gecerlidir.', isDefault: false },
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

  // Get brand and category IDs
  const zetaBrand = await prisma.productBrand.findUnique({ where: { name: 'ZETA' } });
  const xtralisBrand = await prisma.productBrand.findUnique({ where: { name: 'XTRALIS' } });
  const notifierBrand = await prisma.productBrand.findUnique({ where: { name: 'NOTIFIER' } });
  const hochikiBrand = await prisma.productBrand.findUnique({ where: { name: 'HOCHIKI' } });

  const dedektorlerCat = await prisma.productCategory.findUnique({ where: { name: 'Dedektörler' } });
  const modullerCat = await prisma.productCategory.findUnique({ where: { name: 'Modüller' } });
  const panellerCat = await prisma.productCategory.findUnique({ where: { name: 'Paneller' } });
  const sirenlerCat = await prisma.productCategory.findUnique({ where: { name: 'Sirenler' } });
  const vesdaCat = await prisma.productCategory.findUnique({ where: { name: 'VESDA Sistemleri' } });
  const gucCat = await prisma.productCategory.findUnique({ where: { name: 'Güç Kaynakları' } });
  const aksesuarCat = await prisma.productCategory.findUnique({ where: { name: 'Aksesuarlar' } });

  // Create sample products
  const products = [
    // ZETA Products - Dedektörler
    { code: 'ZETA-DET-001', shortCode: 'ZD001', name: 'Conventional Smoke Detector', nameTr: 'Konvansiyonel Duman Dedektörü', brandId: zetaBrand?.id, categoryId: dedektorlerCat?.id, listPrice: 45, costPrice: 28, unit: 'Adet' },
    { code: 'ZETA-DET-002', shortCode: 'ZD002', name: 'Addressable Smoke Detector', nameTr: 'Adresli Duman Dedektörü', brandId: zetaBrand?.id, categoryId: dedektorlerCat?.id, listPrice: 85, costPrice: 52, unit: 'Adet' },
    { code: 'ZETA-DET-003', shortCode: 'ZD003', name: 'Heat Detector Fixed 57°C', nameTr: 'Isı Dedektörü Sabit 57°C', brandId: zetaBrand?.id, categoryId: dedektorlerCat?.id, listPrice: 38, costPrice: 22, unit: 'Adet' },
    { code: 'ZETA-DET-004', shortCode: 'ZD004', name: 'Heat Detector Rate of Rise', nameTr: 'Isı Dedektörü Yükselme Oranlı', brandId: zetaBrand?.id, categoryId: dedektorlerCat?.id, listPrice: 42, costPrice: 25, unit: 'Adet' },
    { code: 'ZETA-DET-005', shortCode: 'ZD005', name: 'Multi-Sensor Detector', nameTr: 'Çoklu Sensör Dedektör', brandId: zetaBrand?.id, categoryId: dedektorlerCat?.id, listPrice: 125, costPrice: 78, unit: 'Adet' },

    // ZETA Products - Modüller
    { code: 'ZETA-MOD-001', shortCode: 'ZM001', name: 'Input Module', nameTr: 'Giriş Modülü', brandId: zetaBrand?.id, categoryId: modullerCat?.id, listPrice: 65, costPrice: 40, unit: 'Adet' },
    { code: 'ZETA-MOD-002', shortCode: 'ZM002', name: 'Output Module', nameTr: 'Çıkış Modülü', brandId: zetaBrand?.id, categoryId: modullerCat?.id, listPrice: 72, costPrice: 45, unit: 'Adet' },
    { code: 'ZETA-MOD-003', shortCode: 'ZM003', name: 'Zone Module', nameTr: 'Bölge Modülü', brandId: zetaBrand?.id, categoryId: modullerCat?.id, listPrice: 95, costPrice: 58, unit: 'Adet' },
    { code: 'ZETA-MOD-004', shortCode: 'ZM004', name: 'Isolator Module', nameTr: 'İzolatör Modülü', brandId: zetaBrand?.id, categoryId: modullerCat?.id, listPrice: 48, costPrice: 30, unit: 'Adet' },

    // ZETA Products - Paneller
    { code: 'ZETA-PAN-001', shortCode: 'ZP001', name: 'Fire Alarm Panel 2 Zone', nameTr: 'Yangın Alarm Paneli 2 Bölge', brandId: zetaBrand?.id, categoryId: panellerCat?.id, listPrice: 320, costPrice: 195, unit: 'Adet' },
    { code: 'ZETA-PAN-002', shortCode: 'ZP002', name: 'Fire Alarm Panel 4 Zone', nameTr: 'Yangın Alarm Paneli 4 Bölge', brandId: zetaBrand?.id, categoryId: panellerCat?.id, listPrice: 450, costPrice: 275, unit: 'Adet' },
    { code: 'ZETA-PAN-003', shortCode: 'ZP003', name: 'Fire Alarm Panel 8 Zone', nameTr: 'Yangın Alarm Paneli 8 Bölge', brandId: zetaBrand?.id, categoryId: panellerCat?.id, listPrice: 680, costPrice: 420, unit: 'Adet' },
    { code: 'ZETA-PAN-004', shortCode: 'ZP004', name: 'Addressable Panel 1 Loop', nameTr: 'Adresli Panel 1 Loop', brandId: zetaBrand?.id, categoryId: panellerCat?.id, listPrice: 1250, costPrice: 780, unit: 'Adet' },
    { code: 'ZETA-PAN-005', shortCode: 'ZP005', name: 'Addressable Panel 2 Loop', nameTr: 'Adresli Panel 2 Loop', brandId: zetaBrand?.id, categoryId: panellerCat?.id, listPrice: 1850, costPrice: 1150, unit: 'Adet' },

    // ZETA Products - Sirenler
    { code: 'ZETA-SIR-001', shortCode: 'ZS001', name: 'Indoor Sounder', nameTr: 'İç Mekan Sireni', brandId: zetaBrand?.id, categoryId: sirenlerCat?.id, listPrice: 28, costPrice: 16, unit: 'Adet' },
    { code: 'ZETA-SIR-002', shortCode: 'ZS002', name: 'Outdoor Sounder with Strobe', nameTr: 'Dış Mekan Flaşörlü Siren', brandId: zetaBrand?.id, categoryId: sirenlerCat?.id, listPrice: 65, costPrice: 38, unit: 'Adet' },
    { code: 'ZETA-SIR-003', shortCode: 'ZS003', name: 'Addressable Sounder Base', nameTr: 'Adresli Siren Tabanı', brandId: zetaBrand?.id, categoryId: sirenlerCat?.id, listPrice: 58, costPrice: 35, unit: 'Adet' },

    // XTRALIS - VESDA
    { code: 'XTR-VSD-001', shortCode: 'XV001', name: 'VESDA-E VEA-040', nameTr: 'VESDA-E VEA-040 Aspirasyon Dedektörü', brandId: xtralisBrand?.id, categoryId: vesdaCat?.id, listPrice: 2850, costPrice: 1800, unit: 'Adet' },
    { code: 'XTR-VSD-002', shortCode: 'XV002', name: 'VESDA-E VEP-A00', nameTr: 'VESDA-E VEP-A00 Aspirasyon Dedektörü', brandId: xtralisBrand?.id, categoryId: vesdaCat?.id, listPrice: 3450, costPrice: 2200, unit: 'Adet' },
    { code: 'XTR-VSD-003', shortCode: 'XV003', name: 'VESDA-E VES-A00', nameTr: 'VESDA-E VES-A00 Aspirasyon Dedektörü', brandId: xtralisBrand?.id, categoryId: vesdaCat?.id, listPrice: 4200, costPrice: 2700, unit: 'Adet' },
    { code: 'XTR-VSD-004', shortCode: 'XV004', name: 'VESDA Sampling Pipe 25mm', nameTr: 'VESDA Örnekleme Borusu 25mm', brandId: xtralisBrand?.id, categoryId: vesdaCat?.id, listPrice: 12, costPrice: 7, unit: 'Metre' },
    { code: 'XTR-VSD-005', shortCode: 'XV005', name: 'VESDA Capillary Tube Kit', nameTr: 'VESDA Kılcal Boru Kiti', brandId: xtralisBrand?.id, categoryId: vesdaCat?.id, listPrice: 85, costPrice: 52, unit: 'Adet' },

    // NOTIFIER Products
    { code: 'NOT-DET-001', shortCode: 'ND001', name: 'FSP-851 Addressable Smoke', nameTr: 'FSP-851 Adresli Duman Dedektörü', brandId: notifierBrand?.id, categoryId: dedektorlerCat?.id, listPrice: 95, costPrice: 62, unit: 'Adet' },
    { code: 'NOT-DET-002', shortCode: 'ND002', name: 'FST-851 Addressable Heat', nameTr: 'FST-851 Adresli Isı Dedektörü', brandId: notifierBrand?.id, categoryId: dedektorlerCat?.id, listPrice: 88, costPrice: 55, unit: 'Adet' },
    { code: 'NOT-PAN-001', shortCode: 'NP001', name: 'NFS2-3030 Fire Panel', nameTr: 'NFS2-3030 Yangın Paneli', brandId: notifierBrand?.id, categoryId: panellerCat?.id, listPrice: 4500, costPrice: 2900, unit: 'Adet' },
    { code: 'NOT-MOD-001', shortCode: 'NM001', name: 'FMM-1 Monitor Module', nameTr: 'FMM-1 İzleme Modülü', brandId: notifierBrand?.id, categoryId: modullerCat?.id, listPrice: 78, costPrice: 48, unit: 'Adet' },
    { code: 'NOT-MOD-002', shortCode: 'NM002', name: 'FCM-1 Control Module', nameTr: 'FCM-1 Kontrol Modülü', brandId: notifierBrand?.id, categoryId: modullerCat?.id, listPrice: 85, costPrice: 52, unit: 'Adet' },

    // HOCHIKI Products
    { code: 'HOC-DET-001', shortCode: 'HD001', name: 'ALN-EN Optical Smoke', nameTr: 'ALN-EN Optik Duman Dedektörü', brandId: hochikiBrand?.id, categoryId: dedektorlerCat?.id, listPrice: 78, costPrice: 48, unit: 'Adet' },
    { code: 'HOC-DET-002', shortCode: 'HD002', name: 'ATJ-EN Heat Detector', nameTr: 'ATJ-EN Isı Dedektörü', brandId: hochikiBrand?.id, categoryId: dedektorlerCat?.id, listPrice: 72, costPrice: 44, unit: 'Adet' },
    { code: 'HOC-DET-003', shortCode: 'HD003', name: 'ACC-EN Multi-Sensor', nameTr: 'ACC-EN Çoklu Sensör Dedektör', brandId: hochikiBrand?.id, categoryId: dedektorlerCat?.id, listPrice: 145, costPrice: 92, unit: 'Adet' },
    { code: 'HOC-SIR-001', shortCode: 'HS001', name: 'CHQ-WS2 Wall Sounder', nameTr: 'CHQ-WS2 Duvar Sireni', brandId: hochikiBrand?.id, categoryId: sirenlerCat?.id, listPrice: 68, costPrice: 42, unit: 'Adet' },

    // Güç Kaynakları
    { code: 'PSU-001', shortCode: 'PS001', name: 'Power Supply 24V 3A', nameTr: 'Güç Kaynağı 24V 3A', brandId: null, categoryId: gucCat?.id, listPrice: 85, costPrice: 52, unit: 'Adet' },
    { code: 'PSU-002', shortCode: 'PS002', name: 'Power Supply 24V 5A', nameTr: 'Güç Kaynağı 24V 5A', brandId: null, categoryId: gucCat?.id, listPrice: 125, costPrice: 78, unit: 'Adet' },
    { code: 'PSU-003', shortCode: 'PS003', name: 'Battery 12V 7Ah', nameTr: 'Akü 12V 7Ah', brandId: null, categoryId: gucCat?.id, listPrice: 35, costPrice: 22, unit: 'Adet' },
    { code: 'PSU-004', shortCode: 'PS004', name: 'Battery 12V 18Ah', nameTr: 'Akü 12V 18Ah', brandId: null, categoryId: gucCat?.id, listPrice: 65, costPrice: 42, unit: 'Adet' },

    // Aksesuarlar
    { code: 'ACC-001', shortCode: 'AC001', name: 'Detector Base Standard', nameTr: 'Dedektör Tabanı Standart', brandId: null, categoryId: aksesuarCat?.id, listPrice: 8, costPrice: 4, unit: 'Adet' },
    { code: 'ACC-002', shortCode: 'AC002', name: 'Detector Base with Relay', nameTr: 'Dedektör Tabanı Röleli', brandId: null, categoryId: aksesuarCat?.id, listPrice: 22, costPrice: 12, unit: 'Adet' },
    { code: 'ACC-003', shortCode: 'AC003', name: 'Manual Call Point', nameTr: 'Manuel Yangın İhbar Butonu', brandId: null, categoryId: aksesuarCat?.id, listPrice: 32, costPrice: 18, unit: 'Adet' },
    { code: 'ACC-004', shortCode: 'AC004', name: 'Fire Cable 2x1.5mm', nameTr: 'Yangın Kablosu 2x1.5mm', brandId: null, categoryId: aksesuarCat?.id, listPrice: 2.5, costPrice: 1.5, unit: 'Metre' },
    { code: 'ACC-005', shortCode: 'AC005', name: 'Fire Cable 4x1.5mm', nameTr: 'Yangın Kablosu 4x1.5mm', brandId: null, categoryId: aksesuarCat?.id, listPrice: 4.2, costPrice: 2.5, unit: 'Metre' },
    { code: 'ACC-006', shortCode: 'AC006', name: 'Junction Box IP65', nameTr: 'Buat IP65', brandId: null, categoryId: aksesuarCat?.id, listPrice: 12, costPrice: 7, unit: 'Adet' },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { code: product.code },
      update: {},
      create: {
        code: product.code,
        shortCode: product.shortCode,
        name: product.name,
        nameTr: product.nameTr,
        brandId: product.brandId || null,
        categoryId: product.categoryId || null,
        listPrice: product.listPrice,
        costPrice: product.costPrice,
        unit: product.unit,
        isActive: true,
      },
    });
  }

  console.log('✅ Products created (' + products.length + ' products)');

  // Create sample companies (clients)
  const companies = [
    { name: 'Akdeniz İnşaat A.Ş.', taxNumber: '1234567890', address: 'Alsancak Mah. Cumhuriyet Bulvarı No:45, İzmir', phone: '+90 232 123 4567', email: 'info@akdenizinsaat.com.tr' },
    { name: 'Ege Yapı Grubu', taxNumber: '9876543210', address: 'Bornova Mah. Üniversite Cad. No:88, İzmir', phone: '+90 232 234 5678', email: 'bilgi@egeyapi.com' },
    { name: 'Marmara Holding A.Ş.', taxNumber: '5678901234', address: 'Maslak Mah. AOS 55. Sokak No:12, İstanbul', phone: '+90 212 345 6789', email: 'info@marmaraholding.com' },
    { name: 'Anadolu Taahhüt Ltd. Şti.', taxNumber: '4567890123', address: 'Kızılay Mah. Atatürk Bulvarı No:123, Ankara', phone: '+90 312 456 7890', email: 'iletisim@anadolutaahhut.com.tr' },
    { name: 'Kuzey Gayrimenkul', taxNumber: '3456789012', address: 'Nilüfer Mah. Mudanya Yolu No:56, Bursa', phone: '+90 224 567 8901', email: 'info@kuzeygayrimenkul.com' },
    { name: 'Güney Enerji A.Ş.', taxNumber: '2345678901', address: 'Çukurova Mah. Turhan Cemal Beriker Bulvarı No:78, Adana', phone: '+90 322 678 9012', email: 'enerji@guneyenerji.com.tr' },
    { name: 'İstanbul Alışveriş Merkezi', taxNumber: '8901234567', address: 'Bağdat Cad. No:234, Kadıköy, İstanbul', phone: '+90 216 789 0123', email: 'yonetim@istavm.com' },
    { name: 'Ankara Otel İşletmeleri', taxNumber: '7890123456', address: 'Kavaklıdere Mah. Tunalı Hilmi Cad. No:90, Ankara', phone: '+90 312 890 1234', email: 'rezervasyon@ankaraotel.com.tr' },
    { name: 'Bodrum Tatil Köyü', taxNumber: '6789012345', address: 'Yalıkavak Mah. Sahil Yolu No:15, Bodrum, Muğla', phone: '+90 252 901 2345', email: 'info@bodrumtatil.com' },
    { name: 'Teknoloji Vadisi A.Ş.', taxNumber: '0123456789', address: 'Teknopark Mah. TGB Blok No:101, Gebze, Kocaeli', phone: '+90 262 012 3456', email: 'bilgi@teknovadisi.com.tr' },
  ];

  for (const company of companies) {
    const existing = await prisma.company.findFirst({
      where: { name: company.name },
    });
    if (!existing) {
      await prisma.company.create({
        data: {
          name: company.name,
          type: 'CLIENT',
          taxNumber: company.taxNumber,
          address: company.address,
          phone: company.phone,
          email: company.email,
          isActive: true,
        },
      });
    }
  }

  console.log('✅ Companies created (' + companies.length + ' companies)');

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
