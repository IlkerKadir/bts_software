import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import {
  createNotification,
  getNotifications,
  type NotificationType,
} from '@/lib/services/notification-service';

export async function GET(request: NextRequest) {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    const notifications = await getNotifications(user.id, { limit, unreadOnly });

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error('Notifications GET error:', error);
    return NextResponse.json(
      { error: 'Bildirimler alınırken bir hata oluştu' },
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

    // Only admin or system can create notifications for other users
    // For now, users can only create notifications for themselves
    const body = await request.json();

    const { userId, type, title, message, link } = body;

    if (!type || !title || !message) {
      return NextResponse.json(
        { error: 'type, title, and message are required' },
        { status: 400 }
      );
    }

    // Validate notification type
    const validTypes: NotificationType[] = [
      'APPROVAL_NEEDED',
      'QUOTE_APPROVED',
      'QUOTE_REJECTED',
      'QUOTE_EXPIRING',
      'FOLLOW_UP_REMINDER',
      'SYSTEM',
    ];

    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid notification type' },
        { status: 400 }
      );
    }

    // Default to current user if no userId provided
    const targetUserId = userId || user.id;

    const notification = await createNotification({
      userId: targetUserId,
      type,
      title,
      message,
      link,
    });

    return NextResponse.json({ notification }, { status: 201 });
  } catch (error) {
    console.error('Notifications POST error:', error);
    return NextResponse.json(
      { error: 'Bildirim oluşturulurken bir hata oluştu' },
      { status: 500 }
    );
  }
}
