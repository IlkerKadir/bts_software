/**
 * Seed CommercialTermTemplate with data from "teklif formatı şablon.xlsx"
 *
 * Run with: npx tsx scripts/seed-commercial-terms.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TermSeed {
  category: string;
  name: string;
  value: string;
  isDefault: boolean;
  sortOrder: number;
  highlight: boolean;
}

const templates: TermSeed[] = [
  // ── DAHIL OLMAYAN HİZMETLER (fix — always appears) ──
  {
    category: 'DAHIL_OLMAYAN',
    name: 'Standart Kapsam Dışı',
    value: 'Dahil Olmayan Hizmetler: Kablolama, Cihaz montajları, Fiber ek işçiliği ve altyapı malzemeleri, Fusion sonlandırma, Yükseltici ekipmanlar, Kazı, kırım vb.. inşai işler, 3.parti kişi veya firmaların sahada yapacakları denetlemeler, kontroller, testler ve araştırmalar, sahada yapılacak çalışma izinleri, sözleşme giderleri, isg giderleri.. teklif kapsamımız haricindedir.',
    isDefault: true,
    sortOrder: 1,
    highlight: false,
  },

  // ── ÜRETİCİ FİRMALAR (selectable — comma-joined in output) ──
  ...[
    'TYCO ZETTLER',
    'ZETA',
    'İÇ PİYASA',
    'ZETTLER',
    'XTRALIS',
    'BANDWEAVER',
    'SENSITRON',
    'E2S',
    'TYCO AMBIENT',
    'TYCO NEO',
    'HIKVISION',
    'BTS',
    'TYCO ONE',
  ].map((name, i) => ({
    category: 'uretici_firmalar',
    name,
    value: name,
    isDefault: false,
    sortOrder: i + 1,
    highlight: false,
  })),

  // ── ÜRETİCİ FİRMALAR — İlgili Sistem Seçenekleri ──
  // These are the system descriptions that can be associated with each brand
  ...[
    'Yangın Algılama ve İhbar Sistemi',
    'Fiber Optik Doğrusal Yangın Alarm Sistemi',
    'Acil Anons Sistemi EN54',
    'CCTV Sistemi',
    'Kartlı Giriş Sistemi',
    'Aktif Hava Emişli Duman Algılama Dedektörleri',
    'OSID Yeni Nesil Işın Tipi Duman Algılama Dedektörleri',
    'Kablolar, Borular, Altyapı ve Montaj Elemanları',
    'Aküler',
    'EN54 Lokal Güç Kaynakları',
    'EN54 Flaşörlü Sirenler',
    'EN54 Harici Butonlar',
    'EN54 Harici Flaşörlü Sirenler',
    'Ex-Proof Hoparlörler, Ex-Proof Flaşörlü Sirenler',
  ].map((name, i) => ({
    category: 'uretici_firmalar',
    name: `Sistem: ${name}`,
    value: name,
    isDefault: false,
    sortOrder: 100 + i,
    highlight: false,
  })),

  // ── ONAYLAR (selectable — comma-joined) ──
  ...[
    'EN54',
    'VdS - Almanya',
    'LPCB - İngiltere',
    'BRE Global - İngiltere',
    'INTERTEK',
    'CE',
    'ISO9001',
    'TSE',
    'FM GLOBAL',
    'UL - ABD',
    'ULC',
    'EU doc - İsviçre',
    'EC doc - İsviçre',
    'ActivFire',
    'AFNOR',
  ].map((name, i) => ({
    category: 'onaylar',
    name,
    value: name,
    isDefault: false,
    sortOrder: i + 1,
    highlight: false,
  })),

  // ── GARANTİ (fix) ──
  {
    category: 'garanti',
    name: 'Standart Garanti',
    value: 'Teklif ettiğimiz cihazlar fatura tarihinden itibaren 2 yıl süre ile Üretici Firmaların garantisi altındadır. Anlaşmazlıklar halinde Üretici Firmaların satış sonrası garanti şartları geçerli olacaktır.',
    isDefault: true,
    sortOrder: 1,
    highlight: false,
  },

  // ── TESLİM YERİ (selectable) ──
  ...[
    { name: 'İstanbul BTS Depo', value: 'İstanbul BTS Yangın Depo teslimidir. Nakliye tarafınıza aittir.', isDefault: true },
    { name: 'İstanbul Şantiye Depo', value: 'İSTANBUL Şantiye Depo teslimi' },
    { name: 'Exworks Fabrika Çıkışı', value: 'Exworks Fabrika Çıkışı teslimidir.' },
    { name: 'Havalimanı Gümrüksüz', value: 'İstanbul Atatürk Havalimanı Gümrüksüz Alanda Teslim' },
  ].map((t, i) => ({
    category: 'teslim_yeri',
    name: t.name,
    value: t.value,
    isDefault: t.isDefault || false,
    sortOrder: i + 1,
    highlight: false,
  })),

  // ── ÖDEME (fix) ──
  {
    category: 'odeme',
    name: 'Standart Ödeme',
    value: 'Euro cinsinden BTS depo teslimi verilen fiyatlarımız, siparişte %40 avans, bakiye malzeme tesliminde peşin banka havalesiyle ödenecektir.\n\nTL ödenmesi durumunda; ödeme tarihlerinde geçerli olacak GARANTİ BBVA Efektif Döviz Satış kuru üzerinden TL ye çevrilerek, peşin banka havalesiyle ödenecektir.',
    isDefault: true,
    sortOrder: 1,
    highlight: false,
  },

  // ── KDV (fix) ──
  {
    category: 'kdv',
    name: 'KDV Hariç',
    value: 'Fiyatlarımıza KDV dahil değildir.',
    isDefault: true,
    sortOrder: 1,
    highlight: false,
  },

  // ── TESLİMAT (selectable) ──
  ...[
    { name: '8-10 Hafta', value: 'Kesin siparişten sonra malzeme teslimi 8-10 haftadır. Sahadaki iş planına göre termin süreleri tekrar değerlendirilecektir. Stok durumunu kontrol ediniz.', isDefault: true },
    { name: '2-4 Hafta', value: 'Kesin siparişten sonra 2-4 hafta.' },
    { name: '4-6 Hafta', value: 'Kesin siparişten sonra 4-6 hafta.' },
    { name: '6-8 Hafta', value: 'Kesin siparişten sonra 6-8 hafta.' },
  ].map((t, i) => ({
    category: 'teslimat',
    name: t.name,
    value: t.value,
    isDefault: t.isDefault || false,
    sortOrder: i + 1,
    highlight: false,
  })),

  // ── OPSİYON (selectable) ──
  ...[
    { name: '15 Gün', value: 'Teklifimiz taşıdığı tarihten itibaren 15 gün süre ile geçerlidir.' },
    { name: '1 Ay', value: 'Teklifimiz taşıdığı tarihten itibaren 1 ay süre ile geçerlidir.', isDefault: true },
    { name: '1 Hafta', value: 'Teklifimiz taşıdığı tarihten itibaren 1 hafta süre ile geçerlidir.' },
  ].map((t, i) => ({
    category: 'opsiyon',
    name: t.name,
    value: t.value,
    isDefault: t.isDefault || false,
    sortOrder: i + 1,
    highlight: false,
  })),

  // ── NOTLAR (mix of fix and selectable) ──
  // Fix (isDefault=true means always included)
  ...[
    { name: 'Bütün Sipariş', value: 'Teklifimiz bir bütün halinde geçerli olup, teklif ettiğimiz yukarıdaki cihazlarının aynı anda siparişi durumunda geçerlidir. Parçalı sipariş verilmesi durumunda fiyatlarımız revize edilecektir.', isDefault: true, sortOrder: 1 },
    { name: 'Yükseltici Ekipman', value: 'Devreye alma esnasında ihtiyaç olabilecek yükseltici ekipman tarafınızca sağlanacaktır.', isDefault: true, sortOrder: 5 },
    { name: 'Mesai Saatleri', value: 'Teklifte yer alan montaj süpervizörlüğü ve devreye alma çalışmalarının mesai saatleri içerisinde yapılacağı öngörülmüştür. Mesai saatleri harici çalışmalar için montaj fiyatlarımızı revize etme hakkımız saklıdır.', isDefault: true, sortOrder: 6 },
    { name: 'Vergi Değişiklikleri', value: 'T.C Ticaret Bakanlığının kanun ve yönetmeliklerindeki vergi değişiklikleri nedeniyle oluşacak maliyet artışları teklifimiz birim fiyatlarına yansıtılacaktır.', isDefault: true, sortOrder: 7 },
    { name: 'Harici Montaj', value: 'Malzeme montajları ve Sistem alt yapısı için harici montaj kutuları, panolar ve kabloların temini, kablolama, fiber alt yapısı ve İşçiliği, tarafınızca yapılacaktır. Bunlara karşılık gelen maliyetler tarafınızca karşılanacaktır.', isDefault: true, sortOrder: 9 },
    { name: 'Paket Teklif', value: 'Teklifimiz bir bütün halinde geçerli olup gönderdiğiniz projeye göre paket teklif verilmiştir. İşin tamamının tarafımıza tek seferde sipariş edilmesi gereklidir. Ancak Projenin işleyişi sırasında farklı safhalarda parçalı teslimat istenebilir. Bu durumda fiyatlarımızı revize etme hakkımız saklıdır.', isDefault: true, sortOrder: 10 },
    { name: 'Gizlilik', value: 'Bu teklif BTS Yangın Güvenlik Yapı Teknolojileri San. ve Tic. Ltd.Şti. tarafından firmanıza özel olarak hazırlanmıştır. Teklif içerisinde firmamızın özel bilgiler bulunmaktadır. Bu nedenle 3. kişilerle paylaşılması kesinlikle yasaktır. Bu teklifin iznimiz olmadan paylaşılması durumunda BTS Yangın Güvenlik Yapı Teknolojileri San. ve Tic. Ltd.Şti. Tüm hakları saklı kalmak kaydı ile hukuki işlem başlatma seçeneği bulunmaktadır.', isDefault: true, sortOrder: 11 },
  ].map((t) => ({
    category: 'NOTLAR',
    name: t.name,
    value: t.value,
    isDefault: t.isDefault,
    sortOrder: t.sortOrder,
    highlight: false,
  })),

  // Selectable notes
  ...[
    { name: 'Keşfe Göre', value: 'Teklifimiz iletilen keşfe göre hazırlanmıştır. Proje üzerinden çalışılmadığı için iletilen keşfe göre teklif çalışması yapılmıştır. Artan / eksilen adet, metrajlar birim fiyat üzerinden hesaplanacaktır. Kesinleşen projeye ve Uygulama aşamasında kablo güzergahı, mimari değişiklikler vb. gibi durumlardan dolayı değişiklik olması durumunda teklifimiz revize edilecektir.', sortOrder: 2 },
    { name: 'Projeye Göre', value: 'Teklifimiz iletilen mimari projeye göre hazırlanmıştır. Artan / eksilen adet, metrajlar birim fiyat üzerinden hesaplanacaktır. Kesinleşen projeye ve Uygulama aşamasında kablo güzergahı, mimari değişiklikler vb. gibi durumlardan dolayı değişiklik olması durumunda teklifimiz revize edilecektir.', sortOrder: 3 },
    { name: 'Sızdırmazlık', value: 'Sistemin yapılacağı odaların sızdırmazlığı sağlanmalıdır. Teklifimize sızdırmazlığın sağlanması dahil değildir.', sortOrder: 4 },
    { name: 'Açıklık Kontrolü', value: 'Belirtilen Panoda/alanlarda açıklık olmadığı varsayılarak hesaplama yapılmıştır. Bu sebeple açıklık varsa ilgili mahallerde açıklıklar kapatılmalıdır. Veya açıklık bilgisi paylaşılarak hesaplamalar tekrar yapılmalıdır.', sortOrder: 8 },
  ].map((t) => ({
    category: 'NOTLAR',
    name: t.name,
    value: t.value,
    isDefault: false,
    sortOrder: t.sortOrder,
    highlight: false,
  })),
];

async function main() {
  console.log('Clearing existing commercial term templates...');
  await prisma.commercialTermTemplate.deleteMany();

  console.log(`Seeding ${templates.length} commercial term templates...`);

  for (const t of templates) {
    await prisma.commercialTermTemplate.create({ data: t });
  }

  console.log('Done!');

  // Summary
  const counts = await prisma.commercialTermTemplate.groupBy({
    by: ['category'],
    _count: true,
  });
  console.log('\nSummary:');
  for (const c of counts) {
    console.log(`  ${c.category}: ${c._count} templates`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
