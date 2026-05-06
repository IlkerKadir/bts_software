import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { validateRefNoOptions, SETTING_KEY } from '@/lib/refno-options';
import { loadRefNoOptions } from '@/lib/refno-options-server';
import type { Prisma } from '@prisma/client';

/** GET — anyone authenticated can read; the modal needs them. */
export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const options = await loadRefNoOptions();
  return NextResponse.json({ options });
}

/** PUT — admin only (canManageSettings). Replaces the whole group. */
export async function PUT(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!user.role.canManageSettings) {
    return NextResponse.json(
      { error: 'Bu ayarı değiştirme yetkiniz yok' },
      { status: 403 },
    );
  }
  const body = await request.json();
  if (!validateRefNoOptions(body)) {
    return NextResponse.json(
      { error: 'Geçersiz ayar yapısı (her kategori en az 1 seçenek içermeli, value ve label dolu olmalı)' },
      { status: 400 },
    );
  }
  await db.systemSetting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value: body as unknown as Prisma.InputJsonValue },
    update: { value: body as unknown as Prisma.InputJsonValue },
  });
  return NextResponse.json({ options: body });
}
