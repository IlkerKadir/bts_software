import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { Prisma, QuoteStatus } from '@prisma/client';
import { quoteStatusLabels } from '@/lib/validations/quote';
import { LOST_REASON_LABELS, INTERACTION_TYPE_LABELS } from '@/lib/validations/quote-tracking';
import { buildTokenizedSearchAND } from '@/lib/search-helpers';
import ExcelJS from 'exceljs';

/**
 * Excel export of the Teklifler list — MANAGEMENT ONLY (client: "bu ekranda
 * sadece yönetimde excel dışa aktarma seçeneği olsun"). Mirrors the list
 * filters and includes the Teklif Takip columns.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.role.canManageUsers) {
      return NextResponse.json({ error: 'Bu işlem için yetkiniz bulunmamaktadır' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';
    const companyId = searchParams.get('companyId') || '';
    const createdById = searchParams.get('createdById') || '';
    const dateFrom = searchParams.get('dateFrom') || '';
    const dateTo = searchParams.get('dateTo') || '';

    // Non-managers reach this only if gated above; but keep the visibility
    // floor consistent with the list for safety.
    const where: Prisma.QuoteWhereInput = {};
    if (search) {
      // Same fields as the Teklifler list (includes project.name).
      where.AND = buildTokenizedSearchAND(search, [
        'quoteNumber',
        'subject',
        'company.name',
        'project.name',
      ]);
    }
    if (status) {
      const statuses = status.split(',').map((s) => s.trim()).filter(Boolean) as QuoteStatus[];
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }
    if (companyId) where.companyId = companyId;
    if (createdById) where.createdById = createdById;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      // Match the list API's UTC day boundaries so export == on-screen set.
      if (dateFrom) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(dateFrom);
      if (dateTo) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(`${dateTo}T23:59:59.999Z`);
    }

    // NOTE: unlike the on-screen list (which collapses revision chains into
    // one row), this management export intentionally lists EVERY version so
    // the full revision history is auditable in the spreadsheet.
    const quotes = await db.quote.findMany({
      where,
      include: {
        company: { select: { name: true } },
        project: { select: { name: true } },
        createdBy: { select: { fullName: true } },
        // İletişim Geçmişi (client 30.06: the logged contacts must land in
        // the Excel). Oldest-first so the cell reads chronologically.
        interactions: {
          orderBy: { interactionDate: 'asc' },
          select: {
            interactionDate: true,
            type: true,
            note: true,
            user: { select: { fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'BTS Teklif Sistemi';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Teklifler');
    sheet.columns = [
      { key: 'quoteNumber', header: 'Teklif No', width: 15 },
      { key: 'company', header: 'Firma', width: 28 },
      { key: 'project', header: 'Proje', width: 22 },
      { key: 'subject', header: 'Teklif Adı', width: 22 },
      { key: 'grandTotal', header: 'Tutar', width: 14 },
      { key: 'currency', header: 'Para Birimi', width: 11 },
      { key: 'status', header: 'Durum', width: 16 },
      { key: 'priority', header: 'Önem', width: 8 },
      { key: 'successPct', header: 'Başarı %', width: 10 },
      { key: 'expectedOrderDate', header: 'Beklenen Sipariş', width: 16 },
      { key: 'lostReason', header: 'Kaybetme Nedeni', width: 22 },
      { key: 'lostCompetitor', header: 'Tercih Edilen Rakip', width: 20 },
      { key: 'lastContact', header: 'Son İletişim', width: 13 },
      { key: 'contactHistory', header: 'İletişim Geçmişi', width: 50 },
      { key: 'createdBy', header: 'Hazırlayan', width: 16 },
      { key: 'createdAt', header: 'Tarih', width: 12 },
      { key: 'year', header: 'Yıl', width: 8 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } };
    headerRow.alignment = { horizontal: 'center' };

    for (const q of quotes) {
      const created = new Date(q.createdAt);
      const row = sheet.addRow({
        quoteNumber: q.quoteNumber,
        company: q.company.name,
        project: q.project?.name || '-',
        subject: q.subject || '-',
        grandTotal: Number(q.grandTotal),
        currency: q.currency,
        status: quoteStatusLabels[q.status] || q.status,
        priority: q.priority || '-',
        successPct: q.successPct ?? '',
        expectedOrderDate: q.expectedOrderDate
          ? new Date(q.expectedOrderDate).toLocaleDateString('tr-TR')
          : '-',
        lostReason: q.lostReason ? LOST_REASON_LABELS[q.lostReason] : '-',
        lostCompetitor: q.lostCompetitor || '-',
        lastContact: q.interactions.length
          ? new Date(
              q.interactions[q.interactions.length - 1].interactionDate
            ).toLocaleDateString('tr-TR')
          : '-',
        contactHistory: q.interactions.length
          ? q.interactions
              .map(
                (i) =>
                  `${new Date(i.interactionDate).toLocaleDateString('tr-TR')} [${
                    INTERACTION_TYPE_LABELS[i.type] || i.type
                  }] ${i.note} (${i.user.fullName})`
              )
              .join('\n')
          : '-',
        createdBy: q.createdBy.fullName,
        createdAt: created.toLocaleDateString('tr-TR'),
        year: created.getFullYear(),
      });
      row.getCell('grandTotal').numFmt = '#,##0.00';
      row.getCell('contactHistory').alignment = { wrapText: true, vertical: 'top' };
    }

    sheet.autoFilter = { from: 'A1', to: `Q${quotes.length + 1}` };

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="teklifler.xlsx"`,
      },
    });
  } catch (error) {
    console.error('Quotes export error:', error);
    return NextResponse.json({ error: 'Teklifler dışa aktarılırken bir hata oluştu' }, { status: 500 });
  }
}
