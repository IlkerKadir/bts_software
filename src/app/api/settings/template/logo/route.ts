import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { uploadFile, deleteFile } from '@/lib/services/document-service';

const TEMPLATE_SETTINGS_KEY = 'template_settings';

// POST - Upload logo
export async function POST(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.role.canManageUsers) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz bulunmuyor' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('logo') as File;

    if (!file) {
      return NextResponse.json({ error: 'Logo dosyası gerekli' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Geçersiz dosya tipi. PNG, JPEG, GIF veya SVG kullanın' },
        { status: 400 }
      );
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Dosya boyutu 2MB\'den küçük olmalı' },
        { status: 400 }
      );
    }

    // Upload file
    const uploadResult = await uploadFile(file);

    if (!uploadResult.success || !uploadResult.filePath) {
      return NextResponse.json(
        { error: uploadResult.error || 'Logo yüklenemedi' },
        { status: 500 }
      );
    }

    // Update settings with logo path
    const currentSettings = await db.systemSetting.findUnique({
      where: { key: TEMPLATE_SETTINGS_KEY },
    });

    const currentValue = (currentSettings?.value as Record<string, unknown>) || {};

    // Delete old logo if exists
    if (currentValue.logoPath && typeof currentValue.logoPath === 'string') {
      try {
        await deleteFile(currentValue.logoPath);
      } catch {
        // Ignore delete errors
      }
    }

    const newValue = { ...currentValue, logoPath: uploadResult.filePath };

    await db.systemSetting.upsert({
      where: { key: TEMPLATE_SETTINGS_KEY },
      update: {
        value: newValue,
      },
      create: {
        key: TEMPLATE_SETTINGS_KEY,
        value: newValue,
      },
    });

    return NextResponse.json({
      logoPath: uploadResult.filePath,
      message: 'Logo yüklendi',
    });
  } catch (error) {
    console.error('Logo upload error:', error);
    return NextResponse.json(
      { error: 'Logo yüklenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}

// DELETE - Remove logo
export async function DELETE() {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.role.canManageUsers) {
      return NextResponse.json(
        { error: 'Bu işlem için yetkiniz bulunmuyor' },
        { status: 403 }
      );
    }

    const currentSettings = await db.systemSetting.findUnique({
      where: { key: TEMPLATE_SETTINGS_KEY },
    });

    if (currentSettings) {
      const currentValue = (currentSettings.value as Record<string, unknown>) || {};

      // Delete logo file if exists
      if (currentValue.logoPath && typeof currentValue.logoPath === 'string') {
        try {
          await deleteFile(currentValue.logoPath);
        } catch {
          // Ignore delete errors
        }
      }

      // Remove logo path from settings
      const newValue = { ...currentValue, logoPath: null };
      await db.systemSetting.update({
        where: { key: TEMPLATE_SETTINGS_KEY },
        data: {
          value: newValue,
        },
      });
    }

    return NextResponse.json({ message: 'Logo silindi' });
  } catch (error) {
    console.error('Logo delete error:', error);
    return NextResponse.json(
      { error: 'Logo silinirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
