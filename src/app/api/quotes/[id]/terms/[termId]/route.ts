import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { getQuoteEditDenial, quoteEditAccessInclude } from '@/lib/quote-edit-access';

interface RouteParams {
  params: Promise<{ id: string; termId: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId, termId } = await params;

    // Shared edit rule (visibility + status) — previously unguarded.
    const quote = await db.quote.findUnique({ where: { id: quoteId }, include: quoteEditAccessInclude });
    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }
    const denial = getQuoteEditDenial(user, quote);
    if (denial) {
      return NextResponse.json({ error: denial.error }, { status: denial.status });
    }

    // Verify term exists and belongs to quote
    const term = await db.quoteCommercialTerm.findFirst({
      where: { id: termId, quoteId },
    });

    if (!term) {
      return NextResponse.json({ error: 'Ticari şart bulunamadı' }, { status: 404 });
    }

    await db.quoteCommercialTerm.delete({ where: { id: termId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Commercial term DELETE error:', error);
    return NextResponse.json(
      { error: 'Ticari şart silinirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
