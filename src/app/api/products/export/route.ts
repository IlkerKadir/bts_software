import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import ExcelJS from 'exceljs';

export async function GET() {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.role.canEditProducts) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz bulunmuyor' },
        { status: 403 }
      );
    }

    const canViewCosts = user.role.canViewCosts;

    const products = await db.product.findMany({
      include: {
        brand: { select: { name: true } },
        category: { select: { name: true } },
      },
      orderBy: { code: 'asc' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BTS Teklif Sistemi';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Urunler');

    // Define columns
    const columns: Partial<ExcelJS.Column>[] = [
      { header: 'Kod', key: 'code', width: 18 },
      { header: 'Kisa Kod', key: 'shortCode', width: 14 },
      { header: 'Marka', key: 'brand', width: 16 },
      { header: 'Kategori', key: 'category', width: 16 },
      { header: 'Model', key: 'model', width: 20 },
      { header: 'Isim TR', key: 'nameTr', width: 30 },
      { header: 'Isim EN', key: 'nameEn', width: 30 },
      { header: 'Birim', key: 'unit', width: 10 },
      { header: 'Liste Fiyati', key: 'listPrice', width: 15 },
    ];

    if (canViewCosts) {
      columns.push({ header: 'Maliyet Fiyati', key: 'costPrice', width: 15 });
    }

    columns.push(
      { header: 'Para Birimi', key: 'currency', width: 12 },
      { header: 'Tedarikci', key: 'supplier', width: 20 },
      { header: 'Aktif', key: 'isActive', width: 8 },
    );

    sheet.columns = columns;

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, size: 10 };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8E8E8' },
    };
    headerRow.height = 22;

    // Add data rows
    for (const product of products) {
      const rowData: Record<string, unknown> = {
        code: product.code,
        shortCode: product.shortCode || '',
        brand: product.brand?.name || '',
        category: product.category?.name || '',
        model: product.model || '',
        nameTr: product.nameTr || product.name,
        nameEn: product.nameEn || '',
        unit: product.unit,
        listPrice: Number(product.listPrice),
        currency: product.currency,
        supplier: product.supplier || '',
        isActive: product.isActive ? 'Evet' : 'Hayir',
      };

      if (canViewCosts) {
        rowData.costPrice = product.costPrice ? Number(product.costPrice) : '';
      }

      sheet.addRow(rowData);
    }

    // Format price columns as numbers with 2 decimal places
    const listPriceCol = sheet.getColumn('listPrice');
    listPriceCol.numFmt = '#,##0.00';

    if (canViewCosts) {
      const costPriceCol = sheet.getColumn('costPrice');
      costPriceCol.numFmt = '#,##0.00';
    }

    // Auto-filter on header row
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    const today = new Date().toISOString().slice(0, 10);
    const filename = `BTS_Urunler_${today}.xlsx`;

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Products export error:', error);
    return NextResponse.json(
      { error: 'Urunler disari aktarilirken bir hata olustu' },
      { status: 500 }
    );
  }
}
