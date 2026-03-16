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
    const category = searchParams.get('category');

    const where = category ? { category } : {};

    const templates = await db.commercialTermTemplate.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        category: true,
        name: true,
        value: true,
        isDefault: true,
        sortOrder: true,
      },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Commercial terms GET error:', error);
    return NextResponse.json(
      { error: 'Ticari sartlar yuklenirken hata olustu' },
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

    if (!user.role.canManageUsers) {
      return NextResponse.json(
        { error: 'Bu islem icin yetkiniz yok' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { category, name, value, isDefault, sortOrder, highlight } = body;

    if (!category || !name || !value) {
      return NextResponse.json(
        { error: 'Kategori, ad ve deger zorunludur' },
        { status: 400 }
      );
    }

    // If this is set as default, unset other defaults in the same category
    if (isDefault) {
      await db.commercialTermTemplate.updateMany({
        where: { category, isDefault: true },
        data: { isDefault: false },
      });
    }

    const template = await db.commercialTermTemplate.create({
      data: {
        category,
        name,
        value,
        isDefault: isDefault || false,
        sortOrder: sortOrder ?? 0,
        highlight: highlight || false,
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error('Commercial terms POST error:', error);
    return NextResponse.json(
      { error: 'Ticari sart olusturulurken hata olustu' },
      { status: 500 }
    );
  }
}
