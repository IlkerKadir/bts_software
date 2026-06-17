import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { quoteTrackingSchema } from '@/lib/validations/quote-tracking';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Update the overwrite-on-save Teklif Takip fields (priority, success %,
 * expected order date, lost reason + competitor). The interaction log is
 * handled separately by ./interactions.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const data = quoteTrackingSchema.parse(body);

    const existing = await db.quote.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }

    const quote = await db.quote.update({
      where: { id },
      data: {
        priority: data.priority,
        successPct: data.successPct,
        expectedOrderDate: data.expectedOrderDate ? new Date(data.expectedOrderDate) : null,
        lostReason: data.lostReason,
        lostCompetitor: data.lostCompetitor,
      },
      select: {
        id: true,
        priority: true,
        successPct: true,
        expectedOrderDate: true,
        lostReason: true,
        lostCompetitor: true,
      },
    });

    return NextResponse.json({ quote });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Geçersiz veri', details: error }, { status: 400 });
    }
    console.error('Quote tracking PUT error:', error);
    return NextResponse.json({ error: 'Takip bilgileri kaydedilirken bir hata oluştu' }, { status: 500 });
  }
}
