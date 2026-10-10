import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ?activeOnly=1 (quote catalog only, client 10.2026): categories with at
    // least one ACTIVE product, alphabetical (Turkish rules, sorted in JS).
    const activeOnly = request.nextUrl.searchParams.get('activeOnly') === '1';

    const categories = await db.productCategory.findMany({
      where: activeOnly ? { products: { some: { isActive: true } } } : undefined,
      orderBy: { sortOrder: 'asc' },
    });
    if (activeOnly) {
      categories.sort((a, b) => a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' }));
    }

    return NextResponse.json({ categories });
  } catch (error) {
    console.error('Categories GET error:', error);
    return NextResponse.json(
      { error: 'Kategoriler alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}
