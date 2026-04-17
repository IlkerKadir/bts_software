import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { priceLabelUpdateSchema } from '@/lib/validations/price-label';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.role.canManageSettings && !user.role.canManageUsers) {
      return NextResponse.json({ error: 'Bu işlem için yetkiniz yok' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = priceLabelUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Geçersiz veri' },
        { status: 400 }
      );
    }

    const existing = await db.priceLabelOption.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Etiket bulunamadı' }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.label !== undefined) {
      data.label = parsed.data.label.trim();
    }
    if (parsed.data.sortOrder !== undefined) data.sortOrder = parsed.data.sortOrder;
    if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;

    const option = await db.priceLabelOption.update({ where: { id }, data });
    return NextResponse.json({ option });
  } catch (error) {
    console.error('PriceLabel PUT error:', error);
    return NextResponse.json(
      { error: 'Fiyat etiketi güncellenirken hata oluştu' },
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
    if (!user.role.canManageSettings && !user.role.canManageUsers) {
      return NextResponse.json({ error: 'Bu işlem için yetkiniz yok' }, { status: 403 });
    }

    const { id } = await params;
    const existing = await db.priceLabelOption.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Etiket bulunamadı' }, { status: 404 });
    }

    // Historical quotes stored the literal text in QuoteItem.priceLabel
    // (no FK), so deletion here is safe and does not affect rendering of
    // old quotes. New quotes simply no longer see the option in the menu.
    await db.priceLabelOption.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PriceLabel DELETE error:', error);
    return NextResponse.json(
      { error: 'Fiyat etiketi silinirken hata oluştu' },
      { status: 500 }
    );
  }
}
