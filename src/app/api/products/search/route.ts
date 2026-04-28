import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { expandTurkishVariants } from '@/lib/search-helpers';

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
      const searchVariants = expandTurkishVariants(query);
      if (searchVariants.length > 0) {
        where.OR = searchVariants.flatMap((v) => [
          { code: { contains: v, mode: 'insensitive' as const } },
          { shortCode: { contains: v, mode: 'insensitive' as const } },
          { name: { contains: v, mode: 'insensitive' as const } },
          { nameTr: { contains: v, mode: 'insensitive' as const } },
          { model: { contains: v, mode: 'insensitive' as const } },
          { brand: { name: { contains: v, mode: 'insensitive' as const } } },
        ]);
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
