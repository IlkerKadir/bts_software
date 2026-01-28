import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { markAllAsRead } from '@/lib/services/notification-service';

export async function POST() {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await markAllAsRead(user.id);

    return NextResponse.json({
      message: 'Tüm bildirimler okundu olarak işaretlendi',
      count: result.count,
    });
  } catch (error) {
    console.error('Mark all read POST error:', error);
    return NextResponse.json(
      { error: 'Bildirimler güncellenirken bir hata oluştu' },
      { status: 500 }
    );
  }
}
