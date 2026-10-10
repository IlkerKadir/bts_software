import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ?activeOnly=1 (quote catalog only, client 10.2026): brands that have
    // at least one ACTIVE product, alphabetical with Turkish rules (sorted
    // in JS — the alpine Postgres has no Turkish collation). Without the
    // flag the response is unchanged (product database screens).
    const activeOnly = request.nextUrl.searchParams.get('activeOnly') === '1';

    const brands = await db.productBrand.findMany({
      where: activeOnly ? { products: { some: { isActive: true } } } : undefined,
      orderBy: { sortOrder: 'asc' },
      include: {
        brandDiscount: { select: { coefficient: true } },
      },
    });
    if (activeOnly) {
      brands.sort((a, b) => a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' }));
    }

    return NextResponse.json({ brands });
  } catch (error) {
    console.error('Brands GET error:', error);
    return NextResponse.json(
      { error: 'Markalar alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}
