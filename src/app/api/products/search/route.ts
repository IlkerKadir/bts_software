import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { buildTokenizedSearchAND } from '@/lib/search-helpers';

// Fields a product search term may match against (dotted paths cross relations).
const PRODUCT_SEARCH_FIELDS = [
  'code',
  'shortCode',
  'name',
  'nameTr',
  'model',
  'brand.name',
];

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const brandId = searchParams.get('brandId') || '';
    const categoryId = searchParams.get('categoryId') || '';
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    // Need at least a search term or a filter
    if (query.length < 2 && !brandId && !categoryId) {
      return NextResponse.json({ products: [] });
    }

    const where: any = { isActive: true };

    if (query.length >= 2) {
      // Multi-word search: every whitespace-separated token must match (AND),
      // each token matching any field (OR), Turkish-i variants expanded per token.
      // So "DTS 2" matches "DTS 2KM 2 Kanal" and "smart 10" matches "...10 modül".
      const tokenClauses = buildTokenizedSearchAND(query, PRODUCT_SEARCH_FIELDS);
      if (tokenClauses.length > 0) {
        where.AND = tokenClauses;
      }
    }
    if (brandId) where.brandId = brandId;
    if (categoryId) where.categoryId = categoryId;

    const products = await db.product.findMany({
      where,
      include: {
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
      take: limit,
      orderBy: [
        { code: 'asc' },
      ],
    });

    // If user can't view costs, hide costPrice
    const sanitizedProducts = products.map(product => ({
      ...product,
      listPrice: Number(product.listPrice),
      costPrice: user.role.canViewCosts ? (product.costPrice ? Number(product.costPrice) : null) : null,
      minKatsayi: product.minKatsayi != null ? Number(product.minKatsayi) : null,
      maxKatsayi: product.maxKatsayi != null ? Number(product.maxKatsayi) : null,
    }));

    return NextResponse.json({ products: sanitizedProducts });
  } catch (error) {
    console.error('Product search error:', error);
    return NextResponse.json(
      { error: 'Ürün araması yapılırken bir hata oluştu' },
      { status: 500 }
    );
  }
}
