import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Management only (client 30.06): the feed spans ALL users' quotes, so it
  // must not leak activity to regular users. UI hides it too; this is the gate.
  if (!user.role.canApprove && !user.role.canManageUsers) {
    return NextResponse.json({ error: 'Bu veriye erişim yetkiniz yok' }, { status: 403 });
  }

  const activities = await db.quoteHistory.findMany({
    take: 20,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { fullName: true } },
      quote: { select: { quoteNumber: true, company: { select: { name: true } } } },
    },
  });

  return NextResponse.json(activities);
}
