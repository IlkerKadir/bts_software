import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';

// Lightweight user list (id + fullName only) accessible to any
// authenticated user — used by quote/approval list filters where
// non-admins also need to see "Oluşturan" options. The full
// /api/users endpoint stays canManageUsers-gated.
export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const users = await db.user.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, fullName: true },
    orderBy: { fullName: 'asc' },
  });

  return NextResponse.json({ users });
}
