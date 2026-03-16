import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify the reminder belongs to the current user
    const existing = await db.reminder.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Hatırlatma bulunamadı' }, { status: 404 });
    }

    if (existing.userId !== user.id) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 });
    }

    const body = await request.json();
    const { title, note, dueDate, isCompleted } = body;

    const data: Record<string, unknown> = {};

    if (title !== undefined) {
      if (!title.trim()) {
        return NextResponse.json({ error: 'Başlık zorunludur' }, { status: 400 });
      }
      data.title = title.trim();
    }

    if (note !== undefined) {
      data.note = note?.trim() || null;
    }

    if (dueDate !== undefined) {
      const parsedDate = new Date(dueDate);
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json({ error: 'Geçersiz tarih formatı' }, { status: 400 });
      }
      data.dueDate = parsedDate;
    }

    if (isCompleted !== undefined) {
      data.isCompleted = !!isCompleted;
      data.completedAt = isCompleted ? new Date() : null;
    }

    const reminder = await db.reminder.update({
      where: { id },
      data,
      include: {
        quote: {
          select: { id: true, quoteNumber: true },
        },
        project: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({ reminder });
  } catch (error) {
    console.error('Reminder PUT error:', error);
    return NextResponse.json(
      { error: 'Hatırlatma güncellenirken bir hata oluştu' },
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

    const { id } = await params;

    // Verify the reminder belongs to the current user
    const existing = await db.reminder.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Hatırlatma bulunamadı' }, { status: 404 });
    }

    if (existing.userId !== user.id) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 });
    }

    await db.reminder.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Reminder DELETE error:', error);
    return NextResponse.json(
      { error: 'Hatırlatma silinirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
