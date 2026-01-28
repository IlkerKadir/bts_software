import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { markAsRead } from '@/lib/services/notification-service';
import { db } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: notificationId } = await params;

    // Verify the notification belongs to the current user
    const notification = await db.notification.findUnique({
      where: { id: notificationId },
      select: { userId: true },
    });

    if (!notification) {
      return NextResponse.json({ error: 'Bildirim bulunamadı' }, { status: 404 });
    }

    if (notification.userId !== user.id) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 });
    }

    const updatedNotification = await markAsRead(notificationId);

    return NextResponse.json({ notification: updatedNotification });
  } catch (error) {
    console.error('Notification PATCH error:', error);
    return NextResponse.json(
      { error: 'Bildirim güncellenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
