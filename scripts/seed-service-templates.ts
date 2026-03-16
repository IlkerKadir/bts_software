/**
 * Seed CommercialTermTemplate with MUH_ACIKLAMA and DAHIL_OLMAYAN defaults.
 *
 * MUH_ACIKLAMA — müh.devreye alma description blocks shown in PDF (Mode B)
 * DAHIL_OLMAYAN — excluded services default text (per-quote editable)
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
  // MUH_ACIKLAMA — müh.devreye alma description template
  const muhTemplates = [
    {
      category: 'MUH_ACIKLAMA',
      name: 'Müh. Devreye Alma Başlık',
      value: 'Mühendislik, Test ve Devreye Alma Çalışmaları',
      isDefault: true,
      sortOrder: 0,
    },
    {
      category: 'MUH_ACIKLAMA',
      name: 'Müh. Devreye Alma Detay',
      value: 'Tarafınızca kablolaması tamamlanan sistemin, sahada program testlerinin yapılıp sistemin devreye alınması, İşletme elemanlarına 1 kereye mahsus 1 gün eğitim verilmesi dahildir.',
      isDefault: true,
      sortOrder: 1,
    },
    {
      category: 'MUH_ACIKLAMA',
      name: 'Müh. Hizmet Kalemleri',
      value: [
        'Sistem Nokta Konfigürasyonu ve Kontrol Senaryolarının Kesinleştirilmesi',
        'Saha Kontrol Panelleri İç Kablo Bağlantılarının Yapılması',
        'Yangın senaryosu dikkate alınarak yangın alarm kontrol panelleri programlamasının hazırlanması',
        'Sahada Yangın Alarm Sistemi Program Testlerinin Yapılıp Sistemin Devreye Alınması için gerekli olacak hizmet bedelleri',
      ].join('\n'),
      isDefault: true,
      sortOrder: 2,
    },
  ];

  // DAHIL_OLMAYAN — excluded services template
  const dahilOlmayanTemplates = [
    {
      category: 'DAHIL_OLMAYAN',
      name: 'Dahil Olmayan Hizmetler',
      value: 'Cihaz Montajları, Kablolama, Borulama, Fiber Ek İşçiliği, İşçilik, Kazı, kanal vb. inşai işler, 3 parti kişi veya firmaların sahada yapacakları denetlemeler, kontroler, tester ve araştırmalar, sahada yapılacak çalışma izinleri, sözleşme giderleri, İSG giderleri, yükseltici ekipmanlar, damga vergisi teklif kapsamımız haricindedir.',
      isDefault: true,
      sortOrder: 0,
    },
  ];

  for (const t of [...muhTemplates, ...dahilOlmayanTemplates]) {
    const seedId = `seed-${t.category}-${t.sortOrder}`;
    await db.commercialTermTemplate.upsert({
      where: { id: seedId },
      create: { id: seedId, ...t },
      update: t,
    });
  }

  console.log('Service templates seeded');
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
