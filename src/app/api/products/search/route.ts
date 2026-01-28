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
    const query = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (query.length < 2) {
      return NextResponse.json({ products: [] });
    }

    const products = await db.product.findMany({
      where: {
        isActive: true,
        OR: [
          { code: { contains: query, mode: 'insensitive' } },
          { shortCode: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
          { nameTr: { contains: query, mode: 'insensitive' } },
          { model: { contains: query, mode: 'insensitive' } },
          { brand: { name: { contains: query, mode: 'insensitive' } } },
        ],
      },
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
