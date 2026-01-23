import ExcelJS from 'exceljs';

export interface QuoteItemForExcel {
  itemType: 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM';
  code?: string | null;
  brand?: string | null;
  description: string;
  quantity?: number;
  unit?: string | null;
  listPrice?: number;
  katsayi?: number;
  unitPrice?: number;
  discountPct?: number;
  totalPrice?: number;
  vatRate?: number;
}

export interface QuoteDataForExcel {
  quoteNumber: string;
  subject?: string | null;
  date: string;
  validUntil?: string | null;
  currency: string;
  company: string;
  project?: string | null;
  items: QuoteItemForExcel[];
  totals: {
    subtotal: number;
    totalVat: number;
    grandTotal: number;
  };
}

export class ExcelService {
  async generateQuoteExcel(data: QuoteDataForExcel): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BTS Teklif Sistemi';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Teklif');

    // Set column widths
    sheet.columns = [
      { key: 'no', width: 5 },
      { key: 'code', width: 12 },
      { key: 'brand', width: 12 },
      { key: 'description', width: 40 },
      { key: 'quantity', width: 10 },
      { key: 'unit', width: 8 },
      { key: 'listPrice', width: 12 },
      { key: 'katsayi', width: 8 },
      { key: 'unitPrice', width: 12 },
      { key: 'discountPct', width: 8 },
      { key: 'totalPrice', width: 15 },
    ];

    // Header section
    sheet.mergeCells('A1:K1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `Teklif: ${data.quoteNumber}`;
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center' };

    sheet.getCell('A3').value = 'Musteri:';
    sheet.getCell('A3').font = { bold: true };
    sheet.getCell('B3').value = data.company;

    sheet.getCell('A4').value = 'Proje:';
    sheet.getCell('A4').font = { bold: true };
    sheet.getCell('B4').value = data.project || '-';

    sheet.getCell('A5').value = 'Tarih:';
    sheet.getCell('A5').font = { bold: true };
    sheet.getCell('B5').value = data.date;

    sheet.getCell('A6').value = 'Gecerlilik:';
    sheet.getCell('A6').font = { bold: true };
    sheet.getCell('B6').value = data.validUntil || '-';

    if (data.subject) {
      sheet.getCell('A7').value = 'Konu:';
      sheet.getCell('A7').font = { bold: true };
      sheet.getCell('B7').value = data.subject;
    }

    // Table headers
    const headerRow = 9;
    const headers = ['#', 'Kod', 'Marka', 'Aciklama', 'Miktar', 'Birim', 'Liste Fiyati', 'Katsayi', 'B.Fiyat', 'Isk.%', 'Toplam'];
    headers.forEach((header, index) => {
      const cell = sheet.getCell(headerRow, index + 1);
      cell.value = header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1A1A1A' },
      };
      cell.alignment = { horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    // Items
    let currentRow = headerRow + 1;
    let itemNumber = 0;

    data.items.forEach((item) => {
      if (item.itemType === 'HEADER') {
        sheet.mergeCells(`A${currentRow}:K${currentRow}`);
        const cell = sheet.getCell(`A${currentRow}`);
        cell.value = item.description;
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF3F4F6' },
        };
      } else if (item.itemType === 'NOTE') {
        sheet.mergeCells(`A${currentRow}:K${currentRow}`);
        const cell = sheet.getCell(`A${currentRow}`);
        cell.value = item.description;
        cell.font = { italic: true };
      } else {
        itemNumber++;
        sheet.getCell(currentRow, 1).value = itemNumber;
        sheet.getCell(currentRow, 2).value = item.code || '';
        sheet.getCell(currentRow, 3).value = item.brand || '';
        sheet.getCell(currentRow, 4).value = item.description;
        sheet.getCell(currentRow, 5).value = item.quantity;
        sheet.getCell(currentRow, 6).value = item.unit || 'Adet';
        sheet.getCell(currentRow, 7).value = item.listPrice;
        sheet.getCell(currentRow, 8).value = item.katsayi;
        sheet.getCell(currentRow, 9).value = item.unitPrice;
        sheet.getCell(currentRow, 10).value = item.discountPct;
        sheet.getCell(currentRow, 11).value = item.totalPrice;

        // Format number cells
        [7, 9, 11].forEach(col => {
          const cell = sheet.getCell(currentRow, col);
          cell.numFmt = '#,##0.00';
        });
        [8, 10].forEach(col => {
          const cell = sheet.getCell(currentRow, col);
          cell.numFmt = '0.00';
        });

        // Add borders to all cells in this row
        for (let col = 1; col <= 11; col++) {
          sheet.getCell(currentRow, col).border = {
            top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
            right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          };
        }
      }
      currentRow++;
    });

    // Totals section
    currentRow += 1;
    sheet.getCell(currentRow, 10).value = 'Ara Toplam:';
    sheet.getCell(currentRow, 10).font = { bold: true };
    sheet.getCell(currentRow, 10).alignment = { horizontal: 'right' };
    sheet.getCell(currentRow, 11).value = data.totals.subtotal;
    sheet.getCell(currentRow, 11).numFmt = '#,##0.00';

    currentRow++;
    sheet.getCell(currentRow, 10).value = 'KDV:';
    sheet.getCell(currentRow, 10).font = { bold: true };
    sheet.getCell(currentRow, 10).alignment = { horizontal: 'right' };
    sheet.getCell(currentRow, 11).value = data.totals.totalVat;
    sheet.getCell(currentRow, 11).numFmt = '#,##0.00';

    currentRow++;
    sheet.getCell(currentRow, 10).value = 'Genel Toplam:';
    sheet.getCell(currentRow, 10).font = { bold: true };
    sheet.getCell(currentRow, 10).alignment = { horizontal: 'right' };
    sheet.getCell(currentRow, 11).value = data.totals.grandTotal;
    sheet.getCell(currentRow, 11).numFmt = '#,##0.00';
    sheet.getCell(currentRow, 11).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getCell(currentRow, 11).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDC2626' },
    };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}

// Singleton
let excelServiceInstance: ExcelService | null = null;

export function getExcelService(): ExcelService {
  if (!excelServiceInstance) {
    excelServiceInstance = new ExcelService();
  }
  return excelServiceInstance;
}
