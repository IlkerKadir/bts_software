import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { recalculateAndPersistQuoteTotals } from '@/lib/quote-calculations';

interface RouteParams {
  params: Promise<{ id: string; itemId: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId, itemId } = await params;

    // Verify item exists and belongs to quote
    const item = await db.quoteItem.findFirst({
      where: { id: itemId, quoteId },
    });

    if (!item) {
      return NextResponse.json({ error: 'Kalem bulunamadı' }, { status: 404 });
    }

    await db.quoteItem.delete({ where: { id: itemId } });

    // Recalculate quote totals
    await recalculateAndPersistQuoteTotals(quoteId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Quote item DELETE error:', error);
    return NextResponse.json(
      { error: 'Kalem silinirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
