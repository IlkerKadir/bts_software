import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const productIdsParam = searchParams.get('productIds');

    if (!companyId) {
      return NextResponse.json(
        { error: 'companyId parametresi gerekli' },
        { status: 400 }
      );
    }

    const productIds = productIdsParam ? productIdsParam.split(',').filter(Boolean) : [];

    // Build where clause
    const where: any = { companyId };
    if (productIds.length > 0) {
      where.productId = { in: productIds };
    }

    // Get the most recent price for each product-company pair
    const priceHistories = await db.priceHistory.findMany({
      where,
      orderBy: { quotedAt: 'desc' },
      include: {
        product: { select: { code: true, name: true } },
      },
    });

    // Group by productId, take only the most recent
    const latestPrices: Record<string, any> = {};
    for (const ph of priceHistories) {
      if (!latestPrices[ph.productId]) {
        latestPrices[ph.productId] = {
          productId: ph.productId,
          productCode: ph.product.code,
          productName: ph.product.name,
          unitPrice: ph.unitPrice,
          katsayi: ph.katsayi,
          quantity: ph.quantity,
          currency: ph.currency,
          quotedAt: ph.quotedAt,
          quoteId: ph.quoteId,
        };
      }
    }

    return NextResponse.json({ priceHistory: latestPrices });
  } catch (error) {
    console.error('Price history GET error:', error);
    return NextResponse.json(
      { error: 'Fiyat gecmisi alinirken bir hata olustu' },
      { status: 500 }
    );
  }
}
