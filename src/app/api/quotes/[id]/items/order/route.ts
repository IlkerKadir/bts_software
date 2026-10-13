import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { getQuoteEditDenial, quoteEditAccessInclude } from '@/lib/quote-edit-access';
import { recalculateAndPersistQuoteTotals } from '@/lib/quote-calculations';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const orderSchema = z.object({
  order: z
    .array(z.object({ id: z.string().min(1), sortOrder: z.number().int().min(0).max(1_000_000) }))
    .min(1)
    .max(5000),
});

/**
 * Row order only (client 13.10). The editor persists drag-reorder, copy and
 * "Üstüne Ekle" numbering here. Unlike the bulk PUT it writes nothing but
 * `sortOrder` — no prices (the PUT path dropped ek maliyet), no unsaved
 * edits, no history entry. Ids not in this quote (e.g. deleted in another
 * session) are skipped.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: quoteId } = await params;
    const parsed = orderSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Geçersiz sıralama verisi' }, { status: 400 });
    }

    // Same edit rule as the bulk save (visibility + status).
    const quote = await db.quote.findUnique({ where: { id: quoteId }, include: quoteEditAccessInclude });
    if (!quote) {
      return NextResponse.json({ error: 'Teklif bulunamadı' }, { status: 404 });
    }
    const denial = getQuoteEditDenial(user, quote);
    if (denial) {
      return NextResponse.json({ error: denial.error }, { status: denial.status });
    }

    const results = await db.$transaction(
      parsed.data.order.map((o) =>
        db.quoteItem.updateMany({ where: { id: o.id, quoteId }, data: { sortOrder: o.sortOrder } })
      )
    );
    const updated = results.reduce((sum, r) => sum + r.count, 0);

    // Section subtotals and their discounts are positional, so the order can
    // change the totals (the bulk PUT recalculated here as well).
    await recalculateAndPersistQuoteTotals(quoteId);

    return NextResponse.json({ updated });
  } catch (error) {
    console.error('Quote items order PATCH error:', error);
    return NextResponse.json({ error: 'Sıralama kaydedilirken bir hata oluştu' }, { status: 500 });
  }
}
