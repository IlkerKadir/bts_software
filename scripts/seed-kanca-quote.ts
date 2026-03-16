import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seeds the SA0056 Kanca El Aletleri reference quote with exact data from the
 * reference PDF. Used for visual comparison in the quote editor.
 *
 * Does NOT delete any existing data.
 */
async function main() {
  console.log('Creating SA0056 Kanca El Aletleri reference quote...\n');

  // Get existing user
  const user = await prisma.user.findFirst({ where: { username: 'lceylan' } });
  if (!user) throw new Error('User lceylan not found. Run prisma/seed.ts first.');

  // Find or create Kanca company
  let company = await prisma.company.findFirst({
    where: { name: { contains: 'KANCA' } },
  });
  if (!company) {
    company = await prisma.company.create({
      data: {
        name: 'KANCA EL ALETLERİ DÖV.ÇEL. ve MAK.SAN.A.Ş.',
        type: 'CLIENT',
        address: 'Tosb Org. San, Tosb Otomotiv OSB, 1. Cd., 41420 Çayırova/Kocaeli',
        taxNumber: '',
      },
    });
    console.log('Created company:', company.name);
  } else {
    console.log('Found existing company:', company.name);
  }

  // Check if SA0056 quote already exists
  const existing = await prisma.quote.findFirst({
    where: { quoteNumber: 'SA0056-YAS' },
  });
  if (existing) {
    console.log('Quote SA0056-YAS already exists, skipping.');
    return;
  }

  // Create the quote
  const quote = await prisma.quote.create({
    data: {
      quoteNumber: 'SA0056-YAS',
      companyId: company.id,
      createdById: user.id,
      subject: 'KANCA İDARİ BİNA & ÜRETİM ALANI',
      description: 'TYCO ZETTLER ADRESLİ YANGIN ALGILAMA SİSTEMİ - BTS ÇÖZÜM',
      currency: 'USD',
      exchangeRate: 1, // USD-based quote
      refNo: '219AC',
      status: 'GONDERILDI',
      language: 'TR',
      validityDays: 30,
      validUntil: new Date('2026-02-28'),
      createdAt: new Date('2026-01-29'),
      subtotal: 14297.30,
      discountTotal: 0,
      vatTotal: 0,
      grandTotal: 18275.30, // 14297.30 + 3978.00
    },
  });
  console.log('Created quote:', quote.quoteNumber, quote.id);

  // ─── ITEMS ─────────────────────────────────────────────────────────────────
  // All items as CUSTOM (no productId), since these are reference data

  let sortOrder = 0;

  const items: Array<{
    itemType: 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM' | 'SET' | 'SUBTOTAL';
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    listPrice?: number;
    isManualPrice?: boolean;
    brand?: string;
    code?: string;
    notes?: string;
    serviceMeta?: unknown;
  }> = [];

  // ═══════════════════════ İDARİ BİNA ═══════════════════════
  items.push({ itemType: 'HEADER', description: 'İDARİ BİNA', quantity: 0, unit: 'Adet', unitPrice: 0, totalPrice: 0 });

  // Item 1
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'PRO815D 4-8 Loop PROFILE Flexible Panel, 4 Loop 500 Adres, 8 Loop 1000 Adrese kadar genişleme İmkanı, 8.4" TFT Dokunmatik Ekran, Mimari Projeler Üzerinde Programlanabilir Alarm İzleme Özelliği, RFID Kartlar ile Kullanıcı Girişi,10.000 Olay Hafızası,240 Programlanabilir Zone',
    quantity: 1, unit: 'Adet', unitPrice: 412.00, totalPrice: 412.00,
  });

  // Item 2
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: '7 Ah 12V DC Bakım Gerektirmeyen Akü',
    quantity: 2, unit: 'Adet', unitPrice: 2.70, totalPrice: 5.40,
  });

  // Item 3
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'ZX-PLX PROFILE Flexible loop genişleme kartı (4 loop 500 Adres Kapasiteli)',
    quantity: 1, unit: 'Adet', unitPrice: 80.70, totalPrice: 80.70,
  });

  // Item 4
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'ZX-IP Akıllı İnteraktif Adresli Optik Duman Dedektörü, izolatörlü',
    quantity: 75, unit: 'Adet', unitPrice: 6.19, totalPrice: 464.25,
  });

  // Item 5
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'ZX-C 4" İzolatör dedektörleri için soket',
    quantity: 75, unit: 'Adet', unitPrice: 1.04, totalPrice: 78.00,
  });

  // Item 6
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'ZX-IH Akıllı İnteraktif Adresli Sıcaklık Dedektörü, izolatörlü',
    quantity: 6, unit: 'Adet', unitPrice: 5.53, totalPrice: 33.18,
  });

  // Item 7
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'ZX-C 4" İzolatör dedektörleri için soket',
    quantity: 6, unit: 'Adet', unitPrice: 1.04, totalPrice: 6.24,
  });

  // Item 8
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'Kuru Kontak (DOĞALGAZ DEDEKTÖRÜ) Dahili ortam tipi',
    quantity: 2, unit: 'Adet', unitPrice: 3.60, totalPrice: 7.20,
  });

  // NOTE
  items.push({
    itemType: 'NOTE',
    description: 'Doğalgaz dedektörü için gerekli izleme modülünün 13 pozlu modülde mevcuttur.',
    quantity: 0, unit: 'Adet', unitPrice: 0, totalPrice: 0,
  });

  // OPSİYONEL 1 (qty=0, shows price but total=0)
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'Smart 3-NC, Methane CH4 Endüstriyel Tip Gaz Dedektörü, 4-20 mA, 0-100% LFL, 4-20 mA output, opsiyonel 1 veya 3 röle çıkışı opsiyonel RS485 Modbus iletişim, IP55',
    quantity: 0, unit: 'Adet', unitPrice: 124.00, totalPrice: 0,
    notes: 'OPSİYONEL',
  });

  // OPSİYONEL 2
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'SMART 3 Gaz dedektörleri için 3-lü Röle Çıkış Kartı, Relay at 12~24V',
    quantity: 0, unit: 'Adet', unitPrice: 27.70, totalPrice: 0,
    notes: 'OPSİYONEL',
  });

  // NOTE
  items.push({
    itemType: 'NOTE',
    description: 'Endüstriyel tip gaz dedektörü kullanılması durumunda güç kaynakları gereklidir',
    quantity: 0, unit: 'Adet', unitPrice: 0, totalPrice: 0,
  });

  // Item 9
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'ZX-MCP Dahili tip adreslenebilir yangın ihbar butonu izolatörlü',
    quantity: 10, unit: 'Adet', unitPrice: 9.12, totalPrice: 91.20,
  });

  // Item 10
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'ZX-MCP Dahili tip adreslenebilir yangın ihbar butonu montaj kutusu',
    quantity: 10, unit: 'Adet', unitPrice: 0.45, totalPrice: 4.50,
  });

  // Item 11
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'ZX-MIM Adreslenebilir 1 girişli modül.pcb',
    quantity: 13, unit: 'Adet', unitPrice: 7.31, totalPrice: 95.03,
  });

  // Item 12
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'Module Box (85*85)',
    quantity: 13, unit: 'Adet', unitPrice: 0.37, totalPrice: 4.81,
  });

  // Item 13
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'ZX-RIM Adreslenebilir 1 çıkışlı modül,ön kapak ile birlikte',
    quantity: 6, unit: 'Adet', unitPrice: 10.40, totalPrice: 62.40,
  });

  // Item 14
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'K2142 Beyaz Plastik modül montaj kutusu',
    quantity: 6, unit: 'Adet', unitPrice: 0.52, totalPrice: 3.12,
  });

  // Item 15
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'P80AVR Adresli Flaşörlü Siren, Dahili Tip',
    quantity: 7, unit: 'Adet', unitPrice: 21.80, totalPrice: 152.60,
  });

  // Item 16
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'Flaşörlü Siren Arka Kapak',
    quantity: 7, unit: 'Adet', unitPrice: 1.36, totalPrice: 9.52,
  });

  // Item 17
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'FireLaser DTS-FL-03-02-02CH Fiber Optik Doğrusal Yangın Algılama Ünitesi, 2 kanal çıkışlı, Maksimum 2 x 2 km veya 1 x 2km loop kapasiteli, 5.7 " Dokunmatik LCD Gösterge, 50 Programlanabilir Kontak çıkış, 1000 algılama zon kapasiteli, Fiber kablo koptuğunda çalışma özelliği, 3 x RJ45 (100Mbps), Seri 2 x RS485, Modbus Master Çıkış TCP/IP,1 x USB, 18" Rack Montaja uygun, IP44, -10, +55 C Çalışma Sıcaklığı, Laser Koruma Sınıfı Class 1M, 24VDC, Ethernet, VdS EN54-22 Onaylı',
    quantity: 1, unit: 'Adet', unitPrice: 8910.00, totalPrice: 8910.00,
  });

  // Item 18
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'Lokal Güç Kaynağı, 24 VDC, 5A EN54-4 Onaylı',
    quantity: 1, unit: 'Adet', unitPrice: 27.60, totalPrice: 27.60,
  });

  // Item 19
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: '7 Ah 12V DC Bakım Gerektirmeyen Akü',
    quantity: 2, unit: 'Adet', unitPrice: 2.70, totalPrice: 5.40,
  });

  // Item 20
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'ZX-CIM Adreslenebilir 2 girişli izleme modülü ön kapak dahil',
    quantity: 8, unit: 'Adet', unitPrice: 9.43, totalPrice: 75.44,
  });

  // NOTE
  items.push({
    itemType: 'NOTE',
    description: 'DTS sistemi için sahada belirlenecek zon sayısına göre 20 poz artış olabilir.',
    quantity: 0, unit: 'Adet', unitPrice: 0, totalPrice: 0,
  });

  // Item 21
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'K2142 Beyaz Plastik modül montaj kutusu',
    quantity: 16, unit: 'Adet', unitPrice: 0.52, totalPrice: 8.32,
  });

  // Item 22
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'FireFibre-AT Fiber sensor kablosu, 62.5/125 Multi Mode, 2.1mm\'lik Paslanmaz Çelik Zırhlı Tüp içinde çift fibre (2 kıl), Orj Kılıf LSZH-FRNC 3.3mm ,-40 °C + 85 °C Çalışma sıcaklığı, IP68, VdS EN54-22 Onaylı',
    quantity: 800, unit: 'mt.', unitPrice: 0.52, totalPrice: 418.00,
  });

  // ═══════════════════════ ÜRETİM ALANI ═══════════════════════
  items.push({ itemType: 'HEADER', description: 'ÜRETİM ALANI', quantity: 0, unit: 'Adet', unitPrice: 0, totalPrice: 0 });

  // Item 23
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'ZX-IP Akıllı İnteraktif Adresli Optik Duman Dedektörü, izolatörlü',
    quantity: 75, unit: 'Adet', unitPrice: 6.19, totalPrice: 464.25,
  });

  // Item 24
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'ZX-C 4" İzolatör dedektörleri için soket',
    quantity: 75, unit: 'Adet', unitPrice: 1.04, totalPrice: 78.00,
  });

  // Item 25
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'ZX-IH Akıllı İnteraktif Adresli Sıcaklık Dedektörü, izolatörlü',
    quantity: 4, unit: 'Adet', unitPrice: 5.53, totalPrice: 22.12,
  });

  // Item 26
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'ZX-C 4" İzolatör dedektörleri için soket',
    quantity: 4, unit: 'Adet', unitPrice: 1.04, totalPrice: 4.16,
  });

  // Items 27-28 are not in the reference PDF (numbering skips from 26 to 29)

  // Item 29
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'ZX-MCP Adreslenebilir Harici Tip Yangın İhbar Butonu',
    quantity: 41, unit: 'Adet', unitPrice: 30.60, totalPrice: 1254.60,
  });

  // Item 30
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'ZX-MIM Adreslenebilir 1 girişli modül.pcb',
    quantity: 3, unit: 'Adet', unitPrice: 7.31, totalPrice: 21.93,
  });

  // Item 31
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'Module Box (85*85)',
    quantity: 3, unit: 'Adet', unitPrice: 0.37, totalPrice: 1.11,
  });

  // Item 32
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'ZX-RIM Adreslenebilir 1 çıkışlı modül,ön kapak ile birlikte',
    quantity: 16, unit: 'Adet', unitPrice: 10.40, totalPrice: 168.40,
  });

  // Item 33
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'K2142 Beyaz Plastik modül montaj kutusu',
    quantity: 16, unit: 'Adet', unitPrice: 0.52, totalPrice: 8.32,
  });

  // Item 34
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'LPBS885 Adreslenebilir Harici tip Siren flaşör IP65  VAD',
    quantity: 19, unit: 'Adet', unitPrice: 50.50, totalPrice: 959.50,
  });

  // Item 35
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'FireFibre-AT Fiber sensor kablosu, 62.5/125 Multi Mode, 2.1mm\'lik Paslanmaz Çelik Zırhlı Tüp içinde çift fibre (2 kıl), Orj Kılıf LSZH-FRNC 3.3mm ,-40 °C + 85 °C Çalışma sıcaklığı, IP68, VdS EN54-22 Onaylı',
    quantity: 700, unit: 'mt.', unitPrice: 0.52, totalPrice: 364.00,
  });

  // NOTE after ÜRETİM ALANI
  items.push({
    itemType: 'NOTE',
    description: 'Tüm tesis için Fiber optik doğrusal yangın algılama düşünülecek olur ise DTS ünitesi 4 kanal 5 km olarak seçilmelidir.',
    quantity: 0, unit: 'Adet', unitPrice: 0, totalPrice: 0,
  });

  // OPSİYONEL: FireLaser 4-channel
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'FireLaser DTS-FL-03-05-04CH Fiber Optik Doğrusal Yangın Algılama Ünitesi, 4 kanal çıkışlı, Maksimum 4 x 5 km veya 2 x 5km loop kapasiteli, 5.7 " Dokunmatik LCD Gösterge, 50 Programlanabilir Kontak çıkış, 1000 algılama zon kapasiteli, Fiber kablo koptuğunda çalışma özelliği, 3 x RJ45 (100Mbps), Seri 2 x RS485, Modbus Master Çıkış TCP/IP,1 x USB, 19" Rack Montaja uygun, IP44, -10, +55 C Çalışma Sıcaklığı, Laser Koruma Sınıfı Class 1M, 24VDC, Ethernet, VdS EN54-22 Onaylı',
    quantity: 0, unit: 'Adet', unitPrice: 11882.00, totalPrice: 0,
    notes: 'OPSİYONEL',
  });

  // OPSİYONEL: METHANE
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'METHANE Gaz Dedektörü, Endüstriyel Tip, 4-20 mA, 0-100% LFL, Standard 4-20 mA 3 wire çıkış, Opsiyonel 3 adet röle çıkışı, IP 55, Opsiyonel RS485 arayüzü ile Modbus haberleşmesi, ATEX: II 3G Ex db ec nC IIC T5 Gc Sertifikalı, Donanımda SIL 2 & yazılımda SIL3 Sertifikalı',
    quantity: 0, unit: 'Adet', unitPrice: 124.00, totalPrice: 0,
    notes: 'OPSİYONEL',
  });

  // OPSİYONEL: SMART 3G
  items.push({
    itemType: 'CUSTOM', isManualPrice: true,
    description: 'SMART 3G Gaz dedektörleri için 3-lü Röle Çıkış Kartı, Relay at 12~24V',
    quantity: 0, unit: 'Adet', unitPrice: 27.70, totalPrice: 0,
    notes: 'OPSİYONEL',
  });

  // ═══════════════════════ SERVICE SECTION ═══════════════════════
  items.push({
    itemType: 'SET', isManualPrice: true,
    description: 'Montaj Süpervizörlüğü, Mühendislik, Test ve Devreye Alma Çalışmaları',
    quantity: 1, unit: 'Set', unitPrice: 3978.00, totalPrice: 3978.00,
  });

  // ─── Create all items ─────────────────────────────────────────────
  for (const item of items) {
    await prisma.quoteItem.create({
      data: {
        quoteId: quote.id,
        itemType: item.itemType,
        sortOrder: sortOrder++,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        listPrice: item.listPrice ?? 0,
        katsayi: 1,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        discountPct: 0,
        vatRate: 0,
        isManualPrice: item.isManualPrice ?? false,
        notes: item.notes ?? null,
        serviceMeta: item.serviceMeta ?? undefined,
      },
    });
  }
  console.log(`Created ${items.length} quote items.`);

  // ─── COMMERCIAL TERMS ─────────────────────────────────────────────
  const commercialTerms = [
    {
      category: 'uretici_firmalar',
      value: 'TYCO ZETTLER- ADRESLİ YANGIN ALGILAMA SİSTEMİ\nBANDWEAVER Ltd. -Fiber Optik Doğrusal Yangın Algılama Sistemi\nİÇ PİYASA- AKÜ, GÜÇ KAYNAĞI, DOĞAL GAZ DEDEKTÖRÜ',
      sortOrder: 1,
    },
    {
      category: 'onaylar',
      value: 'EN54 VdS - Almanya, CE, ISO9001',
      sortOrder: 2,
    },
    {
      category: 'garanti',
      value: 'Teklif ettiğimiz cihazlar fatura tarihinden itibaren 2 yıl süre ile Üretici Firmaların garantisi altındadır. Anlaşmazlıklar halinde Üretici Firmaların satış sonrası garanti şartları geçerli olacaktır.',
      sortOrder: 3,
    },
    {
      category: 'teslim_yeri',
      value: 'İstanbul BTS Yangın Depo teslimidir.',
      sortOrder: 4,
    },
    {
      category: 'odeme',
      value: 'USD cinsinden BTS depo teslimi verilen fiyatlarımız, siparişte %40 avans, bakiye malzeme tesliminde peşin banka havalesiyle ödenecektir.\nTL ödenmesi durumunda, ödeme tarihlerinde geçerli olacak GARANTİ BBVA Efektif Döviz Satış kuru üzerinden TL ye çevrilerek, peşin banka havalesiyle ödenecektir.',
      sortOrder: 5,
    },
    {
      category: 'kdv',
      value: 'Fiyatlarımıza KDV dahil değildir.',
      sortOrder: 6,
    },
    {
      category: 'teslimat',
      value: 'Kesin siparişten sonra malzeme teslimi 8-10 haftadır. Sahadaki iş planına göre termin süreleri tekrar değerlendirilecektir. Stok durumunu kontrol ediniz.',
      sortOrder: 7,
    },
    {
      category: 'opsiyon',
      value: 'Teklifimiz taşıdığı tarihten itibaren 30 gün süre ile geçerlidir.',
      sortOrder: 8,
    },
  ];

  await prisma.quoteCommercialTerm.createMany({
    data: commercialTerms.map((t) => ({
      quoteId: quote.id,
      category: t.category,
      value: t.value,
      sortOrder: t.sortOrder,
      highlight: false,
    })),
  });
  console.log(`Created ${commercialTerms.length} commercial terms.`);

  // ─── NOTLAR ─────────────────────────────────────────────────────
  const notlar = [
    {
      value: 'Teklifimiz bir bütün halinde geçerli olup, teklif ettiğimiz yukarıdaki cihazların ayrı anda siparişi durumunda geçerlidir. Parçalı sipariş verilmesi durumunda fiyatlarımız revize edilecektir.',
      sortOrder: 1,
      highlight: false,
    },
    {
      value: 'Teklifimiz ihalesi projelerine göre hazırlanmıştır. Artan / eksilen adet, metrajlar birim fiyat üzerinden hesaplanacaktır. Kesinleşen projeve Uygulama aşamasında kablo güzergahı, mimari değişiklikler vb. gibi durumlardan dolayı değişiklik olması durumunda teklifimiz revize edilecektir.',
      sortOrder: 2,
      highlight: false,
    },
    {
      value: 'Devreye alma esnasında ihtiyaç olabilecek yükselitci ekipman tarafınızca sağlanacaktır.',
      sortOrder: 3,
      highlight: false,
    },
    {
      value: 'Teklifte yer alan montaj supervizörlüğü ve devreye alma çalışmalarının mesai saatleri içerisinde yapılacağı öngörülmüştür. Mesai saatleri harici çalışmalar için montaj fiyatlarımızı revize etme hakkımız saklıdır.',
      sortOrder: 4,
      highlight: false,
    },
    {
      value: 'T.C Ticaret Bakanlığının kanun ve yönetmeliklerindeki vergi değişiklikleri nedeniyle oluşacak maliyet artışları teklifimiz birim fiyatlarına yansıtılacaktır.',
      sortOrder: 5,
      highlight: false,
    },
    {
      value: 'Bu teklif BTS Yangın Güvenlik Yapı Teknolojileri San. ve Tic. Ltd Şti. tarafından firmanıza özel olarak hazırlanmıştır. Teklif içerisinde firmamızın özel bilgileri bulunmaktadır. Bu nedenle 3. kişilerle paylaşılması kesinlikle yasaktır. Bu teklifin izniniz olmadan paylaşılması durumunda BTS Yangın Güvenlik Yapı Teknolojileri San. ve Tic. Ltd Şti. Tüm hakları saklı kalmak kaydı ile hukuki işlem başlatma seçeneği bulunmaktadır.',
      sortOrder: 6,
      highlight: false,
    },
    {
      value: 'Belirtilen Pano/alanlarda açıklık olmadığı varsayılarak hesaplama yapılmıştır. Bu sebeple açıklık varsa ilgili mahallerde açıklıklar kapatılmalıdır. Veya açıklık bilgisi paylaşılarak hesaplamalar tekrar yapılmalıdır.',
      sortOrder: 7,
      highlight: true, // Yellow highlight on last note
    },
  ];

  await prisma.quoteCommercialTerm.createMany({
    data: notlar.map((n) => ({
      quoteId: quote.id,
      category: 'NOTLAR',
      value: n.value,
      sortOrder: n.sortOrder + 100, // Offset to keep after commercial terms
      highlight: n.highlight,
    })),
  });
  console.log(`Created ${notlar.length} NOTLAR entries.`);

  // ─── DAHIL_OLMAYAN term ─────────────────────────────────────────
  await prisma.quoteCommercialTerm.create({
    data: {
      quoteId: quote.id,
      category: 'DAHIL_OLMAYAN',
      value: 'Cihaz Montajları, Kablolama, Borulama, Fiber Ek İşçiliği, İşçilik, Kazı, kanm vb. inşai işler, 3 parti kişi veya firmaların sahada yapacakları denetlemeler, kontroler,tester ve araştırmalar, sahada yapılacak çalışma izinleri, sözleşme giderleri, İSG giderleri, yükselitci ekipmanlar, damga vergisi teklif kapsamımız haricindedir.',
      sortOrder: 200,
      highlight: false,
    },
  });
  console.log('Created DAHIL_OLMAYAN entry.');

  console.log(`\nDone! Quote SA0056-YAS created with ID: ${quote.id}`);
  console.log(`Open in editor: /quotes/${quote.id}/edit`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
