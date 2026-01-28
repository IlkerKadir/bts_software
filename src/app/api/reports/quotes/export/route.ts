import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { reportQuerySchema } from '@/lib/validations/report';
import { Prisma, QuoteStatus } from '@prisma/client';
import ExcelJS from 'exceljs';

const STATUS_LABELS: Record<QuoteStatus, string> = {
  TASLAK: 'Taslak',
  ONAY_BEKLIYOR: 'Onay Bekliyor',
  ONAYLANDI: 'Onaylandı',
  GONDERILDI: 'Gönderildi',
  TAKIPTE: 'Takipte',
  REVIZYON: 'Revizyon',
  KAZANILDI: 'Kazanıldı',
  KAYBEDILDI: 'Kaybedildi',
  IPTAL: 'İptal',
};

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check export permission
    if (!user.role.canExport) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz bulunmamaktadır' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const query = reportQuerySchema.parse({
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      status: searchParams.get('status') || undefined,
      companyId: searchParams.get('companyId') || undefined,
      createdById: searchParams.get('createdById') || undefined,
      currency: searchParams.get('currency') || undefined,
    });

    // Build where clause
    const where: Prisma.QuoteWhereInput = {};

    if (query.startDate) {
      where.createdAt = {
        ...((where.createdAt as Prisma.DateTimeFilter) || {}),
        gte: new Date(query.startDate),
      };
    }

    if (query.endDate) {
      const endDate = new Date(query.endDate);
      endDate.setHours(23, 59, 59, 999);
      where.createdAt = {
        ...((where.createdAt as Prisma.DateTimeFilter) || {}),
        lte: endDate,
      };
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.companyId) {
      where.companyId = query.companyId;
    }

    if (query.createdById) {
      where.createdById = query.createdById;
    }

    if (query.currency) {
      where.currency = query.currency;
    }

    // Get quotes with relations
    const quotes = await db.quote.findMany({
      where,
      include: {
        company: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BTS Teklif Sistemi';
    workbook.created = new Date();

    // Summary sheet
    const summarySheet = workbook.addWorksheet('Özet');
    summarySheet.columns = [
      { key: 'label', width: 25 },
      { key: 'value', width: 20 },
    ];

    // Title
    summarySheet.mergeCells('A1:B1');
    const titleCell = summarySheet.getCell('A1');
    titleCell.value = 'Teklif Raporu';
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center' };

    // Date range
    summarySheet.getCell('A3').value = 'Rapor Dönemi:';
    summarySheet.getCell('A3').font = { bold: true };
    summarySheet.getCell('B3').value = `${query.startDate || 'Başlangıç'} - ${query.endDate || 'Bugün'}`;

    // Summary stats
    const totalValue = quotes.reduce((sum, q) => sum + Number(q.grandTotal), 0);
    const avgValue = quotes.length > 0 ? totalValue / quotes.length : 0;

    const statusCounts: Record<QuoteStatus, { count: number; value: number }> = {
      TASLAK: { count: 0, value: 0 },
      ONAY_BEKLIYOR: { count: 0, value: 0 },
      ONAYLANDI: { count: 0, value: 0 },
      GONDERILDI: { count: 0, value: 0 },
      TAKIPTE: { count: 0, value: 0 },
      REVIZYON: { count: 0, value: 0 },
      KAZANILDI: { count: 0, value: 0 },
      KAYBEDILDI: { count: 0, value: 0 },
      IPTAL: { count: 0, value: 0 },
    };

    for (const quote of quotes) {
      statusCounts[quote.status].count++;
      statusCounts[quote.status].value += Number(quote.grandTotal);
    }

    const wonCount = statusCounts.KAZANILDI.count;
    const lostCount = statusCounts.KAYBEDILDI.count;
    const winRate = wonCount + lostCount > 0 ? (wonCount / (wonCount + lostCount)) * 100 : 0;

    let currentRow = 5;
    const summaryData = [
      { label: 'Toplam Teklif Sayısı', value: quotes.length },
      { label: 'Toplam Değer', value: totalValue },
      { label: 'Ortalama Değer', value: avgValue },
      { label: 'Kazanım Oranı', value: `%${winRate.toFixed(1)}` },
      { label: 'Kazanılan Değer', value: statusCounts.KAZANILDI.value },
      { label: 'Kaybedilen Değer', value: statusCounts.KAYBEDILDI.value },
    ];

    summaryData.forEach((item) => {
      summarySheet.getCell(`A${currentRow}`).value = item.label;
      summarySheet.getCell(`A${currentRow}`).font = { bold: true };
      const valueCell = summarySheet.getCell(`B${currentRow}`);
      valueCell.value = item.value;
      if (typeof item.value === 'number') {
        valueCell.numFmt = '#,##0.00';
      }
      currentRow++;
    });

    // Status breakdown
    currentRow += 2;
    summarySheet.getCell(`A${currentRow}`).value = 'Durum Dağılımı';
    summarySheet.getCell(`A${currentRow}`).font = { bold: true, size: 12 };
    currentRow++;

    Object.entries(statusCounts)
      .filter(([_, data]) => data.count > 0)
      .forEach(([status, data]) => {
        summarySheet.getCell(`A${currentRow}`).value = STATUS_LABELS[status as QuoteStatus];
        summarySheet.getCell(`B${currentRow}`).value = `${data.count} adet - ${data.value.toLocaleString('tr-TR')} €`;
        currentRow++;
      });

    // Quotes detail sheet
    const detailSheet = workbook.addWorksheet('Teklifler');
    detailSheet.columns = [
      { key: 'quoteNumber', header: 'Teklif No', width: 15 },
      { key: 'company', header: 'Firma', width: 25 },
      { key: 'project', header: 'Proje', width: 20 },
      { key: 'createdBy', header: 'Hazırlayan', width: 15 },
      { key: 'currency', header: 'Para Birimi', width: 12 },
      { key: 'grandTotal', header: 'Toplam', width: 15 },
      { key: 'status', header: 'Durum', width: 15 },
      { key: 'createdAt', header: 'Tarih', width: 12 },
    ];

    // Header styling
    const headerRow = detailSheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1A1A1A' },
    };
    headerRow.alignment = { horizontal: 'center' };

    // Add data
    quotes.forEach((quote) => {
      const row = detailSheet.addRow({
        quoteNumber: quote.quoteNumber,
        company: quote.company.name,
        project: quote.project?.name || '-',
        createdBy: quote.createdBy.fullName,
        currency: quote.currency,
        grandTotal: Number(quote.grandTotal),
        status: STATUS_LABELS[quote.status],
        createdAt: new Date(quote.createdAt).toLocaleDateString('tr-TR'),
      });

      // Format total cell
      const totalCell = row.getCell('grandTotal');
      totalCell.numFmt = '#,##0.00';
    });

    // Auto filter
    detailSheet.autoFilter = {
      from: 'A1',
      to: `H${quotes.length + 1}`,
    };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Return as downloadable file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="teklif-raporu-${query.startDate || 'all'}-${query.endDate || 'all'}.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Report export error:', error);
    return NextResponse.json(
      { error: 'Rapor dışa aktarılırken bir hata oluştu' },
      { status: 500 }
    );
  }
}
