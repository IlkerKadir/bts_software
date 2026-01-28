import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { z } from 'zod';

const TEMPLATE_SETTINGS_KEY = 'template_settings';

export interface TemplateSettings {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyTaxId: string;
  companyWebsite: string;
  logoPath: string | null;
  footerText: string;
  primaryColor: string;
  secondaryColor: string;
  defaultValidityDays: number;
  defaultCurrency: string;
}

const DEFAULT_SETTINGS: TemplateSettings = {
  companyName: 'BTS Yangın Güvenlik Sistemleri',
  companyAddress: '',
  companyPhone: '',
  companyEmail: '',
  companyTaxId: '',
  companyWebsite: '',
  logoPath: null,
  footerText: '',
  primaryColor: '#1e40af',
  secondaryColor: '#3b82f6',
  defaultValidityDays: 30,
  defaultCurrency: 'EUR',
};

const templateSettingsSchema = z.object({
  companyName: z.string().min(1).max(200),
  companyAddress: z.string().max(500).optional().default(''),
  companyPhone: z.string().max(50).optional().default(''),
  companyEmail: z.string().email().optional().or(z.literal('')).default(''),
  companyTaxId: z.string().max(50).optional().default(''),
  companyWebsite: z.string().max(200).optional().default(''),
  logoPath: z.string().nullable().optional(),
  footerText: z.string().max(1000).optional().default(''),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default('#1e40af'),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default('#3b82f6'),
  defaultValidityDays: z.number().min(1).max(365).optional().default(30),
  defaultCurrency: z.enum(['EUR', 'USD', 'GBP', 'TRY']).optional().default('EUR'),
});

// GET - Get template settings
export async function GET() {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const setting = await db.systemSetting.findUnique({
      where: { key: TEMPLATE_SETTINGS_KEY },
    });

    const settings: TemplateSettings = setting
      ? { ...DEFAULT_SETTINGS, ...(setting.value as object) }
      : DEFAULT_SETTINGS;

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Template settings GET error:', error);
    return NextResponse.json(
      { error: 'Ayarlar yüklenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

// PUT - Update template settings
export async function PUT(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only users with canManageUsers permission can update settings
    if (!user.role.canManageUsers) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz bulunmuyor' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validation = templateSettingsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Geçersiz veri', details: validation.error.issues },
        { status: 400 }
      );
    }

    const settings = await db.systemSetting.upsert({
      where: { key: TEMPLATE_SETTINGS_KEY },
      update: {
        value: validation.data as object,
      },
      create: {
        key: TEMPLATE_SETTINGS_KEY,
        value: validation.data as object,
      },
    });

    return NextResponse.json({
      settings: settings.value as unknown as TemplateSettings,
      message: 'Ayarlar kaydedildi',
    });
  } catch (error) {
    console.error('Template settings PUT error:', error);
    return NextResponse.json(
      { error: 'Ayarlar kaydedilirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
