import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const brandDiscount = await db.brandDiscount.findUnique({
      where: { brandId: id },
    });

    return NextResponse.json({
      brandId: id,
      coefficient: brandDiscount?.coefficient ?? 1,
    });
  } catch (error) {
    console.error('Brand discount GET error:', error);
    return NextResponse.json(
      { error: 'Marka katsayısı alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.role.canEditProducts) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz yok' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { coefficient } = body;

    if (typeof coefficient !== 'number' || coefficient <= 0) {
      return NextResponse.json(
        { error: 'Geçersiz katsayı değeri' },
        { status: 400 }
      );
    }

    // Verify brand exists
    const brand = await db.productBrand.findUnique({ where: { id } });
    if (!brand) {
      return NextResponse.json(
        { error: 'Marka bulunamadı' },
        { status: 404 }
      );
    }

    const brandDiscount = await db.brandDiscount.upsert({
      where: { brandId: id },
      update: {
        coefficient,
        updatedById: user.id,
      },
      create: {
        brandId: id,
        coefficient,
        updatedById: user.id,
      },
    });

    return NextResponse.json({ brandDiscount });
  } catch (error) {
    console.error('Brand discount PUT error:', error);
    return NextResponse.json(
      { error: 'Marka katsayısı güncellenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
