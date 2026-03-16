import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
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

    const { id } = await params;
    const body = await request.json();
    const { category, name, value, isDefault, sortOrder, highlight } = body;

    const existing = await db.commercialTermTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Ticari sart bulunamadi' },
        { status: 404 }
      );
    }

    // If this is set as default, unset other defaults in the same category
    const targetCategory = category || existing.category;
    if (isDefault) {
      await db.commercialTermTemplate.updateMany({
        where: { category: targetCategory, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updateData: Record<string, unknown> = {};
    if (category !== undefined) updateData.category = category;
    if (name !== undefined) updateData.name = name;
    if (value !== undefined) updateData.value = value;
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (highlight !== undefined) updateData.highlight = highlight;

    const template = await db.commercialTermTemplate.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ template });
  } catch (error) {
    console.error('Commercial terms PUT error:', error);
    return NextResponse.json(
      { error: 'Ticari sart guncellenirken hata olustu' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    const { id } = await params;

    const existing = await db.commercialTermTemplate.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Ticari sart bulunamadi' },
        { status: 404 }
      );
    }

    await db.commercialTermTemplate.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Commercial terms DELETE error:', error);
    return NextResponse.json(
      { error: 'Ticari sart silinirken hata olustu' },
      { status: 500 }
    );
  }
}
