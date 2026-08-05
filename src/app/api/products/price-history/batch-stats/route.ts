import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { computePriceHistoryStats } from '@/lib/price-history-stats';

// GET - Fetch aggregated price history stats for multiple products for a given company
// Returns: lastQuoted, lastOrdered, highest, lowest per product
export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Price history shows historical unitPrice/katsayi — not cost data, visible to all users

    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const productIdsParam = searchParams.get('productIds');

    if (!companyId) {
      return NextResponse.json(
        { error: 'companyId parametresi gerekli' },
        { status: 400 }
      );
    }

    const productIds = productIdsParam
      ? productIdsParam.split(',').filter(Boolean)
      : [];

    if (productIds.length === 0) {
      return NextResponse.json({ stats: {} });
    }

    const stats = await computePriceHistoryStats(companyId, productIds);

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('Batch price history stats GET error:', error);
    return NextResponse.json(
      { error: 'Fiyat geçmişi istatistikleri alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}
