import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { getExcelService, QuoteDataForExcel } from '@/lib/excel/excel-service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;

    const quote = await db.quote.findUnique({
      where: { id: quoteId },
      include: {
        company: true,
        project: true,
        items: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadi' }, { status: 404 });
    }

    // Calculate totals
    const productItems = quote.items.filter(item => item.itemType === 'PRODUCT');
    const subtotal = productItems.reduce((sum, item) => sum + Number(item.totalPrice), 0);
    const totalVat = productItems.reduce((sum, item) => {
      return sum + (Number(item.totalPrice) * Number(item.vatRate) / 100);
    }, 0);
    const grandTotal = subtotal + totalVat;

    // Format date
    const formatDate = (date: Date) => date.toLocaleDateString('tr-TR');

    const excelData: QuoteDataForExcel = {
      quoteNumber: quote.quoteNumber,
      subject: quote.subject,
      date: formatDate(quote.createdAt),
      validUntil: quote.validUntil ? formatDate(quote.validUntil) : null,
      currency: quote.currency,
      company: quote.company.name,
      project: quote.project?.name || null,
      items: quote.items.map(item => ({
        itemType: item.itemType as 'PRODUCT' | 'HEADER' | 'NOTE' | 'CUSTOM',
        code: item.code,
        brand: item.brand,
        description: item.description,
        quantity: Number(item.quantity),
        unit: item.unit,
        listPrice: Number(item.listPrice),
        katsayi: Number(item.katsayi),
        unitPrice: Number(item.unitPrice),
        discountPct: Number(item.discountPct),
        totalPrice: Number(item.totalPrice),
        vatRate: Number(item.vatRate),
      })),
      totals: {
        subtotal,
        totalVat,
        grandTotal,
      },
    };

    const excelService = getExcelService();
    const buffer = await excelService.generateQuoteExcel(excelData);

    const filename = `${quote.quoteNumber}.xlsx`;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Excel export error:', error);
    return NextResponse.json(
      { error: 'Excel olusturulurken bir hata olustu' },
      { status: 500 }
    );
  }
}
