/**
 * Seed TAŞERON (subcontractor) products into the Product table.
 * Does NOT remove any existing records — uses upsert on unique code.
 *
 * Run: npx tsx scripts/seed-taseron-products.ts
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

interface TaseronProduct {
  shortCode: string;
  code: string;
  name: string;
}

const products: TaseronProduct[] = [
  { shortCode: 'TŞRN-KBL-TV', code: 'TŞRN-KBL-TV', name: 'Kablo Tavası (40x400 mm Kapaklı), Aparatları ile birlikte komple' },
  { shortCode: 'TSRN-ALTYP-M-T', code: 'TSRN-ALÇPN-ONRM1/2m2', name: 'Alçıpan Onarımı (Alçıpan Profil, sıva ve boya işlemi) 1/2m2\'ye kadar' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'MNTJ FO', name: 'Fiber Optik Kontrol Paneli Montajı' },
  { shortCode: 'BTS-MUH', code: 'YKSK - GNLK', name: 'Yüksekte Çalışma Ekipmanı Günlük' },
  { shortCode: 'TSRN-KBL-M-T', code: 'TSRN-HHKM', name: 'Hoparlör Hattı Kablosu Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-KTMAİBK', name: 'Kablo Tavası Montajı (Aparatları İle Birlikte Komple)' },
  { shortCode: 'TŞRN-KBL-TV', code: 'KAZI**', name: 'Kazı işleri, Q50 PVC boru kablo korumalı, kazı, dolgu, üst kaplama vb. işler dahil' },
  { shortCode: 'TSRN-KBL-M-T', code: 'TSRN-LHKM', name: 'Loop Hattı Kablosu Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'MNTJ - EX', name: 'Exproof Harici Alev detektörü montajı' },
  { shortCode: 'TŞRN-KBL-TV', code: 'MNTJ-KK', name: 'Kablo Kanalı Montajı (Aparatları İle Birlikte Komple)' },
  { shortCode: 'AFI-CHZ-T', code: 'SC LVHA', name: '100x100 cm Sac Levha Montajı' },
  { shortCode: 'TSRN-KBL-M-T', code: 'TSRN-SHKM', name: 'Siren Hattı Kablosu Montajı' },
  { shortCode: 'İÇP-CHZ-T', code: 'SKX-20IE-TR', name: '400x600x200mm, Paslanmaz Çelik Exproof Pano AISI 316L, Ex eb ia/ib llC T6 Gb' },
  { shortCode: 'İÇP-CHZ-T', code: 'SKX-20IE-EN', name: '400x600x200mm, Stainless Steel Encloser AISI 316L, Ex eb ia/ib llC T6 Gb' },
  { shortCode: 'TŞRN-KBL-TV', code: 'Q16 Spiral Boru', name: 'Q16 Spiral Boru Hafif Seri Halojen Free Temini' },
  { shortCode: 'TŞRN-KBL-TV', code: 'SU-05', name: '50 mm Sıcak Daldırma Galvaniz Kablo Kanalı' },
  { shortCode: 'TSRN-ALTYP-M-T', code: 'TSRN-ALÇPN-ONRM1m2', name: 'Alçıpan Onarımı (Alçıpan Profil, sıva ve boya işlemi) 1/2m2 - 1m2 aralığında' },
  { shortCode: 'TŞRN-KBL-TV', code: 'TŞRN-KİM-ant-001', name: 'Kaynaklı İmalat (Antipas ve Son kat boyaması dahil)' },
  { shortCode: 'TŞRN-KBL-TV', code: 'TŞRN-PPRC', name: '2" PPRC Boru Temini ve Montajı' },
  { shortCode: 'TSRN-KBL-M-T', code: 'TSRN-220VACBHKM', name: '220 VAC Besleme Hattı Kablosu Montajı' },
  { shortCode: 'TSRN-KBL-M-T', code: 'TSRN-24VDCBHKM', name: '24 VDC Besleme Hattı Kablosu Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-FODYAKM', name: 'Fiber Optik Doğrusal Yangın Algılama Kablosu Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-AASMM', name: 'Acil Anons Sistem Merkezi Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-AÇBM', name: 'Acil Çıkış Butonu Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-AHEDABMAİPVCAİBK', name: 'Aktif Hava Emişli Duman Algılama Borusu Montajı, (Aparatları İle Birlikte Komple)' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-AHEDADM', name: 'Aktif Hava Emişli Duman Algılama Dedektörü Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-AİPVCBMKÇİAİBK', name: 'Alev İletmez PVC Boru Montajı Kablo Çekimi İçin (Aparatları İle Birlikte Komple)' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-ATSÜTHM', name: 'Asma Tavan/Sıva Üstü Tipi Hoparlör Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-BAPM', name: 'Bölgesel Ayar Paneli Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-ÇTMÇGABK', name: 'Çelik Tel Montajı (Çekme Germe Aparatları ile Birlikte Komple)' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-DBSMM', name: 'Dedektör, Buton, Siren ve Modül Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-DKM', name: 'Dahili Kamera Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-DOÇZKSMZÜ', name: 'Dış Ortam Çelik Zırhlı Kablo Spiral Montajı (Zemin Üstü)' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-DOKBMZÜ', name: 'Dış Ortam Kangal Boru Montajı (Zemin Üstü)' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-DTKM', name: 'Duvar Tipi Kabinet Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-EMTBMAİBK', name: 'EMT Boru Montajı (Aparatları İle Birlikte Komple)' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-FOÇM', name: 'Fiber Optik Çevirici Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-GKMVACVDC', name: 'Güç Kaynağı Montajı (220 VAC 24 VDC)' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-GMM', name: 'Güvenlik Monitörü Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-HKM', name: 'Harici Kamera Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-HKTHM', name: 'Horn/Kolon Tipi Hoparlör Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-IPMKM', name: 'Modül Kutusu Montajı, IP 67' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-IPMPM', name: 'Modül Montaj Panosu Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-IPMPM-IP67', name: 'Modül Montaj Panosu Montajı, IP 67' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-KCM', name: 'Kayıt Cihazı Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-KDMBKB', name: 'Kamera Direk Montajı (Beton Kaide ile Birlikte)' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-KGKPM', name: 'Kartlı Giriş Kontrol Paneli Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-KKİBZM', name: 'Kazı Kapama İşçiliği Beton Zemin (1 Metre için)' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-KKİTZM', name: 'Kazı Kapama İşçiliği Toprak Zemin (1 Metre için)' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-KLBEAMYNITDDM', name: 'Reflektörlü Işın Tipi Duman Dedektörü Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-KOM', name: 'Kart Okuyucu Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-KSM', name: 'Kenar Switch Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-MKM-KLT', name: 'Manyetik Kilit Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-MKM-KNT', name: 'Manyetik Kontak Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-MOSM', name: 'Merkezi (Omurga) Switch Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-OSIDYNITDDM', name: 'OSID Yeni Nesil Işın Tipi Duman Dedektörü Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-PKKAM', name: 'Plastik Kablo Kanalı (Aparatları ile birlikte komple) Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-PTHM', name: 'Projektör Tipi Hoparlör Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-PTZKM', name: 'PTZ Kamera Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-SKPM', name: 'Söndürme Kontrol Paneli Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-UPSM', name: 'UPS Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-YAKPM', name: 'Yangın Alarm Kontrol Paneli Montajı' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-YÇEAKND-10M', name: 'Yüksekte Çalışma Ekipmanı, 10 mt (1 Aylık Kirası-Nakliyeler Dahil)' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-YÇEAKND-15M', name: 'Yüksekte Çalışma Ekipmanı, 15 mt (1 Aylık Kirası-Nakliyeler Dahil)' },
  { shortCode: 'TSRN-CHZ-M-T', code: 'TSRN-YMKTM', name: 'Yangın Manyetik Kapı Tutucu Montajı' },
  { shortCode: 'TSRN-KBL-M-T', code: 'TSRN-CAT-6.IPK.TCP-IP.KM', name: 'CAT-6 IP Kamera / TCP-IP Kablosu Montajı' },
  { shortCode: 'TSRN-KBL-M-T', code: 'TSRN-LIHCHKM', name: 'Network Haberleşme (RS-485) Hattı Kablo Montajı' },
];

async function main() {
  console.log(`Seeding ${products.length} TAŞERON products...`);

  // Ensure "Taşeron" category exists
  const category = await db.productCategory.upsert({
    where: { name: 'Taşeron' },
    update: {},
    create: { name: 'Taşeron', sortOrder: 20 },
  });
  console.log(`Category: ${category.name} (${category.id})`);

  // Ensure "TAŞERON" brand exists
  let brand = await db.productBrand.findFirst({ where: { name: 'TAŞERON' } });
  if (!brand) {
    brand = await db.productBrand.create({
      data: { name: 'TAŞERON', sortOrder: 50 },
    });
    console.log(`Created brand: ${brand.name} (${brand.id})`);
  } else {
    console.log(`Brand: ${brand.name} (${brand.id})`);
  }

  let created = 0;
  let updated = 0;

  for (const p of products) {
    const data = {
      shortCode: p.shortCode,
      brandId: brand.id,
      categoryId: category.id,
      name: p.name,
      nameTr: p.name,
      pricingType: 'LIST_PRICE' as const,
      unit: 'Adet',
      listPrice: 0,
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

    console.log(`  ${existing ? 'Updated' : 'Created'}: ${p.code} — ${p.name}`);
  }

  console.log(`\nDone! Created: ${created}, Updated: ${updated}, Total: ${products.length}`);
}

main()
  .catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
