import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

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
    await recalculateQuoteTotals(quoteId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Quote item DELETE error:', error);
    return NextResponse.json(
      { error: 'Kalem silinirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

async function recalculateQuoteTotals(quoteId: string) {
  const items = await db.quoteItem.findMany({
    where: { quoteId, itemType: 'PRODUCT' },
  });

  const quote = await db.quote.findUnique({ where: { id: quoteId } });
  if (!quote) return;

  let subtotal = 0;
  let vatTotal = 0;

  for (const item of items) {
    const itemSubtotal = Number(item.unitPrice) * Number(item.quantity);
    const itemDiscount = itemSubtotal * (Number(item.discountPct) / 100);
    const itemAfterDiscount = itemSubtotal - itemDiscount;
    const itemVat = itemAfterDiscount * (Number(item.vatRate) / 100);

    subtotal += itemAfterDiscount;
    vatTotal += itemVat;
  }

  const discountTotal = subtotal * (Number(quote.discountPct) / 100);
  const afterQuoteDiscount = subtotal - discountTotal;
  const adjustedVatTotal = vatTotal * (1 - Number(quote.discountPct) / 100);
  const grandTotal = afterQuoteDiscount + adjustedVatTotal;

  await db.quote.update({
    where: { id: quoteId },
    data: {
      subtotal,
      discountTotal,
      vatTotal: adjustedVatTotal,
      grandTotal,
    },
  });
}
