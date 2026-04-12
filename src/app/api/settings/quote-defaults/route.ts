import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { quoteDefaultsSchema, DEFAULT_QUOTE_DEFAULTS } from '@/lib/validations/quote-defaults';

const SETTING_KEY = 'quote_defaults';

/**
 * GET — return the `quote_defaults` SystemSetting row, or the hardcoded
 * fallback if it's missing. Any authenticated user can read so the
 * quote editor can populate its dropdowns.
 */
export async function GET() {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const row = await db.systemSetting.findUnique({ where: { key: SETTING_KEY } });
    if (!row) {
      return NextResponse.json({ defaults: DEFAULT_QUOTE_DEFAULTS });
    }

    // Parse defensively so corrupt rows fall back to sane defaults.
    const parsed = quoteDefaultsSchema.safeParse(row.value);
    if (!parsed.success) {
      return NextResponse.json({ defaults: DEFAULT_QUOTE_DEFAULTS });
    }
    return NextResponse.json({ defaults: parsed.data });
  } catch (error) {
    console.error('QuoteDefaults GET error:', error);
    return NextResponse.json(
      { error: 'Varsayılanlar yüklenirken hata oluştu' },
      { status: 500 }
    );
  }
}

/**
 * PUT — replace the `quote_defaults` row. Gated on canManageSettings
 * (or legacy canManageUsers during the transition).
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.role.canManageSettings && !user.role.canManageUsers) {
      return NextResponse.json({ error: 'Bu işlem için yetkiniz yok' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = quoteDefaultsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Geçersiz veri' },
        { status: 400 }
      );
    }

    const row = await db.systemSetting.upsert({
      where: { key: SETTING_KEY },
      create: { key: SETTING_KEY, value: parsed.data },
      update: { value: parsed.data },
    });
    return NextResponse.json({ defaults: row.value });
  } catch (error) {
    console.error('QuoteDefaults PUT error:', error);
    return NextResponse.json(
      { error: 'Varsayılanlar kaydedilirken hata oluştu' },
      { status: 500 }
    );
  }
}
