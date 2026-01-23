import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { productSchema, productQuerySchema } from '@/lib/validations/product';
import { getSession } from '@/lib/session';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const query = productQuerySchema.parse({
      search: searchParams.get('search') || undefined,
      brandId: searchParams.get('brandId') || undefined,
      categoryId: searchParams.get('categoryId') || undefined,
      currency: searchParams.get('currency') || undefined,
      isActive: searchParams.get('isActive') || undefined,
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
    });

    const where: Prisma.ProductWhereInput = {};

    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { shortCode: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
        { nameTr: { contains: query.search, mode: 'insensitive' } },
        { model: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.brandId) {
      where.brandId = query.brandId;
    }

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.currency) {
      where.currency = query.currency;
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const [products, total] = await Promise.all([
      db.product.findMany({
        where,
        include: {
          brand: { select: { id: true, name: true } },
          category: { select: { id: true, name: true } },
        },
        orderBy: { code: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      db.product.count({ where }),
    ]);

    // Hide cost price if user doesn't have permission
    const productsFiltered = products.map(p => ({
      ...p,
      costPrice: user.role.canViewCosts ? p.costPrice : null,
    }));

    return NextResponse.json({
      products: productsFiltered,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  } catch (error) {
    console.error('Products GET error:', error);
    return NextResponse.json(
      { error: 'Ürünler alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    if (!user.role.canEditProducts) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz bulunmuyor' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validatedData = productSchema.parse(body);

    // Check if code already exists
    const existingProduct = await db.product.findUnique({
      where: { code: validatedData.code },
    });

    if (existingProduct) {
      return NextResponse.json(
        { error: 'Bu ürün kodu zaten kullanımda' },
        { status: 400 }
      );
    }

    const product = await db.product.create({
      data: validatedData,
      include: {
        brand: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Geçersiz veri', details: error },
        { status: 400 }
      );
    }
    console.error('Products POST error:', error);
    return NextResponse.json(
      { error: 'Ürün oluşturulurken bir hata oluştu' },
      { status: 500 }
    );
  }
}
