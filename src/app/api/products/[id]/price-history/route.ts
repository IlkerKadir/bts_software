import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Fetch price history for a product
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: productId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const companyId = searchParams.get('companyId');

    // Get recent quote items for this product
    const quoteItems = await db.quoteItem.findMany({
      where: {
        productId,
        ...(companyId ? { quote: { companyId } } : {}),
      },
      include: {
        quote: {
          select: {
            id: true,
            quoteNumber: true,
            currency: true,
            status: true,
            createdAt: true,
            company: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Format the history
    const history = quoteItems.map(item => ({
      id: item.id,
      quoteId: item.quote.id,
      quoteNumber: item.quote.quoteNumber,
      company: item.quote.company.name,
      currency: item.quote.currency,
      status: item.quote.status,
      date: item.createdAt,
      listPrice: Number(item.listPrice),
      katsayi: Number(item.katsayi),
      unitPrice: Number(item.unitPrice),
      quantity: Number(item.quantity),
      discountPct: Number(item.discountPct),
    }));

    // Get statistics
    const prices = history.map(h => h.unitPrice);
    const stats = prices.length > 0 ? {
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: prices.reduce((a, b) => a + b, 0) / prices.length,
      count: prices.length,
    } : null;

    return NextResponse.json({ history, stats });
  } catch (error) {
    console.error('Price history GET error:', error);
    return NextResponse.json(
      { error: 'Fiyat geçmişi alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}
