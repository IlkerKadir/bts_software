import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { priceLabelCreateSchema } from '@/lib/validations/price-label';

/**
 * GET — list all price label options. Any authenticated user can read
 * this (the quote editor needs the list to render the context menu).
 * Returns both active and inactive rows; the editor is expected to
 * filter to `isActive` itself so admins can still see them here.
 */
export async function GET() {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const options = await db.priceLabelOption.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
    return NextResponse.json({ options });
  } catch (error) {
    console.error('PriceLabel GET error:', error);
    return NextResponse.json(
      { error: 'Fiyat etiketleri yüklenirken hata oluştu' },
      { status: 500 }
    );
  }
}

/**
 * POST — create a new price label option. Gated on canManageSettings
 * (with legacy canManageUsers accepted during the transition).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.role.canManageSettings && !user.role.canManageUsers) {
      return NextResponse.json({ error: 'Bu işlem için yetkiniz yok' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = priceLabelCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Geçersiz veri' },
        { status: 400 }
      );
    }

    // Upper-casing the label to keep the existing visual convention of
    // "TARAFINIZCA SAĞLANACAKTIR" / "FİYATA DAHİLDİR" as uppercase.
    const label = parsed.data.label.trim().toLocaleUpperCase('tr-TR');

    const existing = await db.priceLabelOption.findUnique({ where: { label } });
    if (existing) {
      return NextResponse.json(
        { error: 'Bu etiket zaten mevcut' },
        { status: 409 }
      );
    }

    const option = await db.priceLabelOption.create({
      data: {
        label,
        sortOrder: parsed.data.sortOrder ?? 0,
        isActive: parsed.data.isActive ?? true,
      },
    });
    return NextResponse.json({ option }, { status: 201 });
  } catch (error) {
    console.error('PriceLabel POST error:', error);
    return NextResponse.json(
      { error: 'Fiyat etiketi oluşturulurken hata oluştu' },
      { status: 500 }
    );
  }
}
