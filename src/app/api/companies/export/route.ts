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

    const companies = await db.company.findMany({
      orderBy: { name: 'asc' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BTS Teklif Sistemi';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Firmalar');

    // Define columns
    const columns: Partial<ExcelJS.Column>[] = [
      { header: 'Firma Adi', key: 'name', width: 35 },
      { header: 'Tip', key: 'type', width: 14 },
      { header: 'Adres', key: 'address', width: 40 },
      { header: 'Vergi No', key: 'taxNumber', width: 16 },
      { header: 'Telefon', key: 'phone', width: 18 },
      { header: 'E-posta', key: 'email', width: 25 },
      { header: 'Aktif', key: 'isActive', width: 8 },
    ];

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
    for (const company of companies) {
      const typeLabel = company.type === 'CLIENT' ? 'MUSTERI' : 'IS ORTAGI';

      sheet.addRow({
        name: company.name,
        type: typeLabel,
        address: company.address || '',
        taxNumber: company.taxNumber || '',
        phone: company.phone || '',
        email: company.email || '',
        isActive: company.isActive ? 'Evet' : 'Hayir',
      });
    }

    // Auto-filter on header row
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    const today = new Date().toISOString().slice(0, 10);
    const filename = `BTS_Firmalar_${today}.xlsx`;

    return new NextResponse(Buffer.from(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Companies export error:', error);
    return NextResponse.json(
      { error: 'Firmalar disari aktarilirken bir hata olustu' },
      { status: 500 }
    );
  }
}
