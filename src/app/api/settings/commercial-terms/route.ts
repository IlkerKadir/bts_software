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
        highlight: true,
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

    // Accept either canManageSettings (new admin surface) or the legacy
    // canManageUsers flag during the transition window — both allow
    // creating new commercial term templates.
    if (!user.role.canManageSettings && !user.role.canManageUsers) {
      return NextResponse.json(
        { error: 'Bu islem icin yetkiniz yok' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { category, name, value, isDefault, sortOrder, highlight } = body;

    // `uretici_firmalar` is a brand × system matrix where each template
    // row stores only a name (the brand label, or "Sistem: <Adı>" for a
    // column). The matrix UI in the editor never reads `value` for that
    // category, so we don't require it. Other categories still need a
    // non-empty value — that's the actual text that lands on the PDF.
    const valueRequired = category !== 'uretici_firmalar';
    if (!category || !name || (valueRequired && !value)) {
      return NextResponse.json(
        { error: valueRequired ? 'Kategori, ad ve deger zorunludur' : 'Kategori ve ad zorunludur' },
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
        // Defensive: matrix templates legitimately send an empty `value`;
        // protect against future clients omitting the field entirely.
        value: value ?? '',
        isDefault: isDefault || false,
        sortOrder: sortOrder ?? 0,
        highlight: highlight || false,
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    // The (category, name) pair is unique. Surfacing P2002 as a friendly
    // 409 saves admins from a generic "Bir hata oluştu" toast when they
    // try to add a brand or system that already exists.
    if (
      typeof error === 'object' && error !== null && 'code' in error &&
      (error as { code: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'Bu ad zaten kullanılıyor — farklı bir ad seçin' },
        { status: 409 }
      );
    }
    console.error('Commercial terms POST error:', error);
    return NextResponse.json(
      { error: 'Ticari sart olusturulurken hata olustu' },
      { status: 500 }
    );
  }
}
