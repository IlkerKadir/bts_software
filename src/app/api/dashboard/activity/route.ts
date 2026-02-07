import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
