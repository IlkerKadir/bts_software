import ExcelJS from 'exceljs';
import path from 'path';

async function createProductTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BTS Teklif Sistemi';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Ürün Listesi');

  // Define columns matching product-import.ts expected headers
  const headers = [
    { header: 'MARKA', key: 'marka', width: 18 },
    { header: 'KATEGORİ', key: 'kategori', width: 20 },
    { header: 'MODEL', key: 'model', width: 20 },
    { header: 'KISA KOD', key: 'kisaKod', width: 15 },
    { header: 'ÜRÜN KODU', key: 'urunKodu', width: 25 },
    { header: 'ÜRÜN ADI', key: 'urunAdi', width: 45 },
    { header: 'BİRİM', key: 'birim', width: 12 },
    { header: 'LİSTE FİYATI', key: 'listeFiyati', width: 18 },
    { header: 'MALİYET FİYATI', key: 'maliyetFiyati', width: 18 },
    { header: 'PARA BİRİMİ', key: 'paraBirimi', width: 15 },
    { header: 'TEDARİKÇİ', key: 'tedarikci', width: 20 },
    { header: 'DİL', key: 'dil', width: 10 },
  ];

  worksheet.columns = headers;

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F2937' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 28;

  // Add borders to header
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'medium' },
      right: { style: 'thin' },
    };
  });

  // Add 2 sample rows so the client understands the format
  const sampleData = [
    {
      marka: 'Bosch',
      kategori: 'Yangın Algılama',
      model: 'FPA-5000',
      kisaKod: 'BSH-FPA',
      urunKodu: 'FPA-5000-A',
      urunAdi: 'Yangın Alarm Santralı',
      birim: 'Adet',
      listeFiyati: 1250.00,
      maliyetFiyati: 875.00,
      paraBirimi: 'EUR',
      tedarikci: 'Bosch Türkiye',
      dil: 'TR',
    },
    {
      marka: 'Bosch',
      kategori: 'Yangın Algılama',
      model: 'FPA-5000',
      kisaKod: 'BSH-FPA',
      urunKodu: 'FPA-5000-A',
      urunAdi: 'Fire Alarm Control Panel',
      birim: 'Adet',
      listeFiyati: 1250.00,
      maliyetFiyati: 875.00,
      paraBirimi: 'EUR',
      tedarikci: 'Bosch Türkiye',
      dil: 'EN',
    },
  ];

  sampleData.forEach((data) => {
    const row = worksheet.addRow(data);
    row.font = { color: { argb: 'FF9CA3AF' }, italic: true, size: 10 };
    row.alignment = { vertical: 'middle' };
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    });
  });

  // Format price columns as number
  worksheet.getColumn('listeFiyati').numFmt = '#,##0.00';
  worksheet.getColumn('maliyetFiyati').numFmt = '#,##0.00';

  // Add data validation for dropdowns
  const colLetters = {
    birim: 'G',
    paraBirimi: 'J',
    dil: 'L',
  };

  for (let row = 2; row <= 1000; row++) {
    worksheet.getCell(`${colLetters.birim}${row}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Adet,m,Set,Kişi/Gün,Takım,Paket"'],
    };
    worksheet.getCell(`${colLetters.paraBirimi}${row}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"EUR,USD,GBP,TRY"'],
    };
    worksheet.getCell(`${colLetters.dil}${row}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"TR,EN"'],
    };
  }

  // Add an instructions sheet
  const infoSheet = workbook.addWorksheet('Açıklama');
  infoSheet.columns = [
    { header: 'Sütun', width: 20 },
    { header: 'Açıklama', width: 55 },
    { header: 'Zorunlu', width: 12 },
    { header: 'Örnek', width: 25 },
  ];

  const infoHeaderRow = infoSheet.getRow(1);
  infoHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  infoHeaderRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F2937' },
  };
  infoHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' };
  infoHeaderRow.height = 28;

  const instructions = [
    ['MARKA', 'Ürün markası', 'Hayır', 'Bosch'],
    ['KATEGORİ', 'Ürün kategorisi', 'Hayır', 'Yangın Algılama'],
    ['MODEL', 'Ürün model bilgisi', 'Hayır', 'FPA-5000'],
    ['KISA KOD', 'Kısa ürün kodu', 'Hayır', 'BSH-FPA'],
    ['ÜRÜN KODU', 'Benzersiz ürün kodu (anahtar alan)', 'Evet', 'FPA-5000-A'],
    ['ÜRÜN ADI', 'Ürün açıklaması', 'Evet', 'Yangın Alarm Santralı'],
    ['BİRİM', 'Ölçü birimi (Adet, m, Set, Kişi/Gün, Takım, Paket)', 'Hayır', 'Adet'],
    ['LİSTE FİYATI', 'Liste fiyatı (sayısal)', 'Evet', '1250.00'],
    ['MALİYET FİYATI', 'Alış / maliyet fiyatı (sayısal)', 'Hayır', '875.00'],
    ['PARA BİRİMİ', 'EUR, USD, GBP veya TRY', 'Hayır', 'EUR'],
    ['TEDARİKÇİ', 'Tedarikçi firma adı', 'Hayır', 'Bosch Türkiye'],
    ['DİL', 'TR veya EN (aynı ürün kodu ile 2 satır)', 'Hayır', 'TR'],
  ];

  instructions.forEach((row) => {
    const addedRow = infoSheet.addRow(row);
    addedRow.alignment = { vertical: 'middle' };
    addedRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    });
  });

  // Freeze header row on both sheets
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  infoSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Auto-filter on main sheet
  worksheet.autoFilter = { from: 'A1', to: 'L1' };

  const outputPath = path.resolve(__dirname, '..', 'urun_import_sablonu.xlsx');
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Template created: ${outputPath}`);
}

createProductTemplate().catch(console.error);
