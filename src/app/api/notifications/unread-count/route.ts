import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getUnreadCount } from '@/lib/services/notification-service';

export async function GET() {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const count = await getUnreadCount(user.id);

    return NextResponse.json({ count });
  } catch (error) {
    console.error('Unread count GET error:', error);
    return NextResponse.json(
      { error: 'Okunmamış bildirim sayısı alınırken bir hata oluştu' },
      { status: 500 }
    );
  }
}
